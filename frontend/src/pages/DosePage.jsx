import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import '../App.css';

const DosePage = () => {
  // --- STATES ---
  const [activeTab, setActiveTab] = useState('quick'); // 'quick' or 'resolve'
  const [pendingList, setPendingList] = useState([]);
  
  // Quick Mode States
  const [quickAmount, setQuickAmount] = useState('');
  const [quickReason, setQuickReason] = useState('');

  // Resolve Mode States
  const [resolvingId, setResolvingId] = useState(null); // ID of entry being fixed
  
  // Standard Medicine Selection States
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selectedMed, setSelectedMed] = useState(null);
  const [singleQty, setSingleQty] = useState('');
  const [doseList, setDoseList] = useState([]); // Cart

  // Loose Stock List State
  const [looseStock, setLooseStock] = useState([]);

  // --- INITIAL LOAD ---
  useEffect(() => {
    fetchPending();
    fetchLooseStock(); // Load loose stock on mount
  }, []);

  const fetchPending = async () => {
    try {
        const res = await api.get('/medicines/dose/pending');
        setPendingList(res.data);
    } catch (err){
    console.error(err);
    }  
  };

  const fetchLooseStock = async () => {
      try {
          const res = await api.get('/medicines'); // Assuming this returns all meds
          // Filter only those with looseQty > 0
          const loose = res.data.filter(m => m.looseQty > 0);
          setLooseStock(loose);
      } catch (err) {
          console.error("Error fetching loose stock", err);
      }
  };

  // --- 1. HANDLE RUSH MODE SAVE ---
  const handleQuickSave = async () => {
    if(!quickAmount || !quickReason) return alert("Fill Amount & Reason!");
    
    try {
        await api.post('/medicines/dose/quick', { amount: quickAmount, reason: quickReason });
        alert("⚡ Saved! Manage inventory later.");
        setQuickAmount('');
        setQuickReason('');
        fetchPending(); // Update list
    } catch(err) { alert("Error saving"); }
  };

  // --- 2. START RESOLVING A PENDING ENTRY ---
  const handleStartResolve = (item) => {
    setResolvingId(item._id);
    setActiveTab('resolve');
    // Pre-fill details to remind user
    alert(`Managing Entry:\nReason: ${item.reason}\nAmount Taken: ₹${item.amountCollected}\n\nNow add medicines you gave.`);
  };

  // --- 3. STANDARD MEDICINE LOGIC (Copy from before) ---
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

  // --- 4. FINAL RESOLVE SAVE ---
  const handleResolveSave = async () => {
    if(doseList.length === 0) return alert("Add medicines first!");
    
    try {
        // If resolving a pending entry
        if(resolvingId) {
            await api.post('/medicines/dose/resolve', {
                id: resolvingId,
                items: doseList.map(i => ({ id: i.id, count: i.qty }))
            });
            alert("✅ Inventory Updated & Entry Cleared!");
            setResolvingId(null);
        } else {
            // Direct Dose Sale (Without Pending)
            await api.post('/medicines/dose', {
                items: doseList.map(i => ({ id: i.id, count: i.qty })),
                amountCollected: 0, customerName: 'Direct', reason: 'Direct'
            });
            alert("✅ Stock Updated!");
        }
        
        // Reset All
        setDoseList([]);
        setActiveTab('quick');
        fetchPending();
        fetchLooseStock(); // Refresh loose stock list

    } catch(err) { alert("Error: " + err.message); }
  };

  return (
    <div style={{display:'flex', gap:'20px', maxWidth:'1200px', margin:'0 auto'}}>
        
        {/* --- LEFT SIDE: ACTION AREA --- */}
        <div style={{flex: 2}}>
            
            {/* TABS */}
            <div style={{display:'flex', marginBottom:'20px'}}>
                <button 
                    onClick={() => { setActiveTab('quick'); setResolvingId(null); }}
                    style={{flex:1, padding:'15px', fontWeight:'bold', border:'none', background: activeTab==='quick' ? '#ef4444' : '#eee', color: activeTab==='quick'?'white':'black', cursor:'pointer'}}
                >
                    ⚡ RUSH MODE (Just Cash)
                </button>
                <button 
                    onClick={() => setActiveTab('resolve')}
                    style={{flex:1, padding:'15px', fontWeight:'bold', border:'none', background: activeTab==='resolve' ? '#166534' : '#eee', color: activeTab==='resolve'?'white':'black', cursor:'pointer'}}
                >
                    📝 MANAGE STOCK (Medicine)
                </button>
            </div>

            {/* --- MODE 1: RUSH ENTRY --- */}
            {activeTab === 'quick' && (
                <div className="card" style={{textAlign:'center', padding:'40px'}}>
                    <h2 style={{color:'#ef4444'}}>⏳ Too Busy?</h2>
                    <p>Enter Amount & Reason now. Add medicines later.</p>
                    
                    <input 
                        type="number" 
                        placeholder="₹ Amount Taken" 
                        value={quickAmount} 
                        onChange={e => setQuickAmount(e.target.value)}
                        style={{fontSize:'2rem', width:'80%', padding:'15px', textAlign:'center', border:'3px solid #ef4444', borderRadius:'10px', fontWeight:'bold', color:'#ef4444'}}
                    />
                    
                    <input 
                        placeholder="Reason (e.g. Fever, Stomach Pain)" 
                        value={quickReason}
                        onChange={e => setQuickReason(e.target.value)}
                        style={{fontSize:'1.2rem', width:'80%', padding:'15px', marginTop:'20px', border:'1px solid #ccc', borderRadius:'10px'}}
                    />

                    <button 
                        onClick={handleQuickSave}
                        className="btn" 
                        style={{width:'85%', marginTop:'30px', padding:'15px', fontSize:'1.5rem', background:'#ef4444', color:'white', border:'none'}}
                    >
                        ⚡ SAVE QUICKLY
                    </button>
                </div>
            )}

            {/* --- MODE 2: MEDICINE SELECTOR (Resolve) --- */}
            {activeTab === 'resolve' && (
                <div className="card">
                    {resolvingId && <div style={{background:'#fff7ed', padding:'10px', marginBottom:'15px', borderLeft:'4px solid orange'}}>⚠️ Managing Pending Entry</div>}
                    
                    {/* Search & Add (Same logic as before) */}
                    {!selectedMed ? (
                        <div style={{position:'relative'}}>
                            <input placeholder="🔍 Search Medicine..." value={query} onChange={e => handleSearch(e.target.value)} style={{width:'100%', padding:'12px', border:'1px solid #ccc'}} autoFocus />
                            {results.length > 0 && (
                                <div style={{position:'absolute', width:'100%', background:'white', zIndex:10, border:'1px solid #ccc', maxHeight:'200px', overflowY:'auto'}}>
                                    {results.map(m => (
                                        <div key={m._id} onClick={() => handleSelect(m)} style={{padding:'10px', borderBottom:'1px solid #eee', cursor:'pointer'}}>
                                            <b>{m.productName}</b> <span style={{fontSize:'0.8rem'}}>Loose: {m.looseQty}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{display:'flex', gap:'10px', alignItems:'end'}}>
                            <div style={{flex:1}}><b>{selectedMed.productName}</b></div>
                            <input type="number" placeholder="Qty" value={singleQty} onChange={e => setSingleQty(e.target.value)} style={{width:'60px', padding:'8px'}} autoFocus />
                            <button onClick={handleAddToList} className="btn btn-primary">+ Add</button>
                            <button onClick={() => setSelectedMed(null)} className="btn btn-secondary">Back</button>
                        </div>
                    )}

                    {/* Cart List */}
                    {doseList.length > 0 && (
                        <div style={{marginTop:'20px'}}>
                            <h4>Items to Deduct:</h4>
                            <ul>
                                {doseList.map((item, i) => (
                                    <li key={i} style={{padding:'5px', borderBottom:'1px solid #eee'}}>
                                        {item.name} x <b>{item.qty}</b> <button onClick={() => handleRemove(i)} style={{color:'red', border:'none', background:'none'}}>x</button>
                                    </li>
                                ))}
                            </ul>
                            <button onClick={handleResolveSave} className="btn" style={{width:'100%', background:'#166534', color:'white', marginTop:'15px', padding:'12px'}}>
                                ✅ UPDATE STOCK & CLEAR PENDING
                            </button>
                        </div>
                    )}
                </div>
            )}
            
            {/* --- NEW SECTION: LOOSE STOCK TABLE --- */}
            <div className="card" style={{marginTop:'20px', maxHeight:'400px', overflowY:'auto'}}>
                <h3 style={{marginTop:0, color:'#d97706'}}>📉 Available Loose Stock</h3>
                <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.9rem'}}>
                    <thead style={{position:'sticky', top:0, background:'white'}}>
                        <tr style={{borderBottom:'2px solid #ddd'}}>
                            <th style={{textAlign:'left', padding:'8px'}}>Medicine</th>
                            <th style={{textAlign:'center', padding:'8px'}}>Loose Qty</th>
                            <th style={{textAlign:'center', padding:'8px'}}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {looseStock.length === 0 ? (
                            <tr><td colSpan="3" style={{textAlign:'center', padding:'20px', color:'#999'}}>No loose tablets available.</td></tr>
                        ) : (
                            looseStock.map(m => (
                                <tr key={m._id} style={{borderBottom:'1px solid #eee'}}>
                                    <td style={{padding:'8px'}}>{m.productName}</td>
                                    <td style={{padding:'8px', textAlign:'center', fontWeight:'bold', color:'#ea580c'}}>{m.looseQty}</td>
                                    <td style={{padding:'8px', textAlign:'center'}}>
                                        <button 
                                            onClick={() => { setActiveTab('resolve'); handleSelect(m); }}
                                            style={{background:'#d97706', color:'white', border:'none', padding:'2px 8px', borderRadius:'4px', cursor:'pointer', fontSize:'0.8rem'}}
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

        {/* --- RIGHT SIDE: PENDING LIST --- */}
        <div style={{flex: 1}}>
            <div className="card" style={{background:'#fef2f2', border:'1px solid #fecaca', minHeight:'400px'}}>
                <h3 style={{color:'#991b1b', marginTop:0}}>⚠️ Pending (To Manage)</h3>
                <p style={{fontSize:'0.8rem', color:'#7f1d1d'}}>Click item to fill medicines.</p>
                
                <div style={{maxHeight:'500px', overflowY:'auto'}}>
                    {pendingList.length === 0 ? <div style={{color:'#aaa', textAlign:'center', marginTop:'20px'}}>All clear! 🎉</div> : null}
                    
                    {pendingList.map(item => (
                        <div 
                            key={item._id} 
                            onClick={() => handleStartResolve(item)}
                            style={{
                                background:'white', padding:'15px', marginBottom:'10px', borderRadius:'8px', cursor:'pointer',
                                borderLeft: '5px solid #ef4444', boxShadow:'0 2px 4px rgba(0,0,0,0.05)', transition:'0.2s'
                            }}
                        >
                            <div style={{fontWeight:'bold', fontSize:'1.1rem'}}>{item.reason}</div>
                            <div style={{display:'flex', justifyContent:'space-between', marginTop:'5px'}}>
                                <span style={{color:'#166534', fontWeight:'bold', background:'#dcfce7', padding:'2px 6px', borderRadius:'4px'}}>₹{item.amountCollected}</span>
                                <span style={{fontSize:'0.75rem', color:'#666'}}>{new Date(item.date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
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