import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { generateBillHTML } from '../utils/BillGenerator';
import '../styles/CreditLedger.css';

const CreditLedger = () => {
  const [credits, setCredits] = useState([]);
  const [selectedCredit, setSelectedCredit] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [paymentNote, setPaymentNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchCredits();
  }, []);

  const fetchCredits = async () => {
    try {
      setLoading(true);
      const res = await api.get('/credits');
      setCredits(res.data.data || []);
    } catch (err) {
      console.error('Error fetching credits:', err);
      alert('Failed to load credit ledger');
    } finally {
      setLoading(false);
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
    if (!selectedCredit || !paymentAmount || paymentAmount <= 0) {
      alert('Please select a credit and enter valid payment amount');
      return;
    }

    if (parseFloat(paymentAmount) > selectedCredit.remainingAmount) {
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

  const filteredCredits = credits.filter(credit =>
    credit.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    credit.customerPhone?.includes(searchTerm)
  );

  const accountsWithBalance = filteredCredits.filter(c => c.remainingAmount > 0);
  const closedAccounts = filteredCredits.filter(c => c.status === 'Closed');

  return (
    <div className="credit-ledger-container">
      <div className="credit-header">
        <h1>📋 Credit Ledger (उधारी खाता)</h1>
        <input
          type="text"
          placeholder="Search by name or phone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
      </div>

      <div className="credit-content">
        {/* Left Panel - Credit List */}
        <div className="credit-list-panel">
          <div className="list-header">
            <h3>Active Accounts ({accountsWithBalance.length})</h3>
          </div>

          {loading ? (
            <div className="loading">Loading...</div>
          ) : accountsWithBalance.length === 0 ? (
            <div className="no-credits">No active credit accounts</div>
          ) : (
            <div className="credits-list">
              {accountsWithBalance.map((credit) => (
                <div
                  key={credit._id}
                  className={`credit-card ${selectedCredit?._id === credit._id ? 'active' : ''}`}
                  onClick={() => setSelectedCredit(credit)}
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
                    <div className="amounts">
                      <div className="amount-item">
                        <span className="label">Total Due:</span>
                        <span className="value">₹{credit.totalAmount.toFixed(2)}</span>
                      </div>
                      <div className="amount-item">
                        <span className="label">Paid:</span>
                        <span className="value">₹{credit.paidAmount.toFixed(2)}</span>
                      </div>
                      <div className="amount-item remaining">
                        <span className="label">Remaining:</span>
                        <span className="value">₹{credit.remainingAmount.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {closedAccounts.length > 0 && (
            <div className="closed-accounts">
              <h3>Closed Accounts ({closedAccounts.length})</h3>
              <div className="closed-list">
                {closedAccounts.map((credit) => (
                  <div
                    key={credit._id}
                    className="closed-card"
                    onClick={() => setSelectedCredit(credit)}
                  >
                    <h4>{credit.customerName}</h4>
                    <p className="phone">📱 {credit.customerPhone}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Details */}
        <div className="credit-details-panel">
          {selectedCredit ? (
            <>
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
                  <label>Total Amount Due</label>
                  <p className="amount">₹{selectedCredit.totalAmount.toFixed(2)}</p>
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

                  <div className="form-group">
                    <label>Payment Amount</label>
                    <input
                      type="number"
                      min="0"
                      max={selectedCredit.remainingAmount}
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

                  <button onClick={handleAddPayment} className="btn-primary">
                    Confirm Payment
                  </button>
                </div>
              )}

              <div className="bills-section">
                <h3>📑 Bills</h3>
                {selectedCredit.bills.length > 0 ? (
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
                      {selectedCredit.bills.map((bill, idx) => (
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
                {selectedCredit.payments.length > 0 ? (
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
                      {selectedCredit.payments.map((payment, idx) => (
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
