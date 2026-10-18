import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const formatWhen = (value) => new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
const isPdf = (page) => page.mimeType === 'application/pdf' || /\.pdf($|\?)/i.test(page.url);

const STATUS_TABS = [
  ['Pending', '⏳ Pending'],
  ['Done', '✅ Done'],
  ['Rejected', '❌ Rejected'],
];

const STATUS_STYLES = {
  Pending: 'bg-amber-100 text-amber-800 border-amber-200',
  Done: 'bg-green-100 text-green-800 border-green-200',
  Rejected: 'bg-red-100 text-red-800 border-red-200',
};

// Inbox of bill photos sent from the mobile app. Open one to enter it in the
// Purchase Bill form (AI pre-fills it), fix anything wrong, save — it turns Done.
const MobileUploads = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState('Pending');
  const [uploads, setUploads] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const fetchUploads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/medicines/bill-uploads', { params: { status } });
      setUploads(res.data?.uploads || []);
      setPendingCount(res.data?.pendingCount || 0);
    } catch (err) {
      alert(err.response?.data?.message || 'Mobile uploads load nahi ho sake.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    fetchUploads();
  }, [fetchUploads]);

  const setUploadStatus = async (upload, nextStatus) => {
    let remark;
    if (nextStatus === 'Rejected') {
      remark = window.prompt('Reject karne ki wajah (optional):', upload.remark || '');
      if (remark === null) return;
    }
    setBusyId(upload._id);
    try {
      await api.put(`/medicines/bill-uploads/${upload._id}`, { status: nextStatus, ...(remark !== undefined ? { remark } : {}) });
      fetchUploads();
    } catch (err) {
      alert(err.response?.data?.message || 'Status update nahi ho saka.');
    } finally {
      setBusyId(null);
    }
  };

  const deleteUpload = async (upload) => {
    if (!window.confirm('Ye upload aur iski photos delete karein?')) return;
    setBusyId(upload._id);
    try {
      await api.delete(`/medicines/bill-uploads/${upload._id}`);
      fetchUploads();
    } catch (err) {
      alert(err.response?.data?.message || 'Delete nahi ho saka.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">📲 Mobile Uploads</h1>
          <p className="text-xs text-slate-500 mt-1">Mobile app se bheji gayi bill photos. "Open & Enter" dabayein — AI form bhar dega, photo se milakar theek karein aur Save karein.</p>
        </div>
        <button onClick={fetchUploads} className="px-4 py-2 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded-lg text-sm font-bold border border-teal-200">🔄 Refresh</button>
      </div>

      <div className="flex rounded-lg border border-slate-300 overflow-hidden text-sm font-bold w-fit bg-white">
        {STATUS_TABS.map(([value, label]) => (
          <button key={value} onClick={() => setStatus(value)} className={`px-4 py-2 ${status === value ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
            {label}{value === 'Pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-center text-slate-400 py-10">Loading...</p>
      ) : uploads.length === 0 ? (
        <p className="text-center text-slate-400 py-10 italic bg-white rounded-2xl border border-slate-200">
          {status === 'Pending' ? 'Koi pending bill nahi hai. Mobile app se photo bhejein.' : 'Kuch nahi mila.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {uploads.map((upload) => (
            <div key={upload._id} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
              <div className="flex gap-1 overflow-x-auto bg-slate-100 p-2 h-48">
                {upload.pages.map((page, idx) => (isPdf(page) ? (
                  <a key={idx} href={page.url} target="_blank" rel="noreferrer" className="shrink-0 w-32 h-full rounded-lg bg-white border border-slate-200 flex items-center justify-center text-xs font-bold text-teal-700">📄 PDF {idx + 1}</a>
                ) : (
                  <a key={idx} href={page.url} target="_blank" rel="noreferrer" className="shrink-0 h-full">
                    <img src={page.url} alt={`Page ${idx + 1}`} loading="lazy" className="h-full rounded-lg border border-slate-200 bg-white object-contain" />
                  </a>
                )))}
              </div>
              <div className="p-4 space-y-2 flex-1 flex flex-col">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-500">{formatWhen(upload.createdAt)} · {upload.pages.length} photo · {upload.uploadedBy}</span>
                  <span className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold border ${STATUS_STYLES[upload.status]}`}>{upload.status}</span>
                </div>
                {upload.note && <p className="text-sm text-slate-700">📝 {upload.note}</p>}
                {upload.remark && <p className="text-xs text-slate-500">Remark: {upload.remark}</p>}
                {upload.status === 'Done' && upload.purchaseBillId && <p className="text-xs font-bold text-green-700">✅ Purchase bill save ho chuka hai</p>}

                <div className="flex flex-wrap gap-2 pt-2 mt-auto">
                  {upload.status === 'Pending' ? (
                    <>
                      <button onClick={() => navigate(`/purchase-bill?upload=${upload._id}`)} className="flex-1 px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold">✏️ Open & Enter Bill</button>
                      <button disabled={busyId === upload._id} onClick={() => setUploadStatus(upload, 'Done')} title="Bill pehle se entered hai — bas Done mark karein" className="px-3 py-2 rounded-lg bg-green-50 text-green-700 border border-green-200 text-xs font-bold disabled:opacity-50">✅ Done</button>
                      <button disabled={busyId === upload._id} onClick={() => setUploadStatus(upload, 'Rejected')} className="px-3 py-2 rounded-lg bg-red-50 text-red-700 border border-red-200 text-xs font-bold disabled:opacity-50">❌ Reject</button>
                    </>
                  ) : (
                    <button disabled={busyId === upload._id} onClick={() => setUploadStatus(upload, 'Pending')} className="px-3 py-2 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold disabled:opacity-50">↩️ Wapas Pending</button>
                  )}
                  {!upload.purchaseBillId && (
                    <button disabled={busyId === upload._id} onClick={() => deleteUpload(upload)} title="Delete" className="px-3 py-2 rounded-lg bg-white text-slate-500 border border-slate-200 text-xs font-bold disabled:opacity-50">🗑</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MobileUploads;
