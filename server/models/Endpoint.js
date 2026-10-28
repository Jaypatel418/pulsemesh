const mongoose = require('mongoose');


const endpointSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  name: { type: String, required: true },
  url: { type: String, required: true },
  intervalSeconds: { type: Number, default: 30 },
  latencyThresholdMs: { type: Number, default: 1000 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Endpoint', endpointSchema);
