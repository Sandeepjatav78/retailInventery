const Sale = require('../models/Sale');
const Medicine = require('../models/Medicine');
const Counter = require('../models/Counter');

// --- 1. GET NEXT INVOICE ID ---
exports.getNextInvoiceNumber = async (req, res) => {
  try {
    let counter = await Counter.findOne({ id: "invoice_seq" });
    let nextSeq = counter ? counter.seq + 1 : 101;
    res.json({ success: true, nextInvoiceNo: `RP-${nextSeq}` });
  } catch (err) {
    res.status(500).json({ message: "Error fetching ID", error: err.message });
  }
};

// --- 2. CREATE SALE (Fixes Invoice ID & Stock Reduction) ---
exports.createSale = async (req, res) => {
  try {
    const { items, customerDetails, totalAmount, paymentMode, isBillRequired, userRole, invoiceNo, customDate } = req.body;

    let finalInvoiceNo = invoiceNo; // Gets value if Manual Bill sends it

    // --- 🔥 INVOICE GENERATION LOGIC (Restored) ---
    // If no ID provided (SaleForm), generate one automatically
    if (!finalInvoiceNo) {
      if (userRole === 'staff') {
        // Staff uses Time-based ID
        finalInvoiceNo = `RP-${Math.floor(Date.now() / 1000)}`;
      } else {
        // Admin Logic
        if (isBillRequired === true) {
          // Generate Sequential ID (RP-101, RP-102...)
          const counter = await Counter.findOneAndUpdate(
            { id: "invoice_seq" }, 
            { $inc: { seq: 1 } }, 
            { new: true, upsert: true }
          );
          finalInvoiceNo = `RP-${counter.seq}`;
        } else {
          // Cash Sale ID (CS-timestamp)
          finalInvoiceNo = `CS-${Math.floor(Date.now() / 1000)}`;
        }
      }
    }

    // 1. Create Sale Record
    const newSale = new Sale({
      invoiceNo: finalInvoiceNo,
      customerDetails,
      items,
      totalAmount,
      paymentMode,
      isBillRequired: isBillRequired,
      createdBy: userRole || 'admin',
      date: customDate ? new Date(customDate) : new Date()
    });

    await newSale.save();

    // --- 🔥 STOCK REDUCTION LOGIC ---
    // Runs for EVERYONE (Admin & Staff)
    // Runs for Manual Bill items ONLY if they are linked to a medicine ID
    for (const item of items) {
        if (item.medicineId) {
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

// --- 3. GET REPORT (With Medicine Search Fixed) ---
exports.getAllSales = async (req, res) => {
  try {
    const { start, end, search } = req.query; 
    let query = {};

    // --- 🔥 GLOBAL SEARCH LOGIC ---
    if (search) {
      // Search in Invoice, Customer Name, AND Medicine Names
      query.$or = [
        { invoiceNo: { $regex: search, $options: 'i' } },
        { "customerDetails.name": { $regex: search, $options: 'i' } },
        { "items.name": { $regex: search, $options: 'i' } } // <--- Checks inside items array
      ];
    }
    // --- 📅 DATE FILTER LOGIC ---
    else if (start && end) {
      let startDate = new Date(start); startDate.setHours(0, 0, 0, 0);
      let endDate = new Date(end); endDate.setHours(23, 59, 59, 999);
      query.date = { $gte: startDate, $lte: endDate };
    }

    // Sort by Date (Newest First)
    const sales = await Sale.find(query).sort({ date: -1 });

    let totalRevenue = 0, cashRevenue = 0, onlineRevenue = 0;
    sales.forEach(s => {
      totalRevenue += s.totalAmount;
      if (s.paymentMode === 'Cash') cashRevenue += s.totalAmount;
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

// --- 4. DELETE SALE & RESTORE STOCK ---
exports.deleteSale = async (req, res) => {
    try {
        const { id } = req.params;

        const sale = await Sale.findById(id);
        if (!sale) return res.status(404).json({ message: "Sale not found" });

        // Restore Stock
        for (const item of sale.items) {
            if (item.medicineId) {
                await Medicine.findByIdAndUpdate(item.medicineId, { 
                    $inc: { quantity: item.quantity } 
                });
            }
        }

        await Sale.findByIdAndDelete(id);
        res.json({ success: true, message: "Sale deleted and stock restored" });

    } catch (err) {
        res.status(500).json({ message: "Delete failed", error: err.message });
    }
};

// --- 5. UPDATE SALE (Edit Bill) ---
exports.updateSale = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedSaleData = req.body;

        const originalSale = await Sale.findById(id);
        if (!originalSale) return res.status(404).json({ message: "Sale not found" });

        // 1. Revert Old Stock
        for (const item of originalSale.items) {
            if (item.medicineId) {
                await Medicine.findByIdAndUpdate(item.medicineId, { 
                    $inc: { quantity: item.quantity } 
                });
            }
        }

        // 2. Deduct New Stock
        for (const item of updatedSaleData.items) {
            if (item.medicineId) {
                await Medicine.findByIdAndUpdate(item.medicineId, { 
                    $inc: { quantity: -item.quantity } 
                });
            }
        }

        // 3. Save Changes
        const finalSale = await Sale.findByIdAndUpdate(id, updatedSaleData, { new: true });
        res.json({ success: true, sale: finalSale });

    } catch (err) {
        console.error("Update Error:", err);
        res.status(500).json({ message: "Update failed", error: err.message });
    }
};