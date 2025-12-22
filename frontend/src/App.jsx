import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  useNavigate,
} from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import SaleForm from "./components/SaleForm";
import DailyReport from "./pages/DailyReport";
import Login from "./pages/Login";
import PrivateRoute from "./components/PrivateRoute";

// Logout Button Component
const LogoutButton = () => {
  const navigate = useNavigate();
  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };
  return (
    <button onClick={handleLogout} style={navLinkStyle}>
      Logout
    </button>
  );
};

const App = () => {
  return (
    <Router>
      <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
        <Routes>
          {/* Public Route */}
          <Route path="/login" element={<Login />} />

          {/* PROTECTED ROUTES (Require Login) */}
          <Route element={<PrivateRoute />}>
            <Route
              path="/"
              element={
                <>
                  <nav
                    style={{
                      marginBottom: "20px",
                      padding: "10px",
                      background: "#eee",
                      borderRadius: "5px",
                      display: "flex",
                      gap: "10px",
                    }}
                  >
                    <Link to="/" style={navLinkStyle}>
                      Inventory
                    </Link>
                    <Link to="/sales" style={navLinkStyle}>
                      New Sale
                    </Link>
                    <Link to="/report" style={navLinkStyle}>
                      Daily Report
                    </Link>
                    <div style={{ marginLeft: "auto" }}>
                      <LogoutButton />
                    </div>
                  </nav>
                  <Dashboard />
                </>
              }
            />

            <Route
              path="/sales"
              element={
                <>
                  <nav
                    style={{
                      marginBottom: "20px",
                      padding: "10px",
                      background: "#eee",
                      borderRadius: "5px",
                      display: "flex",
                      gap: "10px",
                    }}
                  >
                    <Link to="/" style={navLinkStyle}>
                      Inventory
                    </Link>
                    <Link to="/sales" style={navLinkStyle}>
                      New Sale
                    </Link>
                    <Link to="/report" style={navLinkStyle}>
                      Daily Report
                    </Link>
                    <div style={{ marginLeft: "auto" }}>
                      <LogoutButton />
                    </div>
                  </nav>
                  <SaleForm />
                </>
              }
            />

            <Route
              path="/report"
              element={
                <>
                  <nav
                    style={{
                      marginBottom: "20px",
                      padding: "10px",
                      background: "#eee",
                      borderRadius: "5px",
                      display: "flex",
                      gap: "10px",
                    }}
                  >
                    <Link to="/" style={navLinkStyle}>
                      Inventory
                    </Link>
                    <Link to="/sales" style={navLinkStyle}>
                      New Sale
                    </Link>
                    <Link to="/report" style={navLinkStyle}>
                      Daily Report
                    </Link>
                    <div style={{ marginLeft: "auto" }}>
                      <LogoutButton />
                    </div>
                  </nav>
                  <DailyReport />
                </>
              }
            />
          </Route>
        </Routes>
      </div>
    </Router>
  );
};

const navLinkStyle = {
  marginRight: "15px",
  textDecoration: "none",
  color: "#333",
  fontWeight: "bold",
  cursor: "pointer",
  background: "none",
  border: "none",
  fontSize: "16px",
};

export default App;
