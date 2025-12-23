import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import ExpiryAlert from '../components/ExpiryAlert';
import InventoryTable from '../components/InventoryTable';
import '../App.css';

const Dashboard = () => {
  const [meds, setMeds] = useState([]);
  
  // Added 'gst' to state
  const [form, setForm] = useState({ 
    productName: '', batchNumber: '', quantity: '', 
    mrp: '', sellingPrice: '', costPrice: '', expiryDate: '',
    maxDiscount: '', hsnCode: '', billFile: null,
    partyName: '', purchaseDate: '', gst: '0' // <--- DEFAULT 0
  });

  const fetchMeds = () => { api.get('/medicines').then(res => setMeds(res.data)); };
  useEffect(() => { fetchMeds(); }, []);

  const handleFileChange = (e) => setForm({ ...form, billFile: e.target.files[0] });

  const handleAdd = async () => {
    if (!form.productName || !form.batchNumber) return alert("Please fill details");
    
    const formData = new FormData();
    Object.keys(form).forEach(key => {
        if(key === 'billFile' && form.billFile) formData.append('billImage', form.billFile);
        else formData.append(key, form[key]);
    });

    try {
      await api.post('/medicines', formData);
      alert('Stock Added Successfully!');
      // Reset Form
      setForm({ 
        productName: '', batchNumber: '', quantity: '', mrp: '', 
        sellingPrice: '', costPrice: '', expiryDate: '', 
        maxDiscount: '', hsnCode: '', billFile: null,
        partyName: '', purchaseDate: '', gst: '0' 
      }); 
      fetchMeds();
    } catch (error) { alert("Error adding stock"); }
  };

  const handleUpdate = async (id, updatedData) => {
    try { await api.put(`/medicines/${id}`, updatedData); alert("Updated Successfully!"); fetchMeds(); } 
    catch (err) { alert("Update Failed"); }
  };

  return (
    <div>
      <ExpiryAlert />
      
      <div className="card">
        <div className="flex justify-between items-center" style={{marginBottom: '20px'}}>
            <h3>📦 Inventory Management</h3>
            <button className="btn btn-primary" onClick={handleAdd}>+ Add New Stock</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
          {/* Row 1: Basic Info */}
          <div><label>Product Name</label><input value={form.productName} onChange={e => setForm({ ...form, productName: e.target.value })} placeholder="e.g. Dolo 650" /></div>
          <div><label>Batch No.</label><input value={form.batchNumber} onChange={e => setForm({ ...form, batchNumber: e.target.value })} placeholder="BTS-123" /></div>
          <div><label>HSN Code</label><input value={form.hsnCode} onChange={e => setForm({ ...form, hsnCode: e.target.value })} placeholder="3004" /></div>
          
          {/* Row 2: Supplier Info */}
          <div><label>Party Name</label><input value={form.partyName} onChange={e => setForm({ ...form, partyName: e.target.value })} placeholder="Supplier Name" /></div>
          <div><label>Purchase Date</label><input type="date" value={form.purchaseDate} onChange={e => setForm({ ...form, purchaseDate: e.target.value })} /></div>
          
          {/* Row 3: Pricing & Tax */}
          <div><label>MRP</label><input type="number" value={form.mrp} onChange={e => setForm({ ...form, mrp: e.target.value })} placeholder="₹" /></div>
          <div><label>Selling Price</label><input type="number" value={form.sellingPrice} onChange={e => setForm({ ...form, sellingPrice: e.target.value })} placeholder="₹" /></div>
          
          {/* --- NEW GST SECTION --- */}
          <div>
            <label>GST %</label>
            <select value={form.gst} onChange={e => setForm({ ...form, gst: e.target.value })} style={{borderColor: 'var(--primary)'}}>
                <option value="0">0% (Nil)</option>
                <option value="5">5%</option>
                <option value="12">12%</option>
                <option value="18">18%</option>
                <option value="28">28%</option>
            </select>
          </div>
          {/* ----------------------- */}

          <div><label>Cost Price</label><input type="number" value={form.costPrice} onChange={e => setForm({ ...form, costPrice: e.target.value })} placeholder="₹" /></div>
          <div><label>Qty</label><input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} placeholder="0" /></div>
          
          <div><label>Max Disc %</label><input type="number" value={form.maxDiscount} onChange={e => setForm({ ...form, maxDiscount: e.target.value })} /></div>
          <div><label>Expiry Date</label><input type="date" value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} /></div>
          <div><label>Bill Image</label><input type="file" onChange={handleFileChange} style={{padding: '7px'}} /></div>
        </div>
      </div>

      <div className="card">
         <InventoryTable meds={meds} onUpdate={handleUpdate} />  
      </div>
    </div>
  );
};

export default Dashboard;