import React, { useState, useEffect } from "react";
import api from "../api/axios";
import ExpiryAlert from "../components/ExpiryAlert";
import InventoryTable from "../components/InventoryTable";
import { useNavigate } from "react-router-dom";
import { getCachedMedicines, syncMedicinesCache } from "../utils/medicineCache";

const Dashboard = () => {
  const navigate = useNavigate();
  const userRole = localStorage.getItem("userRole");
  const [meds, setMeds] = useState(() => getCachedMedicines());
  const [autoDetecting, setAutoDetecting] = useState(false);

  const fetchMeds = async () => {
    try {
      const data = await syncMedicinesCache(api);
      setMeds(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (userRole !== "admin" && userRole !== "staff") {
      navigate("/sales");
      return;
    }

    // Refresh from server in background.
    fetchMeds();

    const intervalId = setInterval(() => {
      fetchMeds();
    }, 5 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [navigate, userRole]);

  const handleUpdate = async (id, updatedData) => {
    try {
      await api.put(`/medicines/${id}`, updatedData);
      alert("Updated Successfully!");
      await fetchMeds();
    } catch (error) {
      console.error(error);
      alert("Update Failed");
    }
  };

  const handleAutoDetectSchedule = async () => {
    if (!window.confirm('AI (Google Gemini) se sabhi untagged medicines (purani + nayi) ka full A-Z Drug Schedule check karayein? Bulk list ke liye ismein kuch samay lag sakta hai.')) return;
    setAutoDetecting(true);
    try {
      const res = await api.post('/medicines/auto-detect-schedule');
      const { taggedCount = 0, byCategory = {} } = res.data || {};
      const breakdown = Object.entries(byCategory).filter(([, n]) => n > 0).map(([cat, n]) => `${cat}: ${n}`).join(', ');
      alert(taggedCount > 0
        ? `✅ AI ne ${taggedCount} medicine(s) check kiye — ${breakdown}. Kripya "Sch." column mein list check karke zarurat ho to correct karein.`
        : 'Sabhi medicines pehle se hi check/tagged hain.');
      await fetchMeds();
    } catch (error) {
      console.error(error);
      alert('Auto-detect failed');
    } finally {
      setAutoDetecting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/medicines/${id}`);
      alert("🗑️ Item Deleted Successfully");
      await fetchMeds();
    } catch (error) {
      console.error(error);
      alert("Failed to delete item");
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <ExpiryAlert />

      {/* --- INVENTORY TABLE --- */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <InventoryTable
          meds={meds}
          userRole={userRole}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onAutoDetectSchedule={handleAutoDetectSchedule}
          autoDetecting={autoDetecting}
        />
      </div>
    </div>
  );
};

export default Dashboard;