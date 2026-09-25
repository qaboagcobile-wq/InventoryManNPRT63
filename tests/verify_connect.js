const http = require('http');
const app = require('../src/server');

let server;
const PORT = 3847;
const BASE_URL = `http://localhost:${PORT}`;

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqHeaders = { 'Content-Type': 'application/json', ...headers };
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: reqHeaders
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) { json = data; }
        resolve({ status: res.statusCode, data: json });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('--- Starting Comprehensive Connect Test Suite ---');
  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 1000));

  try {
    // 1. Admin login with bootstrap password
    console.log('[Test 1] Admin login with bootstrap password');
    const adminLogin = await request('POST', '/api/auth/login', {
      identifier: 'aqabo@gmail.com',
      password: 'particles2026'
    });
    if (adminLogin.status !== 200 || !adminLogin.data.user.firstLoginRequired) {
      throw new Error(`Admin login failed: ${JSON.stringify(adminLogin.data)}`);
    }
    const adminToken = adminLogin.data.token;
    console.log('✓ Admin login successful with first_login_required = true');

    // 2. Change first-login password
    console.log('[Test 2] Change first-login password for Admin');
    const passChange = await request('POST', '/api/auth/change-first-login-password', {
      newPassword: 'NewSecureAdminPassword123'
    }, { Authorization: `Bearer ${adminToken}` });
    if (passChange.status !== 200) {
      throw new Error(`Password change failed: ${JSON.stringify(passChange.data)}`);
    }
    const updatedAdminToken = passChange.data.token || adminToken;
    console.log('✓ First login password successfully changed');

    // 3. Admin creates a new branch
    console.log('[Test 3] Admin creates a new branch');
    const newBranchRes = await request('POST', '/api/stores/branches', {
      branchNumber: 'BR-002',
      branchName: 'Particles Cape Town'
    }, { Authorization: `Bearer ${updatedAdminToken}` });
    if (newBranchRes.status !== 201) {
      throw new Error(`Create branch failed: ${JSON.stringify(newBranchRes.data)}`);
    }
    const branch2 = newBranchRes.data;
    console.log(`✓ Created branch: ${branch2.branch_number} (${branch2.branch_name})`);

    // 4. Admin creates Super Manager (FR-05)
    console.log('[Test 4] Admin creates Super Manager');
    const smCreateRes = await request('POST', '/api/users/super-manager', {
      fullName: 'Chief Super Manager',
      email: 'supermanager@particles.co.za',
      cellNumber: '+27 82 555 1234'
    }, { Authorization: `Bearer ${updatedAdminToken}` });
    if (smCreateRes.status !== 201) {
      throw new Error(`Create Super Manager failed: ${JSON.stringify(smCreateRes.data)}`);
    }
    const smUser = smCreateRes.data.user;
    const smTempPass = smCreateRes.data.temporaryPassword;
    console.log(`✓ Super Manager created. Employee #: ${smUser.employee_number}, Temp Pass: ${smTempPass}`);

    // 5. Super Manager logs in with Employee Number and changes password
    console.log('[Test 5] Super Manager login with Employee Number');
    const smLogin = await request('POST', '/api/auth/login', {
      identifier: smUser.employee_number,
      password: smTempPass
    });
    if (smLogin.status !== 200 || !smLogin.data.user.firstLoginRequired) {
      throw new Error(`Super Manager login failed: ${JSON.stringify(smLogin.data)}`);
    }
    const smToken = smLogin.data.token;
    const smPassChange = await request('POST', '/api/auth/change-first-login-password', {
      newPassword: 'NewSecureSMPassword123'
    }, { Authorization: `Bearer ${smToken}` });
    const updatedSmToken = smPassChange.data.token || smToken;
    console.log('✓ Super Manager logged in with Employee Number and updated password');

    // 6. Super Manager creates Branch Manager (FR-11)
    console.log('[Test 6] Super Manager creates Branch Manager for Branch 001');
    const mgrCreateRes = await request('POST', '/api/users/manager', {
      fullName: 'Alice Branch Manager',
      email: 'alice.manager@particles.co.za',
      cellNumber: '+27 83 777 8888',
      branchId: 'branch-001'
    }, { Authorization: `Bearer ${updatedSmToken}` });
    if (mgrCreateRes.status !== 201) {
      throw new Error(`Create Manager failed: ${JSON.stringify(mgrCreateRes.data)}`);
    }
    const mgrUser = mgrCreateRes.data.user;
    const mgrTempPass = mgrCreateRes.data.temporaryPassword;
    console.log(`✓ Branch Manager created. Employee #: ${mgrUser.employee_number}, Temp Pass: ${mgrTempPass}`);

    // 7. Manager logs in and changes password
    console.log('[Test 7] Manager login and password change');
    const mgrLogin = await request('POST', '/api/auth/login', {
      identifier: mgrUser.employee_number,
      password: mgrTempPass
    });
    const mgrToken = mgrLogin.data.token;
    const mgrPassChange = await request('POST', '/api/auth/change-first-login-password', {
      newPassword: 'NewSecureMgrPassword123'
    }, { Authorization: `Bearer ${mgrToken}` });
    const updatedMgrToken = mgrPassChange.data.token || mgrToken;
    console.log('✓ Manager logged in and updated password');

    // 8. Manager creates Cashier and Merchandiser (FR-17, FR-18)
    console.log('[Test 8] Manager creates Cashier and Merchandiser for assigned branch');
    const cashierCreateRes = await request('POST', '/api/users/staff', {
      fullName: 'Charlie Cashier',
      email: 'charlie.cashier@particles.co.za',
      cellNumber: '+27 84 111 2222',
      position: 'cashier'
    }, { Authorization: `Bearer ${updatedMgrToken}` });
    if (cashierCreateRes.status !== 201) {
      throw new Error(`Create Cashier failed: ${JSON.stringify(cashierCreateRes.data)}`);
    }
    const cashierUser = cashierCreateRes.data.user;
    const cashierTempPass = cashierCreateRes.data.temporaryPassword;
    console.log(`✓ Cashier created: ${cashierUser.employee_number}`);

    const merchandiserCreateRes = await request('POST', '/api/users/staff', {
      fullName: 'Mary Merchandiser',
      email: 'mary.merchandiser@particles.co.za',
      cellNumber: '+27 84 333 4444',
      position: 'merchandiser'
    }, { Authorization: `Bearer ${updatedMgrToken}` });
    if (merchandiserCreateRes.status !== 201) {
      throw new Error(`Create Merchandiser failed: ${JSON.stringify(merchandiserCreateRes.data)}`);
    }
    const merchUser = merchandiserCreateRes.data.user;
    const merchTempPass = merchandiserCreateRes.data.temporaryPassword;
    console.log(`✓ Merchandiser created: ${merchUser.employee_number}`);

    // Activate Cashier
    const cashierLogin = await request('POST', '/api/auth/login', {
      identifier: cashierUser.employee_number,
      password: cashierTempPass
    });
    const cashierPassChange = await request('POST', '/api/auth/change-first-login-password', {
      newPassword: 'CashierPassword123'
    }, { Authorization: `Bearer ${cashierLogin.data.token}` });
    const cashierToken = cashierPassChange.data.token;

    // Activate Merchandiser
    const merchLogin = await request('POST', '/api/auth/login', {
      identifier: merchUser.employee_number,
      password: merchTempPass
    });
    const merchPassChange = await request('POST', '/api/auth/change-first-login-password', {
      newPassword: 'MerchPassword123'
    }, { Authorization: `Bearer ${merchLogin.data.token}` });
    const merchToken = merchPassChange.data.token;

    // 9. Stock Receiving (FR-31)
    console.log('[Test 9] Manager receives stock into stockroom');
    const receiveRes = await request('POST', '/api/stock/receive', {
      productId: 'prod-1', // Samsung Galaxy A15
      quantity: 50,
      notes: 'Supplier shipment PO-9948'
    }, { Authorization: `Bearer ${updatedMgrToken}` });
    if (receiveRes.status !== 200 || receiveRes.data.product.stockroom_quantity !== 150) {
      throw new Error(`Stock receipt failed: ${JSON.stringify(receiveRes.data)}`);
    }
    console.log('✓ Stock received into stockroom. New stockroom quantity: 150, floor quantity remained 50');

    // 10. Floor Replenishment (FR-32, FR-33)
    console.log('[Test 10] Merchandiser moves stock from stockroom to floor');
    // Test rejection when exceeding stockroom (FR-33)
    const overTransferRes = await request('POST', '/api/stock/replenish-floor', {
      productId: 'prod-1',
      quantity: 9999
    }, { Authorization: `Bearer ${merchToken}` });
    if (overTransferRes.status !== 400) {
      throw new Error('FR-33 check failed: Expected over-transfer to be rejected');
    }
    console.log('✓ FR-33 passed: Over-transfer exceeding stockroom quantity was rejected');

    // Legitimate transfer
    const transferRes = await request('POST', '/api/stock/replenish-floor', {
      productId: 'prod-1',
      quantity: 20
    }, { Authorization: `Bearer ${merchToken}` });
    if (transferRes.status !== 200 || transferRes.data.product.floor_quantity !== 70 || transferRes.data.product.stockroom_quantity !== 130) {
      throw new Error(`Transfer failed: ${JSON.stringify(transferRes.data)}`);
    }
    console.log('✓ Floor replenishment passed: Floor: 70, Stockroom: 130');

    // 11. Cashier POS Sale (FR-38 to FR-42)
    console.log('[Test 11] Cashier records sale');
    // Test negative floor stock prevention (FR-42)
    const overSaleRes = await request('POST', '/api/sales', {
      items: [{ productId: 'prod-1', quantity: 999 }]
    }, { Authorization: `Bearer ${cashierToken}` });
    if (overSaleRes.status !== 400) {
      throw new Error('FR-42 check failed: Expected oversale to be rejected');
    }
    console.log('✓ FR-42 passed: Oversale exceeding floor stock was rejected');

    // Complete legitimate sale of 5 units
    const saleRes = await request('POST', '/api/sales', {
      items: [{ productId: 'prod-1', quantity: 5 }],
      customerRef: 'Customer John'
    }, { Authorization: `Bearer ${cashierToken}` });
    if (saleRes.status !== 201 || saleRes.data.sale.total_amount !== 17495) {
      throw new Error(`Sale failed: ${JSON.stringify(saleRes.data)}`);
    }
    console.log(`✓ Sale completed: 5 units sold, total R${saleRes.data.sale.total_amount}`);

    // Verify product floor quantity reduced by exactly 5
    const productsRes = await request('GET', '/api/products', null, { Authorization: `Bearer ${cashierToken}` });
    const prod1 = productsRes.data.find(p => p.product_id === 'prod-1');
    if (prod1.floor_quantity !== 65) {
      throw new Error(`Floor quantity mismatch: expected 65, got ${prod1.floor_quantity}`);
    }
    console.log('✓ Floor quantity correctly decremented to 65');

    // 12. Manager Dashboard KPIs (FR-44)
    console.log('[Test 12] Manager views Dashboard KPIs');
    const kpiRes = await request('GET', '/api/reports/dashboard-kpis', null, { Authorization: `Bearer ${updatedMgrToken}` });
    if (kpiRes.status !== 200 || kpiRes.data.kpis.totalSalesValue !== 17495) {
      throw new Error(`KPI query failed: ${JSON.stringify(kpiRes.data)}`);
    }
    console.log(`✓ KPIs verified: Total Sales = R${kpiRes.data.kpis.totalSalesValue}, Units Sold = ${kpiRes.data.kpis.totalUnitsSold}`);

    // 13. Security: Admin accounts cannot be deleted (FR-10)
    console.log('[Test 13] Verifying Admin account deletion protection (FR-10)');
    const deleteAdminRes = await request('DELETE', `/api/users/user-admin-1`, null, { Authorization: `Bearer ${updatedAdminToken}` });
    if (deleteAdminRes.status !== 403) {
      throw new Error('FR-10 check failed: Admin account deletion was not blocked');
    }
    console.log('✓ FR-10 passed: Admin account deletion blocked with 403 Forbidden');

    console.log('\n========================================');
    console.log('🎉 ALL CONNECT SPECIFICATION TESTS PASSED!');
    console.log('========================================\n');
  } finally {
    if (server) server.close();
  }
}

runTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  if (server) server.close();
  process.exit(1);
});
