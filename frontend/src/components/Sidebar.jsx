import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Get User Role
  const userRole = localStorage.getItem('userRole'); // 'admin' or 'staff'

  const handleLogout = () => {
    if(window.confirm("Are you sure you want to Logout?")) {
        localStorage.clear();
        navigate('/login'); 
    }
  };

  // Helper for Link Classes
  const getLinkClass = (path) => {
      const isActive = location.pathname === path;
      
      const baseClass = "flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 whitespace-nowrap";
      const activeClass = "bg-teal-50 text-teal-700 shadow-sm border border-teal-100 transform scale-105";
      const inactiveClass = "text-gray-500 hover:bg-gray-50 hover:text-teal-600";
      
      return isActive ? `${baseClass} ${activeClass}` : `${baseClass} ${inactiveClass}`;
  };

  return (
    <div className="w-full h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6 shadow-sm sticky top-0 z-50">
      
      {/* --- LEFT: LOGO & ROLE --- */}
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-extrabold text-teal-800 tracking-tight flex items-center gap-2">
            🌿 <span className="hidden md:inline">Radhe Pharmacy</span>
        </h2>
        {/* Role Badge */}
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border tracking-wide ${userRole === 'admin' ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
            {userRole === 'admin' ? 'Admin' : 'Staff'}
        </span>
      </div>

      {/* --- CENTER: LINKS (Scrollable on Mobile) --- */}
      <div className="flex-1 flex items-center justify-center overflow-x-auto no-scrollbar mx-4">
        <ul className="flex items-center gap-1">
            
            {/* Admin Only Link */}
            {userRole === 'admin' && (
                <li>
                    <Link to="/" className={getLinkClass('/')}>📦 Inventory</Link>
                </li>
            )}

            {/* Staff & Admin Links */}
            <li>
                <Link to="/sales" className={getLinkClass('/sales')}>💰 Sale</Link>
            </li>
            <li>
                <Link to="/manual" className={getLinkClass('/manual')}>📝 Bill</Link>
            </li>
            <li>
                <Link to="/dose" className={getLinkClass('/dose')}>💊 Dose</Link>
            </li>
            <li>
                <Link to="/reports" className={getLinkClass('/reports')}>📊 Reports</Link>
            </li>
        </ul>
      </div>

      {/* --- RIGHT: LOGOUT --- */}
      <div>
        <button 
            onClick={handleLogout} 
            className="flex items-center gap-2 text-red-500 hover:text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors text-sm font-bold"
            title="Logout"
        >
            <span className="hidden md:inline">Logout</span> ➔
        </button>
      </div>

    </div>
  );
};

export default Sidebar;