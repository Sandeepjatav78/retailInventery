import React, { useState } from 'react';
import api from '../api/axios';
import * as XLSX from 'xlsx';

const InventoryTable = ({ meds, onUpdate }) => {
  const [editId, setEditId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [showSP, setShowSP] = useState(false);
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
        "HSN": m.hsnCode,
        "GST %": m.gst, // <--- Added to Excel
        "Quantity": m.quantity,
        "MRP": m.mrp,
        "Selling Price": m.sellingPrice,
        "Cost Price": m.costPrice,
        "Party Name": m.partyName || '-',
        "Purchase Date": m.purchaseDate ? new Date(m.purchaseDate).toLocaleDateString() : '-',
        "Expiry Date": new Date(m.expiryDate).toLocaleDateString(),
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory");
    XLSX.writeFile(workbook, "Radhe_Pharmacy_Inventory.xlsx");
  };

  const handleToggleSP = async () => {
    if (showSP) { setShowSP(false); return; }
    const password = prompt("🔒 Enter Admin Password to view prices:");
    if (!password) return;
    try {
      const res = await api.post('/admin/verify', { password });
      if (res.data.success) setShowSP(true);
      else alert("❌ Wrong Password!");
    } catch (err) { alert("Server Error"); }
  };

  const handleEditClick = (med) => { setEditId(med._id); setEditFormData({ ...med }); };
  const handleEditFormChange = (e) => { setEditFormData({ ...editFormData, [e.target.name]: e.target.value }); };
  const handleSaveClick = () => { onUpdate(editId, editFormData); setEditId(null); };

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
             <button onClick={handleToggleSP} className={`btn ${showSP ? 'btn-danger' : 'btn-secondary'}`}>
                {showSP ? '🙈 Hide Prices' : '🔒 View Secret Prices'}
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
                <th>Qty</th>
                <th>MRP</th>
                <th>GST%</th> {/* NEW COLUMN */}
                {showSP && <th>SP (Secret)</th>}
                <th>Bill</th>
                <th>Action</th>
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
                    <td><input name="quantity" type="number" value={editFormData.quantity} onChange={handleEditFormChange} style={{width:'60px'}} /></td>
                    <td><input name="mrp" type="number" value={editFormData.mrp} onChange={handleEditFormChange} style={{width:'60px'}} /></td>
                    
                    {/* GST EDIT INPUT */}
                    <td>
                        <select name="gst" value={editFormData.gst} onChange={handleEditFormChange} style={{padding:'5px'}}>
                            <option value="0">0%</option>
                            <option value="5">5%</option>
                            <option value="12">12%</option>
                            <option value="18">18%</option>
                            <option value="28">28%</option>
                        </select>
                    </td>

                    {showSP && (
                        <td><input name="sellingPrice" type="number" value={editFormData.sellingPrice} onChange={handleEditFormChange} style={{width:'60px'}} /></td>
                    )}

                    <td>-</td>
                    <td className="flex">
                        <button onClick={handleSaveClick} className="btn btn-success" style={{padding:'6px'}}>Save</button>
                        <button onClick={() => setEditId(null)} className="btn btn-danger" style={{padding:'6px'}}>Cancel</button>
                    </td>
                    </>
                ) : (
                    <>
                    <td style={{fontWeight: '500'}}>{m.productName}</td>
                    <td className="text-muted">{m.batchNumber}</td>
                    <td style={{fontSize:'0.85rem', color:'#555'}}>{m.partyName || '-'}</td>
                    
                    <td>
                        <span style={{fontWeight:'bold', color: m.quantity < 10 ? 'var(--danger)' : 'inherit'}}>
                            {m.quantity}
                        </span>
                    </td>
                    <td>{m.mrp}</td>
                    
                    {/* GST DISPLAY */}
                    <td>
                        <span className="badge badge-online" style={{background:'#e0e7ff', color:'#3730a3'}}>
                            {m.gst}%
                        </span>
                    </td>

                    {showSP && <td className="text-success" style={{fontWeight:'bold'}}>₹{m.sellingPrice}</td>}

                    <td>
                        {m.billImage ? (
                            <a href={m.billImage} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{padding: '4px 8px', fontSize: '0.8rem'}}>View</a>
                        ) : <span className="text-muted">-</span>}
                    </td>

                    <td>
                        <button onClick={() => handleEditClick(m)} className="btn btn-secondary" style={{padding: '4px 8px'}}>Edit</button>
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