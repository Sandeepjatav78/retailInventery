import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar'; 
import Dashboard from './pages/Dashboard';
import SaleForm from './components/SaleForm';
import DosePage from './pages/DosePage';
import DailyReport from './pages/DailyReport';
import Login from './pages/Login'; // <--- Import Login
import PrivateRoute from './components/PrivateRoute'; // <--- Import Guard

function App() {
  return (
    <Router>
      <Routes>
        
        {/* --- PUBLIC ROUTE (Login) --- */}
        <Route path="/login" element={<Login />} />

        {/* --- PROTECTED ROUTES (Requires Login) --- */}
        <Route path="*" element={
          <PrivateRoute>
            <div className="app-container">
              <Navbar />
              <div className="main-content">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/sales" element={<SaleForm />} />
                  <Route path="/dose" element={<DosePage />} />
                  <Route path="/reports" element={<DailyReport />} />
                </Routes>
              </div>
            </div>
          </PrivateRoute>
        } />

      </Routes>
    </Router>
  );
}

export default App;