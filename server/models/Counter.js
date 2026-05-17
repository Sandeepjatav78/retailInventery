const mongoose = require('mongoose');

const CounterSchema = new mongoose.Schema({
  id: { type: String, required: true }, // e.g., "invoice_seq"
  seq: { type: Number, default: 0 }   // Starts from 0; first increment -> 1
});

module.exports = mongoose.model('Counter', CounterSchema);