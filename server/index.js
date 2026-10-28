require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cron = require('node-cron');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const helmet = require('helmet');
const Joi = require('joi');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const Endpoint = require('./models/Endpoint');
const User = require('./models/user');
const PingResult = require('./models/PingResult');
const Incident = require('./models/Incident');
const { pingAllEndpoints, setIO } = require('./services/pingService');

const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) { console.error('JWT_SECRET missing'); process.exit(1); }
const clientOrigin = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(',').map((s) => s.trim()) : '*';

const app = express();
app.use(cors({ origin: clientOrigin }));
app.use(helmet());
app.use(express.json());

const authSchema = Joi.object({
  email: Joi.string().email().max(120).required(),
  password: Joi.string().min(8).max(72).required(),
});
const endpointSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  url: Joi.string().uri({ scheme: ['http', 'https'] }).required(),
  intervalSeconds: Joi.number().min(5).max(3600).default(30),
  latencyThresholdMs: Joi.number().min(100).max(60000).default(1000),
});

const sign = (u) => jwt.sign({ id: String(u._id), email: u.email }, JWT_SECRET, { expiresIn: '2h' });

function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  try {
    req.user = jwt.verify(h.replace('Bearer ', ''), JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Unauthorized' }); }
}

app.get('/', (req, res) => res.send('<h2>PulseMesh API is running</h2>'));
app.get('/api/health', (req, res) =>
  res.json({ status: 'ok', db: mongoose.connection.readyState === 1 }));

// ---------- Auth ----------
app.post('/api/register', async (req, res) => {
  const { error, value } = authSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  if (await User.findOne({ email: value.email.toLowerCase() }))
    return res.status(409).json({ error: 'Email already registered' });
  const user = await User.create({
    email: value.email, passwordHash: await bcrypt.hash(value.password, 10),
  });
  res.status(201).json({ token: sign(user), email: user.email });
});

app.post('/api/login', async (req, res) => {
  const { error, value } = authSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  const user = await User.findOne({ email: value.email.toLowerCase() });
  if (!user || !(await bcrypt.compare(value.password, user.passwordHash)))
    return res.status(401).json({ error: 'Invalid email or password' });
  res.json({ token: sign(user), email: user.email });
});

// ---------- Endpoints (per user) ----------
app.get('/api/endpoints', requireAuth, async (req, res) => {
  res.json(await Endpoint.find({ owner: req.user.id }).sort({ createdAt: -1 }));
});

app.post('/api/endpoints', requireAuth, async (req, res) => {
  const { error, value } = endpointSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  if (await Endpoint.countDocuments({ owner: req.user.id }) >= 10)
    return res.status(400).json({ error: 'Limit of 10 websites per user' });
  res.status(201).json(await Endpoint.create({ ...value, owner: req.user.id }));
});

app.delete('/api/endpoints/:id', requireAuth, async (req, res) => {
  try {
    const ep = await Endpoint.findOneAndDelete({ _id: req.params.id, owner: req.user.id });
    if (!ep) return res.status(404).json({ error: 'Not found' });
    await PingResult.deleteMany({ endpoint: ep._id });
    await Incident.deleteMany({ endpoint: ep._id });
    res.json({ ok: true });
  } catch { res.status(400).json({ error: 'Bad id' }); }
});

// ---------- History ----------
async function nameMap(userId) {
  const eps = await Endpoint.find({ owner: userId }).select('name');
  return { ids: eps.map((e) => e._id), names: Object.fromEntries(eps.map((e) => [String(e._id), e.name])) };
}
app.get('/api/pings', requireAuth, async (req, res) => {
  const { ids, names } = await nameMap(req.user.id);
  const rows = await PingResult.find({ endpoint: { $in: ids } }).sort({ timestamp: -1 }).limit(100).lean();
  res.json(rows.map((r) => ({
    _id: r._id, endpointId: String(r.endpoint), endpointName: names[String(r.endpoint)] || 'Unknown',
    status: r.status, latencyMs: r.latencyMs, timestamp: r.timestamp,
  })));
});
app.get('/api/incidents', requireAuth, async (req, res) => {
  const { ids, names } = await nameMap(req.user.id);
  const rows = await Incident.find({ endpoint: { $in: ids } }).sort({ startedAt: -1 }).limit(50).lean();
  res.json(rows.map((r) => ({
    _id: r._id, endpointId: String(r.endpoint), endpointName: names[String(r.endpoint)] || 'Unknown',
    reason: r.reason, startedAt: r.startedAt, resolvedAt: r.resolvedAt,
  })));
});

// ---------- Synthetic test target (for live demo) ----------
let syntheticMode = 'normal';
app.get('/api/synthetic-test', async (req, res) => {
  if (syntheticMode === 'down') return res.status(503).json({ mode: 'down' });
  if (syntheticMode === 'slow') await new Promise((r) => setTimeout(r, 3000));
  res.json({ ok: true, mode: syntheticMode });
});
app.post('/api/synthetic-test/mode', requireAuth, (req, res) => {
  const { mode } = req.body;
  if (!['normal', 'slow', 'down'].includes(mode)) return res.status(400).json({ error: 'Invalid mode' });
  syntheticMode = mode;
  res.json({ mode });
});

const dist = path.join(__dirname, '../client/dist');
if (fs.existsSync(dist)) app.use(express.static(dist));

// ---------- Server + Socket.IO ----------
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: clientOrigin } });
io.use((socket, next) => {
  try {
    const p = jwt.verify(socket.handshake.auth.token, JWT_SECRET);
    socket.join('user:' + p.id);
    next();
  } catch { next(new Error('unauthorized')); }
});
setIO(io);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((e) => console.error('Mongo error', e.message));

cron.schedule('*/30 * * * * *', () => pingAllEndpoints());
server.listen(PORT, () => console.log(`Server on ${PORT}`));