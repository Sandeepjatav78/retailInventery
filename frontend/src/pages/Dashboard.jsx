import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import ExpiryAlert from '../components/ExpiryAlert';
import InventoryTable from '../components/InventoryTable';
import '../App.css';

const Dashboard = () => {
  const [meds, setMeds] = useState([]);
const [showDoseModal, setShowDoseModal] = useState(false);
  const [form, setForm] = useState({ 
    productName: '', batchNumber: '', quantity: '', 
    mrp: '', sellingPrice: '', costPrice: '', expiryDate: '',
    maxDiscount: '', hsnCode: '', billFile: null,
    partyName: '', purchaseDate: '', gst: '0',
    packSize: '10' 
  });

  const fetchMeds = () => { api.get('/medicines').then(res => setMeds(res.data)); };
  useEffect(() => { fetchMeds(); }, []);

  // --- FILE HANDLING (Just stores file in state) ---
  const handleFileChange = (e) => setForm({ ...form, billFile: e.target.files[0] });

  // --- SIMPLE INPUT HANDLER ---
  const handleInputChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // --- PRICE WARNING LOGIC (Max Discount Alert) ---
  const getPriceWarning = () => {
    const mrp = parseFloat(form.mrp);
    const sp = parseFloat(form.sellingPrice);
    const maxDisc = parseFloat(form.maxDiscount);

    if (mrp && sp && maxDisc) {
        const actualDiscount = ((mrp - sp) / mrp) * 100;
        if (actualDiscount > maxDisc) {
            return (
                <div style={{
                    color: 'red', fontSize: '0.75rem', marginTop: '4px', 
                    fontWeight: 'bold', background: '#fee2e2', 
                    padding: '2px 5px', borderRadius: '4px', border: '1px solid red'
                }}>
                    ⚠️ Limit Exceeded! ({actualDiscount.toFixed(1)}%)
                </div>
            );
        }
    }
    return null;
  };

  // --- ADD STOCK (Uploads Bill to Cloudinary & Saves Data) ---
  const handleAdd = async () => {
    if (!form.productName || !form.batchNumber) return alert("Please fill details");
    
    const formData = new FormData();
    Object.keys(form).forEach(key => {
        // If it's the file, append it as 'billImage'
        if(key === 'billFile' && form.billFile) formData.append('billImage', form.billFile);
        else formData.append(key, form[key]);
    });

    try {
      // This API call handles both Cloudinary upload and DB Save
      await api.post('/medicines', formData);
      alert('✅ Stock Added Successfully!');
      
      // Reset Form (Keep useful fields like Party/Date/GST)
      setForm(prev => ({ 
        ...prev,
        productName: '', batchNumber: '', quantity: '', mrp: '', 
        sellingPrice: '', costPrice: '', expiryDate: '', 
        maxDiscount: '', hsnCode: '', billFile: null,
        packSize: '10' 
      })); 
      fetchMeds();
    } catch (error) { 
        console.error(error);
        alert("Error adding stock"); 
    }
  };

  const handleUpdate = async (id, updatedData) => {
    try { await api.put(`/medicines/${id}`, updatedData); alert("Updated Successfully!"); fetchMeds(); } 
    catch (err) { alert("Update Failed"); }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/medicines/${id}`);
      alert("🗑️ Item Deleted Successfully");
      fetchMeds();
    } catch (err) { alert("Failed to delete item"); }
  };

  return (
    <div>
      <ExpiryAlert />
      
      {/* DOSE MODAL (Show only if true) */}
      {showDoseModal && (
        <DoseModal 
            onClose={() => setShowDoseModal(false)} 
            onRefresh={fetchMeds} 
        />
      )}

      <div className="card">
        <div className="flex justify-between items-center" style={{marginBottom: '20px'}}>
            <h3>📦 Inventory Management</h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
          
          {/* Row 1 */}
          <div><label>Product Name</label><input name="productName" value={form.productName} onChange={handleInputChange} placeholder="Dolo 650" /></div>
          <div><label>Batch No.</label><input name="batchNumber" value={form.batchNumber} onChange={handleInputChange} placeholder="Batch" /></div>
          <div><label>HSN Code</label><input name="hsnCode" value={form.hsnCode} onChange={handleInputChange} placeholder="3004" /></div>
          
          {/* Row 2 */}
          <div><label>Party Name</label><input name="partyName" value={form.partyName} onChange={handleInputChange} placeholder="Supplier" /></div>
          <div><label>Purchase Date</label><input name="purchaseDate" type="date" value={form.purchaseDate} onChange={handleInputChange} /></div>
          
          {/* Row 3 - Pricing */}
          <div><label>MRP (Per Strip)</label><input name="mrp" type="number" value={form.mrp} onChange={handleInputChange} placeholder="₹" /></div>
          
          {/* Selling Price with Warning */}
          <div>
              <label>Selling Price</label>
              <input name="sellingPrice" type="number" value={form.sellingPrice} onChange={handleInputChange} placeholder="₹" style={{fontWeight:'bold'}} />
              {getPriceWarning()}
          </div>
          
          <div>
            <label>GST %</label>
            <select name="gst" value={form.gst} onChange={handleInputChange} style={{borderColor: 'var(--primary)'}}>
                <option value="0">0%</option>
                <option value="5">5%</option>
                <option value="12">12%</option>
                <option value="18">18%</option>
                <option value="28">28%</option>
            </select>
          </div>

          <div><label>Cost Price</label><input name="costPrice" type="number" value={form.costPrice} onChange={handleInputChange} placeholder="₹" /></div>

          {/* Packing Section */}
          <div style={{background:'#fff7ed', padding:'5px', border:'1px solid orange', borderRadius:'4px'}}>
             <label style={{color:'#c2410c', fontSize:'0.8rem'}}>Packing (Tabs/Strip)</label>
             <input name="packSize" type="number" value={form.packSize} onChange={handleInputChange} placeholder="10" style={{fontWeight:'bold'}} />
          </div>

          <div style={{background:'#f0fdf4', padding:'5px', border:'1px solid green', borderRadius:'4px'}}>
             <label style={{color:'#15803d', fontSize:'0.8rem'}}>Total Strips (Qty)</label>
             <input name="quantity" type="number" value={form.quantity} onChange={handleInputChange} placeholder="Strips" style={{fontWeight:'bold'}} />
          </div>
          
          {/* Max Discount Limit */}
          <div>
              <label>Max Disc Limit %</label>
              <input name="maxDiscount" type="number" value={form.maxDiscount} onChange={handleInputChange} placeholder="e.g. 10" />
          </div>

          <div><label>Expiry Date</label><input name="expiryDate" type="date" value={form.expiryDate} onChange={handleInputChange} /></div>
          
          {/* Manual Bill Upload Option */}
          <div>
              <label>Upload Bill Image</label>
              <input type="file" onChange={handleFileChange} style={{padding: '7px', border:'1px solid #ccc', borderRadius:'4px', width:'100%'}} />
          </div>

          <div style={{display:'flex', alignItems:'end'}}>
             <button className="btn btn-primary w-full" onClick={handleAdd} style={{height:'42px'}}>+ Add Stock</button>
          </div>
        </div>
      </div>

      <div className="card">
         <InventoryTable meds={meds} onUpdate={handleUpdate} onDelete={handleDelete} />  
      </div>
    </div>
  );
};

export default Dashboard;