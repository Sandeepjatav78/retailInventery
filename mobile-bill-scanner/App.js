import React, { useEffect, useState } from 'react';
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

export default function App() {
  const [token, setToken] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [imageUri, setImageUri] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const [bill, setBill] = useState({
    supplierName: '',
    supplierGstin: '',
    invoiceNumber: '',
    invoiceDate: new Date().toISOString().slice(0, 10),
    billType: 'Credit',
    paymentMode: 'Credit',
    notes: ''
  });

  const [items, setItems] = useState([]);

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
        setBill({
          supplierName: extracted.supplierName || '',
          supplierGstin: extracted.supplierGstin || '',
          invoiceNumber: extracted.invoiceNumber || '',
          invoiceDate: extracted.invoiceDate || new Date().toISOString().slice(0, 10),
          billType: extracted.billType || 'Credit',
          paymentMode: extracted.paymentMode || 'Credit',
          notes: extracted.notes || ''
        });

        if (Array.isArray(extracted.items)) {
          const scannedItems = extracted.items.map(item => ({
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
            gst: String(item.gst ?? 5)
          }));
          setItems(scannedItems);
        }

        Alert.alert('✨ AI Success', 'Purchase bill photo scanned & auto-filled!');
      } else {
        Alert.alert('Scan Failed', resData.message || 'Could not parse bill photo');
      }
    } catch (err) {
      Alert.alert('Scan Error', 'Network error or backend unavailable: ' + err.message);
    } finally {
      setLoading(false);
    }
  };  // --- ITEM HELPER FUNCTIONS ---
  const updateItem = (index, field, value) => {
    setItems(prev => prev.map((item, idx) => {
      if (idx !== index) return item;
      const updated = { ...item, [field]: value };
      if (field === 'rate' && !item.sellingPrice) updated.sellingPrice = value;
      return updated;
    }));
  };

  const addItem = () => {
    setItems(prev => [
      ...prev,
      {
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
        gst: '5'
      }
    ]);
  };

  const deleteItem = (index) => {
    setItems(prev => prev.filter((_, idx) => idx !== index));
  };

  // Live Totals Calculation
  const grandTotal = items.reduce((sum, item) => {
    const qty = Number(item.quantity || 0);
    const rate = Number(item.rate || 0);
    const discountPct = Number(item.discount || 0);
    const gstPct = Number(item.gst || 0);
    const taxable = qty * rate * (1 - discountPct / 100);
    const lineTotal = taxable + (taxable * gstPct / 100);
    return sum + lineTotal;
  }, 0);

  // --- 3. SUBMIT TO INVENTORY ---
  const submitToInventory = async () => {
    if (!bill.supplierName.trim() || !bill.invoiceNumber.trim() || !bill.invoiceDate) {
      Alert.alert('Missing Details', 'Supplier Name, Invoice No and Date are required.');
      return;
    }

    if (items.length === 0) {
      Alert.alert('Missing Items', 'No medicine items extracted or added.');
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      Object.entries(bill).forEach(([key, val]) => formData.append(key, val));
      formData.append('items', JSON.stringify(items));
      if (imageFile) formData.append('billImage', imageFile, imageFile.name);

      const response = await fetch(`${BACKEND_URL}/medicines/purchase-bills`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData
      });

      const resData = await response.json();
      if (response.ok || resData._id) {
        Alert.alert('✅ Saved to Inventory!', 'Purchase bill saved & all medicines added directly to inventory stock!');
        setImageUri(null);
        setImageFile(null);
        setItems([]);
        setBill({ supplierName: '', supplierGstin: '', invoiceNumber: '', invoiceDate: new Date().toISOString().slice(0, 10), billType: 'Credit', paymentMode: 'Credit', notes: '' });
      } else {
        Alert.alert('Save Failed', resData.message || 'Could not save bill');
      }
    } catch (err) {
      Alert.alert('Save Error', err.message);
    } finally {
      setSaving(false);
    }
  };

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
          <Text style={styles.loginSubtitle}>Login to scan purchase bills</Text>
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
        <Text style={styles.headerSubtitle}>AI Purchase Bill & Inventory Scanner</Text>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* SCAN CARD */}
        <View style={styles.scanCard}>
          <Text style={styles.cardTitle}>📸 Scan Purchase Invoice</Text>
          <Text style={styles.cardDesc}>
            Take a photo of physical bill or upload image — AI will parse & fill fields for your review.
          </Text>

          <View style={styles.btnRow}>
            <TouchableOpacity style={[styles.btn, styles.btnCamera]} onPress={() => pickImage(true)}>
              <Text style={styles.btnText}>📷 Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnGallery]} onPress={() => pickImage(false)}>
              <Text style={styles.btnText}>🖼️ Choose Image</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* LOADING STATE */}
        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#0d9488" />
            <Text style={styles.loadingText}>AI is scanning bill & extracting medicines...</Text>
          </View>
        )}

        {/* IMAGE PREVIEW */}
        {imageUri && !loading && (
          <View style={styles.imagePreviewBox}>
            <Image source={{ uri: imageUri }} style={styles.billImage} resizeMode="contain" />
          </View>
        )}

        {/* EXTRACTED INVOICE FORM FOR REVIEW & EDIT */}
        {items.length > 0 && !loading && (
          <View style={styles.formSection}>

            {/* GRAND TOTAL BADGE */}
            <View style={styles.totalBadge}>
              <Text style={styles.totalLabel}>Estimated Grand Total</Text>
              <Text style={styles.totalValue}>₹{grandTotal.toFixed(2)}</Text>
            </View>

            <Text style={styles.sectionHeader}>📄 Step 1: Review Invoice Header</Text>

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

            {/* STEP 2: REVIEW & EDIT MEDICINES */}
            <View style={styles.rowHeader}>
              <Text style={styles.sectionHeader}>💊 Step 2: Review & Edit Medicines ({items.length})</Text>
              <TouchableOpacity style={styles.addBtn} onPress={addItem}>
                <Text style={styles.addBtnText}>+ Add Item</Text>
              </TouchableOpacity>
            </View>

            {items.map((item, idx) => (
              <View key={idx} style={styles.medCard}>
                <View style={styles.rowHeader}>
                  <Text style={styles.medCardNumber}>Item #{idx + 1}</Text>
                  <TouchableOpacity onPress={() => deleteItem(idx)}>
                    <Text style={styles.deleteText}>🗑️ Delete</Text>
                  </TouchableOpacity>
                </View>

                {/* Medicine Name */}
                <Text style={styles.label}>Medicine Name</Text>
                <TextInput
                  style={styles.inputBold}
                  value={item.productName}
                  onChangeText={(val) => updateItem(idx, 'productName', val)}
                  placeholder="Product Name"
                />

                {/* Batch & Expiry */}
                <View style={styles.row}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.label}>Batch No.</Text>
                    <TextInput
                      style={styles.input}
                      value={item.batchNumber}
                      onChangeText={(val) => updateItem(idx, 'batchNumber', val)}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Expiry (YYYY-MM-DD)</Text>
                    <TextInput
                      style={styles.input}
                      value={item.expiryDate}
                      onChangeText={(val) => updateItem(idx, 'expiryDate', val)}
                    />
                  </View>
                </View>

                {/* Quantity & Free Qty */}
                <View style={styles.row}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.label}>Qty (Strips)</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={item.quantity}
                      onChangeText={(val) => updateItem(idx, 'quantity', val)}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Free Qty</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={item.freeQuantity}
                      onChangeText={(val) => updateItem(idx, 'freeQuantity', val)}
                    />
                  </View>
                </View>

                {/* Cost Rate & MRP & Selling Price */}
                <View style={styles.row}>
                  <View style={{ flex: 1, marginRight: 6 }}>
                    <Text style={styles.label}>Cost Rate (₹)</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={item.rate}
                      onChangeText={(val) => updateItem(idx, 'rate', val)}
                    />
                  </View>
                  <View style={{ flex: 1, marginRight: 6 }}>
                    <Text style={styles.label}>MRP (₹)</Text>
                    <TextInput
                      style={styles.input}
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

                {/* GST & Pack & Mfr */}
                <View style={styles.row}>
                  <View style={{ flex: 1, marginRight: 6 }}>
                    <Text style={styles.label}>GST %</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={item.gst}
                      onChangeText={(val) => updateItem(idx, 'gst', val)}
                    />
                  </View>
                  <View style={{ flex: 1, marginRight: 6 }}>
                    <Text style={styles.label}>Pack</Text>
                    <TextInput
                      style={styles.input}
                      value={item.packing}
                      onChangeText={(val) => updateItem(idx, 'packing', val)}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Manufacturer</Text>
                    <TextInput
                      style={styles.input}
                      value={item.manufacturer}
                      onChangeText={(val) => updateItem(idx, 'manufacturer', val)}
                    />
                  </View>
                </View>

              </View>
            ))}

            {/* ADD ROW BUTTON AT BOTTOM */}
            <TouchableOpacity style={styles.addFullBtn} onPress={addItem}>
              <Text style={styles.addFullBtnText}>+ Add Another Medicine Row</Text>
            </TouchableOpacity>

            {/* SUBMIT BUTTON */}
            <TouchableOpacity
              style={[styles.submitBtn, saving && styles.btnDisabled]}
              onPress={submitToInventory}
              disabled={saving}
            >
              <Text style={styles.submitBtnText}>
                {saving ? 'Adding to Inventory...' : '✅ Confirm & Save Stock to Inventory'}
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
  logoutBtn: { position: 'absolute', right: 14, top: 12, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6 },
  logoutText: { color: '#ffffff', fontWeight: 'bold', fontSize: 12 },
  header: { backgroundColor: '#0f766e', padding: 20, paddingTop: 10, alignItems: 'center' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#ffffff' },
  headerSubtitle: { fontSize: 12, color: '#ccfbf1', marginTop: 4 },
  body: { padding: 16 },
  scanCard: { backgroundColor: '#ffffff', borderRadius: 14, padding: 16, borderSize: 1, borderColor: '#e2e8f0', elevation: 2 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#1e293b', marginBottom: 4 },
  cardDesc: { fontSize: 12, color: '#64748b', marginBottom: 14 },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between' },
  btn: { flex: 0.48, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  btnCamera: { backgroundColor: '#0d9488' },
  btnGallery: { backgroundColor: '#4f46e5' },
  btnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 },
  loadingBox: { padding: 30, alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#0f766e', fontWeight: '600', textAlign: 'center' },
  imagePreviewBox: { marginTop: 16, height: 200, borderRadius: 12, overflow: 'hidden', backgroundColor: '#e2e8f0' },
  billImage: { width: '100%', height: '100%' },
  formSection: { marginTop: 20, backgroundColor: '#ffffff', borderRadius: 14, padding: 16, borderSize: 1, borderColor: '#e2e8f0' },
  totalBadge: { backgroundColor: '#0f766e', borderRadius: 10, padding: 14, marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { color: '#ccfbf1', fontWeight: 'bold', fontSize: 13 },
  totalValue: { color: '#ffffff', fontWeight: 'bold', fontSize: 22 },
  sectionHeader: { fontSize: 15, fontWeight: 'bold', color: '#0f766e', marginBottom: 10 },
  label: { fontSize: 11, fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', marginBottom: 3, marginTop: 4 },
  input: { borderSize: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: '#1e293b', backgroundColor: '#ffffff', marginBottom: 6 },
  inputBold: { borderSize: 1, borderColor: '#0d9488', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, fontWeight: 'bold', color: '#0f172a', backgroundColor: '#f0fdfa', marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8 },
  addBtn: { backgroundColor: '#0d9488', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  addBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 12 },
  medCard: { backgroundColor: '#f8fafc', padding: 12, borderRadius: 10, marginBottom: 12, borderWidth: 1, borderColor: '#cbd5e1' },
  medCardNumber: { fontWeight: 'bold', color: '#0f766e', fontSize: 13 },
  deleteText: { color: '#ef4444', fontWeight: 'bold', fontSize: 12 },
  addFullBtn: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1', borderStyle: 'dashed', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginBottom: 16 },
  addFullBtnText: { color: '#0f766e', fontWeight: 'bold', fontSize: 14 },
  submitBtn: { backgroundColor: '#16a34a', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  btnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 16 }
});
