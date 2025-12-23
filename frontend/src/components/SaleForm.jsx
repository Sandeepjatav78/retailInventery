import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import '../App.css'; 

// --- RADHE PHARMACY DETAILS ---
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

const SaleForm = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [cart, setCart] = useState([]);
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [amountGiven, setAmountGiven] = useState('');
  const [changeToReturn, setChangeToReturn] = useState(0);

  // --- NEW STATE FOR PRICE EDITING ---
  const [editingIndex, setEditingIndex] = useState(null); // Track which row is being edited
  const [tempPrice, setTempPrice] = useState(''); // Store the new price temporarily

  const [isBillNeeded, setIsBillNeeded] = useState(true);
  const [customer, setCustomer] = useState({ name: '', phone: '', doctor: '' });
  const [invoiceNo, setInvoiceNo] = useState(`INV-${Math.floor(Date.now() / 1000)}`);

  useEffect(() => {
    if (query.length > 1) {
      api.get(`/medicines/search?q=${query}`).then(res => setResults(res.data));
    } else { setResults([]); }
  }, [query]);

  useEffect(() => {
    const total = cart.reduce((a, b) => a + b.total, 0);
    if (amountGiven && paymentMode === 'Cash') {
        setChangeToReturn(parseFloat(amountGiven) - total);
    } else { setChangeToReturn(0); }
  }, [amountGiven, cart, paymentMode]);

  const addToCart = (med) => {
    const existingIndex = cart.findIndex(item => item.medicineId === med._id);
    if (existingIndex !== -1) {
      const newCart = [...cart];
      if (newCart[existingIndex].quantity + 1 <= med.quantity) {
        newCart[existingIndex].quantity += 1;
        newCart[existingIndex].total = newCart[existingIndex].quantity * newCart[existingIndex].price;
        setCart(newCart);
      } else { alert(`Max stock is ${med.quantity}`); }
    } else {
      let initialDiscount = 0;
      if(med.mrp > 0) initialDiscount = ((med.mrp - med.sellingPrice) / med.mrp) * 100;
      
      setCart([...cart, {
        medicineId: med._id,
        name: med.productName,
        mrp: med.mrp,
        price: med.sellingPrice,
        discount: initialDiscount.toFixed(2),
        gst: med.gst || 0,
        hsn: med.hsnCode || 'N/A',
        batch: med.batchNumber || 'N/A',
        expiry: med.expiryDate,
        maxDiscount: med.maxDiscount || 0,
        quantity: 1,
        total: med.sellingPrice,
        maxStock: med.quantity
      }]);
    }
    setQuery('');
    setResults([]);
  };

  // --- NEW: HANDLE PRICE EDIT WITH PASSWORD ---
  const handleInitiateEdit = async (index, currentPrice) => {
    const password = prompt("🔒 Enter Admin Password to change Price:");
    if (!password) return;

    try {
      const res = await api.post('/admin/verify', { password });
      if (res.data.success) {
        setEditingIndex(index);
        setTempPrice(currentPrice);
      } else {
        alert("❌ Wrong Password! Access Denied.");
      }
    } catch (err) {
      alert("Server Error");
    }
  };

  const handleSavePrice = (index) => {
    const newPrice = parseFloat(tempPrice);
    if (isNaN(newPrice) || newPrice < 0) return alert("Invalid Price");

    const newCart = [...cart];
    newCart[index].price = newPrice;
    // Recalculate total for this item
    newCart[index].total = newPrice * newCart[index].quantity;
    
    // Recalculate discount based on MRP (Optional visual update)
    if(newCart[index].mrp > 0) {
        newCart[index].discount = ((newCart[index].mrp - newPrice) / newCart[index].mrp * 100).toFixed(2);
    }

    setCart(newCart);
    setEditingIndex(null); // Exit edit mode
  };

  // --- BILL GENERATOR ---
  const generateBillHTML = (cartItems, currentInvoiceNo) => {
    const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const time = new Date().toLocaleTimeString('en-IN', {hour: '2-digit', minute:'2-digit'});
    
    // Logic: Selling Price IS the final price. We subtract GST from it.
    let totalTaxable = 0;
    let totalGST = 0;
    const finalTotal = cartItems.reduce((acc, item) => acc + item.total, 0);

    // Calculate Breakdown for Totals
    cartItems.forEach(item => {
        const gstPercent = item.gst || 0;
        const inclusiveTotal = item.total; 
        const baseValue = inclusiveTotal / (1 + (gstPercent / 100)); // Reverse Calc
        const taxAmount = inclusiveTotal - baseValue;
        
        totalTaxable += baseValue;
        totalGST += taxAmount;
    });

    const amountInWords = numberToWords(Math.round(finalTotal));

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice #${currentInvoiceNo}</title>
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
                <div style="font-weight:700">#${currentInvoiceNo}</div>
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
                <div>${paymentMode}</div>
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
                ${cartItems.map((item, i) => {
                    // Calculation for Row Display
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
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return alert("Cart is empty");
    const total = cart.reduce((a, b) => a + b.total, 0);

    if (paymentMode === 'Cash' && parseFloat(amountGiven) < total) return alert("❌ Insufficient Cash!");
    if (isBillNeeded && !customer.name) return alert("⚠️ Customer Name is required for Bill");

    // 1. OPEN WINDOW IMMEDIATELY
    let billWindow = null;
    if (isBillNeeded) {
        billWindow = window.open('', '_blank', 'width=900,height=900');
        if(!billWindow) { alert("Popup Blocked! Allow popups."); return; }
        billWindow.document.write('<h3>Generating Bill...</h3>');
    }

    try {
      await api.post('/sales', {
        invoiceNo: invoiceNo,
        customerDetails: customer,
        items: cart.map(item => ({
            medicineId: item.medicineId,
            name: item.name,
            batch: item.batch,
            expiry: item.expiry,
            hsn: item.hsn,
            gst: item.gst,
            quantity: item.quantity,
            price: item.price,
            mrp: item.mrp,
            total: item.total
        })),
        totalAmount: total,
        paymentMode
      });
      
      if (isBillNeeded && billWindow) {
        const billContent = generateBillHTML(cart, invoiceNo);
        billWindow.document.open();
        billWindow.document.write(billContent);
        billWindow.document.close();
      }
      
      alert('✅ Sale Recorded!');
      setCart([]);
      setAmountGiven('');
      setChangeToReturn(0);
      setPaymentMode('Cash');
      setCustomer({ name: '', phone: '', doctor: '' });
      setInvoiceNo(`INV-${Math.floor(Date.now() / 1000)}`);
    } catch (err) {
      console.error(err);
      if (billWindow) billWindow.close();
      alert('Sale Failed: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleQtyChange = (index, val) => {
    const value = parseInt(val); if (!value || value < 1) return;
    const newCart = [...cart];
    if (value > newCart[index].maxStock) return alert(`Stock Limit Reached! Max: ${newCart[index].maxStock}`);
    newCart[index].quantity = value;
    newCart[index].total = value * newCart[index].price;
    setCart(newCart);
  };
  const removeFromCart = (i) => { const c = [...cart]; c.splice(i,1); setCart(c); };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', minHeight: '80vh' }}>
      
      <div className="card flex-col" style={{marginBottom:0, height: '100%'}}>
        <div style={{position:'relative', zIndex: 20}}>
            <h3>🔍 New Sale <span className="text-muted" style={{fontSize:'0.9rem', fontWeight:'400'}}>({invoiceNo})</span></h3>
            <input 
                placeholder="Type to search medicine..." 
                value={query} 
                onChange={e => setQuery(e.target.value)} 
                style={{padding: '12px', border:'2px solid var(--primary)', fontSize:'1rem'}}
            />
            {results.length > 0 && (
                <div style={{position:'absolute', width:'100%', background:'white', border:'1px solid #ddd', borderRadius:'0 0 8px 8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', maxHeight: '300px', overflowY: 'auto'}}>
                    {results.map(med => (
                        <div key={med._id} onClick={() => addToCart(med)} style={{padding:'12px', cursor:'pointer', borderBottom:'1px solid #eee'}}>
                            <div style={{fontWeight:'600', color: 'var(--text)'}}>{med.productName}</div>
                            <div style={{fontSize: '0.8rem', color: '#666'}}>
                                Batch: {med.batchNumber} | Stock: <b>{med.quantity}</b> | GST: {med.gst}% | <span style={{color:'var(--success)'}}>SP: ₹{med.sellingPrice}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>

        <div className="table-container" style={{flex:1, marginTop: '10px'}}>
            <table>
                <thead>
                    <tr>
                        <th>Item</th>
                        <th style={{width: '70px'}}>Qty</th>
                        <th>Price</th>
                        <th>Total</th>
                        <th style={{width: '50px'}}>Act</th>
                    </tr>
                </thead>
                <tbody>
                    {cart.map((item, idx) => (
                        <tr key={idx}>
                            <td>
                                <div style={{fontWeight:'600'}}>{item.name}</div>
                                <div style={{fontSize:'0.75rem', color: 'var(--text-muted)'}}>Batch: {item.batch} | GST: {item.gst}%</div>
                            </td>
                            <td>
                                <input 
                                    type="number" 
                                    value={item.quantity} 
                                    onChange={(e) => handleQtyChange(idx, e.target.value)} 
                                    style={{padding:'5px', textAlign:'center'}} 
                                />
                            </td>
                            
                            {/* --- EDITABLE PRICE SECTION --- */}
                            <td>
                                {editingIndex === idx ? (
                                    <input 
                                        type="number" 
                                        value={tempPrice} 
                                        onChange={(e) => setTempPrice(e.target.value)}
                                        onBlur={() => handleSavePrice(idx)} // Save when clicking away
                                        onKeyDown={(e) => { if(e.key === 'Enter') handleSavePrice(idx) }}
                                        autoFocus
                                        style={{width:'80px', padding:'5px'}}
                                    />
                                ) : (
                                    <div 
                                        onClick={() => handleInitiateEdit(idx, item.price)} 
                                        style={{fontWeight:'bold', cursor:'pointer', display:'flex', alignItems:'center', gap:'5px'}}
                                        title="Click to Edit Price (Admin Only)"
                                    >
                                        ₹{item.price} <span style={{fontSize:'10px'}}>✏️</span>
                                    </div>
                                )}
                            </td>
                            {/* ----------------------------- */}

                            <td style={{color: 'var(--success)', fontWeight:'bold'}}>₹{item.total.toFixed(2)}</td>
                            <td><button onClick={() => removeFromCart(idx)} className="btn btn-danger" style={{padding: '4px 8px'}}>×</button></td>
                        </tr>
                    ))}
                    {cart.length === 0 && <tr><td colSpan="5" style={{textAlign:'center', padding:'30px', color: '#aaa'}}>Cart is empty</td></tr>}
                </tbody>
            </table>
        </div>
      </div>

      <div className="card flex-col justify-between" style={{background: '#f8fafc', borderLeft:'4px solid var(--primary)', marginBottom:0}}>
        <div>
            <div style={{textAlign:'right', paddingBottom:'15px', borderBottom:'1px solid var(--border)'}}>
                <div className="text-muted" style={{fontSize:'0.9rem'}}>Total Payable</div>
                <div style={{fontSize:'3rem', fontWeight:'800', color:'var(--success)', lineHeight: 1}}>
                    ₹{cart.reduce((a, b) => a + b.total, 0).toFixed(0)}
                </div>
            </div>
            <div className="flex items-center gap-4" style={{margin:'20px 0'}}>
                <input type="checkbox" checked={isBillNeeded} onChange={(e) => setIsBillNeeded(e.target.checked)} style={{width:'20px', height:'20px'}} />
                <label style={{margin:0, fontSize:'1rem'}}>Generate Official Bill</label>
            </div>
            {isBillNeeded && (
                <div style={{background:'white', padding:'15px', borderRadius:'8px', border:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:'10px'}}>
                    <div style={{fontSize:'0.8rem', fontWeight:'bold', color:'var(--primary)'}}>CUSTOMER DETAILS</div>
                    <input placeholder="Customer Name *" value={customer.name} onChange={e => setCustomer({...customer, name: e.target.value})} />
                    <div className="flex">
                        <input placeholder="Phone" value={customer.phone} onChange={e => setCustomer({...customer, phone: e.target.value})} />
                        <input placeholder="Dr. Ref" value={customer.doctor} onChange={e => setCustomer({...customer, doctor: e.target.value})} />
                    </div>
                </div>
            )}
        </div>
        <div>
            <label>Payment Mode</label>
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} style={{marginBottom:'15px', padding:'12px'}}>
                <option value="Cash">Cash</option>
                <option value="Online">Online / UPI</option>
            </select>
            {paymentMode === 'Cash' && (
                <div style={{background:'#fff7ed', padding:'15px', borderRadius:'8px', border:'1px solid orange', marginBottom:'15px'}}>
                    <div className="flex justify-between items-center">
                        <label style={{marginBottom:0}}>Cash Received</label>
                        <input type="number" value={amountGiven} onChange={(e) => setAmountGiven(e.target.value)} style={{width:'100px', fontSize:'1.1rem', textAlign:'right'}} />
                    </div>
                    <div className="flex justify-between items-center" style={{marginTop:'10px', fontSize:'1.1rem'}}>
                        <span>Return:</span>
                        <span style={{fontWeight:'bold', color: changeToReturn < 0 ? 'red' : 'blue'}}>₹{changeToReturn.toFixed(2)}</span>
                    </div>
                </div>
            )}
            <button onClick={handleCheckout} className="btn btn-primary w-full" style={{padding:'16px', fontSize:'1.2rem', marginTop:'10px'}}>COMPLETE SALE</button>
        </div>
      </div>
    </div>
  );
};

export default SaleForm;