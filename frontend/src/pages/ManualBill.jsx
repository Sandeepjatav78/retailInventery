import React, { useState, useEffect, useRef } from 'react';
import { generateBillHTML } from '../utils/BillGenerator';
import api from '../api/axios'; 

const ManualBill = () => {
  // --- STATE ---
  const [customer, setCustomer] = useState({ name: '', phone: '', doctor: '', mode: 'Cash' });
  const [invoiceNo, setInvoiceNo] = useState(`MAN-${Math.floor(Date.now() / 1000)}`);
  
  // Manual Date & Time (Defaults to Current)
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]); 
  const [billTime, setBillTime] = useState(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));

  const [currentItem, setCurrentItem] = useState({
    name: '', batch: '', expiry: '', mrp: '', price: '', quantity: 1
  });

  const [cart, setCart] = useState([]);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef(null);

  // Get Current User Role
  const currentUserRole = localStorage.getItem('userRole') || 'admin';

  // --- SEARCH EFFECT ---
  useEffect(() => {
    const fetchMedicines = async () => {
        if (query.length > 1) {
            try {
                const res = await api.get(`/medicines/search?q=${query}`);
                setSuggestions(res.data);
                setShowSuggestions(true);
            } catch (err) { setSuggestions([]); }
        } else { setSuggestions([]); setShowSuggestions(false); }
    };
    const timer = setTimeout(fetchMedicines, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Click Outside Logic
  useEffect(() => {
      const handleClickOutside = (event) => {
          if (searchRef.current && !searchRef.current.contains(event.target)) {
              setShowSuggestions(false);
          }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- HANDLERS ---
  const handleSelectMedicine = (med) => {
      setCurrentItem({
          name: med.productName,
          batch: med.batchNumber || '',
          expiry: med.expiryDate ? new Date(med.expiryDate).toISOString().split('T')[0] : '',
          mrp: med.mrp || '',
          price: med.sellingPrice || '',
          quantity: 1
      });
      setQuery(med.productName);
      setShowSuggestions(false);
  };

  const handleAddItem = () => {
    if (!currentItem.name || !currentItem.price || !currentItem.quantity) {
      return alert("Please fill Name, Price and Quantity");
    }
    const newItem = {
      ...currentItem,
      total: parseFloat(currentItem.price) * parseFloat(currentItem.quantity),
      hsn: '-', gst: 0, 
      medicineId: null, // 🔥 CRITICAL: Set null so backend doesn't deduct stock
      packSize: '1',
      unit: 'loose'
    };
    setCart([...cart, newItem]);
    setCurrentItem({ name: '', batch: '', expiry: '', mrp: '', price: '', quantity: 1 });
    setQuery(""); 
  };

  const removeItem = (index) => {
    const newCart = [...cart];
    newCart.splice(index, 1);
    setCart(newCart);
  };

  const handleGenerateBill = async () => {
    if (cart.length === 0) return alert("Add items first!");
    if (!customer.name) return alert("Customer Name is required!");

    // 1. Calculate Combined Date for Backend (ISO Format)
    const combinedDateTime = new Date(`${billDate}T${billTime}`);

    const saleData = {
        invoiceNo: invoiceNo, // Force the Manual ID
        customerDetails: customer,
        totalAmount: cart.reduce((a,b)=>a+b.total,0),
        paymentMode: customer.mode,
        items: cart,
        isBillRequired: true,
        userRole: currentUserRole, // 🔥 Save as current user (Staff/Admin)
        customDate: combinedDateTime // 🔥 Send this to backend
    };

    try {
        // --- 🔥 SAVE TO DATABASE ---
        await api.post('/sales', saleData);

        // --- GENERATE PRINT ---
        const invData = {
            no: invoiceNo,
            name: customer.name,
            phone: customer.phone,
            doctor: customer.doctor,
            mode: customer.mode,
            customDate: billDate, // Send raw date string for print
            customTime: billTime  // Send raw time string for print
        };

        const billHTML = await generateBillHTML(cart, invData);
        const billWindow = window.open('', '', 'width=900,height=900');
        if (billWindow) {
            billWindow.document.write(billHTML);
            billWindow.document.close();
        }

        // --- RESET ---
        setCustomer({ name: '', phone: '', doctor: '', mode: 'Cash' });
        setCart([]);
        setInvoiceNo(`MAN-${Math.floor(Date.now() / 1000)}`);
        // Reset Date/Time to current for next bill
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
                {/* 🔥 NEW: DATE & TIME INPUTS */}
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
                        onFocus={() => query.length > 1 && setShowSuggestions(true)}
                    />
                    {showSuggestions && suggestions.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                            {suggestions.map((med) => (
                                <div key={med._id} onClick={() => handleSelectMedicine(med)} className="p-3 hover:bg-teal-50 cursor-pointer border-b border-gray-100 last:border-0 flex justify-between items-center">
                                    <div>
                                        <div className="font-bold text-gray-800">{med.productName}</div>
                                        <div className="text-xs text-gray-500">Batch: {med.batchNumber} | Exp: {new Date(med.expiryDate).toLocaleDateString('en-IN', {month:'short', year:'2-digit'})}</div>
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
                    <input type="number" className={`${inputClass} font-bold`} placeholder="Qty *" value={currentItem.quantity} onChange={e=>setCurrentItem({...currentItem, quantity:e.target.value})} />
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
                            <th className="p-3 font-semibold text-gray-600 text-center">Qty</th>
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
                                    <td className="p-3 text-gray-800 font-medium">{item.name}</td>
                                    <td className="p-3 text-gray-500 text-xs">{item.batch}</td>
                                    <td className="p-3 text-center font-bold text-gray-700">{item.quantity}</td>
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