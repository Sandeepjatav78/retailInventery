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
      purchasePrice: { type: Number }, 
      total: { type: Number }
    }
  ],
  
  totalAmount: { type: Number, required: true },
  paymentMode: { type: String, enum: ['Cash', 'Online'], required: true },
  
  isBillRequired: { type: Boolean, default: true }, 
  createdBy: { type: String, default: 'admin' }, 

  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Sale', SaleSchema);