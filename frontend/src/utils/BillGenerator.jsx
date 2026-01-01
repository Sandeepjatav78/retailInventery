import QRCode from 'qrcode'; 

// --- CONFIGURATION ---
const PHARMACY_DETAILS = {
  name: "RADHE PHARMACY",
  address: "Hari Singh Chowk, Devi Mandir Road, Panipat",
  gstin: "06NNTPS0144E1ZL",
  dlNo: "RLF20HR2025005933, RLF21HR2025005925",
  phone: "9817500669, 8278357882",
  email: "radhepharmacy099@gmail.com",
  
  // LINKS
  googleReviewUrl: "https://g.page/r/CQ4qGnEkSoD0EBM/review", 
  upiId: "9817500669@okbizaxis" 
};

// --- HELPER: NUMBER TO WORDS ---
const numberToWords = (num) => {
  const a = ['','One ','Two ','Three ','Four ', 'Five ','Six ','Seven ','Eight ','Nine ','Ten ','Eleven ','Twelve ','Thirteen ','Fourteen ','Fifteen ','Sixteen ','Seventeen ','Eighteen ','Nineteen '];
  const b = ['', '', 'Twenty','Thirty','Forty','Fifty', 'Sixty','Seventy','Eighty','Ninety'];
  if ((num = num.toString()).length > 9) return 'overflow';
  let n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
  if (!n) return; var str = '';
  str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
  str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
  str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
  str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
  str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) + 'only ' : '';
  return str;
};

