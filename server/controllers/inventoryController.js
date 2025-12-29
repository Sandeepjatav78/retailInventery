const Medicine = require('../models/Medicine');
const Sale = require('../models/Sale'); // <--- IMPORT SALE MODEL ZARURI HAI
const PendingDose = require('../models/PendingDose');

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
    });
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
    res.status(201).json(savedMed);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// 4. UPDATE MEDICINE (With Bill Upload Support)
const updateMedicine = async (req, res) => {
  try {
    // 1. Purana data copy kar lo
    let updateData = { ...req.body };

    // 2. Agar nayi file (Bill) aayi hai, to uska link add karo
    if (req.file) {
      updateData.billImage = req.file.path;
    }

    // 3. Database me update karo
    const updatedMed = await Medicine.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true } // Taaki updated data wapas mile
    );

    res.json(updatedMed);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// 5. DELETE MEDICINE
const deleteMedicine = async (req, res) => {
  try {
    await Medicine.findByIdAndDelete(req.params.id);
    res.json({ message: 'Medicine Deleted Successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 6. EXPIRY ALERTS
const getExpiringMedicines = async (req, res) => {
  try {
    const today = new Date();
    const nextMonth = new Date();
    nextMonth.setDate(today.getDate() + 30);
    const expiring = await Medicine.find({
      expiryDate: { $gte: today, $lte: nextMonth }
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

      // --- STOCK LOGIC (Loose vs Strip) ---
      if (med.looseQty >= needed) {
        med.looseQty -= needed;
      } else {
        const remainingNeed = needed - med.looseQty;
        const stripsToOpen = Math.ceil(remainingNeed / med.packSize);

        if (med.quantity >= stripsToOpen) {
          med.quantity -= stripsToOpen; // Sealed strip kam karo
          med.looseQty += (stripsToOpen * med.packSize); // Loose me add karo
          med.looseQty -= needed; // Ab customer ko de do
        } else {
          // Agar sealed bhi nahi hai, to force minus kar do (negative loose allow kar rahe hai temporary)
          med.looseQty -= needed;
        }
      }

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
        // Same Logic as Sell Loose
        if (med.looseQty >= needed) {
          med.looseQty -= needed;
        } else {
          const remainingNeed = needed - med.looseQty;
          const stripsToOpen = Math.ceil(remainingNeed / med.packSize);
          if (med.quantity >= stripsToOpen) {
            med.quantity -= stripsToOpen;
            med.looseQty += (stripsToOpen * med.packSize);
            med.looseQty -= needed;
          } else { med.looseQty -= needed; }
        }
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