const mongoose = require('mongoose');

const MedicineSchema = new mongoose.Schema({
  productName: { type: String, required: true },
  batchNumber: { type: String, required: true },
  hsnCode: { type: String },
  
  mrp: { type: Number, required: true },
  sellingPrice: { type: Number, required: true }, // Price PER STRIP
  doctorPrice: { type: Number, default: 0 },
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
  purchaseInvoiceNo: { type: String },
  billImage: { type: String },
  isKachiEntry: { type: Boolean, default: false },
  canShowInAdminInventory: { type: Boolean, default: true },

  // Drug schedule (India, Drugs & Cosmetics Rules / NDPS Act — full A-Z set).
  // 'None' = not a scheduled/regulated item (or not yet tagged).
  scheduleCategory: {
    type: String,
    enum: ['None', 'A', 'B', 'C', 'C1', 'D', 'E1', 'F', 'F1', 'G', 'H', 'H1', 'J', 'N', 'O', 'P', 'P1', 'R', 'R1', 'S', 'T', 'U', 'X', 'Z'],
    default: 'None'
  },
  // true once scheduleCategory has been set by the AI classifier or confirmed
  // manually by an admin — prevents re-running AI classification every sale.
  scheduleAiChecked: { type: Boolean, default: false }
}, { timestamps: true });

// Helpful indexes for search & alerts
MedicineSchema.index({ productName: 1 });
MedicineSchema.index({ batchNumber: 1 });
MedicineSchema.index({ expiryDate: 1 });
MedicineSchema.index({ scheduleCategory: 1 });

module.exports = mongoose.model('Medicine', MedicineSchema);
