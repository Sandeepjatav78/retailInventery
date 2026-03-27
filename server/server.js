require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
// const path = require('path'); // You can remove this if using Cloudinary, Vercel doesn't use local uploads

// Import Routes
const inventoryRoutes = require('./routes/inventoryRoutes');
const salesRoutes = require('./routes/salesRoutes');
const adminRoutes = require('./routes/adminRoutes');
const creditRoutes = require('./routes/creditRoutes');

const app = express();

// Middleware
app.use(cors()); // Allow all origins (Good for testing, restrict later if needed)
app.use(express.json());

// Database Connection
console.log('[INFO] Attempting to connect to MongoDB...');
console.log('[INFO] MongoDB URI:', process.env.MONGODB_URI ? process.env.MONGODB_URI.replace(/password=([^&]+)|:([^:/@]+)@/, '***') : 'NOT SET');

mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 15000,
  connectTimeoutMS: 15000,
  socketTimeoutMS: 45000,
})
  .then(() => {
    console.log('✅ MongoDB Connected Successfully');
  })
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
    console.error('   Please ensure:');
    console.error('   1. MongoDB Atlas cluster is running');
    console.error('   2. Connection string is correct');
    console.error('   3. Network access is allowed (IP whitelist)');
    console.error('   4. Database username/password is correct');
  });

// Routes
app.use('/api/medicines', inventoryRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/credits', creditRoutes);

// Root Route (Good for checking if server is live)
app.get('/', (req, res) => {
  res.send('Radhe Pharmacy API is Running!');
});

// --- CRITICAL CHANGE FOR VERCEL ---
const PORT = process.env.PORT || 5000; 
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));