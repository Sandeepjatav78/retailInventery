const express = require('express');
const router = express.Router();

router.post('/verify', (req, res) => {
  const { password } = req.body;
  
  // Check against the server-side environment variable
  if (password === process.env.ADMIN_SECRET) {
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

module.exports = router;