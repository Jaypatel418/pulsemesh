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
const admin = require('./models/admin');
const { pingAllEndpoints, setIO } = require('./services/pingService');

const app = express();

const clientOrigin = process.env.CLIENT_URL
  ? (process.env.CLIENT_URL.includes(',')
      ? process.env.CLIENT_URL.split(',').map(s => s.trim())
      : process.env.CLIENT_URL.trim())
  : '*';

app.use(cors({ origin: clientOrigin }));
app.use(helmet());
app.use(express.json());

let syntheticMode = 'normal';

const endpointSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  url: Joi.string().uri().required(),
  intervalSeconds: Joi.number().integer().min(5).max(3600).default(30),
  latencyThresholdMs: Joi.number().integer().min(100).max(60000).default(1000)
});

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  const admin = await Admin.findOne({ username });
  if (!admin) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const match = await bcrypt.compare(password, admin.passwordHash);
  if (!match) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '2h' });
  res.json({ token });
});

app.get('/api/endpoints', async (req, res) => {
  try {
    const endpoints = await Endpoint.find();
    res.json(endpoints);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/endpoints', requireAuth, async (req, res) => {
  const { error, value } = endpointSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  try {
    const endpoint = await Endpoint.create(value);
    res.json(endpoint);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/endpoints/:id', requireAuth, async (req, res) => {
  try {
    await Endpoint.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/synthetic-test', async (req, res) => {
  if (syntheticMode === 'down') {
    return res.status(500).json({ error: 'Simulated failure' });
  }
  if (syntheticMode === 'slow') {
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  res.json({ status: 'ok', mode: syntheticMode });
});

app.post('/api/synthetic-test/mode', requireAuth, (req, res) => {
  const { mode } = req.body;
  if (!['normal', 'slow', 'down'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid mode' });
  }
  syntheticMode = mode;
  res.json({ message: `Mode set to ${mode}` });
});

const clientDistPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
      return res.sendFile(path.join(clientDistPath, 'index.html'));
    }
    next();
  });
}

if (!process.env.MONGO_URI) {
  console.warn('⚠️ WARNING: MONGO_URI is not set in environment variables.');
}

mongoose.connect(process.env.MONGO_URI || '')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: clientOrigin,
    methods: ['GET', 'POST']
  }
});

setIO(io);

io.on('connection', (socket) => {
  console.log('Dashboard connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('Dashboard disconnected:', socket.id);
  });
});

cron.schedule('*/30 * * * * *', () => {
  console.log('Running scheduled pings...');
  pingAllEndpoints();
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));