const express = require('express');
const router = express.Router();
const Credit = require('../models/Credit');
const Sale = require('../models/Sale');

// ============= GET ROUTES =============

// Get all credit customers
router.get('/', async (req, res) => {
  try {
    const credits = await Credit.find().sort({ createdDate: -1 });
    res.json({ success: true, data: credits });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get credit customer by ID
router.get('/:id', async (req, res) => {
  try {
    const credit = await Credit.findById(req.params.id).populate('bills.billId');
    if (!credit) return res.status(404).json({ success: false, error: 'Credit not found' });
    res.json({ success: true, data: credit });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get credit by phone number
router.get('/phone/:phone', async (req, res) => {
  try {
    const credit = await Credit.findOne({ customerPhone: req.params.phone });
    res.json({ success: true, data: credit || null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============= POST ROUTES =============

// Create new credit record or update existing
router.post('/add-bill', async (req, res) => {
  try {
    const { customerName, customerPhone, customerDoctor, billId, invoiceNo, billAmount, billDate } = req.body;

    // Find existing credit for this customer
    let credit = await Credit.findOne({ customerPhone });

    if (credit) {
      // Update existing credit
      credit.totalAmount += billAmount;
      credit.remainingAmount += billAmount;
      credit.bills.push({
        billId,
        invoiceNo,
        billAmount,
        billDate,
        billStatus: 'Pending'
      });
    } else {
      // Create new credit record
      credit = new Credit({
        customerName,
        customerPhone,
        customerDoctor,
        totalAmount: billAmount,
        remainingAmount: billAmount,
        bills: [{
          billId,
          invoiceNo,
          billAmount,
          billDate,
          billStatus: 'Pending'
        }]
      });
    }

    await credit.save();
    res.json({ success: true, data: credit });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Accept payment for credit
router.post('/add-payment/:creditId', async (req, res) => {
  try {
    const { paymentAmount, paymentMode, paymentNote, recordedBy } = req.body;
    const { creditId } = req.params;

    const credit = await Credit.findById(creditId);
    if (!credit) return res.status(404).json({ success: false, error: 'Credit not found' });

    // Add payment record
    credit.payments.push({
      paymentAmount,
      paymentMode: paymentMode || 'Cash',
      paymentNote,
      recordedBy: recordedBy || 'admin'
    });

    // Update amounts
    credit.paidAmount += paymentAmount;
    credit.remainingAmount = credit.totalAmount - credit.paidAmount;

    // Update bill status
    let remainingPayment = paymentAmount;
    for (let bill of credit.bills) {
      if (remainingPayment <= 0) break;
      
      const billPaid = bill.billAmount - (bill.billPaid || 0);
      if (remainingPayment >= billPaid) {
        bill.billStatus = 'Paid';
        bill.billPaid = bill.billAmount;
        remainingPayment -= billPaid;
      } else {
        bill.billStatus = 'Partial';
        bill.billPaid = (bill.billPaid || 0) + remainingPayment;
        remainingPayment = 0;
      }
    }

    // Update status
    if (credit.remainingAmount <= 0) {
      credit.status = 'Closed';
    } else {
      credit.status = 'Active';
    }

    credit.lastUpdated = new Date();
    await credit.save();

    res.json({ success: true, data: credit });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============= UPDATE ROUTES =============

// Update credit notes
router.put('/:creditId', async (req, res) => {
  try {
    const { creditNotes, status } = req.body;
    const credit = await Credit.findByIdAndUpdate(
      req.params.creditId,
      {
        creditNotes,
        status: status || 'Active',
        lastUpdated: new Date()
      },
      { new: true }
    );

    if (!credit) return res.status(404).json({ success: false, error: 'Credit not found' });
    res.json({ success: true, data: credit });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============= DELETE ROUTES =============

// Delete payment from credit
router.delete('/:creditId/payment/:paymentIndex', async (req, res) => {
  try {
    const credit = await Credit.findById(req.params.creditId);
    if (!credit) return res.status(404).json({ success: false, error: 'Credit not found' });

    const paymentIndex = parseInt(req.params.paymentIndex);
    const payment = credit.payments[paymentIndex];

    if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });

    // Reverse the payment
    credit.paidAmount -= payment.paymentAmount;
    credit.remainingAmount = credit.totalAmount - credit.paidAmount;

    // Reset bill status
    for (let bill of credit.bills) {
      bill.billStatus = 'Pending';
      bill.billPaid = 0;
    }

    credit.status = credit.remainingAmount > 0 ? 'Active' : 'Closed';
    credit.payments.splice(paymentIndex, 1);
    credit.lastUpdated = new Date();

    await credit.save();
    res.json({ success: true, data: credit });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
