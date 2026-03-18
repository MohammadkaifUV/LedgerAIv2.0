INSERT INTO public.coa_modules (module_name, is_core, category, description) VALUES
('Core', TRUE, 'CORE', 'Standard chart of accounts for all users'),
('Salaried', FALSE, 'INDIVIDUAL', 'For individuals with a fixed monthly paycheck'),
('Business Owner', FALSE, 'INDIVIDUAL', 'For sole proprietors tracking business & personal'),
('Professional', FALSE, 'INDIVIDUAL', 'For doctors, lawyers, and CAs using personal PAN'),
('Farmer', FALSE, 'INDIVIDUAL', 'For agricultural income and expenses'),
('Student', FALSE, 'INDIVIDUAL', 'For university students managing allowances and fees'),
('Retired', FALSE, 'INDIVIDUAL', 'For seniors managing pensions and medical expenses'),
('Partnership', FALSE, 'BUSINESS', 'For traditional firm partnerships'),
('Pvt Ltd', FALSE, 'BUSINESS', 'For private limited corporate entities'),
('LLP', FALSE, 'BUSINESS', 'For limited liability partnerships'),
('Limited Co.', FALSE, 'BUSINESS', 'For public limited companies'),
('Freelancer', FALSE, 'BUSINESS', 'For registered freelance agencies and tech contractors');

DO $$ 
DECLARE 
    v_core_id int8;
    v_parent_id int8;
BEGIN
    -- Get the Core Module ID
    SELECT module_id INTO v_core_id FROM public.coa_modules WHERE module_name = 'Core';

    -- A. ASSETS: Liquid Assets Parent
    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated) 
    VALUES (v_core_id, 'Liquid Assets', 'ASSET', 'DEBIT', TRUE)
    RETURNING template_id INTO v_parent_id;

    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated, parent_template_id) VALUES
    (v_core_id, 'Cash on Hand', 'ASSET', 'DEBIT', TRUE, v_parent_id),
    (v_core_id, 'Bank Accounts', 'ASSET', 'DEBIT', TRUE, v_parent_id),
    (v_core_id, 'Digital Wallets', 'ASSET', 'DEBIT', TRUE, v_parent_id);

    -- A. ASSETS: Investments & Savings Parent
    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated) 
    VALUES (v_core_id, 'Investments & Savings', 'ASSET', 'DEBIT', FALSE)
    RETURNING template_id INTO v_parent_id;

    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated, parent_template_id) VALUES
    (v_core_id, 'Fixed/Term Deposits', 'ASSET', 'DEBIT', FALSE, v_parent_id),
    (v_core_id, 'Mutual Funds & Stocks', 'ASSET', 'DEBIT', FALSE, v_parent_id),
    (v_core_id, 'Provident Fund / Pension Schemes', 'ASSET', 'DEBIT', FALSE, v_parent_id);

    -- B. LIABILITIES: Current Liabilities Parent
    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated) 
    VALUES (v_core_id, 'Current Liabilities', 'LIABILITY', 'CREDIT', TRUE)
    RETURNING template_id INTO v_parent_id;

    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated, parent_template_id) VALUES
    (v_core_id, 'Credit Cards', 'LIABILITY', 'CREDIT', TRUE, v_parent_id),
    (v_core_id, 'Short-Term Borrowings', 'LIABILITY', 'CREDIT', FALSE, v_parent_id),
    (v_core_id, 'Utility Bills Payable', 'LIABILITY', 'CREDIT', FALSE, v_parent_id);

END $$;

DO $$ 
DECLARE 
    v_sal_id int8;
    v_biz_id int8;
    v_parent_id int8;
