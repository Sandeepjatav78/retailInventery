import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import '../App.css'; 

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  const isActive = (path) => location.pathname === path ? 'active-link' : '';

  const handleLogout = () => {
    if(window.confirm("Are you sure you want to logout?")) {
        localStorage.removeItem('token'); // Clear Auth Token
        localStorage.removeItem('draft_sale'); // Clear Drafts (Optional)
        navigate('/login'); // Redirect
    }
  };

  return (
    <div className="sidebar">
      {/* --- LEFT: LOGO --- */}
      <div className="logo-container">
        <h2 className="logo-text">Radhe Pharmacy 🌿</h2>
      </div>

      {/* --- CENTER: MENU ITEMS --- */}
      <ul className="menu-list">
        <li>
            <Link to="/" className={`menu-link ${isActive('/')}`}>
               📦 Inventory
            </Link>
        </li>
        <li>
            <Link to="/sales" className={`menu-link ${isActive('/sales')}`}>
               💰 New Sale
            </Link>
        </li>
        <li>
            <Link to="/manual" className={`menu-link ${isActive('/manual')}`}>
               📝 Custom Bill
            </Link>
        </li>
        <li>
            <Link to="/dose" className={`menu-link ${isActive('/dose')}`}>
               💊 Quick Dose
            </Link>
        </li>
        <li>
            <Link to="/reports" className={`menu-link ${isActive('/reports')}`}>
               📊 Reports
            </Link>
        </li>
      </ul>

      {/* --- RIGHT: LOGOUT --- */}
      <div className="sidebar-footer" style={{display:'flex', alignItems:'center', gap:'15px'}}>
        <span style={{fontSize:'0.8rem', color:'#94a3b8'}}>v1.0</span>
        <button 
            onClick={handleLogout} 
            className="btn-danger"
            style={{padding:'6px 12px', fontSize:'0.8rem', borderRadius:'4px'}}
        >
            Logout ➜
        </button>
      </div>
    </div>
  );
};

export default Sidebar;