# NPRT63 - CONNECT Retail Inventory & Sales Management System

[![Code License](https://img.shields.io/badge/Code%20License-GPLv2-blue.svg)](https://www.gnu.org/licenses/old-licenses/gpl-2.0.en.html)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Follow%20%40iammelvink-blue.svg?style=social&logo=linkedin)](https://www.linkedin.com/in/iammelvink)

## Overview

**Connect** is a reusable, full-stack retail management web application designed according to the **Connect System Design Specification (Version 3.2)**. The initial store configuration is **Particles Electronics**, but the platform is retailer-agnostic.

The system connects stockroom inventory, sales floor replenishment, cashier point-of-sale transactions, and branch operational management into a single, cohesive dark-mode platform.

### Methodologies & Practices:
- **Architecture**: Database-free client-server full-stack application (atomic JSON file storage with write locking).
- **Design**: Dark-mode-first, fully responsive (desktop, tablet, mobile).
- **Security**: Strict Role-Based Access Control (RBAC), branch data isolation, bcrypt password hashing, forced temporary password change on first login, and audit logging.
- **Runtimes & Frameworks**: Node.js, Express, JavaScript, HTML5, CSS3.

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
