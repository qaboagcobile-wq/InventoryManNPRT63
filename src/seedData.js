const bcrypt = require('bcryptjs');
const dataStore = require('./dataStore');

const SEEDED_ADMINS = [
  { fullName: 'Agcobile Qabo', email: 'aqabo@gmail.com', cellNumber: '+27 82 123 4567' },
  { fullName: 'Sibusiso Mathonsi', email: 'smathonsi@gmail.com', cellNumber: '+27 83 234 5678' },
  { fullName: 'Lebogang Malatje', email: 'lmalatjie@gmail.com', cellNumber: '+27 84 345 6789' },
  { fullName: 'Kegoikantse Sebetseba', email: 'ksebetseba@gmail.com', cellNumber: '+27 81 456 7890' }
];

const SEEDED_PRODUCTS = [
  // Smartphones
  { category: 'Smartphones', brand: 'Samsung', name: 'Galaxy A15', price: 3499, sku: '100001', barcode: '600100000001' },
  { category: 'Smartphones', brand: 'Apple', name: 'iPhone 13', price: 9999, sku: '100002', barcode: '600100000002' },
  { category: 'Smartphones', brand: 'Xiaomi', name: 'Redmi Note 13', price: 3999, sku: '100003', barcode: '600100000003' },
  // Laptops
  { category: 'Laptops', brand: 'HP', name: '15s Laptop', price: 8999, sku: '100004', barcode: '600100000004' },
  { category: 'Laptops', brand: 'Lenovo', name: 'IdeaPad 3', price: 9499, sku: '100005', barcode: '600100000005' },
  { category: 'Laptops', brand: 'Dell', name: 'Inspiron 15', price: 10999, sku: '100006', barcode: '600100000006' },
  // Televisions
  { category: 'Televisions', brand: 'Samsung', name: '43" Smart TV', price: 6999, sku: '100007', barcode: '600100000007' },
  { category: 'Televisions', brand: 'LG', name: '43" UHD Smart TV', price: 6499, sku: '100008', barcode: '600100000008' },
  { category: 'Televisions', brand: 'Hisense', name: '43" Smart TV', price: 5999, sku: '100009', barcode: '600100000009' },
  // Headphones
  { category: 'Headphones', brand: 'JBL', name: 'Tune 510BT', price: 899, sku: '100010', barcode: '600100000010' },
  { category: 'Headphones', brand: 'Sony', name: 'WH-CH520', price: 999, sku: '100011', barcode: '600100000011' },
  { category: 'Headphones', brand: 'Skullcandy', name: 'Riff 2', price: 1199, sku: '100012', barcode: '600100000012' },
  // Tablets
  { category: 'Tablets', brand: 'Samsung', name: 'Galaxy Tab A9', price: 3499, sku: '100013', barcode: '600100000013' },
  { category: 'Tablets', brand: 'Apple', name: 'iPad 10th Gen', price: 8999, sku: '100014', barcode: '600100000014' },
  { category: 'Tablets', brand: 'Lenovo', name: 'Tab M10', price: 3999, sku: '100015', barcode: '600100000015' },
  // Computer Monitors
  { category: 'Computer Monitors', brand: 'Samsung', name: '24" LED Monitor', price: 2499, sku: '100016', barcode: '600100000016' },
  { category: 'Computer Monitors', brand: 'LG', name: '24" Full HD Monitor', price: 2299, sku: '100017', barcode: '600100000017' },
  { category: 'Computer Monitors', brand: 'Dell', name: '24" SE2422H', price: 2799, sku: '100018', barcode: '600100000018' },
  // Gaming Consoles
  { category: 'Gaming Consoles', brand: 'Sony', name: 'PlayStation 5 Slim', price: 11999, sku: '100019', barcode: '600100000019' },
  { category: 'Gaming Consoles', brand: 'Microsoft', name: 'Xbox Series X', price: 12999, sku: '100020', barcode: '600100000020' },
  { category: 'Gaming Consoles', brand: 'Nintendo', name: 'Switch OLED', price: 8499, sku: '100021', barcode: '600100000021' },
  // Cameras
  { category: 'Cameras', brand: 'Canon', name: 'EOS R50', price: 13999, sku: '100022', barcode: '600100000022' },
  { category: 'Cameras', brand: 'Nikon', name: 'Z30', price: 12999, sku: '100023', barcode: '600100000023' },
  { category: 'Cameras', brand: 'Sony', name: 'Alpha ZV-E10', price: 11499, sku: '100024', barcode: '600100000024' },
  // Smartwatches
  { category: 'Smartwatches', brand: 'Samsung', name: 'Galaxy Watch 6', price: 4999, sku: '100025', barcode: '600100000025' },
  { category: 'Smartwatches', brand: 'Apple', name: 'Watch SE', price: 5999, sku: '100026', barcode: '600100000026' },
  { category: 'Smartwatches', brand: 'Huawei', name: 'Watch GT 4', price: 4499, sku: '100027', barcode: '600100000027' },
  // Printers
  { category: 'Printers', brand: 'HP', name: 'DeskJet 2820e', price: 1499, sku: '100028', barcode: '600100000028' },
  { category: 'Printers', brand: 'Canon', name: 'PIXMA TS3440', price: 1399, sku: '100029', barcode: '600100000029' },
  { category: 'Printers', brand: 'Epson', name: 'EcoTank L3250', price: 4999, sku: '100030', barcode: '600100000030' }
];

