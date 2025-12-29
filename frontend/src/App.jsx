import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar'; 
import Sidebar from './components/Sidebar'; // Assuming you use Sidebar
import Dashboard from './pages/Dashboard';
import SaleForm from './components/SaleForm';
import DosePage from './pages/DosePage';
import DailyReport from './pages/DailyReport';
import ManualBill from './pages/ManualBill'; // <--- IMPORT THIS
import Login from './pages/Login'; 
import PrivateRoute from './components/PrivateRoute'; 

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="*" element={
          <PrivateRoute>
            <div className="app-container">
              <Sidebar /> {/* Or Navbar depending on what you use */}
              <div className="main-content">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/sales" element={<SaleForm />} />
                  <Route path="/dose" element={<DosePage />} />
                  <Route path="/manual" element={<ManualBill />} /> {/* <--- ADD ROUTE */}
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