const verifyAdmin = async (req, res) => {
  const { password } = req.body;

  const ENV_ADMIN_PASS = process.env.ADMIN_PASSWORD;
  const ENV_STAFF_PASS = process.env.STAFF_PASSWORD;

  if (password == ENV_ADMIN_PASS) {
    return res.json({ success: true, role: 'admin', message: 'Access Granted: Admin' });
  } else if (password == ENV_STAFF_PASS) {
    return res.json({ success: true, role: 'staff', message: 'Access Granted: Staff' });
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