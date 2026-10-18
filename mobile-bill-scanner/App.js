import React, { useCallback, useEffect, useState } from 'react';
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
  Platform,
  RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Update BACKEND_URL with your local computer IP or server URL
const BACKEND_URL = 'https://retail-backend-phi.vercel.app/api';

const TOKEN_KEY = 'radhe_auth_token';
const ROLE_KEY = 'radhe_auth_role';

const STATUS_COLORS = { Pending: '#b45309', Done: '#16a34a', Rejected: '#dc2626' };

const formatWhen = (value) => new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });

// Camera-only app: click the bill's photo(s) and send. The bill is entered,
// checked and saved on the web (Mobile Uploads page), not on the phone.
export default function App() {
  const [token, setToken] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [pages, setPages] = useState([]); // [{ uri }]
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [recent, setRecent] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

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

  const handleLogout = async () => {
    setToken(null);
    setRecent([]);
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(ROLE_KEY);
  };

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

  // Recently sent bills with their status on the web (Pending / Done / Rejected).
  const loadRecent = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/medicines/bill-uploads?status=all&limit=15`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) {
        Alert.alert('Session Expired', 'Please login again.');
        handleLogout();
        return;
      }
      const data = await res.json();
      setRecent(data.uploads || []);
    } catch (_) { /* offline — keep the old list */ }
  }, [token]);

  useEffect(() => { loadRecent(); }, [loadRecent]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRecent();
    setRefreshing(false);
  };

  const addPhoto = async (useCamera) => {
    try {
      const permission = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Camera / Photos permission chahiye.');
        return;
      }
      const result = useCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsMultipleSelection: true, selectionLimit: 10 });
      if (!result.canceled && result.assets?.length) {
        setPages((prev) => [...prev, ...result.assets.map((asset) => ({ uri: asset.uri }))].slice(0, 10));
      }
    } catch (err) {
      Alert.alert('Error', 'Photo nahi mil saki: ' + err.message);
    }
  };

  const removePage = (index) => setPages((prev) => prev.filter((_, i) => i !== index));

  const sendBill = async () => {
    if (pages.length === 0) {
      Alert.alert('Photo nahi hai', 'Pehle bill ki photo khinchein.');
      return;
    }
    setSending(true);
    try {
      const formData = new FormData();
      pages.forEach((page) => {
        const file = new File(page.uri);
        formData.append('billImages', file, file.name);
      });
      formData.append('note', note.trim());

      const res = await fetch(`${BACKEND_URL}/medicines/bill-uploads`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
        body: formData
      });
      if (res.status === 401) {
        Alert.alert('Session Expired', 'Please login again.');
        handleLogout();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        Alert.alert('Send Failed', data.message || `Server error (${res.status})`);
        return;
      }
      setPages([]);
      setNote('');
      Alert.alert('✅ Bhej diya!', 'Bill web par "Mobile Uploads" me aa gaya hai. Wahan check karke save karein.');
      loadRecent();
    } catch (err) {
      Alert.alert('Send Error', 'Network error: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  if (authLoading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#0d9488" />
      </SafeAreaView>
    );
  }

  if (!token) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView style={styles.center} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Text style={styles.loginTitle}>🌿 Radhe Pharmacy</Text>
          <Text style={styles.loginSubtitle}>Bill photo bhejne ke liye login karein</Text>
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
          <TouchableOpacity style={[styles.primaryBtn, loginLoading && styles.disabled]} onPress={handleLogin} disabled={loginLoading}>
            <Text style={styles.primaryBtnText}>{loginLoading ? 'Verifying...' : '🔐 Login'}</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>Backend: {BACKEND_URL.replace('/api', '')}</Text>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f766e" />
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>🌿 Radhe Pharmacy</Text>
          <Text style={styles.headerSubtitle}>Bill Camera</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* CAMERA */}
        <TouchableOpacity style={styles.cameraBtn} onPress={() => addPhoto(true)} disabled={sending}>
          <Text style={styles.cameraIcon}>📷</Text>
          <Text style={styles.cameraText}>{pages.length ? 'Agla Page Khinchein' : 'Bill ki Photo Khinchein'}</Text>
          <Text style={styles.cameraSub}>Bill lamba ho to har page ki alag photo lein</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.galleryBtn} onPress={() => addPhoto(false)} disabled={sending}>
          <Text style={styles.galleryText}>🖼️ Gallery se chunein</Text>
        </TouchableOpacity>

        {/* PAGES TO SEND */}
        {pages.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{pages.length} photo ready</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {pages.map((page, idx) => (
                <View key={page.uri} style={styles.thumbWrap}>
                  <Image source={{ uri: page.uri }} style={styles.thumb} />
                  <Text style={styles.thumbLabel}>Page {idx + 1}</Text>
                  <TouchableOpacity style={styles.thumbRemove} onPress={() => removePage(idx)} disabled={sending}>
                    <Text style={styles.thumbRemoveText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder="Note (optional) — e.g. Rosa Medical, cash diya"
              placeholderTextColor="#94a3b8"
            />
            <TouchableOpacity style={[styles.sendBtn, sending && styles.disabled]} onPress={sendBill} disabled={sending}>
              {sending
                ? <ActivityIndicator color="#ffffff" />
                : <Text style={styles.primaryBtnText}>📤 Bhejein ({pages.length} photo)</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* RECENTLY SENT */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Bheje gaye bills</Text>
          {recent.length === 0 ? (
            <Text style={styles.empty}>Abhi tak koi bill nahi bheja.</Text>
          ) : recent.map((upload) => (
            <View key={upload._id} style={styles.recentRow}>
              {upload.pages?.[0]?.url && !/\.pdf($|\?)/i.test(upload.pages[0].url)
                ? <Image source={{ uri: upload.pages[0].url }} style={styles.recentThumb} />
                : <View style={[styles.recentThumb, styles.recentThumbEmpty]}><Text>📄</Text></View>}
              <View style={{ flex: 1 }}>
                <Text style={styles.recentWhen}>{formatWhen(upload.createdAt)} · {upload.pages?.length || 0} photo</Text>
                {!!upload.note && <Text style={styles.recentNote} numberOfLines={1}>{upload.note}</Text>}
                {!!upload.remark && <Text style={styles.recentNote} numberOfLines={2}>Remark: {upload.remark}</Text>}
              </View>
              <Text style={[styles.status, { color: STATUS_COLORS[upload.status] || '#64748b' }]}>{upload.status}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, backgroundColor: '#f0fdfa', alignItems: 'center', justifyContent: 'center', padding: 24 },
  loginTitle: { fontSize: 26, fontWeight: 'bold', color: '#0f766e', marginBottom: 6 },
  loginSubtitle: { fontSize: 13, color: '#64748b', marginBottom: 24 },
  loginInput: { width: '100%', maxWidth: 340, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1e293b', marginBottom: 14 },
  primaryBtn: { width: '100%', maxWidth: 340, backgroundColor: '#0d9488', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 16 },
  hint: { marginTop: 14, fontSize: 11, color: '#94a3b8' },
  disabled: { opacity: 0.6 },
  header: { backgroundColor: '#0f766e', paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#ffffff' },
  headerSubtitle: { fontSize: 12, color: '#ccfbf1', marginTop: 2 },
  logoutBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  logoutText: { color: '#ffffff', fontWeight: 'bold', fontSize: 12 },
  body: { padding: 16, paddingBottom: 40 },
  cameraBtn: { backgroundColor: '#0d9488', borderRadius: 18, paddingVertical: 36, alignItems: 'center', elevation: 3 },
  cameraIcon: { fontSize: 56 },
  cameraText: { color: '#ffffff', fontWeight: 'bold', fontSize: 20, marginTop: 8 },
  cameraSub: { color: '#ccfbf1', fontSize: 12, marginTop: 4 },
  galleryBtn: { marginTop: 10, borderWidth: 1, borderColor: '#0d9488', borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#ffffff' },
  galleryText: { color: '#0f766e', fontWeight: 'bold', fontSize: 14 },
  card: { marginTop: 16, backgroundColor: '#ffffff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  cardTitle: { fontSize: 15, fontWeight: 'bold', color: '#1e293b', marginBottom: 10 },
  thumbWrap: { marginRight: 10, alignItems: 'center' },
  thumb: { width: 110, height: 150, borderRadius: 8, backgroundColor: '#e2e8f0' },
  thumbLabel: { fontSize: 11, color: '#64748b', marginTop: 4, fontWeight: 'bold' },
  thumbRemove: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(220,38,38,0.9)', width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  thumbRemoveText: { color: '#ffffff', fontWeight: 'bold', fontSize: 12 },
  noteInput: { marginTop: 12, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, fontSize: 14, color: '#1e293b' },
  sendBtn: { marginTop: 12, backgroundColor: '#16a34a', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  empty: { color: '#94a3b8', fontSize: 13 },
  recentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9', gap: 10 },
  recentThumb: { width: 44, height: 56, borderRadius: 6, backgroundColor: '#e2e8f0' },
  recentThumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  recentWhen: { fontSize: 13, fontWeight: '600', color: '#334155' },
  recentNote: { fontSize: 12, color: '#64748b', marginTop: 2 },
  status: { fontSize: 12, fontWeight: 'bold' }
});
