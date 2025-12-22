import React, { useState } from 'react';
import api from '../api/axios';
import { useNavigate } from 'react-router-dom';

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
        // Save token to Local Storage
        localStorage.setItem('token', res.data.token);
        // Redirect to Dashboard
        navigate('/'); 
      } else {
        setError('Invalid Username or Password');
      }
    } catch (err) {
      setError('Server Error or Network Issue');
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={{textAlign:'center', color:'#333'}}>🏥 Radhe Pharmacy</h2>
        <h4 style={{textAlign:'center', color:'#555', marginBottom:'20px'}}>Admin Login</h4>
        
        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleLogin}>
          <div style={{marginBottom:'15px'}}>
            <label>Username</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={styles.input}
              placeholder="Enter username"
            />
          </div>
          
          <div style={{marginBottom:'20px'}}>
            <label>Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              placeholder="Enter password"
            />
          </div>

          <button type="submit" style={styles.button}>Login</button>
        </form>
      </div>
    </div>
  );
};

const styles = {
  container: { height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f0f2f5' },
  card: { width: '350px', padding: '30px', background: 'white', borderRadius: '8px', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' },
  input: { width: '100%', padding: '10px', marginTop: '5px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' },
  button: { width: '100%', padding: '12px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px' },
  error: { background: '#ffdddd', color: 'red', padding: '10px', borderRadius: '4px', marginBottom: '15px', textAlign: 'center' }
};

export default Login;