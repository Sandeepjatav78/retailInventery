import React, { useState, useEffect, useRef } from 'react';
import api from '../api/axios';

const PriceChecker = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef(null);

  // --- SEARCH LOGIC ---
  useEffect(() => {
    const fetchMedicines = async () => {
      if (query.length > 1) {
        setLoading(true);
        try {
          const res = await api.get(`/medicines/search?q=${query}`);
          setResults(res.data);
        } catch (err) {
          console.error(err);
          setResults([]);
        } finally {
          setLoading(false);
        }
      } else {
        setResults([]);
      }
    };

    const timer = setTimeout(fetchMedicines, 300); 
    return () => clearTimeout(timer);
  }, [query]);

  // --- CLEAR SEARCH ---
  const handleClear = () => {
    setQuery('');
    setResults([]);
    if(searchRef.current) searchRef.current.focus();
  };

  return (
    <div className="p-4 md:p-8 bg-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        
        {/* HEADER */}
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-extrabold text-teal-800 flex justify-center items-center gap-3">
            🔍 Price & Stock Checker
          </h2>
          <p className="text-gray-500 mt-2 text-sm">Instantly check rates, batch, rack location, and vendor details.</p>
        </div>

        {/* SEARCH BAR */}
        <div className="relative mb-8 shadow-lg rounded-full">
          <input
            ref={searchRef}
            type="text"
            className="w-full p-4 pl-14 text-lg border-2 border-teal-100 rounded-full focus:outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20 transition-all text-gray-700 placeholder-gray-400"
            placeholder="Type Medicine Name to Check..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <span className="absolute left-5 top-1/2 transform -translate-y-1/2 text-2xl">🔎</span>
          
          {query && (
            <button 
              onClick={handleClear}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-red-500 text-xl font-bold p-2 transition-colors"
            >
              ✕
            </button>
          )}
        </div>

        {/* LOADING STATE */}
        {loading && (
          <div className="text-center py-10 text-teal-600 font-medium animate-pulse flex flex-col items-center">
             <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-2"></div>
             Searching inventory...
          </div>
        )}

        {/* RESULTS GRID */}
        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {results.map((med) => (
              <div 
                key={med._id} 
                className={`relative bg-white p-5 rounded-2xl shadow-sm border border-gray-100 transition-all hover:shadow-md group
                  ${med.quantity <= 0 ? 'opacity-80' : ''}
                `}
              >
                {/* TOP ROW: NAME & STATUS */}
                <div className="flex justify-between items-start mb-2">
                    <h3 className="text-xl font-bold text-gray-800 leading-tight">{med.productName}</h3>
                    {med.quantity > 0 ? (
                        <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-1 rounded-full border border-green-200 uppercase tracking-wide">
                            In Stock
                        </span>
                    ) : (
                        <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-1 rounded-full border border-red-200 uppercase tracking-wide">
                            Out of Stock
                        </span>
                    )}
                </div>

                {/* DETAILS ROW 1 */}
                <div className="flex flex-wrap gap-3 text-xs font-medium text-gray-500 mb-4 uppercase tracking-wide">
                    <span className="bg-gray-100 px-2 py-1 rounded">Batch: <strong className="text-gray-700">{med.batchNumber}</strong></span>
                    <span className={`px-2 py-1 rounded ${new Date(med.expiryDate) < new Date() ? 'bg-red-50 text-red-600' : 'bg-gray-100'}`}>
                        Exp: <strong className={new Date(med.expiryDate) < new Date() ? 'text-red-700' : 'text-gray-700'}>
                            {new Date(med.expiryDate).toLocaleDateString()}
                        </strong>
                    </span>
                </div>

                {/* 🔥 UPDATED PRICE BOX WITH COST PRICE */}
                <div className="grid grid-cols-3 gap-2 bg-teal-50/50 p-4 rounded-xl border border-teal-100 mb-4">
                  
                  {/* 1. MRP */}
                  <div className="flex flex-col border-r border-teal-200/50 pr-2">
                    <span className="text-[10px] text-gray-400 uppercase font-bold">MRP</span>
                    <span className="text-gray-500 line-through font-semibold">₹{med.mrp}</span>
                  </div>

                  {/* 2. COST PRICE (Added Here) */}
                  <div className="flex flex-col text-center border-r border-teal-200/50 px-2">
                    <span className="text-[10px] text-red-400 uppercase font-bold">Cost (CP)</span>
                    <span className="text-lg font-bold text-red-600">₹{med.costPrice}</span>
                  </div>

                  {/* 3. SELLING PRICE */}
                  <div className="flex flex-col text-right pl-2">
                    <span className="text-[10px] text-teal-600 uppercase font-bold">Selling</span>
                    <span className="text-2xl font-extrabold text-teal-700">₹{med.sellingPrice}</span>
                  </div>
                </div>

                {/* PURCHASE HISTORY / STOCK DETAILS */}
                <div className="pt-3 border-t border-gray-100 grid grid-cols-2 gap-y-2 text-sm text-gray-600">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400 uppercase">Vendor (Party)</span>
                    <span className="font-semibold text-gray-800">{med.partyName || 'N/A'}</span>
                  </div>
                  <div className="flex flex-col text-right">
                    <span className="text-[10px] text-gray-400 uppercase">Current Stock</span>
                    <span className={`font-bold ${med.quantity < 10 ? 'text-orange-600' : 'text-gray-800'}`}>
                        {med.quantity} <span className="text-[10px] font-normal text-gray-400">Strips</span>
                    </span>
                  </div>
                  <div className="flex flex-col mt-2">
                    <span className="text-[10px] text-gray-400 uppercase">Location / Rack</span>
                    <span className="font-semibold text-gray-800">{med.rack || 'General'}</span>
                  </div>
                  <div className="flex flex-col text-right mt-2">
                    <span className="text-[10px] text-gray-400 uppercase">Packing</span>
                    <span className="font-semibold text-gray-800">{med.packSize} / Strip</span>
                  </div>
                </div>

              </div>
            ))}
            
            {query.length > 1 && results.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
                <span className="text-4xl mb-2">🤷‍♂️</span>
                <p className="text-gray-500 font-medium">No medicines found matching "{query}"</p>
                <p className="text-sm text-gray-400">Try searching by Batch Number or Name</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PriceChecker;