const express = require('express');
const router = express.Router();
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

// Import the Controller we just created
const inventoryController = require('../controllers/inventoryController');

// --- CLOUDINARY CONFIG (Keep this here for Uploads) ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'radhe-pharmacy-bills',
    allowed_formats: ['jpg', 'png', 'jpeg', 'pdf'],
  },
});
const upload = multer({ storage: storage });
// -----------------------------------------------------

// DEFINING ROUTES
router.get('/', inventoryController.getMedicines);
router.get('/search', inventoryController.searchMedicines);
router.get('/expiring', inventoryController.getExpiringMedicines);
router.post('/', upload.single('billImage'), inventoryController.addMedicine);
router.put('/:id', inventoryController.updateMedicine);

module.exports = router;