const Sale = require('../models/Sale');
const Medicine = require('../models/Medicine');
const Counter = require('../models/Counter'); // Ensure you created this model

// --- 1. GET NEXT INVOICE ID (For Display Only) ---
exports.getNextInvoiceNumber = async (req, res) => {
  try {
    // Check current counter, default to 100 if new
    let counter = await Counter.findOne({ id: "invoice_seq" });
    let nextSeq = counter ? counter.seq + 1 : 101;
    
    // Send back e.g. "RP-101"
    res.json({ success: true, nextInvoiceNo: `RP-${nextSeq}` });
  } catch (err) {
    res.status(500).json({ message: "Error fetching ID", error: err.message });
  }
};

// --- 2. CREATE SALE (The Main Logic) ---
exports.createSale = async (req, res) => {
  try {
    const { items, customerDetails, totalAmount, paymentMode } = req.body;

    let finalInvoiceNo;

    // LOGIC: Only increment invoice number if it's a real bill
    // If name is "Don't want bill by customer", it means "Print Bill" was unchecked.
    if (customerDetails && customerDetails.name !== "Don't want bill by customer") {
        
        // A. Official Bill -> Increment Counter
        const counter = await Counter.findOneAndUpdate(
          { id: "invoice_seq" },
          { $inc: { seq: 1 } },
          { new: true, upsert: true }
        );
        finalInvoiceNo = `RP-${counter.seq}`;

    } else {
        
        // B. Don't want bill by customer -> Do NOT Increment. Use Temp ID.
        // Format: CS-{timestamp} (e.g. CS-170923...)
        finalInvoiceNo = `CS-${Math.floor(Date.now() / 1000)}`;
    }

    // 1. Create Sale Record
    const newSale = new Sale({
      invoiceNo: finalInvoiceNo,
      customerDetails,
      items,
      totalAmount,
      paymentMode,
      date: new Date()
    });

    await newSale.save();

    // 2. Update Inventory (Decrease Stock)
    for (const item of items) {
      await Medicine.findByIdAndUpdate(item.medicineId, { 
        $inc: { quantity: -item.quantity } 
      });
    }

    res.status(201).json({ success: true, invoiceNo: finalInvoiceNo, sale: newSale });

  } catch (err) {
    console.error("Sale Error:", err);
    res.status(400).json({ message: "Sale failed", error: err.message });
  }
};

// --- 3. GET REPORT ---
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