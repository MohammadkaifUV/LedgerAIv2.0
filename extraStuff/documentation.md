# 📖 Step-by-Step Build Guide: LedgerAI

This document serves as a sequential, step-by-step build guide detailing how **LedgerAI** was constructed.

---

## 🔐 Phase 1: Authentication & User Management

To initialize the project, we need a secure, JWT-based Authentication system. Below describes the construction step-by-step.

### 📜 1. Prerequisites (Environment & Connection)

Our Authentication modules depend on **Database Connectivity** and **Token Signing Keys**.

#### **A. Environment Variables setup (`.env`)**

Define secrets for hashing and signing. Place this in your backend root module.

```env
# Database Credentials
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_secure_password
DB_NAME=ledger_db

# Security
JWT_SECRET=your_super_secret_key
```

#### **B. Database Connection Pool (`backend/config/db.js`)**

We initialize the database connection utilizing the official @supabase/supabase-js client (or the 'pg' node-postgres library) to interact with our PostgreSQL database.

> [!IMPORTANT]
> A critical lock statement `timezone: '+05:30'` prevents visual time/date jumps on transactions.

```javascript
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // Lock connection to IST (+05:30) to prevent Midnight date-drift
    timezone: '+05:30', 
    dateStrings: true   
});

module.exports = pool;
```

---

### 🗄️ 2. Database Schema (Auth & Modules)

Before writing business logic queries, the tables themselves must exist. Execute these creation updates in order.

```sql
# 1. Users Profile
CREATE TABLE users (  
    user_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    status ENUM('ACTIVE','INACTIVE','SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL
);

# 2. Template Modules (For linking professions)
CREATE TABLE coa_modules (
    module_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    module_name VARCHAR(100) NOT NULL UNIQUE, 
    is_core BOOLEAN NOT NULL DEFAULT FALSE,
    module_category ENUM('CORE', 'INDIVIDUAL', 'BUSINESS') NOT NULL DEFAULT 'INDIVIDUAL',
    description VARCHAR(255)
);

# 3. User selected Module mapping
CREATE TABLE user_modules (
    user_id BIGINT NOT NULL,
    module_id BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, module_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (module_id) REFERENCES coa_modules(module_id) ON DELETE CASCADE
);
```

---

### 🛡️ 3. Verification Middleware (`backend/auth/authMiddleware.js`)

We protect routes with a Middleware validator checking incoming tokens prior to controllers being called.

* **Logic**: Grab `Authorization: Bearer <token>`, Verify signing secret, query database to confirm status equals `ACTIVE`.
* **Feature**: Appends standard payload `req.user = decoded` to trigger controllers downstream accurately.

```javascript
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

exports.verifyToken = async (req, res, next) => {
    const authHeader = req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Access denied. No valid token provided." });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Verify User Status In DB
        const [rows] = await pool.execute(
            'SELECT status FROM users WHERE user_id = ?',
            [decoded.userId]
        );

        if (rows.length === 0) return res.status(401).json({ error: "User no longer exists." });
        if (rows[0].status !== 'ACTIVE') return res.status(403).json({ error: "Account is suspended." });

        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ error: "Invalid or expired token." });
    }
};
```

---

### 🧠 4. Authentication Logic (`backend/auth/authController.js`)

This houses endpoint execution rules for registration, log-ins, and picking profession setups.

#### **A. Register User (`/register`)**

* **Procedure**: Performs async `bcrypt.hash` on password inputs, commits fully inside connection transaction scope so users are safe from half-built state updates if insertion fails. Returns generated JWT token string automatically.

#### **B. Login User (`/login`)**

* **Procedure**: Checks `users` status column explicitly during decryption match validations. Automatically yields quick setup variables like `has_module` avoiding redundant downstream component loads.

---

### 🛣️ 5. Plugging Router Endpoint setups (`backend/auth/authRoutes.js`)

Bundle operations linking endpoint definitions for safe mounting setups over Express setup layers downstream.

```javascript
const express = require('express');
const router = express.Router();
const authController = require('./authController');
const { verifyToken } = require('./authMiddleware');

router.post('/register', authController.registerUser);
router.post('/login', authController.loginUser);
router.get('/modules', authController.getModules);
router.post('/select-module', verifyToken, authController.selectModule);

module.exports = router;
```

---

### 💻 6. Frontend Interceptor Glue (`frontend/src/utils/api.js`)

Connect authentication headers globally enabling protected screens natively.

We use Axios middleware to pull stored triggers automatically upon loads avoiding redundancy.

```javascript
import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
    headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers['Authorization'] = `Bearer ${token}`;
    return config;
});

export default api;
```

