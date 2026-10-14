import React, { useState } from 'react';
import api from '../api/axios';
import { generateBillHTML } from '../utils/BillGenerator';

const money = (val) => `₹${Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const getLocalDateString = () => {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().split('T')[0];
};

const formatTime = (value) => new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
const formatDay = (value) => new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

// 'YYYY-MM-DD' + n days, without timezone drift.
const addDays = (dateStr, n) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

// Auto bill cutting: one row per date with how much Cash and Online billing (₹)
// is wanted that day (optionally in a fixed number of bills each), plus a shared per-bill amount range and time window —
// the server picks random valid stock until each target is covered.
const AutoBill = () => {
  const [form, setForm] = useState({ minAmount: '100', maxAmount: '500', startTime: '09:00', endTime: '21:00' });
  const [days, setDays] = useState([{ date: getLocalDateString(), cashAmount: '3000', cashCount: '', onlineAmount: '2000', onlineCount: '' }]);
  const [range, setRange] = useState({ from: '', to: '', cashAmount: '3000', cashCount: '', onlineAmount: '2000', onlineCount: '' });
  const [preview, setPreview] = useState(null);
  const [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const update = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  const updateDay = (idx, field, value) => setDays((prev) => prev.map((day, i) => (i === idx ? { ...day, [field]: value } : day)));
  const removeDay = (idx) => setDays((prev) => prev.filter((_, i) => i !== idx));
  const addDay = () => setDays((prev) => {
    const last = prev[prev.length - 1]?.date;
    const next = last ? addDays(last, 1) : getLocalDateString();
    const prevDay = prev[prev.length - 1];
    return [...prev, { date: next > getLocalDateString() ? getLocalDateString() : next, cashAmount: prevDay?.cashAmount || '0', cashCount: prevDay?.cashCount || '', onlineAmount: prevDay?.onlineAmount || '0', onlineCount: prevDay?.onlineCount || '' }];
  });

  // Fill every date from..to with the same Cash/Online amounts (existing dates get updated).
  const addRange = () => {
    if (!range.from || !range.to || range.to < range.from) return alert('From aur To date sahi bharein.');
    const added = new Map(days.filter((d) => d.date).map((d) => [d.date, d]));
    for (let date = range.from; date <= range.to; date = addDays(date, 1)) added.set(date, { date, cashAmount: range.cashAmount, cashCount: range.cashCount, onlineAmount: range.onlineAmount, onlineCount: range.onlineCount });
    setDays([...added.values()].sort((a, b) => a.date.localeCompare(b.date)));
  };

  const totalCash = days.reduce((sum, day) => sum + (Number(day.cashAmount) || 0), 0);
  const totalOnline = days.reduce((sum, day) => sum + (Number(day.onlineAmount) || 0), 0);

  const handlePreview = async (e) => {
    e?.preventDefault();
    setLoading(true);
    setSaved(null);
    setExpanded(null);
    try {
      const res = await api.post('/sales/auto-bill/preview', { ...form, days: days.filter((day) => day.date) });
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
        bills: preview.bills.map((bill) => ({ date: bill.date, paymentMode: bill.paymentMode, items: bill.items.map((item) => ({ medicineId: item.medicineId, quantity: item.quantity })) }))
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
        <p className="text-xs text-slate-500 mt-1">Har date ke aage likhein kitne ₹ ke Cash bills aur kitne ₹ ke Online bills chahiye, aur chahein to kitne bills me (jaise 12 ko Cash ₹5000 ke 10 bills + Online ₹3000 ke 4 bills). Bills khali chhodne par Min–Max range ke hisaab se apne aap ginti banegi. Pehle preview dekhein, phir save karein.</p>

        <form onSubmit={handlePreview} className="mt-4 space-y-4">
          <div className="rounded-xl border border-slate-200 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-extrabold uppercase text-slate-600">📅 Dates & Bills</h2>
              <span className="text-xs font-bold text-slate-500">{days.length} din · Cash {money(totalCash)} · Online {money(totalOnline)}</span>
            </div>
            {days.map((day, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2">
                <input type="date" required max={getLocalDateString()} value={day.date} onChange={(e) => updateDay(idx, 'date', e.target.value)} className="flex-1 min-w-[140px] rounded-lg border border-slate-300 p-2 text-sm" />
                <span className="text-xs font-bold text-slate-500">💵 Cash ₹</span>
                <input type="number" min="0" step="1" value={day.cashAmount} onChange={(e) => updateDay(idx, 'cashAmount', e.target.value)} className="w-24 rounded-lg border border-slate-300 p-2 text-sm" aria-label="Cash amount" />
                <input type="number" min="0" step="1" placeholder="auto" value={day.cashCount} onChange={(e) => updateDay(idx, 'cashCount', e.target.value)} className="w-16 rounded-lg border border-slate-300 p-2 text-sm" aria-label="Cash bills" title="Kitne Cash bills (khali = auto)" />
                <span className="text-xs text-slate-400">bills</span>
                <span className="text-xs font-bold text-slate-500">📱 Online ₹</span>
                <input type="number" min="0" step="1" value={day.onlineAmount} onChange={(e) => updateDay(idx, 'onlineAmount', e.target.value)} className="w-24 rounded-lg border border-slate-300 p-2 text-sm" aria-label="Online amount" />
                <input type="number" min="0" step="1" placeholder="auto" value={day.onlineCount} onChange={(e) => updateDay(idx, 'onlineCount', e.target.value)} className="w-16 rounded-lg border border-slate-300 p-2 text-sm" aria-label="Online bills" title="Kitne Online bills (khali = auto)" />
                <span className="text-xs text-slate-400">bills</span>
                <button type="button" onClick={() => removeDay(idx)} disabled={days.length === 1} className="px-2 py-1 text-red-500 font-bold disabled:opacity-30" title="Remove">✕</button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
              <button type="button" onClick={addDay} className="px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 text-xs font-bold">➕ Add Date</button>
              <span className="text-xs text-slate-400">ya range:</span>
              <input type="date" max={getLocalDateString()} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className="rounded-lg border border-slate-300 p-1.5 text-xs" aria-label="From date" />
              <span className="text-xs text-slate-400">se</span>
              <input type="date" max={getLocalDateString()} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className="rounded-lg border border-slate-300 p-1.5 text-xs" aria-label="To date" />
              <span className="text-xs text-slate-400">tak, roz Cash ₹</span>
              <input type="number" min="0" value={range.cashAmount} onChange={(e) => setRange({ ...range, cashAmount: e.target.value })} className="w-20 rounded-lg border border-slate-300 p-1.5 text-xs" aria-label="Cash per day" />
              <input type="number" min="0" placeholder="auto" value={range.cashCount} onChange={(e) => setRange({ ...range, cashCount: e.target.value })} className="w-14 rounded-lg border border-slate-300 p-1.5 text-xs" aria-label="Cash bills per day" title="Cash bills (khali = auto)" />
              <span className="text-xs text-slate-400">bills,</span>
              <span className="text-xs text-slate-400">Online ₹</span>
              <input type="number" min="0" value={range.onlineAmount} onChange={(e) => setRange({ ...range, onlineAmount: e.target.value })} className="w-20 rounded-lg border border-slate-300 p-1.5 text-xs" aria-label="Online per day" />
              <input type="number" min="0" placeholder="auto" value={range.onlineCount} onChange={(e) => setRange({ ...range, onlineCount: e.target.value })} className="w-14 rounded-lg border border-slate-300 p-1.5 text-xs" aria-label="Online bills per day" title="Online bills (khali = auto)" />
              <span className="text-xs text-slate-400">bills</span>
              <button type="button" onClick={addRange} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold">Add Range</button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <label className="text-xs font-bold text-slate-600">Min per Bill (₹)
            <input type="number" required min="1" step="1" value={form.minAmount} onChange={update('minAmount')} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
          </label>
          <label className="text-xs font-bold text-slate-600">Max per Bill (₹)
            <input type="number" required min="1" step="1" value={form.maxAmount} onChange={update('maxAmount')} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
          </label>
          <label className="text-xs font-bold text-slate-600">From Time
            <input type="time" required value={form.startTime} onChange={update('startTime')} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
          </label>
          <label className="text-xs font-bold text-slate-600">To Time
            <input type="time" required value={form.endTime} onChange={update('endTime')} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
          </label>
          <div className="flex items-end">
            <button type="submit" disabled={loading} className="w-full py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm disabled:opacity-50">
              {loading ? 'Bana raha hai...' : (preview ? '🔄 Regenerate' : '👁 Preview Bills')}
            </button>
          </div>
          </div>
        </form>
      </div>

      {preview && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="text-sm text-amber-900">
            <div className="font-extrabold">Preview: {preview.generated} bills · Total {money(preview.grandTotal)} / {money(preview.requestedAmount)}</div>
            <div className="text-xs font-bold mt-0.5">💵 Cash {money(preview.cashTotal)} · 📱 Online {money(preview.onlineTotal)}</div>
            <div className="text-xs mt-1">
              {preview.eligibleItems} items se bills bane. Expired, bina HSN, Kachi aur Schedule (H/H1/X…) items kabhi use nahi hote.
              {preview.skippedUnchecked > 0 && ` ${preview.skippedUnchecked} items ka schedule check nahi hua hai, isliye skip hue — Inventory me "Auto Detect Schedule" chalayein.`}
              {preview.requestedAmount - preview.grandTotal > 50 && ' Stock kam hone se poora amount nahi ban paya.'}
            </div>
            {preview.days?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {preview.days.map((day) => {
                  const short = day.cashTarget - day.cashTotal > 50 || day.onlineTarget - day.onlineTotal > 50
                    || (day.cashCountTarget && day.cashCount < day.cashCountTarget)
                    || (day.onlineCountTarget && day.onlineCount < day.onlineCountTarget);
                  const bills = (made, wanted) => (wanted ? `${made}/${wanted}` : made);
                  return (
                    <span key={day.date} className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${short ? 'bg-red-50 text-red-700 border-red-200' : 'bg-white text-amber-900 border-amber-200'}`}>
                      {formatDay(`${day.date}T00:00:00`)}: 💵 {money(day.cashTotal)}/{money(day.cashTarget)} ({bills(day.cashCount, day.cashCountTarget)} bills) · 📱 {money(day.onlineTotal)}/{money(day.onlineTarget)} ({bills(day.onlineCount, day.onlineCountTarget)} bills)
                    </span>
                  );
                })}
              </div>
            )}
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
                <th className="px-4 py-3">Date / Time</th>
                <th className="px-4 py-3">Mode</th>
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
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{formatDay(bill.date)} · {formatTime(bill.date)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${bill.paymentMode === 'Online' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-green-50 text-green-700 border-green-200'}`}>{bill.paymentMode}</span>
                    </td>
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
                      <td colSpan={saved ? 7 : 5} className="px-6 py-2">
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
