const express = require('express');
const router = express.Router();
const dataStore = require('../dataStore');
const { authenticate, requireRole } = require('../authMiddleware');

// POST /api/stock/receive (Manager only: FR-31, Workflow 11.6)
router.post('/receive', authenticate, requireRole(['manager', 'admin']), async (req, res) => {
  const { productId, quantity, notes } = req.body;
  const qty = parseInt(quantity, 10);

  if (!productId || isNaN(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Valid product and positive quantity are required.' });
  }

  const products = await dataStore.read('products');
  const productIndex = products.findIndex(p => p.product_id === productId);

  if (productIndex === -1) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const product = products[productIndex];
  const currentStockroom = Number(product.stockroom_quantity) || 0;
  const newStockroom = currentStockroom + qty;

  products[productIndex] = {
    ...product,
    stockroom_quantity: newStockroom,
    updated_at: new Date().toISOString()
  };

  await dataStore.write('products', products);

  // Record audit transaction
  const now = new Date().toISOString();
  const transaction = {
    transaction_id: `txn-${Date.now()}`,
    branch_id: req.branchId || 'branch-001',
    product_id: product.product_id,
    user_id: req.user.user_id,
    user_name: req.user.full_name,
    product_name: product.product_name,
    transaction_type: 'STOCK_RECEIVED',
    from_location: 'SUPPLIER',
    to_location: 'STOCKROOM',
    quantity: qty,
    transaction_date: now,
    notes: notes ? notes.trim() : 'Stock receipt into stockroom'
  };

  await dataStore.insert('inventory_transactions', transaction);

  res.json({
    success: true,
    message: `Received ${qty} unit(s) of "${product.product_name}" into stockroom. New stockroom quantity: ${newStockroom}.`,
    product: products[productIndex],
    transaction
  });
});

// POST /api/stock/replenish-floor (Merchandiser only: FR-32, FR-33, Workflow 11.7)
router.post('/replenish-floor', authenticate, requireRole(['merchandiser', 'manager']), async (req, res) => {
  const { productId, quantity, notes } = req.body;
  const qty = parseInt(quantity, 10);

  if (!productId || isNaN(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Valid product and positive quantity are required.' });
  }

  const products = await dataStore.read('products');
  const productIndex = products.findIndex(p => p.product_id === productId);

  if (productIndex === -1) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const product = products[productIndex];
  const currentStockroom = Number(product.stockroom_quantity) || 0;
  const currentFloor = Number(product.floor_quantity) || 0;

  // FR-33: The system shall prevent a transfer from exceeding stockroom quantity.
  if (qty > currentStockroom) {
    return res.status(400).json({
      error: `Cannot transfer ${qty} unit(s). Only ${currentStockroom} unit(s) available in stockroom.`
    });
  }

  const newStockroom = currentStockroom - qty;
  const newFloor = currentFloor + qty;

  products[productIndex] = {
    ...product,
    stockroom_quantity: newStockroom,
    floor_quantity: newFloor,
    updated_at: new Date().toISOString()
  };

  await dataStore.write('products', products);

  // Record audit transaction (FR-34)
  const now = new Date().toISOString();
  const transaction = {
    transaction_id: `txn-${Date.now()}`,
    branch_id: req.branchId || 'branch-001',
    product_id: product.product_id,
    user_id: req.user.user_id,
    user_name: req.user.full_name,
    product_name: product.product_name,
    transaction_type: 'FLOOR_REPLENISHMENT',
    from_location: 'STOCKROOM',
    to_location: 'FLOOR',
    quantity: qty,
    transaction_date: now,
    notes: notes ? notes.trim() : 'Replenished floor from stockroom'
  };

  await dataStore.insert('inventory_transactions', transaction);

  res.json({
    success: true,
    message: `Moved ${qty} unit(s) of "${product.product_name}" to sales floor. Floor: ${newFloor}, Stockroom: ${newStockroom}.`,
    product: products[productIndex],
    transaction
  });
});

// POST /api/stock/adjust (Manager only: authorised correction)
router.post('/adjust', authenticate, requireRole(['manager', 'admin']), async (req, res) => {
  const { productId, location, newQuantity, notes } = req.body;
  const targetLocation = (location || '').toUpperCase();
  const qty = parseInt(newQuantity, 10);

  if (!productId || !['FLOOR', 'STOCKROOM'].includes(targetLocation) || isNaN(qty) || qty < 0) {
    return res.status(400).json({ error: 'Valid product, location (FLOOR or STOCKROOM), and non-negative quantity required.' });
  }

  const products = await dataStore.read('products');
  const productIndex = products.findIndex(p => p.product_id === productId);

  if (productIndex === -1) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const product = products[productIndex];
  const oldQty = targetLocation === 'FLOOR' ? product.floor_quantity : product.stockroom_quantity;
  const diff = qty - oldQty;

  if (targetLocation === 'FLOOR') {
    products[productIndex].floor_quantity = qty;
  } else {
    products[productIndex].stockroom_quantity = qty;
  }
  products[productIndex].updated_at = new Date().toISOString();

  await dataStore.write('products', products);

  const now = new Date().toISOString();
  const transaction = {
    transaction_id: `txn-${Date.now()}`,
    branch_id: req.branchId || 'branch-001',
    product_id: product.product_id,
    user_id: req.user.user_id,
    user_name: req.user.full_name,
    product_name: product.product_name,
    transaction_type: 'STOCK_ADJUSTMENT',
    from_location: targetLocation,
    to_location: targetLocation,
    quantity: diff,
    transaction_date: now,
    notes: notes ? notes.trim() : `Manual stock adjustment on ${targetLocation}`
  };

  await dataStore.insert('inventory_transactions', transaction);

  res.json({
    success: true,
    message: `Adjusted ${targetLocation} quantity for "${product.product_name}" to ${qty}.`,
    product: products[productIndex],
    transaction
  });
});

// GET /api/stock/transactions (Auditable transaction history: FR-35, FR-50)
router.get('/transactions', authenticate, async (req, res) => {
  const { productId, transactionType, startDate, endDate } = req.query;
  let txns = await dataStore.read('inventory_transactions');

  // Branch isolation
  if (['manager', 'cashier', 'merchandiser'].includes(req.user.role) && req.branchId) {
    txns = txns.filter(t => t.branch_id === req.branchId);
  }

  if (productId) {
    txns = txns.filter(t => t.product_id === productId);
  }

  if (transactionType) {
    txns = txns.filter(t => t.transaction_type === transactionType.toUpperCase());
  }

  if (startDate) {
    txns = txns.filter(t => new Date(t.transaction_date) >= new Date(startDate));
  }

  if (endDate) {
    txns = txns.filter(t => new Date(t.transaction_date) <= new Date(endDate + 'T23:59:59.999Z'));
  }

  // Sort descending by date
  txns.sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));

  res.json(txns);
});

module.exports = router;
