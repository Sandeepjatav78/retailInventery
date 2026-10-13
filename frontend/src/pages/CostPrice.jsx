import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api/axios';
import { filterMedicinesFromCache, getCachedMedicines, syncMedicinesCache } from '../utils/medicineCache';
import { formatExpiryShort, getExpiryInfo } from '../utils/costPriceWindow';

const money = (val) => `₹${Number(val || 0).toFixed(2)}`;
const formatDate = (v) => {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
};

// Admin-only cost price lookup: every batch of a medicine with CP, selling
// price, margin and where/when it was purchased.
const CostPrice = () => {
  const [query, setQuery] = useState('');
  const [inventory, setInventory] = useState(() => getCachedMedicines());
  const [includeOutOfStock, setIncludeOutOfStock] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    syncMedicinesCache(api).then((fresh) => { if (mounted) setInventory(fresh); }).catch(console.error);
    searchRef.current?.focus();
    return () => { mounted = false; };
  }, []);

  const results = useMemo(() => {
    if (query.trim().length < 2) return [];
    return filterMedicinesFromCache(inventory, query, { includeOutOfStock, userRole: 'admin' });
  }, [inventory, query, includeOutOfStock]);

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <h1 className="text-xl font-extrabold text-slate-900">🏷 Cost Price (CP) Check</h1>
        <p className="text-xs text-slate-500 mt-1">Medicine ka naam ya batch likhein — har batch ka CP, selling price, margin aur purchase details dikhenge.</p>
        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search medicine / batch..."
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          />
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <input type="checkbox" checked={includeOutOfStock} onChange={(e) => setIncludeOutOfStock(e.target.checked)} />
            Out of stock bhi dikhayein
          </label>
        </div>
      </div>

      {query.trim().length >= 2 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[11px] font-extrabold border-b border-slate-200">
              <tr>
                <th className="px-3 py-3">Medicine</th>
                <th className="px-3 py-3">Batch / Exp</th>
                <th className="px-3 py-3 text-right">Stock</th>
                <th className="px-3 py-3 text-right text-red-600">CP</th>
                <th className="px-3 py-3 text-right">Selling</th>
                <th className="px-3 py-3 text-right">MRP</th>
                <th className="px-3 py-3 text-right">Margin</th>
                <th className="px-3 py-3 text-right">GST</th>
                <th className="px-3 py-3">Party / Purchase</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {results.length === 0 ? (
                <tr><td colSpan="9" className="text-center py-8 text-slate-400 italic">"{query}" se koi medicine nahi mili.</td></tr>
              ) : results.map((med) => {
                const cp = Number(med.costPrice || 0);
                const sp = Number(med.sellingPrice || 0);
                const margin = sp - cp;
                const marginPct = sp > 0 ? (margin / sp) * 100 : 0;
                const expired = getExpiryInfo(med.expiryDate)?.isExpired;
                return (
                  <tr key={med._id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-semibold text-slate-800">{med.productName}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                      {med.batchNumber}
                      <span className={`block ${expired ? 'text-red-600 font-bold' : 'text-slate-400'}`}>{expired ? 'EXPIRED ' : 'Exp '}{formatExpiryShort(med.expiryDate)}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">{Number(med.quantity || 0)}</td>
                    <td className="px-3 py-2.5 text-right font-extrabold text-red-600">{money(cp)}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-teal-700">{money(sp)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{money(med.mrp)}</td>
                    <td className={`px-3 py-2.5 text-right font-bold whitespace-nowrap ${margin < 0 ? 'text-red-600' : 'text-green-700'}`}>
                      {money(margin)}<span className="block text-[11px] font-semibold">{marginPct.toFixed(1)}%</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">{Number(med.gst || 0)}%</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {med.partyName || '-'}
                      <span className="block text-slate-400">Inv {med.purchaseInvoiceNo || '-'} · {formatDate(med.purchaseDate)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CostPrice;
