import React, { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import { useNavigate } from 'react-router-dom';

const blankRow = () => ({ medicineId: '', search: '', returnedStrips: '', returnedLoose: '' });
const today = () => new Date().toISOString().slice(0, 10);

export default function PurchaseReturn() {
  const navigate = useNavigate();
  const [medicines, setMedicines] = useState([]);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState({ wholesalerName: '', supplierBillNumber: '', returnDate: today(), notes: '', items: [blankRow()] });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [meds, returns] = await Promise.all([api.get('/medicines'), api.get('/medicines/purchase-returns')]);
      setMedicines(meds.data.filter((m) => !m.isKachiEntry));
      setHistory(returns.data);
    } catch (error) { alert(error.response?.data?.message || 'Could not load purchase return data'); }
  };
  useEffect(() => {
    const role = localStorage.getItem('userRole');
    if (role !== 'staff') navigate('/');
    else load();
  }, [navigate]);

  const selected = (row) => medicines.find((m) => m._id === row.medicineId);
  const available = (med) => ({ strips: Math.floor(Number(med?.quantity) || 0), loose: Math.round(Number(med?.looseQty) || 0) });
  const updateRow = (index, update) => setForm((current) => ({ ...current, items: current.items.map((row, i) => i === index ? { ...row, ...update } : row) }));
  const chooseMedicine = (index, med) => updateRow(index, { medicineId: med._id, search: `${med.productName} — Batch ${med.batchNumber}` });
  const removeRow = (index) => setForm((current) => ({ ...current, items: current.items.filter((_, i) => i !== index) }));

  const total = useMemo(() => form.items.reduce((sum, row) => {
    const med = medicines.find((medicine) => medicine._id === row.medicineId); if (!med) return sum;
    const tabs = (Number(row.returnedStrips) || 0) * (Number(med.packSize) || 1) + (Number(row.returnedLoose) || 0);
    return sum + (tabs / (Number(med.packSize) || 1)) * (Number(med.costPrice) || 0);
  }, 0), [form.items, medicines]);

  const submit = async (event) => {
    event.preventDefault();
    const items = form.items.map(({ medicineId, returnedStrips, returnedLoose }) => ({ medicineId, returnedStrips: Number(returnedStrips || 0), returnedLoose: Number(returnedLoose || 0) }));
    if (!form.wholesalerName.trim() || items.some((item) => !item.medicineId || (!item.returnedStrips && !item.returnedLoose))) return alert('Wholesaler and quantity for every selected item are required.');
    setSaving(true);
    try {
      const result = await api.post('/medicines/purchase-returns', { ...form, items });
      alert(`Return ${result.data.returnNumber} saved. Stock has been reduced.`);
      setForm({ wholesalerName: '', supplierBillNumber: '', returnDate: today(), notes: '', items: [blankRow()] });
      await load();
    } catch (error) { alert(error.response?.data?.message || 'Could not save purchase return'); }
    finally { setSaving(false); }
  };

  return <div className="max-w-6xl mx-auto space-y-6">
    <div><h1 className="text-2xl font-bold text-gray-800">↩️ Purchase Return</h1><p className="text-sm text-gray-500">Return stock to a wholesaler; the selected inventory is reduced automatically.</p></div>
    <form onSubmit={submit} className="bg-white border rounded-xl shadow-sm p-5 space-y-5">
      <div className="grid md:grid-cols-3 gap-4">
        <label className="text-sm font-semibold text-gray-700">Wholesaler name<input required value={form.wholesalerName} onChange={(e) => setForm({ ...form, wholesalerName: e.target.value })} className="mt-1 w-full border rounded-lg p-2" placeholder="Supplier / wholesaler" /></label>
        <label className="text-sm font-semibold text-gray-700">Supplier bill no.<input value={form.supplierBillNumber} onChange={(e) => setForm({ ...form, supplierBillNumber: e.target.value })} className="mt-1 w-full border rounded-lg p-2" placeholder="Optional" /></label>
        <label className="text-sm font-semibold text-gray-700">Return date<input type="date" value={form.returnDate} onChange={(e) => setForm({ ...form, returnDate: e.target.value })} className="mt-1 w-full border rounded-lg p-2" /></label>
      </div>
      <div className="space-y-3">
        {form.items.map((row, index) => {
          const med = selected(row); const stock = available(med);
          const matches = medicines.filter((m) => `${m.productName} ${m.batchNumber} ${m.partyName || ''}`.toLowerCase().includes(row.search.toLowerCase())).slice(0, 8);
          return <div key={index} className="grid md:grid-cols-[minmax(0,2fr)_100px_100px_80px] gap-3 items-start border rounded-lg p-3 bg-gray-50">
            <div className="relative"><input value={row.search} onChange={(e) => updateRow(index, { search: e.target.value, medicineId: '' })} className="w-full border rounded-lg p-2" placeholder="Search medicine, batch or supplier" autoComplete="off" />
              {row.search && !med && <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-52 overflow-auto">{matches.map((m) => <button type="button" key={m._id} onMouseDown={() => chooseMedicine(index, m)} className="block w-full text-left p-2 hover:bg-teal-50 text-sm"><b>{m.productName}</b> · {m.batchNumber}<span className="text-gray-500"> · {m.partyName || 'No supplier'}</span></button>)}{!matches.length && <p className="p-2 text-sm text-gray-500">No matching stock</p>}</div>}
              {med && <p className="mt-1 text-xs text-teal-700">Available: {stock.strips} strips, {stock.loose} loose · Pack {med.packSize || 1} · CP ₹{med.costPrice || 0}</p>}</div>
            <label className="text-xs font-semibold">Strips<input min="0" step="1" type="number" value={row.returnedStrips} onChange={(e) => updateRow(index, { returnedStrips: e.target.value })} className="mt-1 w-full border rounded-lg p-2" /></label>
            <label className="text-xs font-semibold">Loose tabs<input min="0" step="1" type="number" value={row.returnedLoose} onChange={(e) => updateRow(index, { returnedLoose: e.target.value })} className="mt-1 w-full border rounded-lg p-2" /></label>
            <button type="button" onClick={() => removeRow(index)} disabled={form.items.length === 1} className="mt-5 text-red-600 disabled:text-gray-300">Remove</button>
          </div>;
        })}
        <button type="button" onClick={() => setForm({ ...form, items: [...form.items, blankRow()] })} className="text-sm font-bold text-teal-700">+ Add medicine</button>
      </div>
      <label className="block text-sm font-semibold text-gray-700">Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1 w-full border rounded-lg p-2" rows="2" placeholder="Reason or return details (optional)" /></label>
      <div className="flex items-center justify-between border-t pt-4"><span className="font-bold text-gray-700">Estimated return value: ₹{total.toFixed(2)}</span><button disabled={saving} className="bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white font-bold px-5 py-2 rounded-lg">{saving ? 'Saving…' : 'Save purchase return'}</button></div>
    </form>
    <section className="bg-white border rounded-xl shadow-sm overflow-hidden"><div className="p-4 border-b"><h2 className="font-bold text-gray-800">Return history</h2></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-left text-gray-500"><tr><th className="p-3">Return no.</th><th className="p-3">Date</th><th className="p-3">Wholesaler</th><th className="p-3">Bill no.</th><th className="p-3">Items</th><th className="p-3">Value</th></tr></thead><tbody>{history.map((record) => <tr key={record._id} className="border-t"><td className="p-3 font-medium">{record.returnNumber}</td><td className="p-3">{new Date(record.returnDate).toLocaleDateString()}</td><td className="p-3">{record.wholesalerName}</td><td className="p-3">{record.supplierBillNumber || '—'}</td><td className="p-3">{record.items.length}</td><td className="p-3">₹{Number(record.totalAmount).toFixed(2)}</td></tr>)}{!history.length && <tr><td colSpan="6" className="p-6 text-center text-gray-500">No purchase returns recorded yet.</td></tr>}</tbody></table></div></section>
  </div>;
}
