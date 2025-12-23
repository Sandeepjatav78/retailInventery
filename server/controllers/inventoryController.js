const Medicine = require('../models/Medicine');

// 1. GET ALL MEDICINES (Sorted by Name)
const getMedicines = async (req, res) => {
  try {
    const meds = await Medicine.find().sort({ productName: 1 });
    res.json(meds);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 2. SEARCH MEDICINES (Name, Batch, or Party)
const searchMedicines = async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  try {
    const meds = await Medicine.find({
      $or: [
        { productName: { $regex: q, $options: 'i' } },
        { batchNumber: { $regex: q, $options: 'i' } },
        { partyName: { $regex: q, $options: 'i' } }
      ],
      quantity: { $gt: 0 } // Only show in-stock items for sale
    });
    res.json(meds);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 3. ADD NEW STOCK (With Bill Image & GST)
const addMedicine = async (req, res) => {
  try {
    const medData = {
      ...req.body,
      // Cloudinary gives the URL in req.file.path
      billImage: req.file ? req.file.path : null 
    };
    
    const newMed = new Medicine(medData);
    const savedMed = await newMed.save();
    res.status(201).json(savedMed);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// 4. UPDATE MEDICINE (Edit Price/Qty)
const updateMedicine = async (req, res) => {
  try {
    const updatedMed = await Medicine.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { new: true }
    );
    res.json(updatedMed);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// 5. EXPIRY ALERTS (Next 30 Days)
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

// Export all functions
module.exports = {
  getMedicines,
  searchMedicines,
  addMedicine,
  updateMedicine,
  getExpiringMedicines
};