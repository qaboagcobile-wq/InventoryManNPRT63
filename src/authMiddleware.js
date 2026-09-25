const jwt = require('jsonwebtoken');
const dataStore = require('./dataStore');

const JWT_SECRET = process.env.JWT_SECRET || 'connect-super-secret-key-particles-2026';

function generateToken(user, assignment = null) {
  const payload = {
    userId: user.user_id,
    role: user.role,
    email: user.email,
    fullName: user.full_name,
    employeeNumber: user.employee_number,
    branchId: assignment ? assignment.branch_id : null,
    firstLoginRequired: user.first_login_required
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
}

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await dataStore.find('users', u => u.user_id === decoded.userId && u.active);

    if (!user) {
      return res.status(401).json({ error: 'User account not found or deactivated' });
    }

    req.user = user;
    req.tokenPayload = decoded;

    // Check branch assignment if applicable
    if (['manager', 'cashier', 'merchandiser'].includes(user.role)) {
      const assignment = await dataStore.find('user_branch_assignments', a => a.user_id === user.user_id && a.active);
      req.branchId = assignment ? assignment.branch_id : null;
    }

    // Force password change on first login
    if (user.first_login_required && !req.path.startsWith('/change-first-login-password') && !req.path.startsWith('/logout')) {
      return res.status(403).json({
        error: 'First-login password change required',
        firstLoginRequired: true
      });
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired authentication session' });
  }
}

function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Access denied. Requires one of: [${allowedRoles.join(', ')}]` });
    }
    next();
  };
}

module.exports = {
  JWT_SECRET,
  generateToken,
  authenticate,
  requireRole
};
