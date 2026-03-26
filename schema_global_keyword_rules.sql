-- Global Keyword Rules Table
-- Deterministic keyword-based categorization for generic category terms
-- Used in Stage 3.15 between personal vector cache and global vector cache

CREATE TABLE public.global_keyword_rules (
    keyword_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    keyword text NOT NULL,
    target_template_id bigint NOT NULL,
    match_type text DEFAULT 'CONTAINS' CHECK (match_type IN ('EXACT', 'CONTAINS')),
    priority integer DEFAULT 0,
    hit_count integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT fk_template FOREIGN KEY (target_template_id)
        REFERENCES public.coa_templates(template_id) ON DELETE CASCADE
);

-- Index for fast keyword lookups
CREATE INDEX idx_global_keyword_rules_active ON public.global_keyword_rules(is_active, priority DESC);
CREATE INDEX idx_global_keyword_rules_keyword ON public.global_keyword_rules(keyword) WHERE is_active = true;

-- Comments
COMMENT ON TABLE public.global_keyword_rules IS 'Deterministic keyword-based categorization rules for generic category terms like PETROL, RESTAURANT, etc.';
COMMENT ON COLUMN public.global_keyword_rules.keyword IS 'The keyword to match against cleaned merchant names (stored in uppercase)';
COMMENT ON COLUMN public.global_keyword_rules.match_type IS 'EXACT: exact match only, CONTAINS: substring match';
COMMENT ON COLUMN public.global_keyword_rules.priority IS 'Higher priority rules are evaluated first';
COMMENT ON COLUMN public.global_keyword_rules.hit_count IS 'Tracks how often this rule is matched';

-- Example seed data (commented out - you will seed your own)
-- INSERT INTO public.global_keyword_rules (keyword, target_template_id, match_type, priority) VALUES
-- ('PETROL', (SELECT template_id FROM coa_templates WHERE account_name ILIKE '%Fuel%' LIMIT 1), 'CONTAINS', 100),
-- ('DIESEL', (SELECT template_id FROM coa_templates WHERE account_name ILIKE '%Fuel%' LIMIT 1), 'CONTAINS', 100),
-- ('RESTAURANT', (SELECT template_id FROM coa_templates WHERE account_name ILIKE '%Dining%' LIMIT 1), 'CONTAINS', 90),
-- ('COFFEE', (SELECT template_id FROM coa_templates WHERE account_name ILIKE '%Dining%' LIMIT 1), 'CONTAINS', 90),
-- ('GROCERY', (SELECT template_id FROM coa_templates WHERE account_name ILIKE '%Groceries%' LIMIT 1), 'CONTAINS', 90),
-- ('PHARMACY', (SELECT template_id FROM coa_templates WHERE account_name ILIKE '%Healthcare%' LIMIT 1), 'CONTAINS', 90),
-- ('HOSPITAL', (SELECT template_id FROM coa_templates WHERE account_name ILIKE '%Healthcare%' LIMIT 1), 'CONTAINS', 90),
-- ('ELECTRICITY', (SELECT template_id FROM coa_templates WHERE account_name ILIKE '%Utilities%' LIMIT 1), 'EXACT', 95),
-- ('WATER BILL', (SELECT template_id FROM coa_templates WHERE account_name ILIKE '%Utilities%' LIMIT 1), 'CONTAINS', 95);
