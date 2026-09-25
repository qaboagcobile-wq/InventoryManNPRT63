const express = require('express');
const router = express.Router();
const dataStore = require('../dataStore');
const { authenticate, requireRole } = require('../authMiddleware');

// POST /api/sales (Cashier sale checkout: FR-38, FR-39, FR-40, FR-41, FR-42)
router.post('/', authenticate, requireRole(['cashier', 'manager', 'admin']), async (req, res) => {
  const { items, customerRef } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required to complete a sale.' });
  }

  // Load latest products
  const products = await dataStore.read('products');
  const now = new Date().toISOString();
  const branchId = req.branchId || 'branch-001';

  // 1. Pre-validation: verify sufficient floor stock for ALL items (Atomic guarantee)
  let totalAmount = 0;
  const verifiedItems = [];

  for (const item of items) {
    const qty = parseInt(item.quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: `Invalid quantity for item "${item.productName || item.productId}".` });
    }

    const product = products.find(p => 
      p.product_id === item.productId || 
      p.sku_6_digit === item.sku || 
      p.barcode === item.barcode
    );

    if (!product) {
      return res.status(404).json({ error: `Product not found for SKU/Barcode/ID: ${item.sku || item.barcode || item.productId}.` });
    }

    const currentFloor = Number(product.floor_quantity) || 0;
    // FR-39 & FR-42: Prevent negative floor stock
    if (qty > currentFloor) {
      return res.status(400).json({
        error: `Insufficient floor stock for "${product.product_name}". Requested: ${qty}, Available on floor: ${currentFloor}.`
      });
    }

    const unitPrice = Number(product.price) || 0;
    const subtotal = unitPrice * qty;
    totalAmount += subtotal;

    verifiedItems.push({
      product,
      quantity: qty,
      unitPrice,
      subtotal
    });
  }

  // 2. Execute stock deductions atomically
  for (const vi of verifiedItems) {
    const prodIndex = products.findIndex(p => p.product_id === vi.product.product_id);
    products[prodIndex].floor_quantity = products[prodIndex].floor_quantity - vi.quantity;
    products[prodIndex].updated_at = now;
  }
  await dataStore.write('products', products);

  // Payment type and Lay-by processing
  const paymentType = req.body.paymentType === 'layby' ? 'layby' : 'full';
  const customerName = req.body.customerName || customerRef || 'Walk-in Customer';
  const customerPhone = req.body.customerPhone || '';
  const depositAmount = paymentType === 'layby' ? Math.max(0, Number(req.body.depositAmount) || 0) : totalAmount;
  const balanceDue = Math.max(0, totalAmount - depositAmount);

  // 3. Record Sale header (FR-41)
  const saleId = `sale-${Date.now()}`;
  const saleRecord = {
    sale_id: saleId,
    branch_id: branchId,
    cashier_user_id: req.user.user_id,
    cashier_name: req.user.full_name,
    customer_ref: customerName,
    customer_phone: customerPhone,
    sale_date: now,
    total_amount: totalAmount,
    total_units: verifiedItems.reduce((acc, i) => acc + i.quantity, 0),
    payment_type: paymentType,
    deposit_amount: depositAmount,
    balance_due: balanceDue,
    status: (paymentType === 'layby' && balanceDue > 0) ? 'LAYBY_ACTIVE' : 'COMPLETED'
  };
  await dataStore.insert('sales', saleRecord);

  // 4. Record Sale items
  const saleItemRecords = verifiedItems.map((vi, idx) => ({
    sale_item_id: `item-${Date.now()}-${idx + 1}`,
    sale_id: saleId,
    product_id: vi.product.product_id,
    product_name: vi.product.product_name,
    brand: vi.product.brand,
    sku_6_digit: vi.product.sku_6_digit,
    quantity: vi.quantity,
    unit_price: vi.unitPrice,
    subtotal: vi.subtotal
  }));
  const existingSaleItems = await dataStore.read('sale_items');
  await dataStore.write('sale_items', [...existingSaleItems, ...saleItemRecords]);

  // 5. Record Inventory Transactions for each item (FR-35)
  const txns = verifiedItems.map((vi, idx) => ({
    transaction_id: `txn-sale-${Date.now()}-${idx + 1}`,
    branch_id: branchId,
    product_id: vi.product.product_id,
    user_id: req.user.user_id,
    user_name: req.user.full_name,
    product_name: vi.product.product_name,
    transaction_type: 'SALE',
    from_location: 'FLOOR',
    to_location: 'CUSTOMER',
    quantity: vi.quantity,
    transaction_date: now,
    notes: `Sale ID: ${saleId}`
  }));
  const existingTxns = await dataStore.read('inventory_transactions');
  await dataStore.write('inventory_transactions', [...existingTxns, ...txns]);

  res.status(201).json({
    success: true,
    message: 'Sale completed successfully.',
    sale: saleRecord,
    items: saleItemRecords
  });
});

// GET /api/sales (List sales with optional filters: FR-48, FR-50)
router.get('/', authenticate, async (req, res) => {
  const { startDate, endDate, cashierId, limit } = req.query;
  let sales = await dataStore.read('sales');
  const saleItems = await dataStore.read('sale_items');

  // Branch isolation
  if (['manager', 'cashier', 'merchandiser'].includes(req.user.role) && req.branchId) {
    sales = sales.filter(s => s.branch_id === req.branchId);
  }

  // Cashier filter
  if (cashierId) {
    sales = sales.filter(s => s.cashier_user_id === cashierId);
  }

  // Date range filter
  if (startDate) {
    sales = sales.filter(s => new Date(s.sale_date) >= new Date(startDate));
  }
  if (endDate) {
    sales = sales.filter(s => new Date(s.sale_date) <= new Date(endDate + 'T23:59:59.999Z'));
  }

  // Sort descending by sale_date
  sales.sort((a, b) => new Date(b.sale_date) - new Date(a.sale_date));

  if (limit) {
    sales = sales.slice(0, parseInt(limit, 10));
  }

  // Attach items to each sale
  const enriched = sales.map(s => ({
    ...s,
    items: saleItems.filter(i => i.sale_id === s.sale_id)
  }));

  res.json(enriched);
});

// GET /api/sales/:id (Receipt view)
router.get('/:id', authenticate, async (req, res) => {
  const sale = await dataStore.find('sales', s => s.sale_id === req.params.id);
  if (!sale) return res.status(404).json({ error: 'Sale record not found' });

  const saleItems = await dataStore.filter('sale_items', i => i.sale_id === req.params.id);
  res.json({ ...sale, items: saleItems });
});

module.exports = router;
