import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import '../App.css'; 

const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  const isActive = (path) => location.pathname === path ? 'active-nav' : '';

  const handleLogout = () => {
    if(window.confirm("Are you sure you want to Logout?")) {
        localStorage.removeItem('token'); // Token delete
        localStorage.removeItem('user');  // User data delete
        navigate('/login'); // Redirect to Login
    }
  };

  return (
    <nav className="navbar">
      {/* --- LOGO --- */}
      <div className="nav-logo">
        Radhe Pharmacy
      </div>

      {/* --- LINKS --- */}
      <ul className="nav-menu">
        <li>
            <Link to="/" className={`nav-link ${isActive('/')}`}>
               📦 Inventory
            </Link>
        </li>
        <li>
            <Link to="/sales" className={`nav-link ${isActive('/sales')}`}>
               💰 New Sale
            </Link>
        </li>
        
        {/* DOSE BUTTON */}
        <li>
            <Link to="/dose" className={`nav-link ${isActive('/dose')}`} style={{color: '#fbbf24', borderBottom: isActive('/dose') ? '3px solid #fbbf24' : 'none'}}>
               💊 Quick Dose
            </Link>
        </li>

        {/* REPORT BUTTON (Added Back) */}
        <li>
            <Link to="/reports" className={`nav-link ${isActive('/reports')}`}>
               📊 Reports
            </Link>
        </li>
      </ul>

      {/* --- RIGHT SIDE (USER & LOGOUT) --- */}
      <div className="nav-right">
         <span className="user-badge">👨‍⚕️ Admin</span>
         <button onClick={handleLogout} className="btn-logout">
            Logout ➔
         </button>
      </div>
    </nav>
  );
};

export default Navbar;