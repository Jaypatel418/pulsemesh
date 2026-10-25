const mongoose = require('mongoose');

const incidentSchema = new mongoose.Schema({
  endpoint: { type: mongoose.Schema.Types.ObjectId, ref: 'Endpoint', required: true },
  reason: { type: String, required: true },
  startedAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date, default: null }
});

module.exports = mongoose.model('Incident', incidentSchema);