// GET /api/inventory/expiry-alert
const getExpiringMedicines = async (req, res) => {
  try {
    const today = new Date();
    const nextMonth = new Date();
    nextMonth.setDate(today.getDate() + 30); // 30 days from now

    // Find medicines expiring between NOW and 30 Days later
    const expiring = await Medicine.find({
      expiryDate: { 
        $gte: today, 
        $lte: nextMonth 
      }
    });
    res.json(expiring);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};