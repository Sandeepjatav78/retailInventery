const Medicine = require('../models/Medicine');
const Sale = require('../models/Sale'); // <--- IMPORT SALE MODEL ZARURI HAI
const PendingDose = require('../models/PendingDose');
const AuditLog = require('../models/AuditLog');
const PurchaseReturn = require('../models/PurchaseReturn');

// 1. GET ALL MEDICINES
const getMedicines = async (req, res) => {
  try {
    const userRole = req.user?.role || 'staff';
    const query = userRole === 'admin'
      ? {
          $or: [
            { isKachiEntry: { $ne: true } },
            { isKachiEntry: true, canShowInAdminInventory: true }
          ]
        }
      : { isKachiEntry: { $ne: true } };

    const meds = await Medicine.find(query).sort({ productName: 1 });
    res.json(meds);
  } catch (err) {
    console.error('[Error] getMedicines:', err.message);
    res.status(500).json({ message: err.message });
  }
};


// 2. SEARCH MEDICINES
const searchMedicines = async (req, res) => {
  const { q, includeOutOfStock } = req.query;
  const userRole = req.user?.role || 'staff';
  if (!q) return res.json([]);
  try {
    // By default, keep suggestions sale-safe by hiding out-of-stock medicines.
    const includeStockZero = String(includeOutOfStock || '').toLowerCase() === 'true' || includeOutOfStock === '1';
    const hideZeroStockOnly = !includeStockZero;

    const filters = [
      {
        $or: [
          { productName: { $regex: q, $options: 'i' } },
          { batchNumber: { $regex: q, $options: 'i' } }
        ]
      }
    ];

    if (hideZeroStockOnly) {
      filters.push({
        $or: [
          { quantity: { $gt: 0 } },
          { looseQty: { $gt: 0 } }
        ]
      });
    }

    if (userRole === 'staff') {
      filters.push({ isKachiEntry: { $ne: true } });
      filters.push({
        hsnCode: { $exists: true, $nin: [null, ''] }
      });
    }

    const query = filters.length > 1 ? { $and: filters } : filters[0];

    const meds = await Medicine.find(query)
      .sort({ expiryDate: 1 }) // <--- 🔥 THIS LINE DOES THE MAGIC (1 = Ascending/Oldest First)
      .limit(20); // Optional: Limit results to keep it fast

    res.json(meds);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 3. ADD NEW STOCK
const addMedicine = async (req, res) => {
  try {
    // Validation helper
    const validateRequired = (val, fieldName) => {
      if (val === '' || val === null || val === undefined) {
        throw new Error(`${fieldName} is required`);
      }
      return val;
    };

    const safeNumber = (val, fieldName) => {
      if (val === '' || val === null || val === undefined) {
        throw new Error(`${fieldName} is required and must be a number`);
      }
      const num = Number(val);
      if (isNaN(num)) {
        throw new Error(`${fieldName} must be a valid number, got: ${val}`);
      }
      return num;
    };

    // Validate all required fields BEFORE creating the medicine
    validateRequired(req.body.productName, 'Product Name');
    validateRequired(req.body.batchNumber, 'Batch Number');
    validateRequired(req.body.expiryDate, 'Expiry Date');
    
    const mrp = safeNumber(req.body.mrp, 'MRP');
    const sellingPrice = safeNumber(req.body.sellingPrice, 'Selling Price');
    const costPrice = safeNumber(req.body.costPrice, 'Cost Price');
    const doctorPrice = (req.body.doctorPrice !== undefined && req.body.doctorPrice !== '')
      ? safeNumber(req.body.doctorPrice, 'Doctor Price')
      : sellingPrice;

    const medData = {
      ...req.body,
      mrp,
      sellingPrice,
      doctorPrice,
      costPrice,
      quantity: safeNumber(req.body.quantity || 0, 'Quantity'),
      packSize: Number(req.body.packSize) || 10,
      billImage: req.file ? req.file.path : null
    };

    const normalizedName = String(medData.productName || '').trim();
    const normalizedBatch = String(medData.batchNumber || '').trim();

    const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const existingMed = await Medicine.findOne({
      productName: { $regex: `^${escapeRegex(normalizedName)}$`, $options: 'i' },
      batchNumber: { $regex: `^${escapeRegex(normalizedBatch)}$`, $options: 'i' }
    });

    if (existingMed) {
      existingMed.quantity = Number(existingMed.quantity || 0) + Number(medData.quantity || 0);
      existingMed.mrp = medData.mrp;
      existingMed.sellingPrice = medData.sellingPrice;
      existingMed.doctorPrice = medData.doctorPrice;
      existingMed.costPrice = medData.costPrice;
      existingMed.packSize = medData.packSize;
      existingMed.gst = medData.gst !== undefined ? Number(medData.gst) : existingMed.gst;
      existingMed.maxDiscount = medData.maxDiscount !== undefined ? Number(medData.maxDiscount) : existingMed.maxDiscount;
      existingMed.hsnCode = medData.hsnCode || existingMed.hsnCode;
      existingMed.expiryDate = medData.expiryDate || existingMed.expiryDate;
      existingMed.partyName = medData.partyName || existingMed.partyName;
      existingMed.purchaseDate = medData.purchaseDate || existingMed.purchaseDate;
      if (medData.billImage) {
        existingMed.billImage = medData.billImage;
      }

      const mergedMed = await existingMed.save();

      AuditLog.create({
        action: 'UPDATE_MEDICINE',
        entityType: 'Medicine',
        entityId: mergedMed._id.toString(),
        message: `Stock merged for ${mergedMed.productName} (${mergedMed.batchNumber})`,
        details: { productName: mergedMed.productName, batchNumber: mergedMed.batchNumber, mergedQuantity: medData.quantity },
        userRole: 'admin'
      }).catch(err => console.error('Audit log error (MERGE_MEDICINE_STOCK):', err.message));

      return res.status(200).json({ ...mergedMed.toObject(), merged: true });
    }

    const newMed = new Medicine({
      ...medData,
      productName: normalizedName,
      batchNumber: normalizedBatch
    });
    const savedMed = await newMed.save();

    AuditLog.create({
      action: 'CREATE_MEDICINE',
      entityType: 'Medicine',
      entityId: savedMed._id.toString(),
      message: `New stock added for ${savedMed.productName}`,
      details: { productName: savedMed.productName, batchNumber: savedMed.batchNumber },
      userRole: 'admin'
    }).catch(err => console.error('Audit log error (CREATE_MEDICINE):', err.message));

    res.status(201).json(savedMed);
  } catch (err) {
    console.error('[Error] addMedicine:', err.message);
    if (err.message && err.message.includes('is required')) {
      return res.status(400).json({ message: `Validation Error: ${err.message}` });
    }
    res.status(500).json({ message: `Server Error: ${err.message}` });
  }
};
// 4. UPDATE MEDICINE (Fixed Logic)
const updateMedicine = async (req, res) => {
  try {
    // Helper to safely convert to number, or return undefined if missing
    // (returning undefined prevents overwriting existing value with 0)
    const safeNumber = (val) => (val !== undefined && val !== '') ? Number(val) : undefined;

    let updateData = {
      ...req.body,
      // Explicitly cast numeric fields to ensure updates work
      // If a field is not sent, it remains undefined and won't delete the DB value
      mrp: safeNumber(req.body.mrp),
      sellingPrice: safeNumber(req.body.sellingPrice),
      doctorPrice: safeNumber(req.body.doctorPrice),
      costPrice: safeNumber(req.body.costPrice),
      quantity: safeNumber(req.body.quantity),
      looseQty: safeNumber(req.body.looseQty),
      packSize: safeNumber(req.body.packSize), // <--- FIX FOR PACK SIZE
      gst: safeNumber(req.body.gst),
    };

    // Remove undefined keys so we don't accidentally unset fields
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    // Handle File Upload
    if (req.file) {
      updateData.billImage = req.file.path;
    }

    const updatedMed = await Medicine.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    AuditLog.create({
      action: 'UPDATE_MEDICINE',
      entityType: 'Medicine',
      entityId: req.params.id,
      message: `Medicine updated (${updatedMed?.productName || ''})`,
      details: { productName: updatedMed?.productName, batchNumber: updatedMed?.batchNumber },
      userRole: 'admin'
    }).catch(err => console.error('Audit log error (UPDATE_MEDICINE):', err.message));

    res.json(updatedMed);
  } catch (err) {
    console.error("Update Error:", err);
    res.status(400).json({ message: err.message });
  }
};

// 5. DELETE MEDICINE
const deleteMedicine = async (req, res) => {
  try {
    await Medicine.findByIdAndDelete(req.params.id);

    AuditLog.create({
      action: 'DELETE_MEDICINE',
      entityType: 'Medicine',
      entityId: req.params.id,
      message: `Medicine deleted`,
      details: {},
      userRole: 'admin'
    }).catch(err => console.error('Audit log error (DELETE_MEDICINE):', err.message));

    res.json({ message: 'Medicine Deleted Successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 3B. ADMIN: ADD KACHI ENTRY
const addKachiEntry = async (req, res) => {
  try {
    const productName = String(req.body.productName || '').trim();
    const expiryDate = req.body.expiryDate;
    const costPrice = Number(req.body.costPrice);
    const canShowInAdminInventory = String(req.body.canShowInAdminInventory ?? 'true').toLowerCase() !== 'false';

    if (!productName) {
      return res.status(400).json({ message: 'Product Name is required' });
    }
    if (!expiryDate) {
      return res.status(400).json({ message: 'Expiry is required' });
    }
    if (!Number.isFinite(costPrice) || costPrice < 0) {
      return res.status(400).json({ message: 'Cost Price must be a valid non-negative number' });
    }

    const timeCode = Date.now().toString().slice(-8);
    const batchNumber = `KACHI-${timeCode}`;

    const newEntry = new Medicine({
      productName,
      batchNumber,
      hsnCode: '',
      mrp: costPrice,
      sellingPrice: costPrice,
      doctorPrice: costPrice,
      costPrice,
      gst: 0,
      maxDiscount: 0,
      quantity: 0,
      looseQty: 0,
      packSize: 1,
      expiryDate,
      partyName: 'Kachi Entry',
      purchaseDate: new Date(),
      billImage: req.file ? req.file.path : null,
      isKachiEntry: true,
      canShowInAdminInventory
    });

    const saved = await newEntry.save();

    AuditLog.create({
      action: 'CREATE_KACHI_ENTRY',
      entityType: 'Medicine',
      entityId: saved._id.toString(),
      message: `Kachi entry added for ${saved.productName}`,
      details: { productName: saved.productName, costPrice: saved.costPrice },
      userRole: 'admin'
    }).catch(err => console.error('Audit log error (CREATE_KACHI_ENTRY):', err.message));

    return res.status(201).json(saved);
  } catch (err) {
    console.error('[Error] addKachiEntry:', err.message);
    return res.status(500).json({ message: err.message });
  }
};

// 3C. ADMIN: LIST KACHI ENTRIES
const getKachiEntries = async (req, res) => {
  try {
    const items = await Medicine.find({ isKachiEntry: true }).sort({ createdAt: -1 });
    return res.json(items);
  } catch (err) {
    console.error('[Error] getKachiEntries:', err.message);
    return res.status(500).json({ message: err.message });
  }
};

// 6. EXPIRY ALERTS
const getExpiringMedicines = async (req, res) => {
  try {
    const userRole = req.user?.role || 'staff';
    const today = new Date();
    const futureDate = new Date();

    // 1. Get the number of days from the URL (e.g., ?days=90)
    // 2. If no days provided, DEFAULT to 90 days (3 months)
    const daysThreshold = req.query.days ? parseInt(req.query.days) : 90;

    // Add the days to the current date
    futureDate.setDate(today.getDate() + daysThreshold);

    const query = {
      expiryDate: {
        $gte: today,
        $lte: futureDate
      }
    };

    if (userRole !== 'admin') {
      query.isKachiEntry = { $ne: true };
    }

    const expiring = await Medicine.find(query);

    res.json(expiring);
  } catch (err) {
    console.error('[Error] getExpiringMedicines:', err.message);
    res.status(500).json({ message: err.message });
  }
};

// ---------------------------------------------------------
// --- SPECIAL LOGIC FOR LOOSE SALES (DOSE) ---
// ---------------------------------------------------------

// 7. SELL DOSE (Updates Stock + Creates Sale Record)
const sellLooseMedicine = async (req, res) => {
  const { items, amountCollected, customerName, reason } = req.body;

  try {
    const saleItems = []; // List to save in Sale History

    for (const item of items) {
      const med = await Medicine.findById(item.id);
      if (!med) continue;

      const needed = parseInt(item.count);
      const packSize = med.packSize || 1;

      // --- SAFE STOCK LOGIC (No negative stock) ---
      // Convert all stock to tablets for accurate comparison
      const totalTabsBefore = Math.round((med.quantity || 0) * packSize) + (med.looseQty || 0);

      if (needed > totalTabsBefore) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${med.productName}. Available: ${totalTabsBefore} tabs, Requested: ${needed} tabs`
        });
      }

      const totalTabsAfter = totalTabsBefore - needed;
      med.quantity = Math.floor(totalTabsAfter / packSize);
      med.looseQty = totalTabsAfter % packSize;

      // Fix for old data missing CP
      if (med.costPrice === undefined) med.costPrice = 0;

      await med.save();

      // Add to Report List
      saleItems.push({
        medicineId: med._id,
        name: med.productName,
        batch: med.batchNumber,
        expiry: med.expiryDate,
        quantity: needed, // Tablets
        price: 0, // Individual price 0 rakhte hain kyunki total amount manually diya hai
        total: 0
      });
    }

    // --- CREATE SALE RECORD (Taaki Report me dikhe) ---
    const newSale = new Sale({
      invoiceNo: `DOSE-${Date.now().toString().slice(-6)}`,
      customerDetails: {
        name: customerName || 'Dose Client',
        phone: '',
        doctor: reason || 'General Dose' // Reason ko Doctor field me dikhayenge
      },
      items: saleItems,
      totalAmount: amountCollected, // Manual Amount
      paymentMode: 'Cash'
    });

    await newSale.save();

    AuditLog.create({
      action: 'SELL_DOSE',
      entityType: 'Sale',
      entityId: newSale._id.toString(),
      message: `Dose sale created`,
      details: { totalItems: saleItems.length, totalAmount: amountCollected },
      userRole: 'admin'
    }).catch(err => console.error('Audit log error (SELL_DOSE):', err.message));

    res.json({ success: true, message: "Dose Sold & Recorded!" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error: " + err.message });
  }
};

// 8. QUICK SAVE (Pending List)
const addQuickEntry = async (req, res) => {
  try {
    const { amount, reason } = req.body;
    const newEntry = new PendingDose({ amountCollected: amount, reason });
    await newEntry.save();
    res.json({ success: true, message: "Saved to Pending!" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 9. GET PENDING ENTRIES
const getPendingEntries = async (req, res) => {
  try {
    const list = await PendingDose.find({ isResolved: false }).sort({ date: -1 });
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 10. RESOLVE PENDING (Stock Minus + Sale Create)
const resolvePendingEntry = async (req, res) => {
  const { id, items } = req.body;

  try {
    const pending = await PendingDose.findById(id);
    if (!pending) return res.status(404).json({ message: "Entry not found" });

    const saleItems = [];

    for (const item of items) {
      const med = await Medicine.findById(item.id);
      if (med) {
        const needed = parseInt(item.count);
        const packSize = med.packSize || 1;

        const totalTabsBefore = Math.round((med.quantity || 0) * packSize) + (med.looseQty || 0);

        if (needed > totalTabsBefore) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${med.productName}. Available: ${totalTabsBefore} tabs, Requested: ${needed} tabs`
          });
        }

        const totalTabsAfter = totalTabsBefore - needed;
        med.quantity = Math.floor(totalTabsAfter / packSize);
        med.looseQty = totalTabsAfter % packSize;

        if (med.costPrice === undefined) med.costPrice = 0;
        await med.save();

        saleItems.push({
          medicineId: med._id,
          name: med.productName,
          batch: med.batchNumber,
          quantity: needed,
          price: 0, total: 0
        });
      }
    }

    // CREATE SALE RECORD
    const newSale = new Sale({
      invoiceNo: `DOSE-${Date.now().toString().slice(-6)}`,
      customerDetails: {
        name: 'Pending Resolved',
        doctor: pending.reason
      },
      items: saleItems,
      totalAmount: pending.amountCollected,
      paymentMode: 'Cash'
    });
    await newSale.save();

    AuditLog.create({
      action: 'RESOLVE_PENDING_DOSE',
      entityType: 'PendingDose',
      entityId: id,
      message: `Pending dose resolved`,
      details: { saleId: newSale._id.toString(), amount: pending.amountCollected },
      userRole: 'admin'
    }).catch(err => console.error('Audit log error (RESOLVE_PENDING_DOSE):', err.message));

    // Delete form Pending
    await PendingDose.findByIdAndDelete(id);

    res.json({ success: true, message: "Managed Successfully!" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ADMIN: Return purchased stock to a wholesaler and retain an auditable bill record.
const createPurchaseReturn = async (req, res) => {
  try {
    const { wholesalerName, supplierBillNumber = '', returnDate, notes = '', items } = req.body;
    if (!String(wholesalerName || '').trim()) return res.status(400).json({ message: 'Wholesaler name is required' });
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ message: 'Add at least one medicine to return' });

    const seen = new Set();
    const validated = [];
    for (const item of items) {
      const medicineId = String(item.medicineId || '');
      const returnedStrips = Number(item.returnedStrips || 0);
      const returnedLoose = Number(item.returnedLoose || 0);
      if (!medicineId || seen.has(medicineId) || !Number.isInteger(returnedStrips) || !Number.isInteger(returnedLoose) || returnedStrips < 0 || returnedLoose < 0 || (!returnedStrips && !returnedLoose)) {
        return res.status(400).json({ message: 'Each return item needs a unique medicine batch and valid quantity' });
      }
      seen.add(medicineId);
      const med = await Medicine.findById(medicineId);
      if (!med || med.isKachiEntry) return res.status(404).json({ message: 'A selected medicine was not found' });
      const packSize = Number(med.packSize) || 1;
      const availableTabs = (Math.max(0, Number(med.quantity) || 0) * packSize) + Math.max(0, Number(med.looseQty) || 0);
      const returnedTabs = returnedStrips * packSize + returnedLoose;
      if (returnedTabs > availableTabs) return res.status(400).json({ message: `Insufficient stock for ${med.productName} (${med.batchNumber})` });
      validated.push({ med, returnedStrips, returnedLoose, packSize, returnedTabs, availableTabs });
    }

    let totalAmount = 0;
    const returnItems = [];
    for (const entry of validated) {
      const { med, returnedStrips, returnedLoose, packSize, returnedTabs, availableTabs } = entry;
      const remainingTabs = availableTabs - returnedTabs;
      const unitCost = Number(med.costPrice) || 0;
      const lineTotal = (returnedTabs / packSize) * unitCost;
      med.quantity = Math.floor(remainingTabs / packSize);
      med.looseQty = remainingTabs % packSize;
      await med.save();
      totalAmount += lineTotal;
      returnItems.push({ medicineId: med._id, productName: med.productName, batchNumber: med.batchNumber, expiryDate: med.expiryDate, packSize, returnedStrips, returnedLoose, unitCost, lineTotal, stockBefore: { strips: Math.floor(availableTabs / packSize), loose: availableTabs % packSize }, stockAfter: { strips: med.quantity, loose: med.looseQty } });
    }

    const purchaseReturn = await PurchaseReturn.create({
      returnNumber: `PR-${Date.now().toString().slice(-8)}`, wholesalerName: String(wholesalerName).trim(), supplierBillNumber: String(supplierBillNumber).trim(), returnDate: returnDate || new Date(), notes: String(notes).trim(), items: returnItems, totalAmount: Number(totalAmount.toFixed(2)), createdByRole: req.user?.role || 'admin'
    });
    AuditLog.create({ action: 'CREATE_PURCHASE_RETURN', entityType: 'PurchaseReturn', entityId: purchaseReturn._id.toString(), message: `Purchase return ${purchaseReturn.returnNumber} created for ${purchaseReturn.wholesalerName}`, details: { returnNumber: purchaseReturn.returnNumber, totalAmount: purchaseReturn.totalAmount, itemCount: returnItems.length }, userRole: req.user?.role || 'admin' }).catch(err => console.error('Audit log error (CREATE_PURCHASE_RETURN):', err.message));
    return res.status(201).json(purchaseReturn);
  } catch (err) {
    console.error('[Error] createPurchaseReturn:', err.message);
    return res.status(500).json({ message: 'Could not create purchase return' });
  }
};

const getPurchaseReturns = async (req, res) => {
  try { return res.json(await PurchaseReturn.find().sort({ returnDate: -1, createdAt: -1 }).limit(100)); }
  catch (err) { return res.status(500).json({ message: 'Could not load purchase return history' }); }
};

module.exports = {
  getMedicines, searchMedicines, addKachiEntry, getKachiEntries, createPurchaseReturn,
  getPurchaseReturns, addMedicine, updateMedicine, deleteMedicine, getExpiringMedicines,
  sellLooseMedicine, addQuickEntry, getPendingEntries, resolvePendingEntry
};
