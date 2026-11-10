// ONE-TIME price update (v2). For every medicine that has a cost price:
//   1. old prices are backed up
//   2. sellingPrice is reset to 0
//   3. sellingPrice = cost + random 4-10%, doctorPrice = cost + 25%, both rounded to whole rupees
// Neither price may exceed MRP. Medicines without a cost price are left untouched and listed in preview,
// because zeroing them would leave them selling for free.
// Remove this file and its routes in adminRoutes.js once the update is confirmed.
const crypto = require('crypto');
const mongoose = require('mongoose');
const Medicine = require('../models/Medicine');
const SystemConfig = require('../models/SystemConfig');
const AuditLog = require('../models/AuditLog');

const MARKER_KEY = 'REPRICE_ONCE_2026_11_V2';
const BACKUP_COLLECTION = 'medicine_price_backup_2026_11_v2';
const CONFIRM_APPLY = 'APPLY_PRICE_UPDATE';
const CONFIRM_UNDO = 'UNDO_PRICE_UPDATE';
const STALE_RUN_MS = 5 * 60 * 1000;
const BATCH_SIZE = 500;
const MIN_PERCENT = 4;
const MAX_PERCENT = 10;
const DOCTOR_PERCENT = 25;
const RANDOM_SALT = 'reprice-v2';

// Random-looking percent per medicine name. Seeded from the name so preview shows exactly what apply
// will write, and all batches of the same medicine get the same price.
const percentForName = (name) => {
  const normalized = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const hash = crypto.createHash('sha256').update(`${RANDOM_SALT}:${normalized}`).digest();
  return MIN_PERCENT + (hash.readUInt32BE(0) % (MAX_PERCENT - MIN_PERCENT + 1));
};

// toFixed removes float noise, so 104.5 can't arrive as 104.49999 and round down.
const roundRupee = (value) => Math.round(Number(value.toFixed(6)));

// Rounded to whole rupees, but rounding never drops the price below cost (cost 2.35 -> 3, not 2).
// Capped at MRP; if MRP rounded down would fall below cost, the exact MRP is used instead.
const priceFromCost = (cost, percent, mrp) => {
  const price = Math.max(roundRupee(cost * (1 + percent / 100)), Math.ceil(Number(cost.toFixed(6))));
  if (!(mrp > 0) || price <= mrp) return { price, capped: false };
  // Whole rupees, never above MRP — even when cost is higher than MRP.
  const flooredMrp = Math.floor(mrp);
  return { price: flooredMrp >= 1 ? flooredMrp : mrp, capped: true };
};

const planMedicine = (med) => {
  const cost = Number(med.costPrice);
  const mrp = Number(med.mrp);
  if (!(cost > 0)) return { skip: 'noCostPrice' };

  const percent = percentForName(med.productName);
  const selling = priceFromCost(cost, percent, mrp);
  const doctor = priceFromCost(cost, DOCTOR_PERCENT, mrp);
  if (selling.price < 1 || doctor.price < 1) return { skip: 'priceBelowOneRupee' };

  return {
    percent,
    sellingPrice: selling.price,
    doctorPrice: doctor.price,
    cappedAtMrp: selling.capped,
    doctorCappedAtMrp: doctor.capped,
    belowCost: selling.price < cost,
    noMrp: !(mrp > 0),
  };
};

