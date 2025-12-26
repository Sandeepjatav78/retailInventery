import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import '../App.css';

const Login = () => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      // Hum wahi API use karenge jo aapne admin verify ke liye banayi thi
      const res = await api.post('/admin/verify', { password });
      
      if (res.data.success) {
        localStorage.setItem('token', 'admin-logged-in'); // Token Save
        navigate('/'); // Go to Dashboard
      } else {
        setError('❌ Wrong Password');
      }
    } catch (err) {
      setError('Server Error. Try again.');
    }
  };

  return (
    <div style={{
      height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', 
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'
    }}>
      <div className="card" style={{width: '350px', padding: '40px', textAlign: 'center'}}>
        <h2 style={{color: '#0f766e', marginBottom:'10px'}}>Radhe Pharmacy</h2>
        <p className="text-muted" style={{marginBottom:'30px'}}>Please login to continue</p>
        
        <form onSubmit={handleLogin}>
          <input 
            type="password" 
            placeholder="Enter Admin Password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            style={{
              width: '100%', padding: '15px', borderRadius: '8px', 
              border: '1px solid #ccc', fontSize: '1.1rem', marginBottom: '20px'
            }}
            autoFocus
          />
          
          {error && <div style={{color:'red', marginBottom:'15px'}}>{error}</div>}

          <button className="btn btn-primary" style={{width: '100%', padding: '15px', fontSize: '1.2rem'}}>
            Login ➔
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;