BEGIN
    -- 1. Get the Module IDs
    SELECT module_id INTO v_sal_id FROM public.coa_modules WHERE module_name = 'Salaried';
    SELECT module_id INTO v_biz_id FROM public.coa_modules WHERE module_name = 'Business Owner';

    -- ====================================================================================
    -- SALARIED MODULE
    -- ====================================================================================

    -- Income Parent
    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated) 
    VALUES (v_sal_id, 'Employment Income', 'INCOME', 'CREDIT', FALSE)
    RETURNING template_id INTO v_parent_id;

    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated, parent_template_id) VALUES
    (v_sal_id, 'Basic Salary', 'INCOME', 'CREDIT', FALSE, v_parent_id),
    (v_sal_id, 'Bonuses & Incentives', 'INCOME', 'CREDIT', FALSE, v_parent_id),
    (v_sal_id, 'Allowances (HRA, LTA, etc.)', 'INCOME', 'CREDIT', FALSE, v_parent_id);

    -- Expense Parent
    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated) 
    VALUES (v_sal_id, 'Statutory Deductions', 'EXPENSE', 'DEBIT', FALSE)
    RETURNING template_id INTO v_parent_id;

    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated, parent_template_id) VALUES
    (v_sal_id, 'Income Tax (TDS)', 'EXPENSE', 'DEBIT', FALSE, v_parent_id),
    (v_sal_id, 'Employee PF Contribution', 'EXPENSE', 'DEBIT', FALSE, v_parent_id),
    (v_sal_id, 'Professional Tax', 'EXPENSE', 'DEBIT', FALSE, v_parent_id);


    -- ====================================================================================
    -- BUSINESS OWNER MODULE
    -- ====================================================================================

    -- Income Parent
    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated) 
    VALUES (v_biz_id, 'Business Revenue', 'INCOME', 'CREDIT', FALSE)
    RETURNING template_id INTO v_parent_id;

    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated, parent_template_id) VALUES
    (v_biz_id, 'Sales / Services Rendered', 'INCOME', 'CREDIT', FALSE, v_parent_id),
    (v_biz_id, 'Consultation Fees', 'INCOME', 'CREDIT', FALSE, v_parent_id);

    -- Expense Parent
    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated) 
    VALUES (v_biz_id, 'Operating Expenses', 'EXPENSE', 'DEBIT', FALSE)
    RETURNING template_id INTO v_parent_id;

    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated, parent_template_id) VALUES
    (v_biz_id, 'Rent & Utilities', 'EXPENSE', 'DEBIT', FALSE, v_parent_id),
    (v_biz_id, 'Salaries & Wages', 'EXPENSE', 'DEBIT', FALSE, v_parent_id),
    (v_biz_id, 'Marketing & Advertising', 'EXPENSE', 'DEBIT', FALSE, v_parent_id),
    (v_biz_id, 'Software & Subscriptions', 'EXPENSE', 'DEBIT', FALSE, v_parent_id);

END $$;

DO $$ 
DECLARE 
    v_prof_id int8;
    v_farm_id int8;
    v_parent_id int8;
