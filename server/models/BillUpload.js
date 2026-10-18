const mongoose = require('mongoose');

// A bill photographed on the mobile app and waiting to be entered on the web.
// The phone only uploads the pages; an admin opens it on the web, the AI fills
// the Purchase Bill form from these pages, and saving that bill marks it Done.
const BillUploadSchema = new mongoose.Schema({
  pages: [{
    url: { type: String, required: true },
    publicId: { type: String },
    mimeType: { type: String }
  }],
  note: { type: String, default: '' },
  status: { type: String, enum: ['Pending', 'Done', 'Rejected'], default: 'Pending' },
  uploadedBy: { type: String, default: 'staff' },
  // Cached AI scan result, so reopening the upload doesn't re-run the scan.
  scanData: { type: mongoose.Schema.Types.Mixed, default: null },
  purchaseBillId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseBill' },
  remark: { type: String, default: '' },
  completedAt: { type: Date }
}, { timestamps: true });

BillUploadSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('BillUpload', BillUploadSchema);
