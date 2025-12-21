const express = require('express');
const router = express.Router();
const Medicine = require('../models/Medicine');
const multer = require('multer');
// --- IMPORT CLOUDINARY MODULES ---
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// --- CONFIGURE CLOUDINARY ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// --- SET STORAGE TO CLOUDINARY (NOT LOCAL DISK) ---
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'radhe-pharmacy-bills', // The folder name in Cloudinary
    allowed_formats: ['jpg', 'png', 'jpeg', 'pdf'],
  },
});

const upload = multer({ storage: storage });
// --------------------------------------------------

// GET ALL
router.get('/', async (req, res) => {
  try {
    const meds = await Medicine.find().sort({ productName: 1 });
    res.json(meds);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ADD NEW (Using Cloudinary Upload)
router.post('/', upload.single('billImage'), async (req, res) => {
  try {
    const medData = {
      ...req.body,
      // Cloudinary automatically gives us the online URL in 'req.file.path'
      billImage: req.file ? req.file.path : null 
    };
    
    const newMed = new Medicine(medData);
    const savedMed = await newMed.save();
    res.status(201).json(savedMed);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// SEARCH
router.get('/search', async (req, res) => {
  const { q } = req.query;
  try {
    const meds = await Medicine.find({ 
      productName: { $regex: q, $options: 'i' },
      quantity: { $gt: 0 } 
    });
    res.json(meds);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// EXPIRY & UPDATE ROUTES (Keep exactly as they were)
router.get('/expiring', async (req, res) => {
  try {
    const today = new Date();
    const nextMonth = new Date();
    nextMonth.setDate(today.getDate() + 30);
    const expiring = await Medicine.find({ expiryDate: { $gte: today, $lte: nextMonth } });
    res.json(expiring);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const updatedMed = await Medicine.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updatedMed);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

module.exports = router;