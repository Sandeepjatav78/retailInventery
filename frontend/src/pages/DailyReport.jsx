import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { generateBillHTML } from '../utils/BillGenerator';
import EditBillModal from '../components/EditBillModal';
import ReturnBillModal from '../components/ReturnBillModal';
import * as XLSX from 'xlsx';

const getLocalDateString = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60000; 
  return new Date(date.getTime() - offset).toISOString().split('T')[0];
};

const DailyReport = () => {
  const [report, setReport] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [dates, setDates] = useState({ 
      start: getLocalDateString(), 
      end: getLocalDateString() 
  });
  
  const userRole = localStorage.getItem('userRole'); 
  const [editingSale, setEditingSale] = useState(null);
    const [returningSale, setReturningSale] = useState(null);

  const fetchReport = () => {
    let url = '';
    if (searchTerm.length > 1) { 
        url = `/sales/filter?search=${searchTerm}`; 
    } else { 
        url = `/sales/filter?start=${dates.start}&end=${dates.end}`; 
    }

    api.get(url).then(res => {
          setReport(res.data); 
      }).catch(err => console.error("Failed to fetch report"));
  };

  useEffect(() => { 
      const timer = setTimeout(() => { fetchReport(); }, 500);
      return () => clearTimeout(timer);
  }, [dates, searchTerm]); 

  const setRange = (type) => {
    const today = new Date(); 
    let start = new Date(today); 
    let end = new Date(today);
    
    if (type === 'month') { 
        start = new Date(today.getFullYear(), today.getMonth(), 1); 
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0); 
    } 
    
    setDates({ 
        start: getLocalDateString(start), 
        end: getLocalDateString(end) 
    }); 
    setSearchTerm('');
  };

  // --- 🔥 GST EXCEL EXPORT LOGIC ---
  const handleExportGST = () => {
    if (!report || !report.transactions || report.transactions.length === 0) {
        return alert("No data found to export!");
    }

    const transactionsForExport = report.transactions.filter((sale) => {
        if (userRole === 'staff') return sale.createdBy === 'staff';
        return true;
    });

    if (transactionsForExport.length === 0) {
        return alert("No data found to export!");
    }

    const dataToExport = [];

    transactionsForExport.forEach(sale => {
        const saleDate = new Date(sale.date).toLocaleDateString('en-GB');

        sale.items
            .filter(item => item.name !== "Medical/Dose Charge")
            .forEach(item => {
                const total = Number(item.total) || 0;
                const gstPercent = Number(item.gst) || 0;
                const taxableValue = total / (1 + (gstPercent / 100));
                const gstAmount = total - taxableValue;
                const quantity = Number(item.quantity) || 0;

                let expiryStr = '-';
                if (item.expiry) {
                    expiryStr = new Date(item.expiry).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
                }

                dataToExport.push({
                    "Date": saleDate,
                    "Invoice": sale.invoiceNo,
                    "Customer": sale.customerDetails?.name || 'Cash',
                    "Payment": sale.paymentMode,
                    "Product": item.name || '-',
                    "HSN": item.hsn || '-',
                    "Batch": item.batch || '-',
                    "Expiry": expiryStr,
                    "Unit": item.unit || 'pack',
                    "Qty": Number.isInteger(quantity) ? quantity : Number(quantity.toFixed(3)),
                    "MRP": Number(item.mrp || 0).toFixed(2),
                    "Rate": Number(item.price || 0).toFixed(2),
                    "GST %": gstPercent,
                    "Taxable Value": parseFloat(taxableValue.toFixed(2)),
                    "GST Amt": parseFloat(gstAmount.toFixed(2)),
                    "Total Amount": parseFloat(total.toFixed(2))
                });
            });
    });

    if (dataToExport.length === 0) {
        return alert("No medicine items found to export!");
    }

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    
    // Set Column Widths
    const wscols = [
        {wch: 12}, // Date
        {wch: 15}, // Invoice
        {wch: 20}, // Customer
        {wch: 10}, // Payment
        {wch: 30}, // Product
        {wch: 14}, // HSN
        {wch: 14}, // Batch
        {wch: 12}, // Expiry
        {wch: 8},  // Unit
        {wch: 8},  // Qty
        {wch: 10}, // MRP
        {wch: 10}, // Rate
        {wch: 8},  // GST %
        {wch: 14}, // Taxable Value
        {wch: 10}, // GST Amt
        {wch: 12}  // Total Amount
    ];
    worksheet['!cols'] = wscols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "GST Sales");
    XLSX.writeFile(workbook, `GST_Report_${dates.start}_to_${dates.end}.xlsx`);
  };

  const handlePrintInvoice = async(t) => {
    const doseItem = t.items.find(i => i.name === "Medical/Dose Charge");
    const doseAmount = doseItem ? doseItem.total : 0;

    const itemsToPrint = t.items
        .filter(i => i.name !== "Medical/Dose Charge")
        .map(i => {
            let visualQty = i.quantity;
            if (i.unit === 'loose' && i.packSize) {
                visualQty = Math.round(i.quantity * i.packSize);
            }
            return { ...i, quantity: visualQty };
        });

    const saleDate = new Date(t.date);

    const invData = { 
        no: t.invoiceNo, 
        name: t.customerDetails?.name || 'Cash', 
        phone: t.customerDetails?.phone || '', 
        doctor: t.customerDetails?.doctor || 'Self', 
        mode: t.paymentMode, 
        isDuplicate: true, 
        grandTotal: t.totalAmount, 
        doseAmount: doseAmount, 
        customDate: saleDate.toISOString().split('T')[0], 
        customTime: saleDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) 
    };

    const billHTML = await generateBillHTML(itemsToPrint, invData);
    const w = window.open('', '', 'width=900,height=900'); 
    if(w) { 
        w.document.write(billHTML); 
        w.document.close(); 
    } else {
        alert("Popup blocked! Please allow popups to print.");
    }
  };

  // Full delete (old behaviour) – keep for rare full cancellations
  const handleDeleteSale = async (id) => {
      if(!window.confirm("⚠️ Are you sure you want to DELETE this bill?\nStock will be restored automatically.")) return;
      
      const password = prompt("🧨 Enter Admin Password to confirm DELETE:");
      if (!password) return;

      try {
          const verify = await api.post('/admin/verify', { password });
          if (!verify.data.success) return alert("❌ Wrong Password!");

          await api.delete(`/sales/${id}`);
          alert("✅ Bill Deleted & Stock Restored!");
          fetchReport(); 
      } catch (err) {
          alert("Delete Failed: " + err.message);
      }
  };

  let filteredTransactions = report ? [...report.transactions] : [];

  if (userRole === 'staff') {
      filteredTransactions = filteredTransactions.filter(t => t.createdBy === 'staff');
  }

  filteredTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

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
        <h2 className="text-2xl font-bold text-gray-800">
            📊 Sales Report {userRole === 'staff' && <span className="text-sm font-medium text-gray-500">(My Sales Only)</span>}
        </h2>
        
        <div className="flex flex-wrap items-center gap-2 bg-white px-2 py-1 rounded border shadow-sm">
            <button onClick={() => setRange('today')} className="text-xs font-bold text-gray-600 hover:text-teal-600">Today</button>
            <div className="h-4 w-px bg-gray-300"></div>
            <button onClick={() => setRange('month')} className="text-xs font-bold text-gray-600 hover:text-teal-600">Month</button>
            
            <input type="date" value={dates.start} onChange={e => setDates({...dates, start: e.target.value})} className="text-xs border rounded p-1" />
            <span className="text-xs">-</span>
            <input type="date" value={dates.end} onChange={e => setDates({...dates, end: e.target.value})} className="text-xs border rounded p-1" />
            
            {(userRole === 'admin' || userRole === 'staff') && (
                <button 
                    onClick={handleExportGST} 
                    className="ml-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3 py-1.5 rounded transition-colors flex items-center gap-1"
                >
                    📑 {userRole === 'staff' ? 'Export My GST Excel' : 'Export GST Excel'}
                </button>
            )}
        </div>
      </div>

      {/* STATS CARDS */}
      <div className="grid gap-4 mb-6 grid-cols-1 md:grid-cols-3">
        <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-l-green-500">
            <h4 className="text-gray-500 text-xs font-bold uppercase">{userRole === 'admin' ? 'Total Revenue (Admin)' : 'My Total Revenue'}</h4>
            <div className="flex flex-wrap items-baseline gap-2 mt-1">
                <h1 className="text-2xl font-bold text-gray-800">₹{userRole === 'admin' ? adminTotal.toFixed(0) : staffTotal.toFixed(0)}</h1>
                {userRole === 'admin' && staffTotal > 0 && <span className="text-xs text-purple-600 font-bold bg-purple-50 px-1 rounded">(+Staff: ₹{staffTotal.toFixed(0)})</span>}
            </div>
            <div className="text-green-600 text-xs font-bold mt-1">{filteredTransactions.length} Bills Found</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-l-orange-500">
            <h4 className="text-gray-500 text-xs font-bold uppercase">Cash</h4>
            <div className="flex flex-wrap items-baseline gap-2 mt-1">
                <h1 className="text-2xl font-bold text-orange-600">₹{userRole === 'admin' ? adminCash.toFixed(0) : staffCash.toFixed(0)}</h1>
                {userRole === 'admin' && staffCash > 0 && <span className="text-xs text-purple-600 font-bold bg-purple-50 px-1 rounded">(+Staff: ₹{staffCash.toFixed(0)})</span>}
            </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-l-blue-500">
            <h4 className="text-gray-500 text-xs font-bold uppercase">Online</h4>
            <div className="flex flex-wrap items-baseline gap-2 mt-1">
                <h1 className="text-2xl font-bold text-blue-600">₹{userRole === 'admin' ? adminOnline.toFixed(0) : staffOnline.toFixed(0)}</h1>
                {userRole === 'admin' && staffOnline > 0 && <span className="text-xs text-purple-600 font-bold bg-purple-50 px-1 rounded">(+Staff: ₹{staffOnline.toFixed(0)})</span>}
            </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-3 border-b bg-gray-50"><input type="text" placeholder="🔍 Search Invoice / Name / Medicine..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-2 border rounded text-sm focus:outline-none focus:border-teal-500" /></div>
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
                <thead className="bg-gray-50 border-b">
                <tr><th className="px-4 py-3 text-xs font-bold text-gray-500">Date</th><th className="px-4 py-3 text-xs font-bold text-gray-500">Invoice</th><th className="px-4 py-3 text-xs font-bold text-gray-500">Customer & Medicines</th><th className="px-4 py-3 text-xs font-bold text-gray-500 text-right">Amount</th><th className="px-4 py-3 text-xs font-bold text-gray-500 text-center">Actions</th></tr>
                </thead>
                <tbody className="divide-y">
                {filteredTransactions.length === 0 ? (<tr><td colSpan={5} className="text-center py-8 text-gray-400 text-sm">No sales found.</td></tr>) : (
                    filteredTransactions.map((t) => {
                        const isDose = t.invoiceNo.startsWith('DOSE');
                        const isManual = t.invoiceNo.startsWith('MAN');
                        const isReturn = t.invoiceNo.startsWith('RET');
                        const isStaffBill = t.createdBy === 'staff';
                        
                        const medicineNames = t.items
                            .filter(i => i.name !== "Medical/Dose Charge")
                            .map(i => i.name)
                            .join(', ');
                                                return (
                                                <tr
                                                    key={t._id}
                                                    className={`hover:bg-gray-50 ${
                                                        isReturn
                                                            ? 'bg-rose-50/60'
                                                            : isDose
                                                            ? 'bg-yellow-50/50'
                                                            : isManual
                                                            ? 'bg-blue-50/30'
                                                            : 'bg-white'
                                                    }`}
                                                >
                            <td className="px-4 py-3"><div className="font-bold text-gray-800 text-sm">{new Date(t.date).toLocaleDateString()}</div><div className="text-gray-400 text-xs">{new Date(t.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</div></td>
                            <td className="px-4 py-3">
                                <div className="text-sm font-bold text-gray-700 mb-1 flex items-center gap-2">
                                                                        {t.invoiceNo}
                                    {userRole === 'admin' && isStaffBill && <span className="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200 uppercase font-bold tracking-wider">STAFF</span>}
                                                                        {isReturn && (
                                                                            <span className="text-[9px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded border border-rose-200 uppercase font-bold tracking-wider">
                                                                                RETURN
                                                                            </span>
                                                                        )}
                                </div>
                                                                {isManual && <span className="text-[9px] bg-blue-100 text-blue-700 px-1 rounded mr-2">MANUAL</span>}
                            </td>
                            <td className="px-4 py-3">
                                <div className="font-semibold text-gray-800 text-sm">{t.customerDetails?.name || 'Walk-in'}</div>
                                {medicineNames && (
                                    <div className="text-xs text-gray-500 mt-1 italic max-w-xs break-words">
                                        ({medicineNames})
                                    </div>
                                )}
                            </td>
                            <td className="px-4 py-3 text-right"><div className="font-bold text-gray-800">₹{t.totalAmount.toFixed(2)}</div></td>
                            <td className="px-4 py-3 text-center flex justify-center gap-2">
                                <button onClick={() => handlePrintInvoice(t)} className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 border border-blue-100">🖨️</button>
                                {userRole === 'admin' && !isReturn && (
                                    <>
                                        <button onClick={() => setEditingSale(t)} className="text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded hover:bg-purple-100 border border-purple-100">✏️</button>
                                        <button onClick={() => setReturningSale(t)} className="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded hover:bg-emerald-100 border border-emerald-200">↩️</button>
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

            {returningSale && (
                    <ReturnBillModal
                        sale={returningSale}
                        onClose={() => setReturningSale(null)}
                        onReturnSuccess={() => { setReturningSale(null); fetchReport(); }}
                    />
            )}
    </div>
  );
};
export default DailyReport;