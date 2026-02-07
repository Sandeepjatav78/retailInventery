const verifyAdmin = async (req, res) => {
  const { password } = req.body;

  // 1. .env se passwords fetch karein
  const ENV_ADMIN_PASS = process.env.ADMIN_PASSWORD;
  const ENV_STAFF_PASS = process.env.STAFF_PASSWORD;


  // 2. Check Logic
  // Agar password match kare to 'admin' role bhejo
  if (password == ENV_ADMIN_PASS) {
    return res.json({ success: true, role: 'admin', message: 'Access Granted: Admin' });
  } 
  // Agar staff password match kare to 'staff' role bhejo
  else if (password == ENV_STAFF_PASS) {
    return res.json({ success: true, role: 'staff', message: 'Access Granted: Staff' });
  } 
  // Galat password
  else {
    return res.json({ success: false, message: 'Wrong Password' });
  }
};

module.exports = { verifyAdmin };