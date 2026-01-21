import React, { useState, useEffect } from 'react';
import api from '../api/axios';

const EditBillModal = ({ sale, onClose, onUpdateSuccess }) => {
    // Split ISO Date into Date and Time for inputs
    const initialDate = new Date(sale.date).toISOString().split('T')[0];
    const initialTime = new Date(sale.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    const [formData, setFormData] = useState({
        customerName: sale.customerDetails?.name || '',
        phone: sale.customerDetails?.phone || '',
        doctor: sale.customerDetails?.doctor || '',
        paymentMode: sale.paymentMode || 'Cash',
        billDate: initialDate,
        billTime: initialTime,
    });

    const [items, setItems] = useState(sale.items || []);

    // --- CALCULATE TOTAL ---
    const calculateTotal = (currentItems) => {
        return currentItems.reduce((acc, item) => acc + (parseFloat(item.total) || 0), 0);
    };

    // --- HANDLERS ---
    const handleItemChange = (index, field, value) => {
        const newItems = [...items];
        const item = newItems[index];
        
        if (field === 'quantity') {
            const qty = parseFloat(value) || 0;
            item.quantity = qty;
            // Recalculate Row Total (Unit price * Qty)
            // Note: If it's loose, you might want to adjust logic, but usually Price is per unit in DB
            // For simplicity in Edit, we assume Price is the RATE user entered.
            item.total = item.price * qty; 
        } 
        else if (field === 'price') {
            const price = parseFloat(value) || 0;
            item.price = price;
            item.total = price * item.quantity;
        }

        setItems(newItems);
    };

    const handleDeleteItem = (index) => {
        if(window.confirm("Remove this item?")) {
            const newItems = [...items];
            newItems.splice(index, 1);
            setItems(newItems);
        }
    };

    const handleSave = async () => {
        const grandTotal = calculateTotal(items);
        const combinedDateTime = new Date(`${formData.billDate}T${formData.billTime}`);

        const payload = {
            customerDetails: {
                name: formData.customerName,
                phone: formData.phone,
                doctor: formData.doctor
            },
            paymentMode: formData.paymentMode,
            date: combinedDateTime,
            items: items,
            totalAmount: grandTotal
        };

        try {
            await api.put(`/sales/${sale._id}`, payload);
            alert("✅ Bill Updated Successfully!");
            onUpdateSuccess();
        } catch (err) {
            alert("❌ Update Failed: " + err.message);
        }
    };

    const inputClass = "w-full p-2 border rounded text-sm focus:ring-2 focus:ring-purple-500 outline-none";

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white w-full max-w-4xl rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
                
                {/* HEADER */}
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <h2 className="text-lg font-bold text-gray-800">✏️ Edit Bill #{sale.invoiceNo}</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-red-500 text-2xl font-bold">&times;</button>
                </div>

                {/* SCROLLABLE BODY */}
                <div className="p-6 overflow-y-auto flex-1">
                    
                    {/* 1. BILL DETAILS */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Date</label>
                            <input type="date" className={inputClass} value={formData.billDate} onChange={e => setFormData({...formData, billDate: e.target.value})} />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Time</label>
                            <input type="time" className={inputClass} value={formData.billTime} onChange={e => setFormData({...formData, billTime: e.target.value})} />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Payment Mode</label>
                            <select className={inputClass} value={formData.paymentMode} onChange={e => setFormData({...formData, paymentMode: e.target.value})}>
                                <option value="Cash">Cash</option>
                                <option value="Online">Online</option>
                            </select>
                        </div>
                    </div>

                    {/* 2. CUSTOMER DETAILS */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 bg-purple-50 p-4 rounded-lg border border-purple-100">
                        <div>
                            <label className="text-xs font-bold text-purple-700 uppercase">Customer Name</label>
                            <input className={inputClass} value={formData.customerName} onChange={e => setFormData({...formData, customerName: e.target.value})} />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-purple-700 uppercase">Phone</label>
                            <input className={inputClass} value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-purple-700 uppercase">Doctor</label>
                            <input className={inputClass} value={formData.doctor} onChange={e => setFormData({...formData, doctor: e.target.value})} />
                        </div>
                    </div>

                    {/* 3. ITEMS TABLE */}
                    <h3 className="font-bold text-gray-700 mb-2">🛒 Items (Modify Qty, Price or Remove)</h3>
                    <div className="overflow-x-auto border rounded-lg">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-100 border-b">
                                <tr>
                                    <th className="p-3">Item Name</th>
                                    <th className="p-3 w-24">Qty</th>
                                    <th className="p-3 w-24">Rate</th>
                                    <th className="p-3 w-24 text-right">Total</th>
                                    <th className="p-3 w-10">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {items.map((item, i) => (
                                    <tr key={i} className="hover:bg-gray-50">
                                        <td className="p-3">
                                            <div className="font-bold text-gray-800">{item.name}</div>
                                            <div className="text-xs text-gray-500">{item.batch || 'Manual'}</div>
                                        </td>
                                        <td className="p-3">
                                            <input type="number" className="w-full p-1 border rounded text-center" 
                                                value={item.quantity} 
                                                onChange={(e) => handleItemChange(i, 'quantity', e.target.value)} 
                                            />
                                        </td>
                                        <td className="p-3">
                                            <input type="number" className="w-full p-1 border rounded text-center" 
                                                value={item.price} 
                                                onChange={(e) => handleItemChange(i, 'price', e.target.value)} 
                                            />
                                        </td>
                                        <td className="p-3 text-right font-bold text-gray-700">
                                            ₹{item.total.toFixed(2)}
                                        </td>
                                        <td className="p-3 text-center">
                                            <button onClick={() => handleDeleteItem(i)} className="text-red-500 hover:bg-red-100 p-1 rounded">🗑️</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                </div>

                {/* FOOTER */}
                <div className="p-4 border-t bg-gray-50 rounded-b-xl flex justify-between items-center">
                    <div className="text-xl font-extrabold text-gray-800">
                        Total: <span className="text-purple-700">₹{calculateTotal(items).toFixed(0)}</span>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-100">Cancel</button>
                        <button onClick={handleSave} className="px-6 py-2 bg-purple-600 text-white font-bold rounded-lg shadow-md hover:bg-purple-700 transition-all">Save Changes</button>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default EditBillModal;