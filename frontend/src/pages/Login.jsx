import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";

const Login = () => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post("/admin/verify", { password });

      // --- DEBUGGING ---
      console.log("Backend Response:", res.data);

      if (res.data.success) {
        localStorage.setItem("token", "logged-in");
        localStorage.setItem("userRole", res.data.role);

        if (res.data.role === "admin") {
          alert("Admin Login Successful! Redirecting to Inventory...");
          navigate("/");
        } else {
          alert("Staff Login Successful! Redirecting to Billing...");
          navigate("/sales");
        }
      } else {
        setError("❌ Wrong Password");
      }
    } catch (err) {
      setError("Server Error. Try again.");
    }
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
      
      {/* --- LOGIN CARD --- */}
      <div className="bg-white w-full max-w-sm p-8 rounded-2xl shadow-2xl text-center transform transition-all hover:scale-[1.01]">
        
        {/* Header */}
        <h2 className="text-3xl font-extrabold text-teal-700 mb-2 tracking-tight">
          Radhe Pharmacy
        </h2>
        <p className="text-gray-400 text-sm font-medium mb-8 uppercase tracking-widest">
          System Login
        </p>

        <form onSubmit={handleLogin} className="flex flex-col gap-5">
          
          {/* Password Input Group */}
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Enter Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-xl text-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all placeholder-gray-400 text-gray-800"
              autoFocus
            />
            
            {/* Eye Icon Toggle */}
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-teal-600 transition-colors focus:outline-none"
            >
              {showPassword ? (
                // Open Eye Icon
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              ) : (
                // Closed Eye Icon
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                </svg>
              )}
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-lg text-sm font-bold animate-pulse shadow-sm">
              {error}
            </div>
          )}

          {/* Login Button */}
          <button className="w-full bg-teal-700 hover:bg-teal-800 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all transform active:scale-95 text-lg flex justify-center items-center gap-2 mt-2">
            Login <span className="text-xl">➔</span>
          </button>
        </form>
      </div>

      {/* Footer */}
      <div className="absolute bottom-6 text-slate-500 text-xs font-medium opacity-60">
        © 2025 Radhe Pharmacy System
      </div>
    </div>
  );
};

export default Login;