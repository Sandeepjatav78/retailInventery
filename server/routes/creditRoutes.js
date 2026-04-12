const express = require('express');
const router = express.Router();
const Credit = require('../models/Credit');
const Sale = require('../models/Sale');

const normalizePhone = (phone = '') => {
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  return digits;
};

const toMoney = (value) => {
  const n = Number(value) || 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
};

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

// Search customers for billing suggestions
router.get('/customers/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return res.json({ success: true, data: [] });
    }

    const credits = await Credit.find({
      $or: [
        { customerName: { $regex: q, $options: 'i' } },
        { customerPhone: { $regex: q, $options: 'i' } }
      ]
    })
      .sort({ lastUpdated: -1, createdDate: -1 })
      .limit(15)
      .select('customerName customerPhone customerDoctor remainingAmount status lastUpdated');

    res.json({ success: true, data: credits });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get credit by phone number
router.get('/phone/:phone', async (req, res) => {
  try {
    const normalizedPhone = normalizePhone(req.params.phone);
    const credit = await Credit.findOne({
      $or: [
        { customerPhone: normalizedPhone },
        { customerPhone: req.params.phone }
      ]
    });
    res.json({ success: true, data: credit || null });
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

// ============= POST ROUTES =============

// Create new credit record or update existing
router.post('/add-bill', async (req, res) => {
  try {
    const { customerName, customerPhone, customerDoctor, billId, invoiceNo, billAmount, billDate } = req.body;
    const normalizedPhone = normalizePhone(customerPhone);

    // Find existing credit for this customer
    let credit = await Credit.findOne({
      $or: [
        { customerPhone: normalizedPhone },
        { customerPhone }
      ]
    });

    if (credit) {
      // Update existing credit
      credit.totalAmount += billAmount;
      credit.remainingAmount += billAmount;
      if (normalizedPhone) credit.customerPhone = normalizedPhone;
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
        customerPhone: normalizedPhone || customerPhone,
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

// Add opening/manual pending amount by phone (old balance migration)
router.post('/add-opening', async (req, res) => {
  try {
    const { customerName, customerPhone, customerDoctor, amount, note, recordedBy } = req.body;

    const openingAmount = Number(amount);
    if (!customerName || !customerPhone || !Number.isFinite(openingAmount) || openingAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Name, phone, and valid amount are required' });
    }

    const normalizedPhone = normalizePhone(customerPhone);

    let credit = await Credit.findOne({
      $or: [
        { customerPhone: normalizedPhone },
        { customerPhone }
      ]
    });

    const openingInvoice = `OPENING-${Date.now()}`;

    if (credit) {
      credit.customerName = credit.customerName || customerName;
      credit.customerDoctor = customerDoctor || credit.customerDoctor;
      if (normalizedPhone) credit.customerPhone = normalizedPhone;

      credit.totalAmount += openingAmount;
      credit.remainingAmount += openingAmount;
      credit.bills.push({
        billId: null,
        invoiceNo: openingInvoice,
        billAmount: openingAmount,
        billDate: new Date(),
        billStatus: 'Pending'
      });
      credit.lastUpdated = new Date();
    } else {
      credit = new Credit({
        customerName,
        customerPhone: normalizedPhone || customerPhone,
        customerDoctor: customerDoctor || '',
        totalAmount: openingAmount,
        paidAmount: 0,
        remainingAmount: openingAmount,
        bills: [{
          billId: null,
          invoiceNo: openingInvoice,
          billAmount: openingAmount,
          billDate: new Date(),
          billStatus: 'Pending'
        }],
        payments: []
      });
    }

    if (note) {
      credit.payments.push({
        paymentAmount: 0,
        paymentMode: 'Cash',
        paymentNote: `Opening note: ${note}`,
        recordedBy: recordedBy || 'admin'
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
    const paymentValue = toMoney(paymentAmount);

    if (!Number.isFinite(paymentValue) || paymentValue <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid payment amount' });
    }

    const credit = await Credit.findById(creditId);
    if (!credit) return res.status(404).json({ success: false, error: 'Credit not found' });

    const remainingBefore = toMoney(credit.remainingAmount);
    if (paymentValue - remainingBefore > 0.009) {
      return res.status(400).json({ success: false, error: 'Payment cannot exceed remaining amount' });
    }

    // Add payment record
    credit.payments.push({
      paymentAmount: paymentValue,
      paymentMode: paymentMode || 'Cash',
      paymentNote,
      recordedBy: recordedBy || 'admin'
    });

    // Update amounts
    credit.paidAmount = toMoney(toMoney(credit.paidAmount) + paymentValue);
    credit.remainingAmount = Math.max(0, toMoney(toMoney(credit.totalAmount) - toMoney(credit.paidAmount)));

    // Update bill status
    let remainingPayment = paymentValue;
    for (let bill of credit.bills) {
      if (remainingPayment <= 0) break;
      
      const billPaid = toMoney(toMoney(bill.billAmount) - toMoney(bill.billPaid || 0));
      if (remainingPayment >= billPaid) {
        bill.billStatus = 'Paid';
        bill.billPaid = toMoney(bill.billAmount);
        remainingPayment = toMoney(remainingPayment - billPaid);
      } else {
        bill.billStatus = 'Partial';
        bill.billPaid = toMoney(toMoney(bill.billPaid || 0) + remainingPayment);
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