---

## 🤝 Phase 2: User Onboarding & Chart of Accounts Setup

Once a user logs in for the first time, they are routed through an initialization tree designed to populate their Chart of Accounts (COA) efficiently based on their profession or structure type.

### 🏠 1. The Welcome Workspace (`frontend/src/pages/Welcome.jsx`)

* **Purpose**: Gathers the user’s industry/business categorization (Individual, Business, etc.) templates prior to dashboards booting up.
* **Logical Steps**:
  1. Fetches registered setup options endpoint `/auth/modules`.
  2. Prompts split branch triggers: e.g., Choosing **Business** filters industry modules correctly.
  3. `handleContinue()` triggers backend update API `/auth/select-module` to save binding mappings, then forwards to `/app/setup-accounts`.

---

### 🗄️ 2. Database Schema Dependencies (COA & Identifiers)

Before cloning templates or inserting banking pointers, these foundational staging buckets need setup structure.

```sql
# 4. Chart of Accounts Templates (Loaded by Admins)
CREATE TABLE coa_templates ( 
    template_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    module_id BIGINT NOT NULL,
    account_name VARCHAR(150) NOT NULL,
    account_type ENUM('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE') NOT NULL,
    balance_nature ENUM('DEBIT','CREDIT') NOT NULL,
    is_system_generated BOOLEAN NOT NULL DEFAULT TRUE,
    parent_template_id BIGINT DEFAULT NULL, 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (module_id) REFERENCES coa_modules(module_id) ON DELETE CASCADE,
    FOREIGN KEY (parent_template_id) REFERENCES coa_templates(template_id) ON DELETE SET NULL
);

# 5. Live Accounts bucket (Linked to active users)
CREATE TABLE accounts (   
    account_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    account_name VARCHAR(150) NOT NULL,
    account_type ENUM('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE') NOT NULL,
    balance_nature ENUM('DEBIT','CREDIT') NOT NULL,
    is_system_generated BOOLEAN NOT NULL DEFAULT FALSE, 
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    parent_account_id BIGINT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    template_id BIGINT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (parent_account_id) REFERENCES accounts(account_id) ON DELETE SET NULL,
    FOREIGN KEY (template_id) REFERENCES coa_templates(template_id) ON DELETE SET NULL
);

# 6. Physical Identifiers (Banks / Cards pointing back to Live Accounts)
CREATE TABLE account_identifiers (
    identifier_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    account_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    institution_name VARCHAR(150),
    account_number_last4 VARCHAR(4),
    ifsc_code VARCHAR(20),
    is_primary BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
```

---

### 🧠 3. Onboarding Backend Control (`backend/accounts/accountsController.js` -> `setupOnboarding`)

This single controller executes cloning logic within single-statement safe MySQL wrapper transactions to insulate safe boots.

* **Phase A: Resolve Template Clones**:

  - Pulls user binds `module_id`.
  - Executes the "Zero-Balance Bucket" rule: Iterates through all active templates in coa_templates matching the target module and creates corresponding rows in the user's accounts table, even if the initial balance is ₹0.
  - Critical: Strictly maps the template_id from the master template to the newly created user account to ensure Vector Cache lookups succeed downstream.
  - Queries `coa_templates` matching target indexes.
  - Loops dynamic creation insertions mapping templates into live `user_id` records in `accounts`. Reconnects `parent_account_id` links flawlessly using mapped reference index tracker arrays caching parents downstream.
* **Phase B: Merge Frontend Manual Forms Inputs**:

  - Iterates users manual rows input triggers (Bank details headers).
  - Finds spawned Live Account roots parent mappings matching triggers (e.g., binds Chase node row parent triggers back to parent branch Node setup prior on map references).
  - Inserts identity row referencing standard ID pointers successfully.

---

### 💻 4. Accounts Onboarding Interface (`frontend/src/pages/SetupAccounts.jsx`)

* **Form states logic**:
  - Renders mapped setup rows layout supporting institutions names triggers capturing last updates.
  - Submits packaged array structure trigger fully wrapping final endpoint bundles `/accounts/setup-onboarding`.
  - Failsafe handlers force navigate strictly towards `/app/dashboard` upon commit resolutions accurately.

---

## 📜 Phase 3: Statement Uploads & Simulation Parser

After creating accounts, users can upload transaction statements to feed datasets downstream into categorization processing pipelines.

### 💻 1. The Upload Endpoint Interface (`frontend/src/pages/Upload.jsx`)

