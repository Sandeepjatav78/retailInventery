import React, { useEffect, useState } from 'react';
import api from '../api/axios';
import { useNavigate } from 'react-router-dom';

const KachiEntry = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    productName: '',
    expiryDate: '',
    costPrice: '',
    canShowInAdminInventory: true,
    billFile: null,
  });
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchEntries = async () => {
    try {
      const res = await api.get('/medicines/kachi');
      setEntries(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      alert('Failed to load Kachi entries');
    }
  };

  useEffect(() => {
    const role = localStorage.getItem('userRole');
    if (role !== 'admin') {
      navigate('/', { replace: true });
      return;
    }
    fetchEntries();
  }, [navigate]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleFileChange = (e) => {
    setForm((prev) => ({ ...prev, billFile: e.target.files?.[0] || null }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const productName = String(form.productName || '').trim();
    const expiryDate = String(form.expiryDate || '').trim();
    const costPriceText = String(form.costPrice ?? '').trim();

    const missing = [];
    if (!productName) missing.push('Product Name');
    if (!expiryDate) missing.push('Expiry');
    if (!costPriceText) missing.push('Cost Price');

    if (missing.length > 0) {
      alert(`Please fill required field(s): ${missing.join(', ')}`);
      return;
    }

    const price = Number(costPriceText);
    if (!Number.isFinite(price) || price < 0) {
      alert('Cost Price must be a valid non-negative number');
      return;
    }

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('productName', productName);
      fd.append('expiryDate', expiryDate);
      fd.append('costPrice', String(price));
      fd.append('canShowInAdminInventory', String(form.canShowInAdminInventory));
      if (form.billFile) fd.append('billImage', form.billFile);

      await api.post('/medicines/kachi', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setForm({
        productName: '',
        expiryDate: '',
        costPrice: '',
        canShowInAdminInventory: true,
        billFile: null,
      });
      const input = document.getElementById('kachi-bill-file');
      if (input) input.value = '';

      await fetchEntries();
      alert('Kachi entry added successfully');
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || 'Failed to add Kachi entry');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 md:p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-1">Kachi Entry</h2>
          <p className="text-sm text-gray-500 mb-5">Admin-only quick entries. Staff me ye products nahi dikhte.</p>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <div className="lg:col-span-2">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Product Name</label>
              <input
                name="productName"
                value={form.productName}
                onChange={handleChange}
                placeholder="Medicine name"
                required
                className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Expiry</label>
              <input
                name="expiryDate"
                type="date"
                value={form.expiryDate}
                onChange={handleChange}
                required
                className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Cost Price</label>
              <input
                name="costPrice"
                type="number"
                value={form.costPrice}
                onChange={handleChange}
                placeholder="0"
                required
                min="0"
                step="0.01"
                className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Bill Photo</label>
              <input
                id="kachi-bill-file"
                type="file"
                onChange={handleFileChange}
                className="w-full text-xs text-gray-500 file:mr-2 file:py-2 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 border border-gray-300 rounded-lg"
              />
            </div>

            <div className="md:col-span-2 lg:col-span-3 flex items-center gap-2">
              <input
                id="kachi-show-admin"
                name="canShowInAdminInventory"
                type="checkbox"
                checked={form.canShowInAdminInventory}
                onChange={handleChange}
                className="h-4 w-4"
              />
              <label htmlFor="kachi-show-admin" className="text-sm text-gray-700">Can show in admin inventory</label>
            </div>

            <div className="md:col-span-2 lg:col-span-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white font-bold py-2.5 rounded-lg"
              >
                {loading ? 'Saving...' : 'Add Kachi Entry'}
              </button>
            </div>
          </form>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-bold text-gray-800">Saved Kachi Entries</h3>
            <span className="text-sm text-gray-500">{entries.length} items</span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs tracking-wide">
                <tr>
                  <th className="px-3 py-3 text-left">Product</th>
                  <th className="px-3 py-3 text-left">Expiry</th>
                  <th className="px-3 py-3 text-left">Cost Price</th>
                  <th className="px-3 py-3 text-left">Show in Admin Inventory</th>
                  <th className="px-3 py-3 text-left">Bill</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((item) => (
                  <tr key={item._id} className="border-t border-gray-100">
                    <td className="px-3 py-3 font-medium text-gray-800">{item.productName}</td>
                    <td className="px-3 py-3 text-gray-600">{item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : '-'}</td>
                    <td className="px-3 py-3 text-gray-700">Rs. {item.costPrice ?? 0}</td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${item.canShowInAdminInventory ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                        {item.canShowInAdminInventory ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {item.billImage ? (
                        <a
                          href={item.billImage}
                          target="_blank"
                          rel="noreferrer"
                          className="text-teal-700 hover:text-teal-900 underline"
                        >
                          View
                        </a>
                      ) : (
                        <span className="text-gray-400">No bill</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {entries.length === 0 && (
              <div className="p-6 text-center text-gray-400">No Kachi entries found.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default KachiEntry;
