import React, { useMemo, useState } from 'react';
import api from '../api/axios';

const emptyItem = () => ({ productName: '', packing: '', batchNumber: '', manufacturer: '', hsnCode: '', expiryDate: '', quantity: '1', freeQuantity: '0', mrp: '', rate: '', sellingPrice: '', discount: '0', gst: '5' });
const money = (value) => `₹${Number(value || 0).toFixed(2)}`;

const PurchaseBillEntry = () => {
  const [bill, setBill] = useState({ supplierName: '', supplierGstin: '', invoiceNumber: '', invoiceDate: new Date().toISOString().slice(0, 10), billType: 'Credit', paymentMode: 'Credit', notes: '', billFile: null });
  const [items, setItems] = useState([emptyItem()]);
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => items.reduce((result, item) => {
    const gross = Number(item.quantity || 0) * Number(item.rate || 0);
    const discount = gross * Number(item.discount || 0) / 100;
    const taxable = gross - discount;
    const gst = taxable * Number(item.gst || 0) / 100;
    result.subtotal += taxable;
    result.discount += discount;
    result.gst += gst;
    return result;
  }, { subtotal: 0, discount: 0, gst: 0 }), [items]);
  const beforeRound = totals.subtotal + totals.gst;
  const roundOff = Math.round(beforeRound) - beforeRound;
  const grandTotal = beforeRound + roundOff;

  const setItem = (index, field, value) => setItems(prev => prev.map((item, itemIndex) => {
    if (itemIndex !== index) return item;
    const next = { ...item, [field]: value };
    if (field === 'rate' && !item.sellingPrice) next.sellingPrice = value;
    return next;
  }));

  const lineTotal = (item) => {
    const taxable = Number(item.quantity || 0) * Number(item.rate || 0) * (1 - Number(item.discount || 0) / 100);
    return taxable + (taxable * Number(item.gst || 0) / 100);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!bill.supplierName.trim() || !bill.invoiceNumber.trim() || !bill.invoiceDate) return alert('Supplier name, invoice number aur invoice date bharna zaroori hai.');
    const missingRow = items.findIndex(item => !item.productName.trim() || !item.batchNumber.trim() || !item.expiryDate || !item.quantity || item.mrp === '' || item.rate === '');
    if (missingRow !== -1) return alert(`Medicine row ${missingRow + 1} mein required details bhar dijiye.`);
    setSaving(true);
    try {
      const data = new FormData();
      Object.entries(bill).forEach(([key, value]) => { if (key !== 'billFile') data.append(key, value); });
      data.append('items', JSON.stringify(items));
      if (bill.billFile) data.append('billImage', bill.billFile);
      await api.post('/medicines/purchase-bills', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      alert('Purchase bill save ho gaya aur medicines inventory mein add ho gayi.');
      setBill({ supplierName: '', supplierGstin: '', invoiceNumber: '', invoiceDate: new Date().toISOString().slice(0, 10), billType: 'Credit', paymentMode: 'Credit', notes: '', billFile: null });
      setItems([emptyItem()]);
      const input = document.getElementById('purchase-bill-file');
      if (input) input.value = '';
    } catch (error) {
      alert(error.response?.data?.message || 'Purchase bill save nahi ho saka.');
    } finally { setSaving(false); }
  };

  const inputClass = 'w-full min-w-[90px] rounded-md border border-slate-300 px-2 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100';
  const labelClass = 'mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500';

  return <div className="min-h-screen bg-slate-50 p-4 md:p-6">
    <form onSubmit={submit} className="mx-auto max-w-[1500px] space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl font-extrabold text-slate-800">Purchase Bill Entry</h1><p className="text-sm text-slate-500">Supplier bill upload karein, medicines add karein aur total automatically dekhein.</p></div>
        <div className="rounded-lg bg-teal-700 px-5 py-3 text-right text-white shadow-sm"><p className="text-xs font-semibold uppercase tracking-wider text-teal-100">Grand Total</p><p className="text-2xl font-extrabold">{money(grandTotal)}</p></div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <h2 className="mb-4 font-bold text-slate-800">Invoice Details</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><label className={labelClass}>Supplier / Party Name *</label><input required value={bill.supplierName} onChange={e => setBill({ ...bill, supplierName: e.target.value })} placeholder="Rosa Medical Agencies" className={inputClass} /></div>
          <div><label className={labelClass}>Supplier GSTIN</label><input value={bill.supplierGstin} onChange={e => setBill({ ...bill, supplierGstin: e.target.value })} placeholder="06ABCDE1234F1Z5" className={inputClass} /></div>
          <div><label className={labelClass}>Invoice No. *</label><input required value={bill.invoiceNumber} onChange={e => setBill({ ...bill, invoiceNumber: e.target.value })} placeholder="C-09141" className={inputClass} /></div>
          <div><label className={labelClass}>Invoice Date *</label><input required type="date" value={bill.invoiceDate} onChange={e => setBill({ ...bill, invoiceDate: e.target.value })} className={inputClass} /></div>
          <div><label className={labelClass}>Bill Type</label><select value={bill.billType} onChange={e => setBill({ ...bill, billType: e.target.value })} className={inputClass}><option>Credit</option><option>Cash</option><option>GST Invoice</option></select></div>
          <div><label className={labelClass}>Payment Mode</label><select value={bill.paymentMode} onChange={e => setBill({ ...bill, paymentMode: e.target.value })} className={inputClass}><option>Credit</option><option>Cash</option><option>UPI</option><option>Bank Transfer</option></select></div>
          <div className="lg:col-span-2"><label className={labelClass}>Bill Photo / PDF</label><input id="purchase-bill-file" type="file" accept="image/*,.pdf" onChange={e => setBill({ ...bill, billFile: e.target.files?.[0] || null })} className="block w-full rounded-md border border-slate-300 p-1.5 text-sm file:mr-3 file:rounded file:border-0 file:bg-teal-50 file:px-3 file:py-1.5 file:font-semibold file:text-teal-700" /></div>
          <div className="sm:col-span-2 lg:col-span-4"><label className={labelClass}>Notes</label><input value={bill.notes} onChange={e => setBill({ ...bill, notes: e.target.value })} placeholder="Transport, scheme or any note" className={inputClass} /></div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 p-4 md:px-5"><div><h2 className="font-bold text-slate-800">Medicines</h2><p className="text-xs text-slate-500">Free quantity bhi inventory stock mein add hogi.</p></div><button type="button" onClick={() => setItems([...items, emptyItem()])} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700">+ Add Medicine</button></div>
        <div className="overflow-x-auto"><table className="min-w-[1450px] w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr>{['Medicine Name *', 'Packing', 'Batch *', 'Mfr.', 'HSN', 'Expiry *', 'Qty *', 'Free', 'MRP *', 'Rate *', 'Sale Price', 'Disc %', 'GST %', 'Amount', ''].map(title => <th key={title} className="whitespace-nowrap px-2 py-3 font-bold">{title}</th>)}</tr></thead><tbody>
          {items.map((item, index) => <tr key={index} className="border-t border-slate-100 align-top">
            <td className="p-2"><input value={item.productName} onChange={e => setItem(index, 'productName', e.target.value)} placeholder="Medicine name" className={inputClass} /></td>
            <td className="p-2"><input value={item.packing} onChange={e => setItem(index, 'packing', e.target.value)} placeholder="10 tab" className={inputClass} /></td>
            <td className="p-2"><input value={item.batchNumber} onChange={e => setItem(index, 'batchNumber', e.target.value)} placeholder="Batch" className={inputClass} /></td>
            <td className="p-2"><input value={item.manufacturer} onChange={e => setItem(index, 'manufacturer', e.target.value)} placeholder="Mfr" className={inputClass} /></td>
            <td className="p-2"><input value={item.hsnCode} onChange={e => setItem(index, 'hsnCode', e.target.value)} placeholder="3004" className={inputClass} /></td>
            <td className="p-2"><input type="date" value={item.expiryDate} onChange={e => setItem(index, 'expiryDate', e.target.value)} className={inputClass} /></td>
            {['quantity', 'freeQuantity', 'mrp', 'rate', 'sellingPrice', 'discount', 'gst'].map(field => <td key={field} className="p-2"><input type="number" min="0" step="0.01" value={item[field]} onChange={e => setItem(index, field, e.target.value)} className={inputClass} /></td>)}
            <td className="whitespace-nowrap p-2 pt-3 font-bold text-slate-700">{money(lineTotal(item))}</td>
            <td className="p-2"><button type="button" disabled={items.length === 1} onClick={() => setItems(items.filter((_, itemIndex) => itemIndex !== index))} className="rounded p-2 text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-300" title="Remove medicine">✕</button></td>
          </tr>)}
        </tbody></table></div>
      </section>

      <section className="ml-auto max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="space-y-2 text-sm text-slate-600"><div className="flex justify-between"><span>Taxable subtotal</span><b>{money(totals.subtotal)}</b></div><div className="flex justify-between"><span>Total discount</span><b>- {money(totals.discount)}</b></div><div className="flex justify-between"><span>Total GST</span><b>{money(totals.gst)}</b></div><div className="flex justify-between"><span>Round off</span><b>{money(roundOff)}</b></div><div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-lg font-extrabold text-slate-800"><span>Grand Total</span><span>{money(grandTotal)}</span></div></div><button disabled={saving} type="submit" className="mt-5 w-full rounded-lg bg-teal-600 py-3 font-bold text-white hover:bg-teal-700 disabled:bg-teal-300">{saving ? 'Saving bill...' : 'Save Bill & Add Stock'}</button></section>
    </form>
  </div>;
};

export default PurchaseBillEntry;