* **Purpose**: Provides a unified drag-and-drop bucket utilizing non-blocking reading loops before transmitting payloads.
* **Logical Steps**:
  1. **Read Native buffer streams**: Prompts native `FileReader` events parsing raw `.json` file strings securely without overrunning browsers memory limits.
  2. **Structural Integrity Mapping**: Analyzes objects layouts extracting optional layout descriptors identifiers root binds (e.g., `account_id`) if bundled.
  3. **Transmission Setup**: Packages final structures transmitting bulk objects trigger directly towards global `/parser/upload-json` handlers.

---

### 🗄️ 2. Database Schema Dependencies (Transitional Staging Tables)

To populate statement trails audits correctly without corrupting ledger weights, data traverses transition tables.

```sql
# 7. Audit Logging Roots
CREATE TABLE documents (
    document_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    status ENUM('UPLOADED', 'PROCESSED', 'FAILED') NOT NULL DEFAULT 'UPLOADED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

# 8. Raw JSON Static Staging Backup
CREATE TABLE ai_transactions_staging (
    staging_transaction_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    document_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    transaction_json JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES documents(document_id) ON DELETE CASCADE
);

# 9. Batch Computation Buffer stage (For AI loops downstream)
CREATE TABLE uncategorized_transactions (   
    uncategorized_transaction_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    account_id BIGINT NULL,
    document_id BIGINT NOT NULL,
    staging_transaction_id BIGINT NOT NULL,
    txn_date DATE NOT NULL, 
    debit DECIMAL(18,2),
    credit DECIMAL(18,2),
    balance DECIMAL(18,2),
    details VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(document_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (staging_transaction_id) REFERENCES ai_transactions_staging(staging_transaction_id) ON DELETE CASCADE
);
```

---

### 🧠 3. Simulated JSON Parsing Backend (`backend/parser/parserController.js` -> `uploadSimulatedJSON`)

This controller executes transactional triggers supporting safely insulated statement batch splits.

* **Step A: Document & Staging Record Insertion**
  Inserts root audit strings tracking records (`documents` table) that accurately set file origins and sets staging backups (`ai_transactions_staging`) using safely wrapped `JSON.stringify()` variables before loopings.
* **Step B: Account Matching Evaluation**
  - *Logic Prioritizer*: Iterates over provided `identifiers` parameters executing query-isolated OR queries looking strictly for user-isolated indices match rates.
  - *Fallback Verification*: Matches provided absolute indices fallback validity bounds accurately safeguarding user pointers ownership indexes smoothly.
* **Step C: Bulk Staging Pushes**
  Packages remaining parsed statement arrays iteratively utilizing bulk formatted `VALUES (?, ?, ?, ...)` payloads directly pushed towards final `uncategorized_transactions` staging layers accurately in a single locked wrappers structure safely.

---

## 🧠 Phase 4: Hybrid Categorization Pipeline (`backend/categorizer`)

The categorization engine operates on a prioritized **Multi-Stage Waterfall Routing Mechanism**. If a transaction isn't resolved deterministically by early rules, it cascades down into cheaper historical match tables, expensive vector similarity lookups, and finally full LLM processing backbones.

### 🗄️ 1. Database Schema Dependencies (Categorized Outputs)

Before running pipelines workflows triggers solvers stages down streams forwards insulated transaction setups bundles accurately setups.

```sql
# 10. Live Categorized output buffer triggers
CREATE TABLE transactions (  
    transaction_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    base_account_id BIGINT NOT NULL,   
    offset_account_id BIGINT NULL,   
    document_id BIGINT NOT NULL,
    transaction_date DATE NOT NULL,
    details VARCHAR(500),
    clean_merchant_name VARCHAR(255) NULL, 
    amount DECIMAL(18,2) NOT NULL,
    transaction_type ENUM('DEBIT','CREDIT') NOT NULL, 
    categorised_by ENUM('USER_MANUAL','GLOBAL_RULE','TRAPDOOR_FILTER','PERSONAL_EXACT','PERSONAL_VECTOR','GLOBAL_VECTOR','LLM_PREDICTION') NOT NULL,
    is_contra BOOLEAN NOT NULL DEFAULT FALSE,
    confidence_score DECIMAL(5,2) NOT NULL,
    vector_distance DECIMAL(8,6) NULL,
    review_status ENUM('PENDING','APPROVED','MODIFIED') NOT NULL DEFAULT 'PENDING',
    uncategorized_transaction_id BIGINT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
```

---

### 🛡️ 2. The Multi-Stage Waterfall Cascade (`categorizeBulk`)

The categorization engine operates on a strict, prioritized Order of Operations to minimize LLM token usage and prevent vector math failures.

#### **Stage 0: The Contra Radar (Asset-to-Asset Intercept)**

