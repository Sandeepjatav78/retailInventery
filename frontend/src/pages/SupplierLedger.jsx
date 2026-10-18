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
  const [payMode, setPayMode] = useState('UPI');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payRemark, setPayRemark] = useState('');
  const [submittingPay, setSubmittingPay] = useState(false);
  const [selectedBillIds, setSelectedBillIds] = useState([]);
  // 'selected' = pay the ticked bills, 'round' = pay a lump-sum against the party's total due (oldest bill first)
  const [bulkPaymentOpen, setBulkPaymentOpen] = useState(null);
  const [remarkBill, setRemarkBill] = useState(null);
  const [remarkText, setRemarkText] = useState('');
  const [savingRemark, setSavingRemark] = useState(false);
  const [partyFormOpen, setPartyFormOpen] = useState(false);
  const [mergeFormOpen, setMergeFormOpen] = useState(false);
  const [partyForm, setPartyForm] = useState({});
  const [savingParty, setSavingParty] = useState(false);
  const [mergeTarget, setMergeTarget] = useState('');
  const [viewBill, setViewBill] = useState(null);

  // Delete Party Modal State
  const [deleteParty, setDeleteParty] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Manual Old Bill Entry Modal State
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualForm, setManualForm] = useState({
    supplierName: '',
    supplierGstin: '',
    invoiceNumber: '',
    invoiceDate: new Date().toISOString().slice(0, 10),
    billAmount: '',
    amountPaid: '',
    paymentMode: 'Cash',
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentProof: '',
    notes: ''
  });
  const [savingManual, setSavingManual] = useState(false);

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

  const emptyPartyForm = (name = '', profile = {}) => ({
    name,
    gstin: profile.gstin || '',
    phone: profile.phone || '',
    altPhone: profile.altPhone || '',
    email: profile.email || '',
    contactPerson: profile.contactPerson || '',
    address: profile.address || '',
    city: profile.city || '',
    state: profile.state || '',
    pincode: profile.pincode || '',
    bankName: profile.bankName || '',
    accountNumber: profile.accountNumber || '',
    ifsc: profile.ifsc || '',
    upiId: profile.upiId || '',
    drugLicenseNo: profile.drugLicenseNo || '',
    notes: profile.notes || ''
  });

  const openPartyDetails = async (party = activePartyObj) => {
    if (!party) return;
    try {
      const res = await api.get(`/medicines/supplier-ledger/${encodeURIComponent(party.supplierName)}/details`);
      setPartyForm(emptyPartyForm(party.supplierName, res.data?.supplier || party.profile || { gstin: party.supplierGstin }));
    } catch {
      setPartyForm(emptyPartyForm(party.supplierName, party.profile || { gstin: party.supplierGstin }));
    }
    setPartyFormOpen(true);
  };

  const savePartyDetails = async (e) => {
    e.preventDefault();
    if (!partyForm.name?.trim()) return;
    setSavingParty(true);
    try {
      await api.put(`/medicines/supplier-ledger/${encodeURIComponent(partyForm.name.trim())}`, partyForm);
      setPartyFormOpen(false);
      fetchLedger();
    } catch (err) {
      alert(err.response?.data?.message || 'Party details save nahi ho sakin.');
    } finally {
      setSavingParty(false);
    }
  };

  const toggleBill = (id) => setSelectedBillIds((prev) => prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]);

  const handleBulkPayment = async (e) => {
    e.preventDefault();
    const amount = Number(payAmount);
    if (!activePartyObj || !Number.isFinite(amount) || amount <= 0) return alert('Valid payment amount bharein.');
    const isRound = bulkPaymentOpen === 'round';
    const maxDue = isRound ? Number(activePartyObj.balanceDue || 0) : selectedDue;
    if (amount - maxDue > 0.009) return alert(`Amount ${money(amount)} due ${money(maxDue)} se zyada hai.`);
    try {
      setSubmittingPay(true);
      const res = await api.post('/medicines/supplier-ledger/pay', {
        supplierName: activePartyObj.supplierName,
        amount,
        billIds: isRound ? [] : selectedBillIds,
        paymentMode: payMode,
        paymentDate: payDate,
        remark: payRemark
      });
      alert(res.data?.message || 'Payment bills par distribute ho gaya.');
      setBulkPaymentOpen(null);
      setSelectedBillIds([]);
      fetchLedger();
    } catch (err) {
      alert(err.response?.data?.message || 'Bulk payment save nahi ho saka.');
    } finally {
      setSubmittingPay(false);
    }
  };

  const openBulkPayment = (kind) => {
    setPayAmount(kind === 'selected' ? selectedDue.toFixed(2) : '');
    setPayMode('UPI');
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayRemark('');
    setBulkPaymentOpen(kind);
  };

  const openRemarkEditor = (bill) => {
    setRemarkBill(bill);
    setRemarkText(bill.paymentRemarks || bill.notes || '');
  };

  const handleSaveRemark = async (e) => {
    e.preventDefault();
    if (!remarkBill) return;
    setSavingRemark(true);
    try {
      await api.put(`/medicines/purchase-bills/${remarkBill._id}/remarks`, { paymentRemarks: remarkText, notes: remarkText });
      setBills((prev) => prev.map((bill) => (bill._id === remarkBill._id ? { ...bill, paymentRemarks: remarkText.trim(), notes: remarkText.trim() } : bill)));
      setRemarkBill(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Remarks save nahi ho sake.');
    } finally {
      setSavingRemark(false);
    }
  };

  const handleMergeParty = async (e) => {
    e.preventDefault();
    const target = mergeTarget.trim();
    if (!selectedParty || !target) return;
    if (target === selectedParty) return alert('Naya / sahi naam current naam se alag hona chahiye.');
    // Typed name matching an existing party (any case) merges into that party's exact spelling.
    const existing = suppliers.find((sup) => sup.supplierName.toLowerCase() === target.toLowerCase() && sup.supplierName !== selectedParty);
    const targetName = existing ? existing.supplierName : target;
    if (!window.confirm(`'${selectedParty}' ke saare bills '${targetName}' me move karein?`)) return;
    try {
      const res = await api.post('/medicines/supplier-ledger/merge', { sourceName: selectedParty, targetName });
      alert(res.data?.message || 'Party merge ho gayi.');
      setMergeFormOpen(false);
      setSelectedBillIds([]);
      setSelectedParty(targetName);
      fetchLedger();
    } catch (err) {
      alert(err.response?.data?.message || 'Party merge nahi ho saki.');
    }
  };

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

  const handleDeleteParty = async () => {
    if (!deleteParty) return;
    setDeleting(true);
    try {
      const res = await api.delete(`/medicines/supplier-ledger/${encodeURIComponent(deleteParty.supplierName)}`, {
        data: { force: true }
      });
      alert(res.data.message || 'Party delete ho gayi.');
      setDeleteParty(null);
      fetchLedger();
    } catch (err) {
      alert(err.response?.data?.message || 'Party delete nahi ho saki.');
    } finally {
      setDeleting(false);
    }
  };

  const openManualForm = (supplierName = '') => {
    setManualForm({
      supplierName: supplierName || '',
      supplierGstin: '',
      invoiceNumber: '',
      invoiceDate: new Date().toISOString().slice(0, 10),
      billAmount: '',
      amountPaid: '',
      paymentMode: 'Cash',
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentProof: '',
      notes: ''
    });
    setShowManualForm(true);
  };

  const handleSaveManualBill = async (e) => {
    e.preventDefault();
    const amount = Number(manualForm.billAmount);
    if (!manualForm.supplierName.trim() || !manualForm.invoiceNumber.trim()) {
      return alert('Supplier name aur invoice number bharna zaroori hai.');
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return alert('Kripya valid bill amount bharein.');
    }
    const paid = Number(manualForm.amountPaid || 0);
    if (paid > amount) {
      return alert('Paid amount bill total se zyada nahi ho sakta.');
    }

    setSavingManual(true);
    try {
      const res = await api.post('/medicines/supplier-ledger/manual-bill', {
        supplierName: manualForm.supplierName.trim(),
        supplierGstin: manualForm.supplierGstin.trim(),
        invoiceNumber: manualForm.invoiceNumber.trim(),
        invoiceDate: manualForm.invoiceDate,
        billAmount: amount,
        amountPaid: paid,
        paymentMode: manualForm.paymentMode,
        paymentDate: manualForm.paymentDate,
        paymentProof: manualForm.paymentProof.trim(),
        notes: manualForm.notes.trim()
      });
      alert(res.data?.message || '✅ Old bill ledger me add ho gaya!');
      setShowManualForm(false);
      fetchLedger();
    } catch (err) {
      alert(err.response?.data?.message || 'Old bill add nahi ho saka.');
    } finally {
      setSavingManual(false);
    }
  };

  // Filtered Suppliers for Folder View
  const filteredSuppliers = suppliers.filter(sup => {
    const q = searchQuery.toLowerCase().trim();
    return !q || sup.supplierName.toLowerCase().includes(q) || (sup.supplierGstin && sup.supplierGstin.toLowerCase().includes(q));
  });

  // Selected Party Object & Bills
  const activePartyObj = suppliers.find(s => s.supplierName.toLowerCase() === (selectedParty || '').toLowerCase());
  // Key details a party profile should have; anything missing is listed so the
  // user knows what to fill (or what the next scanned bill will fill).
  const KEY_PARTY_FIELDS = [['gstin', 'GSTIN'], ['phone', 'Phone'], ['address', 'Address'], ['city', 'City'], ['state', 'State'], ['drugLicenseNo', 'Drug License']];
  const missingPartyLabels = KEY_PARTY_FIELDS
    .filter(([field]) => !String(activePartyObj?.profile?.[field] || (field === 'gstin' ? activePartyObj?.supplierGstin : '') || '').trim())
    .map(([, label]) => label);
  const hasFullPartyDetails = missingPartyLabels.length === 0;
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
  const billDue = (bill) => {
    const total = Number(bill.grandTotal || 0);
    const paid = Number(bill.amountPaid || (bill.paymentStatus === 'Paid' ? total : 0));
    return Math.max(0, Number(bill.balanceDue ?? (total - paid)));
  };
  const selectableBills = activePartyBills.filter((bill) => billDue(bill) > 0);
  // From all bills, not just the filtered view — every selected bill gets paid.
  const selectedDue = bills
    .filter((bill) => selectedBillIds.includes(String(bill._id)))
    .reduce((sum, bill) => sum + billDue(bill), 0);

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
            <div className="flex flex-wrap gap-3">
              <button
                onClick={fetchLedger}
                className="px-4 py-2 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded-lg text-sm font-bold border border-teal-200 transition-colors"
              >
                🔄 Refresh Ledger
              </button>
              <button
                onClick={() => openManualForm('')}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-bold shadow-xs transition-colors"
              >
                ➕ Old Bill Manual Entry
              </button>
            </div>
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
                    onClick={() => { setSelectedParty(sup.supplierName); setSearchQuery(''); setSelectedBillIds([]); }}
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
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-slate-700 border border-slate-200 shadow-2xs">
                            {sup.billCount} {sup.billCount === 1 ? 'Bill' : 'Bills'}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteParty(sup); }}
                            title={`Delete party '${sup.supplierName}' from ledger`}
                            className="w-8 h-8 rounded-lg bg-red-50 text-red-600 hover:bg-red-600 hover:text-white border border-red-200 flex items-center justify-center text-sm transition-colors"
                          >
                            🗑
                          </button>
                        </div>
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
              onClick={() => { setSelectedParty(null); setSearchQuery(''); setSelectedBillIds([]); }}
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
                <p className={`text-xs mt-2 font-semibold ${hasFullPartyDetails ? 'text-green-700' : 'text-amber-700'}`}>
                  {hasFullPartyDetails ? '✅ Party details saved' : `⚠️ Missing: ${missingPartyLabels.join(', ')} — next bill se auto-fill hoga, ya abhi khud bharein`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => openPartyDetails()} className="px-3 py-2 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 text-xs font-bold">
                  {hasFullPartyDetails ? '✏️ Edit Party Details' : '➕ Fill Missing Details'}
                </button>
                <button onClick={() => { setMergeTarget(''); setMergeFormOpen(true); }} className="px-3 py-2 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold">
                  🔗 Merge / Correct Name
                </button>
                {Number(activePartyObj?.balanceDue || 0) > 0 && (
                  <button onClick={() => openBulkPayment('round')} className="px-3 py-2 rounded-lg bg-teal-600 text-white text-xs font-bold">
                    💰 Pay Amount (Round Figure)
                  </button>
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

            <div className="px-5 py-3 bg-teal-50 border-b border-teal-100 flex flex-wrap items-center gap-3">
              <button
                onClick={() => openBulkPayment('selected')}
                disabled={!selectedBillIds.length}
                className="px-3 py-2 rounded-lg bg-teal-600 text-white text-xs font-bold disabled:opacity-40"
              >
                💳 Pay Selected Bills ({selectedBillIds.length}{selectedBillIds.length ? ` · ${money(selectedDue)}` : ''})
              </button>
              <button
                onClick={() => setSelectedBillIds(selectableBills.map((bill) => String(bill._id)))}
                disabled={!selectableBills.length}
                className="px-3 py-2 rounded-lg bg-white text-teal-700 border border-teal-200 text-xs font-bold disabled:opacity-40"
              >
                Select All Due
              </button>
              {selectedBillIds.length > 0 && <button onClick={() => setSelectedBillIds([])} className="text-xs font-bold text-slate-500">Clear selection</button>}
            </div>

            {/* TABLE */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-extrabold text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Select</th>
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
                      <td colSpan="9" className="text-center py-8 text-slate-400 italic">Iss party ke koi matching bills nahi mile.</td>
                    </tr>
                  ) : (
                    activePartyBills.map((bill) => {
                      const grandTotal = Number(bill.grandTotal || 0);
                      const paid = Number(bill.amountPaid || (bill.paymentStatus === 'Paid' ? grandTotal : 0));
                      const due = Number(bill.balanceDue ?? Math.max(0, grandTotal - paid));
                      const status = bill.paymentStatus || (due <= 0 ? 'Paid' : (paid > 0 ? 'Partial' : 'Credit'));

                      return (
                        <tr key={bill._id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedBillIds.includes(String(bill._id))}
                              disabled={due <= 0}
                              onChange={() => toggleBill(String(bill._id))}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
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
                          <td className="px-4 py-3 text-xs text-slate-500 max-w-[220px]">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate" title={bill.paymentRemarks || bill.notes || ''}>{bill.paymentRemarks || bill.notes || '-'}</span>
                              <button onClick={() => openRemarkEditor(bill)} title="Edit remarks" className="shrink-0 px-1.5 py-0.5 rounded hover:bg-slate-100 text-slate-500">✏️</button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap space-x-2">
                            <button
                              onClick={() => setViewBill(bill)}
                              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold text-xs transition-colors"
                            >
                              👁 View
                            </button>
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

      {/* --- MANUAL OLD BILL ENTRY MODAL --- */}
      {showManualForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-800 text-lg">➕ Old Bill Manual Entry</h3>
                <p className="text-xs text-slate-500 mt-0.5">Purana purchase bill ledger me add karein (stock add nahi hoga).</p>
              </div>
              <button onClick={() => setShowManualForm(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">✕</button>
            </div>

            <form onSubmit={handleSaveManualBill} className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Supplier / Party Name *</label>
                <input
                  type="text"
                  required
                  list="supplier-names-list"
                  value={manualForm.supplierName}
                  onChange={e => setManualForm(prev => ({ ...prev, supplierName: e.target.value }))}
                  placeholder="e.g. AMIT TRADERS"
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-sm font-bold text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                />
                <datalist id="supplier-names-list">
                  {suppliers.map((sup, idx) => (
                    <option key={idx} value={sup.supplierName} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Supplier GSTIN</label>
                  <input
                    type="text"
                    value={manualForm.supplierGstin}
                    onChange={e => setManualForm(prev => ({ ...prev, supplierGstin: e.target.value }))}
                    placeholder="Optional"
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-sm outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Invoice No. *</label>
                  <input
                    type="text"
                    required
                    value={manualForm.invoiceNumber}
                    onChange={e => setManualForm(prev => ({ ...prev, invoiceNumber: e.target.value }))}
                    placeholder="e.g. INV-2024-001"
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-sm font-bold text-slate-800 outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Bill Date *</label>
                  <input
                    type="date"
                    required
                    value={manualForm.invoiceDate}
                    onChange={e => setManualForm(prev => ({ ...prev, invoiceDate: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 p-2 text-sm font-semibold outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Bill Total (₹) *</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={manualForm.billAmount}
                    onChange={e => setManualForm(prev => ({ ...prev, billAmount: e.target.value }))}
                    placeholder="e.g. 12500"
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-sm font-bold text-slate-800 outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Amount Paid (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={manualForm.amountPaid}
                    onChange={e => setManualForm(prev => ({ ...prev, amountPaid: e.target.value }))}
                    placeholder="0 = full credit (koi payment nahi)"
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-sm font-semibold outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              {/* PAYMENT PROOF DETAILS — sirf tab dikhe jab payment ho */}
              {Number(manualForm.amountPaid) > 0 && (
                <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4 space-y-3">
                  <p className="text-[11px] font-extrabold text-teal-800 uppercase tracking-wider">💳 Payment Details (kab + kese + proof)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Payment Mode *</label>
                      <select
                        value={manualForm.paymentMode}
                        onChange={e => setManualForm(prev => ({ ...prev, paymentMode: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 p-2.5 text-xs font-semibold outline-none focus:border-teal-500 bg-white"
                      >
                        <option value="Cash">Cash</option>
                        <option value="UPI">UPI / GPay / PhonePe</option>
                        <option value="Bank Transfer">Bank Transfer (NEFT/RTGS)</option>
                        <option value="Cheque">Cheque</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Payment Date *</label>
                      <input
                        type="date"
                        required
                        value={manualForm.paymentDate}
                        onChange={e => setManualForm(prev => ({ ...prev, paymentDate: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 p-2 text-sm font-semibold outline-none focus:border-teal-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Payment Proof / Reference (UPI Txn ID, Cheque No., kaunse account se)</label>
                    <input
                      type="text"
                      value={manualForm.paymentProof}
                      onChange={e => setManualForm(prev => ({ ...prev, paymentProof: e.target.value }))}
                      placeholder="e.g. UPI Txn #4102xxxxx, Cheque #001234, Cash diya shop pe"
                      className="w-full rounded-lg border border-slate-300 p-2.5 text-xs outline-none focus:border-teal-500"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Notes / Remarks</label>
                <textarea
                  rows="2"
                  value={manualForm.notes}
                  onChange={e => setManualForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Optional note"
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs outline-none focus:border-teal-500"
                ></textarea>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualForm(false)}
                  className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingManual}
                  className="flex-1 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs disabled:opacity-50"
                >
                  {savingManual ? 'Saving...' : '✅ Save Old Bill'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {partyFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="font-extrabold text-slate-800 text-lg">🏢 Full Party Details</h3>
                <p className="text-xs text-slate-500">Bill se milne wali GSTIN ke saath phone, address aur bank details save karein.</p>
              </div>
              <button onClick={() => setPartyFormOpen(false)} className="text-slate-400 text-xl font-bold">✕</button>
            </div>
            <form onSubmit={savePartyDetails} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                ['name', 'Party Name *'], ['gstin', 'GSTIN'], ['phone', 'Phone'], ['altPhone', 'Alternate Phone'],
                ['email', 'Email'], ['contactPerson', 'Contact Person'], ['address', 'Address'], ['city', 'City'],
                ['state', 'State'], ['pincode', 'Pincode'], ['bankName', 'Bank Name'], ['accountNumber', 'Account Number'],
                ['ifsc', 'IFSC'], ['upiId', 'UPI ID'], ['drugLicenseNo', 'Drug License No.']
              ].map(([field, label]) => (
                <label key={field} className={field === 'address' ? 'sm:col-span-2 text-xs font-bold text-slate-600' : 'text-xs font-bold text-slate-600'}>
                  {label}
                  <input
                    required={field === 'name'}
                    value={partyForm[field] || ''}
                    onChange={(e) => setPartyForm((prev) => ({ ...prev, [field]: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm font-medium outline-none focus:border-teal-500"
                  />
                </label>
              ))}
              <label className="sm:col-span-2 text-xs font-bold text-slate-600">
                Notes
                <textarea value={partyForm.notes || ''} onChange={(e) => setPartyForm((prev) => ({ ...prev, notes: e.target.value }))} rows="2" className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm outline-none focus:border-teal-500" />
              </label>
              <div className="sm:col-span-2 flex gap-3 pt-2">
                <button type="button" onClick={() => setPartyFormOpen(false)} className="flex-1 py-2.5 rounded-lg border border-slate-300 font-bold text-xs">Cancel</button>
                <button type="submit" disabled={savingParty} className="flex-1 py-2.5 rounded-lg bg-teal-600 text-white font-bold text-xs disabled:opacity-50">{savingParty ? 'Saving...' : '✅ Save Details'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {mergeFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-amber-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-800 text-lg">🔗 Merge Party Ledger</h3>
                <p className="text-xs text-slate-500">Galat naam ke saare bills, stock references aur details sahi party me chale jayenge.</p>
              </div>
              <button onClick={() => setMergeFormOpen(false)} className="text-slate-400 text-xl font-bold">✕</button>
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm">
              <span className="text-xs text-amber-700 font-bold block">Current / source party</span>
              <span className="font-extrabold text-slate-800">{selectedParty}</span>
            </div>
            <form onSubmit={handleMergeParty} className="space-y-3">
              <label className="block text-xs font-bold text-slate-600">
                Correct party name (list se chunein ya sahi naam type karein)
                <input
                  required
                  list="merge-target-list"
                  value={mergeTarget}
                  onChange={(e) => setMergeTarget(e.target.value)}
                  placeholder="e.g. ROSA MEDICAL AGENCY"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm bg-white"
                />
                <datalist id="merge-target-list">
                  {suppliers.filter((sup) => sup.supplierName !== selectedParty).map((sup) => (
                    <option key={sup.supplierName} value={sup.supplierName} />
                  ))}
                </datalist>
              </label>
              <div className="flex gap-3">
                <button type="button" onClick={() => setMergeFormOpen(false)} className="flex-1 py-2.5 rounded-lg border border-slate-300 font-bold text-xs">Cancel</button>
                <button type="submit" className="flex-1 py-2.5 rounded-lg bg-amber-600 text-white font-bold text-xs">Merge Ledger</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {bulkPaymentOpen && activePartyObj && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-teal-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-800 text-lg">{bulkPaymentOpen === 'round' ? '💰 Pay Round Amount' : '💳 Pay Multiple Bills'}</h3>
                <p className="text-xs text-slate-500">
                  {bulkPaymentOpen === 'round'
                    ? `Total due ${money(activePartyObj.balanceDue)} · amount purane bill se pehle adjust hoga`
                    : `${selectedBillIds.length} selected bills · due ${money(selectedDue)}`}
                </p>
              </div>
              <button onClick={() => setBulkPaymentOpen(null)} className="text-slate-400 text-xl font-bold">✕</button>
            </div>
            <form onSubmit={handleBulkPayment} className="space-y-3">
              <label className="block text-xs font-bold text-slate-600">Payment Amount (₹)
                <input type="number" min="0.01" step="0.01" required autoFocus value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="e.g. 10000" className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm font-bold" />
              </label>
              {Number(payAmount) > 0 && (() => {
                const due = bulkPaymentOpen === 'round' ? Number(activePartyObj.balanceDue || 0) : selectedDue;
                const left = due - Number(payAmount);
                return (
                  <p className={`text-xs font-bold ${left < -0.009 ? 'text-red-600' : 'text-slate-600'}`}>
                    {left < -0.009 ? `⚠️ Amount due se ${money(-left)} zyada hai` : `Payment ke baad baaki due: ${money(left)}`}
                  </p>
                );
              })()}
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-bold text-slate-600">Mode
                  <select value={payMode} onChange={(e) => setPayMode(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-xs bg-white">
                    <option>UPI</option><option>Cash</option><option>Bank Transfer</option><option>Cheque</option>
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-600">Date
                  <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-xs" />
                </label>
              </div>
              <input value={payRemark} onChange={(e) => setPayRemark(e.target.value)} placeholder="Payment reference / remark" className="w-full rounded-lg border border-slate-300 p-2.5 text-xs" />
              <div className="flex gap-3">
                <button type="button" onClick={() => setBulkPaymentOpen(null)} className="flex-1 py-2.5 rounded-lg border border-slate-300 font-bold text-xs">Cancel</button>
                <button type="submit" disabled={submittingPay} className="flex-1 py-2.5 rounded-lg bg-teal-600 text-white font-bold text-xs disabled:opacity-50">{submittingPay ? 'Saving...' : 'Distribute Payment'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {remarkBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-800 text-lg">✏️ Edit Remarks</h3>
                <p className="text-xs text-slate-500">{remarkBill.supplierName} (Inv: {remarkBill.invoiceNumber})</p>
              </div>
              <button onClick={() => setRemarkBill(null)} className="text-slate-400 text-xl font-bold">✕</button>
            </div>
            <form onSubmit={handleSaveRemark} className="space-y-3">
              <textarea
                rows="3"
                autoFocus
                value={remarkText}
                onChange={(e) => setRemarkText(e.target.value)}
                placeholder="Remark / note likhein"
                className="w-full rounded-lg border border-slate-300 p-2.5 text-sm outline-none focus:border-teal-500"
              />
              <div className="flex gap-3">
                <button type="button" onClick={() => setRemarkBill(null)} className="flex-1 py-2.5 rounded-lg border border-slate-300 font-bold text-xs">Cancel</button>
                <button type="submit" disabled={savingRemark} className="flex-1 py-2.5 rounded-lg bg-teal-600 text-white font-bold text-xs disabled:opacity-50">{savingRemark ? 'Saving...' : '✅ Save Remarks'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- VIEW BILL MODAL --- */}
      {viewBill && (() => {
        const images = (viewBill.billImages?.length > 0 ? viewBill.billImages : [viewBill.billImage]).filter(Boolean);
        const grandTotal = Number(viewBill.grandTotal || 0);
        const paid = Number(viewBill.amountPaid || (viewBill.paymentStatus === 'Paid' ? grandTotal : 0));
        const due = Number(viewBill.balanceDue ?? Math.max(0, grandTotal - paid));
        const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs" onClick={() => setViewBill(null)}>
            <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-extrabold text-slate-800 text-lg">🧾 Invoice {viewBill.invoiceNumber}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{viewBill.supplierName} · {fmtDate(viewBill.invoiceDate)}{viewBill.supplierGstin ? ` · GSTIN ${viewBill.supplierGstin}` : ''}</p>
                </div>
                <button onClick={() => setViewBill(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">✕</button>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-2"><span className="block text-[10px] font-bold uppercase text-slate-400">Bill Total</span><span className="font-extrabold text-slate-800">{money(grandTotal)}</span></div>
                <div className="bg-green-50 rounded-xl border border-green-200 p-2"><span className="block text-[10px] font-bold uppercase text-green-700">Paid</span><span className="font-extrabold text-green-700">{money(paid)}</span></div>
                <div className="bg-red-50 rounded-xl border border-red-200 p-2"><span className="block text-[10px] font-bold uppercase text-red-600">Due</span><span className="font-extrabold text-red-600">{money(due)}</span></div>
              </div>

              {viewBill.items?.length > 0 ? (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-extrabold text-[10px]">
                      <tr>
                        <th className="px-3 py-2">Item</th><th className="px-3 py-2">Batch</th><th className="px-3 py-2">Exp</th>
                        <th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Free</th><th className="px-3 py-2 text-right">MRP</th>
                        <th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-right">Disc %</th><th className="px-3 py-2 text-right">GST %</th><th className="px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewBill.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 font-semibold text-slate-800">{item.productName}{item.packing ? <span className="text-slate-400"> ({item.packing})</span> : null}</td>
                          <td className="px-3 py-2">{item.batchNumber}</td>
                          <td className="px-3 py-2">{item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) : '-'}</td>
                          <td className="px-3 py-2 text-right">{item.quantity}</td>
                          <td className="px-3 py-2 text-right">{item.freeQuantity || 0}</td>
                          <td className="px-3 py-2 text-right">{money(item.mrp)}</td>
                          <td className="px-3 py-2 text-right">{money(item.rate)}</td>
                          <td className="px-3 py-2 text-right">{item.discount || 0}</td>
                          <td className="px-3 py-2 text-right">{item.gst || 0}</td>
                          <td className="px-3 py-2 text-right font-bold">{money(item.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">Ye manual ledger entry hai — iske item details save nahi hain.</p>
              )}

              {viewBill.paymentHistory?.length > 0 && (
                <div>
                  <h4 className="text-xs font-extrabold uppercase text-slate-500 mb-1">Payment History</h4>
                  {viewBill.paymentHistory.map((p, idx) => (
                    <div key={idx} className="flex justify-between text-xs text-slate-600 py-1 border-b border-slate-100">
                      <span>{fmtDate(p.date)} · {p.paymentMode}{p.remark ? ` · ${p.remark}` : ''}</span>
                      <span className="font-bold text-green-700">{money(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              {images.length > 0 && (
                <div>
                  <h4 className="text-xs font-extrabold uppercase text-slate-500 mb-2">Bill Photo / PDF</h4>
                  <div className="space-y-3">
                    {images.map((url, idx) => /\.pdf($|\?)/i.test(url) ? (
                      <a key={idx} href={url} target="_blank" rel="noreferrer" className="inline-block px-3 py-2 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 text-xs font-bold">📄 Open PDF {images.length > 1 ? idx + 1 : ''}</a>
                    ) : (
                      <a key={idx} href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Bill page ${idx + 1}`} className="w-full rounded-lg border border-slate-200" /></a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* --- DELETE PARTY CONFIRMATION MODAL --- */}
      {deleteParty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-100 space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-800 text-lg">🗑 Delete Party from Ledger</h3>
                <p className="text-xs text-slate-500 mt-0.5">Ye action undo nahi ho sakta.</p>
              </div>
              <button onClick={() => setDeleteParty(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">✕</button>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Party Name</p>
              <p className="font-extrabold text-slate-800">{deleteParty.supplierName}</p>
              <p className="text-xs text-slate-500 mt-2">{deleteParty.billCount} {deleteParty.billCount === 1 ? 'bill' : 'bills'} aur uske saare payment records delete ho jayenge.</p>
            </div>

            {Number(deleteParty.balanceDue) > 0 && (
              <div className="bg-red-50 p-4 rounded-xl border border-red-200 space-y-1">
                <p className="text-xs font-bold uppercase tracking-wide text-red-600">⚠️ Credit Due Hai</p>
                <p className="font-extrabold text-red-700 text-lg">{money(deleteParty.balanceDue)}</p>
                <p className="text-xs text-red-600">Iss party ka outstanding udhaar hai. Delete karne par ye due bhi hat jayega aur ledger me nahi dikhega.</p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteParty(null)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteParty}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : '🗑 Delete Party'}
              </button>
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
