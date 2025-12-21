import React, { useState } from "react";
import api from "../api/axios";

const InventoryTable = ({ meds, onUpdate }) => {
  const [editId, setEditId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [showSP, setShowSP] = useState(false);

  const handleToggleSP = async () => {
    if (showSP) {
      setShowSP(false);
      return;
    }
    const password = prompt("🔒 Enter Admin Password to view prices:");
    if (!password) return;
    try {
      const res = await api.post("/admin/verify", { password });
      if (res.data.success) setShowSP(true);
      else alert("❌ Wrong Password! Access Denied.");
    } catch (err) {
      alert("Server Error");
    }
  };

  const handleEditClick = (med) => {
    setEditId(med._id);
    setEditFormData({ ...med });
  };

  const handleEditFormChange = (e) => {
    setEditFormData({ ...editFormData, [e.target.name]: e.target.value });
  };

  const handleSaveClick = () => {
    onUpdate(editId, editFormData);
    setEditId(null);
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ marginBottom: "10px", textAlign: "right" }}>
        <button
          onClick={handleToggleSP}
          style={{
            background: showSP ? "red" : "#6c757d",
            color: "white",
            border: "none",
            padding: "5px 10px",
            cursor: "pointer",
            borderRadius: "4px",
            fontSize: "12px",
          }}
        >
          {showSP
            ? "🙈 Hide Price Column"
            : "🔒 Admin View (Password Required)"}
        </button>
      </div>

      <table
        style={{ width: "100%", borderCollapse: "collapse", marginTop: "10px" }}
      >
        <thead style={{ background: "#f1f1f1" }}>
          <tr>
            <th style={{ padding: "10px", textAlign: "left" }}>Name</th>
            <th style={{ padding: "10px", textAlign: "left" }}>Batch</th>
            <th style={{ padding: "10px", textAlign: "left" }}>HSN</th>{" "}
            {/* NEW HEADER */}
            <th style={{ padding: "10px", textAlign: "left" }}>Qty</th>
            <th style={{ padding: "10px", textAlign: "left" }}>Max Disc%</th>
            <th style={{ padding: "10px", textAlign: "left" }}>MRP</th>
            {showSP && (
              <th style={{ padding: "10px", textAlign: "left" }}>
                SP (Secret)
              </th>
            )}
            <th style={{ padding: "10px", textAlign: "left" }}>Bill</th>
            <th style={{ padding: "10px", textAlign: "left" }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {meds.map((m) => (
            <tr key={m._id} style={{ borderBottom: "1px solid #eee" }}>
              {editId === m._id ? (
                <>
                  <td>
                    <input
                      name="productName"
                      value={editFormData.productName}
                      onChange={handleEditFormChange}
                      style={{ width: "80%" }}
                    />
                  </td>
                  <td>
                    <input
                      name="batchNumber"
                      value={editFormData.batchNumber}
                      onChange={handleEditFormChange}
                      style={{ width: "80%" }}
                    />
                  </td>

                  {/* NEW EDIT INPUT FOR HSN */}
                  <td>
                    <input
                      name="hsnCode"
                      value={editFormData.hsnCode}
                      onChange={handleEditFormChange}
                      style={{ width: "60px" }}
                    />
                  </td>

                  <td>
                    <input
                      name="quantity"
                      type="number"
                      value={editFormData.quantity}
                      onChange={handleEditFormChange}
                      style={{ width: "50px" }}
                    />
                  </td>
                  <td>
                    <input
                      name="maxDiscount"
                      type="number"
                      value={editFormData.maxDiscount}
                      onChange={handleEditFormChange}
                      style={{ width: "50px" }}
                    />
                  </td>
                  <td>
                    <input
                      name="mrp"
                      type="number"
                      value={editFormData.mrp}
                      onChange={handleEditFormChange}
                      style={{ width: "50px" }}
                    />
                  </td>

                  {showSP && (
                    <td>
                      <input
                        name="sellingPrice"
                        type="number"
                        value={editFormData.sellingPrice}
                        onChange={handleEditFormChange}
                        style={{ width: "50px" }}
                      />
                    </td>
                  )}

                  <td>-</td>
                  <td>
                    <button
                      onClick={handleSaveClick}
                      style={{
                        marginRight: "5px",
                        color: "green",
                        cursor: "pointer",
                      }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditId(null)}
                      style={{ color: "red", cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                  </td>
                </>
              ) : (
                <>
                  <td style={{ padding: "10px" }}>{m.productName}</td>
                  <td style={{ padding: "10px" }}>{m.batchNumber}</td>

                  {/* NEW DISPLAY CELL FOR HSN */}
                  <td style={{ padding: "10px" }}>{m.hsnCode || "-"}</td>

                  <td style={{ padding: "10px" }}>{m.quantity}</td>
                  <td style={{ padding: "10px", color: "orange" }}>
                    {m.maxDiscount}%
                  </td>
                  <td style={{ padding: "10px" }}>{m.mrp}</td>

                  {showSP && (
                    <td
                      style={{
                        padding: "10px",
                        fontWeight: "bold",
                        color: "green",
                      }}
                    >
                      ₹{m.sellingPrice}
                    </td>
                  )}

                  <td style={{ padding: "10px" }}>
                    {m.billImage ? (
                      <a
                        href={m.billImage}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "blue" }}
                      >
                        View
                      </a>
                    ) : (
                      "No Bill"
                    )}
                  </td>

                  <td style={{ padding: "10px" }}>
                    <button
                      onClick={() => handleEditClick(m)}
                      style={{
                        padding: "5px 10px",
                        background: "#ffc107",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default InventoryTable;
