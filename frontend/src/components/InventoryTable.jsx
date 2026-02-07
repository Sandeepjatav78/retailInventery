import React, { useState } from 'react';
import api from '../api/axios';
import * as XLSX from 'xlsx';

const InventoryTable = ({ meds, onUpdate, onDelete }) => {
  const [editId, setEditId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [newBillFile, setNewBillFile] = useState(null);
  const [showCP, setShowCP] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // --- FILTER LOGIC ---
  const filteredMeds = meds.filter(m => 
    m.productName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (m.partyName && m.partyName.toLowerCase().includes(searchTerm.toLowerCase())) ||
    m.batchNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // --- EXPORT TO EXCEL ---
  const handleExport = () => {
    const dataToExport = filteredMeds.map(m => {
        // Calculate loose for export too
        const packSize = m.packSize || 10;
        const totalStock = m.quantity || 0;
        const strips = Math.floor(totalStock);
        const loose = Math.round((totalStock - strips) * packSize);

        return {
            "Product Name": m.productName,
            "Batch": m.batchNumber,
            "Party Name": m.partyName || '-',
            "Packing": packSize,
            "Qty (Sealed Strips)": strips,
            "Loose (Open Tabs)": loose, 
            "MRP": m.mrp,
            "Selling Price": m.sellingPrice,
            "Cost Price": m.costPrice,
            "GST %": m.gst,
            "Expiry Date": new Date(m.expiryDate).toLocaleDateString(),
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory");
    XLSX.writeFile(workbook, "Radhe_Pharmacy_Inventory.xlsx");
  };

  // --- SIMPLE PASSWORD FOR CP VIEW ---
  const handleToggleCP = () => {
    if (showCP) { 
        setShowCP(false); 
        return; 
    }
    const password = prompt("🔒 Enter :");
    if (!password) return;

    const SECRET_CODE = "1234"; 

    if (password === SECRET_CODE) {
        setShowCP(true);
    } else {
        alert("❌ Wrong Code!");
    }
  };

  // --- DELETE ITEM ---
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

  // --- EDIT HANDLERS ---
  const handleEditClick = (med) => { 
      setEditId(med._id); 
      setEditFormData({ 
          ...med, 
          packSize: med.packSize || '', 
          // We don't need to edit loose separately now, it's part of quantity
          quantity: med.quantity || 0,
          gst: med.gst || 0
      }); 
      setNewBillFile(null);
  };

  const handleEditFormChange = (e) => { 
      setEditFormData({ ...editFormData, [e.target.name]: e.target.value }); 
  };

  const handleEditFileChange = (e) => {
      setNewBillFile(e.target.files[0]);
  };

  const handleSaveClick = async () => {
      const formData = new FormData();
      Object.keys(editFormData).forEach(key => {
          if (key !== 'billImage' && key !== '_id' && key !== '__v' && key !== 'createdAt' && key !== 'updatedAt') {
              const value = editFormData[key];
              if (value !== null && value !== undefined) {
                  formData.append(key, value);
              }
          }
      });
      if (newBillFile) {
          formData.append('billImage', newBillFile);
      }

      try {
        await api.put(`/medicines/${editId}`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        alert("✅ Updated Successfully!");
        setEditId(null);
        window.location.reload();
      } catch (err) {
          console.error("Update Failed:", err.response?.data?.message || err.message);
          alert("Update Failed: " + (err.response?.data?.message || "Unknown Error"));
      }
  };

  // Reusable Classes
  const thClass = "px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-gray-200";
  const tdClass = "px-3 py-4 whitespace-nowrap text-sm text-gray-700 border-b border-gray-100";
  const inputEditClass = "w-full p-1 border border-gray-300 rounded text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500";

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      
      {/* --- HEADER: Search & Buttons --- */}
      <div className="flex flex-wrap items-center justify-between p-4 gap-4 bg-gray-50 border-b border-gray-200">
         <div className="flex items-center gap-4 flex-grow">
            <h3 className="font-bold text-lg text-gray-800 whitespace-nowrap">
                📦 Stock List <span className="text-gray-500 text-sm font-normal">({filteredMeds.length})</span>
            </h3>
            <div className="relative w-full max-w-xs">
                <input  
                    placeholder=" Search Name, Party or Batch..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
                <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
            </div>
         </div>
         
         <div className="flex gap-3">
             <button onClick={handleExport} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors flex items-center gap-2">
                 📊 Export Excel
             </button>
             <button 
                onClick={handleToggleCP} 
                className={`px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors flex items-center gap-2 ${showCP ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-gray-600 hover:bg-gray-700 text-white'}`}
             >
                {showCP ? '🙈' : '🔒'}
             </button>
         </div>
      </div>

      {/* --- TABLE --- */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
                <tr>
                    <th className={thClass}>Name</th>
                    <th className={thClass}>Batch</th>
                    <th className={thClass}>Party</th>
                    <th className={`${thClass} text-center`}>Pack of</th>
                    <th className={`${thClass} text-center`}>Qty (Strips)</th>
                    <th className={`${thClass} bg-orange-50 text-orange-800 text-center`}>Loose</th> 
                    <th className={thClass}>MRP</th>
                    <th className={`${thClass} text-green-700`}>S.Price</th>
                    <th className={thClass}>GST%</th>
                    {showCP && <th className={`${thClass} text-red-600`}>CP</th>}
                    <th className={thClass}>Bill Upload</th>
                    <th className={`${thClass} text-center`}>Action</th>
                </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
            {filteredMeds.map((m) => {
                // --- 🔥 DYNAMIC LOGIC FOR LOOSE CALCULATION ---
                // Total Quantity (e.g., 55.8)
                const totalQty = m.quantity || 0;
                // Full Strips (e.g., 55)
                const fullStrips = Math.floor(totalQty);
                // Decimal Part (e.g., 0.8) * Pack Size (10) = 8 Loose Tablets
                // Use Math.round to fix floating point errors (like 7.99999)
                const looseTablets = Math.round((totalQty - fullStrips) * (m.packSize || 10));

                return (
                <tr key={m._id} className="hover:bg-gray-50 transition-colors">
                {editId === m._id ? (
                    // --- EDIT MODE ---
                    <>
                    <td className={tdClass}><input name="productName" value={editFormData.productName} onChange={handleEditFormChange} className={inputEditClass} /></td>
                    <td className={tdClass}><input name="batchNumber" value={editFormData.batchNumber} onChange={handleEditFormChange} className={`${inputEditClass} w-20`} /></td>
                    <td className={tdClass}><input name="partyName" value={editFormData.partyName} onChange={handleEditFormChange} className={inputEditClass} /></td>
                    <td className={tdClass}><input name="packSize" type="number" value={editFormData.packSize || ''} onChange={handleEditFormChange} className={`${inputEditClass} text-center w-16`} /></td>
                    <td className={tdClass}><input name="quantity" type="number" value={editFormData.quantity} onChange={handleEditFormChange} className={`${inputEditClass} w-16`} /></td>
                    
                    {/* Loose is read-only in edit mode because it's derived from quantity */}
                    <td className={`${tdClass} bg-orange-50 text-center text-gray-400 font-bold`}>
                        -
                    </td>

                    <td className={tdClass}><input name="mrp" type="number" value={editFormData.mrp} onChange={handleEditFormChange} className={`${inputEditClass} w-20`} /></td>
                    <td className={tdClass}><input name="sellingPrice" type="number" value={editFormData.sellingPrice} onChange={handleEditFormChange} className={`${inputEditClass} w-20 font-bold text-green-700`} /></td>
                    <td className={tdClass}>
                        <select name="gst" value={editFormData.gst} onChange={handleEditFormChange} className={inputEditClass}>
                            <option value="0">0%</option>
                            <option value="5">5%</option>
                            <option value="12">12%</option>
                            <option value="18">18%</option>
                        </select>
                    </td>
                    {showCP && (
                        <td className={tdClass}><input name="costPrice" type="number" value={editFormData.costPrice} onChange={handleEditFormChange} className={`${inputEditClass} w-20 border-red-300 text-red-600`} /></td>
                    )}
                    <td className={tdClass}>
                        <input type="file" onChange={handleEditFileChange} className="text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100" />
                    </td>
                    <td className={tdClass}>
                        <div className="flex gap-2 justify-center">
                            <button onClick={handleSaveClick} className="bg-green-100 text-green-700 hover:bg-green-200 p-1.5 rounded-md" title="Save">💾</button>
                            <button onClick={() => setEditId(null)} className="bg-gray-100 text-gray-600 hover:bg-gray-200 p-1.5 rounded-md" title="Cancel">❌</button>
                        </div>
                    </td>
                    </>
                ) : (
                    // --- VIEW MODE ---
                    <>
                    <td className={`${tdClass} font-medium text-gray-900`}>{m.productName}</td>
                    <td className={`${tdClass} text-gray-500`}>{m.batchNumber}</td>
                    <td className={`${tdClass} text-gray-500 text-xs`}>{m.partyName || '-'}</td>
                    <td className={`${tdClass} text-center font-semibold text-gray-600`}>{m.packSize || 10}</td>
                    <td className={tdClass}>
                        <div className="text-center">
                            <span className={`font-bold ${fullStrips < 5 ? 'text-red-600 bg-red-50 px-2 py-0.5 rounded' : 'text-gray-900'}`}>
                                {fullStrips}
                            </span>
                        </div>
                    </td>
                    
                    {/* 🔥 DYNAMIC LOOSE COLUMN */}
                    <td className={`${tdClass} text-center font-bold text-orange-600 bg-orange-50`}>
                        {looseTablets}
                    </td>

                    <td className={tdClass}>{m.mrp}</td>
                    <td className={`${tdClass} font-bold text-green-700`}>₹{m.sellingPrice}</td>
                    <td className={tdClass}>
                        <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs font-semibold border border-indigo-100">{m.gst}%</span>
                    </td>
                    {showCP && <td className={`${tdClass} font-bold text-red-600`}>₹{m.costPrice}</td>}
                    <td className={tdClass}>
                        {m.billImage ? (
                            <a href={m.billImage} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:text-teal-800 text-xs underline font-medium">View Bill</a>
                        ) : <span className="text-gray-400 text-xs italic">No Bill</span>}
                    </td>
                    <td className={tdClass}>
                        <div className="flex gap-2 justify-center">
                            <button onClick={() => handleEditClick(m)} className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 p-1 rounded transition-colors" title="Edit">✏️</button>
                            <button onClick={() => handleDeleteClick(m._id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded transition-colors" title="Delete">🗑️</button>
                        </div>
                    </td>
                    </>
                )}
                </tr>
            )})}
            </tbody>
        </table>
        
        {/* Empty State */}
        {filteredMeds.length === 0 && (
            <div className="p-8 text-center text-gray-400 italic bg-gray-50 border-t border-gray-100">
                No medicines found matching "{searchTerm}"
            </div>
        )}
      </div>
    </div>
  );
};

export default InventoryTable;