BEGIN
    -- 1. Get the Module IDs
    SELECT module_id INTO v_prof_id FROM public.coa_modules WHERE module_name = 'Professional';
    SELECT module_id INTO v_farm_id FROM public.coa_modules WHERE module_name = 'Farmer';

    -- ====================================================================================
    -- PROFESSIONAL MODULE (Doctors, Lawyers, CAs, etc.)
    -- ====================================================================================

    -- Professional Income Parent
    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated) 
    VALUES (v_prof_id, 'Professional Fees', 'INCOME', 'CREDIT', FALSE)
    RETURNING template_id INTO v_parent_id;

    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated, parent_template_id) VALUES
    (v_prof_id, 'Consultation Revenue', 'INCOME', 'CREDIT', FALSE, v_parent_id),
    (v_prof_id, 'Retainer Fees', 'INCOME', 'CREDIT', FALSE, v_parent_id),
    (v_prof_id, 'Project-Based Billing', 'INCOME', 'CREDIT', FALSE, v_parent_id);

    -- Professional Expenses Parent
    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated) 
    VALUES (v_prof_id, 'Practice Operating Expenses', 'EXPENSE', 'DEBIT', FALSE)
    RETURNING template_id INTO v_parent_id;

    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated, parent_template_id) VALUES
    (v_prof_id, 'Professional Indemnity Insurance', 'EXPENSE', 'DEBIT', FALSE, v_parent_id),
    (v_prof_id, 'License & Certification Renewals', 'EXPENSE', 'DEBIT', FALSE, v_parent_id),
    (v_prof_id, 'Books & Subscriptions', 'EXPENSE', 'DEBIT', FALSE, v_parent_id),
    (v_prof_id, 'Office Rent & Clinic Maintenance', 'EXPENSE', 'DEBIT', FALSE, v_parent_id);


    -- ====================================================================================
    -- FARMER MODULE
    -- ====================================================================================

    -- Agricultural Income Parent
    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated) 
    VALUES (v_farm_id, 'Agricultural Revenue', 'INCOME', 'CREDIT', FALSE)
    RETURNING template_id INTO v_parent_id;

    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated, parent_template_id) VALUES
    (v_farm_id, 'Crop Sales', 'INCOME', 'CREDIT', FALSE, v_parent_id),
    (v_farm_id, 'Livestock Sales', 'INCOME', 'CREDIT', FALSE, v_parent_id),
    (v_farm_id, 'Government Subsidies / Grants', 'INCOME', 'CREDIT', FALSE, v_parent_id);

    -- Direct Farming Expenses Parent
    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated) 
    VALUES (v_farm_id, 'Direct Farming Costs', 'EXPENSE', 'DEBIT', FALSE)
    RETURNING template_id INTO v_parent_id;

    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated, parent_template_id) VALUES
    (v_farm_id, 'Seeds & Fertilizers', 'EXPENSE', 'DEBIT', FALSE, v_parent_id),
    (v_farm_id, 'Pesticides & Chemicals', 'EXPENSE', 'DEBIT', FALSE, v_parent_id),
    (v_farm_id, 'Fuel & Machinery Maintenance', 'EXPENSE', 'DEBIT', FALSE, v_parent_id),
    (v_farm_id, 'Irrigation & Water Charges', 'EXPENSE', 'DEBIT', FALSE, v_parent_id);

END $$;

DO $$ 
DECLARE 
    v_stud_id int8;
    v_ret_id int8;
    v_parent_id int8;
