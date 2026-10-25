require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cron = require('node-cron');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

const Endpoint = require('./models/Endpoint');
const { pingAllEndpoints, setIO } = require('./services/pingService');

const app = express();

const clientOrigin = process.env.CLIENT_URL
  ? (process.env.CLIENT_URL.includes(',')
      ? process.env.CLIENT_URL.split(',').map(s => s.trim())
      : process.env.CLIENT_URL.trim())
  : '*';

app.use(cors({ origin: clientOrigin }));
app.use(express.json());

let syntheticMode = 'normal';

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/endpoints', async (req, res) => {
  try {
    const endpoints = await Endpoint.find();
    res.json(endpoints);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/endpoints', async (req, res) => {
  try {
    const { name, url, intervalSeconds, latencyThresholdMs } = req.body;
    const endpoint = await Endpoint.create({ name, url, intervalSeconds, latencyThresholdMs });
    res.json(endpoint);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/endpoints/:id', async (req, res) => {
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

app.post('/api/synthetic-test/mode', (req, res) => {
  const { mode } = req.body;
  if (!['normal', 'slow', 'down'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid mode' });
  }
  syntheticMode = mode;
  res.json({ message: `Mode set to ${mode}` });
});

// Serve static client build in production if client/dist exists
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