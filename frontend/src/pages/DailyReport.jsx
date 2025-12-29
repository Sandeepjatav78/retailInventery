import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { generateBillHTML } from '../utils/BillGenerator';
import '../App.css'; 

const DailyReport = () => {
  // --- STATES ---
  const [report, setReport] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dates, setDates] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  // Profit Unlock State
  const [showProfit, setShowProfit] = useState(false);

  // --- FETCH DATA ---
  const fetchReport = () => {
    api.get(`/sales/filter?start=${dates.start}&end=${dates.end}`)
      .then(res => setReport(res.data))
      .catch(err => alert("Failed to fetch report"));
  };

  useEffect(() => { fetchReport(); }, [dates]);

  // --- UNLOCK PROFIT FUNCTION ---
  const handleUnlockProfit = async () => {
      if (showProfit) {
          setShowProfit(false); // Toggle OFF
          return;
      }
      
      const password = prompt("🔒 Enter Admin Password to view Profit:");
      if (!password) return;

      try {
          const res = await api.post('/admin/verify', { password });
          if (res.data.success) {
              setShowProfit(true);
          } else {
              alert("❌ Wrong Password!");
          }
      } catch (err) {
          alert("Server Error");
      }
  };

  // --- HELPERS ---
  const setRange = (type) => {
    const today = new Date();
    let start = new Date();
    let end = new Date();

    if (type === 'today') { /* defaults */ } 
    else if (type === 'month') {
        start = new Date(today.getFullYear(), today.getMonth(), 1); 
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0); 
    } else if (type === 'year') {
        start = new Date(today.getFullYear(), 0, 1); 
        end = new Date(today.getFullYear(), 11, 31); 
    }
    setDates({ start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] });
  };

  const handlePrintInvoice = async(t) => {
    const invData = { 
        no: t.invoiceNo, 
        name: t.customerDetails?.name || 'Cash Sale', 
        phone: t.customerDetails?.phone || '', 
        doctor: t.customerDetails?.doctor || 'Self', 
        mode: t.paymentMode 
    };
    const billHTML = await generateBillHTML(t.items, invData);
    const billWindow = window.open('', '', 'width=900,height=900');
    if(billWindow) {
        billWindow.document.write(billHTML);
        billWindow.document.close();
    } else {
        alert("Popup blocked!");
    }
  };

  const getFilteredTransactions = () => {
    if (!report) return [];
    if (!searchTerm) return report.transactions;
    const lowerSearch = searchTerm.toLowerCase();
    return report.transactions.filter(t => {
        const invoice = t.invoiceNo ? t.invoiceNo.toLowerCase() : '';
        const customer = t.customerDetails?.name ? t.customerDetails.name.toLowerCase() : '';
        const medicines = t.items.map(i => i.name.toLowerCase()).join(' ');
        const reason = t.customerDetails?.doctor ? t.customerDetails.doctor.toLowerCase() : '';
        return invoice.includes(lowerSearch) || customer.includes(lowerSearch) || medicines.includes(lowerSearch) || reason.includes(lowerSearch);
    });
  };

  const filteredTransactions = getFilteredTransactions();

  // --- CALCULATE TOTAL PROFIT (If Unlocked) ---
  let totalProfit = 0;
  if (showProfit && report) {
      report.transactions.forEach(t => {
          t.items.forEach(item => {
              // Assuming 'purchasePrice' exists in item, otherwise default to 70% of selling price as estimate
              const cost = item.purchasePrice || (item.price * 0.7); 
              const profit = (item.price - cost) * item.quantity;
              totalProfit += profit;
          });
      });
  }

  if (!report) return <div className="text-center p-5">Loading Records...</div>;

  return (
    <div>
      <div className="flex justify-between items-center" style={{marginBottom:'20px'}}>
        <h2>📊 Sales Report</h2>
        
        <div className="flex items-center gap-4">
            {/* PROFIT TOGGLE BUTTON */}
            <button 
                onClick={handleUnlockProfit}
                className={`btn ${showProfit ? 'btn-danger' : 'btn-primary'}`}
                style={{display:'flex', alignItems:'center', gap:'5px'}}
            >
                {showProfit ? '🔒 Hide Profit' : '🔓 Show Profit'}
            </button>

            <div className="flex items-center gap-4 bg-white p-2 rounded border">
                <button onClick={() => setRange('today')} className="btn btn-secondary">Today</button>
                <button onClick={() => setRange('month')} className="btn btn-secondary">Month</button>
                <span className="text-muted">From:</span>
                <input type="date" value={dates.start} onChange={e => setDates({...dates, start: e.target.value})} />
                <span className="text-muted">To:</span>
                <input type="date" value={dates.end} onChange={e => setDates({...dates, end: e.target.value})} />
            </div>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: showProfit ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr', gap: '20px', marginBottom: '30px' }}>
        <div className="card" style={{borderLeft: '5px solid var(--success)'}}>
          <h4 className="text-muted">Total Revenue</h4>
          <h1 className="text-success" style={{fontSize: '2rem'}}>₹{report.totalRevenue.toFixed(0)}</h1>
          <div className="text-muted">{report.totalSalesCount} Transactions</div>
        </div>
        <div className="card" style={{borderLeft: '5px solid var(--accent)'}}>
          <h4 className="text-muted">Cash Received</h4>
          <h1 style={{color: 'var(--accent)', fontSize: '1.8rem'}}>₹{report.cashRevenue.toFixed(0)}</h1>
        </div>
        <div className="card" style={{borderLeft: '5px solid var(--secondary)'}}>
          <h4 className="text-muted">Online Received</h4>
          <h1 style={{color: 'var(--secondary)', fontSize: '1.8rem'}}>₹{report.onlineRevenue.toFixed(0)}</h1>
        </div>
        
        {/* PROFIT CARD (HIDDEN BY DEFAULT) */}
        {showProfit && (
            <div className="card" style={{borderLeft: '5px solid #16a34a', background:'#f0fdf4'}}>
                <h4 style={{color:'#15803d'}}>Estimated Profit</h4>
                <h1 style={{color: '#16a34a', fontSize: '2rem'}}>₹{totalProfit.toFixed(0)}</h1>
                <div style={{fontSize:'0.8rem', color:'#15803d'}}>
                    Margin: {report.totalRevenue > 0 ? ((totalProfit / report.totalRevenue) * 100).toFixed(1) : 0}%
                </div>
            </div>
        )}
      </div>

      <div className="card">
        <div style={{ marginBottom: '20px' }}>
            <input 
                type="text" 
                placeholder="🔍 Search by Invoice, Customer, Medicine..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{padding: '12px', fontSize: '1rem', width: '100%', border:'1px solid #ccc', borderRadius:'5px'}}
            />
        </div>

        <div className="table-container">
            <table>
                <thead>
                <tr>
                    <th>Date</th>
                    <th>Type / Invoice</th>
                    <th>Details / Items</th>
                    <th>Amount</th>
                    {showProfit && <th style={{background:'#dcfce7', color:'#166534'}}>Profit Info</th>} {/* Hidden Column */}
                    <th>Status</th>
                </tr>
                </thead>
                <tbody>
                {filteredTransactions.length === 0 ? (
                    <tr><td colSpan={showProfit ? 6 : 5} className="text-center p-5 text-muted">No sales found matching your criteria.</td></tr>
                ) : (
                    filteredTransactions.map((t) => {
                        const isDose = t.invoiceNo.startsWith('DOSE');
                        
                        // Calculate Transaction Profit
                        let tProfit = 0;
                        if(showProfit) {
                            tProfit = t.items.reduce((acc, item) => {
                                const cost = item.purchasePrice || (item.price * 0.7); // Fallback if purchasePrice missing
                                return acc + ((item.price - cost) * item.quantity);
                            }, 0);
                        }

                        return (
                        <tr key={t._id} style={{background: isDose ? '#fffbeb' : 'white'}}>
                            
                            <td>
                                <div style={{fontWeight:'600'}}>{new Date(t.date).toLocaleDateString()}</div>
                                <div className="text-muted" style={{fontSize:'0.8rem'}}>{new Date(t.date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                            </td>

                            <td>
                                {(!t.customerDetails || (t.customerDetails.name === 'Cash Sale' && !isDose)) ? (
                                    <span className="text-muted" style={{fontStyle: 'italic'}}>No Bill <br/><small>{t.invoiceNo}</small></span>
                                ) : (
                                    <button onClick={() => handlePrintInvoice(t)} className="btn btn-secondary" style={{padding: '4px 8px', fontSize: '0.8rem'}}>
                                        {isDose ? '💊' : '📄'} {t.invoiceNo} 🖨️
                                    </button>
                                )}
                            </td>

                            <td>
                                <div style={{fontWeight:'500'}}>👤 {t.customerDetails?.name || 'Walk-in'}</div>
                                <div style={{fontSize:'0.85rem', color:'#555'}}>
                                    {t.items.map((i, index) => (
                                        <div key={index}>
                                            • {i.name} <span className="text-muted">x{i.quantity}</span>
                                            {/* Show Medicine Level Profit if Unlocked */}
                                            {showProfit && (
                                                <span style={{fontSize:'0.75rem', color:'#16a34a', marginLeft:'5px'}}>
                                                    (Buy: ₹{i.purchasePrice || (i.price*0.7).toFixed(0)} ➔ Sell: ₹{i.price})
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </td>

                            <td className="text-success" style={{fontWeight:'bold', fontSize:'1.1rem'}}>
                                ₹{t.totalAmount.toFixed(2)}
                            </td>

                            {/* HIDDEN PROFIT CELL */}
                            {showProfit && (
                                <td style={{background:'#f0fdf4'}}>
                                    <div style={{fontWeight:'bold', color:'#15803d'}}>₹{tProfit.toFixed(2)}</div>
                                    <div style={{fontSize:'0.7rem', color:'#166534'}}>
                                        Margin: {((tProfit/t.totalAmount)*100).toFixed(0)}%
                                    </div>
                                </td>
                            )}

                            <td>
                                <span style={{
                                    padding: '4px 10px', borderRadius: '20px',
                                    background: t.paymentMode === 'Cash' ? '#fff7ed' : '#eff6ff',
                                    color: t.paymentMode === 'Cash' ? '#c2410c' : '#1d4ed8',
                                    fontWeight: '600', fontSize: '0.8rem'
                                }}>
                                    {t.paymentMode}
                                </span>
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