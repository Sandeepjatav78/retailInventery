const Medicine = require('../models/Medicine');
const Sale = require('../models/Sale'); // <--- IMPORT SALE MODEL ZARURI HAI
const PendingDose = require('../models/PendingDose');
const AuditLog = require('../models/AuditLog');

// 1. GET ALL MEDICINES
const getMedicines = async (req, res) => {
  try {
    const meds = await Medicine.find().sort({ productName: 1 });
    res.json(meds);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// 2. SEARCH MEDICINES
const searchMedicines = async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  try {
    const meds = await Medicine.find({
      $or: [
        { productName: { $regex: q, $options: 'i' } },
        { batchNumber: { $regex: q, $options: 'i' } }
      ]
    })
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
    const safeNumber = (val) => (val === '' || val === null || val === undefined) ? 0 : Number(val);
    const medData = {
      ...req.body,
      mrp: safeNumber(req.body.mrp),
      sellingPrice: safeNumber(req.body.sellingPrice),
      costPrice: safeNumber(req.body.costPrice),
      quantity: safeNumber(req.body.quantity),
      packSize: safeNumber(req.body.packSize) || 10,
      billImage: req.file ? req.file.path : null
    };
    const newMed = new Medicine(medData);
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
    res.status(400).json({ message: err.message });
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

// 6. EXPIRY ALERTS
const getExpiringMedicines = async (req, res) => {
  try {
    const today = new Date();
    const futureDate = new Date();

    // 1. Get the number of days from the URL (e.g., ?days=90)
    // 2. If no days provided, DEFAULT to 90 days (3 months)
    const daysThreshold = req.query.days ? parseInt(req.query.days) : 90;

    // Add the days to the current date
    futureDate.setDate(today.getDate() + daysThreshold);

    const expiring = await Medicine.find({
      expiryDate: {
        $gte: today,
        $lte: futureDate
      }
    });

    res.json(expiring);
  } catch (err) {
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

module.exports = {
  getMedicines,
  searchMedicines,
  addMedicine,
  updateMedicine,
  deleteMedicine,
  getExpiringMedicines,
  sellLooseMedicine,
  addQuickEntry,
  getPendingEntries,
  resolvePendingEntry
};