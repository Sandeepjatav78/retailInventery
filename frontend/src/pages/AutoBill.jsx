import React, { useState } from 'react';
import api from '../api/axios';
import { generateBillHTML } from '../utils/BillGenerator';

const money = (val) => `₹${Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const getLocalDateString = () => {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().split('T')[0];
};

const formatTime = (value) => new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

// Auto bill cutting: pick how many bills, the amount range per bill, the date
// and time window — the server picks random valid stock for each bill.
const AutoBill = () => {
  const [form, setForm] = useState({ date: getLocalDateString(), count: '10', minAmount: '100', maxAmount: '500', startTime: '09:00', endTime: '21:00', paymentMode: 'Cash' });
  const [preview, setPreview] = useState(null);
  const [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const update = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handlePreview = async (e) => {
    e?.preventDefault();
    setLoading(true);
    setSaved(null);
    setExpanded(null);
    try {
      const res = await api.post('/sales/auto-bill/preview', form);
      setPreview(res.data);
    } catch (err) {
      setPreview(null);
      alert(err.response?.data?.message || 'Preview nahi ban saka.');
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!preview?.bills?.length) return;
    if (!window.confirm(`${preview.bills.length} bills (${money(preview.grandTotal)}) save karein? Stock bhi kam ho jayega.`)) return;
    setSaving(true);
    try {
      const res = await api.post('/sales/auto-bill/commit', {
        paymentMode: preview.paymentMode,
        bills: preview.bills.map((bill) => ({ date: bill.date, items: bill.items.map((item) => ({ medicineId: item.medicineId, quantity: item.quantity })) }))
      });
      setSaved(res.data);
      setPreview(null);
      setExpanded(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Bills save nahi ho sake.');
    } finally {
      setSaving(false);
    }
  };

  const printBill = async (sale) => {
    const w = window.open('', '_blank', 'width=900,height=900');
    if (!w) return alert('Popup blocked! Allow popups to print.');
    const html = await generateBillHTML(sale.items, {
      no: sale.invoiceNo, name: 'Cash Sale', phone: '', doctor: '', mode: sale.paymentMode,
      isDuplicate: false, grandTotal: sale.totalAmount, doseAmount: 0, customDate: sale.date, customTime: sale.date
    });
    w.document.open(); w.document.write(html); w.document.close();
  };

  const rows = saved ? saved.sales : (preview?.bills || []);

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <h1 className="text-xl font-extrabold text-slate-900">🎲 Auto Bill Cutting</h1>
        <p className="text-xs text-slate-500 mt-1">Kitne bill, kitne se kitne amount ke, aur kis date ke chahiye — system valid stock se random bills bana dega. Pehle preview dekhein, phir save karein.</p>

        <form onSubmit={handlePreview} className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <label className="text-xs font-bold text-slate-600">Bill Date
            <input type="date" required max={getLocalDateString()} value={form.date} onChange={update('date')} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
          </label>
          <label className="text-xs font-bold text-slate-600">Number of Bills
            <input type="number" required min="1" max="200" value={form.count} onChange={update('count')} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
          </label>
          <label className="text-xs font-bold text-slate-600">Min Amount (₹)
            <input type="number" required min="1" step="1" value={form.minAmount} onChange={update('minAmount')} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
          </label>
          <label className="text-xs font-bold text-slate-600">Max Amount (₹)
            <input type="number" required min="1" step="1" value={form.maxAmount} onChange={update('maxAmount')} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
          </label>
          <label className="text-xs font-bold text-slate-600">From Time
            <input type="time" required value={form.startTime} onChange={update('startTime')} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
          </label>
          <label className="text-xs font-bold text-slate-600">To Time
            <input type="time" required value={form.endTime} onChange={update('endTime')} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
          </label>
          <label className="text-xs font-bold text-slate-600">Payment Mode
            <select value={form.paymentMode} onChange={update('paymentMode')} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm bg-white">
              <option>Cash</option><option>Online</option>
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" disabled={loading} className="w-full py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm disabled:opacity-50">
              {loading ? 'Bana raha hai...' : (preview ? '🔄 Regenerate' : '👁 Preview Bills')}
            </button>
          </div>
        </form>
      </div>

      {preview && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="text-sm text-amber-900">
            <div className="font-extrabold">Preview: {preview.generated} / {preview.requested} bills · Total {money(preview.grandTotal)}</div>
            <div className="text-xs mt-1">
              {preview.eligibleItems} items se bills bane. Expired, bina HSN, Kachi aur Schedule (H/H1/X…) items kabhi use nahi hote.
              {preview.skippedUnchecked > 0 && ` ${preview.skippedUnchecked} items ka schedule check nahi hua hai, isliye skip hue — Inventory me "Auto Detect Schedule" chalayein.`}
              {preview.generated < preview.requested && ' Stock kam hone se saare bills nahi ban paye.'}
            </div>
          </div>
          <button onClick={handleCommit} disabled={saving || preview.generated === 0} className="px-5 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold text-sm whitespace-nowrap disabled:opacity-50">
            {saving ? 'Saving...' : `✅ Save ${preview.generated} Bills`}
          </button>
        </div>
      )}

      {saved && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-sm text-green-900 font-bold">✅ {saved.message}</div>
      )}

      {rows.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[11px] font-extrabold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">#</th>
                {saved && <th className="px-4 py-3">Invoice</th>}
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3 text-right">Amount</th>
                {saved && <th className="px-4 py-3 text-center">Print</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((bill, idx) => (
                <React.Fragment key={bill._id || idx}>
                  <tr className="hover:bg-slate-50 cursor-pointer" onClick={() => setExpanded(expanded === idx ? null : idx)}>
                    <td className="px-4 py-2.5 text-slate-400">{idx + 1}</td>
                    {saved && <td className="px-4 py-2.5 font-bold text-slate-800">{bill.invoiceNo}</td>}
                    <td className="px-4 py-2.5 text-slate-600">{formatTime(bill.date)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{bill.items.length} {expanded === idx ? '▲' : '▼'}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-800">{money(bill.totalAmount)}</td>
                    {saved && (
                      <td className="px-4 py-2.5 text-center">
                        <button onClick={(e) => { e.stopPropagation(); printBill(bill); }} className="px-2.5 py-1 rounded-md bg-teal-50 text-teal-700 border border-teal-200 text-xs font-bold">🖨 Print</button>
                      </td>
                    )}
                  </tr>
                  {expanded === idx && (
                    <tr className="bg-slate-50">
                      <td colSpan={saved ? 6 : 4} className="px-6 py-2">
                        {bill.items.map((item) => (
                          <div key={item.medicineId} className="flex justify-between text-xs text-slate-600 py-0.5">
                            <span>{item.name} <span className="text-slate-400">({item.batch})</span> × {item.quantity}</span>
                            <span className="font-semibold">{money(item.total)}</span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AutoBill;
