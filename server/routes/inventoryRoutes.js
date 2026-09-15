const express = require('express');
const router = express.Router();
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const inventoryController = require('../controllers/inventoryController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

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
    allowedFormats: ['jpg', 'png', 'jpeg', 'pdf'], 
  },
});
const upload = multer({ storage: storage });

// --- ROUTES ---
router.use(authenticateToken);

// 1. GET Methods
router.get('/', inventoryController.getMedicines); 
router.get('/search', inventoryController.searchMedicines);
router.get('/suppliers', inventoryController.getSuppliers);
router.get('/expiring', inventoryController.getExpiringMedicines);
router.get('/dose/pending', inventoryController.getPendingEntries);
router.get('/kachi', authorizeRoles('admin'), inventoryController.getKachiEntries);
router.get('/purchase-bills', authorizeRoles('admin'), inventoryController.getPurchaseBills);
router.get('/supplier-ledger', authorizeRoles('admin'), inventoryController.getSupplierLedger);
router.post('/supplier-ledger/manual-bill', authorizeRoles('admin'), inventoryController.createManualSupplierBill);
router.delete('/supplier-ledger/:name', authorizeRoles('admin'), inventoryController.deleteSupplierParty);
router.get('/purchase-returns', authorizeRoles('staff'), inventoryController.getPurchaseReturns);

// 2. POST Methods
router.post('/', authorizeRoles('admin'), upload.single('billImage'), inventoryController.addMedicine);
router.post('/kachi', authorizeRoles('admin'), upload.single('billImage'), inventoryController.addKachiEntry);
router.post('/purchase-bills', authorizeRoles('admin'), upload.array('billImages', 10), inventoryController.createPurchaseBill);
router.put('/purchase-bills/:id', authorizeRoles('admin'), upload.array('billImages', 10), inventoryController.updatePurchaseBill);
router.post('/purchase-bills/:id/pay', authorizeRoles('admin'), inventoryController.recordSupplierPayment);
router.post('/scan-bill', authorizeRoles('admin', 'staff'), upload.array('billImages', 10), inventoryController.scanPurchaseBill);
router.post('/purchase-returns', authorizeRoles('staff'), inventoryController.createPurchaseReturn);
router.post('/dose', inventoryController.sellLooseMedicine);
router.post('/dose/quick', inventoryController.addQuickEntry);
router.post('/dose/resolve', inventoryController.resolvePendingEntry);

// 3. PUT/DELETE Methods
router.put('/:id', authorizeRoles('admin', 'staff'), upload.single('billImage'), inventoryController.updateMedicine); 
router.delete('/:id', authorizeRoles('admin'), inventoryController.deleteMedicine);

module.exports = router;
