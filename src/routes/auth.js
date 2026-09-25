const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const dataStore = require('../dataStore');
const emailService = require('../emailService');
const { generateToken, authenticate } = require('../authMiddleware');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Please enter your login identifier and password' });
  }

  const cleanIdentifier = identifier.trim();
  const users = await dataStore.read('users');

  let user = null;
  // If identifier has @, search by email
  if (cleanIdentifier.includes('@')) {
    user = users.find(u => u.email.toLowerCase() === cleanIdentifier.toLowerCase() && u.active);
    if (user && user.role !== 'admin') {
      return res.status(400).json({ 
        error: `${user.role.toUpperCase()} must log in using their Employee Number, not email.` 
      });
    }
  } else {
    // Operational users log in by employee number
    user = users.find(u => u.employee_number && u.employee_number.toUpperCase() === cleanIdentifier.toUpperCase() && u.active);
    if (!user) {
      // Also check if admin accidentally entered something else
      user = users.find(u => u.email.toLowerCase() === cleanIdentifier.toLowerCase() && u.active);
    }
  }

  if (!user) {
    return res.status(401).json({ error: 'Invalid login credentials' });
  }

  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    return res.status(401).json({ error: 'Invalid login credentials' });
  }

  // Find user branch assignment if applicable
  const assignment = await dataStore.find('user_branch_assignments', a => a.user_id === user.user_id && a.active);
  let branch = null;
  if (assignment) {
    branch = await dataStore.find('branches', b => b.branch_id === assignment.branch_id);
  }

  const token = generateToken(user, assignment);

  res.cookie('token', token, { httpOnly: true, maxAge: 12 * 3600 * 1000 });

  res.json({
    token,
    user: {
      userId: user.user_id,
      fullName: user.full_name,
      email: user.email,
      cellNumber: user.cell_number,
      role: user.role,
      employeeNumber: user.employee_number,
      firstLoginRequired: user.first_login_required,
      branchId: assignment ? assignment.branch_id : null,
      branchName: branch ? branch.branch_name : null,
      branchNumber: branch ? branch.branch_number : null
    }
  });
});

// POST /api/auth/change-first-login-password
router.post('/change-first-login-password', async (req, res) => {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) token = authHeader.substring(7);
  else if (req.cookies && req.cookies.token) token = req.cookies.token;

  if (!token) return res.status(401).json({ error: 'Session required' });

  let decoded;
  try {
    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('../authMiddleware');
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid' });
  }

  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long' });
  }

  const user = await dataStore.find('users', u => u.user_id === decoded.userId && u.active);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const newHash = await bcrypt.hash(newPassword, 10);
  await dataStore.update('users', u => u.user_id === user.user_id, {
    password_hash: newHash,
    first_login_required: false,
    updated_at: new Date().toISOString()
  });

  // Re-generate fresh token without firstLoginRequired flag
  user.first_login_required = false;
  const assignment = await dataStore.find('user_branch_assignments', a => a.user_id === user.user_id && a.active);
  const newToken = generateToken(user, assignment);

  res.cookie('token', newToken, { httpOnly: true, maxAge: 12 * 3600 * 1000 });
  res.json({ success: true, token: newToken, message: 'Password successfully updated. You may now continue.' });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Please enter your registered email address' });

  const user = await dataStore.find('users', u => u.email.toLowerCase() === email.trim().toLowerCase() && u.active);
  if (!user) {
    // For security, still return generic friendly response so accounts aren't enumerated
    return res.json({ success: true, message: 'If this email is registered, temporary password instructions have been sent.' });
  }

  const tempPassword = 'Temp-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  const tempHash = await bcrypt.hash(tempPassword, 10);
  const now = new Date().toISOString();

  // Record password reset event
  await dataStore.insert('password_reset_events', {
    reset_id: `reset-${Date.now()}`,
    user_id: user.user_id,
    temporary_password_hash: tempHash,
    expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    used_at: null,
    created_at: now
  });

  // Update user with temp password and require change on login
  await dataStore.update('users', u => u.user_id === user.user_id, {
    password_hash: tempHash,
    first_login_required: true,
    updated_at: now
  });

  await emailService.sendTemporaryPassword(user, tempPassword, 'Password Reset Request');

  res.json({
    success: true,
    message: 'A temporary password has been generated and sent to your registered email address.'
  });
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  const assignment = await dataStore.find('user_branch_assignments', a => a.user_id === req.user.user_id && a.active);
  let branch = null;
  let store = null;
  if (assignment) {
    branch = await dataStore.find('branches', b => b.branch_id === assignment.branch_id);
    if (branch) {
      store = await dataStore.find('stores', s => s.store_id === branch.store_id);
    }
  }

  res.json({
    user: {
      userId: req.user.user_id,
      fullName: req.user.full_name,
      email: req.user.email,
      cellNumber: req.user.cell_number,
      role: req.user.role,
      employeeNumber: req.user.employee_number,
      firstLoginRequired: req.user.first_login_required,
      branchId: assignment ? assignment.branch_id : null,
      branchName: branch ? branch.branch_name : null,
      branchNumber: branch ? branch.branch_number : null,
      storeName: store ? store.store_name : 'Particles Electronics'
    }
  });
});

// PUT /api/auth/profile
router.put('/profile', authenticate, async (req, res) => {
  const { email, cellNumber, currentPassword, newPassword } = req.body;
  const updates = { updated_at: new Date().toISOString() };

  if (email && email.trim() !== req.user.email) {
    // Check email uniqueness
    const existing = await dataStore.find('users', u => u.email.toLowerCase() === email.trim().toLowerCase() && u.user_id !== req.user.user_id);
    if (existing) {
      return res.status(400).json({ error: 'This email address is already in use by another account' });
    }
    updates.email = email.trim().toLowerCase();
  }

  if (cellNumber) {
    updates.cell_number = cellNumber.trim();
  }

  if (newPassword) {
    if (!currentPassword) {
      return res.status(400).json({ error: 'Current password is required to set a new password' });
    }
    const match = await bcrypt.compare(currentPassword, req.user.password_hash);
    if (!match) {
      return res.status(400).json({ error: 'Incorrect current password' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }
    updates.password_hash = await bcrypt.hash(newPassword, 10);
  }

  const updated = await dataStore.update('users', u => u.user_id === req.user.user_id, updates);
  res.json({ success: true, user: updated, message: 'Profile updated successfully' });
});

// GET /api/auth/notifications (Dev helper to view simulated emails)
router.get('/notifications', (req, res) => {
  res.json(emailService.getRecentEmails());
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;
