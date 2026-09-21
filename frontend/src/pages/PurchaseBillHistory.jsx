import React, { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';

const money = (val) => `₹${Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateFmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const toInputDate = (d) => d.toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); d.setDate(1); return toInputDate(d); };
const today = () => toInputDate(new Date());

const PurchaseBillHistory = () => {
  const [bills, setBills] = useState([]);
  const [summary, setSummary] = useState({ totalBills: 0, totalPurchased: 0, totalPaid: 0, totalDue: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(200);
  const [expandedId, setExpandedId] = useState(null);
  const [imageBill, setImageBill] = useState(null);
  const [editBill, setEditBill] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editItems, setEditItems] = useState([]);
  const [editFiles, setEditFiles] = useState([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editErrors, setEditErrors] = useState({});
  const [deletingId, setDeletingId] = useState(null);

  const emptyEditItem = () => ({ productName: '', packing: '', batchNumber: '', manufacturer: '', hsnCode: '', expiryDate: '', quantity: '1', freeQuantity: '0', mrp: '', rate: '', netRate: '', sellingPrice: '', discount: '0', gst: '5', amount: '' });

  const clearEditError = (key) => setEditErrors(prev => {
    if (!prev[key]) return prev;
    const next = { ...prev };
    delete next[key];
    return next;
  });

  const fetchBills = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (status !== 'ALL') params.set('status', status);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      params.set('page', page);
      params.set('limit', limit);
      const res = await api.get(`/medicines/purchase-bills?${params.toString()}`);
      setBills(res.data.bills || []);
      setSummary(res.data.summary || {});
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error(err);
      alert('Purchase bill history load nahi ho saki.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBills(); }, [page]);

  const applyFilters = () => { setPage(1); fetchBills(); };

  const openEdit = (bill) => {
    setEditForm({
      supplierName: bill.supplierName || '',
      supplierGstin: bill.supplierGstin || '',
      invoiceNumber: bill.invoiceNumber || '',
      invoiceDate: bill.invoiceDate ? String(bill.invoiceDate).slice(0, 10) : '',
      billType: bill.billType || 'Credit',
      paymentMode: bill.paymentMode || 'Credit',
      notes: bill.notes || '',
      additionalDiscount: String(bill.additionalDiscount ?? '0')
    });
    setEditItems((bill.items || []).map(item => ({
      productName: item.productName || '',
      packing: item.packing || '',
      batchNumber: item.batchNumber || '',
      manufacturer: item.manufacturer || '',
      hsnCode: item.hsnCode || '',
      expiryDate: item.expiryDate ? String(item.expiryDate).slice(0, 10) : '',
      quantity: String(item.quantity ?? ''),
      freeQuantity: String(item.freeQuantity ?? '0'),
      mrp: String(item.mrp ?? ''),
      rate: String(item.rate ?? ''),
      netRate: String(item.netRate ?? item.rate ?? ''),
      sellingPrice: String(item.sellingPrice ?? ''),
      discount: String(item.discount ?? '0'),
      gst: String(item.gst ?? '5'),
      amount: String(item.amount ?? '')
    })));
    setEditErrors({});
    setEditFiles([]);
    setEditBill(bill);
  };

  const setEditItem = (index, field, value) => {
    clearEditError(`row${index}.${field}`);
    setEditItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const focusEditError = (key) => {
    const el = document.getElementById(`edit-field-${key}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
    }
  };

  const validateEditAndFocus = () => {
    const errs = {};
    if (!editForm.supplierName.trim()) errs.supplierName = true;
    if (!editForm.invoiceNumber.trim()) errs.invoiceNumber = true;
    if (!editForm.invoiceDate) errs.invoiceDate = true;
    editItems.forEach((item, index) => {
      if (!item.productName.trim()) errs[`row${index}.productName`] = true;
      if (!item.batchNumber.trim()) errs[`row${index}.batchNumber`] = true;
      if (!item.expiryDate) errs[`row${index}.expiryDate`] = true;
      if (!item.quantity) errs[`row${index}.quantity`] = true;
      if (item.mrp === '') errs[`row${index}.mrp`] = true;
      if (item.rate === '') errs[`row${index}.rate`] = true;
    });
    setEditErrors(errs);
    const order = [
      'supplierName', 'invoiceNumber', 'invoiceDate',
      ...editItems.map((_, i) => [`row${i}.productName`, `row${i}.batchNumber`, `row${i}.expiryDate`, `row${i}.quantity`, `row${i}.mrp`, `row${i}.rate`]).flat()
    ];
    const first = order.find(key => errs[key]);
    if (first) { focusEditError(first); return false; }
    return true;
  };

  const editPriceAmount = (item) => Number(item.quantity || 0) * Number(item.rate || 0);

  const editTotals = useMemo(() => {
    const rows = editItems.map(item => {
      const gross = Number(item.quantity || 0) * Number(item.rate || 0);
      const discount = gross * Number(item.discount || 0) / 100;
      const taxable = gross - discount;
      return { taxable, gstRate: Number(item.gst || 0) };
    });
    const subtotal = editItems.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.rate || 0), 0);
    const discountTotal = editItems.reduce((sum, item) => {
      const gross = Number(item.quantity || 0) * Number(item.rate || 0);
      return sum + gross * Number(item.discount || 0) / 100;
    }, 0);
    const taxableTotal = rows.reduce((sum, row) => sum + row.taxable, 0);
    // Extra bill discount is deducted proportionally before GST, same as item-level discount.
    const extraDiscount = Math.max(0, Math.min(Number(editForm?.additionalDiscount || 0), taxableTotal));
    const gstTotal = taxableTotal > 0
      ? rows.reduce((sum, row) => {
          const share = row.taxable / taxableTotal;
          const taxableAfterExtraDiscount = row.taxable - extraDiscount * share;
          return sum + taxableAfterExtraDiscount * row.gstRate / 100;
        }, 0)
      : 0;
    return { subtotal, discount: discountTotal, gst: gstTotal, additionalDiscount: extraDiscount };
  }, [editItems, editForm?.additionalDiscount]);
  const editAdditionalDiscount = editTotals.additionalDiscount;
  const editPreRoundTotal = editTotals.subtotal - editTotals.discount - editAdditionalDiscount + editTotals.gst;
  const editRoundOff = Math.round(editPreRoundTotal) - editPreRoundTotal;
  const editGrandTotal = editPreRoundTotal + editRoundOff;

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editBill) return;
    if (!validateEditAndFocus()) return alert('Kuch required fields khali hain — red box bharein.');
    setSavingEdit(true);
    try {
      const data = new FormData();
      Object.entries(editForm).forEach(([key, value]) => data.append(key, value));
      data.append('items', JSON.stringify(editItems));
      editFiles.forEach(file => data.append('billImages', file));
      await api.put(`/medicines/purchase-bills/${editBill._id}`, data, { headers: { 'Content-Type': 'multipart/form-data' } });
      alert('✅ Purchase bill update ho gayi aur inventory stock adjust ho gaya.');
      setEditBill(null);
      fetchBills();
    } catch (err) {
      alert(err.response?.data?.message || 'Bill update nahi ho saki.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteBill = async (bill) => {
    if (!window.confirm(`Kya aap "${bill.supplierName}" (Invoice: ${bill.invoiceNumber}) ki bill delete karna chahte hain? Iska stock bhi wapas ghat jayega. Ye action undo nahi ho sakta.`)) return;
    setDeletingId(bill._id);
    try {
      await api.delete(`/medicines/purchase-bills/${bill._id}`);
      alert('🗑️ Purchase bill delete ho gayi.');
      if (expandedId === bill._id) setExpandedId(null);
      fetchBills();
    } catch (err) {
      alert(err.response?.data?.message || 'Bill delete nahi ho saki.');
    } finally {
      setDeletingId(null);
    }
  };

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  const statusBadge = (bill) => {
    const due = Number(bill.balanceDue ?? Math.max(0, (bill.grandTotal || 0) - (bill.amountPaid || 0)));
    const statusText = bill.paymentStatus || (due <= 0 ? 'Paid' : (Number(bill.amountPaid || 0) > 0 ? 'Partial' : 'Credit'));
    if (statusText === 'Paid') return <span className="px-2.5 py-1 rounded-md text-xs font-extrabold bg-green-100 text-green-800 border border-green-200">✅ Paid</span>;
    if (statusText === 'Partial') return <span className="px-2.5 py-1 rounded-md text-xs font-extrabold bg-amber-100 text-amber-800 border border-amber-200">⏳ Partial</span>;
    return <span className="px-2.5 py-1 rounded-md text-xs font-extrabold bg-red-100 text-red-800 border border-red-200">💳 Credit</span>;
  };

  const editErrCls = (key, base = 'border-slate-300') => editErrors[key] ? `${base.replace('border-slate-300', 'border-red-500')} bg-red-50/40 focus:border-red-500 focus:ring-red-200` : base;
  const editField = (key) => editErrors[key] ? 'w-full rounded-md border border-red-500 bg-red-50/40 px-2 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200' : 'w-full rounded-md border border-slate-300 px-2 py-2 text-sm outline-none focus:border-teal-500';

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 flex items-center gap-2">🧾 Purchase Bill History</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Saare purchase bills ki history — search karein, status filter karein, items aur bill photo dekhein.
          </p>
        </div>
        <button onClick={fetchBills} className="px-4 py-2 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded-lg text-sm font-bold border border-teal-200 transition-colors">
          🔄 Refresh
        </button>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Total Bills</p>
          <p className="text-2xl font-extrabold text-slate-800 mt-1">{summary.totalBills || 0}</p>
          <p className="text-[11px] text-slate-400 mt-1">Iss filter me kitni bills hain</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-blue-200 bg-blue-50/30 shadow-xs">
          <p className="text-xs font-extrabold text-blue-600 uppercase tracking-wider">Total Purchased</p>
          <p className="text-2xl font-extrabold text-blue-700 mt-1">{money(summary.totalPurchased)}</p>
          <p className="text-[11px] text-blue-400 mt-1">Bills ki total value</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-green-200 bg-green-50/30 shadow-xs">
          <p className="text-xs font-extrabold text-green-700 uppercase tracking-wider">Total Paid</p>
          <p className="text-2xl font-extrabold text-green-700 mt-1">{money(summary.totalPaid)}</p>
          <p className="text-[11px] text-green-600 mt-1">Suppliers ko pay ho chuka</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-red-200 bg-red-50/30 shadow-xs">
          <p className="text-xs font-extrabold text-red-600 uppercase tracking-wider">Credit Due</p>
          <p className="text-2xl font-extrabold text-red-600 mt-1">{money(summary.totalDue)}</p>
          <p className="text-[11px] text-red-400 mt-1">Pay karne baaki hai</p>
        </div>
      </div>

      {/* FILTERS */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">Search</label>
          <input
            type="text"
            placeholder="Supplier name ya invoice no..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') applyFilters(); }}
            className="w-full px-4 py-2 rounded-xl border border-slate-300 text-sm outline-none focus:border-teal-500"
          />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold outline-none focus:border-teal-500 bg-white">
            <option value="ALL">All Statuses</option>
            <option value="Credit">Credit (Udhar)</option>
            <option value="Partial">Partial</option>
            <option value="Paid">Paid</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">From Date</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-300 text-sm outline-none focus:border-teal-500" />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">To Date</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-300 text-sm outline-none focus:border-teal-500" />
        </div>
        <button onClick={applyFilters} className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold shadow-xs transition-colors">
          🔍 Apply Filters
        </button>
      </div>

      {/* BILLS TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-extrabold text-[11px] border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Invoice No.</th>
                <th className="px-4 py-3 text-right">Bill Total</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Due</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Items</th>
                <th className="px-4 py-3 text-center">Photo</th>
                <th className="px-4 py-3 text-center">Edit</th>
                <th className="px-4 py-3 text-center">Delete</th>
                <th className="px-4 py-3 text-center">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {loading ? (
                <tr><td colSpan="12" className="text-center py-10 text-slate-400 italic">Loading bills...</td></tr>
              ) : bills.length === 0 ? (
                <tr><td colSpan="12" className="text-center py-10 text-slate-400 italic">Koi bill nahi mili. Filter change karke try karein.</td></tr>
              ) : bills.map((bill) => {
                const due = Number(bill.balanceDue ?? Math.max(0, (bill.grandTotal || 0) - (bill.amountPaid || 0)));
                const expanded = expandedId === bill._id;
                return (
                  <React.Fragment key={bill._id}>
                    <tr className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${expanded ? 'bg-teal-50/40' : ''}`} onClick={() => setExpandedId(expanded ? null : bill._id)}>
                      <td className="px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">{dateFmt(bill.invoiceDate)}</td>
                      <td className="px-4 py-3 font-bold text-slate-800">{bill.supplierName}</td>
                      <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">{bill.invoiceNumber}</td>
                      <td className="px-4 py-3 text-right font-extrabold text-slate-800">{money(bill.grandTotal)}</td>
                      <td className="px-4 py-3 text-right font-bold text-green-700">{money(bill.amountPaid)}</td>
                      <td className="px-4 py-3 text-right font-extrabold text-red-600">{money(due)}</td>
                      <td className="px-4 py-3 text-center">{statusBadge(bill)}</td>
                      <td className="px-4 py-3 text-center font-bold text-slate-600">{(bill.items || []).length}</td>
                      <td className="px-4 py-3 text-center">
                        {(bill.billImages?.length > 0 || bill.billImage) ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setImageBill(bill); }}
                            className="px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 text-xs font-bold transition-colors"
                          >
                            🖼 View{bill.billImages?.length > 1 ? ` (${bill.billImages.length})` : ''}
                          </button>
                        ) : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openEdit(bill); }}
                          className="px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 text-xs font-bold transition-colors"
                        >
                          ✏️ Edit
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          disabled={deletingId === bill._id}
                          onClick={(e) => { e.stopPropagation(); handleDeleteBill(bill); }}
                          className="px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 text-xs font-bold transition-colors disabled:opacity-50"
                        >
                          {deletingId === bill._id ? '⏳...' : '🗑️ Delete'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setExpandedId(expanded ? null : bill._id); }}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 text-xs font-bold transition-colors"
                        >
                          {expanded ? '▲ Hide' : '▼ View'}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="bg-slate-50/60">
                        <td colSpan="12" className="px-4 py-4">
                          <div className="grid md:grid-cols-2 gap-4 mb-3 text-xs">
                            <div className="bg-white rounded-xl border border-slate-200 p-3 grid grid-cols-2 gap-2">
                              <div><span className="text-slate-400 block font-bold uppercase text-[10px]">Bill Type</span><span className="font-bold text-slate-700">{bill.billType || '-'}</span></div>
                              <div><span className="text-slate-400 block font-bold uppercase text-[10px]">Payment Mode</span><span className="font-bold text-slate-700">{bill.paymentMode || '-'}</span></div>
                              <div><span className="text-slate-400 block font-bold uppercase text-[10px]">GSTIN</span><span className="font-bold text-slate-700">{bill.supplierGstin || '-'}</span></div>
                              <div><span className="text-slate-400 block font-bold uppercase text-[10px]">Saved On</span><span className="font-bold text-slate-700">{dateFmt(bill.createdAt)}</span></div>
                              <div className="col-span-2"><span className="text-slate-400 block font-bold uppercase text-[10px]">Notes</span><span className="font-bold text-slate-700">{bill.notes || bill.paymentRemarks || '-'}</span></div>
                            </div>
                            <div className="bg-white rounded-xl border border-slate-200 p-3 grid grid-cols-2 gap-2">
                              <div><span className="text-slate-400 block font-bold uppercase text-[10px]">Subtotal</span><span className="font-bold text-slate-700">{money(bill.subtotal)}</span></div>
                              <div><span className="text-slate-400 block font-bold uppercase text-[10px]">Item Discount</span><span className="font-bold text-red-600">- {money(bill.discountTotal)}</span></div>
                              <div><span className="text-slate-400 block font-bold uppercase text-[10px]">Extra Bill Discount</span><span className="font-bold text-amber-600">- {money(bill.additionalDiscount)}</span></div>
                              <div><span className="text-slate-400 block font-bold uppercase text-[10px]">GST</span><span className="font-bold text-slate-700">{money(bill.gstTotal)}</span></div>
                              <div><span className="text-slate-400 block font-bold uppercase text-[10px]">Round Off</span><span className="font-bold text-slate-700">{money(bill.roundOff)}</span></div>
                            </div>
                          </div>
                          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                            <table className="w-full text-xs">
                              <thead className="bg-slate-100 text-slate-500 uppercase tracking-wider font-extrabold text-[10px]">
                                <tr>
                                  <th className="px-3 py-2">Medicine</th>
                                  <th className="px-3 py-2">HSN</th>
                                  <th className="px-3 py-2">Batch</th>
                                  <th className="px-3 py-2">Expiry</th>
                                  <th className="px-3 py-2 text-right">Qty</th>
                                  <th className="px-3 py-2 text-right">Free</th>
                                  <th className="px-3 py-2 text-right">MRP</th>
                                  <th className="px-3 py-2 text-right">Rate</th>
                                  <th className="px-3 py-2 text-right">Net Rate</th>
                                  <th className="px-3 py-2 text-right">Disc %</th>
                                  <th className="px-3 py-2 text-right">GST %</th>
                                  <th className="px-3 py-2 text-right">Amount</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {(bill.items || []).map((item, i) => (
                                  <tr key={i}>
                                    <td className="px-3 py-2 font-bold text-slate-800">{item.productName}{item.packing ? <span className="text-slate-400 font-medium"> ({item.packing})</span> : ''}</td>
                                    <td className="px-3 py-2">{item.hsnCode || '-'}</td>
                                    <td className="px-3 py-2">{item.batchNumber || '-'}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">{dateFmt(item.expiryDate)}</td>
                                    <td className="px-3 py-2 text-right font-bold">{item.quantity}</td>
                                    <td className="px-3 py-2 text-right text-green-700 font-bold">{item.freeQuantity || 0}</td>
                                    <td className="px-3 py-2 text-right">{Number(item.mrp || 0).toFixed(2)}</td>
                                    <td className="px-3 py-2 text-right">{Number(item.rate || 0).toFixed(2)}</td>
                                    <td className="px-3 py-2 text-right font-bold text-teal-700">{Number(item.netRate || item.rate || 0).toFixed(2)}</td>
                                    <td className="px-3 py-2 text-right">{item.discount || 0}%</td>
                                    <td className="px-3 py-2 text-right">{item.gst || 0}%</td>
                                    <td className="px-3 py-2 text-right font-extrabold text-slate-800">{money(item.amount)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-slate-200">
            <span className="text-xs text-slate-500 font-semibold">Total {total} bills · Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* EDIT BILL MODAL */}
      {editBill && editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4" onClick={() => setEditBill(null)}>
          <div className="bg-white rounded-2xl max-w-5xl w-full p-5 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-800 text-lg">✏️ Edit Purchase Bill</h3>
                <p className="text-xs text-slate-500 mt-0.5">Bill details aur medicines edit karein — inventory stock automatically adjust hoga.</p>
              </div>
              <button onClick={() => setEditBill(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">✕</button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              {/* BILL HEADER */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Supplier / Party *</label>
                  <input id="edit-field-supplierName" required value={editForm.supplierName} onChange={e => { clearEditError('supplierName'); setEditForm({ ...editForm, supplierName: e.target.value }); }} className={editField('supplierName')} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">GSTIN</label>
                  <input value={editForm.supplierGstin} onChange={e => setEditForm({ ...editForm, supplierGstin: e.target.value })} className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm outline-none focus:border-teal-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Invoice No. *</label>
                  <input id="edit-field-invoiceNumber" required value={editForm.invoiceNumber} onChange={e => { clearEditError('invoiceNumber'); setEditForm({ ...editForm, invoiceNumber: e.target.value }); }} className={editField('invoiceNumber')} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Invoice Date *</label>
                  <input id="edit-field-invoiceDate" required type="date" value={editForm.invoiceDate} onChange={e => { clearEditError('invoiceDate'); setEditForm({ ...editForm, invoiceDate: e.target.value }); }} className={editField('invoiceDate')} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Bill Type</label>
                  <select value={editForm.billType} onChange={e => setEditForm({ ...editForm, billType: e.target.value })} className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm outline-none focus:border-teal-500 bg-white"><option>Credit</option><option>Cash</option><option>GST Invoice</option></select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Payment Mode</label>
                  <select value={editForm.paymentMode} onChange={e => setEditForm({ ...editForm, paymentMode: e.target.value })} className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm outline-none focus:border-teal-500 bg-white"><option>Credit</option><option>Cash</option><option>UPI</option><option>Bank Transfer</option></select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-amber-600">Extra Bill Discount (₹)</label>
                  <input type="number" min="0" step="0.01" value={editForm.additionalDiscount} onChange={e => setEditForm({ ...editForm, additionalDiscount: e.target.value })} className="w-full rounded-md border border-amber-300 bg-amber-50/40 px-2 py-2 text-sm font-bold text-amber-800 outline-none focus:border-amber-500" />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Notes</label>
                  <input value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm outline-none focus:border-teal-500" />
                </div>
                <div className="sm:col-span-2 lg:col-span-4">
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Bill Photo / PDF</label>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    onChange={e => setEditFiles(Array.from(e.target.files || []))}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-teal-500 bg-white file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:bg-teal-50 file:text-teal-700 file:font-bold file:text-xs"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    {editFiles.length > 0
                      ? `${editFiles.length} nayi file(s) select hui — save karne par purani photo/PDF replace ho jayegi.`
                      : ((editBill?.billImages?.length || (editBill?.billImage ? 1 : 0)) > 0
                        ? `Abhi ${editBill.billImages?.length || 1} file(s) lagi hain. Nayi file chunein sirf tabhi jab replace karna ho.`
                        : 'Koi photo/PDF nahi lagi hai. Yahan se image ya PDF upload kar sakte hain.')}
                  </p>
                </div>
              </div>

              {/* ITEMS */}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 text-slate-500 uppercase tracking-wider font-extrabold text-[10px]">
                    <tr>
                      <th className="px-2 py-2">Medicine *</th>
                      <th className="px-2 py-2">HSN</th>
                      <th className="px-2 py-2">Batch *</th>
                      <th className="px-2 py-2">Expiry *</th>
                      <th className="px-2 py-2 text-right">Qty *</th>
                      <th className="px-2 py-2 text-right">Free</th>
                      <th className="px-2 py-2 text-right">MRP *</th>
                      <th className="px-2 py-2 text-right">Rate *</th>
                      <th className="px-2 py-2 text-right">Net Rate</th>
                      <th className="px-2 py-2 text-right">Sale Price</th>
                      <th className="px-2 py-2 text-right">Disc %</th>
                      <th className="px-2 py-2 text-right">GST %</th>
                      <th className="px-2 py-2 text-right">Price</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {editItems.map((item, index) => (
                      <tr key={index}>
                        <td className="px-2 py-1.5"><input id={`edit-field-row${index}-productName`} value={item.productName} onChange={e => setEditItem(index, 'productName', e.target.value)} placeholder="Medicine name" className={`w-full min-w-[130px] rounded border px-2 py-1.5 outline-none focus:ring-2 ${editErrCls(`row${index}.productName`, 'border-slate-300 focus:border-teal-500')}`} /></td>
                        <td className="px-2 py-1.5"><input id={`edit-field-row${index}-hsnCode`} value={item.hsnCode} onChange={e => setEditItem(index, 'hsnCode', e.target.value)} placeholder="HSN" className="w-full min-w-[80px] rounded border border-slate-300 px-2 py-1.5 outline-none focus:ring-2 focus:border-teal-500" /></td>
                        <td className="px-2 py-1.5"><input id={`edit-field-row${index}-batchNumber`} value={item.batchNumber} onChange={e => setEditItem(index, 'batchNumber', e.target.value)} placeholder="Batch" className={`w-full min-w-[90px] rounded border px-2 py-1.5 outline-none focus:ring-2 ${editErrCls(`row${index}.batchNumber`, 'border-slate-300 focus:border-teal-500')}`} /></td>
                        <td className="px-2 py-1.5"><input id={`edit-field-row${index}-expiryDate`} type="date" value={item.expiryDate} onChange={e => setEditItem(index, 'expiryDate', e.target.value)} className={`w-full min-w-[110px] rounded border px-2 py-1.5 outline-none focus:ring-2 ${editErrCls(`row${index}.expiryDate`, 'border-slate-300 focus:border-teal-500')}`} /></td>
                        {['quantity', 'freeQuantity', 'mrp', 'rate', 'netRate', 'sellingPrice', 'discount', 'gst'].map(field => (
                          <td key={field} className="px-2 py-1.5"><input id={`edit-field-row${index}-${field}`} type="number" min="0" step="0.01" value={item[field]} onChange={e => setEditItem(index, field, e.target.value)} className={`w-full min-w-[70px] rounded border px-2 py-1.5 outline-none focus:ring-2 ${editErrCls(`row${index}.${field}`, 'border-slate-300 focus:border-teal-500')}`} /></td>
                        ))}
                        <td className="whitespace-nowrap px-2 py-1.5 font-bold text-slate-700">{money(editPriceAmount(item))}</td>
                        <td className="px-2 py-1.5"><button type="button" disabled={editItems.length === 1} onClick={() => setEditItems(editItems.filter((_, i) => i !== index))} className="rounded p-1.5 text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-300" title="Remove">✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={() => setEditItems([...editItems, emptyEditItem()])} className="px-4 py-2 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 text-xs font-bold transition-colors">+ Add Medicine</button>

              {/* TOTALS + SAVE */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl bg-slate-50 border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-600 space-y-1">
                  <div>Subtotal: <b>{money(editTotals.subtotal)}</b> · Item Discount: <b className="text-red-600">- {money(editTotals.discount)}</b> · Extra Discount: <b className="text-amber-600">- {money(editAdditionalDiscount)}</b> · GST: <b>{money(editTotals.gst)}</b> · Round: <b>{money(editRoundOff)}</b></div>
                  <div className="text-sm font-extrabold text-slate-800">Grand Total: <span className="text-teal-700">{money(editGrandTotal)}</span> <span className="font-semibold text-slate-400">(purana total: {money(editBill.grandTotal)})</span></div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditBill(null)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs font-bold">Cancel</button>
                  <button type="submit" disabled={savingEdit} className="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold disabled:opacity-50">💾 {savingEdit ? 'Saving...' : 'Save Changes'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BILL IMAGE MODAL */}
      {imageBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4" onClick={() => setImageBill(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full p-4 shadow-2xl space-y-3 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-800">
                  🖼 Bill Photo{(imageBill.billImages?.length > 1) ? `s (${imageBill.billImages.length} pages)` : ''} — {imageBill.supplierName} ({imageBill.invoiceNumber})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{dateFmt(imageBill.invoiceDate)} · Total {money(imageBill.grandTotal)}</p>
              </div>
              <button onClick={() => setImageBill(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">✕</button>
            </div>
            <div className="space-y-3">
              {(imageBill.billImages?.length > 0 ? imageBill.billImages : [imageBill.billImage]).filter(Boolean).map((url, idx, arr) => (
                <div key={idx}>
                  {arr.length > 1 && <p className="text-xs font-bold text-slate-400 mb-1">Page {idx + 1} of {arr.length}</p>}
                  {url.endsWith('.pdf') ? (
                    <a href={url} target="_blank" rel="noreferrer" className="block text-center py-8 rounded-xl bg-slate-50 border border-slate-200 font-bold text-indigo-700 hover:bg-indigo-50">
                      📄 PDF file hai — nayi tab me kholne ke liye click karein
                    </a>
                  ) : (
                    <img src={url} alt={`Purchase bill page ${idx + 1}`} className="w-full rounded-xl border border-slate-200" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseBillHistory;
