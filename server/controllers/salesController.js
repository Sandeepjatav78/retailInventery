const Sale = require('../models/Sale');
const Medicine = require('../models/Medicine');
const Counter = require('../models/Counter');
const AuditLog = require('../models/AuditLog');

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

    // --- 🔍 STOCK VALIDATION (Pre-check to avoid negative stock) ---
    for (const item of items) {
      if (!item.medicineId) continue; // Manual items not linked to stock

      const med = await Medicine.findById(item.medicineId);
      if (!med) continue; // If medicine record missing, skip stock logic

      const currentQty = med.quantity || 0; // Stored in strips (can be decimal)
      const requestedQty = Number(item.quantity) || 0; // Also in strips

      if (requestedQty > currentQty + 1e-6) {
        return res.status(400).json({
          message: `Insufficient stock for ${med.productName}. Available: ${currentQty.toFixed(2)}, Requested: ${requestedQty.toFixed(2)}`
        });
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

    // Fire-and-forget audit log (does not affect response)
    AuditLog.create({
      action: 'CREATE_SALE',
      entityType: 'Sale',
      entityId: newSale._id.toString(),
      message: `Sale created with invoice ${finalInvoiceNo}`,
      details: { invoiceNo: finalInvoiceNo, totalAmount, paymentMode },
      userRole: userRole || 'admin'
    }).catch(err => console.error('Audit log error (CREATE_SALE):', err.message));

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

        AuditLog.create({
          action: 'DELETE_SALE',
          entityType: 'Sale',
          entityId: id,
          message: `Sale deleted and stock restored`,
          details: { invoiceNo: sale.invoiceNo },
          userRole: 'admin'
        }).catch(err => console.error('Audit log error (DELETE_SALE):', err.message));

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

        AuditLog.create({
          action: 'UPDATE_SALE',
          entityType: 'Sale',
          entityId: id,
          message: `Sale updated`,
          details: { invoiceNo: originalSale.invoiceNo },
          userRole: updatedSaleData.createdBy || 'admin'
        }).catch(err => console.error('Audit log error (UPDATE_SALE):', err.message));

        res.json({ success: true, sale: finalSale });

    } catch (err) {
        console.error("Update Error:", err);
        res.status(500).json({ message: "Update failed", error: err.message });
    }
};

// --- 6. PARTIAL RETURN (Selected Items Only) ---
exports.returnSaleItems = async (req, res) => {
  try {
    const { id } = req.params;
    const { items, userRole } = req.body;

    const originalSale = await Sale.findById(id);
    if (!originalSale) {
      return res.status(404).json({ message: "Sale not found" });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "No items to return" });
    }

    // Aggregate sold quantity per medicineId for validation
    const soldMap = {};
    originalSale.items.forEach(it => {
      if (!it.medicineId) return;
      soldMap[it.medicineId] = (soldMap[it.medicineId] || 0) + (it.quantity || 0);
    });

    let totalReturnAmount = 0;
    const returnItems = [];

    for (const r of items) {
      const qty = Number(r.quantity) || 0;
      if (qty <= 0) continue;

      // Try to find matching original item to copy extra fields
      let origItem = null;
      if (r.medicineId) {
        origItem = originalSale.items.find(it =>
          it.medicineId === r.medicineId &&
          (it.batch || '') === (r.batch || '') &&
          (it.name || '') === (r.name || '')
        ) || originalSale.items.find(it => it.medicineId === r.medicineId) || null;
      } else {
        origItem = originalSale.items.find(it =>
          (it.name || '') === (r.name || '') &&
          (it.batch || '') === (r.batch || '')
        ) || null;
      }

      const effectiveName = r.name || (origItem && origItem.name) || '';

      if (r.medicineId) {
        const soldQty = soldMap[r.medicineId] || 0;
        if (qty > soldQty + 1e-6) {
          return res.status(400).json({
            message: `Return quantity for ${effectiveName} cannot exceed sold quantity (${soldQty}).`
          });
        }
      }

      const price = r.price != null ? Number(r.price) : (origItem ? origItem.price : 0);
      const lineTotal = price * qty;
      totalReturnAmount += lineTotal;

      returnItems.push({
        medicineId: r.medicineId || (origItem && origItem.medicineId) || null,
        name: effectiveName,
        hsn: r.hsn != null ? r.hsn : (origItem && origItem.hsn),
        gst: r.gst != null ? r.gst : (origItem && origItem.gst),
        batch: r.batch != null ? r.batch : (origItem && origItem.batch),
        expiry: r.expiry != null ? r.expiry : (origItem && origItem.expiry),
        unit: r.unit != null ? r.unit : (origItem && origItem.unit),
        packSize: r.packSize != null ? r.packSize : (origItem && origItem.packSize),
        mrp: r.mrp != null ? r.mrp : (origItem && origItem.mrp),
        discount: r.discount != null ? r.discount : (origItem && origItem.discount),
        quantity: qty,
        price: price,
        purchasePrice: r.purchasePrice != null ? r.purchasePrice : (origItem && origItem.purchasePrice),
        // Negative total so GST/Revenue reports auto-adjust
        total: -lineTotal
      });
    }

    if (!returnItems.length) {
      return res.status(400).json({ message: "No valid items to return" });
    }

    // Restore stock for medicines involved
    for (const item of returnItems) {
      if (item.medicineId) {
        await Medicine.findByIdAndUpdate(item.medicineId, {
          $inc: { quantity: item.quantity }
        });
      }
    }

    const returnInvoiceNo = `RET-${Math.floor(Date.now() / 1000)}`;

    const returnSale = new Sale({
      invoiceNo: returnInvoiceNo,
      customerDetails: originalSale.customerDetails,
      items: returnItems,
      totalAmount: -totalReturnAmount,
      paymentMode: originalSale.paymentMode,
      isBillRequired: originalSale.isBillRequired,
      createdBy: userRole || 'admin',
      date: new Date()
    });

    await returnSale.save();

    AuditLog.create({
      action: 'RETURN_SALE_ITEMS',
      entityType: 'Sale',
      entityId: returnSale._id.toString(),
      message: `Partial return created against invoice ${originalSale.invoiceNo}`,
      details: { originalInvoice: originalSale.invoiceNo, returnInvoice: returnInvoiceNo },
      userRole: userRole || 'admin'
    }).catch(err => console.error('Audit log error (RETURN_SALE_ITEMS):', err.message));

    res.status(201).json({ success: true, sale: returnSale });

  } catch (err) {
    console.error('Return Error:', err);
    res.status(500).json({ message: 'Return failed', error: err.message });
  }
};