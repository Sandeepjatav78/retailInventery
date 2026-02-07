import React, { useState, useEffect } from 'react';
import api from '../api/axios';

const ExpiryAlert = () => {
  const [expiring, setExpiring] = useState([]);

  useEffect(() => {
    // Request 90 days (approx 3 months)
    api.get('/medicines/expiring?days=90') 
      .then(res => {
        // ✅ FILTER ADDED HERE: 
        // Only keep items where quantity is greater than 0
        const inStockExpiring = res.data.filter(item => item.quantity > 0);
        setExpiring(inStockExpiring);
      })
      .catch(err => console.error("Expiry fetch error", err));
  }, []);

  if (expiring.length === 0) return null;

  return (
    <div style={{ 
        background: '#fff7ed', 
        border: '1px solid #ffedd5', 
        borderRadius: '8px', 
        padding: '16px', 
        marginBottom: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
    }}>
      <div style={{display:'flex', alignItems:'center', gap:'10px', color: '#9a3412', fontWeight:'700'}}>
          <span>⚠️</span> Expiry Alerts (Next 3 Months)
      </div>
      
      <div style={{display: 'flex', flexWrap: 'wrap', gap: '10px'}}>
        {expiring.map(m => (
          <div key={m._id} style={{
              background: 'white', 
              padding: '6px 12px', 
              borderRadius: '20px', 
              fontSize: '0.9rem', 
              border: '1px solid #fed7aa',
              color: '#9a3412'
          }}>
            <strong>{m.productName}</strong> 
            <span style={{opacity: 0.8, marginLeft: '4px'}}>(Batch: {m.batchNumber})</span>
            
            {/* Optional: Show Qty to confirm */}
            <span style={{marginLeft: '5px', fontSize: '0.8em', color: '#ea580c'}}>
               [Qty: {m.quantity}]
            </span>

            <span style={{marginLeft: '5px', fontWeight: 'bold'}}>
                Expires: {new Date(m.expiryDate).toLocaleDateString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExpiryAlert;