import React, { useState } from 'react';
import api from '../api/axios';
import * as XLSX from 'xlsx';

const InventoryTable = ({ meds, onUpdate, onDelete }) => {
  const [editId, setEditId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [newBillFile, setNewBillFile] = useState(null); // <--- State for new file
  const [showCP, setShowCP] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredMeds = meds.filter(m => 
    m.productName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (m.partyName && m.partyName.toLowerCase().includes(searchTerm.toLowerCase())) ||
    m.batchNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExport = () => {
    const dataToExport = filteredMeds.map(m => ({
        "Product Name": m.productName,
        "Batch": m.batchNumber,
        "Party Name": m.partyName || '-',
        "Packing": m.packSize || 1,
        "Qty (Sealed Strips)": m.quantity,
        "Loose (Open Tabs)": m.looseQty || 0, 
        "MRP": m.mrp,
        "Selling Price": m.sellingPrice,
        "Cost Price": m.costPrice,
        "GST %": m.gst,
        "Expiry Date": new Date(m.expiryDate).toLocaleDateString(),
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory");
    XLSX.writeFile(workbook, "Radhe_Pharmacy_Inventory.xlsx");
  };

  const handleToggleCP = async () => {
    if (showCP) { setShowCP(false); return; }
    const password = prompt("🔒 Enter Admin Password to view COST PRICES:");
    if (!password) return;
    try {
      const res = await api.post('/admin/verify', { password });
      if (res.data.success) setShowCP(true);
      else alert("❌ Wrong Password!");
    } catch (err) { alert("Server Error"); }
  };

  const handleDeleteClick = async (id) => {
    if(!window.confirm("⚠️ Are you sure you want to delete this medicine permanently?")) return;
    const password = prompt("🧨 Enter Admin Password to DELETE:");
    if (!password) return;
    try {
        const res = await api.post('/admin/verify', { password });
        if (res.data.success) { onDelete(id); } 
        else { alert("❌ Wrong Password! Delete Cancelled."); }
    } catch (err) { alert("Server Error"); }
  };

  const handleEditClick = (med) => { 
      setEditId(med._id); 
      setEditFormData({ ...med }); 
      setNewBillFile(null); // Reset file input
  };

  const handleEditFormChange = (e) => { 
      setEditFormData({ ...editFormData, [e.target.name]: e.target.value }); 
  };

  // --- NEW: Handle File Selection in Edit Mode ---
  const handleEditFileChange = (e) => {
      setNewBillFile(e.target.files[0]);
  };

  // --- UPDATED SAVE FUNCTION FOR FILE UPLOAD ---
  const handleSaveClick = async () => {
      // Create FormData to send file + text data
      const formData = new FormData();
      
      // Append all text fields
      Object.keys(editFormData).forEach(key => {
          if (key !== 'billImage' && key !== '_id' && key !== '__v') {
              formData.append(key, editFormData[key]);
          }
      });

      // Append new file if selected
      if (newBillFile) {
          formData.append('billImage', newBillFile);
      }

      // Call the parent onUpdate function (which calls the API)
      // Note: We need to pass FormData now, so ensure Dashboard handles it correctly
      // OR handle API call here if Dashboard expects JSON. 
      // Assuming Dashboard handles JSON, we might need a small tweak there.
      // BUT for simplicity, let's call API directly here for Update if file is involved,
      // or modify how onUpdate works. 
      
      // Let's modify onUpdate in Dashboard to handle FormData, or handle it here directly.
      // Since `onUpdate` in Dashboard is simple `api.put`, it needs headers for file.
      
      try {
        // Direct API call here to handle multipart/form-data correctly
        await api.put(`/medicines/${editId}`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        alert("✅ Updated Successfully!");
        setEditId(null);
        window.location.reload(); // Simple reload to refresh list (or pass a refresh callback)
      } catch (err) {
          console.error(err);
          alert("Update Failed");
      }
  };

  return (
    <div>
        
      <div className="flex justify-between items-center" style={{ marginBottom: "15px", flexWrap:'wrap', gap:'10px' }}>
         <div className="flex items-center gap-4">
            <h3>📦 Stock List ({filteredMeds.length})</h3>
            <input 
                placeholder="🔍 Search Name, Party or Batch..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{padding:'8px', width:'250px'}}
            />
         </div>
         
         <div className="flex gap-4">
             <button onClick={handleExport} className="btn btn-success" style={{backgroundColor:'#217346'}}>
                📊 Export Excel
             </button>
             <button onClick={handleToggleCP} className={`btn ${showCP ? 'btn-danger' : 'btn-secondary'}`}>
                {showCP ? '🙈 Hide Cost' : '🔒 View Cost Price'}
             </button>
         </div>
      </div>

      <div className="table-container">
        <table>
            <thead>
            <tr>
                <th>Name</th>
                <th>Batch</th>
                <th>Party</th>
                <th>Pack</th>
                
                {/* HEADERS */}
                <th>Strips</th>
                <th style={{color:'#ea580c', background:'#fff7ed'}}>Loose</th> 
                
                <th>MRP</th>
                <th style={{color:'green'}}>S.Price</th>
                <th>GST%</th>
                {showCP && <th style={{color:'red'}}>CP</th>}
                
                <th>Bill Upload</th> {/* RENAMED HEADER */}
                
                <th style={{width:'100px'}}>Action</th>
            </tr>
            </thead>
            <tbody>
            {filteredMeds.map((m) => (
                <tr key={m._id}>
                {editId === m._id ? (
                    <>
                    <td><input name="productName" value={editFormData.productName} onChange={handleEditFormChange} /></td>
                    <td><input name="batchNumber" value={editFormData.batchNumber} onChange={handleEditFormChange} style={{width:'80px'}} /></td>
                    <td><input name="partyName" value={editFormData.partyName} onChange={handleEditFormChange} /></td>
                    
                    <td><input name="packSize" type="number" value={editFormData.packSize} onChange={handleEditFormChange} style={{width:'40px', textAlign:'center'}} /></td>

                    {/* EDIT QTY */}
                    <td><input name="quantity" type="number" value={editFormData.quantity} onChange={handleEditFormChange} style={{width:'50px'}} /></td>
                    
                    {/* EDIT LOOSE QTY */}
                    <td style={{background:'#fff7ed'}}>
                        <input name="looseQty" type="number" value={editFormData.looseQty} onChange={handleEditFormChange} style={{width:'50px', border:'1px solid orange'}} />
                    </td>

                    <td><input name="mrp" type="number" value={editFormData.mrp} onChange={handleEditFormChange} style={{width:'60px'}} /></td>
                    <td><input name="sellingPrice" type="number" value={editFormData.sellingPrice} onChange={handleEditFormChange} style={{width:'60px', fontWeight:'bold', color:'green'}} /></td>

                    <td>
                        <select name="gst" value={editFormData.gst} onChange={handleEditFormChange} style={{padding:'5px'}}>
                            <option value="0">0%</option>
                            <option value="5">5%</option>
                            <option value="12">12%</option>
                            <option value="18">18%</option>
                        </select>
                    </td>

                    {showCP && (
                        <td><input name="costPrice" type="number" value={editFormData.costPrice} onChange={handleEditFormChange} style={{width:'60px', border:'1px solid red'}} /></td>
                    )}

                    {/* --- NEW FILE INPUT FOR BILL --- */}
                    <td>
                        <input type="file" onChange={handleEditFileChange} style={{width:'180px', fontSize:'0.8rem'}} />
                    </td>

                    <td className="flex" style={{gap:'5px'}}>
                        <button onClick={handleSaveClick} className="btn btn-success" style={{padding:'6px'}}>💾</button>
                        <button onClick={() => setEditId(null)} className="btn btn-secondary" style={{padding:'6px'}}>❌</button>
                    </td>
                    </>
                ) : (
                    <>
                    <td style={{fontWeight: '500'}}>{m.productName}</td>
                    <td className="text-muted">{m.batchNumber}</td>
                    <td style={{fontSize:'0.85rem', color:'#555'}}>{m.partyName || '-'}</td>
                    
                    <td style={{textAlign:'center', fontWeight:'bold', color:'#555'}}>
                        {m.packSize || 1}
                    </td>

                    {/* SEALED STRIPS */}
                    <td>
                        <span style={{fontWeight:'bold', color: m.quantity < 5 ? 'var(--danger)' : 'inherit'}}>
                            {m.quantity}
                        </span>
                    </td>

                    {/* LOOSE TABS */}
                    <td style={{textAlign:'center', fontWeight:'bold', color:'#ea580c', background:'#fff7ed'}}>
                        {m.looseQty || 0}
                    </td>

                    <td>{m.mrp}</td>
                    <td style={{fontWeight:'bold', color:'green'}}>₹{m.sellingPrice}</td>
                    
                    <td><span className="badge badge-online" style={{background:'#e0e7ff', color:'#3730a3'}}>{m.gst}%</span></td>

                    {showCP && <td style={{fontWeight:'bold', color:'red'}}>₹{m.costPrice}</td>}

                    {/* VIEW BILL / NO BILL */}
                    <td>
                        {m.billImage ? (
                            <a href={m.billImage} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{padding: '4px 8px', fontSize: '0.8rem'}}>View Bill</a>
                        ) : <span className="text-muted" style={{fontSize:'0.8rem'}}>No Bill</span>}
                    </td>

                    <td style={{display:'flex', gap:'8px'}}>
                        <button onClick={() => handleEditClick(m)} className="btn btn-secondary" style={{padding: '4px 8px'}} title="Edit">✏️</button>
                        <button onClick={() => handleDeleteClick(m._id)} className="btn btn-danger" style={{padding: '4px 8px'}} title="Delete">🗑️</button>
                    </td>
                    </>
                )}
                </tr>
            ))}
            </tbody>
        </table>
        {filteredMeds.length === 0 && <div style={{padding:'20px', textAlign:'center', color:'#888'}}>No medicine found matching "{searchTerm}"</div>}
      </div>
    </div>
  );
};

export default InventoryTable;