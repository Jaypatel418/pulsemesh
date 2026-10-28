const axios = require('axios');
const Endpoint = require('../models/Endpoint');
const PingResult = require('../models/PingResult');
const Incident = require('../models/Incident');
const User = require('../models/user');
const { sendAlert } = require('./mailer');

let io = null;
const setIO = (i) => { io = i; };
const emitTo = (owner, event, payload) => { if (io) io.to('user:' + owner).emit(event, payload); };

async function pingEndpoint(ep) {
  const start = Date.now();
  let status = 'up';
  try { await axios.get(ep.url, { timeout: 5000 }); } catch { status = 'down'; }
  const latencyMs = Date.now() - start;

  const ping = await PingResult.create({ endpoint: ep._id, status, latencyMs });
  const isProblem = status === 'down' || latencyMs > ep.latencyThresholdMs;
  const open = await Incident.findOne({ endpoint: ep._id, resolvedAt: null });
  const user = await User.findById(ep.owner);
  console.log(`[PING] ${ep.name} | ${status} | ${latencyMs}ms | problem=${isProblem} | openIncident=${!!open} | email=${user?.email}`);

  if (isProblem && !open) {
    const reason = status === 'down' ? 'Endpoint is down' : `High latency: ${latencyMs}ms (limit ${ep.latencyThresholdMs}ms)`;
    const inc = await Incident.create({ endpoint: ep._id, reason, startedAt: new Date() });
    emitTo(ep.owner, 'incident-opened', { _id: inc._id, endpointId: String(ep._id), endpointName: ep.name, reason, startedAt: inc.startedAt, resolvedAt: null });
    sendAlert(`🚨 PulseMesh Alert: ${ep.name}`, `${ep.name} (${ep.url})\n${reason}\nTime: ${new Date().toISOString()}`, user?.email);
  } else if (!isProblem && open) {
    open.resolvedAt = new Date();
    await open.save();
    emitTo(ep.owner, 'incident-resolved', { _id: open._id, endpointId: String(ep._id), endpointName: ep.name, reason: open.reason, startedAt: open.startedAt, resolvedAt: open.resolvedAt });
    sendAlert(`✅ PulseMesh Recovered: ${ep.name}`, `${ep.name} (${ep.url}) is back to normal (${latencyMs}ms).`, user?.email);
  }

  emitTo(ep.owner, 'ping-result', { _id: ping._id, endpointId: String(ep._id), endpointName: ep.name, status, latencyMs, timestamp: ping.timestamp });
}

let running = false;
async function pingAllEndpoints() {
  if (running) return;
  running = true;
  try {
    const eps = await Endpoint.find({ owner: { $ne: null } });
    for (let i = 0; i < eps.length; i += 5) {
      await Promise.all(eps.slice(i, i + 5).map((e) =>
        pingEndpoint(e).catch((err) => console.error('[PING ERROR]', e.name, err.message))));
    }
  } finally { running = false; }
}
module.exports = { pingAllEndpoints, setIO };