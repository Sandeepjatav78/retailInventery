const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  id: { type: String, required: true }, // e.g., "invoice_seq"
  seq: { type: Number, default: 100 }   // गिनती 100 से शुरू होगी (RP-100)
});

module.exports = mongoose.model('Counter', counterSchema);