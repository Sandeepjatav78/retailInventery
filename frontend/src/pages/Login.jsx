import React, { useState } from 'react';
import api from '../api/axios';
import { useNavigate } from 'react-router-dom';
import '../App.css'; // Import Styles

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/admin/login', { username, password });
      if (res.data.success) {
        localStorage.setItem('token', res.data.token);
        navigate('/'); 
      } else {
        setError('Invalid Username or Password');
      }
    } catch (err) {
      setError('Server Error or Network Issue');
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{textAlign: 'center', marginBottom: '30px'}}>
          <h1 style={{color: 'var(--primary)', fontSize: '2rem'}}>🏥</h1>
          <h2>Radhe Pharmacy</h2>
          <p className="text-muted">Management System Login</p>
        </div>
        
        {error && <div style={{background: '#fee2e2', color: '#b91c1c', padding: '10px', borderRadius: '6px', marginBottom: '20px', fontSize: '0.9rem', textAlign: 'center'}}>{error}</div>}

        <form onSubmit={handleLogin} className="flex-col gap-4">
          <div>
            <label>Username</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
            />
          </div>
          
          <div>
            <label>Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
            />
          </div>

          <button type="submit" className="btn btn-primary w-full" style={{marginTop: '10px', padding: '12px'}}>
            Sign In to Dashboard
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;