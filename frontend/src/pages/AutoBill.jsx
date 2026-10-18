import React, { useEffect, useState } from 'react';
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

const sumBills = (list) => Math.round(list.reduce((sum, bill) => sum + Number(bill.totalAmount || 0), 0) * 100) / 100;
const withTotal = (bill) => ({ ...bill, totalAmount: Math.round(bill.items.reduce((sum, item) => sum + Number(item.total || 0), 0) * 100) / 100 });

// Search box for adding a medicine by hand to a preview bill (only auto-billable stock is returned).
const AddMedicineSearch = ({ onPick }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return undefined;
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/sales/auto-bill/medicines?q=${encodeURIComponent(q)}`);
        setResults(res.data?.medicines || []);
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="relative">
      <input value={query} onChange={(e) => { setQuery(e.target.value); if (e.target.value.trim().length < 2) setResults([]); }} placeholder="➕ Dawai add karein (naam / batch)" className="w-full rounded-lg border border-slate-300 p-1.5 text-xs" />
      {results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto bg-white border border-slate-200 rounded-lg shadow-lg">
          {results.map((med) => (
            <button key={med.medicineId} type="button" onClick={() => { onPick(med); setQuery(''); setResults([]); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-teal-50 flex justify-between gap-2">
              <span>{med.name} <span className="text-slate-400">({med.batch}) · stock {med.stock}</span></span>
              <span className="font-bold">{money(med.price)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
  const [randomNames, setRandomNames] = useState(true);
  const [customerNamesText, setCustomerNamesText] = useState('');
  const [manualBill, setManualBill] = useState({ date: getLocalDateString(), time: '12:00', paymentMode: 'Online' });

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
      const customerNames = customerNamesText.split('\n').map((name) => name.trim()).filter(Boolean);
      const res = await api.post('/sales/auto-bill/preview', { ...form, days: days.filter((day) => day.date), randomNames, customerNames });
      setPreview(res.data);
    } catch (err) {
      setPreview(null);
      alert(err.response?.data?.message || 'Preview nahi ban saka.');
    } finally {
      setLoading(false);
    }
  };

  // --- Manual corrections to the preview (when the random amounts don't come out right) ---
  const updateBill = (idx, change) => setPreview((prev) => ({
    ...prev,
    bills: prev.bills.map((bill, i) => (i === idx ? withTotal(change(bill)) : bill))
  }));
  const setItemQty = (idx, medicineId, qty) => updateBill(idx, (bill) => ({
    ...bill,
    items: bill.items.map((item) => (item.medicineId === medicineId
      ? { ...item, quantity: qty, total: Math.round(item.price * qty * 100) / 100 }
      : item))
  }));
  const removeItem = (idx, medicineId) => updateBill(idx, (bill) => ({ ...bill, items: bill.items.filter((item) => item.medicineId !== medicineId) }));
  const addItem = (idx, med) => updateBill(idx, (bill) => {
    const existing = bill.items.find((item) => item.medicineId === med.medicineId);
    if (existing) {
      return { ...bill, items: bill.items.map((item) => (item.medicineId === med.medicineId ? { ...item, quantity: item.quantity + 1, total: Math.round(item.price * (item.quantity + 1) * 100) / 100 } : item)) };
    }
    const { stock: _stock, ...line } = med;
    return { ...bill, items: [...bill.items, line] };
  });
  const removeBill = (idx) => {
    setPreview((prev) => ({ ...prev, bills: prev.bills.filter((_, i) => i !== idx) }));
    setExpanded(null);
  };
  const addManualBill = () => {
    const date = new Date(`${manualBill.date}T${manualBill.time}:00+05:30`);
    if (Number.isNaN(date.getTime()) || date > new Date()) return alert('Date/time sahi bharein (future nahi).');
    const bill = { date: date.toISOString(), day: manualBill.date, paymentMode: manualBill.paymentMode, customerName: 'Cash Sale', items: [], totalAmount: 0 };
    const bills = [...(preview?.bills || []), bill].sort((a, b) => new Date(a.date) - new Date(b.date));
    setPreview({ ...preview, bills });
    setExpanded(bills.indexOf(bill));
  };

  const handleCommit = async () => {
    if (!preview?.bills?.length) return;
    const emptyIdx = preview.bills.findIndex((bill) => bill.items.length === 0);
    if (emptyIdx >= 0) return alert(`Bill #${emptyIdx + 1} khali hai — dawai add karein ya bill hatayein.`);
    if (!window.confirm(`${preview.bills.length} bills (${money(sumBills(preview.bills))}) save karein? Stock bhi kam ho jayega.`)) return;
    setSaving(true);
    try {
      const res = await api.post('/sales/auto-bill/commit', {
        bills: preview.bills.map((bill) => ({ date: bill.date, paymentMode: bill.paymentMode, customerName: bill.customerName, items: bill.items.map((item) => ({ medicineId: item.medicineId, quantity: item.quantity })) }))
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
      no: sale.invoiceNo, name: sale.customerName || 'Cash Sale', phone: '', doctor: '', mode: sale.paymentMode,
      isDuplicate: false, grandTotal: sale.totalAmount, doseAmount: 0, customDate: sale.date, customTime: sale.date
    });
    w.document.open(); w.document.write(html); w.document.close();
  };

  const rows = saved ? saved.sales : (preview?.bills || []);
  // Totals are recomputed from the (possibly hand-edited) bills, not taken from the server.
  const previewBills = preview?.bills || [];
  const previewTotals = {
    grand: sumBills(previewBills),
    cash: sumBills(previewBills.filter((bill) => bill.paymentMode === 'Cash')),
    online: sumBills(previewBills.filter((bill) => bill.paymentMode === 'Online'))
  };
  const dayChips = (preview?.days || []).map((day) => {
    const ofDay = previewBills.filter((bill) => bill.day === day.date);
    const cash = ofDay.filter((bill) => bill.paymentMode === 'Cash');
    const online = ofDay.filter((bill) => bill.paymentMode === 'Online');
    return { ...day, cashTotal: sumBills(cash), cashCount: cash.length, onlineTotal: sumBills(online), onlineCount: online.length };
  });

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

          <div className="rounded-xl border border-slate-200 p-3 space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
              <input type="checkbox" checked={randomNames} onChange={(e) => setRandomNames(e.target.checked)} />
              👤 Bills par customer naam daalein (band = "Cash Sale")
            </label>
            {randomNames && (
              <textarea
                rows="2"
                value={customerNamesText}
                onChange={(e) => setCustomerNamesText(e.target.value)}
                placeholder="Apne naam (har line me ek) — khali chhodein to common naam apne aap lagenge"
                className="w-full rounded-lg border border-slate-300 p-2 text-xs"
              />
            )}
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
            <div className="font-extrabold">Preview: {previewBills.length} bills · Total {money(previewTotals.grand)} / {money(preview.requestedAmount)}</div>
            <div className="text-xs font-bold mt-0.5">💵 Cash {money(previewTotals.cash)} · 📱 Online {money(previewTotals.online)}</div>
            <div className="text-xs mt-1">
              {preview.eligibleItems} items se bills bane. Expired, bina HSN, Kachi aur Schedule (H/H1/X…) items kabhi use nahi hote.
              {preview.skippedUnchecked > 0 && ` ${preview.skippedUnchecked} items ka schedule check nahi hua hai, isliye skip hue — Inventory me "Auto Detect Schedule" chalayein.`}
              {preview.requestedAmount - previewTotals.grand > 50 && ' Stock kam hone se poora amount nahi ban paya.'}
              {' '}Amount sahi na ho to bill par click karke dawai/qty khud badlein, ya neeche se naya bill jodein.
            </div>
            {dayChips.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {dayChips.map((day) => {
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
          <button onClick={handleCommit} disabled={saving || previewBills.length === 0} className="px-5 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold text-sm whitespace-nowrap disabled:opacity-50">
            {saving ? 'Saving...' : `✅ Save ${previewBills.length} Bills`}
          </button>
        </div>
      )}

      {preview && (
        <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-extrabold text-slate-700">✍️ Manual bill jodein:</span>
          <input type="date" max={getLocalDateString()} value={manualBill.date} onChange={(e) => setManualBill({ ...manualBill, date: e.target.value })} className="rounded-lg border border-slate-300 p-1.5" aria-label="Manual bill date" />
          <input type="time" value={manualBill.time} onChange={(e) => setManualBill({ ...manualBill, time: e.target.value })} className="rounded-lg border border-slate-300 p-1.5" aria-label="Manual bill time" />
          <select value={manualBill.paymentMode} onChange={(e) => setManualBill({ ...manualBill, paymentMode: e.target.value })} className="rounded-lg border border-slate-300 p-1.5 bg-white" aria-label="Manual bill mode">
            <option>Online</option><option>Cash</option>
          </select>
          <button type="button" onClick={addManualBill} className="px-3 py-1.5 rounded-lg bg-teal-600 text-white font-bold">➕ Add Bill</button>
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
                <th className="px-4 py-3">Customer</th>
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
                    <td className="px-4 py-2.5 text-slate-700">{bill.customerName || 'Cash Sale'}</td>
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
                      <td colSpan={saved ? 8 : 6} className="px-6 py-2">
                        {saved ? bill.items.map((item) => (
                          <div key={item.medicineId} className="flex justify-between text-xs text-slate-600 py-0.5">
                            <span>{item.name} <span className="text-slate-400">({item.batch})</span> × {item.quantity}</span>
                            <span className="font-semibold">{money(item.total)}</span>
                          </div>
                        )) : (
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <label className="font-bold text-slate-600">Customer
                                <input value={bill.customerName || ''} onChange={(e) => updateBill(idx, (b) => ({ ...b, customerName: e.target.value }))} className="ml-1 rounded border border-slate-300 p-1 w-40" />
                              </label>
                              <label className="font-bold text-slate-600">Mode
                                <select value={bill.paymentMode} onChange={(e) => updateBill(idx, (b) => ({ ...b, paymentMode: e.target.value }))} className="ml-1 rounded border border-slate-300 p-1 bg-white">
                                  <option>Cash</option><option>Online</option>
                                </select>
                              </label>
                              <button type="button" onClick={() => removeBill(idx)} className="ml-auto px-2 py-1 rounded bg-red-50 text-red-600 border border-red-200 font-bold">🗑 Bill hatayein</button>
                            </div>
                            {bill.items.map((item) => (
                              <div key={item.medicineId} className="flex items-center justify-between gap-2 text-xs text-slate-600">
                                <span className="flex-1">{item.name} <span className="text-slate-400">({item.batch}) · {money(item.price)}</span></span>
                                <input type="number" min="1" step="1" value={item.quantity} onChange={(e) => setItemQty(idx, item.medicineId, Math.max(1, Math.floor(Number(e.target.value) || 1)))} className="w-16 rounded border border-slate-300 p-1 text-center" aria-label="Quantity" />
                                <span className="w-20 text-right font-semibold">{money(item.total)}</span>
                                <button type="button" onClick={() => removeItem(idx, item.medicineId)} className="px-1.5 text-red-500 font-bold" title="Remove">✕</button>
                              </div>
                            ))}
                            <AddMedicineSearch onPick={(med) => addItem(idx, med)} />
                          </div>
                        )}
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
