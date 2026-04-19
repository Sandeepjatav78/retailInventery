import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { generateBillHTML } from '../utils/BillGenerator';
import '../styles/CreditLedger.css';

const CreditLedger = () => {
  const CACHE_KEY = 'credit_summary_cache_v1';
  const [credits, setCredits] = useState([]);
  const [selectedCredit, setSelectedCredit] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [paymentNote, setPaymentNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [openingForm, setOpeningForm] = useState({
    customerName: '',
    customerPhone: '',
    customerDoctor: '',
    amount: '',
    note: ''
  });
  const [showOpeningForm, setShowOpeningForm] = useState(false);
  const [accountView, setAccountView] = useState('active');
  const [sortBy, setSortBy] = useState('due-desc');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.items)) {
          setCredits(parsed.items);
        }
      }
    } catch {
      // Ignore cache failures
    }

    fetchCredits();
  }, []);

  const fetchCredits = async () => {
    try {
      setLoading(true);
      const res = await api.get('/credits?summary=1&limit=1000');
      const items = res.data.data || [];
      setCredits(items);

      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), items }));
      } catch {
        // Ignore cache write failures
      }
    } catch (err) {
      console.error('Error fetching credits:', err);
      alert('Failed to load credit ledger');
    } finally {
      setLoading(false);
    }
  };

  const fetchCreditDetails = async (creditId) => {
    if (!creditId) return;

    try {
      setDetailsLoading(true);
      const res = await api.get(`/credits/${creditId}?slice=300`);
      if (res.data?.success && res.data?.data) {
        setSelectedCredit(res.data.data);
      }
    } catch (err) {
      console.error('Error fetching credit details:', err);
      alert('Failed to load account details');
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleOpenBillByReference = async (bill) => {
    if (!bill?.invoiceNo) return;

    try {
      const res = await api.get(`/sales/filter?search=${encodeURIComponent(bill.invoiceNo)}`);
      const sales = res?.data?.transactions || [];

      const matchedSale = sales.find((sale) => {
        const sameInvoice = String(sale.invoiceNo || '').toLowerCase() === String(bill.invoiceNo || '').toLowerCase();
        const sameId = bill.billId && String(sale._id || '') === String(bill.billId || '');
        return sameInvoice || sameId;
      });

      if (!matchedSale) {
        alert(`Bill not found for reference: ${bill.invoiceNo}`);
        return;
      }

      const doseItem = matchedSale.items.find((i) => i.name === 'Medical/Dose Charge');
      const doseAmount = doseItem ? doseItem.total : 0;

      const itemsToPrint = matchedSale.items
        .filter((i) => i.name !== 'Medical/Dose Charge')
        .map((i) => {
          let visualQty = i.quantity;
          if (i.unit === 'loose' && i.packSize) {
            visualQty = Math.round(i.quantity * i.packSize);
          }
          return { ...i, quantity: visualQty };
        });

      const saleDate = new Date(matchedSale.date);
      const invoicePayload = {
        no: matchedSale.invoiceNo,
        name: matchedSale.customerDetails?.name || 'Cash',
        phone: matchedSale.customerDetails?.phone || '',
        doctor: matchedSale.customerDetails?.doctor || 'Self',
        mode: matchedSale.paymentMode,
        isDuplicate: true,
        grandTotal: matchedSale.totalAmount,
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
      console.error('Failed to open bill by reference:', err);
      alert('Unable to open bill right now.');
    }
  };

  const handleAddPayment = async () => {
    if (!selectedCredit || !paymentAmount || Number(paymentAmount) <= 0) {
      alert('Please select a credit and enter valid payment amount');
      return;
    }

    const remainingRounded = Number((selectedCredit.remainingAmount || 0).toFixed(2));
    const paymentRounded = Number(Number(paymentAmount).toFixed(2));

    if (paymentRounded > remainingRounded) {
      alert('Payment amount cannot exceed remaining amount');
      return;
    }

    try {
      const res = await api.post(`/credits/add-payment/${selectedCredit._id}`, {
        paymentAmount: parseFloat(paymentAmount),
        paymentMode,
        paymentNote,
        recordedBy: localStorage.getItem('userName') || 'admin'
      });

      if (res.data.success) {
        alert('Payment recorded successfully');
        setPaymentAmount('');
        setPaymentNote('');
        setPaymentMode('Cash');
        setShowPaymentForm(false);
        
        // Update selected credit and refresh list
        setSelectedCredit(res.data.data);
        const updatedCredits = credits.map(c => 
          c._id === selectedCredit._id ? res.data.data : c
        );
        setCredits(updatedCredits);
      }
    } catch (err) {
      console.error('Error adding payment:', err);
      alert('Failed to add payment');
    }
  };

  const handleAddOpeningMoney = async () => {
    const amount = Number(openingForm.amount);
    if (!openingForm.customerName.trim() || !openingForm.customerPhone.trim() || !Number.isFinite(amount) || amount <= 0) {
      alert('Please enter name, phone and valid amount');
      return;
    }

    try {
      const res = await api.post('/credits/add-opening', {
        customerName: openingForm.customerName.trim(),
        customerPhone: openingForm.customerPhone.trim(),
        customerDoctor: openingForm.customerDoctor.trim(),
        amount,
        note: openingForm.note.trim(),
        recordedBy: localStorage.getItem('userName') || localStorage.getItem('userRole') || 'admin'
      });

      if (res.data.success) {
        const newOrUpdated = res.data.data;
        setCredits((prev) => {
          const found = prev.some((c) => c._id === newOrUpdated._id);
          if (found) return prev.map((c) => (c._id === newOrUpdated._id ? newOrUpdated : c));
          return [newOrUpdated, ...prev];
        });
        setSelectedCredit(newOrUpdated);
        setOpeningForm({ customerName: '', customerPhone: '', customerDoctor: '', amount: '', note: '' });
        alert('Opening amount added successfully');
      }
    } catch (err) {
      console.error('Error adding opening money:', err);
      alert(err.response?.data?.error || 'Failed to add opening amount');
    }
  };

  const formatPhoneForWhatsApp = (phone = '') => {
    const digits = String(phone).replace(/\D/g, '');
    if (!digits) return '';

    // Default to India country code when a 10-digit number is provided.
    if (digits.length === 10) return `91${digits}`;
    return digits;
  };

  const buildWhatsAppReminder = (credit) => {
    const remaining = Number(credit?.remainingAmount || 0).toFixed(2);
    const customerName = credit?.customerName || 'Customer';
    return `Namaste ${customerName}, aapke udhari khate me abhi ₹${remaining} baki hai. Kripya payment jaldi kar dein. Dhanyavaad. - Radhe Pharmacy`;
  };

  const handleSendWhatsApp = (credit) => {
    const phone = formatPhoneForWhatsApp(credit?.customerPhone);
    if (!phone) {
      alert('Valid customer phone number not found');
      return;
    }

    const message = buildWhatsAppReminder(credit);
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  const formatMoney = (value) => `₹${Number(value || 0).toFixed(2)}`;

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredCredits = credits.filter((credit) => {
    const name = String(credit.customerName || '').toLowerCase();
    const phone = String(credit.customerPhone || '').toLowerCase();
    return name.includes(normalizedSearch) || phone.includes(normalizedSearch);
  });

  const sortCredits = (list) => {
    const next = [...list];
    if (sortBy === 'due-desc') {
      next.sort((a, b) => Number(b.remainingAmount || 0) - Number(a.remainingAmount || 0));
    } else if (sortBy === 'due-asc') {
      next.sort((a, b) => Number(a.remainingAmount || 0) - Number(b.remainingAmount || 0));
    } else if (sortBy === 'name') {
      next.sort((a, b) => String(a.customerName || '').localeCompare(String(b.customerName || '')));
    } else if (sortBy === 'recent') {
      next.sort((a, b) => new Date(b.lastUpdated || b.createdDate || 0) - new Date(a.lastUpdated || a.createdDate || 0));
    }
    return next;
  };

  const sortedCredits = sortCredits(filteredCredits);
  const accountsWithBalance = sortedCredits.filter((c) => Number(c.remainingAmount || 0) > 0);
  const closedAccounts = sortedCredits.filter((c) => Number(c.remainingAmount || 0) <= 0);
  const visibleCredits = accountView === 'active'
    ? accountsWithBalance
    : (accountView === 'closed' ? closedAccounts : sortedCredits);

  const totalDue = accountsWithBalance.reduce((sum, c) => sum + Number(c.remainingAmount || 0), 0);

  useEffect(() => {
    if (!visibleCredits.length) {
      setSelectedCredit(null);
      return;
    }

    if (!selectedCredit || !visibleCredits.some((c) => c._id === selectedCredit._id)) {
      setSelectedCredit(visibleCredits[0]);
      fetchCreditDetails(visibleCredits[0]._id);
    }
  }, [credits, searchTerm, accountView, sortBy]);

  return (
    <div className="credit-ledger-container">
      <div className="credit-header">
        <h1>📋 Credit Ledger (उधारी खाता)</h1>
        <input
          type="text"
          placeholder="Search customer by name or phone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        <div className="ledger-stats">
          <div className="stat-card emphasis">
            <span>Active Accounts</span>
            <strong>{accountsWithBalance.length}</strong>
          </div>
          <div className="stat-card alert">
            <span>Total Due</span>
            <strong>{formatMoney(totalDue)}</strong>
          </div>
          <div className="stat-card">
            <span>Closed</span>
            <strong>{closedAccounts.length}</strong>
          </div>
        </div>
      </div>

      <div className="credit-content">
        {/* Left Panel - Credit List */}
        <div className="credit-list-panel">
          <div className="opening-money-box">
            <div className="opening-money-toggle-row">
              <h3>➕ Add Old Pending Amount</h3>
              <button
                type="button"
                className="btn-toggle-opening"
                onClick={() => setShowOpeningForm((prev) => !prev)}
              >
                {showOpeningForm ? 'No' : 'Yes'}
              </button>
            </div>

            {showOpeningForm && (
              <>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Customer Name"
                  value={openingForm.customerName}
                  onChange={(e) => setOpeningForm((prev) => ({ ...prev, customerName: e.target.value }))}
                />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Phone Number"
                  value={openingForm.customerPhone}
                  onChange={(e) => setOpeningForm((prev) => ({ ...prev, customerPhone: e.target.value }))}
                />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Doctor (optional)"
                  value={openingForm.customerDoctor}
                  onChange={(e) => setOpeningForm((prev) => ({ ...prev, customerDoctor: e.target.value }))}
                />
                <input
                  type="number"
                  min="0"
                  className="form-input"
                  placeholder="Old due amount"
                  value={openingForm.amount}
                  onChange={(e) => setOpeningForm((prev) => ({ ...prev, amount: e.target.value }))}
                />
                <textarea
                  className="form-input"
                  rows="2"
                  placeholder="Note (optional)"
                  value={openingForm.note}
                  onChange={(e) => setOpeningForm((prev) => ({ ...prev, note: e.target.value }))}
                ></textarea>
                <button type="button" className="btn-primary" onClick={handleAddOpeningMoney}>
                  Add Money
                </button>
              </>
            )}
          </div>

          <div className="list-controls">
            <div className="account-tabs">
              <button
                type="button"
                className={`tab-btn ${accountView === 'active' ? 'active' : ''}`}
                onClick={() => setAccountView('active')}
              >
                Active ({accountsWithBalance.length})
              </button>
              <button
                type="button"
                className={`tab-btn ${accountView === 'all' ? 'active' : ''}`}
                onClick={() => setAccountView('all')}
              >
                All ({sortedCredits.length})
              </button>
              <button
                type="button"
                className={`tab-btn ${accountView === 'closed' ? 'active' : ''}`}
                onClick={() => setAccountView('closed')}
              >
                Closed ({closedAccounts.length})
              </button>
            </div>
            <select
              className="sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="due-desc">Sort: Highest Due</option>
              <option value="due-asc">Sort: Lowest Due</option>
              <option value="recent">Sort: Recently Updated</option>
              <option value="name">Sort: Name A-Z</option>
            </select>
          </div>

          <div className="list-header">
            <h3>
              {accountView === 'active' ? 'Active Accounts' : accountView === 'closed' ? 'Closed Accounts' : 'All Accounts'}
              ({visibleCredits.length})
            </h3>
          </div>

          {loading ? (
            <div className="loading">Loading...</div>
          ) : visibleCredits.length === 0 ? (
            <div className="no-credits">No accounts found for this filter</div>
          ) : (
            <div className="credits-list">
              {visibleCredits.map((credit) => (
                <div
                  key={credit._id}
                  className={`credit-card ${selectedCredit?._id === credit._id ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedCredit(credit);
                    fetchCreditDetails(credit._id);
                  }}
                >
                  <div className="card-header">
                    <h4>{credit.customerName}</h4>
                    <span className={`status-badge ${credit.status.toLowerCase()}`}>
                      {credit.status}
                    </span>
                  </div>
                  <div className="card-details">
                    <p className="phone">📱 {credit.customerPhone}</p>
                    {credit.customerDoctor && <p className="doctor">🏥 {credit.customerDoctor}</p>}
                    <p className="updated-at">
                      Updated: {new Date(credit.lastUpdated || credit.createdDate || Date.now()).toLocaleDateString('en-IN')}
                    </p>
                    <div className="amounts">
                      <div className="amount-item">
                        <span className="label">Total Due:</span>
                        <span className="value">{formatMoney(credit.totalAmount)}</span>
                      </div>
                      <div className="amount-item">
                        <span className="label">Paid:</span>
                        <span className="value">{formatMoney(credit.paidAmount)}</span>
                      </div>
                      <div className="amount-item remaining">
                        <span className="label">Remaining:</span>
                        <span className="value">{formatMoney(credit.remainingAmount)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Panel - Details */}
        <div className="credit-details-panel">
          {selectedCredit ? (
            <>
              {detailsLoading && (
                <div className="loading">Loading details...</div>
              )}

              <div className="details-header">
                <h2>{selectedCredit.customerName}</h2>
                <span className={`status-badge ${selectedCredit.status.toLowerCase()}`}>
                  {selectedCredit.status}
                </span>
              </div>

              <div className="details-grid">
                <div className="detail-item">
                  <label>Phone</label>
                  <p>{selectedCredit.customerPhone || '-'}</p>
                  <button
                    type="button"
                    className="btn-whatsapp"
                    onClick={() => handleSendWhatsApp(selectedCredit)}
                    disabled={!selectedCredit.customerPhone}
                  >
                    Send WhatsApp Reminder
                  </button>
                </div>
                <div className="detail-item">
                  <label>Doctor</label>
                  <p>{selectedCredit.customerDoctor || '-'}</p>
                </div>
                <div className="detail-item">
                  <label>Current Due</label>
                  <p className="amount">₹{selectedCredit.remainingAmount.toFixed(2)}</p>
                </div>
                <div className="detail-item">
                  <label>Amount Paid</label>
                  <p className="amount">₹{selectedCredit.paidAmount.toFixed(2)}</p>
                </div>
              </div>

              {selectedCredit.remainingAmount > 0 && (
                <div className="payment-section">
                  <h3>💳 Record Payment</h3>
                  <div className="remaining-alert">
                    Remaining Amount: <strong>₹{selectedCredit.remainingAmount.toFixed(2)}</strong>
                  </div>

                  {!showPaymentForm ? (
                    <button onClick={() => setShowPaymentForm(true)} className="btn-primary">
                      Accept Payment
                    </button>
                  ) : (
                    <>
                      <div className="form-group">
                        <label>Payment Amount</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          max={Number((selectedCredit.remainingAmount || 0).toFixed(2))}
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          placeholder="Enter amount"
                          className="form-input"
                        />
                      </div>

                      <div className="form-group">
                        <label>Payment Mode</label>
                        <select
                          value={paymentMode}
                          onChange={(e) => setPaymentMode(e.target.value)}
                          className="form-input"
                        >
                          <option value="Cash">Cash (नकद)</option>
                          <option value="Online">Online (ऑनलाइन)</option>
                          <option value="Check">Check (चेक)</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Notes</label>
                        <textarea
                          value={paymentNote}
                          onChange={(e) => setPaymentNote(e.target.value)}
                          placeholder="Add any notes..."
                          className="form-input"
                          rows="3"
                        ></textarea>
                      </div>

                      <div className="payment-actions-row">
                        <button onClick={handleAddPayment} className="btn-primary">
                          Confirm Payment
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowPaymentForm(false)}
                          className="btn-secondary"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="bills-section">
                <h3>📑 Bills</h3>
                {(selectedCredit.bills || []).length > 0 ? (
                  <table className="bills-table">
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedCredit.bills || []).map((bill, idx) => (
                        <tr key={idx}>
                          <td>
                            <button
                              type="button"
                              className="invoice-link-btn"
                              onClick={() => handleOpenBillByReference(bill)}
                              title={`Open ${bill.invoiceNo}`}
                            >
                              {bill.invoiceNo}
                            </button>
                          </td>
                          <td>{new Date(bill.billDate).toLocaleDateString('en-IN')}</td>
                          <td>₹{bill.billAmount.toFixed(2)}</td>
                          <td>
                            <span className={`status-badge ${bill.billStatus.toLowerCase()}`}>
                              {bill.billStatus}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>No bills associated</p>
                )}
              </div>

              <div className="payments-section">
                <h3>💰 Payment History</h3>
                {(selectedCredit.payments || []).length > 0 ? (
                  <table className="payments-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Mode</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedCredit.payments || []).map((payment, idx) => (
                        <tr key={idx}>
                          <td>{new Date(payment.paymentDate).toLocaleDateString('en-IN')}</td>
                          <td>₹{payment.paymentAmount.toFixed(2)}</td>
                          <td>{payment.paymentMode}</td>
                          <td>{payment.paymentNote || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>No payment recorded yet</p>
                )}
              </div>
            </>
          ) : (
            <div className="no-selection">
              <p>👈 Select a credit account to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreditLedger;
