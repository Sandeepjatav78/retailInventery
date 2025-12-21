import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import ExpiryAlert from '../components/ExpiryAlert';
import InventoryTable from '../components/InventoryTable';

const Dashboard = () => {
  const [meds, setMeds] = useState([]);
  
  // Added 'hsnCode' to state
  const [form, setForm] = useState({ 
    productName: '', batchNumber: '', quantity: '', 
    mrp: '', sellingPrice: '', costPrice: '', expiryDate: '',
    maxDiscount: '', hsnCode: '', billFile: null 
  });

  const fetchMeds = () => {
    api.get('/medicines').then(res => setMeds(res.data));
  };

  useEffect(() => { fetchMeds(); }, []);

  const handleFileChange = (e) => {
    setForm({ ...form, billFile: e.target.files[0] });
  };

  const handleAdd = async () => {
    if (!form.productName || !form.batchNumber) return alert("Please fill details");

    const formData = new FormData();
    formData.append('productName', form.productName);
    formData.append('batchNumber', form.batchNumber);
    formData.append('quantity', form.quantity);
    formData.append('mrp', form.mrp);
    formData.append('sellingPrice', form.sellingPrice);
    formData.append('costPrice', form.costPrice);
    formData.append('expiryDate', form.expiryDate);
    formData.append('maxDiscount', form.maxDiscount);
    formData.append('hsnCode', form.hsnCode); // <--- SEND HSN
    if (form.billFile) {
        formData.append('billImage', form.billFile);
    }

    try {
      await api.post('/medicines', formData);
      alert('Stock Added Successfully!');
      // Reset Form
      setForm({ 
        productName: '', batchNumber: '', quantity: '', mrp: '', 
        sellingPrice: '', costPrice: '', expiryDate: '', maxDiscount: '', hsnCode: '', billFile: null 
      }); 
      fetchMeds();
    } catch (error) {
      console.error(error);
      alert("Error adding stock");
    }
  };

  const handleUpdate = async (id, updatedData) => {
    try {
      await api.put(`/medicines/${id}`, updatedData);
      alert("Updated Successfully!");
      fetchMeds();
    } catch (err) { alert("Update Failed"); }
  };

  return (
    <div>
      <ExpiryAlert />
      
      <div className="section" style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '8px', marginBottom: '20px' }}>
        <h2>Add New Stock</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '10px' }}>
          <input placeholder="Name" value={form.productName} onChange={e => setForm({ ...form, productName: e.target.value })} />
          <input placeholder="Batch" value={form.batchNumber} onChange={e => setForm({ ...form, batchNumber: e.target.value })} />
          
          {/* --- HSN INPUT ADDED HERE --- */}
          <input placeholder="HSN Code" value={form.hsnCode} onChange={e => setForm({ ...form, hsnCode: e.target.value })} />
          {/* ---------------------------- */}

          <input placeholder="Qty" type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} />
          
          <input placeholder="MRP" type="number" value={form.mrp} onChange={e => setForm({ ...form, mrp: e.target.value })} />
          <input placeholder="Selling Price" type="number" value={form.sellingPrice} onChange={e => setForm({ ...form, sellingPrice: e.target.value })} />
          <input placeholder="Cost Price" type="number" value={form.costPrice} onChange={e => setForm({ ...form, costPrice: e.target.value })} />
          
          <input placeholder="Max Discount %" type="number" value={form.maxDiscount} onChange={e => setForm({ ...form, maxDiscount: e.target.value })} style={{border: '1px solid orange'}} />
          
          <div style={{display:'flex', flexDirection:'column'}}>
            <label style={{fontSize:'12px'}}>Upload Bill</label>
            <input type="file" onChange={handleFileChange} style={{padding:'5px'}} />
          </div>

          <input type="date" value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} />
        </div>
        <button onClick={handleAdd} style={{ padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', cursor: 'pointer' }}>
            Add to Inventory
        </button>
      </div>

      <h3>Current Stock</h3>
      <InventoryTable meds={meds} onUpdate={handleUpdate} />  
    </div>
  );
};

export default Dashboard;