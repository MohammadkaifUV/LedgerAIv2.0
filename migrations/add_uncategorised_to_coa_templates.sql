-- Migration: Add Uncategorised Income and Expense to COA templates
-- Created: 2026-03-23
-- Purpose: Ensure new users get uncategorised fallback accounts automatically

DO $$
DECLARE
    v_core_id int8;
BEGIN
    -- Get the Core Module ID
    SELECT module_id INTO v_core_id FROM public.coa_modules WHERE module_name = 'Core';

    -- Check if Uncategorised Expense already exists in templates
    IF NOT EXISTS (
        SELECT 1 FROM public.coa_templates
        WHERE module_id = v_core_id
        AND account_name = 'Uncategorised Expense'
    ) THEN
        INSERT INTO public.coa_templates (
            module_id,
            account_name,
            account_type,
            balance_nature,
            is_system_generated,
            parent_template_id
        ) VALUES (
            v_core_id,
            'Uncategorised Expense',
            'EXPENSE',
            'DEBIT',
            TRUE,
            NULL
        );
        RAISE NOTICE 'Added Uncategorised Expense to COA templates';
    ELSE
        RAISE NOTICE 'Uncategorised Expense already exists in COA templates';
    END IF;

    -- Check if Uncategorised Income already exists in templates
    IF NOT EXISTS (
        SELECT 1 FROM public.coa_templates
        WHERE module_id = v_core_id
        AND account_name = 'Uncategorised Income'
    ) THEN
        INSERT INTO public.coa_templates (
            module_id,
            account_name,
            account_type,
            balance_nature,
            is_system_generated,
            parent_template_id
        ) VALUES (
            v_core_id,
            'Uncategorised Income',
            'INCOME',
            'CREDIT',
            TRUE,
            NULL
        );
        RAISE NOTICE 'Added Uncategorised Income to COA templates';
    ELSE
        RAISE NOTICE 'Uncategorised Income already exists in COA templates';
    END IF;

END $$;
