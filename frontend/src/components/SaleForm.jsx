import React, { useState, useEffect, useRef } from "react";
import api from "../api/axios";
import { generateBillHTML } from "../utils/BillGenerator";

const SaleForm = () => {
  const getSavedState = (key, defaultValue) => {
    try {
      const saved = localStorage.getItem("draft_sale_v3");
      return saved ? JSON.parse(saved)[key] || defaultValue : defaultValue;
    } catch { return defaultValue; }
  };

  // --- REFS ---
  const searchInputRef = useRef(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [cart, setCart] = useState(() => getSavedState("cart", []));
  const [paymentMode, setPaymentMode] = useState(() => getSavedState("paymentMode", "Cash"));
  const [amountGiven, setAmountGiven] = useState(() => getSavedState("amountGiven", ""));
  const [changeToReturn, setChangeToReturn] = useState(0);
  const [isBillNeeded, setIsBillNeeded] = useState(() => getSavedState("isBillNeeded", true));
  const [customer, setCustomer] = useState(() => getSavedState("customer", { name: "", phone: "", doctor: "" }));
  const [invoiceNo, setInvoiceNo] = useState("Loading...");
  const [doseAmount, setDoseAmount] = useState(() => getSavedState("doseAmount", ""));

  const userRole = localStorage.getItem("userRole");
  const isStaff = userRole === "staff";

  const [focusedIndex, setFocusedIndex] = useState(-1);
  const resultListRef = useRef(null);
  const [lastSale, setLastSale] = useState(null);

  // --- 🔥 NEW: SUGGESTION TOGGLE STATE ---
  const [suggestionsEnabled, setSuggestionsEnabled] = useState(true);

  // --- 🔥 GLOBAL KEYBOARD SHORTCUT LOGIC ---
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // 1. FOCUS SEARCH BAR (F4 or Ctrl+Space)
      if (e.key === "F4" || (e.ctrlKey && e.code === "Space")) {
        e.preventDefault(); 
        if (searchInputRef.current) searchInputRef.current.focus(); 
      }
      
      // 2. TOGGLE SUGGESTIONS ON/OFF (F2)
      if (e.key === "F2") {
        e.preventDefault();
        setSuggestionsEnabled(prev => !prev);
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  const fetchNextInvoice = async () => {
    if (isStaff) {
      const timeCode = Math.floor(Date.now() / 1000);
      setInvoiceNo(`RP-${timeCode}`);
    } else {
      try {
        const res = await api.get("/sales/next-id");
        if (res.data.success) setInvoiceNo(res.data.nextInvoiceNo);
      } catch (err) { setInvoiceNo("OFFLINE"); }
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

  useEffect(() => {
    // Only fetch if suggestions are enabled
    if (query.length > 1 && suggestionsEnabled) {
      api.get(`/medicines/search?q=${query}`).then((res) => {
        setResults(res.data);
        setFocusedIndex(-1);
      });
    } else { 
        setResults([]); 
    }
  }, [query, suggestionsEnabled]);

  // --- LOGIC ---
  const calculateRowTotal = (price, qty, unit, packSize) => {
    let effectivePrice = price;
    if (unit === 'loose') { effectivePrice = price / (packSize || 1); }
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
        quantityToSend = parseFloat(quantityToSend.toFixed(4));
        return { ...i, quantity: quantityToSend };
    });

    const itemsForPrint = [...cart];
    if (doseVal > 0) {
      finalItems.push({ medicineId: null, name: "Medical/Dose Charge", batch: "-", expiry: null, hsn: "999", gst: 0, mrp: doseVal, price: doseVal, quantity: 1, total: doseVal, discount: 0 });
      itemsForPrint.push({ name: "Medical/Dose Charge", batch: "-", expiry: null, mrp: doseVal, price: doseVal, quantity: 1, total: doseVal, discount: 0, unit: 'pack', packSize: 1 });
    }

    const saleData = { customerDetails: finalCustomer, totalAmount: grandTotal, paymentMode, items: finalItems, isBillRequired: isBillNeeded, userRole: userRole };

    let billWindow = null;

    try {
      if (isBillNeeded === true) {
        billWindow = window.open("", "_blank", "width=900,height=900");
        if (billWindow) billWindow.document.write("<h3>Generating...</h3>"); else alert("Popup blocked!");
      }

      const res = await api.post("/sales", saleData);
      const finalInvoiceNo = res.data.invoiceNo || "SAVED";

      if (isBillNeeded === true && billWindow) {
        const html = await generateBillHTML(itemsForPrint, { 
            no: finalInvoiceNo, ...finalCustomer, mode: paymentMode, isDuplicate: false, 
            grandTotal: grandTotal, 
            doseAmount: doseVal 
        });
        billWindow.document.open(); billWindow.document.write(html); billWindow.document.close();
      } else if (billWindow) billWindow.close();

      setLastSale({ cart: itemsForPrint, invoiceNo: finalInvoiceNo, isBillRequired: isBillNeeded, customer: finalCustomer, paymentMode, doseAmount: doseVal });
      setCart([]); setAmountGiven(""); setDoseAmount(""); setCustomer({ name: "", phone: "", doctor: "" });
      fetchNextInvoice();

    } catch (err) { 
      if (billWindow) billWindow.close(); 
      alert("Failed: " + err.message); 
    }
  };

  const clearDraft = () => { localStorage.removeItem("draft_sale_v3"); setCart([]); setAmountGiven(""); setDoseAmount(""); setChangeToReturn(0); setPaymentMode("Cash"); setCustomer({ name: "", phone: "", doctor: "" }); setResults([]); setQuery(""); };
  
  const handleReprint = async () => { 
      if (!lastSale) return; 
      const w = window.open("", "_blank", "width=900,height=900"); 
      if (!w) return alert("Popup Blocked"); 
      const html = await generateBillHTML(lastSale.cart, { 
          no: lastSale.invoiceNo, name: lastSale.customer.name, phone: lastSale.customer.phone, 
          doctor: lastSale.customer.doctor, mode: lastSale.paymentMode, isDuplicate: true, 
          grandTotal: lastSale.cart.reduce((a, b) => a + b.total, 0),
          doseAmount: parseFloat(lastSale.doseAmount) || 0 
      }); 
      w.document.open(); w.document.write(html); w.document.close(); 
  };
  
  // --- 🔥 SEARCH KEYDOWN GUARDED BY TOGGLE ---
  const handleKeyDown = (e) => { 
      if (!suggestionsEnabled || results.length === 0) return; 

      if (e.key === "ArrowDown") { e.preventDefault(); setFocusedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev)); } 
      else if (e.key === "ArrowUp") { e.preventDefault(); setFocusedIndex((prev) => (prev > 0 ? prev - 1 : 0)); } 
      else if (e.key === "Enter" && focusedIndex >= 0) { e.preventDefault(); addToCart(results[focusedIndex]); } 
  };
  
  const isLoss = (rate, cp) => rate < cp;
  const isHighDisc = (disc, max) => disc > max;
  const inputClass = "w-full p-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all";
  const labelClass = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-80px)] p-4 bg-gray-50">
      {/* LEFT: SEARCH & CART */}
      <div className="lg:col-span-2 flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-xl font-bold text-teal-800 flex items-center gap-2">
              💊 New Sale
            </h3>
            <div className="flex items-center gap-3">
              {cart.length > 0 && (
                <button onClick={clearDraft} className="text-xs font-bold text-red-600 bg-red-50 px-3 py-1 rounded hover:bg-red-100 transition-colors">Clear</button>
              )}
              <span className="hidden md:inline text-[10px] text-gray-400 font-medium">F4: Search</span>
              <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold border border-indigo-200">
                {invoiceNo}
              </span>
            </div>
          </div>

          <div className="relative">
            {/* Input with Toggle Indicator inside */}
            <div className="relative">
                <input
                  ref={searchInputRef}
                  className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-xl focus:outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20 transition-all pr-24"
                  placeholder="🔍 Scan / Search Medicine..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown} 
                  autoFocus
                />
                <span 
                    onClick={() => setSuggestionsEnabled(!suggestionsEnabled)}
                    className={`absolute right-3 top-1/2 transform -translate-y-1/2 text-xs font-bold px-2 py-1 rounded cursor-pointer transition-colors border ${suggestionsEnabled ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}
                    title="Press F2 to Toggle"
                >
                    {/* {suggestionsEnabled ? '💡 ON (F2)' : '🚫 OFF (F2)'} */}
                </span>
            </div>

            {/* --- 🔥 HIDE SUGGESTIONS IF DISABLED --- */}
            {suggestionsEnabled && results.length > 0 && (
              <div
                ref={resultListRef}
                className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl max-h-80 overflow-y-auto divide-y divide-gray-100"
              >
                {results.map((med, idx) => (
                  <div
                    key={med._id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addToCart(med);
                    }}
                    className={`p-3 cursor-pointer transition-colors flex justify-between items-center ${
                      idx === focusedIndex 
                        ? "bg-teal-100 border-l-4 border-teal-600" 
                        : "hover:bg-teal-50"
                    }`}
                  >
                    <div>
                      <div className="font-bold text-gray-800">
                        {med.productName}
                      </div>
                      
                      {!isStaff && (
                          <div className="text-xs text-gray-500 mt-1 flex gap-3">
                            <span className={`${med.quantity < 10 ? "text-orange-600 font-bold" : "text-green-600"}`}>
                              Stock: {med.quantity}
                            </span>
                            <span>Batch: {med.batchNumber}</span>
                            <span className={`${new Date(med.expiryDate) < new Date() ? "text-red-600 font-bold" : "text-gray-500"}`}>
                              Exp: {new Date(med.expiryDate).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                            </span>
                          </div>
                      )}
                    </div>
                    
                    <div className="text-right">
                      <div className="font-bold text-teal-600 text-lg">
                        ₹{med.sellingPrice}
                      </div>
                      {!isStaff && (
                          <div className="text-xs text-gray-400 line-through">
                            MRP: {med.mrp}
                          </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Item</th>

                {!isStaff && <th className="px-2 py-3 text-xs font-bold text-gray-500 uppercase text-center">MRP</th>}
                {!isStaff && <th className="px-2 py-3 text-xs font-bold text-gray-500 uppercase text-center">Disc%</th>}

                <th className="px-2 py-3 text-xs font-bold text-gray-500 uppercase text-center">
                  Rate
                </th>
                <th className="px-2 py-3 text-xs font-bold text-gray-500 uppercase text-center">Qty / Unit</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase text-right">Total</th>
                <th className="px-2 py-3 text-xs font-bold text-gray-500 uppercase"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cart.map((item, idx) => {
                const lossWarning = isLoss(parseFloat(item.price), item.costPrice);
                const discWarning = isHighDisc(parseFloat(item.discount), item.maxDiscount);
                return (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-800 text-sm">{item.name}</div>
                      {!isStaff && <div className="text-xs text-gray-500">Batch: {item.batch} | Pack: {item.packSize}</div>}
                    </td>

                    {!isStaff && <td className="px-2 py-3 text-center text-gray-400 text-sm">₹{item.mrp}</td>}

                    {!isStaff && (
                      <td className="px-2 py-3 text-center">
                        <input
                          type="number"
                          value={item.discount}
                          onChange={(e) =>
                            handleDiscountChange(idx, e.target.value)
                          }
                          className={`w-14 p-1 text-center text-sm border rounded outline-none focus:ring-2 focus:ring-teal-500 ${
                            discWarning
                              ? "border-red-500 text-red-600 bg-red-50"
                              : "border-gray-300"
                          }`}
                        />
                      </td>
                    )}

                    <td className="px-2 py-3 text-center relative">
                      <input
                        type="number"
                        value={item.price}
                        onChange={(e) => handleRateChange(idx, e.target.value)}
                        className={`w-16 p-1 text-center text-sm font-bold border rounded outline-none focus:ring-2 focus:ring-teal-500 ${
                          lossWarning
                            ? "border-red-500 text-red-600 bg-red-50"
                            : "border-gray-300"
                        }`}
                      />
                      {(lossWarning || discWarning) && (
                        <div className="absolute top-full left-1/2 -translate-x-1/2 bg-red-100 border border-red-200 text-red-600 text-[10px] px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap mt-1 font-bold z-20 flex flex-col items-center">
                          {lossWarning && <span>⚠️ Below CP</span>}
                          {(!isStaff && discWarning) && <span>⚠️ High Disc</span>}
                        </div>
                      )}
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

                    <td className="px-4 py-3 text-right font-bold text-teal-700 text-sm">
                      ₹{item.total.toFixed(2)}
                    </td>

                    <td className="px-2 py-3 text-center">
                      <button
                        onClick={() => {
                          const c = [...cart];
                          c.splice(idx, 1);
                          setCart(c);
                        }}
                        className="text-gray-400 hover:text-red-500 text-lg transition-colors"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
              {cart.length === 0 && (
                <tr>
                  <td colSpan={isStaff ? 5 : 7} className="py-20 text-center text-gray-400 italic">
                    {suggestionsEnabled ? "Cart is empty. Press F4 to search." : ""}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RIGHT: CHECKOUT */}
      <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col h-fit sticky top-4">
        <div className="bg-gradient-to-br from-teal-600 to-teal-800 rounded-xl p-6 text-center text-white shadow-lg mb-6">
          <div className="text-teal-100 text-xs font-bold uppercase tracking-wider mb-1">
            Grand Total
          </div>
          <div className="text-4xl font-extrabold">
            ₹{grandTotal.toFixed(0)}
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 bg-teal-800/50 p-2 rounded-lg border border-teal-500/30">
            <span className="text-xs font-bold text-teal-100 uppercase">💉 Dose Charge:</span>
            <input type="number" placeholder="0" value={doseAmount} onChange={(e) => setDoseAmount(e.target.value)} className="w-20 bg-white text-teal-900 font-bold text-center rounded px-1 py-1 text-sm focus:outline-none" />
          </div>
        </div>

        {lastSale && (
          <div
            className={`mb-4 border rounded-lg p-3 flex justify-between items-center animate-pulse-once ${
              lastSale.isBillRequired
                ? "bg-green-50 border-green-200"
                : "bg-orange-50 border-orange-200"
            }`}
          >
            <span
              className={`font-bold text-sm ${
                lastSale.isBillRequired ? "text-green-700" : "text-orange-700"
              }`}
            >
              {lastSale.isBillRequired
                ? "✅ Sale Saved!"
                : "✅ Saved (No Bill Created)"}
            </span>
            {lastSale.isBillRequired && (
              <button
                onClick={handleReprint}
                className="text-sm underline font-bold text-green-800 hover:text-green-900"
              >
                Reprint Bill
              </button>
            )}
          </div>
        )}

        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className={labelClass}>Customer Details</span>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-teal-700">
              <input
                type="checkbox"
                checked={isBillNeeded}
                onChange={(e) => setIsBillNeeded(e.target.checked)}
                className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500"
              />
              Print Bill
            </label>
          </div>

          <div className="space-y-3">
            <input
              className={`${inputClass} ${
                isBillNeeded && !customer.name ? "border-red-400 bg-red-50" : ""
              }`}
              placeholder={
                isBillNeeded ? "Customer Name *" : "Customer Name (Optional)"
              }
              value={customer.name}
              onChange={(e) =>
                setCustomer({ ...customer, name: e.target.value })
              }
            />
            {isBillNeeded && (
              <div className="flex gap-3">
                <input
                  className={inputClass}
                  placeholder="Phone"
                  value={customer.phone}
                  onChange={(e) =>
                    setCustomer({ ...customer, phone: e.target.value })
                  }
                />
                <input
                  className={inputClass}
                  placeholder="Dr. Ref"
                  value={customer.doctor}
                  onChange={(e) =>
                    setCustomer({ ...customer, doctor: e.target.value })
                  }
                />
              </div>
            )}
          </div>
        </div>

        <div className="mb-6">
          <span className={labelClass}>Payment Mode</span>
          <div className="flex gap-3 mt-2">
            <button
              className={`flex-1 py-3 rounded-lg font-bold text-sm border transition-all ${
                paymentMode === "Cash"
                  ? "bg-teal-700 text-white border-teal-700 shadow-md"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
              }`}
              onClick={() => setPaymentMode("Cash")}
            >
              💵 Cash
            </button>
            <button
              className={`flex-1 py-3 rounded-lg font-bold text-sm border transition-all ${
                paymentMode === "Online"
                  ? "bg-teal-700 text-white border-teal-700 shadow-md"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
              }`}
              onClick={() => setPaymentMode("Online")}
            >
              📱 UPI / Online
            </button>
          </div>
          {paymentMode === "Cash" && (
            <div className="mt-4 bg-orange-50 border border-orange-100 rounded-lg p-3 flex justify-between items-center">
              <input
                type="number"
                placeholder="Given Amount"
                value={amountGiven}
                onChange={(e) => setAmountGiven(e.target.value)}
                className="w-24 p-2 text-sm border border-orange-200 rounded focus:outline-none focus:border-orange-400"
              />
              <div className="text-right">
                <div className="text-xs text-gray-500 uppercase font-bold">
                  Return Change
                </div>
                <div
                  className={`text-xl font-bold ${
                    changeToReturn < 0 ? "text-red-600" : "text-green-600"
                  }`}
                >
                  ₹{changeToReturn.toFixed(0)}
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={handleCheckout}
          className="w-full bg-teal-800 hover:bg-teal-900 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all transform active:scale-95 text-lg flex justify-center items-center gap-2"
        >
          COMPLETE SALE ➔
        </button>
      </div>
    </div>
  );
};

export default SaleForm;