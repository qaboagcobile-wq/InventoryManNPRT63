const express = require('express');
const router = express.Router();
const dataStore = require('../dataStore');
const { authenticate, requireRole } = require('../authMiddleware');

// Helper to calculate product status indicators
function computeStockStatus(product) {
  const floor = Number(product.floor_quantity) || 0;
  const stockroom = Number(product.stockroom_quantity) || 0;
  const total = floor + stockroom;
  const floorThreshold = Number(product.floor_threshold) || 15;
  const reorderThreshold = Number(product.reorder_threshold) || 30;

  let statusBadge = 'Normal';
  let badgeColor = 'emerald';
  let isLowFloor = false;
  let isLowTotal = false;
  let isOutOfFloorStock = false;

  if (floor === 0) {
    statusBadge = 'Out of Floor Stock';
    badgeColor = 'rose';
    isOutOfFloorStock = true;
  } else if (floor <= floorThreshold) {
    statusBadge = 'Low Floor Stock';
    badgeColor = 'amber';
    isLowFloor = true;
  }

  if (total <= reorderThreshold) {
    isLowTotal = true;
    if (floor === 0 && stockroom === 0) {
      statusBadge = 'Completely Out of Stock';
      badgeColor = 'rose';
    } else if (stockroom === 0) {
      statusBadge = 'Reorder Needed (Stockroom Empty)';
      badgeColor = 'rose';
    }
  }

  return {
    total_quantity: total,
    statusBadge,
    badgeColor,
    isLowFloor,
    isLowTotal,
    isOutOfFloorStock
  };
}

// GET /api/products/categories
router.get('/categories', authenticate, async (req, res) => {
  const categories = await dataStore.read('categories');
  res.json(categories);
});

// POST /api/products/categories (Manager, Admin: FR-25)
router.post('/categories', authenticate, requireRole(['manager', 'admin', 'super_manager']), async (req, res) => {
  const { categoryName, description } = req.body;
  if (!categoryName || !categoryName.trim()) {
    return res.status(400).json({ error: 'Category name is required' });
  }

  const existing = await dataStore.find('categories', c => c.category_name.toLowerCase() === categoryName.trim().toLowerCase());
  if (existing) {
    return res.status(400).json({ error: 'Category already exists' });
  }

  const stores = await dataStore.read('stores');
  const storeId = stores[0] ? stores[0].store_id : 'store-particles-01';

  const newCategory = {
    category_id: `cat-${Date.now()}`,
    store_id: storeId,
    category_name: categoryName.trim(),
    description: description ? description.trim() : `${categoryName} category`,
    created_at: new Date().toISOString()
  };

  await dataStore.insert('categories', newCategory);
  res.status(201).json(newCategory);
});

// GET /api/products
// Optional query params: category, search, lowStockOnly
router.get('/', authenticate, async (req, res) => {
  const { category, search, lowStockOnly } = req.query;
  const products = await dataStore.read('products');
  const categories = await dataStore.read('categories');
  const catMap = new Map(categories.map(c => [c.category_id, c.category_name]));

  let filtered = products.map(p => {
    const meta = computeStockStatus(p);
    return {
      ...p,
      category_name: catMap.get(p.category_id) || 'General',
      ...meta
    };
  });

  if (category) {
    filtered = filtered.filter(p => p.category_id === category || p.category_name.toLowerCase() === category.toLowerCase());
  }

  if (search) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(p => 
      p.product_name.toLowerCase().includes(q) ||
      p.brand.toLowerCase().includes(q) ||
      p.sku_6_digit.includes(q) ||
      p.barcode.includes(q)
    );
  }

  if (lowStockOnly === 'true') {
    filtered = filtered.filter(p => p.isLowFloor || p.isLowTotal || p.isOutOfFloorStock);
  }

  res.json(filtered);
});

// GET /api/products/search (Cashier POS search by SKU, Barcode, or Name: FR-37, FR-38)
router.get('/search', authenticate, async (req, res) => {
  const { q } = req.query;
  if (!q || !q.trim()) {
    return res.json([]);
  }

  const query = q.trim().toLowerCase();
  const products = await dataStore.read('products');
  const categories = await dataStore.read('categories');
  const catMap = new Map(categories.map(c => [c.category_id, c.category_name]));

  const matches = products.filter(p => 
    p.sku_6_digit.toLowerCase() === query ||
    p.barcode.toLowerCase() === query ||
    p.product_name.toLowerCase().includes(query) ||
    p.brand.toLowerCase().includes(query)
  ).map(p => {
    const meta = computeStockStatus(p);
    return {
      ...p,
      category_name: catMap.get(p.category_id) || 'General',
      ...meta
    };
  });

  res.json(matches);
});

