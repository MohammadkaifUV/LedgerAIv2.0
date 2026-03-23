-- Migration: Add Uncategorised Income and Expense fallback accounts for all users
-- Created: 2026-03-23
-- Purpose: Ensure all transactions are captured even when offset_account_id cannot be determined

DO $$
DECLARE
    user_record RECORD;
    expense_account_id BIGINT;
    income_account_id BIGINT;
BEGIN
    -- Loop through all users from auth.users
    FOR user_record IN SELECT id FROM auth.users LOOP

        -- Check if Uncategorised Expense already exists for this user
        SELECT account_id INTO expense_account_id
        FROM public.accounts
        WHERE user_id = user_record.id
          AND account_name = 'Uncategorised Expense'
          AND account_type = 'EXPENSE'
        LIMIT 1;

        -- Create Uncategorised Expense if it doesn't exist
        IF expense_account_id IS NULL THEN
            INSERT INTO public.accounts (
                user_id,
                account_name,
                account_type,
                balance_nature,
                is_system_generated,
                is_active,
                parent_account_id,
                template_id
            ) VALUES (
                user_record.id,
                'Uncategorised Expense',
                'EXPENSE',
                'DEBIT',
                true,
                true,
                NULL,
                NULL
            );
            RAISE NOTICE 'Created Uncategorised Expense for user_id: %', user_record.id;
        ELSE
            RAISE NOTICE 'Uncategorised Expense already exists for user_id: %', user_record.id;
        END IF;

        -- Check if Uncategorised Income already exists for this user
        SELECT account_id INTO income_account_id
        FROM public.accounts
        WHERE user_id = user_record.id
          AND account_name = 'Uncategorised Income'
          AND account_type = 'INCOME'
        LIMIT 1;

        -- Create Uncategorised Income if it doesn't exist
        IF income_account_id IS NULL THEN
            INSERT INTO public.accounts (
                user_id,
                account_name,
                account_type,
                balance_nature,
                is_system_generated,
                is_active,
                parent_account_id,
                template_id
            ) VALUES (
                user_record.id,
                'Uncategorised Income',
                'INCOME',
                'CREDIT',
                true,
                true,
                NULL,
                NULL
            );
            RAISE NOTICE 'Created Uncategorised Income for user_id: %', user_record.id;
        ELSE
            RAISE NOTICE 'Uncategorised Income already exists for user_id: %', user_record.id;
        END IF;

    END LOOP;

    RAISE NOTICE 'Migration completed successfully';
END $$;
