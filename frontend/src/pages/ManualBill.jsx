import React, { useState } from 'react';
import { generateBillHTML } from '../utils/BillGenerator';
import '../App.css'; 

const ManualBill = () => {
  // --- STATE ---
  const [customer, setCustomer] = useState({ name: '', phone: '', doctor: '', mode: 'Cash' });
  const [invoiceNo, setInvoiceNo] = useState(`MAN-${Math.floor(Date.now() / 1000)}`);
  
  // Current Item Input State
  const [currentItem, setCurrentItem] = useState({
    name: '',
    batch: '',
    expiry: '',
    mrp: '',
    price: '',
    quantity: 1
  });

  const [cart, setCart] = useState([]);

  // --- HANDLERS ---
  const handleAddItem = () => {
    if (!currentItem.name || !currentItem.price || !currentItem.quantity) {
      alert("Please fill Name, Price and Quantity");
      return;
    }

    const newItem = {
      ...currentItem,
      total: parseFloat(currentItem.price) * parseFloat(currentItem.quantity),
      // Add defaults for fields required by BillGenerator
      hsn: '-', 
      gst: 0,
      medicineId: 'MANUAL',
      packSize: '1'
    };

    setCart([...cart, newItem]);
    
    // Reset item inputs
    setCurrentItem({ name: '', batch: '', expiry: '', mrp: '', price: '', quantity: 1 });
  };

  const removeItem = (index) => {
    const newCart = [...cart];
    newCart.splice(index, 1);
    setCart(newCart);
  };

  const handleGenerateBill = async () => {
    if (cart.length === 0) return alert("Add items first!");
    if (!customer.name) return alert("Customer Name is required!");

    const invData = {
        no: invoiceNo,
        name: customer.name,
        phone: customer.phone,
        doctor: customer.doctor,
        mode: customer.mode
    };

    const billHTML = await generateBillHTML(cart, invData);
    
    const billWindow = window.open('', '', 'width=900,height=900');
    if (billWindow) {
        billWindow.document.write(billHTML);
        billWindow.document.close();
    } else {
        alert("Popup blocked!");
    }
    
    // Optional: Generate new invoice number after print
    setInvoiceNo(`MAN-${Math.floor(Date.now() / 1000)}`);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', minHeight: '85vh' }}>
      
      {/* --- LEFT: INPUT FORM --- */}
      <div className="card flex-col">
        <h3>📝 Create Custom Bill</h3>
        
        {/* CUSTOMER SECTION */}
        <div style={{background:'#f8fafc', padding:'15px', borderRadius:'8px', marginBottom:'20px', border:'1px solid #e2e8f0'}}>
            <h4 style={{marginTop:0, color:'var(--primary)'}}>1. Customer Details</h4>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px'}}>
                <input placeholder="Patient Name *" value={customer.name} onChange={e=>setCustomer({...customer, name:e.target.value})} style={inputStyle} />
                <input placeholder="Phone No" value={customer.phone} onChange={e=>setCustomer({...customer, phone:e.target.value})} style={inputStyle} />
                <input placeholder="Doctor Name" value={customer.doctor} onChange={e=>setCustomer({...customer, doctor:e.target.value})} style={inputStyle} />
                <select value={customer.mode} onChange={e=>setCustomer({...customer, mode:e.target.value})} style={inputStyle}>
                    <option value="Cash">Cash</option>
                    <option value="Online">Online</option>
                </select>
            </div>
        </div>

        {/* ITEM SECTION */}
        <div style={{background:'#f0fdfa', padding:'15px', borderRadius:'8px', border:'1px solid #ccfbf1'}}>
            <h4 style={{marginTop:0, color:'var(--primary)'}}>2. Add Medicine / Item</h4>
            <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
                <input placeholder="Item Name *" value={currentItem.name} onChange={e=>setCurrentItem({...currentItem, name:e.target.value})} style={inputStyle} />
                
                <div style={{display:'flex', gap:'10px'}}>
                    <input placeholder="Batch" value={currentItem.batch} onChange={e=>setCurrentItem({...currentItem, batch:e.target.value})} style={inputStyle} />
                    <input type="date" placeholder="Expiry" value={currentItem.expiry} onChange={e=>setCurrentItem({...currentItem, expiry:e.target.value})} style={inputStyle} />
                </div>

                <div style={{display:'flex', gap:'10px'}}>
                    <input type="number" placeholder="MRP" value={currentItem.mrp} onChange={e=>setCurrentItem({...currentItem, mrp:e.target.value})} style={inputStyle} />
                    <input type="number" placeholder="Selling Price *" value={currentItem.price} onChange={e=>setCurrentItem({...currentItem, price:e.target.value})} style={inputStyle} />
                    <input type="number" placeholder="Qty *" value={currentItem.quantity} onChange={e=>setCurrentItem({...currentItem, quantity:e.target.value})} style={inputStyle} />
                </div>

                <button onClick={handleAddItem} className="btn btn-primary" style={{marginTop:'10px'}}>+ Add to Bill</button>
            </div>
        </div>
      </div>

      {/* --- RIGHT: PREVIEW & PRINT --- */}
      <div className="card flex-col" style={{justifyContent:'space-between'}}>
        <div>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'2px solid #eee', paddingBottom:'10px', marginBottom:'10px'}}>
                <h3 style={{margin:0}}>Bill Preview</h3>
                <div style={{fontSize:'0.9rem', background:'#e2e8f0', padding:'5px 10px', borderRadius:'4px'}}><b>{invoiceNo}</b></div>
            </div>

            <div className="table-container">
                <table style={{fontSize:'0.9rem'}}>
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Batch</th>
                            <th>Qty</th>
                            <th>Price</th>
                            <th>Total</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {cart.map((item, i) => (
                            <tr key={i}>
                                <td>{item.name}</td>
                                <td>{item.batch}</td>
                                <td>{item.quantity}</td>
                                <td>{item.price}</td>
                                <td>{item.total.toFixed(2)}</td>
                                <td><button onClick={()=>removeItem(i)} style={{color:'red', border:'none', background:'none', cursor:'pointer'}}>×</button></td>
                            </tr>
                        ))}
                        {cart.length === 0 && <tr><td colSpan="6" style={{textAlign:'center', padding:'20px', color:'#999'}}>No items added</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>

        <div style={{marginTop:'20px', borderTop:'2px solid #eee', paddingTop:'20px'}}>
            <div style={{display:'flex', justifyContent:'space-between', fontSize:'1.5rem', fontWeight:'bold', marginBottom:'15px'}}>
                <span>Total:</span>
                <span style={{color:'var(--success)'}}>₹{cart.reduce((a,b)=>a+b.total,0).toFixed(2)}</span>
            </div>
            <button onClick={handleGenerateBill} className="btn btn-success" style={{width:'100%', padding:'15px', fontSize:'1.1rem'}}>🖨️ Generate & Print Bill</button>
        </div>
      </div>

    </div>
  );
};

const inputStyle = { padding: '10px', border: '1px solid #ccc', borderRadius: '5px', width: '100%' };

export default ManualBill;