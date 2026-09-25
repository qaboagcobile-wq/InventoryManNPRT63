const express = require('express');
const router = express.Router();
const dataStore = require('../dataStore');
const { authenticate, requireRole } = require('../authMiddleware');

// GET /api/stores
router.get('/', authenticate, async (req, res) => {
  const stores = await dataStore.read('stores');
  res.json(stores);
});

// POST /api/stores (Admin only: FR-03)
router.post('/', authenticate, requireRole(['admin']), async (req, res) => {
  const { storeName, slogan, currency } = req.body;
  if (!storeName || !storeName.trim()) {
    return res.status(400).json({ error: 'Store name is required' });
  }

  const existing = await dataStore.find('stores', s => s.store_name.toLowerCase() === storeName.trim().toLowerCase());
  if (existing) {
    return res.status(400).json({ error: 'A store with this name already exists' });
  }

  const now = new Date().toISOString();
  const newStore = {
    store_id: `store-${Date.now()}`,
    store_name: storeName.trim(),
    slogan: slogan || 'Connect your stock, floor and sales in one place.',
    currency: currency || 'ZAR',
    currency_symbol: 'R',
    created_at: now,
    updated_at: now
  };

  await dataStore.insert('stores', newStore);
  res.status(201).json(newStore);
});

// GET /api/stores/branches
router.get('/branches', authenticate, async (req, res) => {
  const branches = await dataStore.filter('branches', b => b.active);
  res.json(branches);
});

// POST /api/stores/branches (Admin only: FR-04)
router.post('/branches', authenticate, requireRole(['admin']), async (req, res) => {
  const { storeId, branchNumber, branchName } = req.body;
  if (!branchNumber || !branchName) {
    return res.status(400).json({ error: 'Branch number and branch name are required' });
  }

  const stores = await dataStore.read('stores');
  const store = storeId 
    ? stores.find(s => s.store_id === storeId) 
    : stores[0];

  if (!store) {
    return res.status(400).json({ error: 'Target store not found' });
  }

  const existingBranch = await dataStore.find('branches', b => b.branch_number.toUpperCase() === branchNumber.trim().toUpperCase());
  if (existingBranch) {
    return res.status(400).json({ error: 'A branch with this branch number already exists' });
  }

  const now = new Date().toISOString();
  const newBranch = {
    branch_id: `branch-${Date.now()}`,
    store_id: store.store_id,
    branch_number: branchNumber.trim().toUpperCase(),
    branch_name: branchName.trim(),
    active: true,
    created_at: now,
    updated_at: now
  };

  await dataStore.insert('branches', newBranch);
  res.status(201).json(newBranch);
});

module.exports = router;
