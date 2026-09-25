const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const dataStore = require('../dataStore');
const emailService = require('../emailService');
const { authenticate } = require('../authMiddleware');

// Helper to generate next unique employee number
async function generateEmployeeNumber(role) {
  const prefixMap = {
    super_manager: 'SM',
    manager: 'MGR',
    cashier: 'CSH',
    merchandiser: 'MCH'
  };
  const prefix = prefixMap[role] || 'EMP';
  const users = await dataStore.read('users');
  
  // Find highest existing sequence for this role
  let maxSeq = 100;
  for (const u of users) {
    if (u.employee_number && u.employee_number.startsWith(prefix)) {
      const numPart = parseInt(u.employee_number.replace(prefix, ''), 10);
      if (!isNaN(numPart) && numPart > maxSeq) {
        maxSeq = numPart;
      }
    }
  }
  return `${prefix}${maxSeq + 1}`;
}

// GET /api/users
// Returns users scoped to caller's role
router.get('/', authenticate, async (req, res) => {
  const users = await dataStore.read('users');
  const branches = await dataStore.read('branches');
  const assignments = await dataStore.read('user_branch_assignments');

  // Enrich user with branch info
  const enrichedUsers = users.map(u => {
    const assign = assignments.find(a => a.user_id === u.user_id && a.active);
    const branch = assign ? branches.find(b => b.branch_id === assign.branch_id) : null;
    const { password_hash, ...safeUser } = u;
    return {
      ...safeUser,
      branchId: assign ? assign.branch_id : null,
      branchName: branch ? branch.branch_name : null,
      branchNumber: branch ? branch.branch_number : null
    };
  });

  // Admin view: all admins, super manager, branches summary
  if (req.user.role === 'admin') {
    return res.json(enrichedUsers);
  }

  // Super Manager view: all Managers and active staff overview
  if (req.user.role === 'super_manager') {
    const allowed = enrichedUsers.filter(u => ['manager', 'cashier', 'merchandiser', 'super_manager'].includes(u.role));
    return res.json(allowed);
  }

  // Manager view: scoped strictly to assigned branch staff (cashiers, merchandisers)
  if (req.user.role === 'manager') {
    const callerAssign = assignments.find(a => a.user_id === req.user.user_id && a.active);
    if (!callerAssign) return res.json([]);

    const branchStaff = enrichedUsers.filter(u => 
      u.branchId === callerAssign.branch_id && ['cashier', 'merchandiser', 'manager'].includes(u.role)
    );
    return res.json(branchStaff);
  }

  // Cashier and Merchandiser only view self
  const self = enrichedUsers.find(u => u.user_id === req.user.user_id);
  res.json(self ? [self] : []);
});

// POST /api/users/super-manager (Admin only: FR-05)
router.post('/super-manager', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only Admins can create the Super Manager account' });
  }

  const { fullName, email, cellNumber } = req.body;
  if (!fullName || !email) {
    return res.status(400).json({ error: 'Full name and email are required' });
  }

  // Check email uniqueness
  const existingEmail = await dataStore.find('users', u => u.email.toLowerCase() === email.trim().toLowerCase());
  if (existingEmail) {
    return res.status(400).json({ error: 'A user with this email already exists' });
  }

  const employeeNumber = await generateEmployeeNumber('super_manager');
  const tempPassword = 'SM-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const now = new Date().toISOString();

  const superManager = {
    user_id: `user-sm-${Date.now()}`,
    full_name: fullName.trim(),
    email: email.trim().toLowerCase(),
    cell_number: cellNumber ? cellNumber.trim() : '',
    password_hash: passwordHash,
    role: 'super_manager',
    employee_number: employeeNumber,
    first_login_required: true,
    active: true,
    created_at: now,
    updated_at: now
  };

  await dataStore.insert('users', superManager);
  await emailService.sendTemporaryPassword(superManager, tempPassword, 'Super Manager Account Onboarding');

  const { password_hash, ...safe } = superManager;
  res.status(201).json({
    user: safe,
    temporaryPassword: tempPassword,
    message: `Super Manager created. Employee Number: ${employeeNumber}. Initial temporary password generated.`
  });
});