BEGIN
    -- 1. Get the Module IDs
    SELECT module_id INTO v_stud_id FROM public.coa_modules WHERE module_name = 'Student';
    SELECT module_id INTO v_ret_id FROM public.coa_modules WHERE module_name = 'Retired';

    -- ====================================================================================
    -- STUDENT MODULE
    -- ====================================================================================

    -- Student Income Parent
    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated) 
    VALUES (v_stud_id, 'Student Income', 'INCOME', 'CREDIT', FALSE)
    RETURNING template_id INTO v_parent_id;

    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated, parent_template_id) VALUES
    (v_stud_id, 'Monthly Allowance / Pocket Money', 'INCOME', 'CREDIT', FALSE, v_parent_id),
    (v_stud_id, 'Scholarships & Grants', 'INCOME', 'CREDIT', FALSE, v_parent_id),
    (v_stud_id, 'Part-time Job / Internship Pay', 'INCOME', 'CREDIT', FALSE, v_parent_id);

    -- Student Expenses Parent
    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated) 
    VALUES (v_stud_id, 'Educational Expenses', 'EXPENSE', 'DEBIT', FALSE)
    RETURNING template_id INTO v_parent_id;

    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated, parent_template_id) VALUES
    (v_stud_id, 'Tuition Fees', 'EXPENSE', 'DEBIT', FALSE, v_parent_id),
    (v_stud_id, 'Books & Study Materials', 'EXPENSE', 'DEBIT', FALSE, v_parent_id),
    (v_stud_id, 'Hostel & Mess Charges', 'EXPENSE', 'DEBIT', FALSE, v_parent_id),
    (v_stud_id, 'Exam & Certification Fees', 'EXPENSE', 'DEBIT', FALSE, v_parent_id);


    -- ====================================================================================
    -- RETIRED MODULE
    -- ====================================================================================

    -- Retirement Income Parent
    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated) 
    VALUES (v_ret_id, 'Retirement Income', 'INCOME', 'CREDIT', FALSE)
    RETURNING template_id INTO v_parent_id;

    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated, parent_template_id) VALUES
    (v_ret_id, 'Pension Payments', 'INCOME', 'CREDIT', FALSE, v_parent_id),
    (v_ret_id, 'Annuity Receipts', 'INCOME', 'CREDIT', FALSE, v_parent_id),
    (v_ret_id, 'Senior Citizen Scheme Interest', 'INCOME', 'CREDIT', FALSE, v_parent_id);

    -- Retirement Expenses Parent
    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated) 
    VALUES (v_ret_id, 'Healthcare & Support', 'EXPENSE', 'DEBIT', FALSE)
    RETURNING template_id INTO v_parent_id;

    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated, parent_template_id) VALUES
    (v_ret_id, 'Medical Bills & Pharmacy', 'EXPENSE', 'DEBIT', FALSE, v_parent_id),
    (v_ret_id, 'Health Insurance Premiums', 'EXPENSE', 'DEBIT', FALSE, v_parent_id),
    (v_ret_id, 'Home Care Services', 'EXPENSE', 'DEBIT', FALSE, v_parent_id);

END $$;

DO $$ 
DECLARE 
    v_part_id int8;
    v_pvt_id int8;
    v_parent_id int8;
BEGIN
    -- 1. Get the Module IDs
    SELECT module_id INTO v_part_id FROM public.coa_modules WHERE module_name = 'Partnership';
    SELECT module_id INTO v_pvt_id FROM public.coa_modules WHERE module_name = 'Pvt Ltd';

    -- ====================================================================================
    -- PARTNERSHIP MODULE
    -- ====================================================================================

    -- Partnership Equity Parent
    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated) 
    VALUES (v_part_id, 'Partners'' Capital Accounts', 'EQUITY', 'CREDIT', FALSE)
    RETURNING template_id INTO v_parent_id;

    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated, parent_template_id) VALUES
    (v_part_id, 'Partner A - Capital Account', 'EQUITY', 'CREDIT', FALSE, v_parent_id),
    (v_part_id, 'Partner B - Capital Account', 'EQUITY', 'CREDIT', FALSE, v_parent_id),
    (v_part_id, 'Partners'' Drawings', 'EQUITY', 'DEBIT', FALSE, v_parent_id);

    -- Partnership Distribution Parent
    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated) 
    VALUES (v_part_id, 'Profit & Loss Appropriation', 'EQUITY', 'CREDIT', FALSE)
    RETURNING template_id INTO v_parent_id;

    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated, parent_template_id) VALUES
    (v_part_id, 'Interest on Capital', 'EXPENSE', 'DEBIT', FALSE, v_parent_id),
    (v_part_id, 'Partner Salary/Remuneration', 'EXPENSE', 'DEBIT', FALSE, v_parent_id);


    -- ====================================================================================
    -- PVT LTD (PRIVATE LIMITED) MODULE
    -- ====================================================================================

    -- Shareholder Equity Parent
    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated) 
    VALUES (v_pvt_id, 'Shareholders'' Equity', 'EQUITY', 'CREDIT', TRUE)
    RETURNING template_id INTO v_parent_id;

    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated, parent_template_id) VALUES
    (v_pvt_id, 'Authorized Share Capital', 'EQUITY', 'CREDIT', TRUE, v_parent_id),
    (v_pvt_id, 'Paid-up Share Capital', 'EQUITY', 'CREDIT', TRUE, v_parent_id),
    (v_pvt_id, 'Securities Premium Account', 'EQUITY', 'CREDIT', FALSE, v_parent_id);

    -- Corporate Liabilities Parent
    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated) 
    VALUES (v_pvt_id, 'Statutory Corporate Liabilities', 'LIABILITY', 'CREDIT', FALSE)
    RETURNING template_id INTO v_parent_id;

    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated, parent_template_id) VALUES
    (v_pvt_id, 'Corporate Income Tax Payable', 'LIABILITY', 'CREDIT', FALSE, v_parent_id),
    (v_pvt_id, 'GST/VAT Payable', 'LIABILITY', 'CREDIT', FALSE, v_parent_id),
    (v_pvt_id, 'Employee Gratuity Fund', 'LIABILITY', 'CREDIT', FALSE, v_parent_id);

