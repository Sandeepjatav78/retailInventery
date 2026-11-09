// ONE-TIME price update. Sets every medicine's prices from its cost price:
//   sellingPrice = cost + 3-9% (percent picked per medicine name), rounded to whole rupees
//   doctorPrice  = cost + 25%, rounded to whole rupees
// Neither price may exceed MRP. Old prices are backed up before writing.
// Remove this file and its routes in adminRoutes.js once the update is confirmed.
const crypto = require('crypto');
const mongoose = require('mongoose');
const Medicine = require('../models/Medicine');
const SystemConfig = require('../models/SystemConfig');
const AuditLog = require('../models/AuditLog');

const MARKER_KEY = 'REPRICE_ONCE_2026_11';
const BACKUP_COLLECTION = 'medicine_price_backup_2026_11';
const CONFIRM_APPLY = 'APPLY_PRICE_UPDATE';
const CONFIRM_UNDO = 'UNDO_PRICE_UPDATE';
const STALE_RUN_MS = 5 * 60 * 1000;
const BATCH_SIZE = 500;
const DOCTOR_PERCENT = 25;

// Derived from the name so preview and apply agree, and all batches of a medicine match.
const percentForName = (name) => {
  const normalized = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const hash = crypto.createHash('sha256').update(normalized).digest();
  return 3 + (hash.readUInt32BE(0) % 7);
};

// toFixed removes float noise, so 104.5 can't arrive as 104.49999 and round down.
const roundRupee = (value) => Math.round(Number(value.toFixed(6)));

const priceFromCost = (cost, percent, mrp) => {
  const price = roundRupee(cost * (1 + percent / 100));
  const capped = mrp > 0 && price > mrp;
  return { price: capped ? Math.floor(mrp) : price, capped };
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
    willChange: 0,
    alreadyCorrect: 0,
    skippedNoCostPrice: 0,
    skippedPriceBelowOneRupee: 0,
    sellingCappedAtMrp: 0,
    doctorCappedAtMrp: 0,
    sellingBelowCost: 0,
    noMrp: 0,
    kachiEntries: 0,
    outOfStockIncluded: 0,
  };
  const rows = [];
  const skipped = [];
  const belowCost = [];

  for (const med of medicines) {
    const plan = planMedicine(med);
    const row = {
      _id: med._id,
      productName: med.productName,
      batchNumber: med.batchNumber,
      mrp: med.mrp,
      costPrice: med.costPrice,
      gst: med.gst,
    };

    if (plan.skip) {
      if (plan.skip === 'noCostPrice') summary.skippedNoCostPrice += 1;
      else summary.skippedPriceBelowOneRupee += 1;
      skipped.push({ ...row, reason: plan.skip });
      continue;
    }

    if (med.isKachiEntry) summary.kachiEntries += 1;
    if (!(Number(med.quantity) > 0)) summary.outOfStockIncluded += 1;
    if (plan.cappedAtMrp) summary.sellingCappedAtMrp += 1;
    if (plan.doctorCappedAtMrp) summary.doctorCappedAtMrp += 1;
    if (plan.noMrp) summary.noMrp += 1;

    const fullRow = {
      ...row,
      percent: plan.percent,
      oldSellingPrice: med.sellingPrice,
      newSellingPrice: plan.sellingPrice,
      oldDoctorPrice: med.doctorPrice,
      newDoctorPrice: plan.doctorPrice,
    };
    if (plan.belowCost) {
      summary.sellingBelowCost += 1;
      belowCost.push(fullRow);
    }

    if (med.sellingPrice === plan.sellingPrice && med.doctorPrice === plan.doctorPrice) {
      summary.alreadyCorrect += 1;
      continue;
    }
    summary.willChange += 1;
    rows.push(fullRow);
  }

  return { summary, rows, skipped, belowCost };
};

const loadMedicines = () => Medicine.find({})
  .select('productName batchNumber mrp sellingPrice doctorPrice costPrice gst quantity isKachiEntry')
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
    const { summary, rows, skipped, belowCost } = buildPlan(medicines);
    return res.json({
      status: marker?.value?.status || 'not_run',
      summary,
      sample: rows.slice(0, 30),
      belowCost,
      skipped,
    });
  } catch (err) {
    console.error('[Error] previewReprice:', err.message);
    return res.status(500).json({ message: err.message });
  }
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

    const medicines = await loadMedicines();
    const { summary, rows } = buildPlan(medicines);

    // On a retry, existing backup rows hold the true originals, so duplicates are ignored.
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

    let modified = 0;
    await inBatches(rows, async (batch) => {
      const result = await Medicine.bulkWrite(batch.map((row) => ({
        updateOne: {
          filter: { _id: row._id },
          update: { $set: { sellingPrice: row.newSellingPrice, doctorPrice: row.newDoctorPrice } },
        },
      })), { ordered: false });
      modified += result.modifiedCount;
    });

    await setMarkerStatus('done', { 'value.modified': modified, 'value.summary': summary });
    await AuditLog.create({
      action: 'REPRICE_ONCE',
      entityType: 'Medicine',
      entityId: 'bulk',
      message: `${modified} medicines repriced from cost price`,
      details: { summary },
      userRole: req.user?.role || 'admin',
    }).catch((err) => console.error('Audit log error (REPRICE_ONCE):', err.message));

    return res.json({ success: true, modified, summary });
  } catch (err) {
    console.error('[Error] applyReprice:', err.message);
    if (claimed) {
      await setMarkerStatus('failed', { 'value.error': err.message })
        .catch((markerErr) => console.error('Marker update failed:', markerErr.message));
    }
    return res.status(500).json({ message: `Update poora nahi hua, dobara chala sakte ho: ${err.message}` });
  }
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
      const backups = await mongoose.connection.collection(BACKUP_COLLECTION).find({}).toArray();
      let restored = 0;
      await inBatches(backups, async (batch) => {
        const result = await Medicine.bulkWrite(batch.map((backup) => ({
          updateOne: {
            filter: { _id: backup._id },
            update: { $set: { sellingPrice: backup.sellingPrice, doctorPrice: backup.doctorPrice } },
          },
        })), { ordered: false });
        restored += result.modifiedCount;
      });

      await setMarkerStatus('undone', { 'value.restored': restored });
      await AuditLog.create({
        action: 'REPRICE_ONCE_UNDO',
        entityType: 'Medicine',
        entityId: 'bulk',
        message: `${restored} medicines restored to old prices`,
        details: { backups: backups.length, restored },
        userRole: req.user?.role || 'admin',
      }).catch((err) => console.error('Audit log error (REPRICE_ONCE_UNDO):', err.message));

      return res.json({ success: true, restored });
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

module.exports = { previewReprice, applyReprice, undoReprice, planMedicine, percentForName };