* **Logic:** Before any categorization happens, the system checks for a mirror-image transaction (same amount, opposite debit/credit, same +/- 1 day window, different base account).
* **Resolution:** If found, it updates Side A's offset to Side B's base account, tags it `is_contra = TRUE`, and **discards** the duplicate Side B transaction to prevent double-counting.

#### **Stage 1: Rules Engine (Deterministic Fast-Path)**

* Runs **`rulesEngine.evaluateTransaction(rawDetails)`** using the **RAW, un-sanitized string**. (Sanitization destroys prefixes like `UPI-` or `ACHD-`).
* **FAST_PATH**: Maps absolute strings directly to Template IDs (`GLOBAL_RULE`).
* **EXACT_THEN_DUMP**: Intercepts Garbage VPA pointers and routes to Uncategorized (`TRAPDOOR_FILTER`).
* **VECTOR_SEARCH**: Extracts clean strings via Regex and skips NER, passing directly to Stage 3.
* **Critical Postgres Note**: Evaluate is_active using strict boolean logic (if (rule.is_active)), as PostgreSQL natively supports BOOLEAN types, unlike MySQL's TINYINT.

#### **Stage 2: Python NER Fallback (`spacyClient.js`)**

* **Condition:** ONLY runs if Stage 1 returns `hasRuleMatch: false`.
* **Logic:** Sanitizes the string (strips special characters) and passes it to the local Python spaCy model to guess the merchant entity name.

#### **Stage 3: Vector Similarity Match (`findVectorMatch`)**

- **The Uppercase Mandate:** Takes the clean string (from Stage 1 or Stage 2), strictly converts it to **UPPERCASE** (to match the seeded dataset casing), and generates a 384d embedding.

* **Matching:** Queries `global_vector_cache` using Cosine Distance with a strict threshold (e.g., `0.25`).
* **Account Linkage:** Maps the resulting `target_template_id` to the user's specific generated account in the `accounts` table.

#### **Stage 4: LLM Batch Fallback (`llmBatchFallback.js`)**

* If stages 0-3 fail, remaining rows fuse into a single Gemini/OpenRouter batch array.
* **Safety Step:** Validates LLM responses before blindly inserting them into the ledger.

---

## 📖 Phase 5: Accounting & AI Self-Learning (`backend/accounting`)

Once transactions are categorized (whether by pipeline waterfall buffers OR manually provided), they require **approval** before posting final balances ledger nodes. During this posting, the system leverages continuous self-learning to improve downstream loops iteratively.

### 🗄️ 1. Database Schema Dependencies (Double Entry Ledgers & Cache overrides)

Transactions approvals translate raw rows into Double-Entry accounting structures natively.

```sql
# 11. Ledger Entry Balances
CREATE TABLE ledger_entries (   
    ledger_entry_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    transaction_id BIGINT NOT NULL,
    account_id BIGINT NOT NULL,
    debit_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    credit_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    entry_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES accounts(account_id)
);

# 12. Garbage Exact caching index setup overrides
CREATE TABLE personal_exact_cache (
    user_id BIGINT NOT NULL,
    raw_vpa VARCHAR(255) NOT NULL,
    account_id BIGINT NOT NULL,
    hit_count INT DEFAULT 1,
    PRIMARY KEY (user_id, raw_vpa)
);

# 13. Dynamic Vectors Memory triggers
CREATE TABLE personal_vector_cache (
    cache_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    clean_name VARCHAR(255) NOT NULL,
    account_id BIGINT NOT NULL,
    embedding VECTOR(384) NOT NULL,
    hit_count INT DEFAULT 1
);
```

---

### 🧠 2. Continuous AI Self-Learning Rules (`ledgerPostingService.js` -> `processTransactionApproval`)

The posting logic handles Double Entry triggers AND populates Continuous feedback cache overrides.

* **Step A: Double Entry Postings offsets execution**:
  Inserts corresponding DEBIT/CREDIT offsets accurately.

  - *If Debit*: DEBITs target Offset Category, CREDITs standard Base Assets accounts.
  - *If Credit*: DEBITs standard Base Asset account, CREDITs target Offset Category setups.
* **Step B: Continuous AI Learning continuous feedback cache override triggers**:

  - *Algorithm Garbage (VPA/QR codes)*: If details match Paytm/VPA variables pointers regex limits thresholds nodes solvers layouts. Inserts / updates `personal_exact_cache` backwards indexing accurate fallback resolvers natively workflows.
  - *Clean Merchant Identifier setups (Stage 2 Vector overrides)*: If details extracted containing `clean_merchant_name`, utilizes native math embeddings `generateEmbedding()` updating `personal_vector_cache` forwards layouts accurately supporting high accuracy over continuous user approving loops workflows seamlessly.

