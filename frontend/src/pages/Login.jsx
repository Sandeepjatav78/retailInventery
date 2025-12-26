import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import '../App.css';

const Login = () => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false); // <--- New State for Eye
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/admin/verify', { password });
      
      if (res.data.success) {
        localStorage.setItem('token', 'admin-logged-in'); 
        navigate('/'); 
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
      <div className="card" style={{width: '380px', padding: '40px', textAlign: 'center', borderRadius:'12px', boxShadow:'0 10px 25px rgba(0,0,0,0.5)'}}>
        <h2 style={{color: '#0f766e', marginBottom:'10px', fontWeight:'800'}}>Radhe Pharmacy</h2>
        <p className="text-muted" style={{marginBottom:'30px'}}>Admin Login</p>
        
        <form onSubmit={handleLogin}>
          
          {/* PASSWORD INPUT CONTAINER */}
          <div style={{position: 'relative', marginBottom: '20px'}}>
            <input 
              type={showPassword ? "text" : "password"} // <--- Toggle Type
              placeholder="Enter Admin Password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              style={{
                width: '100%', padding: '15px', paddingRight: '45px', borderRadius: '8px', 
                border: '1px solid #ccc', fontSize: '1.1rem', outline: 'none'
              }}
              autoFocus
            />
            
            {/* EYE ICON BUTTON */}
            <span 
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '15px',
                top: '50%',
                transform: 'translateY(-50%)',
                cursor: 'pointer',
                color: '#666',
                fontSize: '1.2rem',
                userSelect: 'none'
              }}
              title={showPassword ? "Hide Password" : "Show Password"}
            >
              {showPassword ? (
                // Open Eye Icon (SVG)
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              ) : (
                // Closed Eye Icon (SVG)
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
              )}
            </span>
          </div>
          
          {error && <div style={{color:'#ef4444', marginBottom:'15px', fontWeight:'bold', background:'#fee2e2', padding:'8px', borderRadius:'4px'}}>{error}</div>}

          <button className="btn btn-primary" style={{width: '100%', padding: '15px', fontSize: '1.2rem', fontWeight:'bold'}}>
            Login ➔
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;