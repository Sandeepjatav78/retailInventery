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

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'radhe-pharmacy-bills',
    allowed_formats: ['jpg', 'png', 'jpeg', 'pdf'],
  },
});
const upload = multer({ storage: storage });

// --- ROUTES ---

// 1. GET Methods
router.get('/', inventoryController.getMedicines); // Fetch All (Used for Loose List)
router.get('/search', inventoryController.searchMedicines);
router.get('/expiring', inventoryController.getExpiringMedicines);
router.get('/dose/pending', inventoryController.getPendingEntries); // Get Pending List

// 2. POST Methods (Add & Sales)
router.post('/', upload.single('billImage'), inventoryController.addMedicine);
router.post('/dose', inventoryController.sellLooseMedicine); // Final Dose Sale
router.post('/dose/quick', inventoryController.addQuickEntry); // Rush Mode
router.post('/dose/resolve', inventoryController.resolvePendingEntry); // Resolve Pending

// 3. PUT/DELETE Methods (Update)
router.put('/:id', upload.single('billImage'), inventoryController.updateMedicine);
router.delete('/:id', inventoryController.deleteMedicine);

module.exports = router;