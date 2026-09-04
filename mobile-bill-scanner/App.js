import React, { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Image,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  StatusBar,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Update BACKEND_URL with your local computer IP or server URL
const BACKEND_URL = 'https://retail-backend-phi.vercel.app/api';

const TOKEN_KEY = 'radhe_auth_token';
const ROLE_KEY = 'radhe_auth_role';

const money = (value) => `₹${Number(value || 0).toFixed(2)}`;

const emptyItem = () => ({
  productName: '',
  packing: '10 TAB',
  batchNumber: '',
  manufacturer: '',
  hsnCode: '',
  expiryDate: new Date().toISOString().slice(0, 10),
  quantity: '1',
  freeQuantity: '0',
  mrp: '0',
  rate: '0',
  sellingPrice: '0',
  discount: '0',
  gst: '5',
  amount: ''
});

const emptyBill = () => ({
  supplierName: '',
  supplierGstin: '',
  invoiceNumber: '',
  invoiceDate: new Date().toISOString().slice(0, 10),
  billType: 'Credit',
  paymentMode: 'Credit',
  paymentStatus: 'Credit',
  amountPaid: '0',
  paymentRemarks: '',
  notes: '',
  additionalDiscount: '0'
});

export default function App() {
  const [token, setToken] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [imageUri, setImageUri] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [bill, setBill] = useState(emptyBill());
  const [items, setItems] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [collapsed, setCollapsed] = useState({});

  // Restore saved token on app start
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(TOKEN_KEY);
        if (saved) setToken(saved);
      } catch (_) { /* ignore */ }
      setAuthLoading(false);
    })();
  }, []);

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'multipart/form-data'
  });

  const handleLogin = async () => {
    if (!password.trim()) {
      Alert.alert('Password Required', 'Admin/Staff password enter karein.');
      return;
    }
    setLoginLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/admin/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (data.success && data.token) {
        setToken(data.token);
        await AsyncStorage.setItem(TOKEN_KEY, data.token);
        await AsyncStorage.setItem(ROLE_KEY, data.role || 'staff');
        setPassword('');
      } else {
        Alert.alert('Login Failed', data.message || 'Wrong password');
      }
    } catch (err) {
      Alert.alert('Login Error', 'Network error: ' + err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    setToken(null);
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(ROLE_KEY);
  };

  // --- 1. PICK OR CAPTURE IMAGE ---
  const pickImage = async (useCamera = false) => {
    try {
      let permissionResult;
      if (useCamera) {
        permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      } else {
        permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      }

      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Camera & Photos permission is required to scan bills.');
        return;
      }

      const options = { allowsEditing: true, quality: 0.7 };
      const result = useCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setImageUri(asset.uri);

        const fileObj = new File(asset.uri);
        setImageFile(fileObj);

        // Auto-run AI Scan (always via multipart FormData to avoid payload size limits)
        scanBillWithAI(fileObj);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to pick image: ' + err.message);
    }
  };

  // --- 2. AI BILL SCANNING ---
  const scanBillWithAI = async (fileObj) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('billImage', fileObj, fileObj.name);
      const response = await fetch(`${BACKEND_URL}/medicines/scan-bill`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData
      });

      const rawText = await response.text();
      let resData;
      try {
        resData = JSON.parse(rawText);
      } catch (_) {
        Alert.alert('Scan Failed', `Server response error (${response.status})`);
        return;
      }

      if (response.status === 401) {
        Alert.alert('Session Expired', 'Token invalid/expired. Please login again.');
        handleLogout();
        return;
      }

      if (resData.success && resData.data) {
        const extracted = resData.data;
        setBill(prev => ({
          supplierName: extracted.supplierName || '',
          supplierGstin: extracted.supplierGstin || '',
          invoiceNumber: extracted.invoiceNumber || '',
          invoiceDate: extracted.invoiceDate || new Date().toISOString().slice(0, 10),
          billType: extracted.billType || 'Credit',
          paymentMode: extracted.paymentMode || 'Credit',
          paymentStatus: prev.paymentStatus || 'Credit',
          amountPaid: prev.amountPaid || '0',
          paymentRemarks: prev.paymentRemarks || '',
          notes: extracted.notes || '',
          additionalDiscount: extracted.additionalDiscount && Number(extracted.additionalDiscount) > 0
            ? String(extracted.additionalDiscount)
            : (prev.additionalDiscount || '0')
        }));

        let scannedItems = [];
        if (Array.isArray(extracted.items)) {
          scannedItems = extracted.items.map(item => ({
            productName: item.productName || '',
            packing: item.packing || '',
            batchNumber: item.batchNumber || '',
            manufacturer: item.manufacturer || '',
            hsnCode: item.hsnCode || '',
            expiryDate: item.expiryDate || '',
            quantity: String(item.quantity ?? 1),
            freeQuantity: String(item.freeQuantity ?? 0),
            mrp: String(item.mrp ?? 0),
            rate: String(item.rate ?? 0),
            sellingPrice: String(item.sellingPrice ?? item.rate ?? 0),
            discount: String(item.discount ?? 0),
            gst: String(item.gst ?? 5),
            amount: String(item.amount ?? '')
          }));
        }
        setItems(scannedItems);
        setWarnings(extracted.warnings || []);

        // Auto-collapse items beyond the first 3 so review stays easy
        setCollapsed(scannedItems.length > 3
          ? Object.fromEntries(scannedItems.map((_, i) => i >= 3 ? [i, true] : [i, false]))
          : {});

        const warningCount = (extracted.warnings || []).length;
        Alert.alert(
          '✨ AI Success',
          `Bill scanned & auto-filled! ${scannedItems.length} items found.` +
          (warningCount ? `\n\n⚠️ ${warningCount} item(s) me kuch details missing hain — unhe manually check karein.` : '')
        );
      } else {
        Alert.alert('Scan Failed', resData.message || 'Could not parse bill photo');
      }
    } catch (err) {
      Alert.alert('Scan Error', 'Network error or backend unavailable: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- ITEM HELPER FUNCTIONS ---
  const updateItem = (index, field, value) => {
    setItems(prev => prev.map((item, idx) => {
      if (idx !== index) return item;
      const updated = { ...item, [field]: value };
      if (field === 'rate' && !item.sellingPrice) updated.sellingPrice = value;
      return updated;
    }));
  };

  const addItem = () => {
    setItems(prev => [...prev, emptyItem()]);
  };

  const deleteItem = (index) => {
    setItems(prev => {
      const next = prev.filter((_, idx) => idx !== index);
      setCollapsed(prevC => {
        const nextC = {};
        Object.keys(prevC).forEach(k => {
          const n = Number(k);
          if (n === index) return;
          nextC[n > index ? n - 1 : n] = prevC[k];
        });
        return nextC;
      });
      return next;
    });
  };

  const isFree = (item) => Number(item.rate || 0) === 0 || Number(item.freeQuantity || 0) > 0;

  const toggleFree = (index) => {
    setItems(prev => prev.map((item, idx) => {
      if (idx !== index) return item;
      const rate = Number(item.rate || 0);
      if (rate === 0) {
        // Unmark FREE: restore previous rate (or selling price / MRP)
        const restored = item._rateBackup != null
          ? item._rateBackup
          : (Number(item.sellingPrice || 0) || Number(item.mrp || 0) || 0);
        const { _rateBackup, ...rest } = item;
        return { ...rest, rate: String(restored) };
      }
      return { ...item, _rateBackup: rate, rate: '0' };
    }));
  };

  const toggleCollapse = (index) => {
    setCollapsed(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const expandAll = () => setCollapsed({});
  const collapseAll = () => {
    setCollapsed(Object.fromEntries(items.map((_, i) => [i, true])));
  };

  // Blocking = backend will reject the bill without these
  const blockingMissing = (item) => {
    const missing = [];
    if (!String(item.productName || '').trim()) missing.push('Medicine Name');
    if (!String(item.batchNumber || '').trim()) missing.push('Batch No.');
    if (!String(item.expiryDate || '').trim()) missing.push('Expiry');
    if (Number(item.quantity || 0) < 1) missing.push('Qty');
    return missing;
  };

  // Warning = save allowed but data quality issue
  const warningMissing = (item) => {
    const missing = [];
    const isFreeItem = isFree(item);
    if (!isFreeItem && Number(item.rate || 0) === 0) missing.push('Rate 0');
    if (Number(item.mrp || 0) === 0) missing.push('MRP 0');
    return missing;
  };

  const lineTotal = (item) => {
    const manualAmount = Number(item.amount || 0);
    if (manualAmount > 0) return manualAmount;
    const qty = Number(item.quantity || 0);
    const rate = Number(item.rate || 0);
    const discount = Number(item.discount || 0);
    const gst = Number(item.gst || 0);
    const taxable = qty * rate * (1 - discount / 100);
    return taxable + (taxable * gst / 100);
  };

  const totalBlockingMissing = useMemo(
    () => items.reduce((sum, item) => sum + blockingMissing(item).length, 0),
    [items]
  );

  const itemsTotal = items.reduce((sum, item) => sum + lineTotal(item), 0);
  const additionalDiscountValue = Math.max(0, Math.min(Number(bill.additionalDiscount || 0), itemsTotal));
  const grandTotal = itemsTotal - additionalDiscountValue;

  // --- 3. START MANUAL ENTRY WITHOUT PHOTO ---
  const startManualEntry = () => {
    setImageUri(null);
    setImageFile(null);
    setWarnings([]);
    setItems([emptyItem()]);
    setCollapsed({ 0: false });
    setBill(emptyBill());
  };

  // --- 4. RESET EVERYTHING (NEW SCAN) ---
  const resetAll = () => {
    Alert.alert('Start New Scan?', 'Sab kuch clear ho jayega aur naya bill scan kar sakte hain.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Yes, Clear All',
        style: 'destructive',
        onPress: () => {
          setImageUri(null);
          setImageFile(null);
          setItems([]);
          setWarnings([]);
          setCollapsed({});
          setBill(emptyBill());
        }
      }
    ]);
  };

  // --- 5. SUBMIT TO INVENTORY ---
  const submitToInventory = async () => {
    if (!bill.supplierName.trim() || !bill.invoiceNumber.trim() || !bill.invoiceDate) {
      Alert.alert('Missing Details', 'Supplier Name, Invoice No aur Date bharna zaroori hai.');
      return;
    }

    if (items.length === 0) {
      Alert.alert('Missing Items', 'Kam se kam ek medicine item add karein.');
      return;
    }

    // Blocked items with missing required fields
    const blocked = items
      .map((item, idx) => ({ idx, missing: blockingMissing(item) }))
      .filter(x => x.missing.length > 0);

    if (blocked.length > 0) {
      const first = blocked[0];
      Alert.alert(
        'Kuch Items Incomplete',
        `Item #${first.idx + 1} (${first.missing.join(', ')}) ka data adhoora hai.\n\nSab items ke required fields (Name, Batch, Expiry, Qty) bharein, phir Save karein.`,
        [{ text: 'OK' }]
      );
      // Expand the first blocked item so the user can fix it
      setCollapsed(prev => ({ ...prev, [first.idx]: false }));
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      Object.entries(bill).forEach(([key, val]) => formData.append(key, val ?? ''));
      formData.append('items', JSON.stringify(items));
      if (imageFile) formData.append('billImage', imageFile, imageFile.name);

      const response = await fetch(`${BACKEND_URL}/medicines/purchase-bills`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData
      });

      const resData = await response.json();
      if (response.ok || resData._id) {
        Alert.alert(
          '✅ Saved to Inventory!',
          'Purchase bill save ho gaya aur saari medicines inventory stock mein add ho gayi.',
          [
            {
              text: 'Scan Next Bill',
              onPress: () => {
                setImageUri(null);
                setImageFile(null);
                setItems([]);
                setWarnings([]);
                setCollapsed({});
                setBill(emptyBill());
              }
            }
          ]
        );
      } else {
        Alert.alert('Save Failed', resData.message || 'Could not save bill');
      }
    } catch (err) {
      Alert.alert('Save Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const scanBtnRow = (item, idx) => (
    <View style={styles.itemActionsRow}>
      <TouchableOpacity
        style={[styles.miniBtn, isFree(item) ? styles.miniBtnFreeActive : styles.miniBtnFree]}
        onPress={() => toggleFree(idx)}
      >
        <Text style={isFree(item) ? styles.miniBtnFreeActiveText : styles.miniBtnFreeText}>
          {isFree(item) ? '🎁 FREE' : '🎁 Mark FREE'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.miniBtnDelete} onPress={() => deleteItem(idx)}>
        <Text style={styles.miniBtnDeleteText}>🗑️ Delete</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f766e" />

      {authLoading ? (
        <View style={styles.loginBox}>
          <ActivityIndicator size="large" color="#0d9488" />
        </View>
      ) : !token ? (
        <KeyboardAvoidingView style={styles.loginBox} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Text style={styles.loginTitle}>🌿 Radhe Pharmacy</Text>
          <Text style={styles.loginSubtitle}>Purchase bill scan karne ke liye login karein</Text>
          <TextInput
            style={styles.loginInput}
            placeholder="Admin / Staff Password"
            placeholderTextColor="#94a3b8"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={handleLogin}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={[styles.loginBtn, loginLoading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loginLoading}
          >
            <Text style={styles.loginBtnText}>
              {loginLoading ? 'Verifying...' : '🔐 Login'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.loginHint}>Backend: {BACKEND_URL.replace('/api', '')}</Text>
        </KeyboardAvoidingView>
      ) : (
      <>

      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🌿 Radhe Pharmacy</Text>
        <Text style={styles.headerSubtitle}>AI Purchase Bill Scanner</Text>
        <View style={styles.headerBtns}>
          <TouchableOpacity style={styles.newScanBtn} onPress={resetAll}>
            <Text style={styles.newScanText}>🔄 New Scan</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

        {/* SCAN CARD */}
        <View style={styles.scanCard}>
          <Text style={styles.cardTitle}>📸 Scan Purchase Invoice</Text>
          <Text style={styles.cardDesc}>
            Bill ki photo kheenchkar AI se saare details auto-fill karein. Free items (1+1, 2+1) bhi manage hote hain.
          </Text>

          <View style={styles.btnRow}>
            <TouchableOpacity style={[styles.btn, styles.btnCamera]} onPress={() => pickImage(true)}>
              <Text style={styles.btnText}>📷 Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnGallery]} onPress={() => pickImage(false)}>
              <Text style={styles.btnText}>🖼️ Choose Image</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.btn, styles.btnManual, { marginTop: 10 }]} onPress={startManualEntry}>
            <Text style={styles.btnText}>✏️ Manual Entry (bina photo ke)</Text>
          </TouchableOpacity>
        </View>

        {/* LOADING STATE */}
        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#0d9488" />
            <Text style={styles.loadingText}>AI bill scan & medicines extract kar raha hai...</Text>
          </View>
        )}

        {/* IMAGE PREVIEW */}
        {imageUri && !loading && (
          <View style={styles.imagePreviewBox}>
            <TouchableOpacity style={styles.removeImgBtn} onPress={() => { setImageUri(null); setImageFile(null); }}>
              <Text style={styles.removeImgText}>✕ Remove</Text>
            </TouchableOpacity>
            <Image source={{ uri: imageUri }} style={styles.billImage} resizeMode="contain" />
          </View>
        )}

        {/* WARNINGS BANNER */}
        {items.length > 0 && warnings.length > 0 && !loading && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningTitle}>⚠️ {warnings.length} item(s) me kuch details adhoori hain — unhe neeche check karein:</Text>
            {warnings.slice(0, 4).map((w, wi) => (
              <Text key={wi} style={styles.warningLine}>
                • #{w.index} {w.productName}: {w.issues.join(', ')}
              </Text>
            ))}
          </View>
        )}

        {/* EXTRACTED INVOICE FORM FOR REVIEW & EDIT */}
        {items.length > 0 && !loading && (
          <View style={styles.formSection}>

            {/* GRAND TOTAL + ITEMS BADGE */}
            <View style={styles.totalBadge}>
              <View style={{ flex: 1 }}>
                <Text style={styles.totalLabel}>Items</Text>
                <Text style={styles.totalValueSmall}>{items.length}</Text>
              </View>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={styles.totalLabel}>Incomplete</Text>
                <Text style={[styles.totalValueSmall, totalBlockingMissing > 0 && { color: '#fecaca' }]}>
                  {totalBlockingMissing > 0 ? `${totalBlockingMissing}` : '—'}
                </Text>
              </View>
              <View style={{ flex: 1.4, alignItems: 'flex-end' }}>
                <Text style={styles.totalLabel}>Estimated Grand Total</Text>
                <Text style={styles.totalValue}>{money(grandTotal)}</Text>
              </View>
            </View>

            <View style={styles.stepHeader}>
              <View style={styles.stepChip}><Text style={styles.stepChipText}>1</Text></View>
              <Text style={styles.sectionHeader}>Invoice Header Review</Text>
            </View>

            <Text style={styles.label}>Supplier / Wholesaler Name *</Text>
            <TextInput
              style={styles.input}
              value={bill.supplierName}
              onChangeText={(text) => setBill({ ...bill, supplierName: text })}
              placeholder="e.g. AMIT TRADERS"
            />

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.label}>Invoice No. *</Text>
                <TextInput
                  style={styles.input}
                  value={bill.invoiceNumber}
                  onChangeText={(text) => setBill({ ...bill, invoiceNumber: text })}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Invoice Date *</Text>
                <TextInput
                  style={styles.input}
                  value={bill.invoiceDate}
                  onChangeText={(text) => setBill({ ...bill, invoiceDate: text })}
                />
              </View>
            </View>

            <Text style={styles.label}>Supplier GSTIN</Text>
            <TextInput
              style={styles.input}
              value={bill.supplierGstin}
              onChangeText={(text) => setBill({ ...bill, supplierGstin: text })}
              placeholder="06AXXPV3421A1ZD"
            />

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.label}>Bill Type</Text>
                <TextInput
                  style={styles.input}
                  value={bill.billType}
                  onChangeText={(text) => setBill({ ...bill, billType: text })}
                  placeholder="Credit / Cash / GST Invoice"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Payment Mode</Text>
                <TextInput
                  style={styles.input}
                  value={bill.paymentMode}
                  onChangeText={(text) => setBill({ ...bill, paymentMode: text })}
                  placeholder="Credit / Cash / UPI"
                />
              </View>
            </View>

            {/* PAYMENT STATUS & LEDGER */}
            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.label}>Payment Status</Text>
                <TextInput
                  style={styles.input}
                  value={bill.paymentStatus || 'Credit'}
                  onChangeText={(text) => {
                    const t = text.trim();
                    let paid = bill.amountPaid;
                    if (t.toLowerCase() === 'paid') paid = String(grandTotal.toFixed(2));
                    else if (t.toLowerCase() === 'credit') paid = '0';
                    setBill({ ...bill, paymentStatus: t, amountPaid: paid });
                  }}
                  placeholder="Credit / Paid / Partial"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Amount Paid (₹)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={bill.amountPaid}
                  onChangeText={(text) => setBill({ ...bill, amountPaid: text })}
                  placeholder="0"
                />
              </View>
            </View>

            <Text style={styles.label}>Payment Remarks / Notes</Text>
            <TextInput
              style={styles.input}
              value={bill.paymentRemarks}
              onChangeText={(text) => setBill({ ...bill, paymentRemarks: text })}
              placeholder="e.g. Paid ₹5000 via UPI, balance pending"
            />

            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={styles.input}
              value={bill.notes}
              onChangeText={(text) => setBill({ ...bill, notes: text })}
              placeholder="Transport, scheme or any note"
            />

            <Text style={[styles.label, { color: '#b45309' }]}>Extra Bill Discount (₹) — bill ke niche wala lump-sum discount</Text>
            <TextInput
              style={[styles.input, styles.inputWarn]}
              keyboardType="numeric"
              value={bill.additionalDiscount}
              onChangeText={(text) => setBill({ ...bill, additionalDiscount: text })}
              placeholder="0"
            />

            {/* STEP 2: REVIEW & EDIT MEDICINES */}
            <View style={styles.rowHeader}>
              <View style={styles.stepHeader}>
                <View style={styles.stepChip}><Text style={styles.stepChipText}>2</Text></View>
                <Text style={styles.sectionHeader}>Medicines Review ({items.length})</Text>
              </View>
              <View style={styles.rowHeaderBtns}>
                <TouchableOpacity style={styles.smallBtn} onPress={collapseAll}>
                  <Text style={styles.smallBtnText}>Collapse</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.smallBtn} onPress={expandAll}>
                  <Text style={styles.smallBtnText}>Expand</Text>
                </TouchableOpacity>
              </View>
            </View>

            {items.map((item, idx) => {
              const blocked = blockingMissing(item);
              const warned = warningMissing(item);
              const freeItem = isFree(item);
              const isCollapsed = !!collapsed[idx];
              const total = lineTotal(item);

              return (
                <View key={idx} style={[styles.medCard, freeItem && styles.medCardFree, blocked.length > 0 && styles.medCardBlocked]}>
                  {/* CARD HEADER (always visible) */}
                  <TouchableOpacity style={styles.medCardHeader} onPress={() => toggleCollapse(idx)}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.medCardTitleRow}>
                        <Text style={styles.medCardNumber}>Item #{idx + 1}</Text>
                        {freeItem && (
                          <View style={styles.freeBadge}>
                            <Text style={styles.freeBadgeText}>🎁 FREE</Text>
                          </View>
                        )}
                        {blocked.length > 0 && (
                          <View style={styles.blockBadge}>
                            <Text style={styles.blockBadgeText}>{blocked.length} missing</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.medCardName} numberOfLines={1}>
                        {item.productName || 'Medicine name likhein...'}
                      </Text>
                      <Text style={styles.medCardMeta}>
                        Qty: {item.quantity || '0'} {Number(item.freeQuantity || 0) > 0 ? `+ ${item.freeQuantity} FREE` : ''} · Rate: ₹{item.rate || '0'}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.medCardTotal, freeItem && styles.medCardTotalFree]}>
                        {freeItem && Number(item.rate || 0) === 0 ? 'FREE' : money(total)}
                      </Text>
                      <Text style={styles.medCardChevron}>{isCollapsed ? '▼' : '▲'}</Text>
                    </View>
                  </TouchableOpacity>

                  {!isCollapsed && (
                    <View style={styles.medCardBody}>
                      {item.rate === '0' && (
                        <View style={styles.freeHintBox}>
                          <Text style={styles.freeHintText}>
                            🎁 Ye item FREE mark hai (rate 0). Free Qty wale items ke liye "Free Qty" field bhi use kar sakte hain.
                          </Text>
                        </View>
                      )}

                      <Text style={styles.label}>Medicine Name *</Text>
                      <TextInput
                        style={[styles.inputBold, blocked.includes('Medicine Name') && styles.inputError]}
                        value={item.productName}
                        onChangeText={(val) => updateItem(idx, 'productName', val)}
                        placeholder="Product Name"
                      />

                      <View style={styles.row}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={styles.label}>Batch No. *</Text>
                          <TextInput
                            style={[styles.input, blocked.includes('Batch No.') && styles.inputError]}
                            value={item.batchNumber}
                            onChangeText={(val) => updateItem(idx, 'batchNumber', val)}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.label}>Expiry (YYYY-MM-DD) *</Text>
                          <TextInput
                            style={[styles.input, blocked.includes('Expiry') && styles.inputError]}
                            value={item.expiryDate}
                            onChangeText={(val) => updateItem(idx, 'expiryDate', val)}
                          />
                        </View>
                      </View>

                      <View style={styles.row}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={styles.label}>Qty (Strips) *</Text>
                          <TextInput
                            style={[styles.input, blocked.includes('Qty') && styles.inputError]}
                            keyboardType="numeric"
                            value={item.quantity}
                            onChangeText={(val) => updateItem(idx, 'quantity', val)}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.label}>Free Qty (1+1 scheme)</Text>
                          <TextInput
                            style={[styles.input, Number(item.freeQuantity || 0) > 0 && styles.inputFree]}
                            keyboardType="numeric"
                            value={item.freeQuantity}
                            onChangeText={(val) => updateItem(idx, 'freeQuantity', val)}
                          />
                        </View>
                      </View>

                      <View style={styles.row}>
                        <View style={{ flex: 1, marginRight: 6 }}>
                          <Text style={styles.label}>Cost Rate (₹)</Text>
                          <TextInput
                            style={[styles.input, warned.includes('Rate 0') && styles.inputWarn]}
                            keyboardType="numeric"
                            value={item.rate}
                            onChangeText={(val) => updateItem(idx, 'rate', val)}
                          />
                        </View>
                        <View style={{ flex: 1, marginRight: 6 }}>
                          <Text style={styles.label}>MRP (₹)</Text>
                          <TextInput
                            style={[styles.input, warned.includes('MRP 0') && styles.inputWarn]}
                            keyboardType="numeric"
                            value={item.mrp}
                            onChangeText={(val) => updateItem(idx, 'mrp', val)}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.label}>S.Price (₹)</Text>
                          <TextInput
                            style={styles.input}
                            keyboardType="numeric"
                            value={item.sellingPrice}
                            onChangeText={(val) => updateItem(idx, 'sellingPrice', val)}
                          />
                        </View>
                      </View>

                      <View style={styles.row}>
                        <View style={{ flex: 1, marginRight: 6 }}>
                          <Text style={styles.label}>HSN Code</Text>
                          <TextInput
                            style={styles.input}
                            value={item.hsnCode}
                            onChangeText={(val) => updateItem(idx, 'hsnCode', val)}
                            placeholder="e.g. 300490"
                          />
                        </View>
                        <View style={{ flex: 1, marginRight: 6 }}>
                          <Text style={styles.label}>Disc %</Text>
                          <TextInput
                            style={[styles.input, Number(item.discount || 0) > 0 && styles.inputFree]}
                            keyboardType="numeric"
                            value={item.discount}
                            onChangeText={(val) => updateItem(idx, 'discount', val)}
                            placeholder="0"
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.label}>GST %</Text>
                          <TextInput
                            style={styles.input}
                            keyboardType="numeric"
                            value={item.gst}
                            onChangeText={(val) => updateItem(idx, 'gst', val)}
                          />
                        </View>
                      </View>

                      <Text style={styles.label}>Pack</Text>
                      <TextInput
                        style={styles.input}
                        value={item.packing}
                        onChangeText={(val) => updateItem(idx, 'packing', val)}
                      />

                      <Text style={styles.label}>Manufacturer</Text>
                      <TextInput
                        style={styles.input}
                        value={item.manufacturer}
                        onChangeText={(val) => updateItem(idx, 'manufacturer', val)}
                      />

                      {/* MANUAL AMOUNT OVERRIDE */}
                      <Text style={styles.label}>Amount (₹) — khali chhodein to auto = Qty × Rate</Text>
                      <TextInput
                        style={[styles.input, Number(item.amount || 0) > 0 && styles.inputWarn]}
                        keyboardType="numeric"
                        value={item.amount}
                        onChangeText={(val) => updateItem(idx, 'amount', val)}
                        placeholder="Auto (Qty × Rate)"
                      />

                      {/* LINE TOTAL + ACTIONS */}
                      <View style={styles.itemTotalRow}>
                        <Text style={styles.itemTotalText}>
                          Line Total: <Text style={styles.itemTotalValue}>{freeItem && Number(item.rate || 0) === 0 ? 'FREE' : money(total)}</Text>
                        </Text>
                        {scanBtnRow(item, idx)}
                      </View>
                    </View>
                  )}
                </View>
              );
            })}

            {/* ADD ROW BUTTON AT BOTTOM */}
            <TouchableOpacity style={styles.addFullBtn} onPress={addItem}>
              <Text style={styles.addFullBtnText}>+ Add Another Medicine Row</Text>
            </TouchableOpacity>

            {/* SUBMIT SUMMARY + BUTTON */}
            <View style={styles.saveSummary}>
              <View style={styles.saveSummaryItem}>
                <Text style={styles.saveSummaryLabel}>Items</Text>
                <Text style={styles.saveSummaryValue}>{items.length}</Text>
              </View>
              {additionalDiscountValue > 0 && (
                <View style={styles.saveSummaryItem}>
                  <Text style={styles.saveSummaryLabel}>Extra Disc.</Text>
                  <Text style={[styles.saveSummaryValue, { color: '#b45309' }]}>- {money(additionalDiscountValue)}</Text>
                </View>
              )}
              <View style={styles.saveSummaryItem}>
                <Text style={styles.saveSummaryLabel}>Grand Total</Text>
                <Text style={styles.saveSummaryValue}>{money(grandTotal)}</Text>
              </View>
              {totalBlockingMissing > 0 && (
                <View style={styles.saveSummaryItem}>
                  <Text style={styles.saveSummaryLabel}>Incomplete</Text>
                  <Text style={[styles.saveSummaryValue, { color: '#dc2626' }]}>{totalBlockingMissing}</Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, saving && styles.btnDisabled, totalBlockingMissing > 0 && styles.submitBtnBlocked]}
              onPress={submitToInventory}
              disabled={saving}
            >
              <Text style={styles.submitBtnText}>
                {saving
                  ? 'Inventory mein add ho raha hai...'
                  : totalBlockingMissing > 0
                    ? `⚠️ ${totalBlockingMissing} field(s) incomplete — pehle bharein`
                    : '✅ Confirm & Save Stock to Inventory'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>
      </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  loginBox: { flex: 1, backgroundColor: '#f0fdfa', alignItems: 'center', justifyContent: 'center', padding: 24 },
  loginTitle: { fontSize: 26, fontWeight: 'bold', color: '#0f766e', marginBottom: 6 },
  loginSubtitle: { fontSize: 13, color: '#64748b', marginBottom: 24 },
  loginInput: { width: '100%', maxWidth: 340, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1e293b', marginBottom: 14 },
  loginBtn: { width: '100%', maxWidth: 340, backgroundColor: '#0d9488', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  loginBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 15 },
  loginHint: { marginTop: 14, fontSize: 11, color: '#94a3b8' },
  header: { backgroundColor: '#0f766e', padding: 20, paddingTop: 10, alignItems: 'center' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#ffffff' },
  headerSubtitle: { fontSize: 12, color: '#ccfbf1', marginTop: 4 },
  headerBtns: { flexDirection: 'row', position: 'absolute', right: 14, top: 14, gap: 8 },
  newScanBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6 },
  newScanText: { color: '#ffffff', fontWeight: 'bold', fontSize: 12 },
  logoutBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6 },
  logoutText: { color: '#ffffff', fontWeight: 'bold', fontSize: 12 },
  body: { padding: 16 },
  scanCard: { backgroundColor: '#ffffff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', elevation: 2 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#1e293b', marginBottom: 4 },
  cardDesc: { fontSize: 12, color: '#64748b', marginBottom: 14, lineHeight: 17 },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between' },
  btn: { flex: 0.48, paddingVertical: 16, borderRadius: 10, alignItems: 'center' },
  btnCamera: { backgroundColor: '#0d9488' },
  btnGallery: { backgroundColor: '#4f46e5' },
  btnManual: { backgroundColor: '#334155' },
  btnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 },
  loadingBox: { padding: 30, alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#0f766e', fontWeight: '600', textAlign: 'center' },
  imagePreviewBox: { marginTop: 16, height: 200, borderRadius: 12, overflow: 'hidden', backgroundColor: '#e2e8f0' },
  removeImgBtn: { position: 'absolute', top: 8, right: 8, zIndex: 10, backgroundColor: 'rgba(15,23,42,0.7)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  removeImgText: { color: '#ffffff', fontWeight: 'bold', fontSize: 11 },
  billImage: { width: '100%', height: '100%' },
  warningBanner: { marginTop: 16, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#f59e0b', borderRadius: 10, padding: 12 },
  warningTitle: { fontSize: 13, fontWeight: 'bold', color: '#92400e', marginBottom: 6 },
  warningLine: { fontSize: 12, color: '#b45309', marginBottom: 2, lineHeight: 16 },
  formSection: { marginTop: 20, backgroundColor: '#ffffff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  totalBadge: { backgroundColor: '#0f766e', borderRadius: 10, padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'center' },
  totalLabel: { color: '#ccfbf1', fontWeight: 'bold', fontSize: 11, textTransform: 'uppercase' },
  totalValue: { color: '#ffffff', fontWeight: 'bold', fontSize: 22, marginTop: 2 },
  totalValueSmall: { color: '#ffffff', fontWeight: 'bold', fontSize: 18, marginTop: 2 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
  stepChip: { backgroundColor: '#0d9488', width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  stepChipText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 },
  sectionHeader: { fontSize: 15, fontWeight: 'bold', color: '#0f766e', marginVertical: 0 },
  label: { fontSize: 11, fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', marginBottom: 3, marginTop: 4 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, fontSize: 13, color: '#1e293b', backgroundColor: '#ffffff', marginBottom: 6 },
  inputBold: { borderWidth: 1, borderColor: '#0d9488', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, fontSize: 14, fontWeight: 'bold', color: '#0f172a', backgroundColor: '#f0fdfa', marginBottom: 6 },
  inputError: { borderColor: '#ef4444', backgroundColor: '#fef2f2' },
  inputWarn: { borderColor: '#f59e0b', backgroundColor: '#fffbeb' },
  inputFree: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8 },
  rowHeaderBtns: { flexDirection: 'row', gap: 6 },
  smallBtn: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  smallBtnText: { color: '#0f766e', fontWeight: 'bold', fontSize: 11 },
  addBtn: { backgroundColor: '#0d9488', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  addBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 12 },
  medCard: { backgroundColor: '#ffffff', padding: 12, borderRadius: 10, marginBottom: 12, borderWidth: 1, borderColor: '#cbd5e1' },
  medCardFree: { borderColor: '#16a34a', backgroundColor: '#fcfdf7' },
  medCardBlocked: { borderColor: '#ef4444' },
  medCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  medCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  medCardNumber: { fontWeight: 'bold', color: '#0f766e', fontSize: 13 },
  medCardName: { fontSize: 13, color: '#334155', fontWeight: '600', marginTop: 3 },
  medCardMeta: { fontSize: 11, color: '#64748b', marginTop: 2 },
  medCardTotal: { fontWeight: 'bold', color: '#0f766e', fontSize: 15 },
  medCardTotalFree: { color: '#16a34a' },
  medCardChevron: { color: '#94a3b8', fontSize: 10, marginTop: 2 },
  freeBadge: { backgroundColor: '#16a34a', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  freeBadgeText: { color: '#ffffff', fontWeight: 'bold', fontSize: 10 },
  blockBadge: { backgroundColor: '#ef4444', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  blockBadgeText: { color: '#ffffff', fontWeight: 'bold', fontSize: 10 },
  freeHintBox: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac', borderRadius: 8, padding: 8, marginBottom: 8 },
  freeHintText: { fontSize: 12, color: '#166534', lineHeight: 16 },
  medCardBody: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 8 },
  itemTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  itemTotalText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  itemTotalValue: { color: '#0f766e', fontWeight: 'bold', fontSize: 14 },
  itemActionsRow: { flexDirection: 'row', gap: 8 },
  miniBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  miniBtnFree: { backgroundColor: '#ffffff', borderColor: '#16a34a' },
  miniBtnFreeActive: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  miniBtnFreeText: { fontWeight: 'bold', fontSize: 12, color: '#16a34a' },
  miniBtnFreeActiveText: { fontWeight: 'bold', fontSize: 12, color: '#ffffff' },
  miniBtnDelete: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#ef4444', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  miniBtnDeleteText: { fontWeight: 'bold', fontSize: 12, color: '#ef4444' },
  addFullBtn: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1', borderStyle: 'dashed', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginBottom: 16 },
  addFullBtnText: { color: '#0f766e', fontWeight: 'bold', fontSize: 14 },
  saveSummary: { flexDirection: 'row', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10, marginBottom: 10 },
  saveSummaryItem: { flex: 1, alignItems: 'center' },
  saveSummaryLabel: { fontSize: 10, fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' },
  saveSummaryValue: { fontSize: 16, fontWeight: 'bold', color: '#0f766e', marginTop: 2 },
  submitBtn: { backgroundColor: '#16a34a', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  submitBtnBlocked: { backgroundColor: '#f59e0b' },
  btnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 16 }
});
