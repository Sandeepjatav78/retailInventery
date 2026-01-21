import React, { useState, useEffect, useRef } from "react";
import api from "../api/axios";
import { generateBillHTML } from "../utils/BillGenerator";

const SaleForm = () => {
  const getSavedState = (key, defaultValue) => {
    try {
      const saved = localStorage.getItem("draft_sale_v3");
      return saved ? JSON.parse(saved)[key] || defaultValue : defaultValue;
    } catch {
      return defaultValue;
    }
  };

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [cart, setCart] = useState(() => getSavedState("cart", []));
  const [paymentMode, setPaymentMode] = useState(() => getSavedState("paymentMode", "Cash"));
  const [amountGiven, setAmountGiven] = useState(() => getSavedState("amountGiven", ""));
  const [isBillNeeded, setIsBillNeeded] = useState(() => getSavedState("isBillNeeded", true));
  const [customer, setCustomer] = useState(() => getSavedState("customer", { name: "", phone: "", doctor: "" }));
  const [invoiceNo, setInvoiceNo] = useState("Loading...");
  const [doseAmount, setDoseAmount] = useState(() => getSavedState("doseAmount", ""));

  const userRole = localStorage.getItem("userRole");
  const isStaff = userRole === "staff";

  const [focusedIndex, setFocusedIndex] = useState(-1);
  const resultListRef = useRef(null);
  const [lastSale, setLastSale] = useState(null);

  const fetchNextInvoice = async () => {
    if (isStaff) {
      const timeCode = Math.floor(Date.now() / 1000);
      setInvoiceNo(`RP-${timeCode}`);
    } else {
      try {
        const res = await api.get("/sales/next-id");
        if (res.data.success) setInvoiceNo(res.data.nextInvoiceNo);
      } catch (err) {
        setInvoiceNo("OFFLINE");
      }
    }
  };

  useEffect(() => {
    fetchNextInvoice();
    let interval;
    if (isStaff) {
      interval = setInterval(() => {
        setInvoiceNo(`RP-${Math.floor(Date.now() / 1000)}`);
      }, 60000);
    }
    return () => clearInterval(interval);
  }, [isStaff]);

  const cartTotal = cart.reduce((a, b) => a + b.total, 0);
  const doseVal = parseFloat(doseAmount) || 0;
  const grandTotal = cartTotal + doseVal;

  useEffect(() => {
    const given = parseFloat(amountGiven) || 0;
    setChangeToReturn(paymentMode === "Cash" ? given - grandTotal : 0);
    localStorage.setItem("draft_sale_v3", JSON.stringify({ cart, customer, paymentMode, isBillNeeded, amountGiven, doseAmount }));
  }, [cart, customer, paymentMode, isBillNeeded, amountGiven, doseAmount, grandTotal]);

  const [changeToReturn, setChangeToReturn] = useState(0);

  useEffect(() => {
    if (query.length > 1) {
      api.get(`/medicines/search?q=${query}`).then((res) => {
        setResults(res.data);
        setFocusedIndex(-1);
      });
    } else {
      setResults([]);
    }
  }, [query]);

  // --- LOGIC ---
  const calculateRowTotal = (price, qty, unit, packSize) => {
    let effectivePrice = price;
    if (unit === 'loose') {
      effectivePrice = price / (packSize || 1); 
    }
    return effectivePrice * qty;
  };

  const handleRateChange = (index, newRate) => {
    const val = parseFloat(newRate);
    const newCart = [...cart];
    const item = newCart[index];
    item.price = isNaN(val) ? 0 : val;
    if (!isStaff && item.mrp > 0) {
      item.discount = parseFloat((((item.mrp - item.price) / item.mrp) * 100).toFixed(2));
    }
    item.total = calculateRowTotal(item.price, item.quantity, item.unit, item.packSize);
    setCart(newCart);
  };

  const handleDiscountChange = (index, newDisc) => {
    const val = parseFloat(newDisc);
    const newCart = [...cart];
    const item = newCart[index];
    item.discount = isNaN(val) ? 0 : val;
    if (item.mrp > 0) {
      item.price = parseFloat((item.mrp - item.mrp * (item.discount / 100)).toFixed(2));
    }
    item.total = calculateRowTotal(item.price, item.quantity, item.unit, item.packSize);
    setCart(newCart);
  };

  const toggleUnit = (index, specificUnit = null) => {
    const newCart = [...cart];
    const item = newCart[index];
    if (specificUnit) { item.unit = specificUnit; } else { item.unit = item.unit === 'pack' ? 'loose' : 'pack'; }
    item.total = calculateRowTotal(item.price, item.quantity, item.unit, item.packSize);
    setCart(newCart);
  };

  const handleQuantityKeyDown = (e, index) => {
    if (e.key.toLowerCase() === 'l') { e.preventDefault(); toggleUnit(index, 'loose'); } 
    else if (e.key.toLowerCase() === 'p') { e.preventDefault(); toggleUnit(index, 'pack'); }
  };

  const updateQty = (index, val) => {
    const newQty = parseFloat(val);
    if (!newQty || newQty <= 0) return;
    const newCart = [...cart];
    const item = newCart[index];
    const requiredStock = item.unit === 'loose' ? (newQty / item.packSize) : newQty;
    if (requiredStock > item.maxStock) { return alert(`⚠️ Stock Limit Exceeded!\nAvailable: ${item.maxStock} Packs`); }
    item.quantity = newQty;
    item.total = calculateRowTotal(item.price, item.quantity, item.unit, item.packSize);
    setCart(newCart);
  };

  const addToCart = (med) => {
    if (med.quantity <= 0) return alert("❌ This item is OUT OF STOCK!");
    setLastSale(null);
    const idx = cart.findIndex((item) => item.medicineId === med._id);
    const discount = med.mrp > 0 ? ((med.mrp - med.sellingPrice) / med.mrp) * 100 : 0;

    if (idx !== -1) {
      const newCart = [...cart];
      const item = newCart[idx];
      const newQty = item.quantity + 1;
      const requiredStock = item.unit === 'loose' ? (newQty / item.packSize) : newQty;
      if (requiredStock <= med.quantity) {
        item.quantity += 1;
        item.total = calculateRowTotal(item.price, item.quantity, item.unit, item.packSize);
        setCart(newCart);
      } else { alert(`Stock Limit: ${med.quantity}`); }
    } else {
      setCart([...cart, {
          medicineId: med._id, name: med.productName, mrp: med.mrp, price: med.sellingPrice,
          costPrice: med.costPrice || 0, maxDiscount: med.maxDiscount || 0, discount: discount.toFixed(2),
          gst: med.gst || 0, hsn: med.hsnCode || "N/A", batch: med.batchNumber || "N/A", expiry: med.expiryDate,
          quantity: 1, maxStock: med.quantity, packSize: med.packSize || 1, unit: 'pack', total: med.sellingPrice 
      }]);
    }
    setQuery(""); setResults([]);
  };

  const handleCheckout = async () => {
    if (cart.length === 0 && doseVal <= 0) return alert("Cart is empty");
    const given = parseFloat(amountGiven) || 0;
    if (paymentMode === "Cash" && given < grandTotal) return alert("Insufficient Cash!");
    if (isBillNeeded && !customer.name.trim()) return alert("Customer Name is required");

    const finalCustomer = { name: customer.name.trim() || "Cash Sale", phone: isBillNeeded ? customer.phone : "", doctor: isBillNeeded ? customer.doctor : "" };

    const finalItems = cart.map((i) => {
        let quantityToSend = i.unit === 'loose' ? (i.quantity / i.packSize) : i.quantity;
        // 🔥 FIX: Safe rounding to avoid 0.300000004 issues
        quantityToSend = parseFloat(quantityToSend.toFixed(4));
        return { ...i, quantity: quantityToSend, originalQty: i.quantity, originalUnit: i.unit };
    });

    if (doseVal > 0) {
      finalItems.push({ medicineId: null, name: "Medical/Dose Charge", batch: "-", expiry: null, hsn: "999", gst: 0, mrp: doseVal, price: doseVal, quantity: 1, total: doseVal, discount: 0 });
    }

    const saleData = { customerDetails: finalCustomer, totalAmount: grandTotal, paymentMode, items: finalItems, isBillRequired: isBillNeeded, userRole: userRole };

    try {
      let billWindow = null;
      if (isBillNeeded === true) {
        billWindow = window.open("", "_blank", "width=900,height=900");
        if (billWindow) billWindow.document.write("<h3>Generating...</h3>"); else alert("Popup blocked!");
      }
      const res = await api.post("/sales", saleData);
      const finalInvoiceNo = res.data.invoiceNo || "SAVED";

      if (isBillNeeded === true && billWindow) {
        // 🔥 FIX: Pass doseAmount and grandTotal explicitly
        const html = await generateBillHTML(cart, { 
            no: finalInvoiceNo, ...finalCustomer, mode: paymentMode, isDuplicate: false, 
            grandTotal: grandTotal, 
            doseAmount: doseVal 
        });
        billWindow.document.open(); billWindow.document.write(html); billWindow.document.close();
      } else if (billWindow) billWindow.close();

      setLastSale({ cart: [...cart], invoiceNo: finalInvoiceNo, isBillRequired: isBillNeeded, customer: finalCustomer, paymentMode, doseAmount: doseVal });
      setCart([]); setAmountGiven(""); setDoseAmount(""); setCustomer({ name: "", phone: "", doctor: "" });
      fetchNextInvoice();
    } catch (err) { alert("Failed: " + err.message); }
  };

  const clearDraft = () => { localStorage.removeItem("draft_sale_v3"); setCart([]); setAmountGiven(""); setDoseAmount(""); setChangeToReturn(0); setPaymentMode("Cash"); setCustomer({ name: "", phone: "", doctor: "" }); setResults([]); setQuery(""); };
  
  // 🔥 FIX: Reprint Logic with Dose
  const handleReprint = async () => { 
      if (!lastSale) return; 
      const w = window.open("", "_blank", "width=900,height=900"); 
      if (!w) return alert("Popup Blocked"); 
      const html = await generateBillHTML(lastSale.cart, { 
          no: lastSale.invoiceNo, name: lastSale.customer.name, phone: lastSale.customer.phone, 
          doctor: lastSale.customer.doctor, mode: lastSale.paymentMode, isDuplicate: true, 
          grandTotal: lastSale.cart.reduce((a, b) => a + b.total, 0) + (parseFloat(lastSale.doseAmount) || 0), 
          doseAmount: parseFloat(lastSale.doseAmount) || 0 
      }); 
      w.document.open(); w.document.write(html); w.document.close(); 
  };
  
  const handleKeyDown = (e) => { if (results.length === 0) return; if (e.key === "ArrowDown") { e.preventDefault(); setFocusedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev)); } else if (e.key === "ArrowUp") { e.preventDefault(); setFocusedIndex((prev) => (prev > 0 ? prev - 1 : 0)); } else if (e.key === "Enter" && focusedIndex >= 0) { e.preventDefault(); addToCart(results[focusedIndex]); } };
  
  const isLoss = (rate, cp) => rate < cp;
  const isHighDisc = (disc, max) => disc > max;
  const inputClass = "w-full p-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all";
  const labelClass = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1";

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-80px)] p-4 bg-gray-50 overflow-y-auto lg:overflow-hidden">
      
      {/* --- LEFT: SEARCH & CART (Scrollable on Mobile) --- */}
      <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[500px]">
        {/* Search Header */}
        <div className="p-4 bg-gray-50 border-b border-gray-200 sticky top-0 z-20">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-xl font-bold text-teal-800 flex items-center gap-2">💊 New Sale</h3>
            <div className="flex items-center gap-3">
              {cart.length > 0 && <button onClick={clearDraft} className="text-xs font-bold text-red-600 bg-red-50 px-3 py-1 rounded hover:bg-red-100 transition-colors">Clear</button>}
              <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold border border-indigo-200">{invoiceNo}</span>
            </div>
          </div>
          <div className="relative">
            <input className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-xl focus:outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20 transition-all" placeholder="🔍 Scan / Search Medicine..." value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={handleKeyDown} autoFocus />
            {results.length > 0 && (
              <div ref={resultListRef} className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-gray-100">
                {results.map((med, idx) => {
                  const isExpiringSoon = new Date(med.expiryDate) < new Date(new Date().setDate(new Date().getDate() + 90));
                  const isExpired = new Date(med.expiryDate) < new Date();
                  const isOutOfStock = med.quantity <= 0;
                  return (
                    <div key={med._id} onMouseDown={(e) => { e.preventDefault(); if (!isOutOfStock) addToCart(med); }}
                      className={`p-3 flex justify-between items-center border-b border-gray-100 ${isOutOfStock ? "bg-gray-100 opacity-60 cursor-not-allowed" : "cursor-pointer transition-colors"} ${idx === focusedIndex && !isOutOfStock ? "bg-teal-100 border-l-4 border-teal-600" : ""} ${!isOutOfStock ? "hover:bg-teal-50" : ""} ${isExpired && !isOutOfStock ? "bg-red-50" : ""}`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`font-bold text-sm md:text-base ${isOutOfStock ? "text-gray-500" : "text-gray-800"}`}>{med.productName}</span>
                          {isOutOfStock && <span className="text-[9px] bg-gray-600 text-white px-1 rounded font-bold">OUT</span>}
                          {!isOutOfStock && isExpired && <span className="text-[9px] bg-red-600 text-white px-1 rounded font-bold">EXP</span>}
                          {!isOutOfStock && !isExpired && isExpiringSoon && <span className="text-[9px] bg-orange-500 text-white px-1 rounded font-bold">NEAR</span>}
                        </div>
                        {!isStaff && <div className="text-[10px] md:text-xs text-gray-500 mt-1 flex gap-2"><span className="text-green-600 font-bold">Stk: {med.quantity}</span><span>Bat: {med.batchNumber}</span></div>}
                      </div>
                      <div className="text-right"><div className={`font-bold text-base md:text-lg ${isOutOfStock ? "text-gray-400" : "text-teal-600"}`}>₹{med.sellingPrice}</div></div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Responsive Table */}
        <div className="flex-1 overflow-x-auto overflow-y-auto">
          <table className="w-full text-left border-collapse min-w-[600px] lg:min-w-full">
            <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Item</th>
                {!isStaff && <th className="px-2 py-3 text-xs font-bold text-gray-500 uppercase text-center">MRP</th>}
                {!isStaff && <th className="px-2 py-3 text-xs font-bold text-gray-500 uppercase text-center">Disc%</th>}
                <th className="px-2 py-3 text-xs font-bold text-gray-500 uppercase text-center">Rate</th>
                <th className="px-2 py-3 text-xs font-bold text-gray-500 uppercase text-center w-32">Qty / Unit</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase text-right">Total</th>
                <th className="px-2 py-3 text-xs font-bold text-gray-500 uppercase"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cart.map((item, idx) => {
                const lossWarning = isLoss(item.price, item.costPrice);
                const discWarning = isHighDisc(item.discount, item.maxDiscount);
                return (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-800 text-sm">{item.name}</div>
                      <div className="text-[10px] text-gray-500">Bat: {item.batch} | Pack: {item.packSize}</div>
                    </td>
                    {!isStaff && <td className="px-2 py-3 text-center text-gray-400 text-sm">₹{item.mrp}</td>}
                    {!isStaff && (<td className="px-2 py-3 text-center"><input type="number" value={item.discount} onChange={(e) => handleDiscountChange(idx, e.target.value)} className={`w-12 p-1 text-center text-sm border rounded ${discWarning ? "border-red-500 text-red-600 bg-red-50" : "border-gray-300"}`} /></td>)}
                    <td className="px-2 py-3 text-center relative">
                      <input type="number" value={item.price} onChange={(e) => handleRateChange(idx, e.target.value)} className={`w-14 p-1 text-center text-sm font-bold border rounded ${lossWarning ? "border-red-500 text-red-600 bg-red-50" : "border-gray-300"}`} />
                      {(lossWarning || discWarning) && <div className="absolute top-full left-1/2 -translate-x-1/2 bg-red-100 border border-red-200 text-red-600 text-[8px] px-1 rounded shadow-sm whitespace-nowrap z-20">⚠️ Alert</div>}
                    </td>
                    <td className="px-2 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center justify-center border border-gray-300 rounded overflow-hidden w-24 bg-white">
                            <button onClick={() => updateQty(idx, item.quantity - 1)} className="px-2 py-1 bg-gray-50 text-gray-600 font-bold">-</button>
                            <input type="number" value={item.quantity} onChange={(e) => updateQty(idx, e.target.value)} onKeyDown={(e) => handleQuantityKeyDown(e, idx)} className="w-8 text-center text-sm font-semibold outline-none" />
                            <button onClick={() => updateQty(idx, item.quantity + 1)} className="px-2 py-1 bg-gray-50 text-gray-600 font-bold">+</button>
                        </div>
                        <span onClick={() => toggleUnit(idx)} className={`text-[9px] font-bold px-2 py-0.5 rounded cursor-pointer uppercase border ${item.unit === 'loose' ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-teal-50 text-teal-700 border-teal-200'}`}>{item.unit === 'loose' ? '✂️ LOOSE' : '📦 PACK'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                        <div className="font-bold text-teal-700 text-sm">₹{item.total.toFixed(2)}</div>
                    </td>
                    <td className="px-2 py-3 text-center"><button onClick={() => { const c = [...cart]; c.splice(idx, 1); setCart(c); }} className="text-gray-400 hover:text-red-500 text-lg">×</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- RIGHT: CHECKOUT (Stacked on Mobile) --- */}
      <div className="lg:w-1/3 bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col h-fit sticky top-4">
        <div className="bg-gradient-to-br from-teal-600 to-teal-800 rounded-xl p-6 text-center text-white shadow-lg mb-4">
          <div className="text-teal-100 text-xs font-bold uppercase tracking-wider mb-1">Grand Total</div>
          <div className="text-4xl font-extrabold">₹{grandTotal.toFixed(0)}</div>
          <div className="mt-4 flex items-center justify-center gap-2 bg-teal-800/50 p-2 rounded-lg border border-teal-500/30">
            <span className="text-xs font-bold text-teal-100 uppercase">💉 Dose Charge:</span>
            <input type="number" placeholder="0" value={doseAmount} onChange={(e) => setDoseAmount(e.target.value)} className="w-20 bg-white text-teal-900 font-bold text-center rounded px-1 py-1 text-sm focus:outline-none" />
          </div>
        </div>
        
        {lastSale && <div className={`mb-4 border rounded-lg p-3 flex justify-between items-center ${lastSale.isBillRequired ? "bg-green-50 border-green-200" : "bg-orange-50 border-orange-200"}`}><span className={`font-bold text-sm ${lastSale.isBillRequired ? "text-green-700" : "text-orange-700"}`}>{lastSale.isBillRequired ? "✅ Sale Saved!" : "✅ Saved"}</span>{lastSale.isBillRequired && <button onClick={handleReprint} className="text-sm underline font-bold text-green-800">Reprint</button>}</div>}
        
        <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
                <span className={labelClass}>Customer</span>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-teal-700"><input type="checkbox" checked={isBillNeeded} onChange={(e) => setIsBillNeeded(e.target.checked)} className="w-4 h-4 rounded" /> Print Bill</label>
            </div>
            <div className="space-y-3">
                <input className={`${inputClass} ${isBillNeeded && !customer.name ? "border-red-400 bg-red-50" : ""}`} placeholder={isBillNeeded ? "Name *" : "Name (Optional)"} value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
                {isBillNeeded && <div className="flex gap-3"><input className={inputClass} placeholder="Phone" value={customer.phone} onChange={e => setCustomer({ ...customer, phone: e.target.value })} /><input className={inputClass} placeholder="Dr." value={customer.doctor} onChange={e => setCustomer({ ...customer, doctor: e.target.value })} /></div>}
            </div>
        </div>

        <div className="mb-6">
            <span className={labelClass}>Payment</span>
            <div className="flex gap-3 mt-2">
                <button className={`flex-1 py-3 rounded-lg font-bold text-sm border ${paymentMode === "Cash" ? "bg-teal-700 text-white border-teal-700" : "bg-white text-gray-600"}`} onClick={() => setPaymentMode("Cash")}>💵 Cash</button>
                <button className={`flex-1 py-3 rounded-lg font-bold text-sm border ${paymentMode === "Online" ? "bg-teal-700 text-white border-teal-700" : "bg-white text-gray-600"}`} onClick={() => setPaymentMode("Online")}>📱 Online</button>
            </div>
            {paymentMode === "Cash" && <div className="mt-4 bg-orange-50 border border-orange-100 rounded-lg p-3 flex justify-between items-center"><input type="number" placeholder="Given" value={amountGiven} onChange={(e) => setAmountGiven(e.target.value)} className="w-24 p-2 text-sm border border-orange-200 rounded" /><div className="text-right"><div className="text-xs text-gray-500 font-bold">Return</div><div className={`text-xl font-bold ${changeToReturn < 0 ? "text-red-600" : "text-green-600"}`}>₹{changeToReturn.toFixed(0)}</div></div></div>}
        </div>

        <button onClick={handleCheckout} className="w-full bg-teal-800 hover:bg-teal-900 text-white font-bold py-4 rounded-xl shadow-lg text-lg flex justify-center items-center gap-2">COMPLETE SALE ➔</button>
      </div>
    </div>
  );
};

export default SaleForm;