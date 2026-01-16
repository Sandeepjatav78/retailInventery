const Sale = require('../models/Sale');
const Medicine = require('../models/Medicine');
const Counter = require('../models/Counter'); 

// --- 1. GET NEXT INVOICE ID ---
// Used by the frontend to show the Invoice No. before saving
exports.getNextInvoiceNumber = async (req, res) => {
  try {
    let counter = await Counter.findOne({ id: "invoice_seq" });
    let nextSeq = counter ? counter.seq + 1 : 101;
    res.json({ success: true, nextInvoiceNo: `RP-${nextSeq}` });
  } catch (err) {
    res.status(500).json({ message: "Error fetching ID", error: err.message });
  }
};

// --- 2. CREATE SALE (The Main Checkout Function) ---
exports.createSale = async (req, res) => {
  try {
    const { items, customerDetails, totalAmount, paymentMode, isBillRequired, userRole } = req.body;

    let finalInvoiceNo;

    // --- Invoice Number Logic ---
    if (userRole === 'staff') {
        // Staff: Time-based ID (RP-Timestamp)
        finalInvoiceNo = `RP-${Math.floor(Date.now() / 1000)}`;
    } else {
        // Admin Logic: Sequential ID
        if (isBillRequired === true) {
            const counter = await Counter.findOneAndUpdate(
              { id: "invoice_seq" },
              { $inc: { seq: 1 } },
              { new: true, upsert: true }
            );
            finalInvoiceNo = `RP-${counter.seq}`;
        } else {
            // Cash Sale (No Bill) uses a temporary ID
            finalInvoiceNo = `CS-${Math.floor(Date.now() / 1000)}`;
        }
    }

    // --- Save Sale to Database ---
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

    // --- 🔥 INVENTORY UPDATE LOGIC (Fixed for Dose) ---
    // Only decrease stock if the user is ADMIN
    if (userRole !== 'staff') { 
        for (const item of items) {
          // --- 🛡️ CRITICAL FIX ---
          // Check if item has a medicineId. 
          // If NOT (like the "Dose Charge"), SKIP it to prevent crash.
          if (!item.medicineId) continue; 

          await Medicine.findByIdAndUpdate(item.medicineId, { 
            $inc: { quantity: -item.quantity } 
          });
        }
    } 
    // If userRole IS 'staff', this loop is skipped, so stock remains same.

    res.status(201).json({ success: true, invoiceNo: finalInvoiceNo, sale: newSale });

  } catch (err) {
    console.error("Sale Error:", err);
    res.status(400).json({ message: "Sale failed", error: err.message });
  }
};

// --- 3. GET REPORT (For Sales History/Dashboard) ---
exports.getAllSales = async (req, res) => {
    try {
        const { start, end } = req.query;
        let query = {};
        
        // Filter by Date Range
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

        res.json({ 
            transactions: sales, 
            totalRevenue, 
            cashRevenue, 
            onlineRevenue, 
            totalSalesCount: sales.length 
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};