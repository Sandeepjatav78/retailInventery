import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { generateBillHTML } from '../utils/BillGenerator';

const DailyReport = () => {
  const [report, setReport] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dates, setDates] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  const [showProfit, setShowProfit] = useState(false);
  
  // --- 1. GET CURRENT USER ---
  const userRole = localStorage.getItem('userRole'); 

  const fetchReport = () => {
    let url = '';
    // Global Search or Date Range
    if (searchTerm.length > 1) {
        url = `/sales/filter?search=${searchTerm}`;
    } else {
        url = `/sales/filter?start=${dates.start}&end=${dates.end}`;
    }

    api.get(url)
      .then(res => {
          let transactions = res.data.transactions;

          // --- 🔥 STRICT ISOLATION LOGIC ---
          if (userRole) {
              transactions = transactions.filter(t => {
                  const billCreator = t.createdBy || 'admin';
                  return billCreator === userRole;
              });
          }

          setReport({ ...res.data, transactions: transactions });
      })
      .catch(err => console.error("Failed to fetch report"));
  };

  useEffect(() => { 
      const timer = setTimeout(() => { fetchReport(); }, 500);
      return () => clearTimeout(timer);
  }, [dates, searchTerm]); 

  const handleUnlockProfit = async () => {
      if (showProfit) { setShowProfit(false); return; }
      const password = prompt("🔒 Enter Admin Password to view Profit:");
      if (!password) return;
      try {
          const res = await api.post('/admin/verify', { password });
          if (res.data.success) setShowProfit(true);
          else alert("❌ Wrong Password!");
      } catch (err) { alert("Server Error"); }
  };

  const setRange = (type) => {
    const today = new Date();
    let start = new Date();
    let end = new Date();
    if (type === 'today') { /* defaults */ } 
    else if (type === 'month') { start = new Date(today.getFullYear(), today.getMonth(), 1); end = new Date(today.getFullYear(), today.getMonth() + 1, 0); } 
    else if (type === 'year') { start = new Date(today.getFullYear(), 0, 1); end = new Date(today.getFullYear(), 11, 31); }
    setDates({ start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] });
    setSearchTerm('');
  };

  const handlePrintInvoice = async(t) => {
    const invData = { 
        no: t.invoiceNo, 
        name: t.customerDetails?.name || 'Cash Sale', 
        phone: t.customerDetails?.phone || '', 
        doctor: t.customerDetails?.doctor || 'Self', 
        mode: t.paymentMode, 
        isDuplicate: true,
        grandTotal: t.totalAmount, 
        doseAmount: t.items.find(i => i.name === "Medical/Dose Charge")?.total || 0, // 🔥 Better check for Dose
        customDate: t.date, 
        customTime: new Date(t.date).toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'})
    };
    
    // Filter out dose charge from regular items list for print
    const itemsToPrint = t.items.filter(i => i.name !== "Medical/Dose Charge");
    
    const billHTML = await generateBillHTML(itemsToPrint, invData);
    const billWindow = window.open('', '', 'width=900,height=900');
    if(billWindow) { billWindow.document.write(billHTML); billWindow.document.close(); } else { alert("Popup blocked!"); }
  };

  const filteredTransactions = report ? report.transactions : [];

  const myTotalRevenue = filteredTransactions.reduce((acc, t) => acc + t.totalAmount, 0);
  const myCashRevenue = filteredTransactions.filter(t => t.paymentMode === 'Cash').reduce((acc, t) => acc + t.totalAmount, 0);
  const myOnlineRevenue = filteredTransactions.filter(t => t.paymentMode === 'Online').reduce((acc, t) => acc + t.totalAmount, 0);

  let totalProfit = 0;
  if (showProfit && report) {
      filteredTransactions.forEach(t => {
          t.items.forEach(item => {
              if(item.medicineId) { 
                  const cost = item.purchasePrice || (item.price * 0.7); 
                  const profit = (item.price - cost) * item.quantity;
                  totalProfit += profit;
              } else {
                  totalProfit += item.total; // Manual/Dose is 100% profit
              }
          });
      });
  }

  if (!report) return <div className="text-center p-10 text-gray-500 font-medium">Loading Records...</div>;

  const cardClass = "bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between";

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <h2 className="text-2xl font-extrabold text-gray-800">
            📊 Sales Report <span className="text-sm font-medium text-gray-500 uppercase">({userRole})</span>
        </h2>
        
        <div className="flex flex-wrap items-center gap-3">
            {userRole === 'admin' && (
                <button onClick={handleUnlockProfit} className={`px-4 py-2 rounded-lg font-bold text-sm shadow-sm transition-all flex items-center gap-2 ${showProfit ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-teal-600 text-white hover:bg-teal-700'}`}>
                    {showProfit ? '🔒 Hide Profit' : '🔓 Show Profit'}
                </button>
            )}

            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm">
                <button onClick={() => setRange('today')} className="text-xs font-semibold text-gray-600 hover:text-teal-600 px-2 py-1 hover:bg-gray-100 rounded">Today</button>
                <div className="h-4 w-px bg-gray-300"></div>
                <button onClick={() => setRange('month')} className="text-xs font-semibold text-gray-600 hover:text-teal-600 px-2 py-1 hover:bg-gray-100 rounded">Month</button>
                <input type="date" value={dates.start} onChange={e => setDates({...dates, start: e.target.value})} className="text-xs border rounded p-1 text-gray-600 outline-none focus:border-teal-500" />
                <span className="text-gray-400 text-xs">to</span>
                <input type="date" value={dates.end} onChange={e => setDates({...dates, end: e.target.value})} className="text-xs border rounded p-1 text-gray-600 outline-none focus:border-teal-500" />
            </div>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div className={`grid gap-6 mb-8 ${showProfit ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 md:grid-cols-3'}`}>
        <div className={`${cardClass} border-l-4 border-l-green-500`}>
          <div><h4 className="text-gray-500 text-xs font-bold uppercase tracking-wider">Total Revenue</h4><h1 className="text-3xl font-extrabold text-gray-800 mt-1">₹{myTotalRevenue.toFixed(0)}</h1></div>
          <div className="text-green-600 text-xs font-bold mt-2 bg-green-50 w-fit px-2 py-1 rounded">{filteredTransactions.length} Bills</div>
        </div>
        <div className={`${cardClass} border-l-4 border-l-orange-500`}>
          <h4 className="text-gray-500 text-xs font-bold uppercase tracking-wider">Cash</h4><h1 className="text-3xl font-extrabold text-orange-600 mt-1">₹{myCashRevenue.toFixed(0)}</h1>
        </div>
        <div className={`${cardClass} border-l-4 border-l-blue-500`}>
          <h4 className="text-gray-500 text-xs font-bold uppercase tracking-wider">Online</h4><h1 className="text-3xl font-extrabold text-blue-600 mt-1">₹{myOnlineRevenue.toFixed(0)}</h1>
        </div>
        {showProfit && (
            <div className={`${cardClass} border-l-4 border-l-emerald-600 bg-emerald-50`}>
                <h4 className="text-emerald-800 text-xs font-bold uppercase tracking-wider">Est. Profit</h4><h1 className="text-3xl font-extrabold text-emerald-700 mt-1">₹{totalProfit.toFixed(0)}</h1>
            </div>
        )}
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
            <span className="text-lg">🔎</span>
            <input type="text" placeholder="Search Invoice No or Customer Name (Global)..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 shadow-sm" />
        </div>

        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Date</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Details</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Customer</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-right">Amount</th>
                    {showProfit && <th className="px-6 py-4 text-xs font-bold text-emerald-700 uppercase bg-emerald-50 text-right">Profit</th>}
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-center">Status</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                {filteredTransactions.length === 0 ? (
                    <tr><td colSpan={showProfit ? 6 : 5} className="text-center py-10 text-gray-400 italic">No bills found for your role ({userRole}).</td></tr>
                ) : (
                    filteredTransactions.map((t) => {
                        // Check if it's a Manual Bill
                        const isManual = t.invoiceNo.startsWith('MAN');
                        
                        let tProfit = 0;
                        if(showProfit) {
                            tProfit = t.items.reduce((acc, item) => {
                                if(item.medicineId) {
                                    const cost = item.purchasePrice || (item.price * 0.7);
                                    return acc + ((item.price - cost) * item.quantity);
                                } else { return acc + item.total; } // Manual/Dose is all profit
                            }, 0);
                        }
                        const billWasSkipped = t.isBillRequired === false;

                        return (
                        <tr key={t._id} className={`hover:bg-gray-50 transition-colors ${isManual ? 'bg-blue-50/30' : 'bg-white'}`}>
                            <td className="px-6 py-4">
                                <div className="font-bold text-gray-800 text-sm">{new Date(t.date).toLocaleDateString()}</div>
                                <div className="text-gray-400 text-xs">{new Date(t.date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                            </td>
                            <td className="px-6 py-4">
                                <div className="text-sm font-bold text-gray-700 mb-1">{t.invoiceNo}</div>
                                {isManual && <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded border border-blue-200 uppercase tracking-wide mr-2">Manual</span>}
                                {billWasSkipped ? (
                                    <span className="text-[10px] font-bold text-orange-600 bg-orange-100 px-2 py-1 rounded-full border border-orange-200 uppercase tracking-wide">No Bill</span>
                                ) : (
                                    <button onClick={() => handlePrintInvoice(t)} className="text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-1 rounded hover:bg-gray-200 transition-colors inline-flex items-center gap-1">🖨️ Print</button>
                                )}
                            </td>
                            <td className="px-6 py-4">
                                <div className="font-semibold text-gray-800 text-sm">👤 {t.customerDetails?.name || 'Walk-in'}</div>
                                {/* Clean up items list for display */}
                                <div className="text-xs text-gray-500 mt-1 max-w-xs truncate">
                                    {t.items.filter(i => i.name !== "Medical/Dose Charge").map(i => i.name).join(', ') || 'Medical Charges'}
                                </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                                <div className="font-bold text-gray-800 text-base">₹{t.totalAmount.toFixed(2)}</div>
                            </td>
                            {showProfit && (
                                <td className="px-6 py-4 text-right bg-emerald-50/50">
                                    <div className="font-bold text-emerald-700">₹{tProfit.toFixed(2)}</div>
                                    <div className="text-xs text-emerald-600 font-medium">{t.totalAmount > 0 ? ((tProfit/t.totalAmount)*100).toFixed(0) : 0}%</div>
                                </td>
                            )}
                            <td className="px-6 py-4 text-center">
                                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${t.paymentMode === 'Cash' ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>{t.paymentMode}</span>
                            </td>
                        </tr>
                    )})
                )}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};

export default DailyReport;