// POST /api/products (Manager only: FR-26, FR-27, FR-28, FR-29)
router.post('/', authenticate, requireRole(['manager', 'admin']), async (req, res) => {
  const {
    brand,
    productName,
    categoryId,
    price,
    sku,
    barcode,
    floorQuantity,
    stockroomQuantity,
    floorThreshold,
    reorderThreshold,
    description
  } = req.body;

  if (!brand || !productName || !categoryId || price === undefined || !sku || !barcode) {
    return res.status(400).json({ error: 'Brand, product name, category, price, 6-digit SKU, and barcode are required.' });
  }

  // Validate 6-digit SKU
  const cleanSku = String(sku).trim();
  if (!/^\d{6}$/.test(cleanSku)) {
    return res.status(400).json({ error: 'SKU must be exactly 6 digits (e.g., 100031).' });
  }

  // Validate barcode
  const cleanBarcode = String(barcode).trim();
  if (!cleanBarcode) {
    return res.status(400).json({ error: 'Barcode cannot be empty.' });
  }

  // Check unique SKU and Barcode
  const products = await dataStore.read('products');
  if (products.some(p => p.sku_6_digit === cleanSku)) {
    return res.status(400).json({ error: 'A product with this 6-digit SKU already exists.' });
  }
  if (products.some(p => p.barcode === cleanBarcode)) {
    return res.status(400).json({ error: 'A product with this barcode already exists.' });
  }

  const stores = await dataStore.read('stores');
  const storeId = stores[0] ? stores[0].store_id : 'store-particles-01';
  const now = new Date().toISOString();

  const newProduct = {
    product_id: `prod-${Date.now()}`,
    store_id: storeId,
    category_id: categoryId,
    brand: brand.trim(),
    product_name: productName.trim(),
    description: description ? description.trim() : `${brand} ${productName}`,
    sku_6_digit: cleanSku,
    barcode: cleanBarcode,
    price: Number(price) >= 0 ? Number(price) : 0,
    floor_quantity: Math.max(0, parseInt(floorQuantity, 10) || 0),
    stockroom_quantity: Math.max(0, parseInt(stockroomQuantity, 10) || 0),
    floor_threshold: Math.max(1, parseInt(floorThreshold, 10) || 15),
    reorder_threshold: Math.max(1, parseInt(reorderThreshold, 10) || 30),
    created_at: now,
    updated_at: now
  };

  await dataStore.insert('products', newProduct);
  res.status(201).json(newProduct);
});

// PUT /api/products/:id (Manager, Admin: update product details and thresholds)
router.put('/:id', authenticate, requireRole(['manager', 'admin']), async (req, res) => {
  const productId = req.params.id;
  const product = await dataStore.find('products', p => p.product_id === productId);
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const {
    brand,
    productName,
    categoryId,
    price,
    sku,
    barcode,
    floorThreshold,
    reorderThreshold,
    description
  } = req.body;

  const updates = { updated_at: new Date().toISOString() };

  if (sku) {
    const cleanSku = String(sku).trim();
    if (!/^\d{6}$/.test(cleanSku)) {
      return res.status(400).json({ error: 'SKU must be exactly 6 digits.' });
    }
    const duplicateSku = await dataStore.find('products', p => p.sku_6_digit === cleanSku && p.product_id !== productId);
    if (duplicateSku) {
      return res.status(400).json({ error: 'Another product already has this SKU.' });
    }
    updates.sku_6_digit = cleanSku;
  }

  if (barcode) {
    const cleanBarcode = String(barcode).trim();
    const duplicateBarcode = await dataStore.find('products', p => p.barcode === cleanBarcode && p.product_id !== productId);
    if (duplicateBarcode) {
      return res.status(400).json({ error: 'Another product already has this barcode.' });
    }
    updates.barcode = cleanBarcode;
  }

  if (brand) updates.brand = brand.trim();
  if (productName) updates.product_name = productName.trim();
  if (categoryId) updates.category_id = categoryId;
  if (price !== undefined) updates.price = Math.max(0, Number(price));
  if (floorThreshold !== undefined) updates.floor_threshold = Math.max(1, parseInt(floorThreshold, 10));
  if (reorderThreshold !== undefined) updates.reorder_threshold = Math.max(1, parseInt(reorderThreshold, 10));
  if (description !== undefined) updates.description = description.trim();

  const updated = await dataStore.update('products', p => p.product_id === productId, updates);
  res.json(updated);
});

module.exports = router;
