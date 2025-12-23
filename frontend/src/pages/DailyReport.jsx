import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import '../App.css'; 

// --- PHARMACY DETAILS ---
const PHARMACY_DETAILS = {
  name: "RADHE PHARMACY",
  address: "Hari Singh Chowk, Devi Mandir Road, Panipat",
  gstin: "06NNTPS0144E",
  dlNo: "RLF20HR2025005933, RLF21HR2025005925",
  phone: "8053229309",
  email: "radhepharmacy099@gmail.com"
};

// Helper: Number to Words
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
    setDates({ start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] });
  };

  // --- UPDATED PRINT LOGIC (Matches SaleForm Exactly) ---
  const handlePrintInvoice = (t) => {
    const date = new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const time = new Date(t.date).toLocaleTimeString('en-IN', {hour: '2-digit', minute:'2-digit'});
    
    // REVERSE CALCULATE TAX (Inclusive Logic)
    let totalTaxable = 0;
    let totalGST = 0;
    const finalTotal = t.totalAmount;

    t.items.forEach(item => {
        const gstPercent = item.gst || 0;
        const inclusiveTotal = item.total; 
        const baseValue = inclusiveTotal / (1 + (gstPercent / 100));
        const taxAmount = inclusiveTotal - baseValue;
        
        totalTaxable += baseValue;
        totalGST += taxAmount;
    });

    const amountInWords = numberToWords(Math.round(finalTotal));
    const customer = t.customerDetails || { name: 'Cash Sale', phone: '', doctor: '' };

    const billHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice #${t.invoiceNo}</title>
          <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700;800&family=Dancing+Script:wght@600&display=swap" rel="stylesheet">
          <style>
            :root { --brand: #0f766e; --text: #1f2937; --gray: #6b7280; --bg: #f8fafc; }
            body { font-family: 'Manrope', sans-serif; margin: 0; padding: 20px; color: var(--text); background: #fff; max-width: 850px; margin: 0 auto; }
            
            .header-row { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 15px; border-bottom: 2px solid var(--brand); }
            .brand-name { font-size: 32px; font-weight: 800; color: var(--brand); margin: 0; line-height: 1; }
            .brand-details { font-size: 12px; color: var(--gray); margin-top: 5px; line-height: 1.4; }
            
            .invoice-badge { text-align: right; }
            .gst-label { background: var(--brand); color: white; padding: 5px 10px; font-size: 13px; font-weight: 700; border-radius: 4px; display: inline-block; margin-bottom: 5px; }
            
            .info-grid { display: flex; justify-content: space-between; margin: 20px 0; background: var(--bg); padding: 12px; border-radius: 8px; font-size: 13px; }
            .info-box h4 { font-size: 10px; text-transform: uppercase; color: var(--gray); margin: 0 0 3px 0; }
            .info-box div { font-weight: 600; color: #000; }
            
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
            th { text-align: left; padding: 8px; background: #fff; border-bottom: 2px solid #e5e7eb; font-size: 11px; text-transform: uppercase; color: var(--gray); }
            td { padding: 10px 8px; border-bottom: 1px solid #f1f5f9; font-weight: 500; vertical-align: middle; }
            
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            
            .footer-grid { display: flex; justify-content: space-between; margin-top: 10px; }
            .words-box { width: 55%; font-size: 11px; color: var(--gray); line-height: 1.5; }
            .totals-box { width: 40%; }
            .total-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; color: var(--text); }
            .grand-total { display: flex; justify-content: space-between; background: var(--brand); color: white; padding: 8px; border-radius: 6px; font-size: 16px; font-weight: 700; margin-top: 8px; }
            
            .sign { margin-top: 30px; text-align: right; font-size: 12px; font-weight: 600; }
            
            @media print { body { padding: 0; -webkit-print-color-adjust: exact; } .info-grid { background: #f8fafc !important; } .gst-label, .grand-total { background: var(--brand) !important; color: white !important; } }
          </style>
        </head>
        <body>
          <div class="header-row">
            <div>
                <h1 class="brand-name">${PHARMACY_DETAILS.name}</h1>
                <div class="brand-details">
                    ${PHARMACY_DETAILS.address}<br>
                    <strong>GSTIN:</strong> ${PHARMACY_DETAILS.gstin} | <strong>DL:</strong> ${PHARMACY_DETAILS.dlNo}<br>
                    Ph: ${PHARMACY_DETAILS.phone}
                </div>
            </div>
            <div class="invoice-badge">
                <div class="gst-label">GST INVOICE</div>
                <div style="font-weight:700">#${t.invoiceNo}</div>
                <div style="font-size:11px; color:#666">${date} &bull; ${time}</div>
            </div>
          </div>

          <div class="info-grid">
            <div class="info-box" style="width: 40%;">
                <h4>Billed To</h4>
                <div>${customer.name}</div>
                <div style="font-weight:400">${customer.phone || '-'}</div>
            </div>
            <div class="info-box">
                <h4>Dr. Ref</h4>
                <div>${customer.doctor || 'Self'}</div>
            </div>
            <div class="info-box" style="text-align: right;">
                <h4>Mode</h4>
                <div>${t.paymentMode}</div>
            </div>
          </div>

          <table>
            <thead>
                <tr>
                    <th style="width: 5%;">#</th>
                    <th style="width: 30%;">Item</th>
                    <th style="width: 15%;">Batch</th>
                    <th class="text-right" style="width: 10%;">Rate</th>
                    <th class="text-center" style="width: 8%;">Qty</th>
                    <th class="text-right" style="width: 15%;">GST Breakdown</th>
                    <th class="text-right" style="width: 17%;">Net Total</th>
                </tr>
            </thead>
            <tbody>
                ${t.items.map((item, i) => {
                    const inclusivePrice = item.price;
                    const gstPercent = item.gst || 0;
                    const basePrice = inclusivePrice / (1 + (gstPercent/100));
                    const taxPerItem = inclusivePrice - basePrice;
                    const totalTaxForItem = taxPerItem * item.quantity;

                    return `
                    <tr>
                        <td>${i+1}</td>
                        <td>
                            <div style="font-weight:700; color:#000;">${item.name}</div>
                            <div style="font-size:10px; color:#6b7280">HSN: ${item.hsn || '-'} | Exp: ${item.expiry ? new Date(item.expiry).toLocaleDateString('en-IN', {month:'short', year:'2-digit'}) : '-'}</div>
                        </td>
                        <td>${item.batch}</td>
                        <td class="text-right">₹${item.price}</td>
                        <td class="text-center" style="font-weight:700">${item.quantity}</td>
                        <td class="text-right">
                            <div style="font-size:10px; color:#666">Tax: ${gstPercent}%</div>
                            <div style="font-weight:600; color:var(--brand)">₹${totalTaxForItem.toFixed(2)}</div>
                        </td>
                        <td class="text-right" style="font-weight:700; color:#000;">₹${item.total.toFixed(2)}</td>
                    </tr>
                    `;
                }).join('')}
            </tbody>
          </table>

          <div class="footer-grid">
            <div class="words-box">
                <h4>Amount in Words</h4>
                <strong style="color:var(--brand)">${amountInWords} Only</strong>
                <div style="margin-top: 10px; color:#999; font-size:10px;">
                    Note: Prices are inclusive of GST.<br>
                    Goods once sold will not be returned.
                </div>
            </div>

            <div class="totals-box">
                <div class="total-row"><span>Total Taxable Value</span><span>₹${totalTaxable.toFixed(2)}</span></div>
                <div class="total-row"><span>Total GST Amount</span><span>₹${totalGST.toFixed(2)}</span></div>
                <div class="total-row"><span>Round Off</span><span>0.00</span></div>
                <div class="grand-total"><span>Grand Total</span><span>₹${Math.round(finalTotal).toFixed(2)}</span></div>
            </div>
          </div>

          <div class="quote-box" style="margin-top:30px; text-align:center;">
            <div style="font-family:'Dancing Script', cursive; font-size:20px; color:var(--brand);">Get Well Soon!</div>
            <div class="sign">Authorized Signatory<br>For ${PHARMACY_DETAILS.name}</div>
          </div>

          <script>
             setTimeout(function() { window.print(); }, 500);
          </script>
        </body>
      </html>
    `;

    const billWindow = window.open('', '', 'width=900,height=900');
    if(billWindow) {
        billWindow.document.write(billHTML);
        billWindow.document.close();
    } else {
        alert("Popup blocked! Please allow popups to print.");
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
        return invoice.includes(lowerSearch) || customer.includes(lowerSearch) || medicines.includes(lowerSearch);
    });
  };

  const filteredTransactions = getFilteredTransactions();

  if (!report) return <div className="text-center p-5">Loading Records...</div>;

  return (
    <div>
      <div className="flex justify-between items-center" style={{marginBottom:'20px'}}>
        <h2>📊 Sales Report</h2>
        <div className="flex items-center gap-4 bg-white p-2 rounded border">
            <button onClick={() => setRange('today')} className="btn btn-secondary">Today</button>
            <button onClick={() => setRange('month')} className="btn btn-secondary">Month</button>
            <span className="text-muted">From:</span>
            <input type="date" value={dates.start} onChange={e => setDates({...dates, start: e.target.value})} />
            <span className="text-muted">To:</span>
            <input type="date" value={dates.end} onChange={e => setDates({...dates, end: e.target.value})} />
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '30px' }}>
        <div className="card" style={{borderLeft: '5px solid var(--success)'}}>
          <h4 className="text-muted">Total Revenue</h4>
          <h1 className="text-success" style={{fontSize: '2.5rem'}}>₹{report.totalRevenue.toFixed(2)}</h1>
          <div className="text-muted">{report.totalSalesCount} Bills Generated</div>
        </div>
        <div className="card" style={{borderLeft: '5px solid var(--accent)'}}>
          <h4 className="text-muted">Cash Received</h4>
          <h1 style={{color: 'var(--accent)', fontSize: '2rem'}}>₹{report.cashRevenue.toFixed(2)}</h1>
        </div>
        <div className="card" style={{borderLeft: '5px solid var(--secondary)'}}>
          <h4 className="text-muted">Online Received</h4>
          <h1 style={{color: 'var(--secondary)', fontSize: '2rem'}}>₹{report.onlineRevenue.toFixed(2)}</h1>
        </div>
      </div>

      <div className="card">
        <div style={{ marginBottom: '20px' }}>
            <input 
                type="text" 
                placeholder="🔍 Search by Invoice No, Customer Name, or Medicine Name..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{padding: '12px', fontSize: '1rem'}}
            />
        </div>

        <div className="table-container">
            <table>
                <thead>
                <tr>
                    <th>Date</th>
                    <th>Invoice Details</th>
                    <th>Items Sold</th>
                    <th>Amount</th>
                    <th>Mode</th>
                </tr>
                </thead>
                <tbody>
                {filteredTransactions.length === 0 ? (
                    <tr><td colSpan="5" className="text-center p-5 text-muted">No sales found matching your criteria.</td></tr>
                ) : (
                    filteredTransactions.map((t) => (
                    <tr key={t._id}>
                        <td>
                            <div style={{fontWeight:'600'}}>{new Date(t.date).toLocaleDateString()}</div>
                            <div className="text-muted" style={{fontSize:'0.8rem'}}>{new Date(t.date).toLocaleTimeString()}</div>
                        </td>

                        <td>
                            {(!t.customerDetails || t.customerDetails.name === 'Cash Sale') ? (
                                <span className="text-muted" style={{fontStyle: 'italic'}}>
                                    No Bill <br/><small>ID: {t.invoiceNo}</small>
                                </span>
                            ) : (
                                <div>
                                    <button 
                                        onClick={() => handlePrintInvoice(t)}
                                        className="btn btn-secondary"
                                        style={{padding: '4px 8px', fontSize: '0.8rem', color: 'var(--primary)', borderColor: 'var(--primary)'}}
                                    >
                                        {t.invoiceNo} 🖨️
                                    </button>
                                    <div style={{marginTop: '4px', fontWeight: '500'}}>👤 {t.customerDetails.name}</div>
                                </div>
                            )}
                        </td>

                        <td>
                            {t.items.map((i, index) => (
                                <div key={index} style={{fontSize:'0.85rem'}}>• {i.name} <span className="text-muted">x {i.quantity}</span></div>
                            ))}
                        </td>
                        <td className="text-success" style={{fontWeight:'bold'}}>₹{t.totalAmount.toFixed(2)}</td>
                        <td>
                            <span style={{
                                padding: '4px 10px', borderRadius: '20px',
                                background: t.paymentMode === 'Cash' ? '#fff7ed' : '#eff6ff',
                                color: t.paymentMode === 'Cash' ? '#c2410c' : '#1d4ed8',
                                fontWeight: '600', fontSize: '0.8rem'
                            }}>{t.paymentMode}</span>
                        </td>
                    </tr>
                    ))
                )}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};

export default DailyReport;