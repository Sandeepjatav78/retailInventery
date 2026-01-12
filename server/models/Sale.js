const mongoose = require('mongoose');

const SaleSchema = new mongoose.Schema({
  invoiceNo: { type: String, required: true },
  
  customerDetails: {
    name: String,
    phone: String,
    doctor: String
  },
  
  items: [
    {
      medicineId: { type: String },
      name: { type: String },
      batch: { type: String },
      expiry: { type: Date },
      hsn: { type: String },
      gst: { type: Number },
      quantity: { type: Number },
      price: { type: Number },   // Selling Price
      mrp: { type: Number },     // MRP
      purchasePrice: { type: Number }, 
      total: { type: Number }
    }
  ],
  
  totalAmount: { type: Number, required: true },
  paymentMode: { type: String, enum: ['Cash', 'Online'], required: true },
  
  isBillRequired: { type: Boolean, default: true }, 
  
  // --- 🔥 NEW FIELD ADDED ---
  createdBy: { type: String, default: 'admin' }, // Stores 'admin' or 'staff'

  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Sale', SaleSchema);