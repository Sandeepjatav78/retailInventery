const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// 1. LOGIN ROUTE (Generates Token)
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  // Hardcoded User: admin / Password: From .env
  if (username === 'admin' && password === process.env.ADMIN_SECRET) {
    // Create a Token that lasts for 24 hours
    const token = jwt.sign({ role: 'admin' }, process.env.ADMIN_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false, message: "Invalid Credentials" });
  }
});

// 2. VERIFY ROUTE (Middleware to check token if needed later)
router.post('/verify', (req, res) => {
  const { token } = req.body;
  try {
    jwt.verify(token, process.env.ADMIN_SECRET);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

module.exports = router;