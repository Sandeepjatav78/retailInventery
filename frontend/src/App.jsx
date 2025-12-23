import React from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import SaleForm from './components/SaleForm';
import DailyReport from './pages/DailyReport';
import Login from './pages/Login';
import PrivateRoute from './components/PrivateRoute';
import './App.css';

const LogoutButton = () => {
  const navigate = useNavigate();
  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };
  return <button onClick={handleLogout} className="btn btn-danger" style={{fontSize: '0.8rem'}}>Logout</button>;
};

const Navigation = () => (
  <nav className="navbar">
    <div className="logo">🏥 Radhe Pharmacy</div>
    <div className="nav-links flex items-center">
      <NavLink to="/" end className={({ isActive }) => isActive ? "active" : ""}>Inventory</NavLink>
      <NavLink to="/sales" className={({ isActive }) => isActive ? "active" : ""}>New Sale</NavLink>
      <NavLink to="/report" className={({ isActive }) => isActive ? "active" : ""}>Reports</NavLink>
      <div style={{width: '1px', height: '20px', background: '#e5e7eb', margin: '0 10px'}}></div>
      <LogoutButton />
    </div>
  </nav>
);

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Protected Routes have the Navigation Bar */}
        <Route element={<PrivateRoute />}>
          <Route path="/" element={<><Navigation /><div className="container"><Dashboard /></div></>} />
          <Route path="/sales" element={<><Navigation /><div className="container"><SaleForm /></div></>} />
          <Route path="/report" element={<><Navigation /><div className="container"><DailyReport /></div></>} />
        </Route>
      </Routes>
    </Router>
  );
};

export default App;