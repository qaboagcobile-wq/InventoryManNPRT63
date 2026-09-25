// Connect Client Application Controller

const app = {
  currentUser: null,
  token: localStorage.getItem('connect_token') || null,
  selectedRole: 'admin',
  cart: [],
  cartPaymentType: 'full', // 'full' or 'layby'
  productsCache: [],
  categoriesCache: [],
  branchesCache: [],
  storesCache: [],
  deleteTarget: null, // { userId, name, role }

  async init() {
    this.setupListeners();
    if (this.token) {
      await this.fetchCurrentUser();
    } else {
      this.renderUnauthenticated();
    }
  },

  setupListeners() {
    setInterval(() => {
      if (this.token && this.currentUser) {
        this.pollInboxCount();
      }
    }, 10000);
  },

  getAuthHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': this.token ? `Bearer ${this.token}` : ''
    };
  },

  showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
    toast.innerHTML = `<span style="font-weight:bold;">${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  },

  openModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.style.display = 'flex';
  },

  closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.style.display = 'none';
  },

  // Role-Selection Login Modal
  openLoginModal(role = 'admin') {
    this.setLoginRole(role);
    this.openModal('login-modal');
  },

  setLoginRole(role) {
    this.selectedRole = role;
    const titleEl = document.getElementById('login-modal-title');
    const labelEl = document.getElementById('login-identifier-label');
    const inputEl = document.getElementById('login-identifier');

    // Update pill active classes
    const roles = ['admin', 'super_manager', 'manager', 'cashier', 'merchandiser'];
    roles.forEach(r => {
      const pill = document.getElementById(`pill-role-${r}`);
      if (pill) {
        if (r === role) {
          pill.className = 'btn btn-sm btn-primary';
        } else {
          pill.className = 'btn btn-sm btn-secondary';
        }
      }
    });

    if (role === 'admin') {
      titleEl.textContent = 'Platform Admin Sign In';
      labelEl.textContent = 'Admin Email Address';
      inputEl.placeholder = 'name@company.com';
    } else {
      const names = {
        super_manager: 'Super Manager',
        manager: 'Branch Manager',
        cashier: 'Cashier POS',
        merchandiser: 'Merchandiser'
      };
      titleEl.textContent = `${names[role] || 'Staff'} Sign In`;
      labelEl.textContent = 'Employee Number';
      inputEl.placeholder = 'Enter assigned Employee Number';
    }
  },

  openForgotPasswordModal() {
    this.closeModal('login-modal');
    this.openModal('forgot-modal');
  },

  // Auth Operations
  async handleLogin(e) {
    e.preventDefault();
    const identifier = document.getElementById('login-identifier').value.trim();
    const password = document.getElementById('login-password').value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password })
      });
      const data = await res.json();

      if (!res.ok) {
        return this.showToast(data.error || 'Login failed', 'error');
      }

      this.token = data.token;
      this.currentUser = data.user;
      localStorage.setItem('connect_token', this.token);
      
      const loginForm = document.getElementById('login-form');
      if (loginForm) loginForm.reset();

      this.closeModal('login-modal');
      this.showToast(`Welcome, ${data.user.fullName}!`);

      if (data.user.firstLoginRequired) {
        this.openModal('first-login-modal');
      } else {
        this.renderAuthenticated();
      }
    } catch (err) {
      this.showToast('Network error during login', 'error');
    }
  },

  async handleFirstLoginPassword(e) {
    e.preventDefault();
    const newPass = document.getElementById('first-login-new-pass').value;
    const confirmPass = document.getElementById('first-login-confirm-pass').value;

    if (newPass !== confirmPass) {
      return this.showToast('Passwords do not match', 'error');
    }
    if (newPass.length < 6) {
      return this.showToast('Password must be at least 6 characters', 'error');
    }

    try {
      const res = await fetch('/api/auth/change-first-login-password', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ newPassword: newPass })
      });
      const data = await res.json();

      if (!res.ok) {
        return this.showToast(data.error || 'Failed to update password', 'error');
      }

      if (data.token) {
        this.token = data.token;
        localStorage.setItem('connect_token', this.token);
      }
      this.currentUser.firstLoginRequired = false;
      const form = document.getElementById('first-login-form');
      if (form) form.reset();

      this.closeModal('first-login-modal');
      this.showToast('Password saved! Access granted.');
      this.renderAuthenticated();
    } catch (err) {
      this.showToast('Network error saving password', 'error');
    }
  },

  async handleForgotPassword(e) {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value.trim();

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      const form = document.getElementById('forgot-form');
      if (form) form.reset();

      this.closeModal('forgot-modal');
      this.showToast(data.message || 'Temporary password sent');
      this.pollInboxCount();
    } catch (err) {
      this.showToast('Error requesting password reset', 'error');
    }
  },

  async fetchCurrentUser() {
    try {
      const res = await fetch('/api/auth/me', { headers: this.getAuthHeaders() });
      if (!res.ok) {
        this.logout();
        return;
      }
      const data = await res.json();
      this.currentUser = data.user;

      if (this.currentUser.firstLoginRequired) {
        this.openModal('first-login-modal');
      } else {
        this.renderAuthenticated();
      }
    } catch (err) {
      this.logout();
    }
  },

  logout() {
    this.token = null;
    this.currentUser = null;
    localStorage.removeItem('connect_token');
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    this.renderUnauthenticated();
    this.showToast('You have been logged out.');
  },

  openProfileModal() {
    if (!this.currentUser) return;
    document.getElementById('profile-email').value = this.currentUser.email || '';
    document.getElementById('profile-cell').value = this.currentUser.cellNumber || '';
    document.getElementById('profile-current-pass').value = '';
    document.getElementById('profile-new-pass').value = '';
    this.openModal('profile-modal');
  },

  async handleProfileUpdate(e) {
    e.preventDefault();
    const email = document.getElementById('profile-email').value.trim();
    const cellNumber = document.getElementById('profile-cell').value.trim();
    const currentPassword = document.getElementById('profile-current-pass').value;
    const newPassword = document.getElementById('profile-new-pass').value;

    const payload = { email, cellNumber };
    if (newPassword) {
      payload.currentPassword = currentPassword;
      payload.newPassword = newPassword;
    }

    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        return this.showToast(data.error || 'Failed to update profile', 'error');
      }
      this.closeModal('profile-modal');
      this.showToast('Profile updated successfully');
      await this.fetchCurrentUser();
    } catch (err) {
      this.showToast('Error updating profile', 'error');
    }
  },

  // UI Render States
  renderUnauthenticated() {
    document.getElementById('nav-unauth').style.display = 'block';
    document.getElementById('nav-auth').style.display = 'none';

    // When logged out, header only shows Connect
    document.getElementById('header-app-name').textContent = 'CONNECT';
    document.getElementById('header-store-subtitle').textContent = 'Retail Inventory & Sales System';

    this.hideAllRoleViews();
    document.getElementById('landing-view').style.display = 'block';
  },

  renderAuthenticated() {
    document.getElementById('nav-unauth').style.display = 'none';
    const navAuth = document.getElementById('nav-auth');
    navAuth.style.display = 'flex';

    document.getElementById('user-display-name').textContent = this.currentUser.fullName;
    const roleBadge = document.getElementById('user-role-badge');
    roleBadge.textContent = this.currentUser.role.replace('_', ' ').toUpperCase();

    // Show store name ONLY when authenticated user belongs to that store
    const storeBadge = document.getElementById('user-store-badge');
    const storeSubtitle = document.getElementById('header-store-subtitle');

    if (this.currentUser.storeName && this.currentUser.role !== 'admin') {
      storeBadge.textContent = this.currentUser.storeName;
      storeBadge.style.display = 'inline-block';
      storeSubtitle.textContent = `Store: ${this.currentUser.storeName}`;
    } else {
      storeBadge.style.display = 'none';
      storeSubtitle.textContent = 'Platform Management';
    }

    const branchBadge = document.getElementById('user-branch-badge');
    if (this.currentUser.branchName) {
      branchBadge.textContent = this.currentUser.branchNumber || this.currentUser.branchName;
      branchBadge.style.display = 'inline-block';
    } else {
      branchBadge.style.display = 'none';
    }

    this.hideAllRoleViews();
    this.pollInboxCount();

    // Show appropriate role view
    switch (this.currentUser.role) {
      case 'admin':
        document.getElementById('admin-view').style.display = 'block';
        this.loadAdminView();
        break;
      case 'super_manager':
        document.getElementById('super-manager-view').style.display = 'block';
        this.loadSuperManagerView();
        break;
      case 'manager':
        document.getElementById('manager-view').style.display = 'block';
        this.loadManagerView();
        break;
      case 'cashier':
        document.getElementById('cashier-view').style.display = 'block';
        this.loadCashierView();
        break;
      case 'merchandiser':
        document.getElementById('merchandiser-view').style.display = 'block';
        this.loadMerchandiserView();
        break;
    }
  },

  hideAllRoleViews() {
    document.getElementById('landing-view').style.display = 'none';
    document.getElementById('admin-view').style.display = 'none';
    document.getElementById('super-manager-view').style.display = 'none';
    document.getElementById('manager-view').style.display = 'none';
    document.getElementById('cashier-view').style.display = 'none';
    document.getElementById('merchandiser-view').style.display = 'none';
  },

  showLandingOrDashboard() {
    if (this.currentUser) {
      this.renderAuthenticated();
    } else {
      this.renderUnauthenticated();
    }
  },

  // --- ADMIN VIEW LOGIC ---
  async loadAdminView() {
    await this.loadAdminStores();
    await this.loadAdminBranches();
    await this.loadAdminUsers();
  },

  switchAdminTab(tab) {
    document.querySelectorAll('#admin-view .tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('admin-tab-stores').style.display = tab === 'stores' ? 'block' : 'none';
    document.getElementById('admin-tab-users').style.display = tab === 'users' ? 'block' : 'none';
    document.getElementById('admin-tab-audit').style.display = tab === 'audit' ? 'block' : 'none';
    event.target.classList.add('active');

    if (tab === 'audit') this.loadAdminAuditLog();
  },

  async loadAdminStores() {
    const res = await fetch('/api/stores', { headers: this.getAuthHeaders() });
    const stores = await res.json();
    this.storesCache = stores;

    const tbody = document.getElementById('admin-stores-tbody');
    tbody.innerHTML = stores.map(s => `
      <tr>
        <td><code>${s.store_id}</code></td>
        <td><strong>${s.store_name}</strong></td>
        <td>${s.slogan || '-'}</td>
        <td><span class="badge badge-sky">${s.currency} (${s.currency_symbol || 'R'})</span></td>
        <td>${new Date(s.created_at).toLocaleDateString()}</td>
      </tr>
    `).join('') || `<tr><td colspan="5" style="text-align:center;">No stores found</td></tr>`;
  },

  async loadAdminBranches() {
    const res = await fetch('/api/stores/branches', { headers: this.getAuthHeaders() });
    const branches = await res.json();
    this.branchesCache = branches;

    const storesRes = await fetch('/api/stores', { headers: this.getAuthHeaders() });
    const stores = await storesRes.json();
    const storeMap = new Map(stores.map(s => [s.store_id, s.store_name]));

    const tbody = document.getElementById('admin-branches-tbody');
    tbody.innerHTML = branches.map(b => `
      <tr>
        <td><strong>${b.branch_number}</strong></td>
        <td>${b.branch_name}</td>
        <td><span class="badge badge-emerald">${storeMap.get(b.store_id) || 'Particles Electronics'}</span></td>
        <td><span class="badge ${b.active ? 'badge-emerald' : 'badge-rose'}">${b.active ? 'Active' : 'Inactive'}</span></td>
        <td>${new Date(b.created_at).toLocaleDateString()}</td>
      </tr>
    `).join('') || `<tr><td colspan="5" style="text-align:center;">No branches created yet</td></tr>`;
  },

  async loadAdminUsers() {
    const res = await fetch('/api/users', { headers: this.getAuthHeaders() });
    const users = await res.json();
    const tbody = document.getElementById('admin-users-tbody');

    tbody.innerHTML = users.map(u => {
      const isSuperManager = u.role === 'super_manager';
      let actionHtml = `<span style="color:var(--text-muted); font-size:0.8rem;">Protected</span>`;

      if (isSuperManager) {
        actionHtml = `
          <div style="display:flex; gap:6px;">
            ${u.active 
              ? `<button class="btn btn-secondary btn-sm" onclick="app.deactivateUser('${u.user_id}', '${u.full_name}')">Deactivate</button>` 
              : `<button class="btn btn-success btn-sm" onclick="app.activateUser('${u.user_id}', '${u.full_name}')">Activate</button>`}
            <button class="btn btn-danger btn-sm" onclick="app.promptDeleteUser('${u.user_id}', '${u.full_name}', '${u.role}')">Delete</button>
          </div>
        `;
      }

      return `
        <tr>
          <td><strong>${u.full_name}</strong></td>
          <td><span class="badge badge-sky">${u.role.toUpperCase()}</span></td>
          <td>${u.role === 'admin' ? u.email : (u.employee_number || 'N/A')}</td>
          <td>${u.cell_number || '-'}</td>
          <td>${u.branchName || 'Platform-Wide'}</td>
          <td><span class="badge ${u.active ? 'badge-emerald' : 'badge-rose'}">${u.active ? 'Active' : 'Inactive'}</span></td>
          <td>${actionHtml}</td>
        </tr>
      `;
    }).join('');
  },

  async loadAdminAuditLog() {
    const res = await fetch('/api/stock/transactions', { headers: this.getAuthHeaders() });
    const txns = await res.json();
    const tbody = document.getElementById('admin-audit-tbody');

    tbody.innerHTML = txns.map(t => `
      <tr>
        <td>${new Date(t.transaction_date).toLocaleString()}</td>
        <td><span class="badge badge-amber">${t.transaction_type}</span></td>
        <td>${t.product_name || '-'}</td>
        <td>${t.from_location} &rarr; ${t.to_location}</td>
        <td>${t.user_name}</td>
        <td>${t.notes || '-'}</td>
      </tr>
    `).join('') || `<tr><td colspan="6" style="text-align:center;">No audit records logged yet</td></tr>`;
  },

  openCreateStoreModal() {
    this.openModal('create-store-modal');
  },

  async handleCreateStore(e) {
    e.preventDefault();
    const storeName = document.getElementById('store-name-input').value.trim();
    const slogan = document.getElementById('store-slogan-input').value.trim();
    const currency = document.getElementById('store-currency-input').value.trim();

    try {
      const res = await fetch('/api/stores', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ storeName, slogan, currency })
      });
      const data = await res.json();
      if (!res.ok) return this.showToast(data.error || 'Failed to create store', 'error');

      const form = document.getElementById('create-store-form');
      if (form) form.reset();

      this.closeModal('create-store-modal');
      this.showToast(`Store "${data.store_name}" created successfully.`);
      this.loadAdminStores();
    } catch (err) {
      this.showToast('Network error creating store', 'error');
    }
  },

  async openCreateBranchModal() {
    const res = await fetch('/api/stores', { headers: this.getAuthHeaders() });
    const stores = await res.json();
    const select = document.getElementById('branch-store-select');
    select.innerHTML = stores.map(s => `<option value="${s.store_id}">${s.store_name}</option>`).join('');
    this.openModal('create-branch-modal');
  },

  async handleCreateBranch(e) {
    e.preventDefault();
    const storeId = document.getElementById('branch-store-select').value;
    const branchNumber = document.getElementById('branch-number').value.trim();
    const branchName = document.getElementById('branch-name').value.trim();

    try {
      const res = await fetch('/api/stores/branches', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ storeId, branchNumber, branchName })
      });
      const data = await res.json();
      if (!res.ok) return this.showToast(data.error || 'Failed to create branch', 'error');

      const form = document.getElementById('create-branch-form');
      if (form) form.reset();

      this.closeModal('create-branch-modal');
      this.showToast(`Branch ${data.branch_number} created successfully.`);
      this.loadAdminBranches();
    } catch (err) {
      this.showToast('Network error creating branch', 'error');
    }
  },

  openCreateSuperManagerModal() {
    this.openModal('create-sm-modal');
  },

  async handleCreateSuperManager(e) {
    e.preventDefault();
    const fullName = document.getElementById('sm-name').value.trim();
    const email = document.getElementById('sm-email').value.trim();
    const cellNumber = document.getElementById('sm-cell').value.trim();

    try {
      const res = await fetch('/api/users/super-manager', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ fullName, email, cellNumber })
      });
      const data = await res.json();
      if (!res.ok) return this.showToast(data.error || 'Failed to create Super Manager', 'error');

      const form = document.getElementById('create-sm-form');
      if (form) form.reset();

      this.closeModal('create-sm-modal');
      this.showToast(`Super Manager created! Employee #: ${data.user.employee_number}`);
      this.loadAdminUsers();
      this.pollInboxCount();
    } catch (err) {
      this.showToast('Network error creating Super Manager', 'error');
    }
  },

  // --- SUPER MANAGER VIEW LOGIC ---
  async loadSuperManagerView() {
    const res = await fetch('/api/users', { headers: this.getAuthHeaders() });
    const users = await res.json();
    const managers = users.filter(u => u.role === 'manager');
    const tbody = document.getElementById('sm-managers-tbody');

    tbody.innerHTML = managers.map(m => `
      <tr>
        <td><strong>${m.employee_number}</strong></td>
        <td>${m.full_name}</td>
        <td>${m.email}</td>
        <td>${m.cell_number || '-'}</td>
        <td>${m.branchName || m.branchNumber || 'Unassigned'}</td>
        <td><span class="badge ${m.active ? 'badge-emerald' : 'badge-rose'}">${m.active ? 'Active' : 'Inactive'}</span></td>
        <td>
          <div style="display:flex; gap:6px;">
            ${m.active 
              ? `<button class="btn btn-secondary btn-sm" onclick="app.deactivateUser('${m.user_id}', '${m.full_name}')">Deactivate</button>` 
              : `<button class="btn btn-success btn-sm" onclick="app.activateUser('${m.user_id}', '${m.full_name}')">Activate</button>`}
            <button class="btn btn-danger btn-sm" onclick="app.promptDeleteUser('${m.user_id}', '${m.full_name}', '${m.role}')">Delete</button>
          </div>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="7" style="text-align:center;">No managers created yet. Click "+ Add Branch Manager".</td></tr>`;
  },

  async openCreateManagerModal() {
    const res = await fetch('/api/stores/branches', { headers: this.getAuthHeaders() });
    const branches = await res.json();
    const select = document.getElementById('mgr-branch-select');
    select.innerHTML = branches.map(b => `<option value="${b.branch_id}">${b.branch_number} - ${b.branch_name}</option>`).join('');
    this.openModal('create-mgr-modal');
  },

  async handleCreateManager(e) {
    e.preventDefault();
    const fullName = document.getElementById('mgr-name').value.trim();
    const email = document.getElementById('mgr-email').value.trim();
    const cellNumber = document.getElementById('mgr-cell').value.trim();
    const branchId = document.getElementById('mgr-branch-select').value;

    try {
      const res = await fetch('/api/users/manager', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ fullName, email, cellNumber, branchId })
      });
      const data = await res.json();
      if (!res.ok) return this.showToast(data.error || 'Failed to create Manager', 'error');

      const form = document.getElementById('create-mgr-form');
      if (form) form.reset();

      this.closeModal('create-mgr-modal');
      this.showToast(`Manager created! Employee #: ${data.user.employee_number}`);
      this.loadSuperManagerView();
      this.pollInboxCount();
    } catch (err) {
      this.showToast('Network error creating Manager', 'error');
    }
  },

  // Account Lifecycle Helpers (Activate, Deactivate, Delete with Reason)
  async activateUser(userId, name) {
    try {
      const res = await fetch(`/api/users/${userId}/activate`, {
        method: 'POST',
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok) return this.showToast(data.error || 'Activation failed', 'error');

      this.showToast(data.message || `Activated ${name}`);
      this.refreshCurrentRoleUsers();
    } catch (err) {
      this.showToast('Network error during activation', 'error');
    }
  },

  async deactivateUser(userId, name) {
    try {
      const res = await fetch(`/api/users/${userId}/deactivate`, {
        method: 'POST',
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok) return this.showToast(data.error || 'Deactivation failed', 'error');

      this.showToast(data.message || `Deactivated ${name}`);
      this.refreshCurrentRoleUsers();
    } catch (err) {
      this.showToast('Network error during deactivation', 'error');
    }
  },

  promptDeleteUser(userId, name, role) {
    this.deleteTarget = { userId, name, role };
    document.getElementById('delete-target-name').textContent = name;
    document.getElementById('delete-target-role').textContent = role.toUpperCase();
    document.getElementById('delete-reason-text').value = '';
    this.openModal('delete-reason-modal');
  },

  async confirmDeleteUser(e) {
    e.preventDefault();
    if (!this.deleteTarget) return;

    const reason = document.getElementById('delete-reason-text').value.trim();
    if (!reason) return this.showToast('Please specify a deletion reason', 'error');

    try {
      const res = await fetch(`/api/users/${this.deleteTarget.userId}/delete`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (!res.ok) return this.showToast(data.error || 'Deletion failed', 'error');

      this.closeModal('delete-reason-modal');
      this.showToast(data.message);
      this.deleteTarget = null;
      this.refreshCurrentRoleUsers();
    } catch (err) {
      this.showToast('Network error during deletion', 'error');
    }
  },

  refreshCurrentRoleUsers() {
    if (this.currentUser.role === 'admin') this.loadAdminUsers();
    else if (this.currentUser.role === 'super_manager') this.loadSuperManagerView();
    else if (this.currentUser.role === 'manager') this.loadStaffList();
  },

  // --- MANAGER VIEW LOGIC (7 Tabs) ---
  async loadManagerView() {
    document.getElementById('manager-branch-label').textContent = 
      `Assigned Branch: ${this.currentUser.branchNumber || ''} - ${this.currentUser.branchName || 'Main Branch'}`;
    await this.loadManagerKPIs();
    await this.loadCategories();
  },

  switchManagerTab(tab) {
    document.querySelectorAll('#manager-view .tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    const tabs = ['overview', 'sales', 'products', 'stockroom', 'floor', 'staff', 'transactions'];
    tabs.forEach(t => {
      const el = document.getElementById(`mgr-tab-${t}`);
      if (el) el.style.display = t === tab ? 'block' : 'none';
    });

    if (tab === 'overview') this.loadManagerKPIs();
    if (tab === 'sales') this.loadSalesList();
    if (tab === 'products') this.loadProductsList();
    if (tab === 'stockroom') this.loadStockroomList();
    if (tab === 'floor') this.loadFloorList();
    if (tab === 'staff') this.loadStaffList();
    if (tab === 'transactions') this.loadTransactionsList();
  },

  async loadManagerKPIs() {
    try {
      const res = await fetch('/api/reports/dashboard-kpis', { headers: this.getAuthHeaders() });
      const data = await res.json();
      const k = data.kpis;

      document.getElementById('kpi-sales-value').textContent = `R${k.totalSalesValue.toLocaleString()}`;
      document.getElementById('kpi-sales-count').textContent = `${k.salesCount} Completed Transactions`;
      document.getElementById('kpi-units-sold').textContent = k.totalUnitsSold;
      document.getElementById('kpi-avg-sale').textContent = `R${k.averageSaleValue.toFixed(2)}`;
      document.getElementById('kpi-total-stock').textContent = k.totalStockOnHand;
      document.getElementById('kpi-stock-split').textContent = `Floor: ${k.totalFloorUnits} | Stockroom: ${k.totalStockroomUnits}`;
      document.getElementById('kpi-low-floor').textContent = k.lowFloorCount;
      document.getElementById('kpi-reorder-needed').textContent = k.lowTotalCount;

      // Render 7-Day Revenue Trend Chart
      const trendBars = document.getElementById('revenue-trend-bars');
      if (trendBars && data.dailySalesTrend) {
        const maxRev = Math.max(...data.dailySalesTrend.map(d => d.revenue), 100);
        trendBars.innerHTML = data.dailySalesTrend.map(d => {
          const pct = Math.max(6, Math.round((d.revenue / maxRev) * 100));
          return `
            <div class="chart-col">
              <span class="chart-val">${d.revenue > 0 ? 'R' + Math.round(d.revenue) : ''}</span>
              <div class="chart-bar-fill" style="height: ${pct}%;"></div>
              <span class="chart-label">${d.dayName}</span>
            </div>
          `;
        }).join('');
      }

      // Top products
      const topTbody = document.getElementById('mgr-top-products-tbody');
      topTbody.innerHTML = (data.topProducts || []).map(p => `
        <tr>
          <td><strong>${p.name}</strong><br><span style="font-size:0.75rem; color:var(--text-muted);">${p.brand}</span></td>
          <td>${p.unitsSold}</td>
          <td>R${p.revenue.toLocaleString()}</td>
        </tr>
      `).join('') || `<tr><td colspan="3" style="text-align:center;">No sales recorded yet</td></tr>`;

      // Cashier perf
      const cashTbody = document.getElementById('mgr-cashier-perf-tbody');
      cashTbody.innerHTML = (data.salesByCashier || []).map(c => `
        <tr>
          <td><strong>${c.cashierName}</strong></td>
          <td>${c.salesCount}</td>
          <td>R${c.totalRevenue.toLocaleString()}</td>
        </tr>
      `).join('') || `<tr><td colspan="3" style="text-align:center;">No cashier transactions yet</td></tr>`;
    } catch (err) {
      console.error(err);
    }
  },

  async loadSalesList() {
    const date = document.getElementById('filter-sales-date').value;
    let url = '/api/sales';
    if (date) url += `?startDate=${date}&endDate=${date}`;

    const res = await fetch(url, { headers: this.getAuthHeaders() });
    const sales = await res.json();
    const tbody = document.getElementById('mgr-sales-tbody');

    tbody.innerHTML = sales.map(s => {
      const isLayby = s.payment_type === 'layby';
      return `
        <tr>
          <td><code>${s.sale_id}</code></td>
          <td>${new Date(s.sale_date).toLocaleString()}</td>
          <td>${s.cashier_name}</td>
          <td><span class="badge ${isLayby ? 'badge-amber' : 'badge-emerald'}">${isLayby ? 'LAY-BY' : 'FULL'}</span></td>
          <td>${s.customer_ref || 'Customer'}</td>
          <td>${s.total_units}</td>
          <td>${isLayby ? 'R' + Number(s.deposit_amount).toLocaleString() : '-'}</td>
          <td><strong>R${s.total_amount.toLocaleString()}</strong></td>
        </tr>
      `;
    }).join('') || `<tr><td colspan="8" style="text-align:center;">No sales found.</td></tr>`;
  },

  async loadCategories() {
    const res = await fetch('/api/products/categories', { headers: this.getAuthHeaders() });
    const categories = await res.json();
    this.categoriesCache = categories;

    const filterSelect = document.getElementById('filter-products-category');
    if (filterSelect) {
      filterSelect.innerHTML = `<option value="">All Categories</option>` + 
        categories.map(c => `<option value="${c.category_id}">${c.category_name}</option>`).join('');
    }

    const prodSelect = document.getElementById('prod-cat-select');
    if (prodSelect) {
      prodSelect.innerHTML = categories.map(c => `<option value="${c.category_id}">${c.category_name}</option>`).join('');
    }
  },

  async loadProductsList() {
    const search = document.getElementById('filter-products-search').value;
    const cat = document.getElementById('filter-products-category').value;
    let url = `/api/products?search=${encodeURIComponent(search)}&category=${encodeURIComponent(cat)}`;

    const res = await fetch(url, { headers: this.getAuthHeaders() });
    const products = await res.json();
    this.productsCache = products;
    const tbody = document.getElementById('mgr-products-tbody');

    tbody.innerHTML = products.map(p => `
      <tr>
        <td><code>${p.sku_6_digit}</code></td>
        <td><strong>${p.product_name}</strong><br><span style="font-size:0.75rem; color:var(--text-muted);">${p.brand}</span></td>
        <td>${p.category_name}</td>
        <td>R${Number(p.price).toLocaleString()}</td>
        <td><strong>${p.floor_quantity}</strong></td>
        <td>${p.stockroom_quantity}</td>
        <td>${p.total_quantity}</td>
        <td><span class="badge badge-${p.badgeColor}">${p.statusBadge}</span></td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="app.openReceiveStockForProduct('${p.product_id}')">📥 Receive</button>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="9" style="text-align:center;">No matching products.</td></tr>`;
  },

  async loadStockroomList() {
    const res = await fetch('/api/products', { headers: this.getAuthHeaders() });
    const products = await res.json();
    const tbody = document.getElementById('mgr-stockroom-tbody');

    tbody.innerHTML = products.map(p => `
      <tr>
        <td><code>${p.sku_6_digit}</code></td>
        <td><strong>${p.product_name}</strong> (${p.brand})</td>
        <td><strong style="color:var(--accent); font-size:1.1rem;">${p.stockroom_quantity}</strong></td>
        <td>${p.reorder_threshold}</td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="app.openReceiveStockForProduct('${p.product_id}')">+ Add Stock</button>
        </td>
      </tr>
    `).join('');
  },

  async loadFloorList() {
    const res = await fetch('/api/products', { headers: this.getAuthHeaders() });
    const products = await res.json();
    const tbody = document.getElementById('mgr-floor-tbody');

    tbody.innerHTML = products.map(p => `
      <tr>
        <td><code>${p.sku_6_digit}</code></td>
        <td><strong>${p.product_name}</strong> (${p.brand})</td>
        <td><strong style="font-size:1.1rem;">${p.floor_quantity}</strong></td>
        <td>${p.floor_threshold}</td>
        <td>${p.stockroom_quantity} in stockroom</td>
        <td><span class="badge badge-${p.badgeColor}">${p.statusBadge}</span></td>
      </tr>
    `).join('');
  },

  async loadStaffList() {
    const res = await fetch('/api/users', { headers: this.getAuthHeaders() });
    const staff = await res.json();
    const tbody = document.getElementById('mgr-staff-tbody');

    tbody.innerHTML = staff.filter(s => ['cashier', 'merchandiser'].includes(s.role)).map(s => `
      <tr>
        <td><strong>${s.employee_number}</strong></td>
        <td>${s.full_name}</td>
        <td><span class="badge ${s.role === 'cashier' ? 'badge-sky' : 'badge-purple'}">${s.role.toUpperCase()}</span></td>
        <td>${s.email}</td>
        <td>${s.cell_number || '-'}</td>
        <td><span class="badge ${s.active ? 'badge-emerald' : 'badge-rose'}">${s.active ? 'Active' : 'Inactive'}</span></td>
        <td>
          <div style="display:flex; gap:6px;">
            ${s.active 
              ? `<button class="btn btn-secondary btn-sm" onclick="app.deactivateUser('${s.user_id}', '${s.full_name}')">Deactivate</button>` 
              : `<button class="btn btn-success btn-sm" onclick="app.activateUser('${s.user_id}', '${s.full_name}')">Activate</button>`}
            <button class="btn btn-danger btn-sm" onclick="app.promptDeleteUser('${s.user_id}', '${s.full_name}', '${s.role}')">Delete</button>
          </div>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="7" style="text-align:center;">No branch staff assigned. Click "+ Add Staff".</td></tr>`;
  },

  async loadTransactionsList() {
    const res = await fetch('/api/stock/transactions', { headers: this.getAuthHeaders() });
    const txns = await res.json();
    const tbody = document.getElementById('mgr-transactions-tbody');

    tbody.innerHTML = txns.map(t => {
      let badge = 'badge-sky';
      if (t.transaction_type === 'STOCK_RECEIVED') badge = 'badge-emerald';
      if (t.transaction_type === 'SALE') badge = 'badge-amber';
      if (t.transaction_type === 'FLOOR_REPLENISHMENT') badge = 'badge-purple';

      return `
        <tr>
          <td>${new Date(t.transaction_date).toLocaleString()}</td>
          <td><span class="badge ${badge}">${t.transaction_type}</span></td>
          <td><strong>${t.product_name}</strong></td>
          <td>${t.from_location} &rarr; ${t.to_location}</td>
          <td><strong>${t.quantity}</strong></td>
          <td>${t.user_name}</td>
          <td style="font-size:0.8rem; color:var(--text-muted);">${t.notes || '-'}</td>
        </tr>
      `;
    }).join('') || `<tr><td colspan="7" style="text-align:center;">No stock transactions recorded.</td></tr>`;
  },

  openAddStaffModal() {
    this.openModal('create-staff-modal');
  },

  async handleCreateStaff(e) {
    e.preventDefault();
    const fullName = document.getElementById('staff-name').value.trim();
    const email = document.getElementById('staff-email').value.trim();
    const cellNumber = document.getElementById('staff-cell').value.trim();
    const position = document.getElementById('staff-position').value;

    try {
      const res = await fetch('/api/users/staff', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ fullName, email, cellNumber, position })
      });
      const data = await res.json();
      if (!res.ok) return this.showToast(data.error || 'Failed to create staff', 'error');

      const form = document.getElementById('create-staff-form');
      if (form) form.reset();

      this.closeModal('create-staff-modal');
      this.showToast(`${position.toUpperCase()} created! Employee #: ${data.user.employee_number}`);
      this.loadStaffList();
      this.pollInboxCount();
    } catch (err) {
      this.showToast('Network error creating staff', 'error');
    }
  },

  async openReceiveStockModal() {
    const res = await fetch('/api/products', { headers: this.getAuthHeaders() });
    const prods = await res.json();
    const select = document.getElementById('receive-product-select');
    select.innerHTML = prods.map(p => `
      <option value="${p.product_id}">${p.product_name} (${p.brand}) - SKU: ${p.sku_6_digit} [Stockroom: ${p.stockroom_quantity}]</option>
    `).join('');
    this.openModal('receive-stock-modal');
  },

  openReceiveStockForProduct(productId) {
    this.openReceiveStockModal().then(() => {
      document.getElementById('receive-product-select').value = productId;
    });
  },

  async handleReceiveStock(e) {
    e.preventDefault();
    const productId = document.getElementById('receive-product-select').value;
    const quantity = document.getElementById('receive-qty').value;
    const notes = document.getElementById('receive-notes').value;

    try {
      const res = await fetch('/api/stock/receive', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ productId, quantity, notes })
      });
      const data = await res.json();
      if (!res.ok) return this.showToast(data.error || 'Failed to receive stock', 'error');

      const form = document.getElementById('receive-stock-form');
      if (form) form.reset();

      this.closeModal('receive-stock-modal');
      this.showToast(data.message);
      this.loadManagerKPIs();
      this.loadProductsList();
    } catch (err) {
      this.showToast('Network error receiving stock', 'error');
    }
  },

  openAddProductModal() {
    this.openModal('add-product-modal');
  },

  async handleCreateProduct(e) {
    e.preventDefault();
    const brand = document.getElementById('prod-brand').value.trim();
    const productName = document.getElementById('prod-name').value.trim();
    const categoryId = document.getElementById('prod-cat-select').value;
    const price = document.getElementById('prod-price').value;
    const sku = document.getElementById('prod-sku').value.trim();
    const barcode = document.getElementById('prod-barcode').value.trim();
    const stockroomQuantity = document.getElementById('prod-stockroom-qty').value;
    const floorQuantity = document.getElementById('prod-floor-qty').value;

    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          brand, productName, categoryId, price, sku, barcode,
          stockroomQuantity, floorQuantity
        })
      });
      const data = await res.json();
      if (!res.ok) return this.showToast(data.error || 'Failed to create product', 'error');

      const form = document.getElementById('add-product-form');
      if (form) form.reset();

      this.closeModal('add-product-modal');
      this.showToast(`Product "${productName}" created!`);
      this.loadProductsList();
    } catch (err) {
      this.showToast('Network error creating product', 'error');
    }
  },

  openAddCategoryModal() {
    this.openModal('add-category-modal');
  },

  async handleCreateCategory(e) {
    e.preventDefault();
    const categoryName = document.getElementById('cat-name-input').value.trim();
    const description = document.getElementById('cat-desc-input').value.trim();

    try {
      const res = await fetch('/api/products/categories', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ categoryName, description })
      });
      const data = await res.json();
      if (!res.ok) return this.showToast(data.error || 'Failed to create category', 'error');

      const form = document.getElementById('add-category-form');
      if (form) form.reset();

      this.closeModal('add-category-modal');
      this.showToast(`Category "${categoryName}" added.`);
      await this.loadCategories();
    } catch (err) {
      this.showToast('Network error creating category', 'error');
    }
  },

  // --- CSV DOWNLOAD / EXPORT UTILITIES ---
  downloadCSV(filename, csvContent) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.showToast(`Downloaded ${filename}`);
  },

  async downloadStockOnHandCSV() {
    const res = await fetch('/api/products', { headers: this.getAuthHeaders() });
    const products = await res.json();

    const headers = ['SKU', 'Product Name', 'Brand', 'Category', 'Price (ZAR)', 'Floor Qty', 'Stockroom Qty', 'Total Qty', 'Floor Threshold', 'Status'];
    const rows = products.map(p => [
      `"${p.sku_6_digit}"`,
      `"${p.product_name.replace(/"/g, '""')}"`,
      `"${p.brand}"`,
      `"${p.category_name}"`,
      p.price,
      p.floor_quantity,
      p.stockroom_quantity,
      p.total_quantity,
      p.floor_threshold,
      `"${p.statusBadge}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const dateStr = new Date().toISOString().split('T')[0];
    this.downloadCSV(`Connect_Stock_On_Hand_${dateStr}.csv`, csvContent);
  },

  async downloadTransactionsCSV() {
    const res = await fetch('/api/stock/transactions', { headers: this.getAuthHeaders() });
    const txns = await res.json();

    const headers = ['Date', 'Transaction Type', 'Product', 'From Location', 'To Location', 'Quantity', 'Staff Member', 'Notes'];
    const rows = txns.map(t => [
      `"${new Date(t.transaction_date).toLocaleString()}"`,
      `"${t.transaction_type}"`,
      `"${(t.product_name || '').replace(/"/g, '""')}"`,
      `"${t.from_location}"`,
      `"${t.to_location}"`,
      t.quantity,
      `"${t.user_name || ''}"`,
      `"${(t.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const dateStr = new Date().toISOString().split('T')[0];
    this.downloadCSV(`Connect_Stock_Movements_${dateStr}.csv`, csvContent);
  },

  async downloadSalesCSV() {
    const res = await fetch('/api/sales', { headers: this.getAuthHeaders() });
    const sales = await res.json();

    const headers = ['Sale ID', 'Date', 'Cashier', 'Payment Type', 'Customer', 'Phone', 'Total Units', 'Deposit Amount', 'Total Amount', 'Status'];
    const rows = sales.map(s => [
      `"${s.sale_id}"`,
      `"${new Date(s.sale_date).toLocaleString()}"`,
      `"${s.cashier_name}"`,
      `"${s.payment_type || 'full'}"`,
      `"${(s.customer_ref || '').replace(/"/g, '""')}"`,
      `"${s.customer_phone || ''}"`,
      s.total_units,
      s.deposit_amount || 0,
      s.total_amount,
      `"${s.status || 'COMPLETED'}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const dateStr = new Date().toISOString().split('T')[0];
    this.downloadCSV(`Connect_Cumulative_Sales_${dateStr}.csv`, csvContent);
  },

  // --- CASHIER POS LOGIC WITH LAY-BY ---
  async loadCashierView() {
    await this.renderCashierStockTable();
    this.updateCartUI();
  },

  setPaymentType(type) {
    this.cartPaymentType = type;
    const btnFull = document.getElementById('btn-pay-full');
    const btnLayby = document.getElementById('btn-pay-layby');
    const laybyFields = document.getElementById('layby-fields');
    const regularCust = document.getElementById('regular-customer-group');

    if (type === 'layby') {
      btnFull.className = 'payment-pill';
      btnLayby.className = 'payment-pill active';
      laybyFields.style.display = 'block';
      regularCust.style.display = 'none';
      this.calcLaybyBalance();
    } else {
      btnFull.className = 'payment-pill active';
      btnLayby.className = 'payment-pill';
      laybyFields.style.display = 'none';
      regularCust.style.display = 'block';
    }
  },

  calcLaybyBalance() {
    let totalAmt = 0;
    this.cart.forEach(i => totalAmt += (i.quantity * i.product.price));
    const depositInput = document.getElementById('layby-deposit-amount');
    const deposit = Math.max(0, Number(depositInput ? depositInput.value : 0) || 0);
    const balance = Math.max(0, totalAmt - deposit);
    const balEl = document.getElementById('layby-balance-due');
    if (balEl) balEl.textContent = `R${balance.toLocaleString()}`;
  },

  async renderCashierStockTable(searchTerm = '') {
    let url = '/api/products';
    if (searchTerm) url = `/api/products/search?q=${encodeURIComponent(searchTerm)}`;

    const res = await fetch(url, { headers: this.getAuthHeaders() });
    const products = await res.json();
    this.productsCache = products;
    const tbody = document.getElementById('cashier-stock-tbody');

    tbody.innerHTML = products.map(p => {
      const canSell = p.floor_quantity > 0;
      return `
        <tr>
          <td><code>${p.sku_6_digit}</code></td>
          <td><strong>${p.product_name}</strong><br><span style="font-size:0.75rem; color:var(--text-muted);">${p.brand}</span></td>
          <td><strong>R${Number(p.price).toLocaleString()}</strong></td>
          <td>
            <span class="badge ${canSell ? 'badge-emerald' : 'badge-rose'}">
              ${p.floor_quantity} available
            </span>
          </td>
          <td><code style="font-size:0.75rem;">${p.barcode}</code></td>
          <td>
            <button class="btn btn-primary btn-sm" ${!canSell ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''} onclick="app.addToCart('${p.product_id}')">
              + Add to Cart
            </button>
          </td>
        </tr>
      `;
    }).join('') || `<tr><td colspan="6" style="text-align:center;">No floor stock matching search.</td></tr>`;
  },

  searchCashierProducts() {
    const q = document.getElementById('cashier-search-input').value;
    this.renderCashierStockTable(q);
  },

  scanBarcode() {
    const barcode = document.getElementById('cashier-barcode-input').value.trim();
    if (!barcode) return;

    const match = this.productsCache.find(p => p.barcode === barcode || p.sku_6_digit === barcode);
    if (match) {
      if (match.floor_quantity <= 0) {
        this.showToast(`Out of floor stock for "${match.product_name}"!`, 'error');
      } else {
        this.addToCart(match.product_id);
        this.showToast(`Scanned: ${match.product_name}`);
      }
      document.getElementById('cashier-barcode-input').value = '';
    } else {
      this.showToast(`No product found with barcode/SKU: ${barcode}`, 'warning');
    }
  },

  addToCart(productId) {
    const product = this.productsCache.find(p => p.product_id === productId);
    if (!product) return;

    const existing = this.cart.find(i => i.product.product_id === productId);
    const currentQtyInCart = existing ? existing.quantity : 0;

    if (currentQtyInCart + 1 > product.floor_quantity) {
      return this.showToast(`Cannot add more. Only ${product.floor_quantity} unit(s) on sales floor.`, 'error');
    }

    if (existing) {
      existing.quantity += 1;
    } else {
      this.cart.push({ product, quantity: 1 });
    }
    this.updateCartUI();
    this.calcLaybyBalance();
  },

  changeCartQty(productId, delta) {
    const item = this.cart.find(i => i.product.product_id === productId);
    if (!item) return;

    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      this.cart = this.cart.filter(i => i.product.product_id !== productId);
    } else if (newQty > item.product.floor_quantity) {
      return this.showToast(`Cannot exceed floor stock (${item.product.floor_quantity}).`, 'error');
    } else {
      item.quantity = newQty;
    }
    this.updateCartUI();
    this.calcLaybyBalance();
  },

  updateCartUI() {
    const container = document.getElementById('cart-items-container');
    const emptyMsg = document.getElementById('cart-empty-msg');
    const summary = document.getElementById('cart-summary');

    if (this.cart.length === 0) {
      emptyMsg.style.display = 'block';
      container.style.display = 'none';
      summary.style.display = 'none';
      return;
    }

    emptyMsg.style.display = 'none';
    container.style.display = 'block';
    summary.style.display = 'block';

    let totalQty = 0;
    let totalAmt = 0;

    container.innerHTML = this.cart.map(i => {
      const subtotal = i.quantity * i.product.price;
      totalQty += i.quantity;
      totalAmt += subtotal;

      return `
        <div style="background:var(--bg-primary); border:1px solid var(--border); border-radius:8px; padding:10px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-weight:600; font-size:0.9rem;">${i.product.product_name}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">R${Number(i.product.price).toLocaleString()} &times; ${i.quantity} = <strong>R${subtotal.toLocaleString()}</strong></div>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <button class="btn btn-secondary btn-sm" style="padding:2px 8px;" onclick="app.changeCartQty('${i.product.product_id}', -1)">-</button>
            <span style="font-weight:bold; min-width:20px; text-align:center;">${i.quantity}</span>
            <button class="btn btn-secondary btn-sm" style="padding:2px 8px;" onclick="app.changeCartQty('${i.product.product_id}', 1)">+</button>
          </div>
        </div>
      `;
    }).join('');

    document.getElementById('cart-total-qty').textContent = totalQty;
    document.getElementById('cart-total-amount').textContent = `R${totalAmt.toLocaleString()}`;
  },

  clearCart() {
    this.cart = [];
    this.updateCartUI();
  },

  async completeCashierSale() {
    if (this.cart.length === 0) return;

    let totalAmt = 0;
    this.cart.forEach(i => totalAmt += (i.quantity * i.product.price));

    const items = this.cart.map(i => ({
      productId: i.product.product_id,
      quantity: i.quantity
    }));

    const payload = {
      items,
      paymentType: this.cartPaymentType
    };

    if (this.cartPaymentType === 'layby') {
      const custName = document.getElementById('layby-customer-name').value.trim();
      const custPhone = document.getElementById('layby-customer-phone').value.trim();
      const depositAmt = Number(document.getElementById('layby-deposit-amount').value) || 0;

      if (!custName || !custPhone) {
        return this.showToast('Customer Name and Contact Number are required for Lay-by', 'error');
      }
      if (depositAmt <= 0) {
        return this.showToast('Please enter a valid deposit amount', 'error');
      }
      if (depositAmt > totalAmt) {
        return this.showToast('Deposit amount cannot exceed total sale amount', 'error');
      }

      payload.customerName = custName;
      payload.customerPhone = custPhone;
      payload.depositAmount = depositAmt;
    } else {
      payload.customerRef = document.getElementById('cart-customer-ref').value.trim() || 'Walk-in Customer';
    }

    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) return this.showToast(data.error || 'Sale failed', 'error');

      if (this.cartPaymentType === 'layby') {
        this.showToast(`Lay-by created! Deposit Paid: R${data.sale.deposit_amount.toLocaleString()}, Balance: R${data.sale.balance_due.toLocaleString()}`);
        document.getElementById('layby-customer-name').value = '';
        document.getElementById('layby-customer-phone').value = '';
        document.getElementById('layby-deposit-amount').value = '';
      } else {
        this.showToast(`Sale recorded successfully! Total: R${data.sale.total_amount.toLocaleString()}`);
        document.getElementById('cart-customer-ref').value = '';
      }

      this.clearCart();
      await this.renderCashierStockTable();
    } catch (err) {
      this.showToast('Network error processing transaction', 'error');
    }
  },

  // --- MERCHANDISER LOGIC ---
  async loadMerchandiserView() {
    const res = await fetch('/api/products', { headers: this.getAuthHeaders() });
    const products = await res.json();
    const tbody = document.getElementById('merchandiser-stock-tbody');

    tbody.innerHTML = products.map(p => `
      <tr>
        <td><code>${p.sku_6_digit}</code></td>
        <td><strong>${p.product_name}</strong> (${p.brand})</td>
        <td>${p.category_name}</td>
        <td><strong style="font-size:1.1rem;">${p.floor_quantity}</strong> (Min: ${p.floor_threshold})</td>
        <td><strong style="color:var(--accent); font-size:1.1rem;">${p.stockroom_quantity}</strong></td>
        <td><span class="badge badge-${p.badgeColor}">${p.statusBadge}</span></td>
        <td>
          <div style="display:flex; gap:6px; align-items:center;">
            <input type="number" id="trans-qty-${p.product_id}" class="form-control" style="width:70px; padding:4px;" min="1" max="${p.stockroom_quantity}" value="5" ${p.stockroom_quantity <= 0 ? 'disabled' : ''}>
            <button class="btn btn-success btn-sm" ${p.stockroom_quantity <= 0 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''} onclick="app.replenishFloor('${p.product_id}')">
              Move to Floor
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  },

  async replenishFloor(productId) {
    const qtyInput = document.getElementById(`trans-qty-${productId}`);
    const qty = parseInt(qtyInput.value, 10);
    if (isNaN(qty) || qty <= 0) return this.showToast('Please enter a positive transfer quantity', 'error');

    try {
      const res = await fetch('/api/stock/replenish-floor', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ productId, quantity: qty })
      });
      const data = await res.json();
      if (!res.ok) return this.showToast(data.error || 'Transfer failed', 'error');

      this.showToast(data.message);
      this.loadMerchandiserView();
    } catch (err) {
      this.showToast('Network error transferring stock', 'error');
    }
  },

  // --- PRIVATE ROLE-BASED INBOX ---
  async pollInboxCount() {
    if (!this.token || !this.currentUser) return;
    try {
      const res = await fetch('/api/auth/inbox', { headers: this.getAuthHeaders() });
      if (!res.ok) return;
      const messages = await res.json();
      const unread = messages.filter(m => !m.read).length;
      const countEl = document.getElementById('inbox-count');
      if (countEl) countEl.textContent = unread || messages.length;
    } catch (_) {}
  },

  async openInboxModal() {
    if (!this.token) return;
    try {
      const res = await fetch('/api/auth/inbox', { headers: this.getAuthHeaders() });
      const messages = await res.json();
      const list = document.getElementById('inbox-messages-list');

      list.innerHTML = messages.map(m => `
        <div style="background:var(--bg-primary); border:1px solid ${m.read ? 'var(--border)' : 'var(--accent)'}; border-radius:8px; padding:12px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <strong style="color:var(--accent); font-size:0.9rem;">${m.subject}</strong>
            <span style="font-size:0.75rem; color:var(--text-muted);">${new Date(m.created_at).toLocaleTimeString()}</span>
          </div>
          <div style="font-size:0.85rem; margin-bottom:8px; color:var(--text-main); white-space:pre-wrap;">${m.text}</div>
          ${!m.read ? `<button class="btn btn-secondary btn-sm" onclick="app.markMessageRead('${m.id}')">Mark as Read</button>` : '<span style="font-size:0.75rem; color:var(--text-muted);">✓ Read</span>'}
        </div>
      `).join('') || `<p style="text-align:center; color:var(--text-muted); padding:2rem 0;">Your inbox is empty.</p>`;

      this.openModal('inbox-modal');
    } catch (err) {
      this.showToast('Failed to load inbox messages', 'error');
    }
  },

  async markMessageRead(msgId) {
    try {
      await fetch(`/api/auth/inbox/${msgId}/read`, {
        method: 'POST',
        headers: this.getAuthHeaders()
      });
      await this.openInboxModal();
      this.pollInboxCount();
    } catch (_) {}
  }
};

document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
