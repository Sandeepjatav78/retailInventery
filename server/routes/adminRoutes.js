const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// Route to verify password (used for Login AND for protected actions like Edit/Delete)
router.post('/verify', adminController.verifyAdmin);

// Route to verify ADMIN_SECRET for CP visibility etc.
router.post('/secret', adminController.verifySecret);

// Route to check active token validity and deployment version
router.get('/verify-token', authenticateToken, adminController.verifyToken);

// Route for admin to manually force logout all sessions
router.post('/force-logout-all', authenticateToken, authorizeRoles('admin'), adminController.forceLogoutAll);

module.exports = router;