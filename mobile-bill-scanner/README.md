# 📱 Radhe Pharmacy Mobile Purchase Bill Scanner App

This React Native / Expo app allows admins and staff to snap physical purchase bills with their phone camera, extract supplier & medicine details using Gemini AI Vision OCR, and auto-populate inventory stock in 1 click.

---

## 🚀 How to Run Mobile App on Android / iOS

### 1. Install Dependencies
```bash
cd mobile-bill-scanner
npm install
```

### 2. Start Expo Development Server
```bash
npx expo start
```

### 3. Open App on Mobile Device
- **Android**: Download **Expo Go** from Play Store and scan the QR code displayed in the terminal.
- **iOS**: Scan the QR code with iPhone Camera app to launch in Expo Go.

---

## ⚙️ Backend Connection Config
In `App.js`, update `BACKEND_URL` if testing locally on your computer:
```javascript
const BACKEND_URL = 'http://YOUR_LOCAL_IP:5001/api'; 
// or production API:
// const BACKEND_URL = 'https://retail-mocha-five.vercel.app/api';
```
