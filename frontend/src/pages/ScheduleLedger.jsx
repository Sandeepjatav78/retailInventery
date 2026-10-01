import React, { useEffect, useState } from 'react';
import api from '../api/axios';
import { generateBillHTML } from '../utils/BillGenerator';
import { fetchScheduleCategories, SCHEDULE_BADGE_STYLES, DEFAULT_SCHEDULE_BADGE_STYLE } from '../utils/scheduleCategories';

const todayStr = () => new Date().toISOString().slice(0, 10);
const monthAgoStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
};

const ScheduleLedger = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [start, setStart] = useState(monthAgoStr());
  const [end, setEnd] = useState(todayStr());
  const [categories, setCategories] = useState(['None', 'G', 'H', 'H1', 'X']);
  const [scheduleInfo, setScheduleInfo] = useState({});

  useEffect(() => {
    fetchScheduleCategories(api).then(({ categories: cats, info }) => {
      setCategories(cats.filter((c) => c !== 'None'));
      setScheduleInfo(info);
    });
  }, []);

  const fetchLedger = async () => {
    setLoading(true);
    try {
      const params = { start, end };
      if (search.trim()) params.search = search.trim();
      if (category !== 'all') params.category = category;
      const res = await api.get('/sales/schedule-ledger', { params });
      setTransactions(res.data?.transactions || []);
    } catch (err) {
      console.error('Error loading schedule ledger:', err);
      alert('Schedule ledger load nahi ho saka.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const money = (v) => `₹${Number(v || 0).toFixed(2)}`;

  const openBill = async (sale) => {
    try {
      const doseItem = sale.items.find((i) => i.name === 'Medical/Dose Charge');
      const doseAmount = doseItem ? doseItem.total : 0;
      const itemsToPrint = sale.items
        .filter((i) => i.name !== 'Medical/Dose Charge')
        .map((i) => {
          let visualQty = i.quantity;
          if (i.unit === 'loose' && i.packSize) visualQty = Math.round(i.quantity * i.packSize);
          return { ...i, quantity: visualQty };
        });

      const saleDate = new Date(sale.date);
      const invoicePayload = {
        no: sale.invoiceNo,
        name: sale.customerDetails?.name || 'Cash',
        phone: sale.customerDetails?.phone || '',
        doctor: sale.customerDetails?.doctor || 'Self',
        mode: sale.paymentMode,
        isDuplicate: true,
        grandTotal: sale.totalAmount,
        doseAmount,
        customDate: saleDate.toISOString().split('T')[0],
        customTime: saleDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
      };

      const billHTML = await generateBillHTML(itemsToPrint, invoicePayload);
      const popup = window.open('', '', 'width=900,height=900');
      if (popup) {
        popup.document.write(billHTML);
        popup.document.close();
      } else {
        alert('Popup blocked! Please allow popups to open the bill.');
      }
    } catch (err) {
      console.error('Failed to open bill:', err);
      alert('Bill open nahi ho saka.');
    }
  };

  const totalScheduleAmount = transactions.reduce((sum, t) => {
    const scheduled = t.scheduledItems || [];
    return sum + scheduled.reduce((s, i) => s + Number(i.total || 0), 0);
  }, 0);

  return (
    <div className="p-4 sm:p-6 bg-gray-50 min-h-screen">
      <div className="mb-4">
        <h1 className="text-xl font-extrabold text-gray-800 flex items-center gap-2">💊 Schedule Drug Ledger</h1>
        <p className="text-xs text-gray-500 mt-1">
          Yahan sirf wahi bills dikhte hain jinme koi scheduled (A-Z) dawai/product sale hua ho — statutory register ke liye.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">From</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">To</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="all">All schedules</option>
            {categories.map((cat) => (
              <option key={cat} value={cat} title={scheduleInfo[cat] || ''}>{cat} only</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Search invoice / customer / medicine</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. RP-2026 or Tramadol" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <button onClick={fetchLedger} className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm">
          🔍 Apply
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-2 shadow-sm">
          <span className="block text-[11px] text-gray-500 font-bold uppercase">Bills</span>
          <strong className="text-lg text-gray-800">{transactions.length}</strong>
        </div>
        <div className="bg-white rounded-lg border border-red-200 px-4 py-2 shadow-sm">
          <span className="block text-[11px] text-red-500 font-bold uppercase">Schedule Drug Amount</span>
          <strong className="text-lg text-red-700">{money(totalScheduleAmount)}</strong>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase">Invoice</th>
                <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase">Date</th>
                <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase">Customer</th>
                <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase">Schedule Medicine(s)</th>
                <th className="px-3 py-3 text-right text-xs font-bold text-gray-500 uppercase">Bill Amount</th>
                <th className="px-3 py-3 text-center text-xs font-bold text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">Loading...</td></tr>
              ) : transactions.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">Is filter mein koi schedule bill nahi mili.</td></tr>
              ) : (
                transactions.map((sale) => (
                  <tr key={sale._id} className="hover:bg-gray-50">
                    <td className="px-3 py-3 text-sm font-semibold text-gray-800">{sale.invoiceNo}</td>
                    <td className="px-3 py-3 text-sm text-gray-600">{new Date(sale.date).toLocaleDateString('en-IN')}</td>
                    <td className="px-3 py-3 text-sm text-gray-600">
                      {sale.customerDetails?.name || 'Cash'}
                      {sale.customerDetails?.phone && <span className="block text-xs text-gray-400">{sale.customerDetails.phone}</span>}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-700">
                      <div className="flex flex-wrap gap-1.5">
                        {(sale.scheduledItems || []).map((item, idx) => (
                          <span key={idx} title={scheduleInfo[item.scheduleCategory] || ''} className={`px-2 py-0.5 rounded text-xs font-semibold border ${SCHEDULE_BADGE_STYLES[item.scheduleCategory] || DEFAULT_SCHEDULE_BADGE_STYLE}`}>
                            {item.name} ({item.scheduleCategory}) × {item.quantity}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-sm text-right font-bold text-gray-800">{money(sale.totalAmount)}</td>
                    <td className="px-3 py-3 text-center">
                      <button onClick={() => openBill(sale)} className="text-teal-600 hover:text-teal-800 text-xs font-semibold underline">
                        View Bill
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ScheduleLedger;
