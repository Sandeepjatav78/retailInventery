import QRCode from "qrcode";

// --- CONFIGURATION ---
const PHARMACY_DETAILS = {
  name: "RADHE PHARMACY",
  address: "Hari Singh Chowk, Devi Mandir Road, Panipat",
  gstin: "06NNTPS0144E1ZL",
  dlNo: "RLF20HR2025005933, RLF21HR2025005925",
  phone: "9817500669, 8278357882",
  email: "radhepharmacy099@gmail.com",
  googleReviewUrl: "https://g.page/r/CQ4qGnEkSoD0EBM/review",
  upiId: "9817500669@okbizaxis",
};

// --- HELPER: NUMBER TO WORDS ---
const numberToWords = (num) => {
  const a = ["", "One ", "Two ", "Three ", "Four ", "Five ", "Six ", "Seven ", "Eight ", "Nine ", "Ten ", "Eleven ", "Twelve ", "Thirteen ", "Fourteen ", "Fifteen ", "Sixteen ", "Seventeen ", "Eighteen ", "Nineteen "];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  if ((num = num.toString()).length > 9) return "overflow";
  let n = ("000000000" + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
  if (!n) return;
  var str = "";
  str += n[1] != 0 ? (a[Number(n[1])] || b[n[1][0]] + " " + a[n[1][1]]) + "Crore " : "";
  str += n[2] != 0 ? (a[Number(n[2])] || b[n[2][0]] + " " + a[n[2][1]]) + "Lakh " : "";
  str += n[3] != 0 ? (a[Number(n[3])] || b[n[3][0]] + " " + a[n[3][1]]) + "Thousand " : "";
  str += n[4] != 0 ? (a[Number(n[4])] || b[n[4][0]] + " " + a[n[4][1]]) + "Hundred " : "";
  str += n[5] != 0 ? (str != "" ? "and " : "") + (a[Number(n[5])] || b[n[5][0]] + " " + a[n[5][1]]) + "only " : "";
  return str;
};

// --- MAIN GENERATOR FUNCTION ---
export const generateBillHTML = async (cartItems, invoiceData) => {
  let dateStr, timeStr;

  if (invoiceData.customDate) {
    const d = new Date(invoiceData.customDate);
    dateStr = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } else {
    dateStr = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  if (invoiceData.customTime) {
    timeStr = invoiceData.customTime;
  } else {
    timeStr = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }

  const isDuplicate = invoiceData.isDuplicate || false;
  const headerTitle = isDuplicate ? "DUPLICATE BILL" : "TAX INVOICE";
  const headerColor = "#0f766e";

  let totalTaxable = 0;
  let totalGST = 0;
  let totalSavings = 0;

  const finalTotal = invoiceData.grandTotal || cartItems.reduce((acc, item) => acc + item.total, 0);
  const doseAmount = invoiceData.doseAmount || 0;

  cartItems.forEach((item) => {
    const gstPercent = item.gst || 0;
    const inclusiveTotal = item.total;
    const baseValue = inclusiveTotal / (1 + gstPercent / 100);
    const taxAmount = inclusiveTotal - baseValue;
    totalTaxable += baseValue;
    totalGST += taxAmount;
    const mrp = Number(item.mrp) || 0;
    const rate = Number(item.price) || 0;
    const qty = Number(item.quantity) || 0;
    const lineSave = (mrp > 0 && rate > 0 && mrp > rate) ? (mrp - rate) * qty : 0;
    totalSavings += lineSave;
  });

  const amountInWords = numberToWords(Math.round(finalTotal));

  const mode = invoiceData.mode || "";
  const modeClass = mode === "Cash" ? "cash" : mode === "Online" ? "online" : "other";

  const upiString = `upi://pay?pa=${PHARMACY_DETAILS.upiId}&pn=${encodeURIComponent(PHARMACY_DETAILS.name)}&am=${finalTotal}&cu=INR`;
  const paymentQR = await QRCode.toDataURL(upiString);
  const reviewQR = await QRCode.toDataURL(PHARMACY_DETAILS.googleReviewUrl);

  // --- DOSE ROW HTML ---
  let doseRow = "";
  if (doseAmount > 0) {
    doseRow = `
        <tr style="background-color: #f0fdfa;">
            <td colspan="2"></td>
            <td colspan="7" style="text-align:right; font-weight:700; color:#0f766e; padding-right:10px;">Medical / Dose Charge</td>
            <td class="text-right" style="font-weight:700;">₹${parseFloat(doseAmount).toFixed(2)}</td>
        </tr>
      `;
  }

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Invoice #${invoiceData.no}</title>
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Dancing+Script:wght@700&display=swap" rel="stylesheet">
        <style>
          :root { --primary: ${headerColor}; --text: #1f2937; --gray: #6b7280; }
          body { font-family: 'Manrope', sans-serif; margin: 0; padding: 0; color: var(--text); background: #fff; font-size: 10px; line-height: 1.3; }
          @page { size: A5; margin: 5; }
          .page { width: 148mm; height: 210mm; padding: 10mm; position: relative; box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden; margin: 0 auto; }
          .watermark::before { content: ""; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-image: url('/Logo2.png'); background-repeat: no-repeat; background-position: center center; background-size: 50%; opacity: 0.05; z-index: -1; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid var(--primary); padding-bottom: 12px; margin-bottom: 15px; }
          .header-left { width: 65%; display: flex; flex-direction: column; gap: 5px; }
          .logo-row { display: flex; align-items: center; gap: 12px; }
          .logo-img { height: 45px; width: auto; }
          .brand-name { font-size: 32px; color: var(--primary); margin: 0; font-weight: 800; letter-spacing: -0.5px; line-height: 1; }
          .brand-info { font-size: 10px; color: #444; margin-top: 5px; }
          .header-right { text-align: right; width: 35%; }
          .invoice-label { background: var(--primary); color: white; padding: 6px 12px; font-size: 14px; font-weight: 700; text-transform: uppercase; border-radius: 4px; display: inline-block; margin-bottom: 5px; }
          .invoice-val { font-size: 14px; font-weight: 700; color: #000; margin-bottom: 2px; }
          .invoice-time { font-size: 11px; color: #666; }
          .info-grid { display: flex; justify-content: space-between; margin-bottom: 8px; background: #f8fafc; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0; }
          .info-box h4 { font-size: 9px; text-transform: uppercase; color: var(--gray); margin: 0 0 2px 0; }
          .info-box div { font-weight: 700; color: #000; font-size: 12px; }
          .mode-chip { display:inline-block; padding:2px 8px; border-radius:999px; font-size:9px; font-weight:700; letter-spacing:0.5px; }
          .mode-cash { background:#dcfce7; color:#166534; }
          .mode-online { background:#dbeafe; color:#1d4ed8; }
          .mode-other { background:#e5e7eb; color:#374151; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 5px; }
          th { text-align: left; padding: 5px 3px; background: var(--primary); color: white; font-size: 9px; text-transform: uppercase; font-weight: 700; }
          td { padding: 4px 3px; border-bottom: 1px solid #f1f5f9; font-weight: 500; font-size: 9px; vertical-align: top; }
          .text-right { text-align: right; } .text-center { text-align: center; }
          .footer-section { margin-top: auto; padding-top: 5px; border-top: 1px solid #eee; }
          .totals-wrapper { background: #f0fdfa; padding: 8px; border-radius: 6px; border: 1px solid #ccfbf1; }
          .total-row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 10px; color: #333; }
          .total-row.final { border-top: 1px solid #ccc; padding-top: 5px; margin-top: 5px; font-size: 14px; font-weight: 800; color: var(--primary); }
          .back-wrapper { border: 4px double var(--primary); border-radius: 12px; flex-grow: 1; padding: 20px; display: flex; flex-direction: column; align-items: center; text-align: center; justify-content: space-evenly; }
          .qr-area { display: flex; gap: 18px; margin: 8px 0 16px; justify-content: center; width: 100%; flex-wrap: wrap; }
          .qr-card { border: 1px solid #e5e7eb; padding: 6px; border-radius: 10px; width: 110px; background: #ffffff; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05); }
          .qr-img { width: 100%; display: block; border-radius: 6px; }
          .tagline-badge { display:inline-block; padding:4px 10px; border-radius:999px; background:#ecfdf5; color:#047857; font-size:8px; text-transform:uppercase; letter-spacing:1.4px; margin-bottom:4px; }
          .promo-grid { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:8px; width:100%; margin-top:6px; }
          .promo-card { background:#f9fafb; border-radius:8px; padding:6px 8px; border:1px solid #e5e7eb; font-size:9px; text-align:left; }
          .promo-title { font-weight:700; color:#111827; margin-bottom:2px; font-size:9px; }
          .promo-icon { margin-right:4px; }
          .highlight-pill { display:inline-block; padding:2px 8px; border-radius:999px; background:#fee2e2; color:#b91c1c; font-size:8px; font-weight:700; margin-top:4px; }
          .small-note { font-size:8px; color:#6b7280; margin-top:4px; }
          @media print { body { -webkit-print-color-adjust: exact; } .watermark::before { opacity: 0.05; } }
        </style>
      </head>
      <body>
        <div class="page watermark">
            <div class="header">
                <div class="header-left">
                    <div class="logo-row"><img src="/Logo2.png" class="logo-img" /><h1 class="brand-name">${PHARMACY_DETAILS.name}</h1></div>
                    <div class="brand-info">${PHARMACY_DETAILS.address}<br><strong>GSTIN:</strong> ${PHARMACY_DETAILS.gstin} | <strong>DL:</strong> ${PHARMACY_DETAILS.dlNo}<br><strong>Phone:</strong> ${PHARMACY_DETAILS.phone}</div>
                </div>
                <div class="header-right">
                    <div class="invoice-label">${headerTitle}</div>
                    <div class="invoice-val">#${invoiceData.no}</div>
                    <div class="invoice-time">${dateStr} &bull; ${timeStr}</div>
                </div>
            </div>

            <div class="info-grid">
                <div class="info-box">
                  <h4>Billed To</h4>
                  <div>${invoiceData.name}</div>
                  <div style="font-weight:400; font-size:10px">${invoiceData.phone || ""}</div>
                </div>
                <div class="info-box" style="text-align: center;">
                  <h4>Dr. Ref</h4>
                  <div>${invoiceData.doctor || "Self / OTC"}</div>
                </div>
                <div class="info-box" style="text-align: right;">
                  <h4>Mode</h4>
                  <div><span class="mode-chip mode-${modeClass}">${mode || "-"}</span></div>
                </div>
            </div>

            <div>
                <table>
                    <thead>
                        <tr>
                            <th style="width: 4%;">#</th>
                            <th style="width: 30%;">Item Name</th>
                            <th style="width: 8%;">HSN</th>
                            <th style="width: 12%;">Batch</th>
                            <th class="text-right" style="width: 9%;">MRP</th>
                            <th class="text-right" style="width: 9%;">Rate</th>
                            <th class="text-center" style="width: 7%;">Disc%</th>
                            <th class="text-center" style="width: 7%;">GST%</th>
                            <th class="text-center" style="width: 6%;">Qty</th>
                            <th class="text-right" style="width: 12%;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${cartItems.map((item, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>
                                  <div style="font-weight:700; color:#000;">${item.name}</div>
                                  <div style="font-size:8px; color:#666">Exp: ${item.expiry ? new Date(item.expiry).toLocaleDateString("en-IN", { month: "short", year: "2-digit" }) : "-"}</div>
                                  ${item.discount > 0 ? `<div style="font-size:8px; color:#16a34a; font-weight:600;">You saved ₹${(((item.mrp || 0) - (item.price || 0)) * (item.quantity || 0)).toFixed(2)}</div>` : ""}
                                </td>
                                <td>${item.hsn || "-"}</td>
                                <td>${item.batch || "-"}</td>
                                <td class="text-right" style="color:#666; text-decoration: line-through;">₹${item.mrp}</td>
                                <td class="text-right" style="font-weight:bold">₹${item.price}</td>
                                <td class="text-center" style="color:red;">${item.discount > 0 ? item.discount + "%" : "-"}</td>
                                <td class="text-center">${item.gst || 0}%</td>
                                <td class="text-center">${item.quantity} ${item.unit === "loose" ? "L" : "P"}</td>
                                <td class="text-right" style="font-weight:700;">₹${item.total.toFixed(2)}</td>
                            </tr>`).join("")}
                        ${doseRow}
                    </tbody>
                </table>
            </div>

            <div class="footer-section">
                <div style="display:flex; justify-content:space-between; align-items: flex-end;">
                    <div style="width:60%">
                        <div style="font-weight: 700; color: var(--primary); font-size: 11px; margin-bottom: 5px; text-transform: capitalize;">Amount: ${amountInWords} Only</div>
                        <div style="font-size:9px; color:#666">Terms: Goods once sold will not be taken back.</div>
                        <div style="font-size:8px; color:#4b5563; margin-top:2px;">Save this bill – it helps us serve you faster on your next visit.</div>
                    </div>
                    <div style="width:35%" class="totals-wrapper">
                        <div class="total-row"><span>Taxable Amount</span><span>₹${totalTaxable.toFixed(2)}</span></div>
                        <div class="total-row"><span>Total GST</span><span>₹${totalGST.toFixed(2)}</span></div>
                        <div class="total-row"><span>Total Savings</span><span style="color:#16a34a;">₹${totalSavings.toFixed(2)}</span></div>
                        <div class="total-row final"><span>NET PAYABLE</span><span>₹${Math.round(finalTotal).toFixed(2)}</span></div>
                    </div>
                </div>
            </div>
        </div>

        <div class="page watermark" style="page-break-before: always;">
          <div class="back-wrapper">
            <div style="text-align:center; margin-bottom:8px;">
              <span class="tagline-badge">Your Health, Our Priority</span>
              <div style="font-family: 'Dancing Script', cursive; font-size: 30px; color: var(--primary); margin-bottom:2px;">Thank You!</div>
              <div style="font-size: 9px; letter-spacing: 1.8px; text-transform: uppercase; color: var(--gray);">for trusting ${PHARMACY_DETAILS.name}</div>
            </div>

            <div class="qr-area">
              ${paymentQR ? `<div class="qr-card"><img src="${paymentQR}" class="qr-img" /><div style="font-size: 9px; font-weight: 700; margin-top: 4px;">Scan to Pay<br>₹${Math.round(finalTotal)}</div></div>` : ""}
              ${reviewQR ? `<div class="qr-card"><img src="${reviewQR}" class="qr-img" /><div style="font-size: 9px; font-weight: 700; margin-top: 4px;">Rate Us on Google</div></div>` : ""}
            </div>

            <div class="promo-grid">
              <div class="promo-card">
                <div class="promo-title"><span class="promo-icon">🏥</span>All Medicines & Surgical</div>
                <div>Branded & generic medicines, injections, drip sets, and daily health essentials under one roof.</div>
                <div class="small-note">Ask for offers on chronic medicines (BP, Sugar, Thyroid).</div>
              </div>
              <div class="promo-card">
                <div class="promo-title"><span class="promo-icon">🚚</span>Home Delivery*</div>
                <div>Call / WhatsApp your prescription to <strong>${PHARMACY_DETAILS.phone}</strong> for quick delivery in nearby areas.</div>
                <div class="small-note">*T&amp;C apply. Within serviceable radius only.</div>
              </div>
              <div class="promo-card">
                <div class="promo-title"><span class="promo-icon">📲</span>Medicine Reminder</div>
                <div>Save our number &amp; message <strong>"REMINDER"</strong> to get monthly refill reminders for your regular medicines.</div>
              </div>
              <div class="promo-card">
                <div class="promo-title"><span class="promo-icon">❤️</span>Family Health Partner</div>
                <div>Keep this bill safely &amp; show it on your next visit for faster service and correct prescription matching.</div>
                <span class="highlight-pill">Save this bill in your file</span>
              </div>
            </div>

            <div style="background: #ecfdf5; border: 1px solid #6ee7b7; padding: 8px; border-radius: 8px; width: 100%; text-align: left; margin-top:10px;">
              <h3 style="color: #047857; margin: 0 0 3px 0; font-size: 10px;">🍎 Healthy Living Tip</h3>
              <p style="margin: 0; font-size: 9px; color: #064e3b;"><strong>Check Expiry &amp; Dosage:</strong> Always verify expiry dates and follow your doctor’s dose exactly. When in doubt, ask your pharmacist.</p>
            </div>
          </div>
        </div>
        <script>setTimeout(function() { window.print(); }, 800);</script>
      </body>
    </html>
  `;
};