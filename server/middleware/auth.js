const jwt = require('jsonwebtoken');
const { getDeployVersion } = require('../config/version');

const JWT_SECRET = process.env.JWT_SECRET || process.env.ADMIN_SECRET || 'change-me-in-env';

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized: token missing' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Check version matching for automatic deployment invalidation
    const currentDeployVersion = getDeployVersion();
    if (decoded.version && decoded.version !== currentDeployVersion) {
      return res.status(401).json({
        message: 'Unauthorized: Session expired due to app deployment update',
        code: 'VERSION_MISMATCH'
      });
    }

    req.user = {
      role: decoded.role || 'staff',
      version: decoded.version
    };
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized: invalid token' });
  }
};

const authorizeRoles = (...roles) => (req, res, next) => {
  const userRole = req.user?.role;
  if (!roles.includes(userRole)) {
    return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
  }
  return next();
};

module.exports = { authenticateToken, authorizeRoles };
