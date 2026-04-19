const mongoose = require('mongoose');

const CreditSchema = new mongoose.Schema({
  // Customer identification
  customerName: { type: String, required: true },
  customerPhone: { type: String },
  customerDoctor: { type: String },

  // Total credit amount
  totalAmount: { type: Number, required: true },
  paidAmount: { type: Number, default: 0 },
  remainingAmount: { type: Number, required: true },

  // Bills related to this credit
  bills: [
    {
      billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
      invoiceNo: { type: String },
      billAmount: { type: Number },
      billDate: { type: Date },
      billStatus: { type: String, enum: ['Pending', 'Partial', 'Paid'], default: 'Pending' }
    }
  ],

  // Payment records
  payments: [
    {
      paymentAmount: { type: Number },
      paymentDate: { type: Date, default: Date.now },
      paymentMode: { type: String, enum: ['Cash', 'Online', 'Check'], default: 'Cash' },
      paymentNote: { type: String },
      recordedBy: { type: String }
    }
  ],

  // Status
  status: { type: String, enum: ['Active', 'Closed'], default: 'Active' },
  createdDate: { type: Date, default: Date.now },
  lastUpdated: { type: Date, default: Date.now }
});

// Indexes for faster queries
CreditSchema.index({ customerName: 1 });
CreditSchema.index({ customerPhone: 1 });
CreditSchema.index({ status: 1 });
CreditSchema.index({ createdDate: -1 });
CreditSchema.index({ lastUpdated: -1 });
CreditSchema.index({ status: 1, lastUpdated: -1 });

module.exports = mongoose.model('Credit', CreditSchema);
