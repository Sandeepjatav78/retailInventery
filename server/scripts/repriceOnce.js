// One-time price update from the command line (same logic as /admin/reprice-once/*).
//
//   cd server
//   MONGODB_URI="<production uri>" node scripts/repriceOnce.js preview
//   MONGODB_URI="<production uri>" node scripts/repriceOnce.js apply --yes
//   MONGODB_URI="<production uri>" node scripts/repriceOnce.js undo --yes
//
// Options:
//   --env <file>   read MONGODB_URI from this env file instead (default: server/.env)
//   --db <name>    database name, if the URI does not include one (e.g. --db dav_pharma)
//   --csv <file>   preview: also write the full old -> new price list as CSV
//
// Remove this file together with controllers/repriceController.js once the update is confirmed.
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const mode = args[0];
const option = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const confirmed = args.includes('--yes');

if (!['preview', 'apply', 'undo'].includes(mode)) {
  console.log('Usage: node scripts/repriceOnce.js <preview|apply|undo> [--yes] [--env file] [--db name] [--csv file]');
  process.exit(1);
}

const envFile = option('--env');
if (envFile || !process.env.MONGODB_URI) {
  require('dotenv').config({ path: envFile || path.join(__dirname, '..', '.env'), quiet: true });
}
if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI nahi mila. MONGODB_URI="..." lagao ya --env <file> do.');
  process.exit(1);
}

const mongoose = require('mongoose');
const Medicine = require('../models/Medicine');
const reprice = require('../controllers/repriceController');

const csvCell = (value) => {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const printRow = (row) => console.log(
  `  ${String(row.productName).slice(0, 30).padEnd(30)} cost ${String(row.costPrice).padStart(8)}  mrp ${String(row.mrp).padStart(8)}`
  + `  | selling ${String(row.oldSellingPrice).padStart(8)} -> ${String(row.newSellingPrice).padStart(7)} (+${row.percent}%)`
  + `  | doctor ${String(row.oldDoctorPrice).padStart(8)} -> ${row.newDoctorPrice}`
);

const main = async () => {
  const dbName = option('--db');
  await mongoose.connect(process.env.MONGODB_URI, dbName ? { dbName } : {});
  const host = mongoose.connection.host;
  const count = await Medicine.estimatedDocumentCount();
  const marker = await reprice.getMarker();
  console.log(`Connected: ${host} / database "${mongoose.connection.name}" — ${count} medicines, status: ${marker?.value?.status || 'not_run'}`);

  if (count === 0) {
    console.error('Is database me koi medicine nahi hai. Galat database? --db <name> se sahi naam do.');
    return 1;
  }

  if (mode === 'preview') {
    const { summary, rows, skipped, capped, belowCost } = reprice.buildPlan(await reprice.loadMedicines());
    console.log('\nSummary:', JSON.stringify(summary, null, 2));
    console.log('\nSample (first 20):');
    rows.slice(0, 20).forEach(printRow);
    if (capped.length) {
      console.log(`\nSelling price capped at MRP (${capped.length}):`);
      capped.forEach(printRow);
    }
    if (belowCost.length) {
      console.log(`\nStill below cost — cost is higher than MRP, check these entries (${belowCost.length}):`);
      belowCost.forEach(printRow);
    }
    if (skipped.length) {
      console.log(`\nSkipped, left unchanged (${skipped.length}):`);
      skipped.forEach((row) => console.log(`  ${row.productName} — ${row.reason}`));
    }
    const csvPath = option('--csv');
    if (csvPath) {
      const header = ['productName', 'batchNumber', 'costPrice', 'mrp', 'percent', 'oldSellingPrice', 'newSellingPrice', 'oldDoctorPrice', 'newDoctorPrice'];
      const lines = [header.join(','), ...rows.map((row) => header.map((key) => csvCell(row[key])).join(','))];
      fs.writeFileSync(csvPath, `${lines.join('\n')}\n`);
      console.log(`\nCSV saved: ${path.resolve(csvPath)}`);
    }
    console.log('\nSab theek lage to: node scripts/repriceOnce.js apply --yes');
    return 0;
  }

  if (!confirmed) {
    console.error(`\nYe database "${mongoose.connection.name}" me prices badal dega. Pakka hai to --yes lagao.`);
    return 1;
  }

  if (mode === 'apply') {
    if (!(await reprice.claimRun())) {
      console.error('Price update pehle hi chal chuka hai (ya abhi chal raha hai). Status:', marker?.value?.status);
      return 1;
    }
    try {
      const result = await reprice.runReprice({ userRole: 'admin-script' });
      console.log(`\nDone. ${result.zeroed} selling prices set to 0, then ${result.updated} medicines repriced.`);
      console.log('Galti lage to: node scripts/repriceOnce.js undo --yes');
      return 0;
    } catch (err) {
      await reprice.setMarkerStatus('failed', { 'value.error': err.message }).catch(() => {});
      console.error('Update poora nahi hua, dobara apply chala sakte ho:', err.message);
      return 1;
    }
  }

  // undo
  const SystemConfig = require('../models/SystemConfig');
  const claimed = await SystemConfig.findOneAndUpdate(
    { key: reprice.MARKER_KEY, 'value.status': { $in: ['done', 'failed', 'undo_failed'] } },
    { $set: { 'value.status': 'undoing', updatedAt: new Date() } }
  );
  if (!claimed) {
    console.error('Undo karne ke liye kuch nahi hai. Status:', marker?.value?.status || 'not_run');
    return 1;
  }
  try {
    const { restored } = await reprice.runUndo({ userRole: 'admin-script' });
    console.log(`\nUndo done. ${restored} medicines restored to old prices.`);
    return 0;
  } catch (err) {
    await reprice.setMarkerStatus('undo_failed', { 'value.error': err.message }).catch(() => {});
    console.error('Undo poora nahi hua, dobara chalao:', err.message);
    return 1;
  }
};

main()
  .then(async (code) => {
    await mongoose.disconnect();
    process.exit(code);
  })
  .catch(async (err) => {
    console.error('Error:', err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
