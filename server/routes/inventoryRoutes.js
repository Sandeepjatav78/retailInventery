const express = require('express');
const router = express.Router();
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const inventoryController = require('../controllers/inventoryController');

// Cloudinary Config
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

// ROUTES
router.get('/', inventoryController.getMedicines);
router.get('/search', inventoryController.searchMedicines);
router.get('/expiring', inventoryController.getExpiringMedicines);

router.post('/', upload.single('billImage'), inventoryController.addMedicine);
router.put('/:id', inventoryController.updateMedicine);

// --- NEW DELETE ROUTE ---
router.delete('/:id', inventoryController.deleteMedicine); 
// ------------------------
// Add this line with other routes
router.post('/dose', inventoryController.sellLooseMedicine);

// ... purane routes ...
router.post('/dose', inventoryController.sellLooseMedicine);

// --- NEW RUSH MODE ROUTES ---
router.post('/dose/quick', inventoryController.addQuickEntry);
router.get('/dose/pending', inventoryController.getPendingEntries);
router.post('/dose/resolve', inventoryController.resolvePendingEntry);
module.exports = router;