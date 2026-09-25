const express = require('express');
const router = express.Router();
const dataStore = require('../dataStore');
const { authenticate, requireRole } = require('../authMiddleware');

// GET /api/reports/dashboard-kpis (Manager overview: Section 7, FR-44 to FR-49)
router.get('/dashboard-kpis', authenticate, requireRole(['manager', 'admin', 'super_manager']), async (req, res) => {
  const { startDate, endDate, categoryId } = req.query;

  const sales = await dataStore.read('sales');
  const saleItems = await dataStore.read('sale_items');
  const products = await dataStore.read('products');
  const txns = await dataStore.read('inventory_transactions');
  const users = await dataStore.read('users');
  const assignments = await dataStore.read('user_branch_assignments');

  // Filter sales by branch if Manager
  let scopedSales = sales;
  let scopedTxns = txns;
  let scopedBranchId = req.branchId;

  if (['manager'].includes(req.user.role) && scopedBranchId) {
    scopedSales = sales.filter(s => s.branch_id === scopedBranchId);
    scopedTxns = txns.filter(t => t.branch_id === scopedBranchId);
  }

  // Filter sales by date range
  if (startDate) {
    scopedSales = scopedSales.filter(s => new Date(s.sale_date) >= new Date(startDate));
    scopedTxns = scopedTxns.filter(t => new Date(t.transaction_date) >= new Date(startDate));
  }
  if (endDate) {
    scopedSales = scopedSales.filter(s => new Date(s.sale_date) <= new Date(endDate + 'T23:59:59.999Z'));
    scopedTxns = scopedTxns.filter(t => new Date(t.transaction_date) <= new Date(endDate + 'T23:59:59.999Z'));
  }

  const validSaleIds = new Set(scopedSales.map(s => s.sale_id));
  let scopedSaleItems = saleItems.filter(i => validSaleIds.has(i.sale_id));

  // Category filter
  if (categoryId) {
    const prodsInCategory = new Set(products.filter(p => p.category_id === categoryId).map(p => p.product_id));
    scopedSaleItems = scopedSaleItems.filter(i => prodsInCategory.has(i.product_id));
  }

  // Calculate Sales KPIs
  const totalSalesValue = scopedSaleItems.reduce((acc, i) => acc + (Number(i.subtotal) || 0), 0);
  const totalUnitsSold = scopedSaleItems.reduce((acc, i) => acc + (Number(i.quantity) || 0), 0);
  const salesCount = scopedSales.length;
  const averageSaleValue = salesCount > 0 ? (totalSalesValue / salesCount) : 0;

  // Top-selling products
  const productAgg = {};
  for (const item of scopedSaleItems) {
    if (!productAgg[item.product_id]) {
      productAgg[item.product_id] = {
        productId: item.product_id,
        name: item.product_name,
        brand: item.brand,
        unitsSold: 0,
        revenue: 0
      };
    }
    productAgg[item.product_id].unitsSold += item.quantity;
    productAgg[item.product_id].revenue += item.subtotal;
  }
  const topProducts = Object.values(productAgg)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Sales by Cashier (FR-45)
  const cashierAgg = {};
  for (const sale of scopedSales) {
    const cId = sale.cashier_user_id || 'unknown';
    if (!cashierAgg[cId]) {
      cashierAgg[cId] = {
        cashierId: cId,
        cashierName: sale.cashier_name || 'Cashier',
        salesCount: 0,
        totalRevenue: 0,
        unitsSold: 0
      };
    }
    cashierAgg[cId].salesCount += 1;
    cashierAgg[cId].totalRevenue += Number(sale.total_amount) || 0;
    cashierAgg[cId].unitsSold += Number(sale.total_units) || 0;
  }
  const salesByCashier = Object.values(cashierAgg).sort((a, b) => b.totalRevenue - a.totalRevenue);

  // Inventory Totals & Low-stock counts
  let lowFloorCount = 0;
  let lowTotalCount = 0;
  let outOfFloorCount = 0;
  let totalStockroomUnits = 0;
  let totalFloorUnits = 0;

  for (const p of products) {
    const floor = Number(p.floor_quantity) || 0;
    const stockroom = Number(p.stockroom_quantity) || 0;
    const total = floor + stockroom;
    totalFloorUnits += floor;
    totalStockroomUnits += stockroom;

    if (floor === 0) outOfFloorCount++;
    else if (floor <= (Number(p.floor_threshold) || 15)) lowFloorCount++;

    if (total <= (Number(p.reorder_threshold) || 30)) lowTotalCount++;
  }

  // Stockroom-to-floor movement volume
  const replenishmentTxns = scopedTxns.filter(t => t.transaction_type === 'FLOOR_REPLENISHMENT');
  const movementVolume = replenishmentTxns.reduce((acc, t) => acc + (Number(t.quantity) || 0), 0);

  // Active staff count
  let activeStaffCount = 0;
  if (scopedBranchId) {
    const branchUserIds = new Set(assignments.filter(a => a.branch_id === scopedBranchId && a.active).map(a => a.user_id));
    activeStaffCount = users.filter(u => branchUserIds.has(u.user_id) && u.active).length;
  } else {
    activeStaffCount = users.filter(u => u.active).length;
  }

  // 7-Day Daily Sales Trend
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    last7Days.push({ date: dateStr, dayName: d.toLocaleDateString('en-US', { weekday: 'short' }), revenue: 0, units: 0 });
  }

  for (const s of scopedSales) {
    const sDate = (s.sale_date || '').split('T')[0];
    const match = last7Days.find(d => d.date === sDate);
    if (match) {
      match.revenue += Number(s.total_amount) || 0;
      match.units += Number(s.total_units) || 0;
    }
  }

  res.json({
    kpis: {
      totalSalesValue,
      totalUnitsSold,
      salesCount,
      averageSaleValue: Math.round(averageSaleValue * 100) / 100,
      totalStockOnHand: totalFloorUnits + totalStockroomUnits,
      totalFloorUnits,
      totalStockroomUnits,
      lowFloorCount,
      lowTotalCount,
      outOfFloorCount,
      movementVolume,
      activeStaffCount
    },
    topProducts,
    salesByCashier,
    dailySalesTrend: last7Days
  });
});

module.exports = router;
