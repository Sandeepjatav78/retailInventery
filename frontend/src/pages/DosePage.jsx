import React, { useState, useEffect } from 'react';
import api from '../api/axios';

const DosePage = () => {
  // --- STATES ---
  const [activeTab, setActiveTab] = useState('quick'); // 'quick' or 'resolve'
  const [pendingList, setPendingList] = useState([]);
  
  // Quick Mode States
  const [quickAmount, setQuickAmount] = useState('');
  const [quickReason, setQuickReason] = useState('');

  // Resolve Mode States
  const [resolvingId, setResolvingId] = useState(null); 
  
  // Standard Medicine Selection States
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selectedMed, setSelectedMed] = useState(null);
  const [singleQty, setSingleQty] = useState('');
  const [doseList, setDoseList] = useState([]); 

  // Loose Stock List State
  const [looseStock, setLooseStock] = useState([]);

  // --- INITIAL LOAD ---
  useEffect(() => {
    fetchPending();
    fetchLooseStock(); 
  }, []);

  const fetchPending = async () => {
    try {
        const res = await api.get('/medicines/dose/pending');
        setPendingList(res.data);
    } catch (err){ console.error(err); }  
  };

  const fetchLooseStock = async () => {
      try {
          const res = await api.get('/medicines'); 
          const loose = res.data.filter(m => m.looseQty > 0);
          setLooseStock(loose);
      } catch (err) { console.error("Error fetching loose stock", err); }
  };

  const handleQuickSave = async () => {
    if(!quickAmount || !quickReason) return alert("Fill Amount & Reason!");
    
    try {
        await api.post('/medicines/dose/quick', { amount: quickAmount, reason: quickReason });
        alert("⚡ Saved! Manage inventory later.");
        setQuickAmount('');
        setQuickReason('');
        fetchPending(); 
    } catch(err) { alert("Error saving"); }
  };

  const handleStartResolve = (item) => {
    setResolvingId(item._id);
    setActiveTab('resolve');
    alert(`Managing Entry:\nReason: ${item.reason}\nAmount Taken: ₹${item.amountCollected}\n\nNow add medicines you gave.`);
  };

  const handleSearch = async (val) => {
    setQuery(val);
    if (val.length > 1) {
      const res = await api.get(`/medicines/search?q=${val}`);
      setResults(res.data);
    } else { setResults([]); }
  };

  const handleSelect = (med) => {
    setSelectedMed(med);
    setQuery('');
    setResults([]);
    setSingleQty('');
  };

  const handleAddToList = () => {
    if (!selectedMed || !singleQty) return alert("Enter Qty");
    const qty = parseInt(singleQty);
    const newItem = { id: selectedMed._id, name: selectedMed.productName, qty: qty };
    setDoseList([...doseList, newItem]);
    setSelectedMed(null);
    setSingleQty('');
  };

  const handleRemove = (idx) => {
    const list = [...doseList];
    list.splice(idx, 1);
    setDoseList(list);
  };

  const handleResolveSave = async () => {
    if(doseList.length === 0) return alert("Add medicines first!");
    
    try {
        if(resolvingId) {
            await api.post('/medicines/dose/resolve', {
                id: resolvingId,
                items: doseList.map(i => ({ id: i.id, count: i.qty }))
            });
            alert("✅ Inventory Updated & Entry Cleared!");
            setResolvingId(null);
        } else {
            await api.post('/medicines/dose', {
                items: doseList.map(i => ({ id: i.id, count: i.qty })),
                amountCollected: 0, customerName: 'Direct', reason: 'Direct'
            });
            alert("✅ Stock Updated!");
        }
        
        setDoseList([]);
        setActiveTab('quick');
        fetchPending();
        fetchLooseStock(); 

    } catch(err) { alert("Error: " + err.message); }
  };

  // Reusable Classes
  const tabBase = "flex-1 py-4 font-bold text-sm uppercase tracking-wider transition-colors duration-200 border-b-4";
  const activeTabClass = (tab) => activeTab === tab 
    ? (tab === 'quick' ? "border-red-500 text-red-600 bg-red-50" : "border-green-600 text-green-700 bg-green-50")
    : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50";

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 flex flex-col lg:flex-row gap-6 h-full">
        
        {/* --- LEFT SIDE: ACTION AREA --- */}
        <div className="flex-1 flex flex-col h-full">
            
            {/* TABS */}
            <div className="flex mb-6 bg-white rounded-t-xl shadow-sm border border-gray-200 overflow-hidden">
                <button 
                    onClick={() => { setActiveTab('quick'); setResolvingId(null); }}
                    className={tabBase + " " + activeTabClass('quick')}
                >
                    ⚡ Rush Mode (Cash)
                </button>
                <button 
                    onClick={() => setActiveTab('resolve')}
                    className={tabBase + " " + activeTabClass('resolve')}
                >
                    📝 Manage Stock (Meds)
                </button>
            </div>

            {/* --- MODE 1: RUSH ENTRY --- */}
            {activeTab === 'quick' && (
                <div className="bg-white rounded-b-xl shadow-sm border border-gray-200 p-8 text-center flex flex-col items-center justify-center flex-grow">
                    <h2 className="text-2xl font-bold text-red-500 mb-2 animate-pulse">⏳ Too Busy?</h2>
                    <p className="text-gray-500 mb-8">Enter Amount & Reason now. Add medicines later.</p>
                    
                    <input 
                        type="number" 
                        placeholder="₹ Amount Taken" 
                        value={quickAmount} 
                        onChange={e => setQuickAmount(e.target.value)}
                        className="text-4xl w-full max-w-xs p-4 text-center border-4 border-red-200 rounded-2xl font-bold text-red-600 focus:outline-none focus:border-red-500 transition-colors placeholder-red-200"
                    />
                    
                    <input 
                        placeholder="Reason (e.g. Fever, Stomach Pain)" 
                        value={quickReason}
                        onChange={e => setQuickReason(e.target.value)}
                        className="w-full max-w-md p-4 mt-6 border border-gray-300 rounded-lg text-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
                    />

                    <button 
                        onClick={handleQuickSave}
                        className="w-full max-w-md mt-8 py-4 bg-red-500 hover:bg-red-600 text-white font-bold text-xl rounded-xl shadow-lg transform active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        ⚡ SAVE QUICKLY
                    </button>
                </div>
            )}

            {/* --- MODE 2: MEDICINE SELECTOR (Resolve) --- */}
            {activeTab === 'resolve' && (
                <div className="bg-white rounded-b-xl shadow-sm border border-gray-200 p-6 flex flex-col flex-grow">
                    {resolvingId && (
                        <div className="bg-orange-50 border-l-4 border-orange-500 p-4 mb-6 rounded-r text-orange-800 font-medium flex items-center gap-2">
                            <span>⚠️</span> Managing Pending Entry
                        </div>
                    )}
                    
                    {/* Search & Add */}
                    {!selectedMed ? (
                        <div className="relative mb-6">
                            <input 
                                placeholder="🔍 Search Medicine..." 
                                value={query} 
                                onChange={e => handleSearch(e.target.value)} 
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                                autoFocus 
                            />
                            {results.length > 0 && (
                                <div className="absolute w-full bg-white z-10 border border-gray-200 rounded-lg mt-1 shadow-xl max-h-60 overflow-y-auto divide-y divide-gray-100">
                                    {results.map(m => (
                                        <div key={m._id} onClick={() => handleSelect(m)} className="p-3 hover:bg-green-50 cursor-pointer flex justify-between items-center">
                                            <span className="font-bold text-gray-800">{m.productName}</span>
                                            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded font-bold">Loose: {m.looseQty}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex gap-3 items-end mb-6 bg-green-50 p-4 rounded-lg border border-green-100">
                            <div className="flex-1">
                                <label className="text-xs font-bold text-green-700 uppercase">Selected Medicine</label>
                                <div className="font-bold text-gray-900 text-lg">{selectedMed.productName}</div>
                            </div>
                            <input 
                                type="number" 
                                placeholder="Qty" 
                                value={singleQty} 
                                onChange={e => setSingleQty(e.target.value)} 
                                className="w-20 p-2 border border-gray-300 rounded focus:outline-none focus:border-green-500 text-center font-bold" 
                                autoFocus 
                            />
                            <button onClick={handleAddToList} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 font-bold shadow-sm">+ Add</button>
                            <button onClick={() => setSelectedMed(null)} className="text-gray-500 hover:text-gray-700 font-medium px-2">Cancel</button>
                        </div>
                    )}

                    {/* Cart List */}
                    {doseList.length > 0 && (
                        <div className="flex-grow flex flex-col">
                            <h4 className="font-bold text-gray-700 mb-2 border-b pb-2">Items to Deduct:</h4>
                            <ul className="space-y-2 mb-6 flex-grow overflow-y-auto max-h-48">
                                {doseList.map((item, i) => (
                                    <li key={i} className="flex justify-between items-center p-2 bg-gray-50 rounded border border-gray-100">
                                        <span className="text-gray-800">{item.name} <span className="text-gray-400 mx-1">x</span> <span className="font-bold">{item.qty}</span></span>
                                        <button onClick={() => handleRemove(i)} className="text-red-500 hover:bg-red-50 p-1 rounded">×</button>
                                    </li>
                                ))}
                            </ul>
                            <button onClick={handleResolveSave} className="w-full bg-green-700 text-white font-bold py-3 rounded-lg hover:bg-green-800 shadow-md">
                                ✅ UPDATE STOCK & CLEAR PENDING
                            </button>
                        </div>
                    )}

                    {/* --- LOOSE STOCK TABLE (Only show if not adding meds) --- */}
                    {doseList.length === 0 && !selectedMed && (
                        <div className="mt-4 flex-grow flex flex-col">
                            <h3 className="text-sm font-bold text-orange-600 mb-2 flex items-center gap-2">
                                📉 Available Loose Stock
                            </h3>
                            <div className="overflow-y-auto border border-gray-200 rounded-lg flex-grow max-h-60">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 sticky top-0">
                                        <tr>
                                            <th className="p-2 font-semibold text-gray-600">Medicine</th>
                                            <th className="p-2 font-semibold text-gray-600 text-center">Loose Qty</th>
                                            <th className="p-2 font-semibold text-gray-600 text-center">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {looseStock.length === 0 ? (
                                            <tr><td colSpan="3" className="p-6 text-center text-gray-400 italic">No loose tablets available.</td></tr>
                                        ) : (
                                            looseStock.map(m => (
                                                <tr key={m._id} className="hover:bg-orange-50/50">
                                                    <td className="p-2">{m.productName}</td>
                                                    <td className="p-2 text-center font-bold text-orange-600">{m.looseQty}</td>
                                                    <td className="p-2 text-center">
                                                        <button 
                                                            onClick={() => { setActiveTab('resolve'); handleSelect(m); }}
                                                            className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded hover:bg-orange-200 font-medium"
                                                        >
                                                            Use
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* --- RIGHT SIDE: PENDING LIST --- */}
        <div className="lg:w-1/3 w-full">
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 h-full flex flex-col shadow-sm">
                <div className="flex items-center gap-2 mb-4 text-red-800">
                    <span className="text-xl">⚠️</span>
                    <h3 className="font-bold text-lg">Pending (To Manage)</h3>
                </div>
                <p className="text-xs text-red-600 mb-4 bg-red-100/50 p-2 rounded">Click any item below to fill medicine details.</p>
                
                <div className="flex-grow overflow-y-auto space-y-3 pr-1 custom-scrollbar" style={{maxHeight:'calc(100vh - 250px)'}}>
                    {pendingList.length === 0 && (
                        <div className="text-center py-10 text-gray-400 italic flex flex-col items-center">
                            <span className="text-2xl mb-2">🎉</span>
                            All clear! No pending entries.
                        </div>
                    )}
                    
                    {pendingList.map(item => (
                        <div 
                            key={item._id} 
                            onClick={() => handleStartResolve(item)}
                            className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-red-500 cursor-pointer hover:shadow-md hover:translate-x-1 transition-all group"
                        >
                            <div className="font-bold text-gray-800 text-lg group-hover:text-red-600 transition-colors">{item.reason}</div>
                            <div className="flex justify-between items-center mt-2">
                                <span className="bg-green-100 text-green-800 font-bold px-2 py-1 rounded text-sm">₹{item.amountCollected}</span>
                                <span className="text-xs text-gray-400">{new Date(item.date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>

    </div>
  );
};

export default DosePage;