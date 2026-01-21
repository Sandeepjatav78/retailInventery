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

// --- 2. CREATE SALE ---
exports.createSale = async (req, res) => {
  try {
    const { items, customerDetails, totalAmount, paymentMode, isBillRequired, userRole, invoiceNo, customDate } = req.body;

    let finalInvoiceNo = invoiceNo; // Use provided ID (e.g., MAN-...) or generate new one

    // If invoiceNo is not provided (Regular Sale), handle as before
    if (!finalInvoiceNo) {
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
    }

    const newSale = new Sale({
      invoiceNo: finalInvoiceNo,
      customerDetails,
      items,
      totalAmount,
      paymentMode,
      isBillRequired: isBillRequired,
      createdBy: userRole || 'admin',
      date: customDate ? new Date(customDate) : new Date() // 🔥 USE CUSTOM DATE IF AVAILABLE
    });

    await newSale.save();

    // Inventory Update Logic
    if (userRole !== 'staff') {
      for (const item of items) {
        // 🔥 CRITICAL FIX: Skip if medicineId is null (Manual/Dose items)
        if (!item.medicineId) continue;

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

// --- 3. GET REPORT (With Global Search) ---
exports.getAllSales = async (req, res) => {
  try {
    const { start, end, search } = req.query; // Added 'search' param
    let query = {};

    // --- 🔥 GLOBAL SEARCH LOGIC ---
    if (search) {
      // Ignore dates, search everywhere
      query.$or = [
        { invoiceNo: { $regex: search, $options: 'i' } },
        { "customerDetails.name": { $regex: search, $options: 'i' } }
      ];
    }
    // --- 📅 DATE FILTER LOGIC ---
    else if (start && end) {
      let startDate = new Date(start); startDate.setHours(0, 0, 0, 0);
      let endDate = new Date(end); endDate.setHours(23, 59, 59, 999);
      query.date = { $gte: startDate, $lte: endDate };
    }

    // Limit to 100 results for performance
    const sales = await Sale.find(query).sort({ date: -1 }).limit(100);

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

// ... existing functions ...

// --- 🔥 NEW: DELETE SALE & RESTORE STOCK ---
exports.deleteSale = async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Find Sale
        const sale = await Sale.findById(id);
        if (!sale) return res.status(404).json({ message: "Sale not found" });

        // 2. Restore Stock (Only for Inventory items, skip Manual)
        for (const item of sale.items) {
            if (item.medicineId) {
                await Medicine.findByIdAndUpdate(item.medicineId, { 
                    $inc: { quantity: item.quantity } // Add qty back
                });
            }
        }

        // 3. Delete Record
        await Sale.findByIdAndDelete(id);

        res.json({ success: true, message: "Sale deleted and stock restored" });

    } catch (err) {
        res.status(500).json({ message: "Delete failed", error: err.message });
    }
};

exports.updateSale = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedSaleData = req.body; // The new data from frontend

        // 1. Fetch Original Sale
        const originalSale = await Sale.findById(id);
        if (!originalSale) {
            return res.status(404).json({ message: "Sale not found" });
        }

        // 2. REVERT OLD STOCK (Add quantities back to inventory)
        // We only do this for items that have a linked medicineId
        for (const item of originalSale.items) {
            if (item.medicineId) {
                await Medicine.findByIdAndUpdate(item.medicineId, { 
                    $inc: { quantity: item.quantity } 
                });
            }
        }

        // 3. DEDUCT NEW STOCK (Subtract new quantities)
        // This handles cases where you changed the quantity in the edit form
        for (const item of updatedSaleData.items) {
            if (item.medicineId) {
                await Medicine.findByIdAndUpdate(item.medicineId, { 
                    $inc: { quantity: -item.quantity } 
                });
            }
        }

        // 4. Update the Sale Record
        const finalSale = await Sale.findByIdAndUpdate(id, updatedSaleData, { new: true });

        res.json({ success: true, sale: finalSale });

    } catch (err) {
        console.error("Update Error:", err);
        res.status(500).json({ message: "Update failed", error: err.message });
    }
};