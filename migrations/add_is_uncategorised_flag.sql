-- Migration: Add is_uncategorised flag to transactions table
-- Created: 2026-03-23
-- Purpose: Flag transactions that use uncategorised fallback accounts for easier frontend filtering

ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS is_uncategorised boolean DEFAULT false NOT NULL;

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_transactions_is_uncategorised
ON public.transactions(is_uncategorised)
WHERE is_uncategorised = true;

-- Backfill existing transactions that use uncategorised accounts
UPDATE public.transactions t
SET is_uncategorised = true
FROM public.accounts a
WHERE t.offset_account_id = a.account_id
  AND a.account_name IN ('Uncategorised Expense', 'Uncategorised Income')
  AND t.is_uncategorised = false;
