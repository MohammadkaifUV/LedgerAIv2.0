-- 1. Create a custom Type for your Status (Postgres equivalent of ENUM)
CREATE TYPE user_status AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- 2. Create the Profiles table (in the 'public' schema)
CREATE TABLE public.profiles (
    -- Link to Supabase Auth (This is the magic part)
    id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    full_name text NOT NULL,
    -- We keep email here too for easy querying, but Auth handles the logic
    email text UNIQUE NOT NULL, 
    status user_status NOT NULL DEFAULT 'ACTIVE',
    role VARCHAR(50) NOT NULL DEFAULT 'USER',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    deleted_at timestamptz DEFAULT NULL
);

-- 3. Enable Row Level Security (CRITICAL for a ledger)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles 
ADD CONSTRAINT check_user_role CHECK (role IN ('USER', 'QC', 'ADMIN'));
-- This function inserts a row into public.profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, status)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', 'ACTIVE');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- This trigger runs the function every time a user signs up
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

-- 1. Create the Category Enum
CREATE TYPE module_category AS ENUM ('CORE', 'INDIVIDUAL', 'BUSINESS');

-- 2. Create the COA Modules Table
CREATE TABLE public.coa_modules (
    -- Use BIGSERIAL to mimic AUTO_INCREMENT if you prefer numbers, 
    -- but 'int8' is the Postgres equivalent of BIGINT.
    module_id int8 GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    module_name text NOT NULL UNIQUE, 
    is_core boolean NOT NULL DEFAULT FALSE,
    category module_category NOT NULL DEFAULT 'INDIVIDUAL',
    description text,
    created_at timestamptz DEFAULT now()
);

