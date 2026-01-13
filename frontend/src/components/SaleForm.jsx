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
  const [changeToReturn, setChangeToReturn] = useState(0);
  const [isBillNeeded, setIsBillNeeded] = useState(() => getSavedState("isBillNeeded", true));
  const [customer, setCustomer] = useState(() => getSavedState("customer", { name: "", phone: "", doctor: "" }));
  const [invoiceNo, setInvoiceNo] = useState("Loading...");

  // ROLE CHECK
  const userRole = localStorage.getItem("userRole"); 
  const isStaff = userRole === "staff";

  // --- KEYBOARD NAVIGATION STATES ---
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const resultListRef = useRef(null);
  
  const [editingIndex, setEditingIndex] = useState(null);
  const [tempData, setTempData] = useState({ rate: "", discount: "" });
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
    if(isStaff) {
        interval = setInterval(() => {
             setInvoiceNo(`RP-${Math.floor(Date.now() / 1000)}`);
        }, 60000); 
    }
    return () => clearInterval(interval);
  }, [isStaff]);

  useEffect(() => {
    const total = cart.reduce((a, b) => a + b.total, 0);
    const given = parseFloat(amountGiven) || 0;
    setChangeToReturn(paymentMode === "Cash" ? given - total : 0);
    localStorage.setItem(
      "draft_sale_v3",
      JSON.stringify({ cart, customer, paymentMode, isBillNeeded, amountGiven })
    );
  }, [cart, customer, paymentMode, isBillNeeded, amountGiven]);

  useEffect(() => {
    if (query.length > 1) {
      api.get(`/medicines/search?q=${query}`).then((res) => {
        setResults(res.data);
        setFocusedIndex(-1); // Reset focus on new search
      });
    } else {
      setResults([]);
      setFocusedIndex(-1);
    }
  }, [query]);

  // --- 🔥 AUTO-SCROLL TO FOCUSED ITEM ---
  useEffect(() => {
    if (focusedIndex >= 0 && resultListRef.current) {
      const listItems = resultListRef.current.children;
      if (listItems[focusedIndex]) {
        listItems[focusedIndex].scrollIntoView({
          block: "nearest", 
          behavior: "smooth"
        });
      }
    }
  }, [focusedIndex]);

  // --- 🔥 HANDLE KEYBOARD NAVIGATION ---
  const handleKeyDown = (e) => {
    if (results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (focusedIndex >= 0 && results[focusedIndex]) {
        addToCart(results[focusedIndex]);
      }
    } else if (e.key === "Escape") {
      setResults([]);
      setFocusedIndex(-1);
    }
  };

  const addToCart = (med) => {
    setLastSale(null);
    const idx = cart.findIndex((item) => item.medicineId === med._id);
    const discount = med.mrp > 0 ? ((med.mrp - med.sellingPrice) / med.mrp) * 100 : 0;

    if (idx !== -1) {
      const newCart = [...cart];
      if (newCart[idx].quantity + 1 <= med.quantity) {
        newCart[idx].quantity += 1;
        newCart[idx].total = newCart[idx].quantity * newCart[idx].price;
        setCart(newCart);
      } else {
        alert(`Stock Limit: ${med.quantity}`);
      }
    } else {
      setCart([
        ...cart,
        {
          medicineId: med._id,
          name: med.productName,
          mrp: med.mrp,
          price: med.sellingPrice,
          costPrice: med.costPrice || 0,
          maxDiscount: med.maxDiscount || 0,
          discount: discount.toFixed(2),
          gst: med.gst || 0,
          hsn: med.hsnCode || "N/A",
          batch: med.batchNumber || "N/A",
          expiry: med.expiryDate,
          quantity: 1,
          total: med.sellingPrice,
          maxStock: med.quantity,
          packSize: med.packSize || 1,
        },
      ]);
    }
    setQuery("");
    setResults([]);
    setFocusedIndex(-1); // Reset focus after adding
  };

  const updateQty = (index, val) => {
    const newQty = parseFloat(val);
    if (!newQty || newQty <= 0) return;
    const newCart = [...cart];
    if (newQty > newCart[index].maxStock)
      return alert(`Limit: ${newCart[index].maxStock}`);
    newCart[index].quantity = newQty;
    newCart[index].total = newQty * newCart[index].price;
    setCart(newCart);
  };

  const handleStaffPriceChange = (index, newPrice) => {
      const price = parseFloat(newPrice);
      if(isNaN(price) || price < 0) return;
      
      const newCart = [...cart];
      newCart[index].price = price;
      newCart[index].total = price * newCart[index].quantity;
      setCart(newCart);
  };

  const handleEditClick = async (index, item) => {
    if (isStaff) return; 

    const password = prompt("🔒 Admin Password to Edit Rate/Discount:");
    if (!password) return;
    try {
      const res = await api.post("/admin/verify", { password });
      if (res.data.success) {
        setEditingIndex(index);
        setTempData({ rate: item.price, discount: item.discount });
      } else {
        alert("❌ Wrong Password!");
      }
    } catch {
      alert("Error verifying");
    }
  };

  const handleTempChange = (field, value, mrp) => {
    let newRate = tempData.rate;
    let newDisc = tempData.discount;

    if (field === "rate") {
      newRate = parseFloat(value);
      if (mrp > 0 && !isNaN(newRate)) newDisc = ((mrp - newRate) / mrp) * 100;
    } else if (field === "discount") {
      newDisc = parseFloat(value);
      if (mrp > 0 && !isNaN(newDisc)) newRate = mrp - mrp * (newDisc / 100);
    }
    setTempData({ rate: newRate, discount: newDisc });
  };

  const saveEdit = (index) => {
    const newCart = [...cart];
    const item = newCart[index];
    const newRate = parseFloat(tempData.rate);
    const newDisc = parseFloat(tempData.discount);

    if (isNaN(newRate) || newRate < 0) return alert("Invalid Price");

    item.price = parseFloat(newRate.toFixed(2));
    item.discount = parseFloat(newDisc.toFixed(2));
    item.total = item.price * item.quantity;

    setCart(newCart);
    setEditingIndex(null);
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return alert("Cart is empty");
    const total = cart.reduce((a, b) => a + b.total, 0);
    const given = parseFloat(amountGiven) || 0;

    if (paymentMode === "Cash" && given < total)
      return alert("Insufficient Cash!");
    if (isBillNeeded && !customer.name.trim())
      return alert("Customer Name is required for Bill");

    const finalCustomer = {
      name: customer.name.trim() || "Cash Sale",
      phone: isBillNeeded ? customer.phone : "",
      doctor: isBillNeeded ? customer.doctor : "",
    };

    const saleData = {
      customerDetails: finalCustomer,
      totalAmount: total,
      paymentMode,
      items: cart.map((i) => ({ ...i })),
      isBillRequired: isBillNeeded,
      userRole: userRole, 
    };

    try {
      let billWindow = null;
      if (isBillNeeded === true) {
        billWindow = window.open("", "_blank", "width=900,height=900");
        if (billWindow) {
          billWindow.document.write("<h3>Generating Bill... Please wait.</h3>");
        } else {
          alert("⚠️ Popup blocked! Bill will be saved but not printed.");
        }
      }

      const res = await api.post("/sales", saleData);
      const finalInvoiceNo = res.data.invoiceNo || "SAVED";

      if (isBillNeeded === true && billWindow) {
        const html = await generateBillHTML(cart, {
          no: finalInvoiceNo,
          ...finalCustomer,
          mode: paymentMode,
          isDuplicate: false,
        });
        billWindow.document.open();
        billWindow.document.write(html);
        billWindow.document.close();
      }

      setLastSale({
        cart: [...cart],
        invoiceNo: finalInvoiceNo,
        isBillRequired: isBillNeeded,
        customer: finalCustomer,
        paymentMode,
      });

      setCart([]);
      setAmountGiven("");
      setCustomer({ name: "", phone: "", doctor: "" });
      fetchNextInvoice();
      
    } catch (err) {
      alert("Failed: " + err.message);
    }
  };

  const clearDraft = () => {
    localStorage.removeItem("draft_sale_v3");
    setCart([]);
    setAmountGiven("");
    setChangeToReturn(0);
    setPaymentMode("Cash");
    setCustomer({ name: "", phone: "", doctor: "" });
    setResults([]);
    setQuery("");
  };

  const handleReprint = async () => {
    if (!lastSale) return;
    const billWindow = window.open("", "_blank", "width=900,height=900");
    if (!billWindow) return alert("Popup Blocked");

    const invData = {
      no: lastSale.invoiceNo,
      name: lastSale.customer.name,
      phone: lastSale.customer.phone,
      doctor: lastSale.customer.doctor,
      mode: lastSale.paymentMode,
      isDuplicate: true,
    };
    const html = await generateBillHTML(lastSale.cart, invData);
    billWindow.document.open();
    billWindow.document.write(html);
    billWindow.document.close();
  };

  const isLoss = (rate, cp) => rate < cp;
  const isHighDisc = (disc, max) => disc > max;

  const inputClass =
    "w-full p-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all";
  const labelClass =
    "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1";

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
                <button
                  onClick={clearDraft}
                  className="text-xs font-bold text-red-600 bg-red-50 px-3 py-1 rounded hover:bg-red-100 transition-colors"
                >
                  Clear Cart
                </button>
              )}
              <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold border border-indigo-200">
                {invoiceNo}
              </span>
            </div>
          </div>

          <div className="relative">
            {/* 🔥 ADDED ONKEYDOWN HERE */}
            <input
              className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-xl focus:outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20 transition-all"
              placeholder="🔍 Scan barcode or type medicine name..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown} 
              autoFocus
            />

            {results.length > 0 && (
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
                    // 🔥 UPDATED CLASS FOR ACTIVE FOCUS STATE
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
                      
                      {/* --- STAFF: ONLY SHOW NAME --- */}
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

        {/* ... (REST OF THE TABLE CODE REMAINS EXACTLY SAME) ... */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Item</th>
                {!isStaff && <th className="px-2 py-3 text-xs font-bold text-gray-500 uppercase text-center">MRP</th>}
                {!isStaff && <th className="px-2 py-3 text-xs font-bold text-gray-500 uppercase text-center">Disc%</th>}
                <th className="px-2 py-3 text-xs font-bold text-gray-500 uppercase text-center">{isStaff ? "Edit Price" : "Rate"}</th>
                <th className="px-2 py-3 text-xs font-bold text-gray-500 uppercase text-center">Qty</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase text-right">Total</th>
                <th className="px-2 py-3 text-xs font-bold text-gray-500 uppercase"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cart.map((item, idx) => {
                const lossWarning = isLoss(parseFloat(tempData.rate || item.price), item.costPrice);
                const discWarning = isHighDisc(parseFloat(tempData.discount || item.discount), item.maxDiscount);
                return (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-800 text-sm">{item.name}</div>
                      {!isStaff && <div className="text-xs text-gray-500">Batch: {item.batch}</div>}
                    </td>
                    {!isStaff && <td className="px-2 py-3 text-center text-gray-400 text-sm">₹{item.mrp}</td>}
                    {editingIndex === idx && !isStaff ? (
                      <>
                        <td className="px-2 py-3 text-center">
                          <input type="number" value={tempData.discount} onChange={(e) => handleTempChange("discount", e.target.value, item.mrp)} className={`w-14 p-1 text-center text-sm border rounded ${discWarning ? "border-red-500 text-red-600 bg-red-50" : "border-blue-400 focus:ring-blue-200"}`} />
                        </td>
                        <td className="px-2 py-3 text-center relative">
                          <input type="number" value={tempData.rate} onChange={(e) => handleTempChange("rate", e.target.value, item.mrp)} onKeyDown={(e) => e.key === "Enter" && saveEdit(idx)} className={`w-16 p-1 text-center text-sm font-bold border rounded ${lossWarning ? "border-red-500 text-red-600 bg-red-50" : "border-blue-400 focus:ring-blue-200"}`} autoFocus />
                          {(lossWarning || discWarning) && (
                            <div className="absolute top-full left-1/2 -translate-x-1/2 bg-red-100 border border-red-200 text-red-600 text-[10px] px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap mt-1 font-bold z-20 flex flex-col items-center">
                              {lossWarning && <span>⚠️ Below CP</span>}
                              {discWarning && <span>⚠️ High Disc</span>}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-3 text-center">
                          <button onClick={() => saveEdit(idx)} className="bg-green-500 text-white text-xs px-2 py-1 rounded hover:bg-green-600 shadow-sm">OK</button>
                        </td>
                      </>
                    ) : (
                      <>
                        {!isStaff && <td className="px-2 py-3 text-center text-sm text-gray-600">{item.discount}%</td>}
                        <td className="px-2 py-3 text-center relative">
                          {isStaff ? (
                            <>
                                <input type="number" value={item.price} onChange={(e) => handleStaffPriceChange(idx, e.target.value)} className="w-16 p-1 text-center text-sm font-bold border border-gray-300 rounded focus:border-teal-500 focus:ring-1 focus:ring-teal-200" />
                                {item.price < item.costPrice && (<div className="absolute top-full left-1/2 -translate-x-1/2 bg-red-100 text-red-600 text-[9px] px-1 rounded font-bold mt-1">⚠️ Loss</div>)}
                            </>
                          ) : (
                            <div onClick={() => handleEditClick(idx, item)} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 hover:bg-blue-50 text-gray-800 hover:text-blue-600 rounded cursor-pointer transition-colors text-sm font-medium border border-transparent hover:border-blue-200" title="Click to Edit Rate">
                              ₹{item.price} <span className="text-[10px] opacity-50">✎</span>
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-3 text-center">
                          <div className="flex items-center justify-center border border-gray-300 rounded-lg overflow-hidden w-fit mx-auto shadow-sm">
                            <button onClick={() => updateQty(idx, item.quantity - 1)} className="px-2 py-1 bg-gray-50 hover:bg-gray-200 text-gray-600 font-bold">-</button>
                            <span className="w-8 text-center text-sm font-semibold bg-white">{item.quantity}</span>
                            <button onClick={() => updateQty(idx, item.quantity + 1)} className="px-2 py-1 bg-gray-50 hover:bg-gray-200 text-gray-600 font-bold">+</button>
                          </div>
                        </td>
                      </>
                    )}
                    {editingIndex !== idx && <td className="px-4 py-3 text-right font-bold text-teal-700 text-sm">₹{item.total.toFixed(2)}</td>}
                    {editingIndex !== idx && (
                      <td className="px-2 py-3 text-center">
                        <button onClick={() => { const c = [...cart]; c.splice(idx, 1); setCart(c); }} className="text-gray-400 hover:text-red-500 text-lg transition-colors">×</button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {cart.length === 0 && <tr><td colSpan={isStaff ? 5 : 7} className="py-20 text-center text-gray-400 italic">Cart is empty. Search above to add items.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* RIGHT: CHECKOUT */}
      <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col h-fit sticky top-4">
        <div className="bg-gradient-to-br from-teal-600 to-teal-800 rounded-xl p-6 text-center text-white shadow-lg mb-6">
          <div className="text-teal-100 text-xs font-bold uppercase tracking-wider mb-1">Grand Total</div>
          <div className="text-4xl font-extrabold">₹{cart.reduce((a, b) => a + b.total, 0).toFixed(0)}</div>
        </div>

        {lastSale && (
          <div className={`mb-4 border rounded-lg p-3 flex justify-between items-center animate-pulse-once ${lastSale.isBillRequired ? "bg-green-50 border-green-200" : "bg-orange-50 border-orange-200"}`}>
            <span className={`font-bold text-sm ${lastSale.isBillRequired ? "text-green-700" : "text-orange-700"}`}>
              {lastSale.isBillRequired ? "✅ Sale Saved!" : "✅ Saved (No Bill Created)"}
            </span>
            {lastSale.isBillRequired && (
              <button onClick={handleReprint} className="text-sm underline font-bold text-green-800 hover:text-green-900">Reprint Bill</button>
            )}
          </div>
        )}

        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className={labelClass}>Customer Details</span>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-teal-700">
              <input type="checkbox" checked={isBillNeeded} onChange={(e) => setIsBillNeeded(e.target.checked)} className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500" /> Print Bill
            </label>
          </div>

          <div className="space-y-3">
            <input className={`${inputClass} ${isBillNeeded && !customer.name ? "border-red-400 bg-red-50" : ""}`} placeholder={isBillNeeded ? "Customer Name *" : "Customer Name (Optional)"} value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
            {isBillNeeded && (
              <div className="flex gap-3">
                <input className={inputClass} placeholder="Phone" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
                <input className={inputClass} placeholder="Dr. Ref" value={customer.doctor} onChange={(e) => setCustomer({ ...customer, doctor: e.target.value })} />
              </div>
            )}
          </div>
        </div>

        <div className="mb-6">
          <span className={labelClass}>Payment Mode</span>
          <div className="flex gap-3 mt-2">
            <button className={`flex-1 py-3 rounded-lg font-bold text-sm border transition-all ${paymentMode === "Cash" ? "bg-teal-700 text-white border-teal-700 shadow-md" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`} onClick={() => setPaymentMode("Cash")}>💵 Cash</button>
            <button className={`flex-1 py-3 rounded-lg font-bold text-sm border transition-all ${paymentMode === "Online" ? "bg-teal-700 text-white border-teal-700 shadow-md" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`} onClick={() => setPaymentMode("Online")}>📱 UPI / Online</button>
          </div>
          {paymentMode === "Cash" && (
            <div className="mt-4 bg-orange-50 border border-orange-100 rounded-lg p-3 flex justify-between items-center">
              <input type="number" placeholder="Given Amount" value={amountGiven} onChange={(e) => setAmountGiven(e.target.value)} className="w-24 p-2 text-sm border border-orange-200 rounded focus:outline-none focus:border-orange-400" />
              <div className="text-right">
                <div className="text-xs text-gray-500 uppercase font-bold">Return Change</div>
                <div className={`text-xl font-bold ${changeToReturn < 0 ? "text-red-600" : "text-green-600"}`}>₹{changeToReturn.toFixed(0)}</div>
              </div>
            </div>
          )}
        </div>

        <button onClick={handleCheckout} className="w-full bg-teal-800 hover:bg-teal-900 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all transform active:scale-95 text-lg flex justify-center items-center gap-2">COMPLETE SALE ➔</button>
      </div>
    </div>
  );
};

export default SaleForm;