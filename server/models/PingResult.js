const mongoose = require('mongoose');

const pingResultSchema = new mongoose.Schema({
  endpoint: { type: mongoose.Schema.Types.ObjectId, ref: 'Endpoint', required: true },
  status: { type: String, enum: ['up', 'down'], required: true },
  latencyMs: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PingResult', pingResultSchema);