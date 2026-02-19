const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  action: { type: String, required: true }, // e.g. CREATE_SALE, UPDATE_MEDICINE
  entityType: { type: String, required: true }, // e.g. Sale, Medicine, PendingDose
  entityId: { type: String },
  message: { type: String },
  details: { type: Object },
  userRole: { type: String, default: 'admin' },
  createdAt: { type: Date, default: Date.now }
});

AuditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
