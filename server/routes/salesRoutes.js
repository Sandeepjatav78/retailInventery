const express = require('express');
const router = express.Router();
const salesController = require('../controllers/salesController');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// 1. Get Next ID (Frontend calls this on load)
router.get('/next-id', salesController.getNextInvoiceNumber);

// 1B. Get latest prices for this customer
router.get('/customer-last-prices', salesController.getCustomerLastPrices);

// 2. Create New Sale
router.post('/', salesController.createSale);

// 3. Get Sales Report & Manage Bills
router.get('/filter', salesController.getAllSales);
router.get('/schedule-ledger', salesController.getScheduleLedger);
router.put('/:id', salesController.updateSale);
router.delete('/:id', salesController.deleteSale);

// 4. Partial Returns (add selected items back to stock)
router.post('/:id/return', salesController.returnSaleItems);
module.exports = router;