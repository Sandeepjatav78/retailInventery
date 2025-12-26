const mongoose = require('mongoose');

const PendingDoseSchema = new mongoose.Schema({
  amountCollected: { type: Number, required: true },
  reason: { type: String, required: true }, // e.g., "Fever"
  isResolved: { type: Boolean, default: false }, // False = Stock minus nahi hua
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PendingDose', PendingDoseSchema);