const mongoose = require('mongoose');

// Full profile for a wholesaler / supplier party. Purchase bills only carry a
// name + GSTIN per bill, so this holds the extra "full details" (address,
// contact, bank, notes) keyed by the normalized supplier name.
const SupplierSchema = new mongoose.Schema({
  name: { type: String, required: true },
  // lower-cased / trimmed name used to match a party across bills & typo variants
  normalizedName: { type: String, required: true, index: true },
  gstin: { type: String, default: '' },
  phone: { type: String, default: '' },
  altPhone: { type: String, default: '' },
  email: { type: String, default: '' },
  contactPerson: { type: String, default: '' },
  address: { type: String, default: '' },
  city: { type: String, default: '' },
  state: { type: String, default: '' },
  pincode: { type: String, default: '' },
  bankName: { type: String, default: '' },
  accountNumber: { type: String, default: '' },
  ifsc: { type: String, default: '' },
  upiId: { type: String, default: '' },
  drugLicenseNo: { type: String, default: '' },
  notes: { type: String, default: '' }
}, { timestamps: true });

SupplierSchema.index({ normalizedName: 1 }, { unique: true });

module.exports = mongoose.model('Supplier', SupplierSchema);