async function seedDatabase(force = false) {
  const users = await dataStore.read('users');
  const stores = await dataStore.read('stores');

  if (users.length > 0 && stores.length > 0 && !force) {
    console.log('[Seed] Data already present, skipping initial seed.');
    return;
  }

  console.log('[Seed] Seeding initial Connect configuration...');
  const now = new Date().toISOString();

  // 1. Initial Store
  const initialStore = {
    store_id: 'store-particles-01',
    store_name: 'Particles Electronics',
    slogan: 'Connect your stock, floor and sales in one place.',
    currency: 'ZAR',
    currency_symbol: 'R',
    created_at: now,
    updated_at: now
  };
  await dataStore.write('stores', [initialStore]);

  // 2. Initial Branch
  const initialBranch = {
    branch_id: 'branch-001',
    store_id: initialStore.store_id,
    branch_number: 'BR-001',
    branch_name: 'Main Branch - Particles Electronics',
    active: true,
    created_at: now,
    updated_at: now
  };
  await dataStore.write('branches', [initialBranch]);

  // 3. Seeded Admins with hashed initial password
  const initialPasswordHash = await bcrypt.hash('particles2026', 10);
  const seededUserRecords = SEEDED_ADMINS.map((admin, idx) => ({
    user_id: `user-admin-${idx + 1}`,
    full_name: admin.fullName,
    email: admin.email.toLowerCase(),
    cell_number: admin.cellNumber,
    password_hash: initialPasswordHash,
    role: 'admin',
    employee_number: null,
    first_login_required: true,
    active: true,
    created_at: now,
    updated_at: now
  }));
  await dataStore.write('users', seededUserRecords);

  // 4. Categories
  const categoryNames = [...new Set(SEEDED_PRODUCTS.map(p => p.category))];
  const categoryRecords = categoryNames.map((name, idx) => ({
    category_id: `cat-${idx + 1}`,
    store_id: initialStore.store_id,
    category_name: name,
    description: `${name} category`,
    created_at: now
  }));
  await dataStore.write('categories', categoryRecords);

  const categoryMap = new Map(categoryRecords.map(c => [c.category_name, c.category_id]));

  // 5. Products (150 total: 100 stockroom, 50 floor)
  const productRecords = SEEDED_PRODUCTS.map((prod, idx) => ({
    product_id: `prod-${idx + 1}`,
    store_id: initialStore.store_id,
    category_id: categoryMap.get(prod.category),
    brand: prod.brand,
    product_name: prod.name,
    description: `${prod.brand} ${prod.name}`,
    sku_6_digit: prod.sku,
    barcode: prod.barcode,
    price: prod.price,
    floor_quantity: 50,
    stockroom_quantity: 100,
    floor_threshold: 15,
    reorder_threshold: 30,
    created_at: now,
    updated_at: now
  }));
  await dataStore.write('products', productRecords);

  // Initialize other required collections
  await dataStore.write('user_branch_assignments', []);
  await dataStore.write('sales', []);
  await dataStore.write('sale_items', []);
  await dataStore.write('inventory_transactions', []);
  await dataStore.write('password_reset_events', []);

  console.log('[Seed] Database initialization complete: 1 Store, 1 Branch, 4 Admins, 10 Categories, 30 Products.');
}

if (require.main === module) {
  seedDatabase(true).then(() => {
    console.log('[Seed] Done');
    process.exit(0);
  }).catch(err => {
    console.error('[Seed Error]', err);
    process.exit(1);
  });
}

module.exports = { seedDatabase };
