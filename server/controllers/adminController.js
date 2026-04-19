const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || process.env.ADMIN_SECRET || 'change-me-in-env';

const verifyAdmin = async (req, res) => {
  const { password } = req.body;

  const ENV_ADMIN_PASS = process.env.ADMIN_PASSWORD;
  const ENV_STAFF_PASS = process.env.STAFF_PASSWORD;
  const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';

  if (password == ENV_ADMIN_PASS) {
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    return res.json({ success: true, role: 'admin', token, message: 'Access Granted: Admin' });
  } else if (password == ENV_STAFF_PASS) {
    const token = jwt.sign({ role: 'staff' }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    return res.json({ success: true, role: 'staff', token, message: 'Access Granted: Staff' });
  } else {
    return res.json({ success: false, message: 'Wrong Password' });
  }
};

// Separate secret specifically for sensitive actions like CP visibility
const verifySecret = async (req, res) => {
  const { code } = req.body;
  const envSecret = process.env.ADMIN_SECRET;

  if (code && envSecret && code === envSecret) {
    return res.json({ success: true });
  }
  return res.json({ success: false, message: 'Wrong Secret' });
};

module.exports = { verifyAdmin, verifySecret };