const Sale = require('../models/Sale');
const Medicine = require('../models/Medicine');
const Counter = require('../models/Counter'); 

exports.getNextInvoiceNumber = async (req, res) => {
  try {
    let counter = await Counter.findOne({ id: "invoice_seq" });
    let nextSeq = counter ? counter.seq + 1 : 101;
    res.json({ success: true, nextInvoiceNo: `RP-${nextSeq}` });
  } catch (err) {
    res.status(500).json({ message: "Error fetching ID", error: err.message });
  }
};

exports.createSale = async (req, res) => {
  try {
    const { items, customerDetails, totalAmount, paymentMode, isBillRequired, userRole } = req.body;
    let finalInvoiceNo;

    if (userRole === 'staff') {
        finalInvoiceNo = `RP-${Math.floor(Date.now() / 1000)}`;
    } else {
        if (isBillRequired === true) {
            const counter = await Counter.findOneAndUpdate(
              { id: "invoice_seq" }, { $inc: { seq: 1 } }, { new: true, upsert: true }
            );
            finalInvoiceNo = `RP-${counter.seq}`;
        } else {
            finalInvoiceNo = `CS-${Math.floor(Date.now() / 1000)}`;
        }
    }

    const newSale = new Sale({
      invoiceNo: finalInvoiceNo,
      customerDetails,
      items,
      totalAmount,
      paymentMode,
      isBillRequired: isBillRequired,
      createdBy: userRole || 'admin', 
      date: new Date()
    });

    await newSale.save();

    // --- INVENTORY UPDATE LOGIC ---
    if (userRole !== 'staff') { 
        for (const item of items) {
          if (!item.medicineId) continue; // SKIP DOSE CHARGE
          await Medicine.findByIdAndUpdate(item.medicineId, { 
            $inc: { quantity: -item.quantity } 
          });
        }
    } 

    res.status(201).json({ success: true, invoiceNo: finalInvoiceNo, sale: newSale });

  } catch (err) {
    console.error("Sale Error:", err);
    res.status(400).json({ message: "Sale failed", error: err.message });
  }
};

exports.getAllSales = async (req, res) => {
    try {
        const { start, end } = req.query;
        let query = {};
        if(start && end) {
            let startDate = new Date(start); startDate.setHours(0,0,0,0);
            let endDate = new Date(end); endDate.setHours(23,59,59,999);
            query.date = { $gte: startDate, $lte: endDate };
        }
        const sales = await Sale.find(query).sort({ date: -1 });
        let totalRevenue = 0, cashRevenue = 0, onlineRevenue = 0;
        sales.forEach(s => {
            totalRevenue += s.totalAmount;
            if(s.paymentMode === 'Cash') cashRevenue += s.totalAmount;
            else onlineRevenue += s.totalAmount;
        });
        res.json({ transactions: sales, totalRevenue, cashRevenue, onlineRevenue, totalSalesCount: sales.length });
    } catch (err) { res.status(500).json({ message: err.message }); }
};