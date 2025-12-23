import React, { useState, useEffect } from 'react';
import api from '../api/axios';

const ExpiryAlert = () => {
  const [expiring, setExpiring] = useState([]);

  useEffect(() => {
    api.get('/medicines/expiring')
      .then(res => setExpiring(res.data))
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
         <span>⚠️</span> Expiry Alerts (Next 30 Days)
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
            <strong>{m.productName}</strong> <span style={{opacity: 0.8}}>(Batch: {m.batchNumber})</span>
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