# 📱 Radhe Pharmacy Mobile Purchase Bill Scanner App

This React Native / Expo app is a simple bill camera: admins and staff photograph a purchase bill (one photo per page) and send it. The bill then shows up on the web under **📲 Mobile Uploads**, where the AI fills the Purchase Bill form from the photos, the admin checks/corrects it and saves — which marks the upload Done.

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
