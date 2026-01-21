import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { generateBillHTML } from '../utils/BillGenerator';
import EditBillModal from '../components/EditBillModal';

const DailyReport = () => {
  const [report, setReport] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dates, setDates] = useState({ start: new Date().toISOString().split('T')[0], end: new Date().toISOString().split('T')[0] });
  const userRole = localStorage.getItem('userRole'); 

  // --- EDIT STATE ---
  const [editingSale, setEditingSale] = useState(null);

  const fetchReport = () => {
    let url = '';
    if (searchTerm.length > 1) { url = `/sales/filter?search=${searchTerm}`; } 
    else { url = `/sales/filter?start=${dates.start}&end=${dates.end}`; }

    api.get(url).then(res => {
          setReport(res.data); 
      }).catch(err => console.error("Failed to fetch report"));
  };

  useEffect(() => { 
      const timer = setTimeout(() => { fetchReport(); }, 500);
      return () => clearTimeout(timer);
  }, [dates, searchTerm]); 

  const setRange = (type) => {
    const today = new Date(); let start = new Date(); let end = new Date();
    if (type === 'month') { start = new Date(today.getFullYear(), today.getMonth(), 1); end = new Date(today.getFullYear(), today.getMonth() + 1, 0); } 
    setDates({ start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] }); setSearchTerm('');
  };

  const handlePrintInvoice = async(t) => {
    const invData = { 
        no: t.invoiceNo, name: t.customerDetails?.name || 'Cash', phone: t.customerDetails?.phone || '', doctor: t.customerDetails?.doctor || 'Self', mode: t.paymentMode, isDuplicate: true, 
        grandTotal: t.totalAmount, doseAmount: t.items.find(i => i.medicineId === null)?.total || 0, 
        customDate: t.date, customTime: new Date(t.date).toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'}) 
    };
    const itemsToPrint = t.items.filter(i => i.medicineId !== null);
    const billHTML = await generateBillHTML(itemsToPrint, invData);
    const w = window.open('', '', 'width=900,height=900'); if(w) { w.document.write(billHTML); w.document.close(); }
  };

  // --- 🔥 NEW DELETE HANDLER ---
  const handleDeleteSale = async (id) => {
      if(!window.confirm("⚠️ Are you sure you want to DELETE this bill?\nStock will be restored automatically.")) return;
      
      const password = prompt("🧨 Enter Admin Password to confirm DELETE:");
      if (!password) return;

      try {
          // Verify Password First
          const verify = await api.post('/admin/verify', { password });
          if (!verify.data.success) return alert("❌ Wrong Password!");

          // Perform Delete
          await api.delete(`/sales/${id}`);
          alert("✅ Bill Deleted & Stock Restored!");
          fetchReport(); // Refresh List
      } catch (err) {
          alert("Delete Failed: " + err.message);
      }
  };

  const filteredTransactions = report ? report.transactions : [];
  
  // --- CALCULATIONS (Strict Isolation) ---
  const calcTransactions = filteredTransactions.filter(t => !t.invoiceNo.startsWith('MAN'));

  const adminTxns = calcTransactions.filter(t => t.createdBy !== 'staff');
  const adminTotal = adminTxns.reduce((acc, t) => acc + t.totalAmount, 0);
  const adminCash = adminTxns.filter(t => t.paymentMode === 'Cash').reduce((acc, t) => acc + t.totalAmount, 0);
  const adminOnline = adminTxns.filter(t => t.paymentMode === 'Online').reduce((acc, t) => acc + t.totalAmount, 0);

  const staffTxns = calcTransactions.filter(t => t.createdBy === 'staff');
  const staffTotal = staffTxns.reduce((acc, t) => acc + t.totalAmount, 0);
  const staffCash = staffTxns.filter(t => t.paymentMode === 'Cash').reduce((acc, t) => acc + t.totalAmount, 0);
  const staffOnline = staffTxns.filter(t => t.paymentMode === 'Online').reduce((acc, t) => acc + t.totalAmount, 0);

  if (!report) return <div className="text-center p-10 text-gray-500 font-medium">Loading...</div>;

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h2 className="text-2xl font-bold text-gray-800">📊 Sales Report</h2>
        <div className="flex items-center gap-2 bg-white px-2 py-1 rounded border shadow-sm"><button onClick={() => setRange('today')} className="text-xs font-bold text-gray-600 hover:text-teal-600">Today</button><div className="h-4 w-px bg-gray-300"></div><button onClick={() => setRange('month')} className="text-xs font-bold text-gray-600 hover:text-teal-600">Month</button><input type="date" value={dates.start} onChange={e => setDates({...dates, start: e.target.value})} className="text-xs border rounded p-1" /><span className="text-xs">-</span><input type="date" value={dates.end} onChange={e => setDates({...dates, end: e.target.value})} className="text-xs border rounded p-1" /></div>
      </div>

      <div className="grid gap-4 mb-6 grid-cols-1 md:grid-cols-3">
        <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-l-green-500">
            <h4 className="text-gray-500 text-xs font-bold uppercase">Total Revenue (Admin)</h4>
            <div className="flex flex-wrap items-baseline gap-2 mt-1">
                <h1 className="text-2xl font-bold text-gray-800">₹{adminTotal.toFixed(0)}</h1>
                {staffTotal > 0 && <span className="text-xs text-purple-600 font-bold bg-purple-50 px-1 rounded">(+Staff: ₹{staffTotal.toFixed(0)})</span>}
            </div>
            <div className="text-green-600 text-xs font-bold mt-1">{filteredTransactions.length} Bills Found</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-l-orange-500">
            <h4 className="text-gray-500 text-xs font-bold uppercase">Cash (Admin)</h4>
            <div className="flex flex-wrap items-baseline gap-2 mt-1">
                <h1 className="text-2xl font-bold text-orange-600">₹{adminCash.toFixed(0)}</h1>
                {staffCash > 0 && <span className="text-xs text-purple-600 font-bold bg-purple-50 px-1 rounded">(+Staff: ₹{staffCash.toFixed(0)})</span>}
            </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-l-blue-500">
            <h4 className="text-gray-500 text-xs font-bold uppercase">Online (Admin)</h4>
            <div className="flex flex-wrap items-baseline gap-2 mt-1">
                <h1 className="text-2xl font-bold text-blue-600">₹{adminOnline.toFixed(0)}</h1>
                {staffOnline > 0 && <span className="text-xs text-purple-600 font-bold bg-purple-50 px-1 rounded">(+Staff: ₹{staffOnline.toFixed(0)})</span>}
            </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-3 border-b bg-gray-50"><input type="text" placeholder="🔍 Search Invoice / Name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-2 border rounded text-sm focus:outline-none focus:border-teal-500" /></div>
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
                <thead className="bg-gray-50 border-b">
                <tr><th className="px-4 py-3 text-xs font-bold text-gray-500">Date</th><th className="px-4 py-3 text-xs font-bold text-gray-500">Invoice</th><th className="px-4 py-3 text-xs font-bold text-gray-500">Customer</th><th className="px-4 py-3 text-xs font-bold text-gray-500 text-right">Amount</th><th className="px-4 py-3 text-xs font-bold text-gray-500 text-center">Actions</th></tr>
                </thead>
                <tbody className="divide-y">
                {filteredTransactions.length === 0 ? (<tr><td colSpan={5} className="text-center py-8 text-gray-400 text-sm">No sales found.</td></tr>) : (
                    filteredTransactions.map((t) => {
                        const isDose = t.invoiceNo.startsWith('DOSE');
                        const isManual = t.invoiceNo.startsWith('MAN');
                        const isStaffBill = t.createdBy === 'staff';
                        return (
                        <tr key={t._id} className={`hover:bg-gray-50 ${isDose ? 'bg-yellow-50/50' : isManual ? 'bg-blue-50/30' : 'bg-white'}`}>
                            <td className="px-4 py-3"><div className="font-bold text-gray-800 text-sm">{new Date(t.date).toLocaleDateString()}</div><div className="text-gray-400 text-xs">{new Date(t.date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div></td>
                            <td className="px-4 py-3"><div className="text-sm font-bold text-gray-700 mb-1 flex items-center gap-2">{t.invoiceNo}{isStaffBill && <span className="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200 uppercase font-bold tracking-wider">STAFF</span>}</div>{isManual && <span className="text-[9px] bg-blue-100 text-blue-700 px-1 rounded mr-2">MANUAL</span>}</td>
                            <td className="px-4 py-3"><div className="font-semibold text-gray-800 text-sm">{t.customerDetails?.name || 'Walk-in'}</div></td>
                            <td className="px-4 py-3 text-right"><div className="font-bold text-gray-800">₹{t.totalAmount.toFixed(2)}</div></td>
                            <td className="px-4 py-3 text-center flex justify-center gap-2">
                                <button onClick={() => handlePrintInvoice(t)} className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 border border-blue-100">🖨️</button>
                                
                                {/* 🔥 ADMIN ONLY: Edit & Delete */}
                                {userRole === 'admin' && (
                                    <>
                                        <button onClick={() => setEditingSale(t)} className="text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded hover:bg-purple-100 border border-purple-100">✏️</button>
                                        <button onClick={() => handleDeleteSale(t._id)} className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded hover:bg-red-100 border border-red-100">🗑️</button>
                                    </>
                                )}
                            </td>
                        </tr>
                    )})
                )}
                </tbody>
            </table>
        </div>
      </div>

      {editingSale && (
          <EditBillModal sale={editingSale} onClose={() => setEditingSale(null)} onUpdateSuccess={() => { setEditingSale(null); fetchReport(); }} />
      )}
    </div>
  );
};
export default DailyReport;