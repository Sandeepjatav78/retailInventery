const mongoose = require('mongoose');

const MedicineSchema = new mongoose.Schema({
  // Basic Details
  productName: { type: String, required: true },
  batchNumber: { type: String, required: true },
  hsnCode: { type: String }, // Used for GST Billing
  
  // Pricing & Tax
  mrp: { type: Number, required: true },
  sellingPrice: { type: Number, required: true },
  costPrice: { type: Number, required: true },
  gst: { type: Number, default: 0 }, // <--- V.IMP: Tax Percentage
  maxDiscount: { type: Number, default: 0 },
  
  // Inventory Details
  quantity: { type: Number, required: true },
  expiryDate: { type: Date, required: true },
  
  // Supplier Info (New Fields)
  partyName: { type: String },       // <--- NEW: Supplier Name
  purchaseDate: { type: Date },      // <--- NEW: When you bought it
  supplier: { type: String },        // (Optional: Old field, can keep for backup)

  // Evidence
  billImage: { type: String }        // Cloudinary URL
}, { timestamps: true });

module.exports = mongoose.model('Medicine', MedicineSchema);