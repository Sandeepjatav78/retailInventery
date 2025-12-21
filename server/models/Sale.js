const mongoose = require('mongoose');

const SaleSchema = new mongoose.Schema({
  invoiceNo: { type: String, required: true }, // <--- NEW FIELD
  customerDetails: {
    name: String,
    phone: String,
    doctor: String
  },
  items: [
    {
      medicineId: { type: String },
      name: { type: String },
      batch: { type: String },   // <--- Added for Bill
      expiry: { type: Date },    // <--- Added for Bill
      hsn: { type: String },     // <--- Added for Bill
      gst: { type: Number },     // <--- Added for Bill
      quantity: { type: Number },
      price: { type: Number },   // Selling Price
      mrp: { type: Number },     // MRP
      total: { type: Number }
    }
  ],
  totalAmount: { type: Number, required: true },
  paymentMode: { type: String, enum: ['Cash', 'Online'], required: true },
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Sale', SaleSchema);