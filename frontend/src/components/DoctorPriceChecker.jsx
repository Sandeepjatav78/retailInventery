import React, { useState, useEffect, useRef } from 'react';
import api from '../api/axios';

const DoctorPriceChecker = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [priceDrafts, setPriceDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [editingState, setEditingState] = useState({ id: null, target: null });
  const searchRef = useRef(null);

  const normalizeNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const getDraft = (med) => {
    const existing = priceDrafts[med._id];
    if (existing) return existing;
    const baseCost = normalizeNumber(med.costPrice);
    return {
      sellingPrice: String(med.sellingPrice ?? ''),
      doctorPrice: String((baseCost * 1.25).toFixed(2)),
    };
  };

  const isPriceChanged = (med, target) => {
    const draft = getDraft(med);
    if (target === 'doctor') {
      const currentDoctor = normalizeNumber(med.costPrice) * 1.25;
      return normalizeNumber(draft.doctorPrice) !== Number(currentDoctor.toFixed(2));
    }
    const sellingChanged = normalizeNumber(draft.sellingPrice) !== normalizeNumber(med.sellingPrice);
    return sellingChanged;
  };

  const updateDraftField = (id, field, value) => {
    setPriceDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [field]: value,
      },
    }));
  };

  const handleSavePrices = async (med) => {
    const draft = getDraft(med);
    const { target } = editingState;
    const sellingPrice = normalizeNumber(draft.sellingPrice);
    const doctorPrice = normalizeNumber(draft.doctorPrice);

    if (target === 'doctor') {
      if (doctorPrice < 0) {
        alert('Doctor price cannot be negative.');
        return;
      }
    } else {
      if (sellingPrice < 0) {
        alert('Selling price cannot be negative.');
        return;
      }
    }

    const localUpdate = target === 'doctor'
      ? { costPrice: Number((doctorPrice / 1.25).toFixed(2)) }
      : { sellingPrice };

    setSavingId(med._id);

    setResults((prev) =>
      prev.map((item) => (item._id === med._id ? { ...item, ...localUpdate } : item))
    );

    const nextCostPrice = target === 'doctor' ? localUpdate.costPrice : normalizeNumber(med.costPrice);
    const nextSellingPrice = target === 'selling' ? localUpdate.sellingPrice : normalizeNumber(med.sellingPrice);

    setPriceDrafts((prev) => ({
      ...prev,
      [med._id]: {
        sellingPrice: String(nextSellingPrice),
        doctorPrice: String((nextCostPrice * 1.25).toFixed(2)),
      },
    }));

    setEditingState({ id: null, target: null });
    setSavingId(null);
  };

  const startEditingPrices = (med, target) => {
    setPriceDrafts((prev) => ({
      ...prev,
      [med._id]: {
        sellingPrice: String(med.sellingPrice ?? ''),
        doctorPrice: String((normalizeNumber(med.costPrice) * 1.25).toFixed(2)),
      },
    }));
    setEditingState({ id: med._id, target });
  };

  const cancelEditingPrices = (med) => {
    setPriceDrafts((prev) => ({
      ...prev,
      [med._id]: {
        sellingPrice: String(med.sellingPrice ?? ''),
        doctorPrice: String((normalizeNumber(med.costPrice) * 1.25).toFixed(2)),
      },
    }));
    setEditingState({ id: null, target: null });
  };

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

  const handleClear = () => {
    setQuery('');
    setResults([]);
    if (searchRef.current) searchRef.current.focus();
  };

  return (
    <div className="p-4 md:p-8 bg-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-extrabold text-teal-800 flex justify-center items-center gap-3">
            🩺 Doctor Price Checker
          </h2>
          {/* <p className="text-gray-500 mt-2 text-sm">DP.</p> */}
        </div>

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

        {loading && (
          <div className="text-center py-10 text-teal-600 font-medium animate-pulse flex flex-col items-center">
            <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-2"></div>
            Searching inventory...
          </div>
        )}

        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {results.map((med) => {
              const draft = getDraft(med);
              const cp = normalizeNumber(med.costPrice);
              const sellingPrice = normalizeNumber(draft.sellingPrice);
              const doctorPrice = normalizeNumber(draft.doctorPrice);
              const isEditing = editingState.id === med._id;
              const editingTarget = editingState.target;
              const dirty = isPriceChanged(med, editingTarget);

              return (
                <div
                  key={med._id}
                  className={`relative bg-white p-5 rounded-2xl shadow-sm border border-gray-100 transition-all hover:shadow-md
                    ${med.quantity <= 0 ? 'opacity-80' : ''}
                  `}
                >
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

                  <div className="flex flex-wrap gap-3 text-xs font-medium text-gray-500 mb-4 uppercase tracking-wide">
                    <span className="bg-gray-100 px-2 py-1 rounded">Batch: <strong className="text-gray-700">{med.batchNumber}</strong></span>
                    <span className={`px-2 py-1 rounded ${new Date(med.expiryDate) < new Date() ? 'bg-red-50 text-red-600' : 'bg-gray-100'}`}>
                      Exp: <strong className={new Date(med.expiryDate) < new Date() ? 'text-red-700' : 'text-gray-700'}>{new Date(med.expiryDate).toLocaleDateString()}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-teal-50/50 p-4 rounded-xl border border-teal-100 mb-4">
                    {!isEditing ? (
                      <>
                        <div className="flex flex-col border-r border-teal-200/50 pr-2">
                          <span className="text-[10px] text-gray-400 uppercase font-bold">MRP</span>
                          <span className="text-gray-500 line-through font-semibold">₹{med.mrp}</span>
                        </div>

                        <div className="flex flex-col text-right pl-2 gap-1">
                          <div className="flex flex-col">
                            <span className="text-[10px] text-gray-400 uppercase font-bold">Selling Price</span>
                            <button
                              type="button"
                              onClick={() => startEditingPrices(med, 'selling')}
                              className="text-right font-bold text-gray-800"
                            >
                              ₹{sellingPrice.toFixed(2)}
                            </button>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] text-indigo-500 uppercase font-bold">Doctor Price</span>
                            <button
                              type="button"
                              onClick={() => startEditingPrices(med, 'doctor')}
                              className="text-right text-2xl font-extrabold text-indigo-700"
                            >
                              ₹{doctorPrice.toFixed(2)}
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="col-span-2">
                        <label className="flex flex-col">
                          <span className="mb-1 text-[10px] font-bold uppercase text-gray-500">
                            {editingTarget === 'doctor' ? 'Doctor Price' : 'Selling Price'}
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editingTarget === 'doctor' ? draft.doctorPrice : draft.sellingPrice}
                            onChange={(e) => updateDraftField(med._id, editingTarget === 'doctor' ? 'doctorPrice' : 'sellingPrice', e.target.value)}
                            className="w-full rounded-lg border border-teal-300 bg-white px-2 py-1.5 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-teal-200"
                          />
                        </label>

                        <div className="mt-3 flex justify-end gap-2">
                          <button
                            onClick={() => cancelEditingPrices(med)}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSavePrices(med)}
                            disabled={!dirty || savingId === med._id}
                            className={`rounded-lg px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide transition-all ${
                              !dirty || savingId === med._id
                                ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                                : 'bg-teal-600 text-white shadow hover:bg-teal-700'
                            }`}
                          >
                            {savingId === med._id ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

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
                  </div>
                </div>
              );
            })}

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

export default DoctorPriceChecker;
