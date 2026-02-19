import React, { useState, useEffect } from "react";
import api from "../api/axios";
import ExpiryAlert from "../components/ExpiryAlert";
import InventoryTable from "../components/InventoryTable";
import { useNavigate } from "react-router-dom";

const Dashboard = () => {
  const navigate = useNavigate();
  const [meds, setMeds] = useState([]);
  
  // --- NEW STATE FOR AUTOCOMPLETE ---
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);

  const [form, setForm] = useState({
    productName: "",
    batchNumber: "",
    quantity: "",
    mrp: "",
    sellingPrice: "",
    costPrice: "",
    expiryDate: "",
    maxDiscount: "",
    hsnCode: "",
    billFile: null,
    partyName: "",
    purchaseDate: "",
    gst: "0",
    packSize: "10",
  });

  const fetchMeds = () => {
    api.get("/medicines").then((res) => {
      setMeds(res.data);
      try {
        const payload = { items: res.data, ts: Date.now() };
        localStorage.setItem("inventory_cache_v1", JSON.stringify(payload));
      } catch {
        // ignore cache write errors
      }
    });
  };

  useEffect(() => {
    const role = localStorage.getItem("userRole");
    if (role !== "admin") {
      navigate("/sales");
    } else {
      // 1) Try to load fast from localStorage cache
      try {
        const raw = localStorage.getItem("inventory_cache_v1");
        if (raw) {
          const parsed = JSON.parse(raw);
          const maxAgeMs = 5 * 60 * 1000; // 5 minutes
          if (parsed.ts && Date.now() - parsed.ts < maxAgeMs && Array.isArray(parsed.items)) {
            setMeds(parsed.items);
          }
        }
      } catch {
        // ignore cache read errors
      }

      // 2) Always refresh from server in background
      fetchMeds();
    }
  }, []);

  // --- FILE HANDLING ---
  const handleFileChange = (e) =>
    setForm({ ...form, billFile: e.target.files[0] });

  // --- GENERIC INPUT HANDLER ---
  const handleInputChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // --- NEW: PRODUCT NAME HANDLER (For Suggestions) ---
  const handleNameChange = (e) => {
    const userInput = e.target.value;
    
    // Update form normally
    setForm({ ...form, productName: userInput });

    // Filter Suggestions
    if (userInput.length > 1) {
      const filtered = meds.filter(
        (m) =>
          m.productName.toLowerCase().includes(userInput.toLowerCase())
      );
      // Remove duplicates based on Product Name to keep list clean (optional)
      // For now, we show all matches so user can pick specific batch data
      setSuggestions(filtered);
      setShowSuggestions(true);
      setActiveSuggestionIndex(0);
    } else {
      setShowSuggestions(false);
    }
  };

  // --- NEW: SELECT SUGGESTION LOGIC ---
  const selectSuggestion = (selectedMed) => {
    setForm((prev) => ({
      ...prev,
      productName: selectedMed.productName,
      batchNumber: selectedMed.batchNumber, // Fills old batch (User can edit)
      hsnCode: selectedMed.hsnCode || "",
      // Use logic to format date for input type="date" (YYYY-MM-DD)
      expiryDate: selectedMed.expiryDate ? new Date(selectedMed.expiryDate).toISOString().split('T')[0] : "",
      partyName: selectedMed.partyName || "",
      mrp: selectedMed.mrp,
      sellingPrice: selectedMed.sellingPrice,
      costPrice: selectedMed.costPrice,
      maxDiscount: selectedMed.maxDiscount || "",
      gst: selectedMed.gst || "0",
      packSize: selectedMed.packSize || "10",
      // We usually reset quantity for new stock, but you asked to fill ALL fields:
      quantity: "", // Keeping quantity empty so user forces input, or set to selectedMed.quantity
    }));
    
    setShowSuggestions(false);
  };

  // --- NEW: KEYBOARD NAVIGATION ---
  const handleKeyDown = (e) => {
    if (!showSuggestions) return;

    if (e.key === "Enter") {
      e.preventDefault(); // Prevent form submission
      if (suggestions[activeSuggestionIndex]) {
        selectSuggestion(suggestions[activeSuggestionIndex]);
      }
    } else if (e.key === "ArrowUp") {
      if (activeSuggestionIndex === 0) return;
      setActiveSuggestionIndex(activeSuggestionIndex - 1);
    } else if (e.key === "ArrowDown") {
      if (activeSuggestionIndex === suggestions.length - 1) return;
      setActiveSuggestionIndex(activeSuggestionIndex + 1);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  // --- PRICE WARNING LOGIC ---
  const getPriceWarning = () => {
    const mrp = parseFloat(form.mrp);
    const sp = parseFloat(form.sellingPrice);
    const maxDisc = parseFloat(form.maxDiscount);

    if (mrp && sp && maxDisc) {
      const actualDiscount = ((mrp - sp) / mrp) * 100;
      if (actualDiscount > maxDisc) {
        return (
          <div className="text-red-600 text-xs font-bold mt-1 bg-red-50 px-2 py-1 rounded border border-red-200 w-fit flex items-center gap-1 animate-pulse">
            <span>⚠️</span> Limit Exceeded! ({actualDiscount.toFixed(1)}%)
          </div>
        );
      }
    }
    return null;
  };

  // --- ADD STOCK ---
  const handleAdd = async () => {
    if (!form.productName || !form.batchNumber)
      return alert("Please fill details");

    const formData = new FormData();
    Object.keys(form).forEach((key) => {
      if (key !== "billFile") formData.append(key, form[key]);
    });
    if (form.billFile) formData.append("billImage", form.billFile);

    try {
      await api.post("/medicines", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      alert("✅ Stock Added Successfully!");

      setForm((prev) => ({
        ...prev,
        productName: "",
        batchNumber: "",
        quantity: "",
        mrp: "",
        sellingPrice: "",
        costPrice: "",
        expiryDate: "",
        maxDiscount: "",
        hsnCode: "",
        billFile: null,
        packSize: "10",
      }));
      document.querySelector('input[type="file"]').value = "";
      fetchMeds();
    } catch (error) {
      console.error(error);
      alert("Error adding stock: " + (error.response?.data?.message || error.message));
    }
  };

  const handleUpdate = async (id, updatedData) => {
    try {
      await api.put(`/medicines/${id}`, updatedData);
      alert("Updated Successfully!");
      fetchMeds();
    } catch (err) { alert("Update Failed"); }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/medicines/${id}`);
      alert("🗑️ Item Deleted Successfully");
      fetchMeds();
    } catch (err) { alert("Failed to delete item"); }
  };

  // Reusable Classes
  const labelClass = "block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1";
  const inputClass = "w-full p-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all";

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <ExpiryAlert />

      {/* --- ADD STOCK FORM --- */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
        <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
          <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            📦 Inventory Management
          </h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          
          {/* Row 1 */}
          <div className="col-span-2 md:col-span-1 relative"> 
            {/* Added relative here for positioning the dropdown */}
            <label className={labelClass}>Product Name</label>
            <input 
                name="productName" 
                value={form.productName} 
                onChange={handleNameChange} // CHANGED to specific handler
                onKeyDown={handleKeyDown}   // ADDED Key listener
                placeholder="Dolo 650" 
                autoComplete="off"
                className={inputClass} 
            />
            
            {/* --- SUGGESTION DROPDOWN --- */}
            {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute z-10 w-full bg-white border border-gray-300 rounded-lg shadow-lg mt-1 max-h-60 overflow-y-auto">
                    {suggestions.map((suggestion, index) => (
                        <li 
                            key={suggestion._id}
                            onClick={() => selectSuggestion(suggestion)}
                            className={`px-3 py-2 text-sm cursor-pointer border-b border-gray-100 flex justify-between items-center
                                ${index === activeSuggestionIndex ? "bg-teal-100 text-teal-800" : "hover:bg-gray-50 text-gray-700"}`}
                        >
                            <span className="font-semibold">{suggestion.productName}</span>
                            <span className="text-xs text-gray-400">Batch: {suggestion.batchNumber}</span>
                        </li>
                    ))}
                </ul>
            )}
          </div>

          <div>
            <label className={labelClass}>Batch No.</label>
            <input name="batchNumber" value={form.batchNumber} onChange={handleInputChange} placeholder="Batch" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>HSN Code</label>
            <input name="hsnCode" value={form.hsnCode} onChange={handleInputChange} placeholder="3004" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Expiry Date</label>
            <input name="expiryDate" type="date" value={form.expiryDate} onChange={handleInputChange} className={inputClass} />
          </div>

          {/* Row 2 */}
          <div className="col-span-2 md:col-span-1">
            <label className={labelClass}>Party Name</label>
            <input name="partyName" value={form.partyName} onChange={handleInputChange} placeholder="Supplier" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Purchase Date</label>
            <input name="purchaseDate" type="date" value={form.purchaseDate} onChange={handleInputChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Upload Bill</label>
            <input type="file" onChange={handleFileChange} className="w-full text-xs text-gray-500 file:mr-2 file:py-2 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 border border-gray-300 rounded-lg" />
          </div>
          
          <div className="hidden lg:block"></div> 

          {/* Row 3 - Pricing & Config */}
          <div className="p-2 rounded-lg">
            <label className={labelClass}>Packing (Tabs/Strip)</label>
            <input name="packSize" type="number" value={form.packSize} onChange={handleInputChange} placeholder="10" className="w-full p-1.5 border rounded text-sm focus:outline-none focus:ring-1 font-bold text-center" />
          </div>

          <div className="p-2 rounded-lg">
            <label className={labelClass}>Total Strips (Qty)</label>
            <input name="quantity" type="number" value={form.quantity} onChange={handleInputChange} placeholder="Strips" className="w-full p-1.5 border  rounded text-sm focus:outline-none focus:ring-1 font-bold text-center" />
          </div>

          <div>
            <label className={labelClass}>MRP (Per Strip)</label>
            <input name="mrp" type="number" value={form.mrp} onChange={handleInputChange} placeholder="₹" className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>Selling Price</label>
            <input name="sellingPrice" type="number" value={form.sellingPrice} onChange={handleInputChange} placeholder="₹" className={`${inputClass} font-bold text-teal-700`} />
            {getPriceWarning()}
          </div>

          <div>
            <label className={labelClass}>GST %</label>
            <select name="gst" value={form.gst} onChange={handleInputChange} className={inputClass}>
              <option value="0">0%</option>
              <option value="5">5%</option>
              <option value="12">12%</option>
              <option value="18">18%</option>
              <option value="28">28%</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>Cost Price</label>
            <input name="costPrice" type="number" value={form.costPrice} onChange={handleInputChange} placeholder="₹" className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>Max Disc Limit %</label>
            <input name="maxDiscount" type="number" value={form.maxDiscount} onChange={handleInputChange} placeholder="e.g. 10" className={inputClass} />
          </div>

          <div className="flex items-end col-span-2 md:col-span-1">
            <button 
                className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-2.5 rounded-lg shadow-md transition-all flex items-center justify-center gap-2 transform active:scale-95"
                onClick={handleAdd}
            >
              <span>+</span> Add Stock
            </button>
          </div>

        </div>
      </div>

      {/* --- INVENTORY TABLE --- */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <InventoryTable
          meds={meds}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
};

export default Dashboard;