const buildPlan = (medicines) => {
  const summary = {
    total: medicines.length,
    willUpdate: 0,
    skippedNoCostPrice: 0,
    skippedPriceBelowOneRupee: 0,
    sellingCappedAtMrp: 0,
    doctorCappedAtMrp: 0,
    sellingBelowCost: 0,
    noMrp: 0,
    kachiEntries: 0,
    outOfStockIncluded: 0,
    percentSpread: {},
  };
  const rows = [];
  const skipped = [];
  const capped = [];
  const belowCost = [];

  for (const med of medicines) {
    const plan = planMedicine(med);
    const row = {
      _id: med._id,
      productName: med.productName,
      batchNumber: med.batchNumber,
      mrp: med.mrp,
      costPrice: med.costPrice,
    };

    if (plan.skip) {
      if (plan.skip === 'noCostPrice') summary.skippedNoCostPrice += 1;
      else summary.skippedPriceBelowOneRupee += 1;
      skipped.push({ ...row, sellingPrice: med.sellingPrice, reason: plan.skip });
      continue;
    }

    if (med.isKachiEntry) summary.kachiEntries += 1;
    if (!(Number(med.quantity) > 0)) summary.outOfStockIncluded += 1;
    if (plan.doctorCappedAtMrp) summary.doctorCappedAtMrp += 1;
    if (plan.noMrp) summary.noMrp += 1;
    summary.percentSpread[plan.percent] = (summary.percentSpread[plan.percent] || 0) + 1;

    const fullRow = {
      ...row,
      percent: plan.percent,
      oldSellingPrice: med.sellingPrice,
      newSellingPrice: plan.sellingPrice,
      oldDoctorPrice: med.doctorPrice,
      newDoctorPrice: plan.doctorPrice,
    };
    if (plan.cappedAtMrp) {
      summary.sellingCappedAtMrp += 1;
      capped.push(fullRow);
    }
    if (plan.belowCost) {
      summary.sellingBelowCost += 1;
      belowCost.push(fullRow);
    }

    // Every planned medicine is written, even if its price happens to match already.
    summary.willUpdate += 1;
    rows.push(fullRow);
  }

  return { summary, rows, skipped, capped, belowCost };
};

const loadMedicines = () => Medicine.find({})
  .select('productName batchNumber mrp sellingPrice doctorPrice costPrice quantity isKachiEntry')
  .lean();

const inBatches = async (items, handler) => {
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    await handler(items.slice(i, i + BATCH_SIZE));
  }
};

const getMarker = () => SystemConfig.findOne({ key: MARKER_KEY }).lean();

const setMarkerStatus = (status, extra = {}) => SystemConfig.updateOne(
  { key: MARKER_KEY },
  { $set: { 'value.status': status, 'value.updatedAt': new Date(), ...extra }, updatedAt: new Date() }
);

// Only one run can hold the marker. A failed run, or one the platform killed mid-way, may retry.
const claimRun = async () => {
  await SystemConfig.init();
  const now = new Date();
  try {
    await SystemConfig.create({ key: MARKER_KEY, value: { status: 'running', startedAt: now } });
    return true;
  } catch (err) {
    if (err.code !== 11000) throw err;
  }
  const retried = await SystemConfig.findOneAndUpdate(
    {
      key: MARKER_KEY,
      $or: [
        { 'value.status': 'failed' },
        { 'value.status': 'running', 'value.startedAt': { $lt: new Date(now.getTime() - STALE_RUN_MS) } },
      ],
    },
    { $set: { 'value.status': 'running', 'value.startedAt': now, updatedAt: now } }
  );
  return Boolean(retried);
};

const previewReprice = async (req, res) => {
  try {
    const [medicines, marker] = await Promise.all([loadMedicines(), getMarker()]);
    const { summary, rows, skipped, capped, belowCost } = buildPlan(medicines);
    return res.json({
      status: marker?.value?.status || 'not_run',
      summary,
      sample: rows.slice(0, 30),
      capped,
      belowCost,
      skipped,
    });
  } catch (err) {
    console.error('[Error] previewReprice:', err.message);
    return res.status(500).json({ message: err.message });
  }
};

const runReprice = async ({ userRole } = {}) => {
  const medicines = await loadMedicines();
  const { summary, rows } = buildPlan(medicines);

  // Backup comes first. On a retry, existing backup rows hold the true originals, so duplicates are ignored.
  const backups = medicines.map((med) => ({
    _id: med._id,
    productName: med.productName,
    batchNumber: med.batchNumber,
    sellingPrice: med.sellingPrice,
    doctorPrice: med.doctorPrice,
    backedUpAt: new Date(),
  }));
  const backupCollection = mongoose.connection.collection(BACKUP_COLLECTION);
  await inBatches(backups, async (batch) => {
    try {
      await backupCollection.insertMany(batch, { ordered: false });
    } catch (err) {
      const onlyDuplicates = err.code === 11000
        && (err.writeErrors || []).every((writeError) => writeError.code === 11000);
      if (!onlyDuplicates) throw err;
    }
  });

  // Step 1: reset selling price to 0 for every medicine that is about to be repriced.
  const ids = rows.map((row) => row._id);
  const zeroed = await Medicine.updateMany({ _id: { $in: ids } }, { $set: { sellingPrice: 0 } });

  // Step 2: write the new prices.
  let updated = 0;
  await inBatches(rows, async (batch) => {
    const result = await Medicine.bulkWrite(batch.map((row) => ({
      updateOne: {
        filter: { _id: row._id },
        update: { $set: { sellingPrice: row.newSellingPrice, doctorPrice: row.newDoctorPrice } },
      },
    })), { ordered: false });
    updated += result.matchedCount;
  });

  await setMarkerStatus('done', { 'value.zeroed': zeroed.matchedCount, 'value.updated': updated, 'value.summary': summary });
  await AuditLog.create({
    action: 'REPRICE_ONCE_V2',
    entityType: 'Medicine',
    entityId: 'bulk',
    message: `${updated} medicines reset to 0 and repriced: selling cost+${MIN_PERCENT}-${MAX_PERCENT}%, doctor cost+${DOCTOR_PERCENT}%`,
    details: { summary },
    userRole: userRole || 'admin',
  }).catch((err) => console.error('Audit log error (REPRICE_ONCE_V2):', err.message));

  return { zeroed: zeroed.matchedCount, updated, summary };
};

