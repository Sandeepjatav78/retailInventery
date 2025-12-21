import React, { useState, useEffect } from 'react';
import api from '../api/axios';

// --- RADHE PHARMACY DETAILS ---
const PHARMACY_DETAILS = {
  name: "RADHE PHARMACY",
  address: "Hari Singh Chowk, Devi Mandir Road, Panipat",
  gstin: "06NNTPS0144E",
  dlNo: "RLF20HR2025005933, RLF21HR2025005925",
  phone: "8053229309",
  email: "radhepharmacy099@gmail.com"
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

const SaleForm = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [cart, setCart] = useState([]);
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [amountGiven, setAmountGiven] = useState('');
  const [changeToReturn, setChangeToReturn] = useState(0);

  const [isBillNeeded, setIsBillNeeded] = useState(true);
  const [customer, setCustomer] = useState({ name: '', phone: '', doctor: '' });
  const [invoiceNo, setInvoiceNo] = useState(`INV-${Math.floor(Date.now() / 1000)}`);

  useEffect(() => {
    if (query.length > 1) {
      api.get(`/medicines/search?q=${query}`).then(res => setResults(res.data));
    } else {
      setResults([]);
    }
  }, [query]);

  useEffect(() => {
    const total = cart.reduce((a, b) => a + b.total, 0);
    if (amountGiven && paymentMode === 'Cash') {
        setChangeToReturn(parseFloat(amountGiven) - total);
    } else {
        setChangeToReturn(0);
    }
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

  const generateBillHTML = () => {
    const date = new Date().toLocaleDateString('en-IN');
    const totalAmount = cart.reduce((a, b) => a + b.total, 0);
    const totalTaxable = cart.reduce((a, b) => a + (b.total / (1 + (b.gst/100))), 0);
    const totalGST = totalAmount - totalTaxable;
    const amountInWords = numberToWords(Math.round(totalAmount));

    return `
      <html>
        <head>
          <title>Invoice ${invoiceNo}</title>
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
          <center><strong style="font-size:14px; text-decoration: underline;">GST INVOICE</strong></center>
          <div class="container">
            <div class="header">
              <div class="header-left">
                <div class="title">${PHARMACY_DETAILS.name}</div>
                <div>${PHARMACY_DETAILS.address}</div>
                <div><strong>GSTIN:</strong> ${PHARMACY_DETAILS.gstin}</div>
                <div><strong>DL No:</strong> ${PHARMACY_DETAILS.dlNo}</div>
                <div><strong>Phone:</strong> ${PHARMACY_DETAILS.phone}</div>
                <div><strong>Email:</strong> ${PHARMACY_DETAILS.email}</div>
              </div>
              <div class="header-right">
                <div><strong>Invoice No:</strong> ${invoiceNo}</div>
                <div><strong>Date:</strong> ${date}</div>
                <div><strong>Pay Mode:</strong> ${paymentMode}</div>
                <hr/>
                <div><strong>Bill To:</strong> ${customer.name}</div>
                <div><strong>Ref By:</strong> ${customer.doctor || 'Self'}</div>
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
                ${cart.map((item, i) => `
                  <tr>
                    <td>${i+1}</td>
                    <td style="text-align:left">${item.name}</td>
                    <td>${item.hsn}</td>
                    <td>${item.batch}</td>
                    <td>${item.expiry ? new Date(item.expiry).toLocaleDateString('en-IN', {month:'2-digit', year:'2-digit'}) : '-'}</td>
                    <td>${item.mrp}</td>
                    <td>${item.quantity}</td>
                    <td>${(item.price / (1 - item.discount/100)).toFixed(2)}</td> 
                    <td>${item.discount}%</td>
                    <td>${item.gst}%</td>
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
                 <div style="margin-top:5px; font-size:9px;">
                    <strong>Terms:</strong> 1. Goods once sold will not be taken back. 2. Subject to Panipat Jurisdiction.
                 </div>
              </div>

              <div class="total-box">
                <div style="display:flex; justify-content:space-between;">
                   <span>Sub Total:</span>
                   <span>${totalAmount.toFixed(2)}</span>
                </div>
                <div style="display:flex; justify-content:space-between;">
                   <span>Round Off:</span>
                   <span>0.00</span>
                </div>
                <hr/>
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
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return alert("Cart is empty");
    const total = cart.reduce((a, b) => a + b.total, 0);

    if (paymentMode === 'Cash' && parseFloat(amountGiven) < total) return alert("❌ Insufficient Cash!");
    if (isBillNeeded && !customer.name) return alert("⚠️ Customer Name is required for Bill");

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
      
      if (isBillNeeded) {
        const billWindow = window.open('', '', 'width=800,height=800');
        billWindow.document.write(generateBillHTML());
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
    <div className="section" style={{ display: 'flex', gap: '20px' }}>
      
      <div style={{ flex: 3 }}>
        <h2>New Sale <span style={{fontSize:'12px', color:'#777'}}>({invoiceNo})</span></h2>
        <input placeholder="Search Medicine..." value={query} onChange={e => setQuery(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px' }} />
        {results.length > 0 && (
          <div style={{ border: '1px solid #ccc', maxHeight: '150px', overflowY: 'auto', marginBottom: '20px' }}>
            {results.map(med => (
              <div key={med._id} onClick={() => addToCart(med)} style={{ padding: '10px', cursor: 'pointer', borderBottom: '1px solid #eee' }}>
                <strong>{med.productName}</strong> - SP: ₹{med.sellingPrice} | MRP: ₹{med.mrp}
              </div>
            ))}
          </div>
        )}
        <h3>Cart</h3>
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize:'13px' }}>
          <thead>
            <tr style={{background:'#f9f9f9', borderBottom:'2px solid #ddd'}}>
                <th>Item</th>
                <th>Batch</th>
                <th>Qty</th>
                <th>MRP</th>
                <th>Price</th>
                <th>Total</th>
                <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {cart.map((item, idx) => (
              <tr key={idx} style={{borderBottom:'1px solid #eee'}}>
                <td>{item.name}</td>
                <td style={{fontSize:'11px'}}>{item.batch}<br/>{item.expiry ? new Date(item.expiry).toLocaleDateString() : ''}</td>
                <td><input type="number" value={item.quantity} onChange={(e) => handleQtyChange(idx, e.target.value)} style={{width:'40px'}} /></td>
                <td>{item.mrp}</td>
                <td>{item.price}</td>
                <td>{item.total.toFixed(2)}</td>
                <td><button onClick={() => removeFromCart(idx)} style={{color:'red', border:'none'}}>X</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ flex: 1, background: '#f8f9fa', padding: '20px', borderRadius: '8px' }}>
        <h1 style={{ color: 'green', margin: '0 0 20px 0' }}>₹{cart.reduce((a, b) => a + b.total, 0).toFixed(0)}</h1>
        
        <div style={{ marginBottom: '15px', padding: '10px', background: '#e3f2fd', borderRadius: '5px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 'bold' }}>
            <input type="checkbox" checked={isBillNeeded} onChange={(e) => setIsBillNeeded(e.target.checked)} />
            🖨️ Generate Bill
          </label>
        </div>

        {isBillNeeded && (
          <div style={{ marginBottom: '20px', padding: '10px', border: '1px dashed #007bff', background: 'white' }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#007bff' }}>Customer Details</h4>
            <input placeholder="Customer Name *" value={customer.name} onChange={e => setCustomer({...customer, name: e.target.value})} style={{ width: '90%', padding: '8px', marginBottom: '5px' }} />
            <input placeholder="Phone Number" value={customer.phone} onChange={e => setCustomer({...customer, phone: e.target.value})} style={{ width: '90%', padding: '8px', marginBottom: '5px' }} />
            <input placeholder="Doctor Name" value={customer.doctor} onChange={e => setCustomer({...customer, doctor: e.target.value})} style={{ width: '90%', padding: '8px' }} />
          </div>
        )}

        <div style={{ margin: '20px 0' }}>
            <label style={{ fontWeight: 'bold' }}>Payment Mode:</label>
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} style={{ width: '100%', padding: '10px' }}>
                <option value="Cash">Cash</option>
                <option value="Online">Online</option>
            </select>
        </div>

        {paymentMode === 'Cash' && (
            <div style={{ background: '#e9ecef', padding: '10px', marginBottom: '20px' }}>
                <input type="number" placeholder="Amt Given" value={amountGiven} onChange={(e) => setAmountGiven(e.target.value)} style={{ width: '90%', padding: '10px' }} />
                <div style={{ marginTop: '10px' }}><strong>Return: </strong><span style={{ color: changeToReturn < 0 ? 'red' : 'blue' }}>₹{changeToReturn.toFixed(2)}</span></div>
            </div>
        )}

        <button onClick={handleCheckout} style={{ width: '100%', padding: '15px', background: 'green', color: 'white', border: 'none', borderRadius: '5px' }}>
          COMPLETE SALE
        </button>
      </div>
    </div>
  );
};

export default SaleForm;