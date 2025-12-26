import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import '../App.css'; // Styling ke liye

const Sidebar = () => {
  const location = useLocation();
  
  // Helper function to check active menu
  const isActive = (path) => location.pathname === path ? 'active-link' : '';

  return (
    <div className="sidebar">
      {/* --- LOGO AREA --- */}
      <div className="logo-container">
        <h2 className="logo-text">Radhe<br/>Pharmacy</h2>
      </div>

      {/* --- MENU ITEMS --- */}
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
        
        {/* --- NEW DOSE BUTTON --- */}
        <li>
            <Link to="/dose" className={`menu-link ${isActive('/dose')}`} style={{borderLeft: '4px solid #d97706'}}>
               💊 Quick Dose
            </Link>
        </li>
        {/* ----------------------- */}

        {/* Placeholder for Reports if you add it later */}
        <li>
            <Link to="/reports" className={`menu-link ${isActive('/reports')}`}>
               📊 Reports (Coming)
            </Link>
        </li>
      </ul>

      {/* --- FOOTER --- */}
      <div className="sidebar-footer">
        <div style={{fontSize:'0.8rem', color:'#94a3b8'}}>v1.0.0</div>
        <div style={{fontSize:'0.7rem', color:'#64748b'}}>Powered by MERN</div>
      </div>
    </div>
  );
};

export default Sidebar;