import React, { useState } from 'react';
import Navbar from './components/Navbar';
import SaleForm from './components/SaleForm'; // POS
import Dashboard from './pages/Dashboard';    // Inventory
import DailyReport from './pages/DailyReport'; // Reports
import './App.css';

function App() {
  const [view, setView] = useState('pos');

  return (
    <div className="app-container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <h1>🏥 Radhe Pharmacy Management</h1>
      
      {/* Pass the setView function to Navbar so buttons work */}
      <Navbar currentView={view} setView={setView} />

      <div className="content-area">
        {view === 'pos' && <SaleForm />}
        {view === 'inventory' && <Dashboard />}
        {view === 'reports' && <DailyReport />}
      </div>
    </div>
  );
}

export default App;