import React, { useState } from 'react';
import api from '../api/axios';

const ReturnBillModal = ({ sale, onClose, onReturnSuccess }) => {
  const [items, setItems] = useState(
    (sale.items || []).map((it) => ({
      ...it,
      soldQuantity: it.quantity || 0,
      returnQuantity: ''
    }))
  );

  const handleQtyChange = (index, value) => {
    const newItems = [...items];
    const raw = parseFloat(value);
    if (isNaN(raw) || raw < 0) {
      newItems[index].returnQuantity = '';
    } else {
      const max = newItems[index].soldQuantity || 0;
      newItems[index].returnQuantity = raw > max ? max : raw;
    }
    setItems(newItems);
  };

  const calculateTotalReturn = () => {
    return items.reduce((acc, it) => {
      const q = parseFloat(it.returnQuantity) || 0;
      const price = parseFloat(it.price) || 0;
      return acc + q * price;
    }, 0);
  };

  const handleSave = async () => {
    const itemsToReturn = items
      .filter((it) => parseFloat(it.returnQuantity) > 0)
      .map((it) => ({
        medicineId: it.medicineId || null,
        name: it.name,
        hsn: it.hsn,
        gst: it.gst,
        batch: it.batch,
        expiry: it.expiry,
        unit: it.unit,
        packSize: it.packSize,
        mrp: it.mrp,
        discount: it.discount,
        quantity: parseFloat(it.returnQuantity),
        price: it.price,
        purchasePrice: it.purchasePrice
      }));

    if (!itemsToReturn.length) {
      alert('Please enter quantity for at least one item to return.');
      return;
    }

    try {
      const userRole = localStorage.getItem('userRole');
      await api.post(`/sales/${sale._id}/return`, { items: itemsToReturn, userRole });
      alert('✅ Return processed & stock updated!');
      onReturnSuccess();
    } catch (err) {
      alert('❌ Return failed: ' + (err.response?.data?.message || err.message));
    }
  };

  const inputClass = 'w-full p-2 border rounded text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-center';

  const totalReturn = calculateTotalReturn();

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-4xl rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* HEADER */}
        <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
          <h2 className="text-lg font-bold text-gray-800">
            ↩️ Return Items from #{sale.invoiceNo}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-red-500 text-2xl font-bold"
          >
            &times;
          </button>
        </div>

        {/* BODY */}
        <div className="p-6 overflow-y-auto flex-1">
          <div className="mb-4 text-sm text-gray-600 bg-emerald-50 border border-emerald-100 rounded-lg p-3">
            Select the items and quantity to return. Stock will be added
            back only for returned quantities.
          </div>

          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="p-3">Item</th>
                  <th className="p-3">Batch</th>
                  <th className="p-3 text-center">Sold Qty</th>
                  <th className="p-3 text-center">Return Qty</th>
                  <th className="p-3 text-right">Rate</th>
                  <th className="p-3 text-right">Return Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((it, i) => {
                  const q = parseFloat(it.returnQuantity) || 0;
                  const price = parseFloat(it.price) || 0;
                  const lineTotal = q * price;
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="p-3">
                        <div className="font-bold text-gray-800">{it.name}</div>
                        <div className="text-[11px] text-gray-400">
                          GST: {it.gst || 0}% | HSN: {it.hsn || '-'}
                        </div>
                      </td>
                      <td className="p-3 text-xs text-gray-500">{it.batch || '-'}</td>
                      <td className="p-3 text-center font-semibold text-gray-700">
                        {it.soldQuantity}
                      </td>
                      <td className="p-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={it.returnQuantity}
                          onChange={(e) => handleQtyChange(i, e.target.value)}
                          className={inputClass}
                        />
                      </td>
                      <td className="p-3 text-right text-gray-700">
                        ₹{price.toFixed(2)}
                      </td>
                      <td className="p-3 text-right font-bold text-emerald-700">
                        {q > 0 ? `₹${lineTotal.toFixed(2)}` : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* FOOTER */}
        <div className="p-4 border-t bg-gray-50 rounded-b-xl flex justify-between items-center">
          <div className="text-lg font-extrabold text-gray-800">
            Return Total:{' '}
            <span className="text-emerald-700">
              ₹{totalReturn.toFixed(2)}
            </span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-lg shadow-md hover:bg-emerald-700 transition-all"
            >
              Save Return
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReturnBillModal;
