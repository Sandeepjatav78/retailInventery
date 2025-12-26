const mongoose = require('mongoose');

const MedicineSchema = new mongoose.Schema({
  productName: { type: String, required: true },
  batchNumber: { type: String, required: true },
  hsnCode: { type: String },
  
  mrp: { type: Number, required: true },
  sellingPrice: { type: Number, required: true }, // Price PER STRIP
  costPrice: { type: Number, required: true },
  
  gst: { type: Number, default: 0 },
  maxDiscount: { type: Number, default: 0 },
  
  quantity: { type: Number, required: true }, // SEALED STRIPS (पत्ते)
  packSize: { type: Number, default: 10 },    // 1 पत्ते में कितनी गोली
  
  // --- NEW FIELD: LOOSE TABLETS ---
  looseQty: { type: Number, default: 0 }, // खुल्ली गोलियां (जैसे 2, 4)
  // --------------------------------
  
  expiryDate: { type: Date, required: true },
  partyName: { type: String },
  purchaseDate: { type: Date },
  billImage: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Medicine', MedicineSchema);