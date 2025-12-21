import React, { useState, useEffect } from 'react';
import api from '../api/axios';

// --- PHARMACY DETAILS (Must match SaleForm) ---
const PHARMACY_DETAILS = {
  name: "K.D. SALES", 
  address: "22/15, Jawahar Nagar, Tehsil Town, Panipat-06, Haryana",
  gstin: "06ADYPT1086C1Z6",
  dlNo: "12509 OW/H 12325 W/H",
  phone: "9812336394, 9812436395",
  email: "tarunmalhotra62@gmail.com"
};

const numberToWords = (num) => {
  const a = ['','One ','Two ','Three ','Four ', 'Five ','Six ','Seven ','Eight ','Nine ','Ten ','Eleven ','Twelve ','Thirteen ','Fourteen ','Fifteen ','Sixteen ','Seventeen ','Eighteen ','Nineteen '];
  const b = ['', '', 'Twenty','Thirty','Forty','Fifty', 'Sixty','Seventy','Eighty','Ninety'];
  if ((num = num.toString()).length > 9) return 'overflow';
  let n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
  if (!n) return; var str = '';
  str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
  str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
  str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
  str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
  str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) + 'only ' : '';
  return str;
};

const DailyReport = () => {
  const [report, setReport] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [dates, setDates] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  const fetchReport = () => {
    api.get(`/sales/filter?start=${dates.start}&end=${dates.end}`)
      .then(res => setReport(res.data))
      .catch(err => alert("Failed to fetch report"));
  };

  useEffect(() => { fetchReport(); }, [dates]);

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

    setDates({
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0]
    });
  };

  // --- REPRINT INVOICE FUNCTION ---
  const handlePrintInvoice = (t) => {
    const date = new Date(t.date).toLocaleDateString('en-IN');
    const totalAmount = t.totalAmount;
    // Calculate tax again based on stored items
    const totalTaxable = t.items.reduce((acc, item) => acc + (item.total / (1 + ((item.gst || 0)/100))), 0);
    const totalGST = totalAmount - totalTaxable;
    const amountInWords = numberToWords(Math.round(totalAmount));
    const customerName = t.customerDetails?.name || 'Cash Sale';
    const doctorName = t.customerDetails?.doctor || 'Self';

    const billHTML = `
      <html>
        <head>
          <title>Reprint ${t.invoiceNo}</title>
          <style>
            body { font-family: Arial, sans-serif; font-size: 11px; padding: 20px; }
            .container { border: 2px solid #000; padding: 2px; }
            .header { display: flex; border-bottom: 2px solid #000; }
            .header-left { flex: 2; padding: 5px; border-right: 1px solid #000; }
            .header-right { flex: 1; padding: 5px; }
            .title { font-size: 24px; font-weight: bold; color: #d32f2f; text-transform: uppercase; }
            
            table { width: 100%; border-collapse: collapse; font-size: 10px; }
            th { border-bottom: 1px solid #000; border-right: 1px solid #000; background: #ffffcc; padding: 3px; }
            td { border-bottom: 1px solid #ddd; border-right: 1px solid #000; padding: 3px; text-align: center; }
            th:last-child, td:last-child { border-right: none; }

            .footer-section { border-top: 2px solid #000; display: flex; }
            .tax-box { flex: 2; border-right: 2px solid #000; padding: 5px; font-size: 10px; }
            .total-box { flex: 1; padding: 5px; }
            .sign { height: 40px; margin-top: 20px; text-align: right; }
          </style>
        </head>
        <body>
          <center><strong style="font-size:14px; text-decoration: underline;">DUPLICATE COPY</strong></center>
          <div class="container">
            <div class="header">
              <div class="header-left">
                <div class="title">${PHARMACY_DETAILS.name}</div>
                <div>${PHARMACY_DETAILS.address}</div>
                <div><strong>GSTIN:</strong> ${PHARMACY_DETAILS.gstin}</div>
                <div><strong>DL No:</strong> ${PHARMACY_DETAILS.dlNo}</div>
                <div><strong>Phone:</strong> ${PHARMACY_DETAILS.phone}</div>
              </div>
              <div class="header-right">
                <div><strong>Invoice No:</strong> ${t.invoiceNo}</div>
                <div><strong>Date:</strong> ${date}</div>
                <div><strong>Pay Mode:</strong> ${t.paymentMode}</div>
                <hr/>
                <div><strong>Bill To:</strong> ${customerName}</div>
                <div><strong>Ref By:</strong> ${doctorName}</div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th style="width:20px">SN</th>
                  <th>Product</th>
                  <th>HSN</th>
                  <th>Batch</th>
                  <th>Exp</th>
                  <th>MRP</th>
                  <th>Qty</th>
                  <th>Rate</th>
                  <th>Disc%</th>
                  <th>GST%</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                ${t.items.map((item, i) => `
                  <tr>
                    <td>${i+1}</td>
                    <td style="text-align:left">${item.name}</td>
                    <td>${item.hsn || '-'}</td>
                    <td>${item.batch || '-'}</td>
                    <td>${item.expiry ? new Date(item.expiry).toLocaleDateString('en-IN', {month:'2-digit', year:'2-digit'}) : '-'}</td>
                    <td>${item.mrp}</td>
                    <td>${item.quantity}</td>
                    <td>${(item.price / (1 - (item.discount || 0)/100)).toFixed(2)}</td> 
                    <td>${item.discount || 0}%</td>
                    <td>${item.gst || 0}%</td>
                    <td style="font-weight:bold">${item.total.toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div class="footer-section">
              <div class="tax-box">
                 <table style="width:100%; border:none;">
                   <tr>
                     <td style="border:none; text-align:left">Taxable Amt: ₹${totalTaxable.toFixed(2)}</td>
                     <td style="border:none; text-align:left">Total GST: ₹${totalGST.toFixed(2)}</td>
                   </tr>
                 </table>
                 <div style="margin-top:10px;">
                    <strong>Amount in Words:</strong><br/>
                    ${amountInWords} Only
                 </div>
              </div>

              <div class="total-box">
                <div style="display:flex; justify-content:space-between; font-size:16px; font-weight:bold;">
                   <span>GRAND TOTAL:</span>
                   <span>₹${Math.round(totalAmount).toFixed(2)}</span>
                </div>
                <div class="sign"><br/>Auth. Signatory</div>
              </div>
            </div>

          </div>
          <script>window.print();</script>
        </body>
      </html>
    `;

    const billWindow = window.open('', '', 'width=800,height=800');
    billWindow.document.write(billHTML);
    billWindow.document.close();
  };

  const getFilteredTransactions = () => {
    if (!report) return [];
    if (!searchTerm) return report.transactions;
    const lowerSearch = searchTerm.toLowerCase();
    return report.transactions.filter(t => {
        const invoice = t.invoiceNo ? t.invoiceNo.toLowerCase() : '';
        const customer = t.customerDetails?.name ? t.customerDetails.name.toLowerCase() : '';
        const medicines = t.items.map(i => i.name.toLowerCase()).join(' ');
        return invoice.includes(lowerSearch) || customer.includes(lowerSearch) || medicines.includes(lowerSearch);
    });
  };

  const filteredTransactions = getFilteredTransactions();

  if (!report) return <div>Loading Records...</div>;

  return (
    <div className="section">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
        <h2>📊 Sales Records</h2>
        <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
            <button onClick={() => setRange('today')} style={btnStyle}>Today</button>
            <button onClick={() => setRange('month')} style={btnStyle}>This Month</button>
            <button onClick={() => setRange('year')} style={btnStyle}>This Year</button>
            <span style={{marginLeft:'10px'}}>From:</span>
            <input type="date" value={dates.start} onChange={e => setDates({...dates, start: e.target.value})} style={{padding:'5px'}} />
            <span>To:</span>
            <input type="date" value={dates.end} onChange={e => setDates({...dates, end: e.target.value})} style={{padding:'5px'}} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '20px', marginBottom: '30px' }}>
        <div style={{ padding: '20px', background: '#d4edda', borderRadius: '8px', flex: 1, border: '1px solid #c3e6cb' }}>
          <h4>Total Revenue</h4>
          <h1 style={{color: '#155724'}}>₹{report.totalRevenue.toFixed(2)}</h1>
          <small>{report.totalSalesCount} Bills Generated</small>
        </div>
        <div style={{ padding: '20px', background: '#fff3cd', borderRadius: '8px', flex: 1, border: '1px solid #ffeeba' }}>
          <h4>Cash Received</h4>
          <h1 style={{color: '#856404'}}>₹{report.cashRevenue.toFixed(2)}</h1>
        </div>
        <div style={{ padding: '20px', background: '#d1ecf1', borderRadius: '8px', flex: 1, border: '1px solid #bee5eb' }}>
          <h4>Online Received</h4>
          <h1 style={{color: '#0c5460'}}>₹{report.onlineRevenue.toFixed(2)}</h1>
        </div>
      </div>

      <hr />

      <div style={{ margin: '20px 0' }}>
        <input 
            type="text" 
            placeholder="🔍 Search by Invoice No, Customer Name, or Medicine Name..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '12px', fontSize: '16px', borderRadius: '5px', border: '1px solid #ccc' }}
        />
      </div>

      <h3>📜 Transaction History ({filteredTransactions.length} records)</h3>
      <div style={{overflowX: 'auto'}}>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
            <thead style={{ background: '#343a40', color: 'white' }}>
            <tr>
                <th style={thStyle}>Date & Time</th>
                <th style={thStyle}>Invoice Details</th>
                <th style={thStyle}>Items Sold</th>
                <th style={thStyle}>Amount</th>
                <th style={thStyle}>Mode</th>
            </tr>
            </thead>
            <tbody>
            {filteredTransactions.length === 0 ? (
                <tr><td colSpan="5" style={{textAlign:'center', padding:'20px'}}>No sales found matching your criteria.</td></tr>
            ) : (
                filteredTransactions.map((t) => (
                <tr key={t._id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={tdStyle}>
                        {new Date(t.date).toLocaleDateString()} <br/>
                        <span style={{fontSize:'12px', color:'#777'}}>{new Date(t.date).toLocaleTimeString()}</span>
                    </td>

                    {/* CLICKABLE INVOICE LOGIC */}
                    <td style={tdStyle}>
                        {(!t.customerDetails || t.customerDetails.name === 'Cash Sale') ? (
                            <span style={{color: '#777', fontStyle: 'italic'}}>
                                Invoice not required
                                <br/><small>(Int. ID: {t.invoiceNo})</small>
                            </span>
                        ) : (
                            <div>
                                <button 
                                    onClick={() => handlePrintInvoice(t)}
                                    style={{
                                        background: 'none', border: 'none', color: '#007bff', 
                                        fontWeight: 'bold', textDecoration: 'underline', cursor: 'pointer', fontSize: '14px'
                                    }}
                                    title="Click to Reprint Bill"
                                >
                                    {t.invoiceNo} 🖨️
                                </button>
                                <br/>
                                👤 {t.customerDetails.name}
                            </div>
                        )}
                    </td>

                    <td style={tdStyle}>
                        {t.items.map((i, index) => (
                            <div key={index} style={{fontSize:'13px'}}>• {i.name} <span style={{color:'#555'}}>x {i.quantity}</span></div>
                        ))}
                    </td>
                    <td style={{...tdStyle, fontWeight:'bold', color:'green'}}>₹{t.totalAmount.toFixed(2)}</td>
                    <td style={tdStyle}>
                        <span style={{
                            padding: '4px 8px', borderRadius: '4px',
                            background: t.paymentMode === 'Cash' ? '#fff3cd' : '#d1ecf1',
                            color: t.paymentMode === 'Cash' ? '#856404' : '#0c5460',
                            fontWeight: 'bold', fontSize: '12px'
                        }}>{t.paymentMode}</span>
                    </td>
                </tr>
                ))
            )}
            </tbody>
        </table>
      </div>
    </div>
  );
};

const btnStyle = { padding: '5px 10px', cursor: 'pointer', background: '#e2e6ea', border: '1px solid #ccc', borderRadius:'4px' };
const thStyle = { padding: '12px', textAlign: 'left' };
const tdStyle = { padding: '12px', verticalAlign: 'top' };

export default DailyReport;