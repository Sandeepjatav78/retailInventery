const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const repriceController = require('../controllers/repriceController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// Route to verify password (used for Login AND for protected actions like Edit/Delete)
router.post('/verify', adminController.verifyAdmin);

// Route to verify ADMIN_SECRET for CP visibility etc.
router.post('/secret', adminController.verifySecret);

// Route to check active token validity and deployment version
router.get('/verify-token', authenticateToken, adminController.verifyToken);

// Route for admin to manually force logout all sessions
router.post('/force-logout-all', authenticateToken, authorizeRoles('admin'), adminController.forceLogoutAll);

// One-time price update: remove with controllers/repriceController.js once confirmed
const adminOnly = [authenticateToken, authorizeRoles('admin')];
router.get('/reprice-once/preview', adminOnly, repriceController.previewReprice);
router.post('/reprice-once/apply', adminOnly, repriceController.applyReprice);
router.post('/reprice-once/undo', adminOnly, repriceController.undoReprice);

module.exports = router;