---

## 📈 Phase 6: P&L & Analytics Reporting (`backend/reports`)

Once transactions navigate continuous approval loops waterfalls backwards into Double Edge ledgers structure, the reporting layer fetches aggregates driving analytical dashboards visual renders.

### 📊 1. Profit & Loss Summaries (`reportsController.js` -> `getPnlSummary`)

Aggregates Approved classifications balancing nodes separated into Income categories vs Expenses iteratively over specific temporal boundaries rulesets triggers.

* **Endpoint Address**: `GET /api/reports/`
* **Logical Operations Parameters**:
  1. **Date Filtering triggers ranges limits bounds sets**: Reads query parameter `?dateRange=this_month` applying isolated `MONTH()` / `YEAR()` bounding limits wrappers securely backwards down streams.
  2. **Aggregation Inner Join executions nodes downwards**:
     ```sql
     SELECT 
         c.account_name AS name,
         c.account_type AS type,
         SUM(t.amount) AS total
     FROM transactions t
     JOIN accounts c ON t.offset_account_id = c.account_id
     WHERE t.user_id = ? AND t.review_status = 'APPROVED'
     GROUP BY c.account_id, c.account_name, c.account_type
     ORDER BY c.account_type ASC, total DESC
     ```
  3. **Result Filtering client streams forwards managers**: Splices returning structures arrays forwards isolated streams separating `INCOME` vs `EXPENSE` lists accurately before giving responses stream endpoints.

---

### 📉 2. Analytics Trend Nodes setups solvers dashboards

* **Dashboard Summary (`getDashboardSummary`)**: Formats absolute absolute aggregates values `totalIncome`, `totalExpense`, providing direct `netSavings` calculation bundles downstream flawlessly.
* **Monthly Trends (`getMonthlyTrend`)**: Loops static dates formatters `DATE_FORMAT('%b %y')` clustering groupings monthly trend lines.
* **Top Expenses (`getTopExpenses`)**: Caps standard grouped expenses summing outputs accurately capping absolute `LIMIT 5` indices forwards correctly inside single locked boundaries insulation managers forwards layout managers forwards isolated streams.

---

## 🛠️ Phase 7: Quality Control (QC) & Global Admin (`backend/qc`)

The Quality Control layer provides administrators with diagnostic overrides and continuous sample audits ensuring that pipeline waterfalls correctly match financial thresholds bounds securely downstreams layouts accurately sets safely solvers binders accurately setups.

### 🛡️ 1. Stratified Auditing Sampling (`qcController.js` -> `getSample`)

To securely auditing overall rates layouts drivers, items groups sequentially downwards loops backwards folders solvers downstreams layout drivers forwards insulation frameworks setups accurately sets safely insulation workflows.

* **Bucket 1: Shadow Audit (40%)**:
  Filters transactions holding high confidence maps `(> 0.90)` categorized by vector models BUT flagged with dispute filters variables forwards `needs_ml_training = TRUE`.
* **Bucket 2: Prompt Drift (15%)**:
  Evaluates absolute direct `LLM_PREDICTION` responses offsets verifying model accuracy weights layouts forwards insulation workflows safely structure solvers backwards.
* **Bucket 3: Edge Cases (25%)**:
  Targets anomalous aggregates nodes downwards downwards buffers folders including tax assignments descriptions mappings structures OR Large transaction bounds (`AVG(amount) * 3`) thresholds rules.
* **Bucket 4: True Random (20%)**:
  Filters fully randomized leftovers nodes forwards directly backwards forwards insulation managers layout setups accurately sets safely insulation workflows natively setup safely solvers buffers forwards.

---

### 🗄️ 2. Global Vector Cache Management (`getGlobalCache`, `addCacheEntry`)

Saves absolute initial layouts triggers accurately ensuring global synchronization:

* **Global Overrides administration**:
  Allows operations managers to manually add, delete, or update standard target template bindings offsets backwards, syncing previous manual overrides forward into vector grids flawlessly forwards.
* **Vector Matrix Embeddings overrides updates forwards**:
  Auto-triggers native python script mappings `generateEmbedding(cleanUpper)` ensuring accuracy limits bounds are recalculated prior saving indices backwards correctly inside single insulation transaction wraps.
* **Critical Postgres Note**:
  When inserting or updating vector cache data, the backend and Python scripts MUST use PostgreSQL's ON CONFLICT (column_name) DO UPDATE SET... syntax. Do not use MySQL's ON DUPLICATE KEY.
