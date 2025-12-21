import React from 'react';

const Navbar = ({ setView, currentView }) => {
  return (
    <nav style={{ marginBottom: '20px', padding: '10px', background: '#f8f9fa', borderRadius: '8px' }}>
      <button 
        onClick={() => setView('pos')} 
        className={currentView === 'pos' ? 'active' : ''}
        style={btnStyle(currentView === 'pos')}
      >
        Point of Sale
      </button>
      <button 
        onClick={() => setView('inventory')} 
        className={currentView === 'inventory' ? 'active' : ''}
        style={btnStyle(currentView === 'inventory')}
      >
        Inventory (Dashboard)
      </button>
      <button 
        onClick={() => setView('reports')} 
        className={currentView === 'reports' ? 'active' : ''}
        style={btnStyle(currentView === 'reports')}
      >
        Daily Reports
      </button>
    </nav>
  );
};

// Simple helper for button styles
const btnStyle = (isActive) => ({
  marginRight: '10px',
  padding: '10px 20px',
  border: isActive ? '2px solid #007bff' : '1px solid #ccc',
  background: isActive ? '#007bff' : 'white',
  color: isActive ? 'white' : 'black',
  cursor: 'pointer',
  borderRadius: '5px'
});

export default Navbar;