END $$;

DO $$ 
DECLARE 
    v_llp_id int8;
    v_ltd_id int8;
    v_free_id int8;
    v_parent_id int8;
BEGIN
    -- 1. Get the Module IDs
    SELECT module_id INTO v_llp_id FROM public.coa_modules WHERE module_name = 'LLP';
    SELECT module_id INTO v_ltd_id FROM public.coa_modules WHERE module_name = 'Limited Co.';
    SELECT module_id INTO v_free_id FROM public.coa_modules WHERE module_name = 'Freelancer';

    -- ====================================================================================
    -- LLP (LIMITED LIABILITY PARTNERSHIP) MODULE
    -- ====================================================================================

    -- LLP Partner Contributions Parent
    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated) 
    VALUES (v_llp_id, 'Partner Contributions', 'EQUITY', 'CREDIT', FALSE)
    RETURNING template_id INTO v_parent_id;

    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated, parent_template_id) VALUES
    (v_llp_id, 'Designated Partner A Contribution', 'EQUITY', 'CREDIT', FALSE, v_parent_id),
    (v_llp_id, 'Designated Partner B Contribution', 'EQUITY', 'CREDIT', FALSE, v_parent_id),
    (v_llp_id, 'LLP Profit Share Payable', 'LIABILITY', 'CREDIT', FALSE, v_parent_id);


    -- ====================================================================================
    -- LIMITED CO. (PUBLIC LIMITED) MODULE
    -- ====================================================================================

    -- Public Equity Section
    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated) 
    VALUES (v_ltd_id, 'Public Equity & Reserves', 'EQUITY', 'CREDIT', TRUE)
    RETURNING template_id INTO v_parent_id;

    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated, parent_template_id) VALUES
    (v_ltd_id, 'Equity Share Capital', 'EQUITY', 'CREDIT', TRUE, v_parent_id),
    (v_ltd_id, 'Preference Share Capital', 'EQUITY', 'CREDIT', FALSE, v_parent_id),
    (v_ltd_id, 'General Reserve', 'EQUITY', 'CREDIT', FALSE, v_parent_id),
    (v_ltd_id, 'Retained Earnings (P&L Account)', 'EQUITY', 'CREDIT', FALSE, v_parent_id);

    -- Public Corporate Revenue
    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated) 
    VALUES (v_ltd_id, 'Public Corporate Revenue', 'INCOME', 'CREDIT', FALSE)
    RETURNING template_id INTO v_parent_id;

    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated, parent_template_id) VALUES
    (v_ltd_id, 'Revenue from Operations', 'INCOME', 'CREDIT', FALSE, v_parent_id),
    (v_ltd_id, 'Dividend Income from Subsidiaries', 'INCOME', 'CREDIT', FALSE, v_parent_id),
    (v_ltd_id, 'Other Income', 'INCOME', 'CREDIT', FALSE, v_parent_id);


    -- ====================================================================================
    -- FREELANCER MODULE
    -- ====================================================================================

    -- Freelance Income Parent
    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated) 
    VALUES (v_free_id, 'Freelance Revenue', 'INCOME', 'CREDIT', FALSE)
    RETURNING template_id INTO v_parent_id;

    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated, parent_template_id) VALUES
    (v_free_id, 'Client Project Fees', 'INCOME', 'CREDIT', FALSE, v_parent_id),
    (v_free_id, 'Retainer Income', 'INCOME', 'CREDIT', FALSE, v_parent_id),
    (v_free_id, 'Royalties / Passive Income', 'INCOME', 'CREDIT', FALSE, v_parent_id);

    -- Freelance Specific Expenses
    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated) 
    VALUES (v_free_id, 'Freelance Business Expenses', 'EXPENSE', 'DEBIT', FALSE)
    RETURNING template_id INTO v_parent_id;

    INSERT INTO public.coa_templates (module_id, account_name, account_type, balance_nature, is_system_generated, parent_template_id) VALUES
    (v_free_id, 'Subcontracting / Outsourcing Fees', 'EXPENSE', 'DEBIT', FALSE, v_parent_id),
    (v_free_id, 'Software Tools & SaaS', 'EXPENSE', 'DEBIT', FALSE, v_parent_id),
    (v_free_id, 'Home Office Utilities', 'EXPENSE', 'DEBIT', FALSE, v_parent_id),
    (v_free_id, 'Payment Gateway Fees', 'EXPENSE', 'DEBIT', FALSE, v_parent_id);

