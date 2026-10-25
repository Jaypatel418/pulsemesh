const axios = require('axios');
const Endpoint = require('../models/Endpoint');
const PingResult = require('../models/PingResult');
const Incident = require('../models/Incident');

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

  // Check for problems: down, or latency over threshold
  const isProblem = status === 'down' || latencyMs > endpoint.latencyThresholdMs;

  // Is there already an unresolved incident for this endpoint?
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