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
      
      // 🔥 ADDED THESE FIELDS FOR GST REPORT
      hsn: { type: String },
      gst: { type: Number },
      batch: { type: String },
      expiry: { type: Date },
      unit: { type: String }, 
      packSize: { type: Number },
      mrp: { type: Number },
      discount: { type: Number },

      quantity: { type: Number },
      price: { type: Number },   // Selling Price
      customerLastPrice: { type: Number },
      customerLastPriceDate: { type: Date },
      purchasePrice: { type: Number },
      // Supplier/purchase invoice this stock came from — snapshotted so the bill
      // can show it (helps when an item is sold before its purchase was entered).
      purchaseInvoiceNo: { type: String },
      total: { type: Number },

      // Snapshot of the medicine's drug schedule at sale time (India — full A-Z schedule set)
      scheduleCategory: {
        type: String,
        enum: ['None', 'A', 'B', 'C', 'C1', 'D', 'E1', 'F', 'F1', 'G', 'H', 'H1', 'J', 'N', 'O', 'P', 'P1', 'R', 'R1', 'S', 'T', 'U', 'X', 'Z'],
        default: 'None'
      }
    }
  ],

  totalAmount: { type: Number, required: true },
  paymentMode: { type: String, enum: ['Cash', 'Online', 'Credit'], required: true },

  // true when any item in this sale is a Schedule H/H1 drug — powers the H1/H ledger
  hasScheduleDrug: { type: Boolean, default: false },
  
  // 🔥 ADDED CREDIT FIELDS
  isCredit: { type: Boolean, default: false },
  creditId: { type: mongoose.Schema.Types.ObjectId, ref: 'Credit' },
  creditNotes: { type: String },
  
  isBillRequired: { type: Boolean, default: true }, 
  createdBy: { type: String, default: 'admin' }, 

  date: { type: Date, default: Date.now }
});

// Helpful indexes for fast search & reports
SaleSchema.index({ invoiceNo: 1 });
SaleSchema.index({ date: -1 });
SaleSchema.index({ 'customerDetails.name': 1 });
SaleSchema.index({ 'customerDetails.phone': 1 });
SaleSchema.index({ 'items.name': 1 });
SaleSchema.index({ hasScheduleDrug: 1, date: -1 });

module.exports = mongoose.model('Sale', SaleSchema);
