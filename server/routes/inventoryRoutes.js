const express = require('express');
const router = express.Router();
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const inventoryController = require('../controllers/inventoryController');

// --- CLOUDINARY CONFIG ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// --- STORAGE CONFIGURATION ---
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'radhe-pharmacy-bills',
    // FIX: Use 'allowedFormats' (camelCase) for newer versions
    allowedFormats: ['jpg', 'png', 'jpeg', 'pdf'], 
  },
});
const upload = multer({ storage: storage });

// --- ROUTES ---

// 1. GET Methods
router.get('/', inventoryController.getMedicines); 
router.get('/search', inventoryController.searchMedicines);
router.get('/expiring', inventoryController.getExpiringMedicines);
router.get('/dose/pending', inventoryController.getPendingEntries);

// 2. POST Methods
router.post('/', upload.single('billImage'), inventoryController.addMedicine);
router.post('/dose', inventoryController.sellLooseMedicine);
router.post('/dose/quick', inventoryController.addQuickEntry);
router.post('/dose/resolve', inventoryController.resolvePendingEntry);

// 3. PUT/DELETE Methods
// ✅ THIS IS THE FIX: The upload middleware is present here
router.put('/:id', upload.single('billImage'), inventoryController.updateMedicine); 
router.delete('/:id', inventoryController.deleteMedicine);

module.exports = router;