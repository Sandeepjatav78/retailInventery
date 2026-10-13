const Sale = require('../models/Sale');
const Medicine = require('../models/Medicine');
const Counter = require('../models/Counter');
const AuditLog = require('../models/AuditLog');
const Credit = require('../models/Credit');
const { classifyMedicinesWithAI, SCHEDULE_CATEGORIES } = require('../utils/scheduleDetector');

// Invoice formatting configuration
const INVOICE_PREFIX = 'RP-';
const INVOICE_DIGITS = 6; // e.g. RP-2026-000001 (6 digits per year)

const normalizePhone = (phone = '') => {
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  return digits;
};

const normalizeCustomerName = (name = '') => String(name).trim();

// Bill days must be interpreted in the pharmacy's local timezone (IST, +05:30)
// no matter where the server runs (Vercel runs in UTC). Without an explicit
// offset "2026-10-24" becomes UTC midnight, so the 24th's range leaks into the
// 25th's early-morning bills (e.g. a 12:30 AM bill showing under the 24th).
const IST_OFFSET = '+05:30';
const buildDateRange = (start, end) => {
  if (!start || !end) return null;
  const startDate = new Date(`${String(start).slice(0, 10)}T00:00:00.000${IST_OFFSET}`);
  const endDate = new Date(`${String(end).slice(0, 10)}T23:59:59.999${IST_OFFSET}`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  return { startDate, endDate };
};

const buildMedicineKey = (item = {}) => {
  const medicineId = String(item.medicineId || '').trim();
  if (medicineId) return `id:${medicineId}`;

  const name = String(item.name || '').trim().toLowerCase();
  const batch = String(item.batch || '').trim().toLowerCase();
  return `name:${name}|batch:${batch}`;
};

const buildCustomerPriceMap = (sales = []) => {
  const priceMap = new Map();

  for (const sale of sales) {
    for (const item of sale.items || []) {
      const itemName = String(item.name || '').trim();
      if (!itemName || itemName === 'Medical/Dose Charge') continue;

      const key = buildMedicineKey(item);
      if (!priceMap.has(key)) {
        priceMap.set(key, {
          medicineId: item.medicineId || null,
          name: item.name || '',
          batch: item.batch || '',
          price: Number(item.price || 0),
          date: sale.date || sale.createdAt || null,
          invoiceNo: sale.invoiceNo || ''
        });
      }
    }
  }

  return Array.from(priceMap.values());
};

// --- 1. GET NEXT INVOICE ID ---
exports.getNextInvoiceNumber = async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const key = `invoice_seq_${year}`;
    let counter = await Counter.findOne({ id: key });
    let nextSeq = counter ? counter.seq + 1 : 1;
    const padded = String(nextSeq).padStart(INVOICE_DIGITS, '0');
    res.json({ success: true, nextInvoiceNo: `${INVOICE_PREFIX}${year}-${padded}` });
  } catch (err) {
    res.status(500).json({ message: "Error fetching ID", error: err.message });
  }
};

