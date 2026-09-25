const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { seedDatabase } = require('./seedData');

const authRoutes = require('./routes/auth');
const storeRoutes = require('./routes/stores');
const userRoutes = require('./routes/users');
const productRoutes = require('./routes/products');
const stockRoutes = require('./routes/stock');
const saleRoutes = require('./routes/sales');
const reportRoutes = require('./routes/reports');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/reports', reportRoutes);

// Fallback for Single Page App
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start server after seeding check
seedDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(` CONNECT - Retail Inventory & Sales Management System `);
    console.log(` Initial Store: Particles Electronics                 `);
    console.log(` Server running at: http://localhost:${PORT}          `);
    console.log(`======================================================\n`);
  });
}).catch(err => {
  console.error('Failed to initialize seed data:', err);
  process.exit(1);
});

module.exports = app;
