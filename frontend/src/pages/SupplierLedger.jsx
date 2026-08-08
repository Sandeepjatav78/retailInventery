import React, { useEffect, useState } from 'react';
import api from '../api/axios';

const money = (val) => `₹${Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SupplierLedger = () => {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ totalPurchased: 0, totalPaid: 0, totalCreditDue: 0, supplierCount: 0 });
  const [suppliers, setSuppliers] = useState([]);
  const [bills, setBills] = useState([]);

  // Selected Party View (null = All Parties Folder View, string = Specific Party)
  const [selectedParty, setSelectedParty] = useState(null);

  // Filters
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Payment Modal State
  const [paymentModalBill, setPaymentModalBill] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('Cash');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payRemark, setPayRemark] = useState('');
  const [submittingPay, setSubmittingPay] = useState(false);

  const fetchLedger = async () => {
    setLoading(true);
    try {
      const res = await api.get('/medicines/supplier-ledger');
      if (res.data) {
        setSummary(res.data.summary || {});
        setSuppliers(res.data.suppliers || []);
        setBills(res.data.bills || []);
      }
    } catch (err) {
      console.error(err);
      alert('Could not load supplier ledger data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, []);

  const handleOpenPayModal = (bill) => {
    const due = Number(bill.balanceDue ?? Math.max(0, (bill.grandTotal || 0) - (bill.amountPaid || 0)));
    setPaymentModalBill(bill);
    setPayAmount(String(due));
    setPayMode('UPI');
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayRemark('');
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!paymentModalBill) return;
    const amt = Number(payAmount);
    if (!amt || amt <= 0) return alert('Kripya valid payment amount bharein.');

    setSubmittingPay(true);
    try {
      await api.post(`/medicines/purchase-bills/${paymentModalBill._id}/pay`, {
        amount: amt,
        paymentMode: payMode,
        paymentDate: payDate,
        remark: payRemark
      });
      alert('✅ Payment record save ho gaya!');
      setPaymentModalBill(null);
      fetchLedger();
    } catch (err) {
      alert(err.response?.data?.message || 'Payment save nahi ho saka.');
    } finally {
      setSubmittingPay(false);
    }
  };

  // Filtered Suppliers for Folder View
  const filteredSuppliers = suppliers.filter(sup => {
    const q = searchQuery.toLowerCase().trim();
    return !q || sup.supplierName.toLowerCase().includes(q) || (sup.supplierGstin && sup.supplierGstin.toLowerCase().includes(q));
  });

  // Selected Party Object & Bills
  const activePartyObj = suppliers.find(s => s.supplierName.toLowerCase() === (selectedParty || '').toLowerCase());
  const activePartyBills = bills.filter(bill => {
    if (!selectedParty) return false;
    const matchesParty = String(bill.supplierName).toLowerCase() === selectedParty.toLowerCase();
    const matchesStatus = selectedStatus === 'ALL' || (bill.paymentStatus || 'Credit').toUpperCase() === selectedStatus.toUpperCase();
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q ||
      String(bill.invoiceNumber || '').toLowerCase().includes(q) ||
      String(bill.paymentRemarks || '').toLowerCase().includes(q);
    return matchesParty && matchesStatus && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">

      {/* --- LEVEL 1: ALL PARTIES DIRECTORY VIEW --- */}
      {!selectedParty ? (
        <>
          {/* HEADER */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div>
              <h1 className="text-2xl font-extrabold text-slate-800 flex items-center gap-2">
                📖 Wholesaler / Party Ledger
              </h1>
              <p className="text-xs md:text-sm text-slate-500 mt-1">
                Pehle supplier party select karein, uske baad andar unke saare bills & credit details dekhein.
              </p>
            </div>
            <button
              onClick={fetchLedger}
              className="px-4 py-2 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded-lg text-sm font-bold border border-teal-200 transition-colors"
            >
              🔄 Refresh Ledger
            </button>
          </div>

          {/* SUMMARY KPI CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Total Goods Purchased</p>
                <p className="text-2xl font-extrabold text-slate-800 mt-1">{money(summary.totalPurchased)}</p>
                <p className="text-[11px] text-slate-400 mt-1">Saare purchase bills ki total value</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl font-bold">📦</div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-red-200 bg-red-50/30 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-extrabold text-red-600 uppercase tracking-wider">Total Credit Due (Udhar)</p>
                <p className="text-2xl font-extrabold text-red-600 mt-1">{money(summary.totalCreditDue)}</p>
                <p className="text-[11px] text-red-400 mt-1">Suppliers ko pay karne baaki hai</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-red-100 text-red-600 flex items-center justify-center text-xl font-bold">💳</div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-green-200 bg-green-50/30 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-extrabold text-green-700 uppercase tracking-wider">Total Paid Amount</p>
                <p className="text-2xl font-extrabold text-green-700 mt-1">{money(summary.totalPaid)}</p>
                <p className="text-[11px] text-green-600 mt-1">Suppliers ko already pay ho chuka hai</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-green-100 text-green-700 flex items-center justify-center text-xl font-bold">💵</div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Wholesaler Parties</p>
                <p className="text-2xl font-extrabold text-slate-800 mt-1">{summary.supplierCount || 0}</p>
                <p className="text-[11px] text-slate-400 mt-1">Total active supplier vendors</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center text-xl font-bold">🏢</div>
            </div>
          </div>

          {/* PARTY DIRECTORY SECTION */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
                  📁 Select Supplier Party to View Ledger
                </h2>
                <p className="text-xs text-slate-500">Party par click karke uske saare bills aur credit transactions khol kar dekhein.</p>
              </div>
              <input
                type="text"
                placeholder="Search Party Name or GSTIN..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-sm outline-none focus:border-teal-500 w-full sm:w-64"
              />
            </div>

            {loading ? (
              <p className="text-center text-slate-400 py-10">Loading parties...</p>
            ) : filteredSuppliers.length === 0 ? (
              <p className="text-center text-slate-400 py-10 italic">Koi supplier party match nahi hui.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredSuppliers.map((sup, idx) => (
                  <div
                    key={idx}
                    onClick={() => { setSelectedParty(sup.supplierName); setSearchQuery(''); }}
                    className="group bg-slate-50/60 hover:bg-teal-50/50 p-5 rounded-2xl border border-slate-200 hover:border-teal-400 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-xs font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded">Party</span>
                          <h3 className="font-extrabold text-slate-800 text-lg mt-1 group-hover:text-teal-700 transition-colors">
                            {sup.supplierName}
                          </h3>
                          {sup.supplierGstin && (
                            <p className="text-xs text-slate-500 mt-0.5">GSTIN: {sup.supplierGstin}</p>
                          )}
                        </div>
                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-slate-700 border border-slate-200 shadow-2xs">
                          {sup.billCount} {sup.billCount === 1 ? 'Bill' : 'Bills'}
                        </span>
                      </div>

                      {/* STATS */}
                      <div className="mt-5 grid grid-cols-3 gap-2 py-3 px-3 bg-white rounded-xl border border-slate-200/80 text-center text-xs">
                        <div>
                          <span className="block text-slate-400 font-bold uppercase text-[10px]">Purchased</span>
                          <span className="font-extrabold text-slate-800 mt-0.5 block">{money(sup.totalPurchased)}</span>
                        </div>
                        <div>
                          <span className="block text-green-600 font-bold uppercase text-[10px]">Paid</span>
                          <span className="font-extrabold text-green-700 mt-0.5 block">{money(sup.totalPaid)}</span>
                        </div>
                        <div>
                          <span className="block text-red-600 font-bold uppercase text-[10px]">Credit Due</span>
                          <span className="font-extrabold text-red-600 mt-0.5 block">{money(sup.balanceDue)}</span>
                        </div>
                      </div>
                    </div>

                    <button className="mt-4 w-full py-2.5 rounded-xl bg-teal-600 text-white font-bold text-xs group-hover:bg-teal-700 transition-colors flex items-center justify-center gap-2 shadow-xs">
                      📂 Open {sup.supplierName} Ledger ➔
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        /* --- LEVEL 2: SINGLE PARTY DETAILED LEDGER VIEW --- */
        <div className="space-y-6 animate-in fade-in duration-150">
          
          {/* BACK BUTTON & PARTY HEADER */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <button
              onClick={() => { setSelectedParty(null); setSearchQuery(''); }}
              className="inline-flex items-center gap-2 text-sm font-bold text-teal-700 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 px-3.5 py-1.5 rounded-lg border border-teal-200 transition-colors"
            >
              ← Back to All Parties
            </button>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2 border-t border-slate-100">
              <div>
                <span className="text-xs font-extrabold text-teal-700 uppercase tracking-wider">Party Ledger Details</span>
                <h1 className="text-2xl font-extrabold text-slate-900">{selectedParty}</h1>
                {activePartyObj?.supplierGstin && (
                  <p className="text-xs text-slate-500 mt-0.5">GSTIN: {activePartyObj.supplierGstin}</p>
                )}
              </div>

              {/* PARTY TOTAL SUMMARY */}
              {activePartyObj && (
                <div className="flex flex-wrap gap-3">
                  <div className="bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 text-center">
                    <span className="block text-[10px] font-bold uppercase text-slate-400">Total Purchased</span>
                    <span className="text-base font-extrabold text-slate-800">{money(activePartyObj.totalPurchased)}</span>
                  </div>
                  <div className="bg-green-50 px-4 py-2.5 rounded-xl border border-green-200 text-center">
                    <span className="block text-[10px] font-bold uppercase text-green-700">Total Paid</span>
                    <span className="text-base font-extrabold text-green-700">{money(activePartyObj.totalPaid)}</span>
                  </div>
                  <div className="bg-red-50 px-4 py-2.5 rounded-xl border border-red-200 text-center">
                    <span className="block text-[10px] font-bold uppercase text-red-600">Credit Remaining Due</span>
                    <span className="text-base font-extrabold text-red-600">{money(activePartyObj.balanceDue)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* BILLS & PAYMENTS LEDGER TABLE FOR THIS PARTY */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  📋 Bills & Transactions of {selectedParty}
                </h2>
                <p className="text-xs text-slate-500">Iss party ke saare invoices, payments aur outstanding dues.</p>
              </div>

              <div className="flex flex-wrap gap-2 w-full md:w-auto">
                <input
                  type="text"
                  placeholder="Search Invoice No..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs outline-none focus:border-teal-500 w-full sm:w-48"
                />

                <select
                  value={selectedStatus}
                  onChange={e => setSelectedStatus(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold outline-none focus:border-teal-500 bg-white"
                >
                  <option value="ALL">All Payment Statuses</option>
                  <option value="CREDIT">Credit (Udhar / Unpaid)</option>
                  <option value="PARTIAL">Partial Payment</option>
                  <option value="PAID">Fully Paid</option>
                </select>
              </div>
            </div>

            {/* TABLE */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-extrabold text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Bill Date</th>
                    <th className="px-4 py-3">Invoice No.</th>
                    <th className="px-4 py-3 text-right">Bill Total</th>
                    <th className="px-4 py-3 text-right">Paid Amount</th>
                    <th className="px-4 py-3 text-right">Remaining Due</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3">Remarks / Notes</th>
                    <th className="px-4 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {activePartyBills.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="text-center py-8 text-slate-400 italic">Iss party ke koi matching bills nahi mile.</td>
                    </tr>
                  ) : (
                    activePartyBills.map((bill) => {
                      const grandTotal = Number(bill.grandTotal || 0);
                      const paid = Number(bill.amountPaid || (bill.paymentStatus === 'Paid' ? grandTotal : 0));
                      const due = Number(bill.balanceDue ?? Math.max(0, grandTotal - paid));
                      const status = bill.paymentStatus || (due <= 0 ? 'Paid' : (paid > 0 ? 'Partial' : 'Credit'));

                      return (
                        <tr key={bill._id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">
                            {new Date(bill.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">
                            {bill.invoiceNumber}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-slate-800">
                            {money(grandTotal)}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-green-700">
                            {money(paid)}
                          </td>
                          <td className="px-4 py-3 text-right font-extrabold text-red-600">
                            {money(due)}
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            {status === 'Paid' && (
                              <span className="px-2.5 py-1 rounded-md text-xs font-extrabold bg-green-100 text-green-800 border border-green-200">
                                ✅ Fully Paid
                              </span>
                            )}
                            {status === 'Partial' && (
                              <span className="px-2.5 py-1 rounded-md text-xs font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
                                ⏳ Partial ({money(paid)})
                              </span>
                            )}
                            {status === 'Credit' && (
                              <span className="px-2.5 py-1 rounded-md text-xs font-extrabold bg-red-100 text-red-800 border border-red-200">
                                💳 Credit (Udhar)
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 max-w-[200px] truncate">
                            {bill.paymentRemarks || bill.notes || '-'}
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            {due > 0 ? (
                              <button
                                onClick={() => handleOpenPayModal(bill)}
                                className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition-colors"
                              >
                                💵 Pay Due
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400 font-semibold">Clear</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- RECORD PAYMENT MODAL --- */}
      {paymentModalBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-800 text-lg">💵 Record Supplier Payment</h3>
                <p className="text-xs text-slate-500 mt-0.5">{paymentModalBill.supplierName} (Inv: {paymentModalBill.invoiceNumber})</p>
              </div>
              <button onClick={() => setPaymentModalBill(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">✕</button>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-400 block font-bold uppercase">Total Bill</span>
                <span className="font-extrabold text-slate-800 text-sm">{money(paymentModalBill.grandTotal)}</span>
              </div>
              <div>
                <span className="text-red-500 block font-bold uppercase">Current Due</span>
                <span className="font-extrabold text-red-600 text-sm">{money(paymentModalBill.balanceDue ?? (paymentModalBill.grandTotal - (paymentModalBill.amountPaid || 0)))}</span>
              </div>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Payment Amount (₹) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  step="0.01"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-sm font-bold text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Payment Mode</label>
                  <select
                    value={payMode}
                    onChange={e => setPayMode(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-xs font-semibold outline-none focus:border-teal-500 bg-white"
                  >
                    <option value="UPI">UPI / GPay / PhonePe</option>
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer (NEFT/RTGS)</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Payment Date</label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={e => setPayDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs font-semibold outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Payment Remark / Note</label>
                <input
                  type="text"
                  placeholder="e.g. Paid via PhonePe Txn #12345"
                  value={payRemark}
                  onChange={e => setPayRemark(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs outline-none focus:border-teal-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPaymentModalBill(null)}
                  className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingPay}
                  className="flex-1 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs disabled:opacity-50"
                >
                  {submittingPay ? 'Saving...' : 'Confirm Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierLedger;
