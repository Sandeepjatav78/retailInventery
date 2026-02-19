const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// Route to verify password (used for Login AND for protected actions like Edit/Delete)
router.post('/verify', adminController.verifyAdmin);

// Route to verify ADMIN_SECRET for CP visibility etc.
router.post('/secret', adminController.verifySecret);

module.exports = router;