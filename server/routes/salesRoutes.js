const express = require('express');
const router = express.Router();
const Sale = require('../models/Sale');
const Medicine = require('../models/Medicine');

// CREATE NEW SALE
router.post('/', async (req, res) => {
  try {
    // 1. Destructure ALL the new fields we added
    const { 
      items, 
      totalAmount, 
      paymentMode, 
      invoiceNo,       // <--- WAS MISSING
      customerDetails  // <--- WAS MISSING
    } = req.body;

    // 2. Create the Sale Record with these new fields
    const newSale = new Sale({ 
      items, 
      totalAmount, 
      paymentMode,
      invoiceNo,       // <--- Save it
      customerDetails  // <--- Save it
    });
    
    await newSale.save();

    // 3. Deduct Inventory
    for (const item of items) {
      await Medicine.findByIdAndUpdate(item.medicineId, {
        $inc: { quantity: -item.quantity }
      });
    }

    res.status(201).json(newSale);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET SALES REPORT (Flexible Date Range)
router.get('/filter', async (req, res) => {
  try {
    const { start, end } = req.query;

    let startDate = start ? new Date(start) : new Date();
    startDate.setHours(0, 0, 0, 0);

    let endDate = end ? new Date(end) : new Date();
    endDate.setHours(23, 59, 59, 999);

    const sales = await Sale.find({
      date: { $gte: startDate, $lte: endDate }
    }).sort({ date: -1 });

    const report = {
      totalRevenue: 0,
      cashRevenue: 0,
      onlineRevenue: 0,
      totalSalesCount: sales.length,
      transactions: sales
    };

    sales.forEach(sale => {
      report.totalRevenue += sale.totalAmount;
      if (sale.paymentMode === 'Cash') report.cashRevenue += sale.totalAmount;
      if (sale.paymentMode === 'Online') report.onlineRevenue += sale.totalAmount;
    });

    res.json(report);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;