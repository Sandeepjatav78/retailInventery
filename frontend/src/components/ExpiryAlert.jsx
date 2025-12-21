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
    <div style={{ padding: '15px', background: '#fff3cd', border: '1px solid #ffeeba', borderRadius: '5px', marginBottom: '20px' }}>
      <h3 style={{ color: '#856404', margin: '0 0 10px 0' }}>⚠️ Expiry Alerts (Next 30 Days)</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {expiring.map(m => (
          <li key={m._id} style={{ color: '#856404', padding: '5px 0', borderBottom: '1px solid #faeCC8' }}>
            <strong>{m.productName}</strong> (Batch: {m.batchNumber}) - Expires: {new Date(m.expiryDate).toDateString()}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ExpiryAlert;