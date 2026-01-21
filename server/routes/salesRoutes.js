const express = require('express');
const router = express.Router();
const salesController = require('../controllers/salesController');

// 1. Get Next ID (Frontend calls this on load)
router.get('/next-id', salesController.getNextInvoiceNumber);

// 2. Create New Sale
router.post('/', salesController.createSale);

// 3. Get Sales Report
router.get('/filter', salesController.getAllSales);
router.put('/:id', salesController.updateSale);
router.delete('/:id', salesController.deleteSale);
module.exports = router;