END $$;

INSERT INTO public.routing_rules (rule_name, match_type, pattern, strategy_type, target_template_id, priority, is_active) 
VALUES
-- TIER 1: THE TRAPDOORS (GARBAGE DISPOSAL)
('Paytm Algorithmic QR', 'REGEX', '(paytmqr[a-z0-9]+)', 'EXACT_THEN_DUMP', NULL, 100, TRUE),
('BharatPe Algorithmic QR', 'REGEX', '(bharatpe\\.[a-z0-9]+)', 'EXACT_THEN_DUMP', NULL, 100, TRUE),
('MSwipe Terminal', 'REGEX', '(mswipe\\.\\d+)', 'EXACT_THEN_DUMP', NULL, 100, TRUE),
('UPI Phone Number Privacy', 'REGEX', '(\\d{10}(?:-[a-z0-9]+)?@[a-z]+)', 'EXACT_THEN_DUMP', NULL, 95, TRUE),

-- TIER 2: FAST-PATH (DETERMINISTIC BANK RULES)
('Standard Bank Fees', 'REGEX', '^(?:FEE|CHG|CHARGES)[/\\-]', 'FAST_PATH', 
    (SELECT template_id FROM coa_templates WHERE account_name ILIKE '%Bank Charges%' LIMIT 1), 90, TRUE),
('Interest Income', 'REGEX', '(?:INT|INTEREST|SBINT)[/\\-]', 'FAST_PATH', 
    (SELECT template_id FROM coa_templates WHERE account_name ILIKE '%Interest Income%' LIMIT 1), 90, TRUE),

-- TIER 3: SMART EXTRACTORS
('ACH/NACH Clearing Extractor', 'REGEX', '^ACH[A-Z]*?-([a-zA-Z0-9]+)-\\d+', 'VECTOR_SEARCH', NULL, 80, TRUE),
('IMPS Transfer Extractor', 'REGEX', '^IMPS-\\d+-([a-zA-Z0-9]+)', 'VECTOR_SEARCH', NULL, 80, TRUE),
('UPI Multi-Part Named Extractor', 'REGEX', '^UPI-([a-zA-Z0-9]+)-', 'VECTOR_SEARCH', NULL, 75, TRUE),
('UPIOUT Multi-Part Extractor', 'REGEX', '^UPIOUT/\d+/([^/]+)', 'VECTOR_SEARCH', 85, TRUE);