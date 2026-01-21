import React, { useState, useEffect, useRef } from 'react';
import { generateBillHTML } from '../utils/BillGenerator';
import api from '../api/axios'; 

const ManualBill = () => {
  const [customer, setCustomer] = useState({ name: '', phone: '', doctor: '', mode: 'Cash' });
  const [invoiceNo, setInvoiceNo] = useState(`MAN-${Math.floor(Date.now() / 1000)}`);
  
  // Manual Date & Time
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]); 
  const [billTime, setBillTime] = useState(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));

  const [currentItem, setCurrentItem] = useState({
    name: '', batch: '', expiry: '', mrp: '', price: '', quantity: 1, unit: 'pack', packSize: 1
  });

  const [cart, setCart] = useState([]);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1); // Added for Key Nav
  const searchRef = useRef(null);

  const currentUserRole = localStorage.getItem('userRole') || 'admin';

  // --- SEARCH EFFECT ---
  useEffect(() => {
    const fetchMedicines = async () => {
        if (query.length > 1) {
            try {
                const res = await api.get(`/medicines/search?q=${query}`);
                setSuggestions(res.data);
                setShowSuggestions(true);
                setFocusedIndex(-1); // Reset focus
            } catch (err) { setSuggestions([]); }
        } else { setSuggestions([]); setShowSuggestions(false); }
    };
    const timer = setTimeout(fetchMedicines, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
      const handleClickOutside = (event) => {
          if (searchRef.current && !searchRef.current.contains(event.target)) {
              setShowSuggestions(false);
          }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- KEYBOARD NAVIGATION HANDLER ---
  const handleKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter") {
        e.preventDefault();
        if (focusedIndex >= 0 && suggestions[focusedIndex]) {
            handleSelectMedicine(suggestions[focusedIndex]);
        }
    } else if (e.key === "Escape") {
        setShowSuggestions(false);
    }
  };

  const handleSelectMedicine = (med) => {
      setCurrentItem({
          name: med.productName,
          batch: med.batchNumber || '',
          expiry: med.expiryDate ? new Date(med.expiryDate).toISOString().split('T')[0] : '',
          mrp: med.mrp || '',
          price: med.sellingPrice || '',
          quantity: 1,
          unit: 'pack', // Default
          packSize: med.packSize || 10 // Default pack size
      });
      setQuery(med.productName);
      setShowSuggestions(false);
  };

  const handleAddItem = () => {
    if (!currentItem.name || !currentItem.price || !currentItem.quantity) {
      return alert("Please fill Name, Price and Quantity");
    }

    // Calculate Total based on Unit
    let rowTotal = parseFloat(currentItem.price) * parseFloat(currentItem.quantity);
    if(currentItem.unit === 'loose') {
        rowTotal = (parseFloat(currentItem.price) / (currentItem.packSize || 1)) * parseFloat(currentItem.quantity);
    }

    const newItem = {
      ...currentItem,
      total: rowTotal,
      hsn: '-', gst: 0, 
      medicineId: null, 
    };
    setCart([...cart, newItem]);
    
    // Reset but keep some fields empty
    setCurrentItem({ name: '', batch: '', expiry: '', mrp: '', price: '', quantity: 1, unit: 'pack', packSize: 1 });
    setQuery(""); 
  };

  const removeItem = (index) => {
    const newCart = [...cart];
    newCart.splice(index, 1);
    setCart(newCart);
  };

  // --- UNIT TOGGLE LOGIC ---
  const toggleUnit = (index) => {
    const newCart = [...cart];
    const item = newCart[index];
    item.unit = item.unit === 'pack' ? 'loose' : 'pack';
    
    // Recalculate Total
    let pricePerUnit = item.price;
    if(item.unit === 'loose') pricePerUnit = item.price / (item.packSize || 1);
    item.total = pricePerUnit * item.quantity;
    
    setCart(newCart);
  };

  const updateCartQty = (index, val) => {
      const newQty = parseFloat(val);
      if(!newQty || newQty <= 0) return;
      const newCart = [...cart];
      const item = newCart[index];
      item.quantity = newQty;
      
      let pricePerUnit = item.price;
      if(item.unit === 'loose') pricePerUnit = item.price / (item.packSize || 1);
      item.total = pricePerUnit * item.quantity;

      setCart(newCart);
  };

  const handleGenerateBill = async () => {
    if (cart.length === 0) return alert("Add items first!");
    if (!customer.name) return alert("Customer Name is required!");

    const combinedDateTime = new Date(`${billDate}T${billTime}`);

    const saleData = {
        invoiceNo: invoiceNo, 
        customerDetails: customer,
        totalAmount: cart.reduce((a,b)=>a+b.total,0),
        paymentMode: customer.mode,
        items: cart,
        isBillRequired: true,
        userRole: currentUserRole, 
        customDate: combinedDateTime
    };

    try {
        await api.post('/sales', saleData);

        const invData = {
            no: invoiceNo,
            name: customer.name,
            phone: customer.phone,
            doctor: customer.doctor,
            mode: customer.mode,
            customDate: billDate, 
            customTime: billTime  
        };

        const billHTML = await generateBillHTML(cart, invData);
        const billWindow = window.open('', '', 'width=900,height=900');
        if (billWindow) {
            billWindow.document.write(billHTML);
            billWindow.document.close();
        }

        setCustomer({ name: '', phone: '', doctor: '', mode: 'Cash' });
        setCart([]);
        setInvoiceNo(`MAN-${Math.floor(Date.now() / 1000)}`);
        setBillDate(new Date().toISOString().split('T')[0]);
        setBillTime(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));

    } catch (err) {
        alert("Error saving bill: " + err.message);
    }
  };

  const inputClass = "w-full p-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all";

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[85vh]">
      
      {/* LEFT: FORM */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col gap-6">
        <h3 className="text-xl font-bold text-gray-800 border-b pb-3">📝 Create Custom Bill</h3>
        
        {/* CUSTOMER SECTION */}
        <div className="bg-slate-50 p-5 rounded-lg border border-slate-200">
            <h4 className="text-sm font-bold text-teal-700 mb-3 flex items-center gap-2">
                1. Bill Details
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input type="date" className={inputClass} value={billDate} onChange={e => setBillDate(e.target.value)} />
                <input type="time" className={inputClass} value={billTime} onChange={e => setBillTime(e.target.value)} />
                
                <input className={inputClass} placeholder="Patient Name *" value={customer.name} onChange={e=>setCustomer({...customer, name:e.target.value})} />
                <input className={inputClass} placeholder="Phone No" value={customer.phone} onChange={e=>setCustomer({...customer, phone:e.target.value})} />
                <input className={inputClass} placeholder="Doctor Name" value={customer.doctor} onChange={e=>setCustomer({...customer, doctor:e.target.value})} />
                <select className={inputClass} value={customer.mode} onChange={e=>setCustomer({...customer, mode:e.target.value})}>
                    <option value="Cash">Cash</option>
                    <option value="Online">Online</option>
                </select>
            </div>
        </div>

        {/* ITEM SECTION */}
        <div className="bg-teal-50 p-5 rounded-lg border border-teal-100 flex-grow">
            <h4 className="text-sm font-bold text-teal-800 mb-3">2. Add Medicine / Item</h4>
            <div className="flex flex-col gap-3 relative" ref={searchRef}>
                <div className="relative">
                    <input 
                        className={inputClass} 
                        placeholder="Search or Type Medicine Name *" 
                        value={query} 
                        onChange={e => {
                            setQuery(e.target.value);
                            setCurrentItem({...currentItem, name: e.target.value});
                        }} 
                        onKeyDown={handleKeyDown} // 🔥 Added Key Navigation
                        onFocus={() => query.length > 1 && setShowSuggestions(true)}
                    />
                    {showSuggestions && suggestions.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                            {suggestions.map((med, idx) => (
                                <div 
                                    key={med._id} 
                                    onClick={() => handleSelectMedicine(med)} 
                                    // 🔥 Highlight Focused Item
                                    className={`p-3 cursor-pointer border-b border-gray-100 flex justify-between items-center
                                        ${idx === focusedIndex ? 'bg-teal-100 border-l-4 border-teal-600' : 'hover:bg-teal-50'}
                                    `}
                                >
                                    <div>
                                        <div className="font-bold text-gray-800">{med.productName}</div>
                                        <div className="text-xs text-gray-500">Batch: {med.batchNumber}</div>
                                    </div>
                                    <div className="text-right text-teal-600 font-bold text-sm">₹{med.sellingPrice}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                    <input className={inputClass} placeholder="Batch" value={currentItem.batch} onChange={e=>setCurrentItem({...currentItem, batch:e.target.value})} />
                    <input type="date" className={inputClass} placeholder="Expiry" value={currentItem.expiry} onChange={e=>setCurrentItem({...currentItem, expiry:e.target.value})} />
                </div>

                <div className="grid grid-cols-3 gap-3">
                    <input type="number" className={inputClass} placeholder="MRP" value={currentItem.mrp} onChange={e=>setCurrentItem({...currentItem, mrp:e.target.value})} />
                    <input type="number" className={`${inputClass} font-bold text-teal-700`} placeholder="Price *" value={currentItem.price} onChange={e=>setCurrentItem({...currentItem, price:e.target.value})} />
                    {/* Unit Select for Manual Entry */}
                    <select 
                        className={inputClass} 
                        value={currentItem.unit} 
                        onChange={e=>setCurrentItem({...currentItem, unit:e.target.value})}
                    >
                        <option value="pack">Pack</option>
                        <option value="loose">Loose</option>
                    </select>
                </div>
                
                {/* Pack Size Input (Only shows if Loose is selected manually, or user wants to edit) */}
                <div className="flex items-center gap-2">
                     <span className="text-xs font-bold text-gray-500">Qty:</span>
                     <input type="number" className={`${inputClass} font-bold`} placeholder="Qty *" value={currentItem.quantity} onChange={e=>setCurrentItem({...currentItem, quantity:e.target.value})} />
                     
                     <span className="text-xs font-bold text-gray-500 ml-2">Pack Size:</span>
                     <input type="number" className={inputClass} placeholder="10" value={currentItem.packSize} onChange={e=>setCurrentItem({...currentItem, packSize:e.target.value})} />
                </div>

                <button onClick={handleAddItem} className="w-full mt-2 bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 rounded-lg shadow-md transition-all transform active:scale-95">
                    + Add to Bill
                </button>
            </div>
        </div>
      </div>

      {/* RIGHT: PREVIEW & PRINT */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col justify-between h-full">
        <div className="flex-grow flex flex-col">
            <div className="flex justify-between items-center border-b border-gray-100 pb-4 mb-4">
                <h3 className="text-lg font-bold text-gray-800">Bill Preview</h3>
                <div className="bg-gray-100 text-gray-600 text-xs font-bold px-3 py-1 rounded-full border border-gray-200">{invoiceNo}</div>
            </div>

            <div className="overflow-x-auto flex-grow">
                <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="p-3 font-semibold text-gray-600">Item</th>
                            <th className="p-3 font-semibold text-gray-600">Batch</th>
                            <th className="p-3 font-semibold text-gray-600 text-center">Qty / Unit</th>
                            <th className="p-3 font-semibold text-gray-600 text-right">Price</th>
                            <th className="p-3 font-semibold text-gray-600 text-right">Total</th>
                            <th className="p-3 font-semibold text-gray-600 w-8"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {cart.length === 0 ? (
                            <tr><td colSpan="6" className="text-center py-10 text-gray-400 italic">No items added yet.</td></tr>
                        ) : (
                            cart.map((item, i) => (
                                <tr key={i} className="hover:bg-gray-50 transition-colors">
                                    <td className="p-3 text-gray-800 font-medium">
                                        {item.name} 
                                        <div className="text-[10px] text-gray-400">Pk: {item.packSize}</div>
                                    </td>
                                    <td className="p-3 text-gray-500 text-xs">{item.batch}</td>
                                    
                                    {/* 🔥 TOGGLE UNIT BUTTON */}
                                    <td className="p-3 text-center">
                                        <div className="flex flex-col items-center gap-1">
                                            <input 
                                                type="number" 
                                                value={item.quantity} 
                                                onChange={(e) => updateCartQty(i, e.target.value)} 
                                                className="w-10 text-center font-bold border rounded outline-none text-gray-700" 
                                            />
                                            <span 
                                                onClick={() => toggleUnit(i)}
                                                className={`text-[9px] font-bold px-2 py-0.5 rounded cursor-pointer uppercase border ${item.unit === 'loose' ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-teal-50 text-teal-700 border-teal-200'}`}
                                            >
                                                {item.unit === 'loose' ? '✂️ LOOSE' : '📦 PACK'}
                                            </span>
                                        </div>
                                    </td>

                                    <td className="p-3 text-right text-gray-600">₹{item.price}</td>
                                    <td className="p-3 text-right font-bold text-teal-600">₹{item.total.toFixed(2)}</td>
                                    <td className="p-3 text-center">
                                        <button onClick={()=>removeItem(i)} className="text-red-400 hover:text-red-600 font-bold text-lg px-2 transition-colors">×</button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>

        <div className="mt-6 pt-6 border-t-2 border-dashed border-gray-200">
            <div className="flex justify-between items-end mb-4">
                <span className="text-gray-500 font-bold uppercase tracking-wider text-sm">Grand Total</span>
                <span className="text-3xl font-extrabold text-teal-700">₹{cart.reduce((a,b)=>a+b.total,0).toFixed(2)}</span>
            </div>
            <button onClick={handleGenerateBill} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2">
                🖨️ Generate & Print Bill
            </button>
        </div>
      </div>

    </div>
  );
};

export default ManualBill;