const applyReprice = async (req, res) => {
  if (req.body?.confirm !== CONFIRM_APPLY) {
    return res.status(400).json({ message: `Body me confirm: "${CONFIRM_APPLY}" bhejo` });
  }

  let claimed = false;
  try {
    claimed = await claimRun();
    if (!claimed) {
      const marker = await getMarker();
      return res.status(409).json({ message: 'Price update pehle hi chal chuka hai', status: marker?.value?.status });
    }
    const result = await runReprice({ userRole: req.user?.role });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Error] applyReprice:', err.message);
    if (claimed) {
      await setMarkerStatus('failed', { 'value.error': err.message })
        .catch((markerErr) => console.error('Marker update failed:', markerErr.message));
    }
    return res.status(500).json({ message: `Update poora nahi hua, dobara chala sakte ho: ${err.message}` });
  }
};

const runUndo = async ({ userRole } = {}) => {
  const backups = await mongoose.connection.collection(BACKUP_COLLECTION).find({}).toArray();
  let restored = 0;
  await inBatches(backups, async (batch) => {
    const result = await Medicine.bulkWrite(batch.map((backup) => ({
      updateOne: {
        filter: { _id: backup._id },
        update: { $set: { sellingPrice: backup.sellingPrice, doctorPrice: backup.doctorPrice } },
      },
    })), { ordered: false });
    restored += result.matchedCount;
  });

  await setMarkerStatus('undone', { 'value.restored': restored });
  await AuditLog.create({
    action: 'REPRICE_ONCE_V2_UNDO',
    entityType: 'Medicine',
    entityId: 'bulk',
    message: `${restored} medicines restored to old prices`,
    details: { backups: backups.length, restored },
    userRole: userRole || 'admin',
  }).catch((err) => console.error('Audit log error (REPRICE_ONCE_V2_UNDO):', err.message));

  return { restored };
};

const undoReprice = async (req, res) => {
  if (req.body?.confirm !== CONFIRM_UNDO) {
    return res.status(400).json({ message: `Body me confirm: "${CONFIRM_UNDO}" bhejo` });
  }

  try {
    const claimed = await SystemConfig.findOneAndUpdate(
      { key: MARKER_KEY, 'value.status': { $in: ['done', 'failed', 'undo_failed'] } },
      { $set: { 'value.status': 'undoing', updatedAt: new Date() } }
    );
    if (!claimed) {
      const marker = await getMarker();
      return res.status(409).json({ message: 'Undo karne ke liye kuch nahi hai', status: marker?.value?.status || 'not_run' });
    }

    try {
      const result = await runUndo({ userRole: req.user?.role });
      return res.json({ success: true, ...result });
    } catch (err) {
      await setMarkerStatus('undo_failed', { 'value.error': err.message })
        .catch((markerErr) => console.error('Marker update failed:', markerErr.message));
      throw err;
    }
  } catch (err) {
    console.error('[Error] undoReprice:', err.message);
    return res.status(500).json({ message: err.message });
  }
};

module.exports = {
  previewReprice, applyReprice, undoReprice,
  buildPlan, loadMedicines, claimRun, getMarker, setMarkerStatus, runReprice, runUndo,
  planMedicine, percentForName, MARKER_KEY,
};
