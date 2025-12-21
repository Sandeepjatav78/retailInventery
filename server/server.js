require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
// const path = require('path'); // You can remove this if using Cloudinary, Vercel doesn't use local uploads

// Import Routes
const inventoryRoutes = require('./routes/inventoryRoutes');
const salesRoutes = require('./routes/salesRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

// Middleware
app.use(cors()); // Allow all origins (Good for testing, restrict later if needed)
app.use(express.json());

// Database Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log('DB Error:', err));

// Routes
app.use('/api/medicines', inventoryRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/admin', adminRoutes);

// Root Route (Good for checking if server is live)
app.get('/', (req, res) => {
  res.send('Radhe Pharmacy API is Running!');
});

// --- CRITICAL CHANGE FOR VERCEL ---
const PORT = process.env.PORT || 5000; 
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));