// POST /api/users/manager (Super Manager only: FR-11)
router.post('/manager', authenticate, async (req, res) => {
  if (req.user.role !== 'super_manager') {
    return res.status(403).json({ error: 'Only Super Manager can create Manager accounts' });
  }

  const { fullName, email, cellNumber, branchId } = req.body;
  if (!fullName || !email || !branchId) {
    return res.status(400).json({ error: 'Full name, email, and branch assignment are required' });
  }

  const branch = await dataStore.find('branches', b => b.branch_id === branchId && b.active);
  if (!branch) {
    return res.status(400).json({ error: 'Selected branch does not exist' });
  }

  const existingEmail = await dataStore.find('users', u => u.email.toLowerCase() === email.trim().toLowerCase());
  if (existingEmail) {
    return res.status(400).json({ error: 'A user with this email already exists' });
  }

  const employeeNumber = await generateEmployeeNumber('manager');
  const tempPassword = 'MGR-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const now = new Date().toISOString();

  const manager = {
    user_id: `user-mgr-${Date.now()}`,
    full_name: fullName.trim(),
    email: email.trim().toLowerCase(),
    cell_number: cellNumber ? cellNumber.trim() : '',
    password_hash: passwordHash,
    role: 'manager',
    employee_number: employeeNumber,
    first_login_required: true,
    active: true,
    created_at: now,
    updated_at: now
  };

  await dataStore.insert('users', manager);

  // Link manager to branch
  await dataStore.insert('user_branch_assignments', {
    assignment_id: `assign-${Date.now()}`,
    user_id: manager.user_id,
    branch_id: branch.branch_id,
    assigned_at: now,
    active: true
  });

  await emailService.sendTemporaryPassword(manager, tempPassword, 'Manager Account Onboarding');

  const { password_hash, ...safe } = manager;
  res.status(201).json({
    user: {
      ...safe,
      branchId: branch.branch_id,
      branchName: branch.branch_name,
      branchNumber: branch.branch_number
    },
    temporaryPassword: tempPassword,
    message: `Manager account created. Employee Number: ${employeeNumber}. Assigned to ${branch.branch_name}.`
  });
});