// --- MAIN GENERATOR FUNCTION ---
export const generateBillHTML = async (cartItems, invoiceData) => {
  const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = new Date().toLocaleTimeString('en-IN', {hour: '2-digit', minute:'2-digit'});
  
  let totalTaxable = 0;
  let totalGST = 0;
  const finalTotal = cartItems.reduce((acc, item) => acc + item.total, 0);

  cartItems.forEach(item => {
      const gstPercent = item.gst || 0;
      const inclusiveTotal = item.total; 
      const baseValue = inclusiveTotal / (1 + (gstPercent / 100));
      const taxAmount = inclusiveTotal - baseValue;
      totalTaxable += baseValue;
      totalGST += taxAmount;
  });

  const amountInWords = numberToWords(Math.round(finalTotal));

  // --- GENERATE QR CODES ---
  const upiString = `upi://pay?pa=${PHARMACY_DETAILS.upiId}&pn=${encodeURIComponent(PHARMACY_DETAILS.name)}&am=${finalTotal}&cu=INR`;
  const paymentQR = await QRCode.toDataURL(upiString);
  const reviewQR = await QRCode.toDataURL(PHARMACY_DETAILS.googleReviewUrl);

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Invoice #${invoiceData.no}</title>
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Dancing+Script:wght@700&display=swap" rel="stylesheet">
        <style>
          :root { 
            --primary: #0f766e; 
            --primary-light: #f0fdfa;
            --text: #1f2937;
            --gray: #6b7280;
            --border: #e5e7eb;
          }
          
          body { font-family: 'Manrope', sans-serif; margin: 0; padding: 0; color: var(--text); background: #fff; font-size: 11px; line-height: 1.3; }
          
          @page { size: A5; margin: 5; }
          
          .page {
            width: 148mm;
            height: 210mm;
            padding: mm;
            position: relative;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            margin: 0 auto;
          }

          .watermark::before {
            content: ""; position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background-image: url('/Logo2.png'); 
            background-repeat: no-repeat; background-position: center center; background-size: 50%;
            opacity: 0.05; z-index: -1;
          }

          .page-break { page-break-after: always; }

          /* --- ENHANCED HEADER --- */
          .header { 
            display: flex; justify-content: space-between; align-items: flex-start;
            border-bottom: 3px solid var(--primary); 
            padding-bottom: 12px; margin-bottom: 15px; 
          }
          
          .header-left { width: 65%; display: flex; flex-direction: column; gap: 5px; }
          .logo-row { display: flex; align-items: center; gap: 12px; }
          .logo-img { height: 45px; width: auto; } /* Shows logo in header */
          
          .brand-name { font-size: 32px; color: var(--primary); margin: 0; font-weight: 800; letter-spacing: -0.5px; line-height: 1; }
          
          .brand-info { font-size: 10px; color: #444; margin-top: 5px; }
          .brand-info strong { color: var(--primary); }

          .header-right { text-align: right; width: 35%; }
          .invoice-label { 
            background: var(--primary); color: white; padding: 6px 12px; 
            font-size: 14px; font-weight: 700; text-transform: uppercase; 
            border-radius: 4px; display: inline-block; margin-bottom: 5px;
          }
          .invoice-val { font-size: 14px; font-weight: 700; color: #000; margin-bottom: 2px; }
          .invoice-time { font-size: 11px; color: #666; }

          /* CUSTOMER INFO BOXES */
          .info-grid { display: flex; justify-content: space-between; margin-bottom: 8px; background: #f8fafc; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0; }
          .info-box { flex: 1; }
          .info-box h4 { font-size: 9px; text-transform: uppercase; color: var(--gray); margin: 0 0 2px 0; letter-spacing: 0.5px; }
          .info-box div { font-weight: 700; color: #000; font-size: 12px; }

          /* TABLE */
          table { width: 100%; border-collapse: collapse; margin-bottom: 5px; }
          th { 
            text-align: left; padding: 6px 4px; 
            background: var(--primary); color: white; 
            font-size: 10px; text-transform: uppercase; font-weight: 700; 
            border-bottom: 2px solid #004d40;
          }
          td { padding: 5px 4px; border-bottom: 1px solid #f1f5f9; font-weight: 500; font-size: 10px; vertical-align: top; }
          .text-right { text-align: right; } .text-center { text-align: center; }
          tr:nth-child(even) { background-color: #f8fafc; }

          /* FOOTER */
          .footer-section { margin-top: auto; padding-top: 5px; border-top: 1px solid #eee; }
          .amount-words { font-weight: 700; color: var(--primary); font-size: 11px; margin-bottom: 5px; text-transform: capitalize; }
          
          .totals-wrapper { background: #f0fdfa; padding: 8px; border-radius: 6px; border: 1px solid #ccfbf1; }
          .total-row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 10px; color: #333; }
          .total-row.final { border-top: 1px solid #ccc; padding-top: 5px; margin-top: 5px; font-size: 14px; font-weight: 800; color: var(--primary); }
          
          .signature { margin-top: 10px; text-align: right; }
          .sig-line { display: inline-block; border-top: 1px solid #000; width: 120px; }

          /* --- PAGE 2: BACKSIDE --- */
          .back-wrapper { 
            border: 4px double var(--primary); 
            border-radius: 12px; 
            flex-grow: 1; 
            padding: 20px; 
            display: flex; flex-direction: column; align-items: center; text-align: center;
            justify-content: space-evenly; 
          }
          
          .thank-you { font-family: 'Dancing Script', cursive; font-size: 28px; color: var(--primary); margin: 0; }
          .trust-msg { font-size: 9px; letter-spacing: 2px; text-transform: uppercase; color: var(--gray); margin-bottom: 10px; }

          .qr-area { display: flex; gap: 30px; margin-bottom: 15px; justify-content: center; width: 100%; }
          .qr-card { border: 1px solid #ddd; padding: 5px; border-radius: 8px; width: 100px; background: white; }
          .qr-img { width: 100%; display: block; }
          .qr-label { font-size: 9px; font-weight: 700; color: var(--brand); margin-top: 5px; }

          .content-box { text-align: left; width: 100%; }
          .content-box h3 { margin: 0 0 4px 0; color: #b45309; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
          .content-box p { font-size: 10px; color: #444; margin: 0; font-style: italic; }

          .health-tip { background: #ecfdf5; border: 1px solid #6ee7b7; padding: 10px; border-radius: 8px; width: 100%; text-align: left; margin: 10px 0; }
          .health-tip h3 { color: #047857; margin: 0 0 4px 0; font-size: 11px; font-weight: 800; }
          .health-tip p { margin: 0; font-size: 10px; color: #064e3b; }

          .terms-box { text-align: left; width: 100%; border-top: 1px solid #eee; padding-top: 10px; }
          .terms-box h3 { margin: 0 0 5px 0; color: var(--primary); font-size: 11px; }
          .terms-box ul { padding-left: 15px; margin: 0; }
          .terms-box li { margin-bottom: 2px; font-size: 9px; color: #555; }

          .emergency-strip { display: flex; justify-content: space-around; width: 100%; background: #1f2937; color: white; padding: 8px; border-radius: 20px; font-size: 9px; margin-top: 10px; }

          @media print { 
            body { -webkit-print-color-adjust: exact; } 
            .header, .invoice-label, .info-grid, .totals-wrapper, .health-tip, .qr-card, .gst-label, .grand-total, .emergency-strip { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .watermark::before { opacity: 0.05; }
          }
        </style>
      </head>
      <body>
        
        <div class="page watermark page-break">
            
            <div class="header">
                <div class="header-left">
                    <div class="logo-row">
                        <img src="/Logo2.png" class="logo-img" alt="Logo" />
                        <h1 class="brand-name">${PHARMACY_DETAILS.name}</h1>
                    </div>
                    <div class="brand-info">
                        ${PHARMACY_DETAILS.address}<br>
                        <strong>GSTIN:</strong> ${PHARMACY_DETAILS.gstin} | <strong>DL:</strong> ${PHARMACY_DETAILS.dlNo}<br>
                        <strong>Phone:</strong> ${PHARMACY_DETAILS.phone}
                    </div>
                </div>
                <div class="header-right">
                    <div class="invoice-label">Tax Invoice</div>
                    <div class="invoice-val">#${invoiceData.no}</div>
                    <div class="invoice-time">${date} &bull; ${time}</div>
                </div>
            </div>

            <div class="info-grid">
                <div class="info-box">
                    <h4>Billed To</h4>
                    <div>${invoiceData.name}</div>
                    <div style="font-weight:400; font-size:10px">${invoiceData.phone || ''}</div>
                </div>
                <div class="info-box" style="text-align: center;">
                    <h4>Dr. Ref</h4>
                    <div>${invoiceData.doctor || 'Self'}</div>
                </div>
                <div class="info-box" style="text-align: right;">
                    <h4>Mode</h4>
                    <div>${invoiceData.mode}</div>
                </div>
            </div>

            <div>
                <table>
                    <thead>
                        <tr>
                            <th style="width: 5%;">#</th>
                            <th style="width: 35%;">Item Name</th>
                            <th style="width: 12%;">Batch</th>
                            <th class="text-right" style="width: 10%;">MRP</th>
                            <th class="text-right" style="width: 10%;">Rate</th>
                            <th class="text-center" style="width: 8%;">Disc%</th>
                            <th class="text-center" style="width: 8%;">Qty</th>
                            <th class="text-right" style="width: 12%;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${cartItems.map((item, i) => {
                            const discount = item.mrp > item.price 
                                ? ((item.mrp - item.price) / item.mrp * 100).toFixed(1) 
                                : 0;
                            return `
                            <tr>
                                <td>${i+1}</td>
                                <td>
                                    <div style="font-weight:700; color:#000;">${item.name}</div>
                                    <div style="font-size:9px; color:#666">Exp: ${item.expiry ? new Date(item.expiry).toLocaleDateString('en-IN', {month:'short', year:'2-digit'}) : '-'} | HSN: ${item.hsn || '-'}</div>
                                </td>
                                <td>${item.batch}</td>
                                <td class="text-right" style="color:#666; text-decoration: line-through;">₹${item.mrp}</td>
                                <td class="text-right" style="font-weight:bold">₹${item.price}</td>
                                <td class="text-center" style="color:red; font-size:9px">${discount > 0 ? discount + '%' : '-'}</td>
                                <td class="text-center">${item.quantity}</td>
                                <td class="text-right" style="font-weight:700;">₹${item.total.toFixed(2)}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>

            <div class="footer-section">
                <div style="display:flex; justify-content:space-between; align-items: flex-end;">
                    <div style="width:60%">
                        <div class="amount-words">Amount: ${amountInWords} Only</div>
                        <div style="font-size:9px; color:#666">Terms: Goods once sold will not be taken back.</div>
                    </div>
                    <div style="width:35%" class="totals-wrapper">
                        <div class="total-row"><span>Taxable Amount</span><span>₹${totalTaxable.toFixed(2)}</span></div>
                        <div class="total-row"><span>Total GST</span><span>₹${totalGST.toFixed(2)}</span></div>
                        <div class="total-row"><span>Round Off</span><span>0.00</span></div>
                        <div class="total-row final"><span>NET PAYABLE</span><span>₹${Math.round(finalTotal).toFixed(2)}</span></div>
                    </div>
                </div>
                <div class="signature">
                    <span class="sig-line"></span><br><span style="font-size:9px">Authorized Signatory</span>
                </div>
            </div>
        </div>

        <div class="page watermark">
            <div class="back-wrapper">
                
                <div>
                    <div class="thank-you">Thank You!</div>
                    <div class="trust-msg">For Choosing Radhe Pharmacy</div>

                    <div class="content-box" style="background:transparent; border:none; text-align:center; margin-bottom:15px;">
                        <p style="font-size:11px; color:#555;">"Your health is our priority. We guarantee <strong>100% Genuine Medicines</strong> stored at optimal temperatures."</p>
                    </div>

                    <div class="qr-area">
                        ${paymentQR ? `
                        <div class="qr-card">
                            <img src="${paymentQR}" class="qr-img" />
                            <div class="qr-label">Scan to Pay<br>₹${Math.round(finalTotal)}</div>
                        </div>` : ''}
                        
                        ${reviewQR ? `
                        <div class="qr-card">
                            <img src="${reviewQR}" class="qr-img" />
                            <div class="qr-label">Rate Us</div>
                        </div>` : ''}
                    </div>
                </div>

                <div class="health-tip">
                    <h3>🍎 Healthy Living Tip</h3>
                    <p><strong>Stay Hydrated:</strong> Drinking enough water helps maintain body fluids and energy.</p>
                    <p style="margin-top:4px"><strong>Know Your Meds:</strong> Always complete your antibiotic course as prescribed.</p>
                </div>

                <div class="terms-box">
                    <h3>📢 Terms & Conditions</h3>
                    <ul>
                        <li><strong>Returns:</strong> Acceptable within 7 days with original bill. Items must be intact.</li>
                        <li><strong>Non-Returnable:</strong> Cut strips, loose tablets & fridge items (Insulin).</li>
                        <li><strong>Consultation:</strong> We recommend consulting a doctor before changing dosage.</li>
                    </ul>
                </div>

                <div class="emergency-strip">
                    <div class="em-item">🚑 Ambulance: 102</div>
                    <div class="em-item">👮 Police: 100</div>
                    <div class="em-item">📞 Store: ${PHARMACY_DETAILS.phone.split(',')[0]}</div>
                </div>

            </div>
        </div>

        <script>
           setTimeout(function() { window.print(); }, 800);
        </script>
      </body>
    </html>
  `;
};