// --- 1B. GET CUSTOMER LAST PRICES ---
exports.getCustomerLastPrices = async (req, res) => {
  try {
    const phone = normalizePhone(req.query.phone || '');
    const name = normalizeCustomerName(req.query.name || '');

    if (!phone && name.length < 2) {
      return res.json({ success: true, items: [] });
    }

    const query = phone
      ? { 'customerDetails.phone': { $in: [phone, req.query.phone || ''] } }
      : { 'customerDetails.name': { $regex: `^${name}$`, $options: 'i' } };

    const sales = await Sale.find(query)
      .sort({ date: -1 })
      .select('invoiceNo customerDetails date items')
      .limit(20);

    res.json({ success: true, items: buildCustomerPriceMap(sales) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// --- 2. CREATE SALE (Fixes Invoice ID & Stock Reduction) ---
exports.createSale = async (req, res) => {
  try {
    const { items, customerDetails, totalAmount, paymentMode, isBillRequired, invoiceNo, customDate, isCredit, creditNotes } = req.body;
    const userRole = req.user?.role || 'staff';

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "No sale items provided" });
    }

    const safeNumber = (value, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const safeDateOrNull = (value) => {
      if (!value) return null;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const normalizeHsn = (value) => String(value ?? '').trim();

    const sanitizedItems = items.map((item) => ({
      ...item,
      medicineId: item?.medicineId || null,
      hsn: normalizeHsn(item?.hsn),
      expiry: safeDateOrNull(item?.expiry),
      quantity: safeNumber(item?.quantity),
      price: safeNumber(item?.price),
      mrp: safeNumber(item?.mrp),
      gst: safeNumber(item?.gst),
      discount: safeNumber(item?.discount),
      packSize: safeNumber(item?.packSize, 1),
      purchasePrice: safeNumber(item?.purchasePrice),
      total: safeNumber(item?.total)
    }));

    const customerPhone = normalizePhone(customerDetails?.phone || '');
    const customerName = normalizeCustomerName(customerDetails?.name || '');
    const customerHistoryQuery = customerPhone
      ? { 'customerDetails.phone': { $in: [customerPhone, customerDetails?.phone || ''] } }
      : (customerName.length >= 2 ? { 'customerDetails.name': { $regex: `^${customerName}$`, $options: 'i' } } : null);

    const customerPriceLookup = new Map();
    if (customerHistoryQuery) {
      const previousSales = await Sale.find(customerHistoryQuery)
        .sort({ date: -1 })
        .select('items date invoiceNo')
        .limit(20);

      for (const sale of previousSales) {
        for (const previousItem of sale.items || []) {
          const itemName = String(previousItem.name || '').trim();
          if (!itemName || itemName === 'Medical/Dose Charge') continue;

          const key = buildMedicineKey(previousItem);
          if (!customerPriceLookup.has(key)) {
            customerPriceLookup.set(key, {
              price: Number(previousItem.price || 0),
              date: sale.date || null
            });
          }
        }
      }
    }

    const enrichedItems = sanitizedItems.map((item) => {
      const lastPrice = customerPriceLookup.get(buildMedicineKey(item));
      return {
        ...item,
        customerLastPrice: lastPrice ? Number(lastPrice.price || 0) : undefined,
        customerLastPriceDate: lastPrice?.date || undefined
      };
    });

    if (userRole === 'staff') {
      const itemWithoutHsn = sanitizedItems.find((item) => {
        const isDoseLine = String(item?.name || '').trim() === 'Medical/Dose Charge';
        return !isDoseLine && !item.hsn;
      });

      if (itemWithoutHsn) {
        return res.status(400).json({
          message: `HSN is required for item: ${itemWithoutHsn.name || 'Unknown Item'}`
        });
      }
    }

    let finalInvoiceNo = invoiceNo; // Gets value if Manual Bill sends it

    // --- 🔥 INVOICE GENERATION LOGIC ---
    // If no ID provided, generate one. Only increment sequence when a bill is required/finalized.
    if (!finalInvoiceNo) {
      if (isBillRequired === true) {
        // Year-based sequential invoice for finalized bills (applies to staff & admin)
        const year = new Date().getFullYear();
        const key = `invoice_seq_${year}`;
        const counter = await Counter.findOneAndUpdate(
          { id: key },
          { $inc: { seq: 1 } },
          { new: true, upsert: true }
        );
        const seq = counter.seq || 0;
        const padded = String(seq).padStart(INVOICE_DIGITS, '0');
        finalInvoiceNo = `${INVOICE_PREFIX}${year}-${padded}`;
      } else {
        // Non-bill / quick sale: keep a time-based fallback to avoid consuming sequence
        finalInvoiceNo = `CS-${Math.floor(Date.now() / 1000)}`;
      }
    }

    // --- 🔍 STOCK & PURCHASE DATE VALIDATION ---
    const saleDate = customDate ? new Date(customDate) : new Date();

    // Collected while we already look up each medicine below, so the schedule
    // register doesn't need an extra DB pass.
    const scheduleMap = new Map();
    // medicineId -> purchase (supplier) invoice number, snapshotted onto the
    // sale so a bill can always be traced back to the stock it was billed from.
    const purchaseInvoiceMap = new Map();
    // Medicines never AI-classified before (new stock, or added pre-feature) —
    // classified for real right here, at bill-cut time, so the register is
    // always accurate. Once checked, a medicine is cached forever (fast path).
    const pendingScheduleCheck = [];

    for (const item of sanitizedItems) {
      if (!item.medicineId) continue; // Manual items not linked to stock

      const med = await Medicine.findById(item.medicineId);
      if (!med) continue; // If medicine record missing, skip stock logic

      if (med.scheduleAiChecked) {
        if (med.scheduleCategory && med.scheduleCategory !== 'None') {
          scheduleMap.set(String(item.medicineId), med.scheduleCategory);
        }
      } else {
        pendingScheduleCheck.push({ medicineId: String(item.medicineId), productName: med.productName });
      }

      // Remember which purchase invoice this stock came from so the sale bill
      // can show it (useful when an item is sold before its purchase is entered).
      if (med.purchaseInvoiceNo) purchaseInvoiceMap.set(String(item.medicineId), med.purchaseInvoiceNo);

      // 🔥 EXPIRED MEDICINE BLOCK — an item is valid through the END of its
      // expiry month, and cannot be billed after that.
      const expiry = med.expiryDate ? new Date(med.expiryDate) : null;
      if (expiry && !Number.isNaN(expiry.getTime())) {
        const expiryMonthEnd = new Date(expiry.getFullYear(), expiry.getMonth() + 1, 0, 23, 59, 59, 999);
        if (saleDate.getTime() > expiryMonthEnd.getTime()) {
          return res.status(400).json({
            message: `Item '${med.productName}' is EXPIRED (${expiry.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}) and cannot be sold.`
          });
        }
      }

      // NOTE: selling before the purchase date is intentionally allowed now —
      // the purchase invoice number is captured above for traceability.

      if (userRole === 'staff' && med.isKachiEntry) {
        return res.status(403).json({
          message: `Staff cannot bill Kachi entry item: ${med.productName}`
        });
      }

      const currentQty = med.quantity || 0; // Stored in strips (can be decimal)
      const requestedQty = Number(item.quantity) || 0; // Also in strips

      if (requestedQty > currentQty + 1e-6) {
        return res.status(400).json({
          message: `Insufficient stock for ${med.productName}. Available: ${currentQty.toFixed(2)}, Requested: ${requestedQty.toFixed(2)}`
        });
      }
    }

    // Classify any never-checked medicine in THIS bill via Gemini right now,
    // in one batched call, and cache the result on the Medicine record. Never
    // blocks/fails the sale if the AI call errors — it just retries next sale.
    if (pendingScheduleCheck.length > 0) {
      try {
        const uniqueNames = [...new Set(pendingScheduleCheck.map((p) => p.productName))];
        const aiMap = await classifyMedicinesWithAI(uniqueNames);
        const writes = pendingScheduleCheck.map((pending) => {
          const result = aiMap.get(String(pending.productName || '').trim());
          const category = result?.category || 'None';
          if (category !== 'None') scheduleMap.set(pending.medicineId, category);
          return {
            updateOne: {
              filter: { _id: pending.medicineId },
              update: { $set: { scheduleCategory: category, scheduleAiChecked: true } }
            }
          };
        });
        if (writes.length) await Medicine.bulkWrite(writes);
      } catch (scheduleErr) {
        console.error('[Warn] Schedule AI classification failed during sale (sale continues):', scheduleErr.message);
      }
    }

    // Tag each item with its drug schedule (snapshot) and flag the whole sale
    // so it surfaces in the schedule ledger.
    let hasScheduleDrug = false;
    const scheduledItems = enrichedItems.map((item) => {
      const category = item.medicineId ? scheduleMap.get(String(item.medicineId)) : undefined;
      if (category) hasScheduleDrug = true;
      const purchaseInvoiceNo = item.medicineId ? purchaseInvoiceMap.get(String(item.medicineId)) : undefined;
      return { ...item, scheduleCategory: category || 'None', purchaseInvoiceNo: purchaseInvoiceNo || item.purchaseInvoiceNo || undefined };
    });

    // 1. Create Sale Record
    const newSale = new Sale({
      invoiceNo: finalInvoiceNo,
      customerDetails: {
        name: customerName || 'Unknown',
        phone: customerPhone || String(customerDetails?.phone || '').trim(),
        doctor: String(customerDetails?.doctor || '').trim()
      },
      items: scheduledItems,
      hasScheduleDrug,
      totalAmount: safeNumber(totalAmount),
      paymentMode,
      isBillRequired: isBillRequired,
      isCredit: isCredit || false,
      creditNotes: creditNotes || '',
      createdBy: userRole || 'admin',
      date: safeDateOrNull(customDate) || new Date()
    });

    await newSale.save();

    // 🔥 HANDLE CREDIT SALES
    let creditRecord = null;
    if (isCredit && customerDetails && customerDetails.phone) {
      try {
        const normalizedPhone = normalizePhone(customerDetails.phone);

        // Find or create credit record
        let credit = await Credit.findOne({
          $or: [
            { customerPhone: normalizedPhone },
            { customerPhone: customerDetails.phone }
          ]
        });

        if (credit) {
          // Update existing credit
          credit.totalAmount += safeNumber(totalAmount);
          credit.remainingAmount += safeNumber(totalAmount);
          if (normalizedPhone) credit.customerPhone = normalizedPhone;
          credit.status = 'Active';
          credit.lastUpdated = new Date();
          credit.bills.push({
            billId: newSale._id,
            invoiceNo: finalInvoiceNo,
            billAmount: safeNumber(totalAmount),
            billDate: new Date(),
            billStatus: 'Pending'
          });
        } else {
          // Create new credit record
          credit = new Credit({
            customerName: customerDetails.name || 'Unknown',
            customerPhone: normalizedPhone || customerDetails.phone,
            customerDoctor: customerDetails.doctor || '',
            totalAmount: safeNumber(totalAmount),
            remainingAmount: safeNumber(totalAmount),
            bills: [{
              billId: newSale._id,
              invoiceNo: finalInvoiceNo,
              billAmount: safeNumber(totalAmount),
              billDate: new Date(),
              billStatus: 'Pending'
            }]
          });
        }

        await credit.save();
        creditRecord = credit;

        // Link credit to sale
        newSale.creditId = credit._id;
        await newSale.save();
      } catch (creditError) {
        console.error('Credit creation error:', creditError);
        // Don't fail the sale if credit creation fails
      }
    }

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
    for (const item of sanitizedItems) {
        if (item.medicineId) {
            await Medicine.findByIdAndUpdate(item.medicineId, {
                $inc: { quantity: -item.quantity }
            });
        }
    }

    res.status(201).json({ success: true, invoiceNo: finalInvoiceNo, sale: newSale, credit: creditRecord });

  } catch (err) {
    console.error("Sale Error:", err);
    res.status(400).json({ message: "Sale failed", error: err.message });
  }
};

// --- 3. GET REPORT (With Medicine Search Fixed) ---
exports.getAllSales = async (req, res) => {
  try {
    const { start, end, search, paymentMode } = req.query; 
    const conditions = [];
    const userRole = req.user?.role || 'staff';
    const normalizedPaymentMode = String(paymentMode || '').trim().toLowerCase();

    // --- 🔥 ROLE-BASED VISIBILITY ---
    // If staff, only show their own sales
    if (userRole === 'staff') {
      conditions.push({ createdBy: 'staff' });
    }

    // --- 🔥 GLOBAL SEARCH LOGIC ---
    if (search) {
      // Create a separate condition for search
      const searchCondition = {
        $or: [
          { invoiceNo: { $regex: search, $options: 'i' } },
          { "customerDetails.name": { $regex: search, $options: 'i' } },
          { "items.name": { $regex: search, $options: 'i' } }
        ]
      };

      conditions.push(searchCondition);
    }
    // --- 📅 DATE FILTER LOGIC ---
    else if (start && end) {
      const range = buildDateRange(start, end);
      if (range) conditions.push({ date: { $gte: range.startDate, $lte: range.endDate } });
    }

    // --- 💳 PAYMENT MODE FILTER LOGIC ---
    if (normalizedPaymentMode === 'cash') {
      conditions.push({ paymentMode: 'Cash' });
    } else if (normalizedPaymentMode === 'online') {
      conditions.push({ paymentMode: 'Online' });
    } else if (normalizedPaymentMode === 'credit') {
      conditions.push({ paymentMode: 'Credit' });
    }

    const query = conditions.length ? { $and: conditions } : {};

    // Sort by Date (Newest First)
    const sales = await Sale.find(query).sort({ date: -1 });

    // Note: totalRevenue, cashRevenue, onlineRevenue returned here 
    // are for ALL sales in the result set (which might be filtered by search).
    let totalRevenue = 0, cashRevenue = 0, onlineRevenue = 0;
    sales.forEach(s => {
      const amount = s.totalAmount || 0;
      totalRevenue += amount;
      if (s.paymentMode === 'Cash') cashRevenue += amount;
      else if (s.paymentMode === 'Online' || s.paymentMode === 'Credit') onlineRevenue += amount; 
      // Treating Credit as Online revenue in summary, or you might want to handle it separately.
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

// --- 3B. SCHEDULE DRUG LEDGER (G / H / H1 / X) ---
// Every bill that contains at least one scheduled medicine.
exports.getScheduleLedger = async (req, res) => {
  try {
    const { start, end, search, category } = req.query;
    const userRole = req.user?.role || 'staff';
    const conditions = [{ hasScheduleDrug: true }];

    // Same rule as the main sales report: staff only see bills billed as staff,
    // never admin's bills mixed in.
    if (userRole === 'staff') {
      conditions.push({ createdBy: 'staff' });
    }

    if (search) {
      conditions.push({
        $or: [
          { invoiceNo: { $regex: search, $options: 'i' } },
          { 'customerDetails.name': { $regex: search, $options: 'i' } },
          { 'items.name': { $regex: search, $options: 'i' } }
        ]
      });
    }

    if (start && end) {
      const range = buildDateRange(start, end);
      if (range) conditions.push({ date: { $gte: range.startDate, $lte: range.endDate } });
    }

    if (SCHEDULE_CATEGORIES.includes(category) && category !== 'None') {
      conditions.push({ 'items.scheduleCategory': category });
    }

    const sales = await Sale.find({ $and: conditions }).sort({ date: -1 }).limit(2000).lean();

    // Attach just the scheduled items per bill for a compact ledger view,
    // while still returning the full sale (for printing/opening the bill).
    const transactions = sales.map((sale) => ({
      ...sale,
      scheduledItems: (sale.items || []).filter((i) => i.scheduleCategory && i.scheduleCategory !== 'None')
    }));

    res.json({ success: true, transactions, total: transactions.length });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load schedule ledger', error: err.message });
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

        // 2. Deduct New Stock (and re-check each item's drug schedule for the schedule ledger)
        const updatePendingScheduleCheck = []; // items whose medicine was never AI-classified yet
        const updatedMeds = [];
        for (const item of updatedSaleData.items) {
            if (item.medicineId) {
                const med = await Medicine.findByIdAndUpdate(item.medicineId, {
                    $inc: { quantity: -item.quantity }
                }, { new: true });
                updatedMeds.push({ item, med });
                if (med && !med.scheduleAiChecked) {
                    updatePendingScheduleCheck.push({ medicineId: String(item.medicineId), productName: med.productName });
                }
            } else {
                updatedMeds.push({ item, med: null });
                item.scheduleCategory = item.scheduleCategory || 'None';
            }
        }

        // Batch-classify any never-checked medicine right now, same as on a fresh sale.
        const updateScheduleMap = new Map();
        if (updatePendingScheduleCheck.length > 0) {
            try {
                const uniqueNames = [...new Set(updatePendingScheduleCheck.map((p) => p.productName))];
                const aiMap = await classifyMedicinesWithAI(uniqueNames);
                const writes = updatePendingScheduleCheck.map((pending) => {
                    const result = aiMap.get(String(pending.productName || '').trim());
                    const category = result?.category || 'None';
                    updateScheduleMap.set(pending.medicineId, category);
                    return {
                        updateOne: {
                            filter: { _id: pending.medicineId },
                            update: { $set: { scheduleCategory: category, scheduleAiChecked: true } }
                        }
                    };
                });
                if (writes.length) await Medicine.bulkWrite(writes);
            } catch (scheduleErr) {
                console.error('[Warn] Schedule AI classification failed during sale update (update continues):', scheduleErr.message);
            }
        }

        let hasScheduleDrug = false;
        for (const { item, med } of updatedMeds) {
            if (!item.medicineId) continue;
            const category = updateScheduleMap.get(String(item.medicineId)) ?? (med?.scheduleCategory && med.scheduleCategory !== 'None' ? med.scheduleCategory : 'None');
            item.scheduleCategory = category;
            if (category !== 'None') hasScheduleDrug = true;
        }
        updatedSaleData.hasScheduleDrug = hasScheduleDrug;

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
    const { items } = req.body;
    const userRole = req.user?.role || 'staff';

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
// --- 7. AUTO BILL CUTTING ---
// Generates N random cash bills for one day, each between minAmount and
// maxAmount, from valid stock. Two steps: /auto-bill/preview builds a plan
// (nothing saved), /auto-bill/commit re-validates that plan against live stock
// and saves it with real sequential invoice numbers in time order.
const AUTO_BILL_MAX_COUNT = 200;
const AUTO_BILL_MAX_ITEMS = 6;
const AUTO_BILL_MAX_QTY_PER_LINE = 3;

const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100;
const randomInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

// Same rules a staff bill must pass, plus: only medicines already checked as
// non-scheduled (H/H1/X etc. need a prescription register, so never auto-billed).
const isAutoBillable = (med, saleDate) => {
  if (!med || med.isKachiEntry) return false;
  if (!String(med.hsnCode || '').trim()) return false;
  if (!(Number(med.sellingPrice) > 0)) return false;
  if (!med.scheduleAiChecked || (med.scheduleCategory && med.scheduleCategory !== 'None')) return false;
  const expiry = med.expiryDate ? new Date(med.expiryDate) : null;
  if (!expiry || Number.isNaN(expiry.getTime())) return false;
  const expiryMonthEnd = new Date(expiry.getFullYear(), expiry.getMonth() + 1, 0, 23, 59, 59, 999);
  return saleDate.getTime() <= expiryMonthEnd.getTime();
};

const buildAutoBillLine = (med, quantity) => {
  const price = Number(med.sellingPrice || 0);
  const mrp = Number(med.mrp || 0);
  return {
    medicineId: String(med._id),
    name: med.productName,
    hsn: String(med.hsnCode || '').trim(),
    gst: Number(med.gst || 0),
    batch: med.batchNumber || 'N/A',
    expiry: med.expiryDate,
    unit: 'pack',
    packSize: Number(med.packSize || 1),
    mrp,
    discount: mrp > 0 ? Number((((mrp - price) / mrp) * 100).toFixed(2)) : 0,
    quantity,
    price,
    purchasePrice: Number(med.costPrice || 0),
    purchaseInvoiceNo: med.purchaseInvoiceNo || undefined,
    scheduleCategory: 'None',
    total: roundMoney(price * quantity)
  };
};

// Picks random medicines until the bill lands inside [minAmount, maxAmount].
// `stockLeft` is shared across bills so one plan never oversells an item.
const buildRandomBill = (pool, stockLeft, minAmount, maxAmount) => {
  for (let attempt = 0; attempt < 40; attempt++) {
    const target = minAmount + Math.random() * (maxAmount - minAmount);
    const lines = new Map();
    let total = 0;

    for (let tries = 0; tries < 300 && lines.size < AUTO_BILL_MAX_ITEMS && total < target; tries++) {
      const med = pool[Math.floor(Math.random() * pool.length)];
      const id = String(med._id);
      if (lines.has(id)) continue;
      const price = Number(med.sellingPrice);
      const available = stockLeft.get(id) || 0;
      if (available < 1 || total + price > maxAmount) continue;

      const wanted = Math.max(1, Math.floor((target - total) / price));
      const maxQty = Math.min(available, wanted, AUTO_BILL_MAX_QTY_PER_LINE, Math.floor((maxAmount - total) / price));
      const quantity = randomInt(1, Math.max(1, maxQty));
      lines.set(id, { med, quantity });
      total += price * quantity;
    }

    total = roundMoney(total);
    if (lines.size > 0 && total >= minAmount && total <= maxAmount) {
      for (const [id, line] of lines) stockLeft.set(id, stockLeft.get(id) - line.quantity);
      return { items: [...lines.values()].map(({ med, quantity }) => buildAutoBillLine(med, quantity)), totalAmount: total };
    }
  }
  return null;
};

const parseAutoBillRequest = (body = {}) => {
  const date = String(body.date || '').slice(0, 10);
  const count = Math.floor(Number(body.count));
  const minAmount = Number(body.minAmount);
  const maxAmount = Number(body.maxAmount);
  const startTime = /^\d{2}:\d{2}$/.test(String(body.startTime || '')) ? body.startTime : '09:00';
  const endTime = /^\d{2}:\d{2}$/.test(String(body.endTime || '')) ? body.endTime : '21:00';
  const paymentMode = body.paymentMode === 'Online' ? 'Online' : 'Cash';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Valid bill date chahiye.' };
  if (!Number.isFinite(count) || count < 1 || count > AUTO_BILL_MAX_COUNT) return { error: `Bills ki ginti 1 se ${AUTO_BILL_MAX_COUNT} ke beech honi chahiye.` };
  if (!Number.isFinite(minAmount) || !Number.isFinite(maxAmount) || minAmount <= 0 || maxAmount < minAmount) return { error: 'Amount range sahi bharein (min > 0 aur max ≥ min).' };

  const windowStart = new Date(`${date}T${startTime}:00.000${IST_OFFSET}`);
  let windowEnd = new Date(`${date}T${endTime}:59.999${IST_OFFSET}`);
  const now = new Date();
  if (windowStart.getTime() > now.getTime()) return { error: 'Future date/time ke bills nahi ban sakte.' };
  if (windowEnd.getTime() > now.getTime()) windowEnd = now; // today: never stamp a bill in the future
  if (windowEnd.getTime() <= windowStart.getTime()) return { error: 'End time, start time ke baad hona chahiye.' };

  return { date, count, minAmount, maxAmount, paymentMode, windowStart, windowEnd };
};

exports.previewAutoBills = async (req, res) => {
  try {
    const params = parseAutoBillRequest(req.body);
    if (params.error) return res.status(400).json({ message: params.error });
    const { count, minAmount, maxAmount, paymentMode, windowStart, windowEnd } = params;

    const candidates = await Medicine.find({ quantity: { $gte: 1 }, sellingPrice: { $gt: 0 }, isKachiEntry: { $ne: true } }).lean();
    const pool = candidates.filter((med) => isAutoBillable(med, windowEnd));
    const skippedUnchecked = candidates.filter((med) => !med.scheduleAiChecked).length;

    if (pool.length === 0) {
      return res.status(400).json({ message: 'Auto bill ke liye koi valid stock nahi mila (HSN, expiry aur schedule check zaroori hai).', skippedUnchecked });
    }

    const stockLeft = new Map(pool.map((med) => [String(med._id), Math.floor(Number(med.quantity || 0))]));
    const bills = [];
    for (let i = 0; i < count; i++) {
      const bill = buildRandomBill(pool, stockLeft, minAmount, maxAmount);
      if (!bill) break;
      bills.push(bill);
    }

    const span = windowEnd.getTime() - windowStart.getTime();
    const times = bills.map(() => new Date(windowStart.getTime() + Math.floor(Math.random() * span))).sort((a, b) => a - b);
    bills.forEach((bill, idx) => { bill.date = times[idx]; });

    return res.json({
      success: true,
      paymentMode,
      bills,
      requested: count,
      generated: bills.length,
      grandTotal: roundMoney(bills.reduce((sum, bill) => sum + bill.totalAmount, 0)),
      eligibleItems: pool.length,
      skippedUnchecked
    });
  } catch (err) {
    console.error('[Error] previewAutoBills:', err.message);
    return res.status(500).json({ message: err.message || 'Auto bill preview nahi ban saka' });
  }
};

exports.commitAutoBills = async (req, res) => {
  try {
    const userRole = req.user?.role || 'staff';
    const paymentMode = req.body.paymentMode === 'Online' ? 'Online' : 'Cash';
    const plan = Array.isArray(req.body.bills) ? req.body.bills : [];
    if (plan.length === 0 || plan.length > AUTO_BILL_MAX_COUNT) {
      return res.status(400).json({ message: 'Save karne ke liye koi bills nahi hain.' });
    }

    const now = new Date();
    const normalizedPlan = plan.map((bill) => ({
      date: new Date(bill.date),
      items: (Array.isArray(bill.items) ? bill.items : []).map((item) => ({
        medicineId: String(item.medicineId || ''),
        quantity: Math.floor(Number(item.quantity))
      }))
    }));

    // Validate the whole plan against live stock before writing anything.
    const neededQty = new Map();
    for (const bill of normalizedPlan) {
      if (Number.isNaN(bill.date.getTime()) || bill.date.getTime() > now.getTime() + 60000) {
        return res.status(400).json({ message: 'Bill ka date/time galat hai. Preview dobara banayein.' });
      }
      if (bill.items.length === 0) return res.status(400).json({ message: 'Khali bill save nahi ho sakta.' });
      for (const item of bill.items) {
        if (!item.medicineId || !(item.quantity >= 1)) return res.status(400).json({ message: 'Bill items galat hain. Preview dobara banayein.' });
        neededQty.set(item.medicineId, (neededQty.get(item.medicineId) || 0) + item.quantity);
      }
    }

    const meds = await Medicine.find({ _id: { $in: [...neededQty.keys()] } }).lean();
    const medMap = new Map(meds.map((med) => [String(med._id), med]));
    const latestBillDate = new Date(Math.max(...normalizedPlan.map((bill) => bill.date.getTime())));
    for (const [id, qty] of neededQty) {
      const med = medMap.get(id);
      if (!med || !isAutoBillable(med, latestBillDate)) {
        return res.status(400).json({ message: `Item '${med?.productName || id}' ab auto bill ke layak nahi hai. Preview dobara banayein.` });
      }
      if (qty > Number(med.quantity || 0) + 1e-6) {
        return res.status(400).json({ message: `Stock kam hai: ${med.productName} (Available: ${Number(med.quantity || 0)}, Needed: ${qty}). Preview dobara banayein.` });
      }
    }

    // Prices always come from the DB, never from the client-side plan.
    const sortedPlan = [...normalizedPlan].sort((a, b) => a.date - b.date);
    const year = new Date().getFullYear();
    const counter = await Counter.findOneAndUpdate(
      { id: `invoice_seq_${year}` },
      { $inc: { seq: sortedPlan.length } },
      { new: true, upsert: true }
    );
    const firstSeq = (counter.seq || sortedPlan.length) - sortedPlan.length + 1;

    const sales = sortedPlan.map((bill, idx) => {
      const items = bill.items.map((item) => buildAutoBillLine(medMap.get(item.medicineId), item.quantity));
      return {
        invoiceNo: `${INVOICE_PREFIX}${year}-${String(firstSeq + idx).padStart(INVOICE_DIGITS, '0')}`,
        customerDetails: { name: 'Cash Sale', phone: '', doctor: '' },
        items,
        hasScheduleDrug: false,
        totalAmount: roundMoney(items.reduce((sum, item) => sum + item.total, 0)),
        paymentMode,
        isBillRequired: true,
        isCredit: false,
        createdBy: userRole,
        date: bill.date
      };
    });

    const saved = await Sale.insertMany(sales);
    await Medicine.bulkWrite([...neededQty].map(([id, qty]) => ({
      updateOne: { filter: { _id: id }, update: { $inc: { quantity: -qty } } }
    })));

    const grandTotal = roundMoney(sales.reduce((sum, sale) => sum + sale.totalAmount, 0));
    AuditLog.create({
      action: 'AUTO_BILL_GENERATE',
      entityType: 'Sale',
      entityId: saved[0]._id.toString(),
      message: `${saved.length} auto bills saved (${sales[0].invoiceNo} → ${sales[sales.length - 1].invoiceNo})`,
      details: { count: saved.length, grandTotal, paymentMode, firstInvoice: sales[0].invoiceNo, lastInvoice: sales[sales.length - 1].invoiceNo },
      userRole
    }).catch(err => console.error('Audit log error (AUTO_BILL_GENERATE):', err.message));

    return res.status(201).json({
      success: true,
      message: `${saved.length} bills save ho gaye (₹${grandTotal}).`,
      grandTotal,
      sales: saved.map((sale) => ({ _id: sale._id, invoiceNo: sale.invoiceNo, date: sale.date, totalAmount: sale.totalAmount, items: sale.items, paymentMode: sale.paymentMode }))
    });
  } catch (err) {
    console.error('[Error] commitAutoBills:', err.message);
    return res.status(500).json({ message: err.message || 'Auto bills save nahi ho sake' });
  }
};
