const mongoose = require('mongoose');

const PurchaseReturnSchema = new mongoose.Schema({
  returnNumber: { type: String, required: true, unique: true, index: true },
  wholesalerName: { type: String, required: true, trim: true },
  supplierBillNumber: { type: String, trim: true, default: '' },
  returnDate: { type: Date, required: true, default: Date.now },
  notes: { type: String, trim: true, default: '' },
  items: [{
    medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true }, productName: { type: String, required: true }, batchNumber: { type: String, required: true }, expiryDate: Date,
    packSize: { type: Number, required: true }, returnedStrips: { type: Number, required: true, min: 0 }, returnedLoose: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, required: true, min: 0 }, lineTotal: { type: Number, required: true, min: 0 },
    stockBefore: { strips: Number, loose: Number }, stockAfter: { strips: Number, loose: Number }
  }],
  totalAmount: { type: Number, required: true, min: 0 }, createdByRole: { type: String, default: 'admin' }
}, { timestamps: true });

module.exports = mongoose.model('PurchaseReturn', PurchaseReturnSchema);
