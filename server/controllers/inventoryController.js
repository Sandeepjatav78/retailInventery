const Medicine = require('../models/Medicine');
const Sale = require('../models/Sale'); // <--- IMPORT SALE MODEL ZARURI HAI
const PendingDose = require('../models/PendingDose');
const AuditLog = require('../models/AuditLog');
const PurchaseReturn = require('../models/PurchaseReturn');
const PurchaseBill = require('../models/PurchaseBill');

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


// 2.5 GET KNOWN SUPPLIERS (for autocomplete in purchase bill entry)
const getSuppliers = async (_req, res) => {
  try {
    const suppliers = await PurchaseBill.distinct('supplierName', { supplierName: { $ne: '' } });
    const extra = await Medicine.distinct('partyName', { partyName: { $exists: true, $nin: ['', null] } });
    const merged = [...new Set([...suppliers, ...extra])].filter(Boolean).sort((a, b) => a.localeCompare(b));
    res.json(merged);
  } catch (err) {
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

// ADMIN: Save one complete supplier invoice and add all of its medicines to stock.
const createPurchaseBill = async (req, res) => {
  try {
    const supplierName = String(req.body.supplierName || '').trim();
    const invoiceNumber = String(req.body.invoiceNumber || '').trim();
    const invoiceDate = req.body.invoiceDate;
    let items;
    try { items = JSON.parse(req.body.items || '[]'); } catch (_) { return res.status(400).json({ message: 'Medicine details are invalid' }); }

    if (!supplierName || !invoiceNumber || !invoiceDate) return res.status(400).json({ message: 'Supplier name, invoice number and invoice date are required' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: 'Add at least one medicine' });

    const duplicate = await PurchaseBill.findOne({ supplierName: new RegExp(`^${supplierName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), invoiceNumber });
    if (duplicate) return res.status(409).json({ message: 'This supplier invoice is already saved' });

    const number = (value, fallback = 0) => value === '' || value === null || value === undefined ? fallback : Number(value);
    const preItems = items.map((item, index) => {
      const productName = String(item.productName || '').trim();
      const batchNumber = String(item.batchNumber || '').trim();
      const expiryDate = item.expiryDate;
      const quantity = number(item.quantity);
      const freeQuantity = number(item.freeQuantity);
      const mrp = number(item.mrp);
      const rate = number(item.rate);
      const netRate = number(item.netRate, rate);
      const sellingPrice = number(item.sellingPrice, rate);
      const discount = number(item.discount);
      const gst = number(item.gst);
      if (!productName || !batchNumber || !expiryDate || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(mrp) || mrp < 0 || !Number.isFinite(rate) || rate < 0 || !Number.isFinite(netRate) || netRate < 0 || !Number.isFinite(sellingPrice) || sellingPrice < 0 || !Number.isFinite(freeQuantity) || freeQuantity < 0 || !Number.isFinite(discount) || discount < 0 || !Number.isFinite(gst) || gst < 0) {
        throw new Error(`Medicine row ${index + 1} has missing or invalid details`);
      }
      const gross = quantity * rate;
      const discountAmount = gross * (discount / 100);
      const taxableAmount = gross - discountAmount;
      return { productName, packing: String(item.packing || '').trim(), batchNumber, manufacturer: String(item.manufacturer || '').trim(), hsnCode: String(item.hsnCode || '').trim(), expiryDate, quantity, freeQuantity, mrp, rate, netRate, sellingPrice, discount, gst, gross, discountAmount, taxableAmount };
    });

    const subtotal = preItems.reduce((sum, item) => sum + item.gross, 0);
    const discountTotal = preItems.reduce((sum, item) => sum + item.discountAmount, 0);
    const taxableTotal = preItems.reduce((sum, item) => sum + item.taxableAmount, 0);
    // Extra bill discount is deducted (proportionally per item) from the taxable
    // amount BEFORE GST is computed, same as the item-level discount already is.
    const additionalDiscount = Math.max(0, Math.min(number(req.body.additionalDiscount), taxableTotal));
    const validItems = preItems.map(({ gross, taxableAmount, discountAmount, ...item }) => {
      const share = taxableTotal > 0 ? taxableAmount / taxableTotal : 0;
      const taxableAfterExtraDiscount = taxableAmount - additionalDiscount * share;
      const gstAmount = taxableAfterExtraDiscount * (item.gst / 100);
      const lineAmount = Number((taxableAmount + gstAmount).toFixed(2));
      return { ...item, amount: lineAmount, taxableAmount, discountAmount, gstAmount };
    });

    let gstTotal, roundOff, grandTotal;
    gstTotal = validItems.reduce((sum, item) => sum + item.gstAmount, 0);
    const preRoundTotal = subtotal - discountTotal - additionalDiscount + gstTotal;
    roundOff = Number((Math.round(preRoundTotal) - preRoundTotal).toFixed(2));
    grandTotal = Number((preRoundTotal + roundOff).toFixed(2));

    let rawPaymentStatus = String(req.body.paymentStatus || 'Credit').trim();
    let amountPaid = Number(req.body.amountPaid || 0);
    if (rawPaymentStatus === 'Paid') {
      amountPaid = grandTotal;
    } else if (rawPaymentStatus === 'Credit' && !req.body.amountPaid) {
      amountPaid = 0;
    }
    amountPaid = Math.min(grandTotal, Math.max(0, amountPaid));
    const balanceDue = Number(Math.max(0, grandTotal - amountPaid).toFixed(2));
    let paymentStatus = 'Credit';
    if (balanceDue <= 0) paymentStatus = 'Paid';
    else if (amountPaid > 0) paymentStatus = 'Partial';

    const paymentRemarks = String(req.body.paymentRemarks || req.body.notes || '').trim();
    const paymentHistory = [];
    if (amountPaid > 0) {
      paymentHistory.push({
        date: invoiceDate ? new Date(invoiceDate) : new Date(),
        amount: amountPaid,
        paymentMode: String(req.body.paymentMode || 'Cash'),
        remark: 'Initial bill payment'
      });
    }

    const billImagePaths = Array.isArray(req.files) ? req.files.map(f => f.path) : [];
    const primaryBillImage = billImagePaths[0] || null;

    for (const item of validItems) {
      const existing = await Medicine.findOne({ productName: { $regex: `^${item.productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }, batchNumber: { $regex: `^${item.batchNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
      const stockAdded = item.quantity + item.freeQuantity;
      const medicineData = { mrp: item.mrp, sellingPrice: item.sellingPrice, doctorPrice: item.sellingPrice, costPrice: item.netRate || item.rate, gst: item.gst, hsnCode: item.hsnCode, expiryDate: item.expiryDate, partyName: supplierName, purchaseDate: invoiceDate, billImage: primaryBillImage };
      if (existing) {
        existing.quantity = Number(existing.quantity || 0) + stockAdded;
        Object.assign(existing, medicineData);
        await existing.save();
      } else {
        await Medicine.create({ productName: item.productName, batchNumber: item.batchNumber, quantity: stockAdded, packSize: 1, ...medicineData });
      }
    }

    const bill = await PurchaseBill.create({
      supplierName,
      supplierGstin: String(req.body.supplierGstin || '').trim(),
      invoiceNumber,
      invoiceDate,
      billType: String(req.body.billType || 'Credit'),
      paymentMode: String(req.body.paymentMode || 'Credit'),
      notes: String(req.body.notes || '').trim(),
      billImage: primaryBillImage,
      billImages: billImagePaths,
      items: validItems.map(({ taxableAmount, discountAmount, gstAmount, ...item }) => item),
      subtotal: Number(subtotal.toFixed(2)),
      discountTotal: Number(discountTotal.toFixed(2)),
      additionalDiscount: Number(additionalDiscount.toFixed(2)),
      gstTotal: Number(gstTotal.toFixed(2)),
      roundOff,
      grandTotal,
      amountPaid: Number(amountPaid.toFixed(2)),
      balanceDue,
      paymentStatus,
      paymentRemarks,
      paymentHistory,
      createdBy: req.user?.role || 'admin'
    });

    AuditLog.create({ action: 'CREATE_PURCHASE_BILL', entityType: 'PurchaseBill', entityId: bill._id.toString(), message: `Purchase invoice ${invoiceNumber} saved`, details: { supplierName, invoiceNumber, itemCount: validItems.length, grandTotal, balanceDue, paymentStatus }, userRole: req.user?.role || 'admin' }).catch(err => console.error('Audit log error (CREATE_PURCHASE_BILL):', err.message));
    return res.status(201).json(bill);
  } catch (err) {
    console.error('[Error] createPurchaseBill:', err.message);
    return res.status(400).json({ message: err.message || 'Could not save purchase bill' });
  }
};

const updatePurchaseBill = async (req, res) => {
  try {
    const billId = req.params.id;
    const existingBill = await PurchaseBill.findById(billId);
    if (!existingBill) return res.status(404).json({ message: 'Purchase bill nahi mili.' });

    const supplierName = String(req.body.supplierName || '').trim();
    const invoiceNumber = String(req.body.invoiceNumber || '').trim();
    const invoiceDate = req.body.invoiceDate;
    let items;
    try { items = JSON.parse(req.body.items || '[]'); } catch (_) { return res.status(400).json({ message: 'Medicine details are invalid' }); }

    if (!supplierName || !invoiceNumber || !invoiceDate) return res.status(400).json({ message: 'Supplier name, invoice number and invoice date are required' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: 'Add at least one medicine' });

    const duplicate = await PurchaseBill.findOne({ _id: { $ne: billId }, supplierName: new RegExp(`^${supplierName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), invoiceNumber });
    if (duplicate) return res.status(409).json({ message: 'Is supplier ki ye invoice already kisi aur bill me save hai' });

    const number = (value, fallback = 0) => value === '' || value === null || value === undefined ? fallback : Number(value);
    const preItems = items.map((item, index) => {
      const productName = String(item.productName || '').trim();
      const batchNumber = String(item.batchNumber || '').trim();
      const expiryDate = item.expiryDate;
      const quantity = number(item.quantity);
      const freeQuantity = number(item.freeQuantity);
      const mrp = number(item.mrp);
      const rate = number(item.rate);
      const netRate = number(item.netRate, rate);
      const sellingPrice = number(item.sellingPrice, rate);
      const discount = number(item.discount);
      const gst = number(item.gst);
      if (!productName || !batchNumber || !expiryDate || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(mrp) || mrp < 0 || !Number.isFinite(rate) || rate < 0 || !Number.isFinite(netRate) || netRate < 0 || !Number.isFinite(sellingPrice) || sellingPrice < 0 || !Number.isFinite(freeQuantity) || freeQuantity < 0 || !Number.isFinite(discount) || discount < 0 || !Number.isFinite(gst) || gst < 0) {
        throw new Error(`Medicine row ${index + 1} has missing or invalid details`);
      }
      const gross = quantity * rate;
      const discountAmount = gross * (discount / 100);
      const taxableAmount = gross - discountAmount;
      return { productName, packing: String(item.packing || '').trim(), batchNumber, manufacturer: String(item.manufacturer || '').trim(), hsnCode: String(item.hsnCode || '').trim(), expiryDate, quantity, freeQuantity, mrp, rate, netRate, sellingPrice, discount, gst, gross, discountAmount, taxableAmount };
    });

    const subtotal = preItems.reduce((sum, item) => sum + item.gross, 0);
    const discountTotal = preItems.reduce((sum, item) => sum + item.discountAmount, 0);
    const taxableTotal = preItems.reduce((sum, item) => sum + item.taxableAmount, 0);
    // Extra bill discount is deducted (proportionally per item) from the taxable
    // amount BEFORE GST is computed, same as the item-level discount already is.
    const additionalDiscount = Math.max(0, Math.min(number(req.body.additionalDiscount), taxableTotal));
    const validItems = preItems.map(({ gross, taxableAmount, discountAmount, ...item }) => {
      const share = taxableTotal > 0 ? taxableAmount / taxableTotal : 0;
      const taxableAfterExtraDiscount = taxableAmount - additionalDiscount * share;
      const gstAmount = taxableAfterExtraDiscount * (item.gst / 100);
      const lineAmount = Number((taxableAmount + gstAmount).toFixed(2));
      return { ...item, amount: lineAmount, taxableAmount, discountAmount, gstAmount };
    });

    let gstTotal, roundOff, grandTotal;
    gstTotal = validItems.reduce((sum, item) => sum + item.gstAmount, 0);
    const preRoundTotal = subtotal - discountTotal - additionalDiscount + gstTotal;
    roundOff = Number((Math.round(preRoundTotal) - preRoundTotal).toFixed(2));
    grandTotal = Number((preRoundTotal + roundOff).toFixed(2));

    // Revert OLD stock first (so edited/deleted lines don't leave phantom stock)
    for (const oldItem of existingBill.items || []) {
      const med = await Medicine.findOne({ productName: { $regex: `^${oldItem.productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }, batchNumber: { $regex: `^${oldItem.batchNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
      if (!med) continue;
      const revertQty = Number(oldItem.quantity || 0) + Number(oldItem.freeQuantity || 0);
      med.quantity = Math.max(0, Number(med.quantity || 0) - revertQty);
      if (med.quantity === 0) await Medicine.deleteOne({ _id: med._id });
      else await med.save();
    }

    const newBillImagePaths = Array.isArray(req.files) ? req.files.map(f => f.path) : [];
    const updatedBillImages = newBillImagePaths.length > 0 ? newBillImagePaths : (existingBill.billImages && existingBill.billImages.length > 0 ? existingBill.billImages : (existingBill.billImage ? [existingBill.billImage] : []));
    const updatedPrimaryBillImage = updatedBillImages[0] || null;

    // Apply NEW stock
    for (const item of validItems) {
      const existing = await Medicine.findOne({ productName: { $regex: `^${item.productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }, batchNumber: { $regex: `^${item.batchNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
      const stockAdded = item.quantity + item.freeQuantity;
      const medicineData = { mrp: item.mrp, sellingPrice: item.sellingPrice, doctorPrice: item.sellingPrice, costPrice: item.netRate || item.rate, gst: item.gst, hsnCode: item.hsnCode, expiryDate: item.expiryDate, partyName: supplierName, purchaseDate: invoiceDate, billImage: updatedPrimaryBillImage };
      if (existing) {
        existing.quantity = Number(existing.quantity || 0) + stockAdded;
        Object.assign(existing, medicineData);
        await existing.save();
      } else {
        await Medicine.create({ productName: item.productName, batchNumber: item.batchNumber, quantity: stockAdded, packSize: 1, ...medicineData });
      }
    }

    // Keep existing payment records; recompute status from new total
    let amountPaid = Math.min(Number(existingBill.amountPaid || 0), grandTotal);
    const balanceDue = Number(Math.max(0, grandTotal - amountPaid).toFixed(2));
    let paymentStatus = 'Credit';
    if (balanceDue <= 0) paymentStatus = 'Paid';
    else if (amountPaid > 0) paymentStatus = 'Partial';

    existingBill.supplierName = supplierName;
    existingBill.supplierGstin = String(req.body.supplierGstin || '').trim();
    existingBill.invoiceNumber = invoiceNumber;
    existingBill.invoiceDate = invoiceDate;
    existingBill.billType = String(req.body.billType || 'Credit');
    existingBill.paymentMode = String(req.body.paymentMode || 'Credit');
    existingBill.notes = String(req.body.notes || '').trim();
    existingBill.billImage = updatedPrimaryBillImage;
    existingBill.billImages = updatedBillImages;
    existingBill.items = validItems.map(({ taxableAmount, discountAmount, gstAmount, ...item }) => item);
    existingBill.subtotal = Number(subtotal.toFixed(2));
    existingBill.discountTotal = Number(discountTotal.toFixed(2));
    existingBill.additionalDiscount = Number(additionalDiscount.toFixed(2));
    existingBill.gstTotal = Number(gstTotal.toFixed(2));
    existingBill.roundOff = roundOff;
    existingBill.grandTotal = grandTotal;
    existingBill.amountPaid = Number(amountPaid.toFixed(2));
    existingBill.balanceDue = balanceDue;
    existingBill.paymentStatus = paymentStatus;
    existingBill.paymentRemarks = String(req.body.paymentRemarks || req.body.notes || '').trim();
    await existingBill.save();

    AuditLog.create({ action: 'UPDATE_PURCHASE_BILL', entityType: 'PurchaseBill', entityId: existingBill._id.toString(), message: `Purchase invoice ${invoiceNumber} updated`, details: { supplierName, invoiceNumber, itemCount: validItems.length, grandTotal, balanceDue, paymentStatus }, userRole: req.user?.role || 'admin' }).catch(err => console.error('Audit log error (UPDATE_PURCHASE_BILL):', err.message));
    return res.json(existingBill);
  } catch (err) {
    console.error('[Error] updatePurchaseBill:', err.message);
    return res.status(400).json({ message: err.message || 'Could not update purchase bill' });
  }
};

const getPurchaseBills = async (req, res) => {
  try {
    const { search = '', supplier, from, to, status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (search) {
      const q = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ supplierName: q }, { invoiceNumber: q }];
    }
    if (supplier) filter.supplierName = new RegExp(`^${supplier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    if (status && status !== 'ALL' && status !== 'all') filter.paymentStatus = status;
    if (from || to) {
      filter.invoiceDate = {};
      if (from) filter.invoiceDate.$gte = new Date(from);
      if (to) filter.invoiceDate.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
    }
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const [bills, total] = await Promise.all([
      PurchaseBill.find(filter).sort({ invoiceDate: -1, createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
      PurchaseBill.countDocuments(filter)
    ]);
    const summary = bills.reduce((acc, b) => {
      acc.totalBills += 1;
      acc.totalPurchased += Number(b.grandTotal || 0);
      acc.totalPaid += Number(b.amountPaid || 0);
      acc.totalDue += Number(b.balanceDue ?? Math.max(0, (b.grandTotal || 0) - (b.amountPaid || 0)));
      return acc;
    }, { totalBills: 0, totalPurchased: 0, totalPaid: 0, totalDue: 0 });
    return res.json({ bills, summary, total, page: pageNum, limit: limitNum });
  } catch (err) {
    console.error('[Error] getPurchaseBills:', err.message);
    return res.status(500).json({ message: 'Could not load purchase bills' });
  }
};

// ADMIN: Delete a purchase bill and revert the stock it had added.
const deletePurchaseBill = async (req, res) => {
  try {
    const billId = req.params.id;
    const bill = await PurchaseBill.findById(billId);
    if (!bill) return res.status(404).json({ message: 'Purchase bill nahi mili.' });

    for (const item of bill.items || []) {
      const med = await Medicine.findOne({ productName: { $regex: `^${item.productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }, batchNumber: { $regex: `^${item.batchNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
      if (!med) continue;
      const revertQty = Number(item.quantity || 0) + Number(item.freeQuantity || 0);
      med.quantity = Math.max(0, Number(med.quantity || 0) - revertQty);
      if (med.quantity === 0) await Medicine.deleteOne({ _id: med._id });
      else await med.save();
    }

    await PurchaseBill.deleteOne({ _id: billId });

    AuditLog.create({ action: 'DELETE_PURCHASE_BILL', entityType: 'PurchaseBill', entityId: billId, message: `Purchase invoice ${bill.invoiceNumber} deleted`, details: { supplierName: bill.supplierName, invoiceNumber: bill.invoiceNumber, grandTotal: bill.grandTotal }, userRole: req.user?.role || 'admin' }).catch(err => console.error('Audit log error (DELETE_PURCHASE_BILL):', err.message));
    return res.json({ message: 'Purchase bill delete ho gayi aur stock adjust ho gaya.' });
  } catch (err) {
    console.error('[Error] deletePurchaseBill:', err.message);
    return res.status(500).json({ message: 'Bill delete nahi ho saki.' });
  }
};

// Clean & normalize items extracted by the AI scanner:
// - merge pure-FREE lines into their parent item's freeQuantity
// - merge exact duplicates (same name + batch)
// - derive rate from line amount when rate is missing
// - collect warnings for rows the user must fix manually
const cleanScannedItems = (items = []) => {
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const str = (v) => String(v ?? '').trim();
  const stripFreeWords = (name) => str(name).toLowerCase().replace(/\b(free|foc|n\.c\.?|nc|with purchase|complementary)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const similarName = (a, b) => {
    const sa = stripFreeWords(a);
    const sb = stripFreeWords(b);
    if (!sa || !sb) return false;
    return sa === sb || sa.includes(sb) || sb.includes(sa);
  };

  const rows = items.map(item => ({
    productName: str(item.productName),
    packing: str(item.packing),
    manufacturer: str(item.manufacturer),
    batchNumber: str(item.batchNumber),
    hsnCode: str(item.hsnCode),
    expiryDate: str(item.expiryDate),
    mrp: Math.max(0, num(item.mrp)),
    rate: Math.max(0, num(item.rate)),
    netRate: Math.max(0, num(item.netRate ?? item.rate)),
    sellingPrice: Math.max(0, num(item.sellingPrice)),
    discount: Math.max(0, num(item.discount)),
    gst: Math.max(0, num(item.gst)),
    quantity: Math.max(1, num(item.quantity)),
    freeQuantity: Math.max(0, num(item.freeQuantity)),
    amount: Math.max(0, num(item.amount))
  })).filter(r => r.productName);

  // 1. Merge pure-FREE lines into a matching parent item (e.g. "TAB X" then "TAB X FREE")
  const merged = [];
  for (const row of rows) {
    const isFreeLine = row.rate === 0 && row.amount === 0 && /\b(free|foc|n\.c\.?|nc)\b/.test(row.productName.toLowerCase());
    if (isFreeLine) {
      const parent = merged.find(m => m.rate > 0 && similarName(m.productName, row.productName));
      if (parent) {
        parent.freeQuantity += row.quantity;
        continue;
      }
    }
    merged.push(row);
  }

  // 2. Merge exact duplicates (same name + batch)
  const final = [];
  for (const row of merged) {
    const dup = final.find(f => f.productName.toLowerCase() === row.productName.toLowerCase() && f.batchNumber === row.batchNumber);
    if (dup) {
      dup.quantity += row.quantity;
      dup.freeQuantity += row.freeQuantity;
      dup.amount += row.amount;
    } else {
      final.push({ ...row });
    }
  }

  // 3. Fold FREE pieces into quantity (combined stock qty in form) while keeping line amount identical
  for (const row of final) {
    if (row.freeQuantity > 0) {
      const paidQty = row.quantity;
      row.quantity += row.freeQuantity;
      row.freeQuantity = 0;
      if (row.amount > 0 && row.rate > 0 && paidQty > 0) {
        const factor = (1 - row.discount / 100) * (1 + row.gst / 100);
        if (factor > 0) row.rate = Number((row.amount / (row.quantity * factor)).toFixed(2));
      }
    }
  }

  // 4. Derive rate from line amount when rate is missing
  for (const row of final) {
    if (row.rate === 0 && row.amount > 0 && row.quantity > 0) {
      const factor = (1 - row.discount / 100) * (1 + row.gst / 100);
      row.rate = factor > 0 ? Number((row.amount / (row.quantity * factor)).toFixed(2)) : 0;
    }
  }

  // 5. Warnings for rows the user must review manually
  const warnings = [];
  final.forEach((row, i) => {
    const issues = [];
    if (!row.batchNumber) issues.push('Batch number missing');
    if (!row.expiryDate) issues.push('Expiry date missing');
    if (row.rate === 0 && row.freeQuantity === 0 && row.amount === 0) issues.push('Rate missing (may be FREE item)');
    if (row.mrp === 0) issues.push('MRP missing');
    if (issues.length) warnings.push({ index: i + 1, productName: row.productName, issues });
  });

  return { items: final, warnings };
};

// AI MULTIMODAL BILL SCANNER: Parses purchase bill photos into structured JSON
const scanPurchaseBill = async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: 'GEMINI_API_KEY is not configured in server environment' });
    }

    const readFileAsBase64 = async (file) => {
      let mimeType = file.mimetype || 'image/jpeg';
      let data = '';
      if (file.buffer) {
        data = file.buffer.toString('base64');
      } else if (file.path && file.path.startsWith('http')) {
        const imgRes = await fetch(file.path);
        const arrayBuf = await imgRes.arrayBuffer();
        data = Buffer.from(arrayBuf).toString('base64');
        const contentType = imgRes.headers.get('content-type');
        if (contentType) mimeType = contentType;
      } else if (file.path) {
        const fs = require('fs');
        data = fs.readFileSync(file.path).toString('base64');
      }
      return { mimeType, data };
    };

    let pages = [];
    const bodyBase64 = req.body.imageBase64 || req.body.base64 || req.body.image;
    if (Array.isArray(req.files) && req.files.length > 0) {
      pages = await Promise.all(req.files.map(readFileAsBase64));
    } else if (bodyBase64) {
      pages = [{
        mimeType: req.body.mimeType || 'image/jpeg',
        data: bodyBase64.replace(/^data:image\/\w+;base64,/, '')
      }];
    } else if (req.file) {
      pages = [await readFileAsBase64(req.file)];
    }

    if (pages.length === 0) {
      return res.status(400).json({ message: 'Bill image (file or base64) is required for AI scanning' });
    }

    const prompt = `You are an expert OCR parser for Indian pharmacy purchase bills and GST tax invoices.
${pages.length > 1
  ? `You have been given ${pages.length} images which are MULTIPLE PAGES / PHOTOS of the SAME single invoice (e.g. a long bill photographed in parts, or a multi-page GST invoice). Treat them as one continuous document: merge every item row from every page into ONE combined "items" array (preserve the order pages were given in), and do not duplicate a row that appears on two overlapping photos. Header fields (supplier, invoice number, invoice date, GSTIN, additionalDiscount, etc.) usually appear once — take them from whichever page shows them (commonly the first page for header info, and the last page for the totals/discount section).`
  : ''}
Analyze this invoice image${pages.length > 1 ? 's' : ''} and extract all details into a strict JSON object with this format:

{
  "supplierName": "Name of supplier or vendor issuing the bill",
  "supplierGstin": "GSTIN number of the supplier",
  "invoiceNumber": "Invoice or Bill Number e.g. A001437",
  "invoiceDate": "YYYY-MM-DD date format e.g. 2026-07-24",
  "billType": "Credit or Cash or GST Invoice",
  "paymentMode": "Credit or Cash",
  "notes": "Any transport or invoice notes",
  "additionalDiscount": 0,
  "items": [
    {
      "productName": "Name of medicine / item e.g. ARISTO POVIDON 10 LOTION",
      "packing": "Pack size e.g. 100 ML, 15CAP, 15 TAB, 10 TAB",
      "manufacturer": "Mfr name e.g. ARISTO, CADILA, ELDER, ALKEM",
      "batchNumber": "Batch number e.g. PS226127",
      "expiryDate": "YYYY-MM-DD format e.g. 2028-03-31",
      "hsnCode": "6-digit HSN/SAC code e.g. 300490. If a column labelled HSN/SAC/HSN Code is present, ALWAYS extract it — never skip it. Use empty string only if truly absent.",
      "mrp": 103.95,
      "rate": 45.00,
      "netRate": "The ACTUAL per-unit price the pharmacy pays AFTER all scheme/discount is applied. If the bill shows a separate Net Rate / Net Price / Effective Rate column, use that EXACT value. If not shown, calculate it: netRate = lineAmount / quantity. For scheme items (e.g. 1+1 free) divide by TOTAL pieces received (paid + free). Never leave it blank — use rate as fallback.",
      "sellingPrice": 0,
      "discount": 0,
      "gst": 5,
      "quantity": 5.00,
      "freeQuantity": 0,
      "amount": 236.25
    }
  ]
}

QUANTITY & FREE ITEMS RULES (CRITICAL — READ CAREFULLY):
- "quantity" = ONLY the PAID quantity of that item. Never include free pieces in it.
- "freeQuantity" = pieces given FREE with the item (schemes like 1+1, 2+1, Buy 1 Get 1, BOGO, X FREE with Y).
- Scheme like "1+1", "1+1 FREE", "2+1", "BUY 1 GET 1 FREE" means one paid item plus free pieces. Split it correctly, e.g. "1+1" => quantity: 1, freeQuantity: 1. "2+1" => quantity: 2, freeQuantity: 1.
- If a whole line is FREE / no charge (marked "FREE", "FOC", "N.C.", "NC", "FREE WITH PURCHASE", or has rate blank / 0): output it as its OWN item with rate: 0, quantity = number of free pieces, freeQuantity: 0, amount: 0.
- "rate" is the per-unit charge for the item. A free line always has rate 0.
- "netRate" is the real per-unit cost paid after scheme/discount (very important). Prefer the bill's printed Net Rate column; else compute lineAmount / totalPiecesReceived.
- "amount" = final line amount EXACTLY as printed on the bill. NEVER recalculate it — trust the printed value. If no printed amount, calculate: quantity × rate × (1 − discount/100) × (1 + gst/100).
- "sellingPrice" = the price this pharmacy should sell at. If the bill does not show a selling price, use rate.

DISCOUNT EXTRACTION RULES (IMPORTANT — read carefully, this is commonly missed):
- "discount" (per item, inside "items") is the PERCENTAGE discount for that line, taken from a column labelled "Disc", "Disc%", "Sch%", "Discount %" etc. in the items table. Read the printed number exactly (e.g. column shows "10" -> discount: 10). Do NOT leave it at 0 just because it is easy to miss — scan every row's discount column carefully. Only use 0 if the bill truly has no discount column or the cell is blank/dash.
- "additionalDiscount" (top-level, NOT inside items) is a LUMP-SUM discount amount printed in the bill's TOTALS/SUMMARY section at the BOTTOM of the invoice — separate from the per-item Disc% column. Look for lines like "Discount", "Less: Discount", "Scheme Discount", "Cash Discount", "Trade Discount", "Additional Discount" near the Subtotal/Total/Grand Total area. Extract that as a positive rupee amount (e.g. if it shows "Discount: -150.00" or "(-) 150.00", output additionalDiscount: 150). If no such bottom-level discount line exists, output additionalDiscount: 0.

HSN EXTRACTION RULES (IMPORTANT):
- Look for a column with header "HSN", "HSN Code", "SAC", "HSN/SAC" in the items table.
- Each item row has its OWN hsnCode from that column — copy it exactly (usually 4 to 8 digits).
- If the item table has NO HSN column, set hsnCode to "" (empty string). Do NOT guess or make up HSN codes.
- Also extract supplier GSTIN carefully from the header.

DATE RULES:
- Always output YYYY-MM-DD.
- "3/28" or "03/2028" or "3-28" (month/year only) -> last day of that month: 2028-03-31.
- "28/3/25", "28-03-25" -> 2025-03-28. "12/27" -> 2027-12-31.
- Text dates like "MAR 28", "MARCH 2028" -> 2028-03-31.

NUMBER RULES:
- All numbers (mrp, rate, sellingPrice, discount, gst, quantity, freeQuantity, amount, additionalDiscount) must be JSON numbers, never strings.
- If a value is missing or illegible, use 0 for numbers and "" for text.

Return ONLY raw valid JSON with no markdown tags or conversational text.`;

    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey });

    const contents = [
      {
        role: 'user',
        parts: [
          ...pages.map(page => ({ inlineData: { mimeType: page.mimeType, data: page.data } })),
          { text: prompt }
        ]
      }
    ];

    const configuredModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
    const candidateModels = [configuredModel, 'gemini-flash-lite-latest', 'gemini-flash-latest'].filter((m, i, arr) => arr.indexOf(m) === i);

    let response;
    let lastError = null;
    for (const model of candidateModels) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          response = await ai.models.generateContent({ model, contents });
          lastError = null;
          break;
        } catch (err) {
          lastError = err;
          const code = err?.error?.code || err?.status || err?.code;
          const statusText = String(err?.error?.status || err?.status || err?.message || '');
          const isRetryable = code === 429 || code === 503 || code === 500 || statusText.includes('UNAVAILABLE');
          if (!isRetryable) break;
          console.warn(`[WARN] Gemini model ${model} attempt ${attempt} failed (${code}): ${err.message}`);
          await new Promise(resolve => setTimeout(resolve, attempt * 2000));
        }
      }
      if (response) break;
    }
    if (!response) {
      throw lastError || new Error('All Gemini models are currently unavailable. Please try again in a few minutes.');
    }

    let rawText = response.text || '';
    rawText = rawText.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, '$1').trim();

    let parsedData;
    try {
      parsedData = JSON.parse(rawText);
    } catch (parseErr) {
      console.error('[Error] JSON Parse error from Gemini response:', rawText);
      return res.status(500).json({ message: 'AI Scanner could not parse bill text as valid JSON. Please retry with a clearer photo.' });
    }

    // Post-process: merge free lines & duplicates, derive missing rates, flag warnings
    const cleaned = cleanScannedItems(parsedData.items);
    parsedData.items = cleaned.items;
    parsedData.warnings = cleaned.warnings;

    return res.json({ success: true, data: parsedData });

} catch (err) {
    console.error('[Error] scanPurchaseBill:', err);
    const code = err?.error?.code || err?.status || err?.code;
    const statusText = String(err?.error?.status || err?.status || err?.message || 'Unknown error');
    if (code === 404 || statusText.includes('NOT_FOUND')) {
      return res.status(500).json({ message: 'AI Scanner: Gemini model unavailable on this account. Check GEMINI_MODEL in server .env.' });
    }
    if (code === 429 || code === 503 || statusText.includes('UNAVAILABLE')) {
      return res.status(503).json({ message: 'AI Bill Scanning: Google AI service is busy right now (high demand). Please wait a moment and try again.' });
    }
    return res.status(500).json({ message: 'AI Bill Scanning failed: ' + (err.message || 'Unknown error') });
  }
};

// ADMIN: Get Wholesaler/Supplier Party Ledger summary, per-party statistics, and bills
const getSupplierLedger = async (req, res) => {
  try {
    // .lean() avoids Mongoose schema defaults (amountPaid=0, balanceDue=0, paymentStatus='Credit')
    // being applied to older bills that were saved before those fields existed.
    // Without it, legacy credit bills wrongly appear as fully paid (due = 0).
    const bills = await PurchaseBill.find().sort({ invoiceDate: -1, createdAt: -1 }).lean();

    let totalPurchased = 0;
    let totalPaid = 0;
    let totalCreditDue = 0;
    const supplierMap = {};

    bills.forEach(bill => {
      const grandTotal = Number(bill.grandTotal || 0);
      const hasPaidField = bill.amountPaid !== undefined && bill.amountPaid !== null;
      const hasDueField = bill.balanceDue !== undefined && bill.balanceDue !== null;
      const paid = hasPaidField
        ? Number(bill.amountPaid || 0)
        : (bill.paymentStatus === 'Paid' ? grandTotal : 0);
      const due = hasDueField
        ? Number(bill.balanceDue)
        : Math.max(0, grandTotal - paid);

      totalPurchased += grandTotal;
      totalPaid += paid;
      totalCreditDue += due;

      const supplier = String(bill.supplierName || 'Unknown').trim();
      if (!supplierMap[supplier]) {
        supplierMap[supplier] = {
          supplierName: supplier,
          supplierGstin: bill.supplierGstin || '',
          totalPurchased: 0,
          totalPaid: 0,
          balanceDue: 0,
          billCount: 0,
          bills: []
        };
      }

      supplierMap[supplier].totalPurchased += grandTotal;
      supplierMap[supplier].totalPaid += paid;
      supplierMap[supplier].balanceDue += due;
      supplierMap[supplier].billCount += 1;
      supplierMap[supplier].bills.push({
        ...bill,
        amountPaid: paid,
        balanceDue: due
      });
    });

    const suppliersList = Object.values(supplierMap).sort((a, b) => b.balanceDue - a.balanceDue);

    return res.json({
      summary: {
        totalPurchased: Number(totalPurchased.toFixed(2)),
        totalPaid: Number(totalPaid.toFixed(2)),
        totalCreditDue: Number(totalCreditDue.toFixed(2)),
        supplierCount: suppliersList.length
      },
      suppliers: suppliersList,
      bills
    });
  } catch (err) {
    console.error('[Error] getSupplierLedger:', err.message);
    return res.status(500).json({ message: 'Could not load supplier ledger' });
  }
};

// ADMIN: Delete an entire supplier party (all their purchase bills) from the ledger
const deleteSupplierParty = async (req, res) => {
  try {
    const partyName = decodeURIComponent(req.params.name).trim();
    if (!partyName) {
      return res.status(400).json({ message: 'Party name is required' });
    }
    const escapedName = String(partyName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameRegex = new RegExp(`^${escapedName}$`, 'i');

    const bills = await PurchaseBill.find({ supplierName: nameRegex }).lean();
    if (bills.length === 0) {
      return res.status(404).json({ message: `Party '${partyName}' ke liye koi bills nahi mile.` });
    }

    // Same due calculation as getSupplierLedger (.lean() avoids schema defaults)
    let totalDue = 0;
    bills.forEach(bill => {
      const grandTotal = Number(bill.grandTotal || 0);
      const hasPaidField = bill.amountPaid !== undefined && bill.amountPaid !== null;
      const paid = hasPaidField
        ? Number(bill.amountPaid || 0)
        : (bill.paymentStatus === 'Paid' ? grandTotal : 0);
      const due = bill.balanceDue !== undefined && bill.balanceDue !== null
        ? Number(bill.balanceDue)
        : Math.max(0, grandTotal - paid);
      totalDue += due;
    });

    if (totalDue > 0 && req.body.force !== true) {
      return res.status(400).json({
        message: `Party '${partyName}' ka ₹${totalDue.toFixed(2)} ka credit due hai. Delete confirm karne ke liye force=true bhejo.`,
        due: totalDue
      });
    }

    const result = await PurchaseBill.deleteMany({ supplierName: nameRegex });

    AuditLog.create({
      action: 'DELETE_SUPPLIER_PARTY',
      entityType: 'PurchaseBill',
      entityId: partyName,
      message: `Supplier party '${partyName}' deleted with ${result.deletedCount} bills`,
      details: { supplierName: partyName, deletedBills: result.deletedCount },
      userRole: req.user?.role || 'admin'
    }).catch(err => console.error('Audit log error (DELETE_SUPPLIER_PARTY):', err.message));

    return res.json({
      message: `Party '${partyName}' aur uske ${result.deletedCount} bills ledger se delete ho gaye.`
    });
  } catch (err) {
    console.error('[Error] deleteSupplierParty:', err.stack);
    return res.status(500).json({ message: 'Party delete nahi ho saka' });
  }
};

// ADMIN: Manually add an old purchase bill to the supplier ledger (no stock added)
const createManualSupplierBill = async (req, res) => {
  try {
    const supplierName = String(req.body.supplierName || '').trim();
    const invoiceNumber = String(req.body.invoiceNumber || '').trim();
    const invoiceDate = req.body.invoiceDate || new Date().toISOString().slice(0, 10);
    const billAmount = Number(req.body.billAmount);
    let amountPaid = Number(req.body.amountPaid || 0);

    if (!supplierName || !invoiceNumber || !Number.isFinite(billAmount) || billAmount <= 0) {
      return res.status(400).json({ message: 'Supplier name, invoice number and bill amount are required' });
    }

    const duplicate = await PurchaseBill.findOne({ supplierName: new RegExp(`^${supplierName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), invoiceNumber });
    if (duplicate) return res.status(409).json({ message: 'This supplier invoice is already saved' });

    amountPaid = Math.min(billAmount, Math.max(0, amountPaid));
    const balanceDue = Number(Math.max(0, billAmount - amountPaid).toFixed(2));
    let paymentStatus = 'Credit';
    if (balanceDue <= 0) paymentStatus = 'Paid';
    else if (amountPaid > 0) paymentStatus = 'Partial';

    const grandTotal = Number(billAmount.toFixed(2));
    const paymentMode = String(req.body.paymentMode || 'Cash').trim();
    const paymentDate = req.body.paymentDate || invoiceDate;
    const paymentProof = String(req.body.paymentProof || '').trim();
    const notes = String(req.body.notes || '').trim();

    const paymentHistory = [];
    if (amountPaid > 0) {
      paymentHistory.push({
        date: paymentDate ? new Date(paymentDate) : new Date(),
        amount: Number(amountPaid.toFixed(2)),
        paymentMode,
        remark: paymentProof ? `Manual old bill - ${paymentProof}` : 'Manual old bill - initial payment'
      });
    }

    const bill = await PurchaseBill.create({
      supplierName,
      supplierGstin: String(req.body.supplierGstin || '').trim(),
      invoiceNumber,
      invoiceDate,
      billType: String(req.body.billType || 'Credit').trim() || 'Credit',
      paymentMode,
      notes,
      billImage: null,
      items: [{
        productName: 'OPENING / MANUAL ENTRY',
        packing: '',
        batchNumber: 'MANUAL',
        manufacturer: '',
        hsnCode: '',
        expiryDate: invoiceDate,
        quantity: 1,
        freeQuantity: 0,
        mrp: grandTotal,
        rate: grandTotal,
        sellingPrice: grandTotal,
        discount: 0,
        gst: 0,
        amount: grandTotal
      }],
      subtotal: grandTotal,
      discountTotal: 0,
      gstTotal: 0,
      roundOff: 0,
      grandTotal,
      amountPaid: Number(amountPaid.toFixed(2)),
      balanceDue,
      paymentStatus,
      paymentRemarks: notes,
      paymentHistory,
      createdBy: req.user?.role || 'admin'
    });

    AuditLog.create({
      action: 'CREATE_MANUAL_SUPPLIER_BILL',
      entityType: 'PurchaseBill',
      entityId: bill._id.toString(),
      message: `Manual old bill ${invoiceNumber} (₹${grandTotal}) added for ${supplierName}`,
      details: { supplierName, invoiceNumber, grandTotal, amountPaid, balanceDue, paymentMode, paymentProof },
      userRole: req.user?.role || 'admin'
    }).catch(err => console.error('Audit log error (CREATE_MANUAL_SUPPLIER_BILL):', err.message));

    return res.status(201).json({ success: true, message: 'Old bill ledger me add ho gaya (stock add nahi hua)', bill });
  } catch (err) {
    console.error('[Error] createManualSupplierBill:', err.message);
    return res.status(500).json({ message: err.message || 'Old bill add nahi ho saka' });
  }
};

// ADMIN: Record repayment against an open purchase bill
const recordSupplierPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const paymentAmount = Number(req.body.amount || 0);
    const paymentMode = String(req.body.paymentMode || 'Cash').trim();
    const remark = String(req.body.remark || '').trim();

    if (!paymentAmount || paymentAmount <= 0) {
      return res.status(400).json({ message: 'Valid payment amount is required' });
    }

    const bill = await PurchaseBill.findById(id);
    if (!bill) {
      return res.status(404).json({ message: 'Purchase bill not found' });
    }

    // Older bills were saved before amountPaid/balanceDue/paymentStatus existed.
    // Mongoose fills schema defaults (0 / 'Credit') for those missing fields, so we must
    // detect them via $isDefault() and fall back to grandTotal for the true due amount.
    const hasStoredPaid = !bill.$isDefault('amountPaid');
    const hasStoredDue = !bill.$isDefault('balanceDue');
    const currentPaid = hasStoredPaid
      ? Number(bill.amountPaid || 0)
      : (bill.paymentStatus === 'Paid' ? bill.grandTotal : 0);
    const currentDue = hasStoredDue
      ? Number(bill.balanceDue)
      : Math.max(0, Number(bill.grandTotal || 0) - currentPaid);

    if (currentDue <= 0) {
      return res.status(400).json({ message: 'This bill is already fully paid' });
    }

    if (paymentAmount - currentDue > 0.009) {
      return res.status(400).json({ message: `Payment cannot exceed remaining due of ₹${currentDue.toFixed(2)}` });
    }

    const newPaid = Number((currentPaid + paymentAmount).toFixed(2));
    const newDue = Number(Math.max(0, bill.grandTotal - newPaid).toFixed(2));
    const newStatus = newDue <= 0 ? 'Paid' : 'Partial';

    bill.amountPaid = newPaid;
    bill.balanceDue = newDue;
    bill.paymentStatus = newStatus;
    if (remark) bill.paymentRemarks = remark;

    if (!Array.isArray(bill.paymentHistory)) bill.paymentHistory = [];
    bill.paymentHistory.push({
      date: req.body.paymentDate ? new Date(req.body.paymentDate) : new Date(),
      amount: paymentAmount,
      paymentMode,
      remark
    });

    await bill.save();

    AuditLog.create({
      action: 'RECORD_SUPPLIER_PAYMENT',
      entityType: 'PurchaseBill',
      entityId: bill._id.toString(),
      message: `Payment of ₹${paymentAmount} recorded for ${bill.supplierName} (Inv: ${bill.invoiceNumber})`,
      details: { paymentAmount, remainingDue: newDue, paymentMode },
      userRole: req.user?.role || 'admin'
    }).catch(err => console.error('Audit log error (RECORD_SUPPLIER_PAYMENT):', err.message));

    return res.json({ success: true, message: 'Payment recorded successfully', bill });
  } catch (err) {
    console.error('[Error] recordSupplierPayment:', err.message);
    return res.status(500).json({ message: 'Could not record payment' });
  }
};

module.exports = {
  getMedicines, searchMedicines, addKachiEntry, getKachiEntries, createPurchaseReturn,
  getPurchaseReturns, addMedicine, updateMedicine, deleteMedicine, getExpiringMedicines,
  sellLooseMedicine, addQuickEntry, getPendingEntries, resolvePendingEntry, createPurchaseBill,
  getPurchaseBills, scanPurchaseBill, getSuppliers, getSupplierLedger, deleteSupplierParty, createManualSupplierBill, recordSupplierPayment, updatePurchaseBill, deletePurchaseBill
};
