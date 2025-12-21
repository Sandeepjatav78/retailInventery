// POST /api/sales/new
const createSale = async (req, res) => {
  const { items, totalAmount, paymentMode } = req.body;
  
  // Start a MongoDB session for transaction (safety mechanism)
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Create the Sale Record
    const newSale = new Sale({ items, totalAmount, paymentMode });
    await newSale.save({ session });

    // 2. Deduct Inventory for each item
    for (const item of items) {
      await Medicine.findByIdAndUpdate(
        item.medicineId, 
        { $inc: { quantity: -item.quantity } }, // Decrement
        { session }
      );
    }

    await session.commitTransaction();
    res.status(201).json(newSale);
  } catch (err) {
    await session.abortTransaction();
    res.status(400).json({ message: "Sale failed", error: err.message });
  } finally {
    session.endSession();
  }
};