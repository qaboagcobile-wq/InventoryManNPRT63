# NPRT63 - CONNECT Retail Inventory & Sales Management System

[![Code License](https://img.shields.io/badge/Code%20License-GPLv2-blue.svg)](https://www.gnu.org/licenses/old-licenses/gpl-2.0.en.html)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Follow%20%40iammelvink-blue.svg?style=social&logo=linkedin)](https://www.linkedin.com/in/iammelvink)

# NPRT63 - CONNECT Retail Inventory & Sales Management System

### 🌐 Live Deployed App: [CONNECT](https://connect-516x.onrender.com)

## Overview

**Connect** is a reusable, full-stack retail management web application designed according to the **Connect System Design Specification (Version 3.2)**.


The system connects stockroom inventory, sales floor replenishment, cashier point-of-sale transactions, and branch operational management into a single, cohesive dark-mode platform.

### Methodologies & Practices:
- **Architecture**: Database-free client-server full-stack application (atomic JSON file storage with write locking).
- **Design**: Dark-mode-first, fully responsive (desktop, tablet, mobile).
- **Security**: Strict Role-Based Access Control (RBAC), branch data isolation, bcrypt password hashing, forced temporary password change on first login, and audit logging.
- **Runtimes & Frameworks**: Node.js, Express, JavaScript, HTML5, CSS3.

### Test Cases

| ID | Test Scenario | Role | Steps | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| **TC-01** | **Landing Page Role Selector** | Unauthenticated | 1. Open `https://connect-516x.onrender.com/`<br>2. Observe landing page | Shows neutral **CONNECT** branding (no store name). Five role cards displayed (Admin, Super Mgr, Branch Mgr, Cashier, Merchandiser). No public sign-up. |
| **TC-02** | **Role Card Click & Clean Input** | Unauthenticated | 1. Click the **Cashier POS** role card | Sign-in modal opens with title *"Cashier POS Sign In"*, label *"Employee Number"*, clean placeholder (no example hints). |
| **TC-03** | **Admin Login & Store Name Reveal** | Admin | 1. Sign in with `any admin out the 4existsing`<br>2. Change password if prompted | Logs in to Admin console. Header displays *"Platform Management"*. Top quick-test banner is gone. |
| **TC-04** | **Admin Creates New Retail Chain** | Admin | 1. Click **+ Add Store**<br>2. Enter Name `Apex Supermarket`, Currency `ZAR`<br>3. Click **Create Store** | Store created. Appears in Stores & Branches table. Creation form resets to blank. |
| **TC-05** | **Admin Assigns Branch to Store** | Admin | 1. Click **+ Add Branch**<br>2. Select `Apex Supermarket`<br>3. Enter `BR-002`, `Cape Town Waterfront` | Branch created under Apex Supermarket. Form resets. |
| **TC-06** | **Admin Creates Super Manager** | Admin | 1. Click **+ Create Super Manager**<br>2. Fill Name & Email<br>3. Click the button | Button text reads **`Create`**. Super Manager generated with `SM101`. Form resets. |
| **TC-07** | **Private Role-Based Inbox** | Operational Staff | 1. Log in as Super Manager (`SM101`)<br>2. Click **📬 Inbox** in top nav | Only shows messages and credentials addressed to this user. Other users' credentials cannot be seen. |
| **TC-08** | **Super Manager Creates Branch Manager** | Super Manager | 1. Click **+ Add Branch Manager**<br>2. Fill details and select branch | Branch Manager created with ID (e.g. `MGR101`). Form resets. Credentials delivered to their private inbox. |
| **TC-09** | **Branch Manager Store Name Badge** | Branch Manager | 1. Log in as `MGR101` assigned to *Particles Electronics* | Header subtitle and badge dynamically update to display **`Particles Electronics`**. |
| **TC-10** | **Account Lifecycle: Deactivate & Activate** | Super Manager / Manager | 1. In Staff/Managers table, click **Deactivate** on an account<br>2. Click **Activate** | Status toggles between Inactive and Active. Login is prevented while deactivated. |
| **TC-11** | **Account Lifecycle: Delete with Mandatory Reason** | Admin / Super Mgr / Manager | 1. Click **Delete** on a managed account<br>2. Leave reason empty & submit<br>3. Enter reason *"Transferred to another branch"* & submit | Empty reason blocked with error. Submitting with reason permanently deletes account and logs the text reason to audit records. |
| **TC-12** | **Manager 7-Day Revenue Trend Chart** | Branch Manager | 1. Go to Manager **Overview** tab | Interactive 7-day revenue trend bar chart renders with daily totals and day labels. |
| **TC-13** | **Export Stock on Hand to CSV** | Branch Manager | 1. Go to **Products** tab<br>2. Click **📥 Export Stock on Hand (CSV)** | Browser immediately downloads `Connect_Stock_On_Hand_YYYY-MM-DD.csv` with complete stock breakdown. |
| **TC-14** | **Export Stock Movements to CSV** | Branch Manager | 1. Go to **Stock Movements** tab<br>2. Click **📥 Export Movements (CSV)** | Browser downloads `Connect_Stock_Movements_YYYY-MM-DD.csv` containing auditable receipts, transfers, and sales. |
| **TC-15** | **Export Cumulative Sales to CSV** | Branch Manager | 1. Go to **Sales & Cumulatives** tab<br>2. Click **📥 Download Cumulative Sales (CSV)** | Browser downloads `Connect_Cumulative_Sales_YYYY-MM-DD.csv` with sales, customer references, and payment types. |
| **TC-16** | **Cashier POS Full Sale** | Cashier | 1. Log in as Cashier (`CSH101`)<br>2. Search SKU `100001` or scan barcode<br>3. Add to cart & complete sale | Stock deducted atomically from floor quantity. Sale logged as `Full Payment`. |
| **TC-17** | **Cashier POS Lay-by Deposit** | Cashier | 1. Add item (e.g. R3,499) to cart<br>2. Toggle payment pill to **Lay-by (Deposit)**<br>3. Enter Customer Name, Phone, and Deposit `R1,000` | System calculates Remaining Balance `R2,499`. Floor stock reserved. Transaction recorded with `Status: LAYBY_ACTIVE`. |
| **TC-18** | **Negative Stock Prevention (FR-42)** | Cashier | 1. Attempt to add or sell more units than are physically available on floor | Sale is blocked. Warning displayed: *"Insufficient floor stock"*. |
| **TC-19** | **Over-transfer Prevention (FR-33)** | Merchandiser | 1. Log in as Merchandiser (`MCH101`)<br>2. Attempt to transfer 9,999 units to floor | Transfer blocked: *"Cannot transfer. Only X available in stockroom."* Stock remains consistent. |

---

## System Roles & Hierarchy

1. **Admin** (Email login): Platform configuration, creates stores & branches, provisions the Super Manager account. Admin accounts cannot be deleted.
2. **Super Manager** (Employee # login): Platform-wide Manager-tier authority. Creates and deactivates Branch Managers.
3. **Branch Manager** (Employee # login): Manages assigned branch operations, products, stockroom receiving, floor inventory, staff (Cashiers & Merchandisers), and views KPI dashboards.
4. **Cashier** (Employee # login): Searches floor stock by 6-digit SKU or product name, scans barcodes, validates floor stock, and executes instant sales.
5. **Merchandiser** (Employee # login): Replenishes floor stock from stockroom with strict validation to prevent stock discrepancies.

---

## Getting Started

### 1. Installation

Ensure Node.js (v18+) is installed. Clone the repository and install dependencies:

```sh
git clone https://github.com/qaboagcobile-wq/InventoryManNPRT63.git
cd InventoryManNPRT63
npm install
```

### 2. Seeding the Data

To initialize or reset the seed data (4 Admins, 10 Categories, 30 Products with 100 stockroom / 50 floor split):

```sh
npm run seed
```

### 3. Launching the Application

Start the Connect server:

```sh
npm start
```

Access the application in your browser at `http://localhost:3000`.

### 4. Running Automated Tests

Run the comprehensive integration test suite verifying all specification requirements:

```sh
node tests/verify_connect.js
```

---



*(A built-in Dev Notifications drawer in the top navigation allows inspecting all generated credentials and temporary passwords dispatched by the system).*

---

## Author(s) & Acknowledgments

- **Agcobile Qabo** & Group Members
- Lecturer: [Melvin Kisten](https://www.linkedin.com/in/iammelvink)
