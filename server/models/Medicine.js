const mongoose = require('mongoose');

const MedicineSchema = new mongoose.Schema({
  productName: { type: String, required: true },
  mrp: { type: Number, required: true },
  sellingPrice: { type: Number, required: true },
  costPrice: { type: Number, required: true },
  
  // --- ENSURE THESE ARE PRESENT ---
  maxDiscount: { type: Number, default: 0 },
  billImage: { type: String },
  hsnCode: { type: String }, // <--- THIS MUST BE HERE
  // --------------------------------
  
  batchNumber: { type: String, required: true },
  expiryDate: { type: Date, required: true },
  gst: { type: Number, default: 0 },
  quantity: { type: Number, required: true },
  supplier: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Medicine', MedicineSchema);