-- 3. Create the User Modules Link Table
CREATE TABLE public.user_modules (
    -- IMPORTANT: user_id must be 'uuid' to match auth.users(id)
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    module_id int8 NOT NULL REFERENCES public.coa_modules(module_id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    
    -- Composite Primary Key (Just like your MySQL version)
    PRIMARY KEY (user_id, module_id)
);

-- 4. Enable RLS (Security)
ALTER TABLE public.coa_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_modules ENABLE ROW LEVEL SECURITY;

-- 5. Basic Security Policies (Allows users to see their own modules)
CREATE POLICY "Users can view their own modules" 
ON public.user_modules FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own modules" 
ON public.user_modules FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone can view COA modules" 
ON public.coa_modules FOR SELECT 
TO authenticated 
USING (true);

-- 1. Create Enums (If not already created in previous steps)
DO $$ BEGIN
    CREATE TYPE account_type AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');
    CREATE TYPE balance_nature AS ENUM ('DEBIT', 'CREDIT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. COA Templates (The Blueprints)
CREATE TABLE public.coa_templates (
    template_id int8 GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    module_id int8 NOT NULL REFERENCES public.coa_modules(module_id) ON DELETE CASCADE,
    account_name text NOT NULL,
    account_type account_type NOT NULL,
    balance_nature balance_nature NOT NULL,
    is_system_generated boolean NOT NULL DEFAULT TRUE,
    parent_template_id int8 REFERENCES public.coa_templates(template_id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now()
);

-- 3. Accounts (The User's Live Data)
CREATE TABLE public.accounts (
    account_id int8 GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- IMPORTANT: user_id must be uuid to match Supabase Auth
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_name text NOT NULL,
    account_type account_type NOT NULL,
    balance_nature balance_nature NOT NULL,
    is_system_generated boolean NOT NULL DEFAULT FALSE, 
    is_active boolean NOT NULL DEFAULT TRUE,
    parent_account_id int8 REFERENCES public.accounts(account_id) ON DELETE SET NULL,
    template_id int8 REFERENCES public.coa_templates(template_id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now()
);

-- 4. Enable RLS
ALTER TABLE public.coa_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- 5. Policies
CREATE POLICY "Users can view all templates" ON public.coa_templates
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can manage their own accounts" ON public.accounts
    FOR ALL TO authenticated USING (auth.uid() = user_id);

-- 1. Create the Account Identifiers Table
CREATE TABLE public.account_identifiers (
    identifier_id int8 GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    
    -- Links to the 'accounts' table we just made
    account_id int8 NOT NULL REFERENCES public.accounts(account_id) ON DELETE CASCADE,
    
    -- IMPORTANT: user_id must be uuid to match Supabase Auth
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    institution_name text, -- e.g., 'HDFC', 'Chase'
    account_number_masked text,
    account_number_last4 varchar(4),
    ifsc_code varchar(20),
    card_network text, -- e.g., 'VISA', 'MASTERCARD'
    card_last4 varchar(4),
    wallet_id text,
    is_primary boolean DEFAULT FALSE,
    is_active boolean DEFAULT TRUE,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.account_identifiers ENABLE ROW LEVEL SECURITY;

-- 3. Security Policy
CREATE POLICY "Users can manage their own account identifiers" 
ON public.account_identifiers 
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id);

-- 4. Add the Update Trigger (Keep that timestamp accurate!)
CREATE TRIGGER update_account_identifiers_updated_at
    BEFORE UPDATE ON public.account_identifiers
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
-- 1. Create Enums for the categorization engine
DO $$ BEGIN
    CREATE TYPE doc_status AS ENUM ('UPLOADED', 'PROCESSED', 'FAILED');
    CREATE TYPE categorisation_method AS ENUM (
        'USER_MANUAL','GLOBAL_RULE','TRAPDOOR_FILTER','PERSONAL_EXACT',
        'PERSONAL_VECTOR','GLOBAL_VECTOR','LLM_PREDICTION'
    );
    CREATE TYPE posting_status AS ENUM ('DRAFT', 'POSTED', 'REVERSED');
    CREATE TYPE attention_level AS ENUM ('LOW', 'MEDIUM', 'HIGH');
    CREATE TYPE review_status AS ENUM ('PENDING', 'APPROVED', 'MODIFIED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Documents Table (Minimal version)
CREATE TABLE public.documents (
    document_id int8 GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    file_name text NOT NULL,
    status doc_status NOT NULL DEFAULT 'UPLOADED',
    created_at timestamptz DEFAULT now()
);

-- 3. AI Staging Table (Using jsonb for better performance)
CREATE TABLE public.ai_transactions_staging (
    staging_transaction_id int8 GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document_id int8 NOT NULL REFERENCES public.documents(document_id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    transaction_json jsonb NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- 4. Uncategorized Transactions (Teammate's Output)
CREATE TABLE public.uncategorized_transactions (   
    uncategorized_transaction_id int8 GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id int8 REFERENCES public.accounts(account_id) ON DELETE SET NULL,
    document_id int8 NOT NULL REFERENCES public.documents(document_id) ON DELETE CASCADE,
    staging_transaction_id int8 NOT NULL REFERENCES public.ai_transactions_staging(staging_transaction_id) ON DELETE CASCADE,
    txn_date date NOT NULL, 
    debit decimal(18,2),
    credit decimal(18,2),
    balance decimal(18,2),
    details text,
    created_at timestamptz DEFAULT now()
);

-- 5. Final Transactions Table (Your Categorization Engine)
CREATE TABLE public.transactions (    
    transaction_id int8 GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    base_account_id int8 NOT NULL REFERENCES public.accounts(account_id),     
    offset_account_id int8 REFERENCES public.accounts(account_id),       
    document_id int8 NOT NULL REFERENCES public.documents(document_id),
    transaction_date date NOT NULL,
    details text,
    clean_merchant_name text,
    amount decimal(18,2) NOT NULL,
    transaction_type balance_nature NOT NULL, -- Reusing existing DEBIT/CREDIT enum
    categorised_by categorisation_method NOT NULL,
    confidence_score decimal(5,2) NOT NULL,
    vector_distance decimal(8,6),     
    posting_status posting_status DEFAULT 'DRAFT',
    attention_level attention_level NOT NULL DEFAULT 'LOW',
    review_status review_status NOT NULL DEFAULT 'PENDING',
    uncategorized_transaction_id int8 REFERENCES public.uncategorized_transactions(uncategorized_transaction_id),
    created_at timestamptz DEFAULT now()
);

-- 6. Indexes for Performance
CREATE INDEX idx_txn_date ON public.transactions (transaction_date);
CREATE INDEX idx_user_merchant ON public.transactions (user_id, clean_merchant_name);

-- 7. Security (Enable RLS for all)
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_transactions_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uncategorized_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- 8. Basic Policies
CREATE POLICY "Users can manage their own docs" ON public.documents FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own staging" ON public.ai_transactions_staging FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own uncategorized" ON public.uncategorized_transactions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own final txns" ON public.transactions FOR ALL USING (auth.uid() = user_id);

-- Create Enums for the Routing Engine
DO $$ BEGIN
    CREATE TYPE match_type AS ENUM ('REGEX', 'PREFIX', 'EXACT', 'CONTAINS');
    CREATE TYPE strategy_type AS ENUM ('FAST_PATH', 'EXACT_THEN_DUMP', 'VECTOR_SEARCH');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create Routing Rules Table
CREATE TABLE public.routing_rules (
    rule_id int8 GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rule_name text NOT NULL,
    match_type match_type NOT NULL DEFAULT 'REGEX',
    pattern text NOT NULL,
    strategy_type strategy_type NOT NULL,
    target_template_id int8 REFERENCES public.coa_templates(template_id) ON DELETE SET NULL,
    hit_count int4 DEFAULT 0,
    priority int4 DEFAULT 0,
    is_active boolean DEFAULT TRUE,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.routing_rules ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone authenticated can view rules (needed for the engine)
CREATE POLICY "Allow authenticated read access to rules" 
ON public.routing_rules FOR SELECT TO authenticated USING (true);

-- Update Trigger
CREATE TRIGGER update_routing_rules_updated_at
    BEFORE UPDATE ON public.routing_rules
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Global Vector Cache (Crowdsourced Intelligence)
CREATE TABLE public.global_vector_cache (
    cache_id int8 GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    clean_name text NOT NULL UNIQUE, 
    target_template_id int8 REFERENCES public.coa_templates(template_id) ON DELETE SET NULL,
    embedding vector(384) NOT NULL, -- Ensure pgvector extension is enabled
    approval_count int4 DEFAULT 1, 
    is_verified boolean DEFAULT FALSE, 
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. Personal Exact Cache (For exact VPA matches like 'rent@upi')
CREATE TABLE public.personal_exact_cache (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    raw_vpa text NOT NULL, 
    account_id int8 NOT NULL REFERENCES public.accounts(account_id) ON DELETE CASCADE,
    hit_count int4 DEFAULT 1,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    PRIMARY KEY (user_id, raw_vpa)
);

-- 3. Personal Vector Cache (For fuzzy matching names like 'ZOMATO-123')
CREATE TABLE public.personal_vector_cache (
    cache_id int8 GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    clean_name text NOT NULL, 
    account_id int8 NOT NULL REFERENCES public.accounts(account_id) ON DELETE CASCADE,
    embedding vector(384) NOT NULL,
    hit_count int4 DEFAULT 1,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (user_id, clean_name)
);

-- 4. Enable RLS
ALTER TABLE public.global_vector_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_exact_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_vector_cache ENABLE ROW LEVEL SECURITY;

-- 5. Policies
-- Everyone can read the Global Cache
CREATE POLICY "Read Global Vector Cache" ON public.global_vector_cache FOR SELECT TO authenticated USING (true);

-- Users can only see/edit their own personal caches
CREATE POLICY "Manage Personal Exact Cache" ON public.personal_exact_cache FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Manage Personal Vector Cache" ON public.personal_vector_cache FOR ALL TO authenticated USING (auth.uid() = user_id);

-- 6. Add Update Triggers (Reusable function from previous steps)
CREATE TRIGGER update_global_vector_cache_updated_at BEFORE UPDATE ON public.global_vector_cache FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_personal_exact_cache_updated_at BEFORE UPDATE ON public.personal_exact_cache FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_personal_vector_cache_updated_at BEFORE UPDATE ON public.personal_vector_cache FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Create Ledger Entries Table
CREATE TABLE public.ledger_entries (
    ledger_entry_id int8 GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    transaction_id int8 NOT NULL REFERENCES public.transactions(transaction_id) ON DELETE CASCADE,
    account_id int8 NOT NULL REFERENCES public.accounts(account_id),
    debit_amount decimal(18,2) NOT NULL DEFAULT 0.00,
    credit_amount decimal(18,2) NOT NULL DEFAULT 0.00,
    entry_date date NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see entries related to their own transactions
-- (We join through the transactions table to verify ownership)
CREATE POLICY "Users can view their own ledger entries" 
ON public.ledger_entries 
FOR ALL 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.transactions 
        WHERE transactions.transaction_id = ledger_entries.transaction_id 
        AND transactions.user_id = auth.uid()
    )
);
-- Stored Procedure for RPC Vector Matching
CREATE OR REPLACE FUNCTION match_vectors (
  query_embedding vector(384),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  target_template_id int8,
  distance float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    global_vector_cache.target_template_id,
    (global_vector_cache.embedding <=> query_embedding) AS distance
  FROM global_vector_cache
  WHERE (global_vector_cache.embedding <=> query_embedding) <= match_threshold
  ORDER BY distance ASC
  LIMIT match_count;
END;
$$;

-- Stored Procedure for Personal Vector Cache Lookup
CREATE OR REPLACE FUNCTION match_personal_vectors (
  p_user_id uuid,
  query_embedding vector(384),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  account_id int8,
  distance float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    personal_vector_cache.account_id,
    (personal_vector_cache.embedding <=> query_embedding) AS distance
  FROM personal_vector_cache
  WHERE personal_vector_cache.user_id = p_user_id
    AND (personal_vector_cache.embedding <=> query_embedding) <= match_threshold
  ORDER BY distance ASC
  LIMIT match_count;
END;
$$;
