// Shared helpers for sale-entry screens: expiry checks + cost-price popup window.

export const getExpiryInfo = (expiryDate) => {
  if (!expiryDate) return null;
  const d = new Date(expiryDate);
  if (isNaN(d.getTime())) return null;
  const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  const now = new Date();
  return { date: d, endOfMonth, isExpired: now > endOfMonth, daysLeft: Math.floor((endOfMonth - now) / 86400000) };
};

export const formatExpiryShort = (v) => {
  if (!v) return "-";
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
};

// True when stock is not yet expired but its expiry month ends within `withinDays`.
export const isExpiringSoon = (v, withinDays = 90) => {
  const info = getExpiryInfo(v);
  if (!info || info.isExpired) return false;
  return info.daysLeft <= withinDays;
};

export const formatDateFull = (v) => {
  if (!v) return "-";
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

// Opens a small read-only window showing the cost price details of an item (#6).
export const openCostPriceWindow = (item) => {
  const w = window.open("", "_blank", "width=400,height=500");
  if (!w) return alert("Popup blocked! Allow popups to view cost details.");
  const safeName = String(item.name || "Item").replace(/</g, "&lt;");
  const rows = [
    ["Cost Price (CP)", `₹${Number(item.costPrice || 0).toFixed(2)}`, "#b91c1c"],
    ["Selling Price", `₹${Number(item.price || item.sellingPrice || 0).toFixed(2)}`, "#0f766e"],
    ["MRP", `₹${Number(item.mrp || 0).toFixed(2)}`, ""],
    ["Discount", `${Number(item.discount || 0).toFixed(2)}%`, ""],
    ["GST", `${Number(item.gst || 0)}%`, ""],
    ["Stock Available", `${Number(item.maxStock ?? item.quantity ?? 0)} packs`, ""],
    ["Purchase Invoice", String(item.purchaseInvoiceNo || "-"), ""],
    ["Party / Supplier", String(item.partyName || "-"), ""]
  ];
  const tableHTML = rows
    .map(([k, v, color]) => `<tr><td style="padding:7px 4px; border-bottom:1px solid #f3f4f6; color:#374151;">${k}</td><td style="padding:7px 4px; border-bottom:1px solid #f3f4f6; text-align:right; font-weight:bold; color:${color || "#111827"};">${v}</td></tr>`)
    .join("");
  w.document.write(`<html><head><title>Cost Details</title></head><body style="background:#f9fafb; margin:0;">
    <div style="font-family: Arial, sans-serif; max-width: 360px; margin: 24px auto; padding: 22px; border: 2px solid #e5e7eb; border-radius: 12px; background:#fff;">
      <h2 style="margin:0 0 4px; font-size:16px; color:#0f766e;">${safeName}</h2>
      <div style="font-size:12px; color:#6b7280; margin-bottom:14px;">Batch: ${String(item.batch || "-")} &nbsp;|&nbsp; Exp: ${formatDateFull(item.expiry || item.expiryDate)}</div>
      <table style="width:100%; font-size:13px; border-collapse:collapse;">${tableHTML}</table>
      <div style="margin-top:14px; font-size:11px; color:#9ca3af; text-align:center;">Cost details are for pharmacy reference only.</div>
    </div></body></html>`);
  w.document.close();
};