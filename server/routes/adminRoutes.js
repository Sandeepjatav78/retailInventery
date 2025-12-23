const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// 1. LOGIN ROUTE (Generates Token)
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  // Check against Environment Variable
  // If you haven't set .env, hardcode your password here temporarily like: '1234'
  if (username === 'admin' && password === process.env.ADMIN_SECRET) {
    
    const token = jwt.sign({ role: 'admin' }, process.env.ADMIN_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token });
  
  } else {
    res.status(401).json({ success: false, message: "Invalid Credentials" });
  }
});

// 2. VERIFY ROUTE (Handles BOTH Token and Password checks)
router.post('/verify', (req, res) => {
  const { token, password } = req.body;

  // CASE A: Verifying a Login Token (Page Refresh)
  if (token) {
    try {
      jwt.verify(token, process.env.ADMIN_SECRET);
      return res.json({ success: true });
    } catch (err) {
      return res.json({ success: false });
    }
  }

  // CASE B: Verifying a Password (Edit Price / Show Secret Price)
  if (password) {
    if (password === process.env.ADMIN_SECRET) {
       return res.json({ success: true });
    } else {
       return res.json({ success: false });
    }
  }

  // If neither provided
  res.json({ success: false });
});

module.exports = router;