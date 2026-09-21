import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api/axios';

const emptyItem = () => ({ productName: '', packing: '', batchNumber: '', manufacturer: '', hsnCode: '', expiryDate: '', quantity: '1', freeQuantity: '0', mrp: '', rate: '', netRate: '', sellingPrice: '', discount: '0', gst: '5', amount: '' });
const money = (value) => `₹${Number(value || 0).toFixed(2)}`;

const MedicineNameCell = ({ value, onChange, onPick, inputId, invalid }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const timerRef = useRef(null);

  const fetchSuggestions = (query) => {
    clearTimeout(timerRef.current);
    if (!query.trim()) { setSuggestions([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/medicines/search?q=${encodeURIComponent(query)}&includeOutOfStock=true`);
        const seen = new Set();
        const unique = (res.data || []).filter(m => {
          const key = m.productName?.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setSuggestions(unique);
        setOpen(true);
      } catch { /* ignore suggestion errors */ }
    }, 300);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const pick = (med) => {
    onChange(med.productName || '');
    if (onPick) onPick(med);
    setOpen(false);
  };

  return <div className="relative">
    <input
      value={value}
      onChange={e => { onChange(e.target.value); fetchSuggestions(e.target.value); }}
      onFocus={() => { if (suggestions.length) setOpen(true); }}
      onBlur={() => setTimeout(() => setOpen(false), 150)}
      placeholder="Medicine name — type to search stock"
      id={inputId}
      className={`w-full min-w-[200px] rounded-md border px-2 py-2 text-sm outline-none focus:ring-2 ${invalid ? 'border-red-500 bg-red-50/40 focus:border-red-500 focus:ring-red-200' : 'border-teal-400 bg-teal-50/50 focus:border-teal-600 focus:ring-teal-100'}`}
    />
    {open && suggestions.length > 0 && (
      <ul className="absolute left-0 right-0 z-50 mt-1 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
        {suggestions.map((med, i) => (
          <li key={i}>
            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => pick(med)}
              className="block w-full px-3 py-2 text-left hover:bg-teal-50"
            >
              <span className="block text-sm font-semibold text-slate-800">{med.productName}</span>
              <span className="block text-xs text-slate-500">
                {med.packSize ? `${med.packSize} TAB` : ''}{med.batchNumber ? ` · ${med.batchNumber}` : ''}
                {med.mrp ? ` · MRP ₹${med.mrp}` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    )}
  </div>;
};

const PurchaseBillEntry = () => {
  const [bill, setBill] = useState({ supplierName: '', supplierGstin: '', invoiceNumber: '', invoiceDate: new Date().toISOString().slice(0, 10), billType: 'Credit', paymentMode: 'Credit', notes: '', additionalDiscount: '0', billFiles: [] });
  const [items, setItems] = useState([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [errors, setErrors] = useState({});

  const clearError = (key) => setErrors(prev => {
    if (!prev[key]) return prev;
    const next = { ...prev };
    delete next[key];
    return next;
  });

  useEffect(() => {
    api.get('/medicines/suppliers').then(res => setSuppliers(res.data || [])).catch(() => {});
  }, []);

  const addBillPages = (fileListRaw, autoScan = true) => {
    const newFiles = Array.from(fileListRaw || []);
    if (newFiles.length === 0) return;
    const combined = [...bill.billFiles, ...newFiles];
    setBill(prev => ({ ...prev, billFiles: combined }));
    if (autoScan) handleScanBill(combined);
  };

  const removeBillPage = (index) => {
    setBill(prev => ({ ...prev, billFiles: prev.billFiles.filter((_, i) => i !== index) }));
  };

  const handleScanBill = async (files) => {
    const fileList = Array.isArray(files) ? files : (files ? [files] : []);
    if (fileList.length === 0) return;
    setScanning(true);
    try {
      const formData = new FormData();
      fileList.forEach(file => formData.append('billImages', file));
      const res = await api.post('/medicines/scan-bill', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data?.success && res.data?.data) {
        const extracted = res.data.data;
        setBill(prev => ({
          ...prev,
          supplierName: extracted.supplierName || prev.supplierName,
          supplierGstin: extracted.supplierGstin || prev.supplierGstin,
          invoiceNumber: extracted.invoiceNumber || prev.invoiceNumber,
          invoiceDate: extracted.invoiceDate || prev.invoiceDate,
          billType: extracted.billType || prev.billType,
          paymentMode: extracted.paymentMode || prev.paymentMode,
          notes: extracted.notes || prev.notes,
          additionalDiscount: extracted.additionalDiscount != null && Number(extracted.additionalDiscount) > 0 ? String(extracted.additionalDiscount) : prev.additionalDiscount,
          billFiles: fileList
        }));

        if (Array.isArray(extracted.items) && extracted.items.length > 0) {
          const scannedItems = extracted.items.map(item => ({
            productName: item.productName || '',
            packing: item.packing || '',
            batchNumber: item.batchNumber || '',
            manufacturer: item.manufacturer || '',
            hsnCode: item.hsnCode || '',
            expiryDate: item.expiryDate || '',
            quantity: String(item.quantity ?? 1),
            freeQuantity: String(item.freeQuantity ?? 0),
            mrp: String(item.mrp ?? 0),
            rate: String(item.rate ?? 0),
            netRate: String(item.netRate ?? item.rate ?? ''),
            sellingPrice: '',
            discount: String(item.discount ?? 0),
            gst: String(item.gst ?? 5),
            amount: item.amount != null && Number(item.amount) > 0 ? String(item.amount) : ''
          }));
          setItems(scannedItems);
        }
        setErrors({});
        alert('✨ AI Scanner: Purchase bill parsed and auto-filled successfully!');
      }
    } catch (error) {
      console.error(error);
      const serverMessage = error.response?.data?.message || '';
      if (serverMessage.includes('high demand') || serverMessage.includes('UNAVAILABLE') || serverMessage.includes('503')) {
        alert('AI Scanner: Google AI service abhi busy hai (high demand). Kuch seconds ruk kar dobara try karein.');
      } else if (serverMessage.includes('parse bill text')) {
        alert('AI Scanner: Bill ki photo clear nahi hai — dobara acchi photo/PDF try karein.');
      } else {
        alert('AI Scanner Error: ' + (serverMessage || error.message));
      }
    } finally {
      setScanning(false);
    }
  };

  const totals = useMemo(() => {
    const rows = items.map(item => {
      const gross = Number(item.quantity || 0) * Number(item.rate || 0);
      const discount = gross * Number(item.discount || 0) / 100;
      const taxable = gross - discount;
      return { taxable, gstRate: Number(item.gst || 0) };
    });
    const subtotal = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.rate || 0), 0);
    const discountTotal = items.reduce((sum, item) => {
      const gross = Number(item.quantity || 0) * Number(item.rate || 0);
      return sum + gross * Number(item.discount || 0) / 100;
    }, 0);
    const taxableTotal = rows.reduce((sum, row) => sum + row.taxable, 0);
    // Extra bill discount is deducted from each item's taxable amount (proportionally)
    // BEFORE GST is calculated, same as the item-level discount already is.
    const extraDiscount = Math.max(0, Math.min(Number(bill.additionalDiscount || 0), taxableTotal));
    const gstTotal = taxableTotal > 0
      ? rows.reduce((sum, row) => {
          const share = row.taxable / taxableTotal;
          const taxableAfterExtraDiscount = row.taxable - extraDiscount * share;
          return sum + taxableAfterExtraDiscount * row.gstRate / 100;
        }, 0)
      : 0;
    return { subtotal, discount: discountTotal, gst: gstTotal, additionalDiscount: extraDiscount };
  }, [items, bill.additionalDiscount]);
  const additionalDiscount = totals.additionalDiscount;
  const preRoundTotal = totals.subtotal - totals.discount - additionalDiscount + totals.gst;
  const roundOff = Math.round(preRoundTotal) - preRoundTotal;
  const grandTotal = preRoundTotal + roundOff;

  const setItem = (index, field, value) => {
    clearError(`row${index}.${field}`);
    setItems(prev => prev.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      return { ...item, [field]: value };
    }));
  };

  const priceAmount = (item) => Number(item.quantity || 0) * Number(item.rate || 0);

  const focusError = (key) => {
    const el = document.getElementById(`field-${key}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
    }
  };

  const validateAndFocus = () => {
    const errs = {};
    if (!bill.supplierName.trim()) errs.supplierName = true;
    if (!bill.invoiceNumber.trim()) errs.invoiceNumber = true;
    if (!bill.invoiceDate) errs.invoiceDate = true;
    items.forEach((item, index) => {
      if (!item.productName.trim()) errs[`row${index}.productName`] = true;
      if (!item.batchNumber.trim()) errs[`row${index}.batchNumber`] = true;
      if (!item.expiryDate) errs[`row${index}.expiryDate`] = true;
      if (!item.quantity) errs[`row${index}.quantity`] = true;
      if (item.mrp === '') errs[`row${index}.mrp`] = true;
      if (item.rate === '') errs[`row${index}.rate`] = true;
    });
    setErrors(errs);
    const order = [
      'supplierName', 'invoiceNumber', 'invoiceDate',
      ...items.map((_, i) => [`row${i}.productName`, `row${i}.batchNumber`, `row${i}.expiryDate`, `row${i}.quantity`, `row${i}.mrp`, `row${i}.rate`]).flat()
    ];
    const first = order.find(key => errs[key]);
    if (first) { focusError(first); return false; }
    return true;
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!validateAndFocus()) return alert('Kuch required fields khali hain — red box bharein.');
    setSaving(true);
    try {
      const data = new FormData();
      Object.entries(bill).forEach(([key, value]) => { if (key !== 'billFiles') data.append(key, value); });
      data.append('items', JSON.stringify(items));
      bill.billFiles.forEach(file => data.append('billImages', file));
      await api.post('/medicines/purchase-bills', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      alert('Purchase bill save ho gaya aur medicines inventory mein add ho gayi.');
      setErrors({});
      setBill({ supplierName: '', supplierGstin: '', invoiceNumber: '', invoiceDate: new Date().toISOString().slice(0, 10), billType: 'Credit', paymentMode: 'Credit', notes: '', additionalDiscount: '0', billFiles: [] });
      setItems([emptyItem()]);
    } catch (error) {
      alert(error.response?.data?.message || 'Purchase bill save nahi ho saka.');
    } finally { setSaving(false); }
  };

  const inputClass = 'w-full min-w-[90px] rounded-md border border-slate-300 px-2 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100';
  const errorClass = 'border-red-500 bg-red-50/40 focus:border-red-500 focus:ring-red-200';
  const fieldClass = (key, base = inputClass) => errors[key] ? base.replace('border-slate-300', 'border-red-500').replace('focus:border-teal-500 focus:ring-teal-100', 'focus:border-red-500 focus:ring-red-200').replace('focus:ring-teal-100', 'focus:ring-red-200') + ' bg-red-50/40' : base;
  const labelClass = 'mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500';

  return <div className="min-h-screen bg-slate-50 p-4 md:p-6">
    <form onSubmit={submit} className="mx-auto max-w-[1500px] space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl font-extrabold text-slate-800">Purchase Bill Entry</h1><p className="text-sm text-slate-500">Supplier bill upload karein, photo scan karein aur medicines automatically add karein.</p></div>
        <div className="rounded-lg bg-teal-700 px-5 py-3 text-right text-white shadow-sm"><p className="text-xs font-semibold uppercase tracking-wider text-teal-100">Grand Total</p><p className="text-2xl font-extrabold">{money(grandTotal)}</p></div>
      </div>

      {/* --- AI BILL AUTO-SCANNER BANNER --- */}
      <div className="bg-gradient-to-r from-purple-700 to-indigo-800 p-4 rounded-xl text-white shadow-sm">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="font-extrabold text-lg flex items-center gap-2">
              📸 AI Purchase Bill Auto-Scanner
            </h2>
            <p className="text-xs text-purple-100 mt-0.5">
              Bill multiple pages ki ho to sab photos ek ek karke add karein — AI sabko combine karke supplier, invoice no. aur saare medicine items ek saath fill kar dega!
            </p>
          </div>
          <div className="flex gap-2">
            <label className={`cursor-pointer px-4 py-2.5 rounded-lg font-bold text-sm shadow transition-all flex items-center gap-2 ${scanning ? 'bg-purple-300 text-purple-900 cursor-not-allowed' : 'bg-white text-purple-800 hover:bg-purple-50'}`}>
              {scanning ? (
                <>
                  <span className="w-4 h-4 border-2 border-purple-800 border-t-transparent rounded-full animate-spin"></span>
                  Scanning...
                </>
              ) : (
                <>📷 {bill.billFiles.length > 0 ? 'Add Another Page' : 'Take Photo / Scan Bill'}</>
              )}
              <input
                type="file"
                accept="image/*,application/pdf,.pdf"
                multiple
                disabled={scanning}
                onChange={(e) => { addBillPages(e.target.files, true); e.target.value = ''; }}
                className="hidden"
              />
            </label>
            <label className={`cursor-pointer px-4 py-2.5 rounded-lg font-bold text-sm shadow transition-all flex items-center gap-2 border border-white/40 ${scanning ? 'bg-purple-300 text-purple-900 cursor-not-allowed' : 'bg-purple-800/40 text-white hover:bg-purple-800/60'}`}>
              📁 Upload PDF / Files
              <input
                type="file"
                accept="image/*,application/pdf,.pdf"
                multiple
                disabled={scanning}
                onChange={(e) => { addBillPages(e.target.files, true); e.target.value = ''; }}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {bill.billFiles.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-white/20 pt-3">
            {bill.billFiles.map((file, idx) => (
              <div key={idx} className="relative w-16 h-16 rounded-md overflow-hidden border-2 border-white/60 bg-purple-900/40 shrink-0">
                {file.type === 'application/pdf' ? (
                  <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white text-center px-1">PDF pg {idx + 1}</div>
                ) : (
                  <img src={URL.createObjectURL(file)} alt={`Page ${idx + 1}`} className="w-full h-full object-cover" />
                )}
                <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-[9px] text-center text-white font-bold">Pg {idx + 1}</span>
                <button
                  type="button"
                  onClick={() => removeBillPage(idx)}
                  className="absolute top-0 right-0 bg-red-600 text-white w-4 h-4 flex items-center justify-center text-[10px] font-bold rounded-bl"
                  title="Remove this page"
                >✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <h2 className="mb-4 font-bold text-slate-800">Invoice Details</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><label className={labelClass}>Supplier / Party Name *</label><input id="field-supplierName" required list="known-suppliers" value={bill.supplierName} onChange={e => { clearError('supplierName'); setBill({ ...bill, supplierName: e.target.value }); }} placeholder="Rosa Medical Agencies" className={fieldClass('supplierName')} />
            <datalist id="known-suppliers">{suppliers.map(s => <option key={s} value={s} />)}</datalist>
          </div>
          <div><label className={labelClass}>Supplier GSTIN</label><input value={bill.supplierGstin} onChange={e => setBill({ ...bill, supplierGstin: e.target.value })} placeholder="06ABCDE1234F1Z5" className={inputClass} /></div>
          <div><label className={labelClass}>Invoice No. *</label><input id="field-invoiceNumber" required value={bill.invoiceNumber} onChange={e => { clearError('invoiceNumber'); setBill({ ...bill, invoiceNumber: e.target.value }); }} placeholder="C-09141" className={fieldClass('invoiceNumber')} /></div>
          <div><label className={labelClass}>Invoice Date *</label><input id="field-invoiceDate" required type="date" value={bill.invoiceDate} onChange={e => { clearError('invoiceDate'); setBill({ ...bill, invoiceDate: e.target.value }); }} className={fieldClass('invoiceDate')} /></div>
          <div><label className={labelClass}>Bill Type</label><select value={bill.billType} onChange={e => setBill({ ...bill, billType: e.target.value })} className={inputClass}><option>Credit</option><option>Cash</option><option>GST Invoice</option></select></div>
          <div><label className={labelClass}>Payment Mode</label><select value={bill.paymentMode} onChange={e => setBill({ ...bill, paymentMode: e.target.value })} className={inputClass}><option>Credit</option><option>Cash</option><option>UPI</option><option>Bank Transfer</option></select></div>
          <div className="lg:col-span-2 flex items-end">
            <p className="text-xs text-slate-500">
              Bill ki photos upar "AI Purchase Bill Auto-Scanner" mein add karein
              {bill.billFiles.length > 0 ? ` — ${bill.billFiles.length} page${bill.billFiles.length > 1 ? 's' : ''} attached.` : '.'}
            </p>
          </div>

          {/* --- PAYMENT STATUS & LEDGER SECTION --- */}
          <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4 sm:col-span-2 lg:col-span-4 mt-1">
            <h3 className="text-xs font-extrabold text-teal-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              💳 Payment Status & Ledger Details
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className={labelClass}>Payment Status *</label>
                <select
                  value={bill.paymentStatus || 'Credit'}
                  onChange={e => {
                    const status = e.target.value;
                    let paid = bill.amountPaid || '0';
                    if (status === 'Paid') paid = String(grandTotal);
                    else if (status === 'Credit') paid = '0';
                    setBill({ ...bill, paymentStatus: status, amountPaid: paid });
                  }}
                  className={inputClass}
                >
                  <option value="Credit">Credit (Udhar / Unpaid)</option>
                  <option value="Paid">Paid (Fully Paid)</option>
                  <option value="Partial">Partial Payment</option>
                </select>
              </div>

              <div>
                <label className={labelClass}>Amount Paid (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={bill.paymentStatus === 'Paid' ? grandTotal : (bill.amountPaid || '0')}
                  disabled={bill.paymentStatus === 'Paid'}
                  onChange={e => setBill({ ...bill, amountPaid: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Remaining Credit Due (₹)</label>
                <div className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-red-600 shadow-xs">
                  {money(Math.max(0, grandTotal - (bill.paymentStatus === 'Paid' ? grandTotal : Number(bill.amountPaid || 0))))}
                </div>
              </div>

              <div>
                <label className={labelClass}>Payment Remark / Note</label>
                <input
                  value={bill.paymentRemarks || ''}
                  onChange={e => setBill({ ...bill, paymentRemarks: e.target.value })}
                  placeholder="e.g. Paid ₹5000 via UPI, balance pending"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div className="sm:col-span-2 lg:col-span-4"><label className={labelClass}>Notes</label><input value={bill.notes} onChange={e => setBill({ ...bill, notes: e.target.value })} placeholder="Transport, scheme or any note" className={inputClass} /></div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 p-4 md:px-5"><div><h2 className="font-bold text-slate-800">Medicines</h2><p className="text-xs text-slate-500">Free quantity bhi inventory stock mein add hogi.</p></div><button type="button" onClick={() => setItems([...items, emptyItem()])} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700">+ Add Medicine</button></div>
        <div className="overflow-x-auto"><table className="min-w-[1450px] w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr>{['Medicine Name *', 'Packing', 'Batch *', 'Mfr.', 'HSN', 'Expiry *', 'Qty *', 'Free', 'MRP *', 'Rate *', 'Net Rate', 'Sale Price', 'Disc %', 'GST %', 'Price', ''].map(title => <th key={title} className="whitespace-nowrap px-2 py-3 font-bold">{title}</th>)}</tr></thead><tbody>
          {items.map((item, index) => <tr key={index} className="border-t border-slate-100 align-top">
            <td className="p-2"><MedicineNameCell
              inputId={`field-row${index}-productName`}
              invalid={!!errors[`row${index}.productName`]}
              value={item.productName}
              onChange={val => setItem(index, 'productName', val)}
              onPick={(med) => setItems(prev => prev.map((it, idx) => {
                if (idx !== index) return it;
                return {
                  ...it,
                  productName: med.productName || it.productName,
                  packing: med.packSize ? `${med.packSize} TAB` : (it.packing || ''),
                  manufacturer: med.manufacturer || it.manufacturer,
                  hsnCode: med.hsnCode || it.hsnCode,
                  gst: med.gst != null ? String(med.gst) : it.gst,
                  mrp: med.mrp != null ? String(med.mrp) : it.mrp,
                  sellingPrice: it.sellingPrice || ''
                };
              }))}
            /></td>
            <td className="p-2"><input value={item.packing} onChange={e => setItem(index, 'packing', e.target.value)} placeholder="10 tab" className={inputClass} /></td>
            <td className="p-2"><input id={`field-row${index}-batchNumber`} value={item.batchNumber} onChange={e => setItem(index, 'batchNumber', e.target.value)} placeholder="Batch" className={fieldClass(`row${index}.batchNumber`)} /></td>
            <td className="p-2"><input value={item.manufacturer} onChange={e => setItem(index, 'manufacturer', e.target.value)} placeholder="Mfr" className={inputClass} /></td>
            <td className="p-2"><input value={item.hsnCode} onChange={e => setItem(index, 'hsnCode', e.target.value)} placeholder="3004" className={inputClass} /></td>
            <td className="p-2"><input id={`field-row${index}-expiryDate`} type="date" value={item.expiryDate} onChange={e => setItem(index, 'expiryDate', e.target.value)} className={fieldClass(`row${index}.expiryDate`)} /></td>
            {['quantity', 'freeQuantity', 'mrp', 'rate', 'netRate', 'sellingPrice', 'discount', 'gst'].map(field => <td key={field} className="p-2"><input id={`field-row${index}-${field}`} type="number" min="0" step="0.01" value={item[field]} onChange={e => setItem(index, field, e.target.value)} className={fieldClass(`row${index}.${field}`)} /></td>)}
            <td className="whitespace-nowrap p-2 pt-3 font-bold text-slate-700">{money(priceAmount(item))}</td>
            <td className="p-2"><button type="button" disabled={items.length === 1} onClick={() => setItems(items.filter((_, itemIndex) => itemIndex !== index))} className="rounded p-2 text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-300" title="Remove medicine">✕</button></td>
          </tr>)}
        </tbody></table></div>
      </section>

      <section className="ml-auto max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="space-y-2 text-sm text-slate-600"><div className="flex justify-between"><span>Subtotal</span><b>{money(totals.subtotal)}</b></div><div className="flex justify-between"><span>Item-level discount</span><b>- {money(totals.discount)}</b></div>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
          <div><span className="block font-semibold text-amber-800">Extra Bill Discount (₹)</span><span className="block text-xs text-amber-600">Bill ke niche wala lump-sum discount — GST se pehle minus hota hai. AI se auto-fill ho sakta hai, ya yahan khud dalein.</span></div>
          <input
            type="number"
            min="0"
            step="0.01"
            value={bill.additionalDiscount}
            onChange={e => setBill({ ...bill, additionalDiscount: e.target.value })}
            className="w-28 rounded-md border border-amber-300 bg-white px-2 py-1.5 text-right text-sm font-bold text-amber-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
          />
        </div>
        <div className="flex justify-between"><span>Total GST</span><b>{money(totals.gst)}</b></div>
        <div className="flex justify-between"><span>Round off</span><b>{money(roundOff)}</b></div><div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-lg font-extrabold text-slate-800"><span>Grand Total</span><span>{money(grandTotal)}</span></div></div><button disabled={saving} type="submit" className="mt-5 w-full rounded-lg bg-teal-600 py-3 font-bold text-white hover:bg-teal-700 disabled:bg-teal-300">{saving ? 'Saving bill...' : 'Save Bill & Add Stock'}</button></section>
    </form>
  </div>;
};

export default PurchaseBillEntry;
