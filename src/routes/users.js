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

// DELETE /api/users/:id
router.delete('/:id', authenticate, async (req, res) => {
  const targetId = req.params.id;
  const targetUser = await dataStore.find('users', u => u.user_id === targetId);

  if (!targetUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  // FR-10: Admin accounts cannot be deleted by any user, including other Admins
  if (targetUser.role === 'admin') {
    return res.status(403).json({ error: 'Admin accounts cannot be deleted by any user' });
  }

  // Admin permissions (FR-08, FR-09)
  if (req.user.role === 'admin') {
    if (targetUser.role !== 'super_manager') {
      return res.status(403).json({ error: 'Admins can only delete the Super Manager account' });
    }
  }

  // Super Manager permissions (FR-15, FR-16)
  if (req.user.role === 'super_manager') {
    if (targetUser.role !== 'manager') {
      return res.status(403).json({ error: 'Super Manager can only delete Manager accounts' });
    }
  }

  // Manager permissions (FR-23, FR-24)
  if (req.user.role === 'manager') {
    if (!['cashier', 'merchandiser'].includes(targetUser.role)) {
      return res.status(403).json({ error: 'Managers can only deactivate Cashier and Merchandiser accounts in their branch' });
    }
    // Verify branch isolation
    const callerAssign = await dataStore.find('user_branch_assignments', a => a.user_id === req.user.user_id && a.active);
    const targetAssign = await dataStore.find('user_branch_assignments', a => a.user_id === targetUser.user_id && a.active);
    if (!callerAssign || !targetAssign || callerAssign.branch_id !== targetAssign.branch_id) {
      return res.status(403).json({ error: 'You can only deactivate staff within your own branch' });
    }
  }

  // Soft delete / deactivate user
  await dataStore.update('users', u => u.user_id === targetId, {
    active: false,
    updated_at: new Date().toISOString()
  });

  // Deactivate assignments
  const assignments = await dataStore.read('user_branch_assignments');
  const updatedAssignments = assignments.map(a => a.user_id === targetId ? { ...a, active: false } : a);
  await dataStore.write('user_branch_assignments', updatedAssignments);

  res.json({ success: true, message: `Account for ${targetUser.full_name} (${targetUser.role}) has been deactivated.` });
});

module.exports = router;
