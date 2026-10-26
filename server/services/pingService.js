const axios = require('axios');
const Endpoint = require('../models/Endpoint');
const PingResult = require('../models/PingResult');
const Incident = require('../models/Incident');
const { sendAlert } = require('./mailer');

let io = null;
function setIO(ioInstance) {
  io = ioInstance;
}

async function pingEndpoint(endpoint) {
  const start = Date.now();
  let status = 'down';
  let latencyMs = 0;

  try {
    await axios.get(endpoint.url, { timeout: 5000 });
    latencyMs = Date.now() - start;
    status = 'up';
  } catch (err) {
    latencyMs = Date.now() - start;
    status = 'down';
  }

  await PingResult.create({
    endpoint: endpoint._id,
    status,
    latencyMs
  });

  console.log(`[PING] ${endpoint.name} → ${status} (${latencyMs}ms)`);

  const isProblem = status === 'down' || latencyMs > endpoint.latencyThresholdMs;

  const openIncident = await Incident.findOne({
    endpoint: endpoint._id,
    resolvedAt: null
  });

  if (isProblem && !openIncident) {
    const reason = status === 'down'
      ? 'Endpoint is down'
      : `Latency ${latencyMs}ms exceeded threshold ${endpoint.latencyThresholdMs}ms`;

    const incident = await Incident.create({
      endpoint: endpoint._id,
      reason
    });

    console.log(`[INCIDENT] Opened for ${endpoint.name}: ${reason}`);

    sendAlert(
      `🚨 PulseMesh Alert: ${endpoint.name} has a problem`,
      `Endpoint: ${endpoint.name}\nURL: ${endpoint.url}\nIssue: ${reason}\nStarted at: ${incident.startedAt.toISOString()}`
    );

    if (io) {
      io.emit('incident-opened', {
        endpointId: endpoint._id,
        endpointName: endpoint.name,
        reason,
        startedAt: incident.startedAt
      });
    }
  }

  if (!isProblem && openIncident) {
    openIncident.resolvedAt = new Date();
    await openIncident.save();

    console.log(`[INCIDENT] Resolved for ${endpoint.name}`);

    sendAlert(
      `✅ PulseMesh Recovered: ${endpoint.name} is back to normal`,
      `Endpoint: ${endpoint.name}\nURL: ${endpoint.url}\nResolved at: ${openIncident.resolvedAt.toISOString()}`
    );

    if (io) {
      io.emit('incident-resolved', {
        endpointId: endpoint._id,
        endpointName: endpoint.name,
        resolvedAt: openIncident.resolvedAt
      });
    }
  }

  if (io) {
    io.emit('ping-result', {
      endpointId: endpoint._id,
      endpointName: endpoint.name,
      status,
      latencyMs,
      timestamp: new Date()
    });
  }
}

async function pingAllEndpoints() {
  const endpoints = await Endpoint.find();
  for (const endpoint of endpoints) {
    await pingEndpoint(endpoint);
  }
}

module.exports = { pingAllEndpoints, setIO };