import React, { useState, useEffect, useRef } from "react";
import api from "../api/axios";
import { generateBillHTML } from "../utils/BillGenerator";
import "../App.css";

const SaleForm = () => {
  // --- 1. LOAD SAVED STATE ---
  const getSavedState = (key, defaultValue) => {
    try {
      const saved = localStorage.getItem("draft_sale_v2");
      if (!saved) return defaultValue;
      const parsed = JSON.parse(saved);
      return parsed[key] !== undefined ? parsed[key] : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  };

  // --- 2. STATES ---
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]); 
  
  const [cart, setCart] = useState(() => getSavedState("cart", []));
  const [paymentMode, setPaymentMode] = useState(() => getSavedState("paymentMode", "Cash"));
  const [amountGiven, setAmountGiven] = useState(() => getSavedState("amountGiven", ""));
  const [changeToReturn, setChangeToReturn] = useState(0);
  const [isBillNeeded, setIsBillNeeded] = useState(() => getSavedState("isBillNeeded", true));
  const [customer, setCustomer] = useState(() => getSavedState("customer", { name: "", phone: "", doctor: "" }));
  
  const [invoiceNo, setInvoiceNo] = useState("Loading...");

  const [focusedIndex, setFocusedIndex] = useState(-1);
  const resultListRef = useRef(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [tempPrice, setTempPrice] = useState("");
  const [lastSale, setLastSale] = useState(null);

  // --- 3. FETCH INVOICE ID ---
  const fetchNextInvoice = async () => {
    try {
        const res = await api.get('/sales/next-id');
        if(res.data.success) setInvoiceNo(res.data.nextInvoiceNo);
    } catch (err) {
        setInvoiceNo("OFFLINE"); 
    }
  };

  useEffect(() => { fetchNextInvoice(); }, []);

  // --- 4. AUTO-SAVE ---
  useEffect(() => {
    const dataToSave = { cart, customer, paymentMode, isBillNeeded, amountGiven, query };
    localStorage.setItem("draft_sale_v2", JSON.stringify(dataToSave));
  }, [cart, customer, paymentMode, isBillNeeded, amountGiven, query]);

  // --- 5. CALCULATIONS ---
  useEffect(() => {
    const total = cart.reduce((a, b) => a + b.total, 0);
    const given = parseFloat(amountGiven) || 0;
    setChangeToReturn(paymentMode === "Cash" ? given - total : 0);
  }, [amountGiven, cart, paymentMode]);

  // --- 6. SEARCH ---
  useEffect(() => {
    if (query.length > 1) {
      api.get(`/medicines/search?q=${query}`).then((res) => {
        setResults(res.data);
        setFocusedIndex(-1);
      });
    } else {
      setResults([]);
      setFocusedIndex(-1);
    }
  }, [query]);

  // --- 7. CORE ACTIONS ---
  const addToCart = (med) => {
    setLastSale(null);
    const idx = cart.findIndex((item) => item.medicineId === med._id);
    if (idx !== -1) {
      const newCart = [...cart];
      if (newCart[idx].quantity + 1 <= med.quantity) {
        newCart[idx].quantity += 1;
        newCart[idx].total = newCart[idx].quantity * newCart[idx].price;
        setCart(newCart);
      } else { alert(`Stock Limit: ${med.quantity}`); }
    } else {
      const discount = med.mrp > 0 ? ((med.mrp - med.sellingPrice) / med.mrp) * 100 : 0;
      setCart([...cart, {
        medicineId: med._id, name: med.productName, mrp: med.mrp, price: med.sellingPrice,
        discount: discount.toFixed(2), gst: med.gst || 0, hsn: med.hsnCode || "N/A",
        batch: med.batchNumber || "N/A", expiry: med.expiryDate, quantity: 1,
        total: med.sellingPrice, maxStock: med.quantity, packSize: med.packSize || 1,
      }]);
    }
    setQuery(""); setResults([]);
  };

  const updateQty = (index, val) => {
      const newQty = parseFloat(val);
      if(!newQty || newQty <= 0) return;
      const newCart = [...cart];
      if(newQty > newCart[index].maxStock) return alert(`Max Stock: ${newCart[index].maxStock}`);
      newCart[index].quantity = newQty;
      newCart[index].total = newQty * newCart[index].price;
      setCart(newCart);
  };

  const removeFromCart = (idx) => {
      const c = [...cart];
      c.splice(idx, 1);
      setCart(c);
  };

  const handleInitiateEdit = async (index, currentPrice) => {
    const password = prompt("🔒 Admin Password:");
    if (!password) return;
    try {
      const res = await api.post("/admin/verify", { password });
      if (res.data.success) { setEditingIndex(index); setTempPrice(currentPrice); } 
      else { alert("❌ Wrong Password!"); }
    } catch (err) { alert("Server Error"); }
  };

  const handleSavePrice = (index) => {
    const newPrice = parseFloat(tempPrice);
    if (isNaN(newPrice) || newPrice < 0) return alert("Invalid Price");
    const newCart = [...cart];
    newCart[index].price = newPrice;
    newCart[index].total = newPrice * newCart[index].quantity;
    setCart(newCart);
    setEditingIndex(null);
  };

  // --- 8. CHECKOUT ---
  const handleCheckout = async () => {
    if (cart.length === 0) return alert("Cart is empty");
    const total = cart.reduce((a, b) => a + b.total, 0);
    const given = parseFloat(amountGiven) || 0;
    
    if (paymentMode === "Cash" && given < total) return alert("Insufficient Cash!");
    if (isBillNeeded && !customer.name.trim()) return alert("Enter Customer Name for Bill");

    const finalCustomer = isBillNeeded ? customer : { name: "Don't want bill by customer", phone: "", doctor: "" };

    const saleData = {
      customerDetails: finalCustomer, 
      totalAmount: total, 
      paymentMode,
      items: cart.map(i => ({
        medicineId: i.medicineId, name: i.name, batch: i.batch, expiry: i.expiry,
        hsn: i.hsn, gst: i.gst, packSize: i.packSize, quantity: i.quantity,
        price: i.price, mrp: i.mrp, total: i.total
      }))
    };

    try {
      let billWindow = null;
      if (isBillNeeded) {
        billWindow = window.open("", "_blank", "width=900,height=900");
        if(billWindow) billWindow.document.write("<h3>Generating...</h3>");
      }

      const res = await api.post("/sales", saleData);
      const finalInvoiceNo = res.data.invoiceNo; 

      if (isBillNeeded && billWindow) {
        const invData = { no: finalInvoiceNo, name: customer.name, phone: customer.phone, doctor: customer.doctor, mode: paymentMode };
        const billContent = await generateBillHTML(cart, invData);
        billWindow.document.open(); billWindow.document.write(billContent); billWindow.document.close();
      } else if (!isBillNeeded && billWindow) {
          billWindow.close(); 
      }

      setLastSale({ cart: [...cart], invoiceNo: finalInvoiceNo, customer: finalCustomer, paymentMode });
      clearDraft();
      fetchNextInvoice(); 

    } catch (err) { alert("Sale Failed: " + (err.response?.data?.message || err.message)); }
  };

  const clearDraft = () => {
      localStorage.removeItem("draft_sale_v2");
      setCart([]); setAmountGiven(""); setChangeToReturn(0); setPaymentMode("Cash");
      setCustomer({ name: "", phone: "", doctor: "" });
      setResults([]); setQuery("");
  };

  const handleReprint = async () => {
      if(!lastSale) return;
      const billWindow = window.open("", "_blank", "width=900,height=900");
      if(!billWindow) return alert("Popup Blocked");
      const invData = { no: lastSale.invoiceNo, name: lastSale.customer.name, phone: lastSale.customer.phone, doctor: lastSale.customer.doctor, mode: lastSale.paymentMode };
      const html = await generateBillHTML(lastSale.cart, invData);
      billWindow.document.open(); billWindow.document.write(html); billWindow.document.close();
  };

  const handleKeyDown = (e) => {
    if (results.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setFocusedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFocusedIndex(prev => (prev > 0 ? prev - 1 : 0)); }
    else if (e.key === "Enter" && focusedIndex >= 0) { e.preventDefault(); addToCart(results[focusedIndex]); }
  };

  return (
    <div className="sale-grid"> {/* THIS CLASS CREATES THE PARTITION */}
      
      {/* LEFT PANEL: Medicine Selection & Cart */}
      <div className="card flex-col" style={{ height: "100%", padding: 0 }}>
        
        {/* Header & Search */}
        <div style={{ padding: "15px", borderBottom: "1px solid var(--border)" }}>
            <div className="flex justify-between items-center" style={{marginBottom:'10px'}}>
                <h3 style={{margin:0, color:'var(--primary)'}}>💊 New Sale</h3>
                <div className="flex items-center gap-2">
                    {cart.length > 0 && <button onClick={clearDraft} className="btn-danger" style={{padding:'4px 8px', fontSize:'0.8rem'}}>Clear</button>}
                    <span style={{background:'#e0e7ff', color:'#3730a3', padding:'4px 8px', borderRadius:'6px', fontSize:'0.8rem', fontWeight:'600'}}>
                        {invoiceNo}
                    </span>
                </div>
            </div>
            <div style={{position:'relative'}}>
                <input 
                    placeholder="Scan barcode or type name..." 
                    value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleKeyDown} autoFocus 
                />
                {results.length > 0 && (
                    <div ref={resultListRef} className="search-dropdown">
                        {results.map((med, idx) => (
                            <div key={med._id} onClick={() => addToCart(med)} className={`search-item ${idx === focusedIndex ? "active" : ""}`}>
                                <div>
                                    <div style={{fontWeight:'600'}}>{med.productName}</div>
                                    <div style={{fontSize:'0.75rem', color:'#64748b'}}>Stock: <b>{med.quantity}</b> | Batch: {med.batchNumber}</div>
                                </div>
                                <div style={{fontWeight:'700', color:'var(--success)'}}>₹{med.sellingPrice}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>

        {/* Cart Table */}
        <div className="table-container" style={{flex:1, border:'none', borderRadius:0}}>
            <table>
                <thead style={{position:'sticky', top:0, zIndex:10}}>
                    <tr>
                        <th style={{paddingLeft:'20px'}}>Item</th>
                        <th style={{textAlign:'center', width:'100px'}}>Qty</th>
                        <th style={{textAlign:'right'}}>Total</th>
                        <th style={{width:'40px'}}></th>
                    </tr>
                </thead>
                <tbody>
                    {cart.map((item, idx) => (
                        <tr key={idx}>
                            <td style={{paddingLeft:'20px'}}>
                                <div style={{fontWeight:'600', fontSize:'0.9rem'}}>{item.name}</div>
                                <div style={{fontSize:'0.7rem', color:'#64748b'}}>₹{item.price}</div>
                            </td>
                            <td style={{textAlign:'center'}}>
                                <div className="flex items-center justify-center" style={{gap:'5px'}}>
                                    <button onClick={() => updateQty(idx, item.quantity - 1)} className="btn-qty">-</button>
                                    <span style={{width:'30px', textAlign:'center', fontWeight:'bold'}}>{item.quantity}</span>
                                    <button onClick={() => updateQty(idx, item.quantity + 1)} className="btn-qty">+</button>
                                </div>
                            </td>
                            <td style={{textAlign:'right', fontWeight:'700', color:'var(--text)'}}>₹{item.total.toFixed(2)}</td>
                            <td style={{textAlign:'center'}}>
                                <button onClick={() => removeFromCart(idx)} style={{background:'none', border:'none', color:'var(--danger)', fontSize:'1.2rem', cursor:'pointer'}}>×</button>
                            </td>
                        </tr>
                    ))}
                    {cart.length === 0 && <tr><td colSpan="4" style={{textAlign:'center', padding:'40px', color:'#94a3b8'}}>Start adding items...</td></tr>}
                </tbody>
            </table>
        </div>
      </div>

      {/* RIGHT PANEL: Details & Payment */}
      <div className="card flex-col" style={{ padding: "20px", height: 'auto' }}>
        
        <div style={{background:'var(--primary-light)', padding:'20px', borderRadius:'10px', textAlign:'center', marginBottom:'10px'}}>
            <div style={{fontSize:'0.8rem', textTransform:'uppercase', letterSpacing:'1px', color:'var(--primary-dark)'}}>Total Payable</div>
            <div style={{fontSize:'2.5rem', fontWeight:'800', color:'var(--primary-dark)', lineHeight:1}}>
                ₹{cart.reduce((a, b) => a + b.total, 0).toFixed(0)}
            </div>
        </div>

        {lastSale && (
            <div style={{background:'#dcfce7', color:'#166534', padding:'10px', borderRadius:'8px', fontSize:'0.9rem', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <span>✅ Saved!</span>
                <button onClick={handleReprint} style={{background:'none', border:'none', textDecoration:'underline', cursor:'pointer', color:'#15803d', fontWeight:'bold'}}>Reprint</button>
            </div>
        )}

        <div style={{borderBottom:'1px solid var(--border)', paddingBottom:'15px', marginBottom:'15px'}}>
            <div className="flex justify-between" style={{marginBottom:'8px', alignItems:'center'}}>
                <span style={{fontSize:'0.85rem', fontWeight:'600', color:'var(--text-light)'}}>Customer Details</span>
                <label style={{fontSize:'0.85rem', display:'flex', alignItems:'center', gap:'6px', cursor:'pointer', fontWeight:'600', color:'var(--primary)'}}>
                    <input type="checkbox" checked={isBillNeeded} onChange={e => setIsBillNeeded(e.target.checked)} /> 
                    Print Bill
                </label>
            </div>
            
            {isBillNeeded ? (
                <div className="flex-col">
                    <input placeholder="Name *" value={customer.name} onChange={e => setCustomer({...customer, name:e.target.value})} />
                    <div className="flex">
                        <input placeholder="Phone" value={customer.phone} onChange={e => setCustomer({...customer, phone:e.target.value})} />
                        <input placeholder="Doctor" value={customer.doctor} onChange={e => setCustomer({...customer, doctor:e.target.value})} />
                    </div>
                </div>
            ) : (
                <div style={{fontSize:'0.8rem', color:'#64748b', fontStyle:'italic'}}>
                    (Sale will be recorded as "Cash Sale")
                </div>
            )}
        </div>

        <div className="flex-col">
            <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)}>
                <option value="Cash">Cash</option>
                <option value="Online">Online / UPI</option>
            </select>
            
            {paymentMode === "Cash" && (
                <div className="flex justify-between items-center" style={{background:'#fff7ed', padding:'10px', borderRadius:'8px', border:'1px solid #ffedd5'}}>
                    <input type="number" placeholder="Given" value={amountGiven} onChange={e => setAmountGiven(e.target.value)} style={{width:'80px'}} />
                    <div style={{textAlign:'right'}}>
                        <div style={{fontSize:'0.75rem', color:'#666'}}>Return</div>
                        <div style={{fontWeight:'bold', color:changeToReturn < 0 ? 'red' : 'green'}}>₹{changeToReturn.toFixed(0)}</div>
                    </div>
                </div>
            )}
            
            <button onClick={handleCheckout} className="btn-primary" style={{width:'100%', padding:'15px', fontSize:'1.1rem'}}>
                COMPLETE SALE ➔
            </button>
        </div>

      </div>
    </div>
  );
};

export default SaleForm;