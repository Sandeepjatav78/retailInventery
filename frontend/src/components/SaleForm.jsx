import React, { useState, useEffect, useRef } from "react";
import api from "../api/axios";
import { generateBillHTML } from "../utils/BillGenerator";

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

  // Reusable Classes
  const inputClass = "w-full p-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all";
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-80px)] p-4 bg-gray-50">
      
      {/* --- LEFT: SEARCH & CART --- */}
      <div className="lg:col-span-2 flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        
        {/* Header & Search */}
        <div className="p-4 bg-gray-50 border-b border-gray-200">
            <div className="flex justify-between items-center mb-3">
                <h3 className="text-xl font-bold text-teal-800 flex items-center gap-2">💊 New Sale</h3>
                <div className="flex items-center gap-3">
                    {cart.length > 0 && (
                        <button onClick={clearDraft} className="text-xs font-bold text-red-600 bg-red-50 px-3 py-1 rounded hover:bg-red-100 transition-colors">
                            Clear Cart
                        </button>
                    )}
                    <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold border border-indigo-200">
                        {invoiceNo}
                    </span>
                </div>
            </div>
            
            <div className="relative">
                <input 
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-xl focus:outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20 transition-all"
                    placeholder="🔍 Scan barcode or type medicine name..." 
                    value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleKeyDown} autoFocus 
                />
                
                {/* Search Dropdown */}
                {results.length > 0 && (
                    <div ref={resultListRef} className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl max-h-80 overflow-y-auto divide-y divide-gray-100">
                        {results.map((med, idx) => (
                            <div 
                                key={med._id} 
                                onClick={() => addToCart(med)} 
                                className={`p-3 hover:bg-teal-50 cursor-pointer transition-colors flex justify-between items-center ${idx === focusedIndex ? "bg-teal-50" : ""}`}
                            >
                                <div>
                                    <div className="font-bold text-gray-800">{med.productName}</div>
                                    <div className="text-xs text-gray-500 mt-1 flex gap-3">
                                        <span className="font-bold text-green-600">Stock: {med.quantity}</span>
                                        <span>Batch: {med.batchNumber}</span>
                                    </div>
                                </div>
                                <div className="text-right font-bold text-teal-600 text-lg">₹{med.sellingPrice}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>

        {/* Table Container */}
        <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                    <tr>
                        <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Item</th>
                        <th className="px-2 py-3 text-xs font-bold text-gray-500 uppercase text-center">Qty</th>
                        <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase text-right">Total</th>
                        <th className="px-2 py-3 text-xs font-bold text-gray-500 uppercase"></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {cart.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                                <div className="font-semibold text-gray-800 text-sm">{item.name}</div>
                                <div className="text-xs text-gray-500">₹{item.price}</div>
                            </td>
                            <td className="px-2 py-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                    <button onClick={() => updateQty(idx, item.quantity - 1)} className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded">-</button>
                                    <span className="w-8 text-center text-sm font-bold">{item.quantity}</span>
                                    <button onClick={() => updateQty(idx, item.quantity + 1)} className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded">+</button>
                                </div>
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-teal-700 text-sm">₹{item.total.toFixed(2)}</td>
                            <td className="px-2 py-3 text-center">
                                <button onClick={() => removeFromCart(idx)} className="text-gray-400 hover:text-red-500 text-lg transition-colors">×</button>
                            </td>
                        </tr>
                    ))}
                    {cart.length === 0 && (
                        <tr>
                            <td colSpan="4" className="py-20 text-center text-gray-400 italic">Start adding items...</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
      </div>

      {/* --- RIGHT: CHECKOUT --- */}
      <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col h-fit sticky top-4">
        
        {/* Total Card */}
        <div className="bg-teal-50 p-6 rounded-xl text-center mb-4 border border-teal-100">
            <div className="text-teal-800 text-xs font-bold uppercase tracking-wider mb-1">Total Payable</div>
            <div className="text-4xl font-extrabold text-teal-900">₹{cart.reduce((a, b) => a + b.total, 0).toFixed(0)}</div>
        </div>

        {lastSale && (
            <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3 flex justify-between items-center text-sm">
                <span className="text-green-700 font-bold">✅ Saved!</span>
                <button onClick={handleReprint} className="underline font-bold text-green-800 hover:text-green-900">Reprint</button>
            </div>
        )}

        {/* Customer Details */}
        <div className="border-b border-gray-100 pb-4 mb-4">
            <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-gray-500 uppercase">Customer Details</span>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-teal-700">
                    <input type="checkbox" checked={isBillNeeded} onChange={e => setIsBillNeeded(e.target.checked)} className="rounded text-teal-600 focus:ring-teal-500" /> 
                    Print Bill
                </label>
            </div>
            
            {isBillNeeded ? (
                <div className="space-y-2">
                    <input className={inputClass} placeholder="Name *" value={customer.name} onChange={e => setCustomer({...customer, name:e.target.value})} />
                    <div className="flex gap-2">
                        <input className={inputClass} placeholder="Phone" value={customer.phone} onChange={e => setCustomer({...customer, phone:e.target.value})} />
                        <input className={inputClass} placeholder="Doctor" value={customer.doctor} onChange={e => setCustomer({...customer, doctor:e.target.value})} />
                    </div>
                </div>
            ) : (
                <div className="text-xs text-gray-400 italic text-center py-2">(Sale will be recorded as "Cash Sale")</div>
            )}
        </div>

        {/* Payment */}
        <div className="flex flex-col gap-4">
            <select className={inputClass} value={paymentMode} onChange={e => setPaymentMode(e.target.value)}>
                <option value="Cash">Cash</option>
                <option value="Online">Online / UPI</option>
            </select>
            
            {paymentMode === "Cash" && (
                <div className="flex justify-between items-center bg-orange-50 p-3 rounded-lg border border-orange-100">
                    <input type="number" placeholder="Given" value={amountGiven} onChange={e => setAmountGiven(e.target.value)} className="w-20 p-1 text-sm border border-gray-300 rounded" />
                    <div className="text-right">
                        <div className="text-xs text-gray-500">Return</div>
                        <div className={`font-bold ${changeToReturn < 0 ? 'text-red-600' : 'text-green-600'}`}>₹{changeToReturn.toFixed(0)}</div>
                    </div>
                </div>
            )}
            
            <button onClick={handleCheckout} className="w-full bg-teal-800 hover:bg-teal-900 text-white font-bold py-3 rounded-lg shadow-md transition-all text-lg">
                COMPLETE SALE ➔
            </button>
        </div>

      </div>
    </div>
  );
};

export default SaleForm;