import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar'; 
// import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import SaleForm from './components/SaleForm';
import DosePage from './pages/DosePage';
import DailyReport from './pages/DailyReport';
import ManualBill from './pages/ManualBill'; 
import PriceChecker from './components/PriceChecker'; // <--- 1. IMPORT THIS
import Login from './pages/Login'; 
import PrivateRoute from './components/PrivateRoute'; 

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="*" element={
          <PrivateRoute>
            <div className="min-h-screen bg-slate-100 flex flex-col">
              <Sidebar />
              <main className="flex-1 w-full px-3 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/sales" element={<SaleForm />} />
                  <Route path="/dose" element={<DosePage />} />
                  <Route path="/manual" element={<ManualBill />} />
                  <Route path="/check-price" element={<PriceChecker />} />
                  <Route path="/reports" element={<DailyReport />} />
                </Routes>
              </main>
            </div>
          </PrivateRoute>
        } />
      </Routes>
    </Router>
  );
}

export default App;