// POST /api/users/staff (Manager only: FR-17, FR-18)
router.post('/staff', authenticate, async (req, res) => {
  if (req.user.role !== 'manager') {
    return res.status(403).json({ error: 'Only Managers can add staff for their branch' });
  }

  const { fullName, email, cellNumber, position } = req.body;
  if (!fullName || !email || !position) {
    return res.status(400).json({ error: 'Full name, email, and position (cashier or merchandiser) are required' });
  }

  const normalizedPos = position.toLowerCase();
  if (!['cashier', 'merchandiser'].includes(normalizedPos)) {
    return res.status(400).json({ error: 'Position must be either "cashier" or "merchandiser"' });
  }

  const callerAssign = await dataStore.find('user_branch_assignments', a => a.user_id === req.user.user_id && a.active);
  if (!callerAssign) {
    return res.status(400).json({ error: 'You are not assigned to an active branch' });
  }

  const existingEmail = await dataStore.find('users', u => u.email.toLowerCase() === email.trim().toLowerCase());
  if (existingEmail) {
    return res.status(400).json({ error: 'A user with this email already exists' });
  }

  const employeeNumber = await generateEmployeeNumber(normalizedPos);
  const tempPassword = `${normalizedPos === 'cashier' ? 'CSH' : 'MCH'}-` + crypto.randomBytes(3).toString('hex').toUpperCase();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const now = new Date().toISOString();

  const staff = {
    user_id: `user-${normalizedPos}-${Date.now()}`,
    full_name: fullName.trim(),
    email: email.trim().toLowerCase(),
    cell_number: cellNumber ? cellNumber.trim() : '',
    password_hash: passwordHash,
    role: normalizedPos,
    employee_number: employeeNumber,
    first_login_required: true,
    active: true,
    created_at: now,
    updated_at: now
  };

  await dataStore.insert('users', staff);

  // Link staff to Manager's assigned branch
  await dataStore.insert('user_branch_assignments', {
    assignment_id: `assign-${Date.now()}`,
    user_id: staff.user_id,
    branch_id: callerAssign.branch_id,
    assigned_at: now,
    active: true
  });

  await emailService.sendTemporaryPassword(staff, tempPassword, `${normalizedPos.toUpperCase()} Account Onboarding`);

  const { password_hash, ...safe } = staff;
  res.status(201).json({
    user: safe,
    temporaryPassword: tempPassword,
    message: `${normalizedPos.toUpperCase()} created with Employee Number: ${employeeNumber}`
  });
});

  // Helper function to check authority
  function checkManagementAuthority(caller, target, callerAssign, targetAssign) {
    if (target.role === 'admin') {
      return { allowed: false, message: 'Admin accounts cannot be modified or deleted by any user' };
    }
    if (caller.role === 'admin') {
      if (target.role !== 'super_manager') {
        return { allowed: false, message: 'Admins can only manage the Super Manager account' };
      }
      return { allowed: true };
    }
    if (caller.role === 'super_manager') {
      if (target.role !== 'manager') {
        return { allowed: false, message: 'Super Manager can only manage Branch Manager accounts' };
      }
      return { allowed: true };
    }
    if (caller.role === 'manager') {
      if (!['cashier', 'merchandiser'].includes(target.role)) {
        return { allowed: false, message: 'Managers can only manage Cashier and Merchandiser accounts' };
      }
      if (!callerAssign || !targetAssign || callerAssign.branch_id !== targetAssign.branch_id) {
        return { allowed: false, message: 'You can only manage staff within your own assigned branch' };
      }
      return { allowed: true };
    }
    return { allowed: false, message: 'Insufficient permissions' };
  }

  // POST /api/users/:id/activate
  router.post('/:id/activate', authenticate, async (req, res) => {
    const targetId = req.params.id;
    const targetUser = await dataStore.find('users', u => u.user_id === targetId);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    const callerAssign = await dataStore.find('user_branch_assignments', a => a.user_id === req.user.user_id);
    const targetAssign = await dataStore.find('user_branch_assignments', a => a.user_id === targetUser.user_id);
    const authCheck = checkManagementAuthority(req.user, targetUser, callerAssign, targetAssign);
    if (!authCheck.allowed) return res.status(403).json({ error: authCheck.message });

    await dataStore.update('users', u => u.user_id === targetId, {
      active: true,
      updated_at: new Date().toISOString()
    });

    // Re-activate branch assignment
    const assignments = await dataStore.read('user_branch_assignments');
    const updatedAssignments = assignments.map(a => a.user_id === targetId ? { ...a, active: true } : a);
    await dataStore.write('user_branch_assignments', updatedAssignments);

    res.json({ success: true, message: `Account for ${targetUser.full_name} (${targetUser.role}) has been activated.` });
  });

  // POST /api/users/:id/deactivate
  router.post('/:id/deactivate', authenticate, async (req, res) => {
    const targetId = req.params.id;
    const targetUser = await dataStore.find('users', u => u.user_id === targetId);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    const callerAssign = await dataStore.find('user_branch_assignments', a => a.user_id === req.user.user_id);
    const targetAssign = await dataStore.find('user_branch_assignments', a => a.user_id === targetUser.user_id);
    const authCheck = checkManagementAuthority(req.user, targetUser, callerAssign, targetAssign);
    if (!authCheck.allowed) return res.status(403).json({ error: authCheck.message });

    await dataStore.update('users', u => u.user_id === targetId, {
      active: false,
      updated_at: new Date().toISOString()
    });

    const assignments = await dataStore.read('user_branch_assignments');
    const updatedAssignments = assignments.map(a => a.user_id === targetId ? { ...a, active: false } : a);
    await dataStore.write('user_branch_assignments', updatedAssignments);

    res.json({ success: true, message: `Account for ${targetUser.full_name} (${targetUser.role}) has been deactivated.` });
  });

  // POST /api/users/:id/delete (Requires text reason)
  router.post('/:id/delete', authenticate, async (req, res) => {
    const targetId = req.params.id;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'A specific text reason is required to delete this account.' });
    }

    const targetUser = await dataStore.find('users', u => u.user_id === targetId);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    const callerAssign = await dataStore.find('user_branch_assignments', a => a.user_id === req.user.user_id);
    const targetAssign = await dataStore.find('user_branch_assignments', a => a.user_id === targetUser.user_id);
    const authCheck = checkManagementAuthority(req.user, targetUser, callerAssign, targetAssign);
    if (!authCheck.allowed) return res.status(403).json({ error: authCheck.message });

    const now = new Date().toISOString();

    // Log deletion event to audit trail
    const auditEvents = await dataStore.read('user_lifecycle_events') || [];
    auditEvents.push({
      event_id: `del-${Date.now()}`,
      action: 'DELETE',
      target_user_id: targetId,
      target_name: targetUser.full_name,
      target_role: targetUser.role,
      performed_by_id: req.user.user_id,
      performed_by_name: req.user.full_name,
      reason: reason.trim(),
      timestamp: now
    });
    await dataStore.write('user_lifecycle_events', auditEvents);

    // Remove user record
    await dataStore.delete('users', u => u.user_id === targetId);
    // Remove assignments
    const assignments = await dataStore.read('user_branch_assignments');
    await dataStore.write('user_branch_assignments', assignments.filter(a => a.user_id !== targetId));

    res.json({
      success: true,
      message: `Account for ${targetUser.full_name} (${targetUser.role}) has been permanently deleted. Reason: "${reason.trim()}".`
    });
  });

  // DELETE /api/users/:id (Maintains compatibility)
  router.delete('/:id', authenticate, async (req, res) => {
    const reason = (req.body && req.body.reason) || req.query.reason || 'Requested by manager/admin';
    const targetId = req.params.id;
    const targetUser = await dataStore.find('users', u => u.user_id === targetId);

    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    const callerAssign = await dataStore.find('user_branch_assignments', a => a.user_id === req.user.user_id);
    const targetAssign = await dataStore.find('user_branch_assignments', a => a.user_id === targetUser.user_id);
    const authCheck = checkManagementAuthority(req.user, targetUser, callerAssign, targetAssign);
    if (!authCheck.allowed) return res.status(403).json({ error: authCheck.message });

    await dataStore.update('users', u => u.user_id === targetId, {
      active: false,
      updated_at: new Date().toISOString()
    });

    res.json({ success: true, message: `Account for ${targetUser.full_name} (${targetUser.role}) has been deactivated.` });
  });

  // PUT /api/users/:id/email (Edit user's email address)
  router.put('/:id/email', authenticate, async (req, res) => {
    const targetId = req.params.id;
    const { email } = req.body;

    if (!email || !email.trim() || !email.includes('@')) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Permissions: Admin can edit any admin or managed user; otherwise user can only edit their own
    if (req.user.role !== 'admin' && req.user.user_id !== targetId) {
      return res.status(403).json({ error: 'Permission denied to edit this email address' });
    }

    // Check email uniqueness
    const existing = await dataStore.find('users', u => u.email.toLowerCase() === cleanEmail && u.user_id !== targetId);
    if (existing) {
      return res.status(400).json({ error: 'This email address is already in use by another account' });
    }

    const updated = await dataStore.update('users', u => u.user_id === targetId, {
      email: cleanEmail,
      updated_at: new Date().toISOString()
    });

    if (!updated) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { password_hash, ...safe } = updated;
    res.json({ success: true, user: safe, message: `Email updated to ${cleanEmail}` });
  });

module.exports = router;
