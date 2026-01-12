const mongoose = require('mongoose');

const CounterSchema = new mongoose.Schema({
  id: { type: String, required: true }, // e.g., "invoice_seq"
  seq: { type: Number, default: 100 }   // Starts from 100
});

module.exports = mongoose.model('Counter', CounterSchema);