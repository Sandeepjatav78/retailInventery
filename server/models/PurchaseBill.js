const mongoose = require('mongoose');

const PurchaseBillItemSchema = new mongoose.Schema({
  productName: { type: String, required: true },
  packing: { type: String },
  batchNumber: { type: String, required: true },
  manufacturer: { type: String },
  hsnCode: { type: String },
  expiryDate: { type: Date, required: true },
  quantity: { type: Number, required: true },
  freeQuantity: { type: Number, default: 0 },
  mrp: { type: Number, required: true },
  rate: { type: Number, required: true },
  sellingPrice: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  gst: { type: Number, default: 0 },
  amount: { type: Number, required: true }
}, { _id: false });

const PurchaseBillSchema = new mongoose.Schema({
  supplierName: { type: String, required: true },
  supplierGstin: { type: String },
  invoiceNumber: { type: String, required: true },
  invoiceDate: { type: Date, required: true },
  billType: { type: String, default: 'Credit' },
  paymentMode: { type: String, default: 'Credit' },
  notes: { type: String },
  billImage: { type: String },
  items: { type: [PurchaseBillItemSchema], required: true },
  subtotal: { type: Number, required: true },
  discountTotal: { type: Number, default: 0 },
  gstTotal: { type: Number, default: 0 },
  roundOff: { type: Number, default: 0 },
  grandTotal: { type: Number, required: true },
  amountPaid: { type: Number, default: 0 },
  balanceDue: { type: Number, default: 0 },
  paymentStatus: { type: String, enum: ['Paid', 'Credit', 'Partial'], default: 'Credit' },
  paymentRemarks: { type: String, default: '' },
  paymentHistory: [{
    date: { type: Date, default: Date.now },
    amount: { type: Number, required: true },
    paymentMode: { type: String, default: 'Cash' },
    remark: { type: String, default: '' }
  }],
  createdBy: { type: String }
}, { timestamps: true });

PurchaseBillSchema.index({ invoiceNumber: 1, supplierName: 1 });

module.exports = mongoose.model('PurchaseBill', PurchaseBillSchema);
