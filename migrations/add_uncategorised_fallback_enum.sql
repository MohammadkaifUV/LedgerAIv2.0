-- Migration: Add UNCATEGORISED_FALLBACK to categorisation_method enum
-- Created: 2026-03-23
-- Purpose: Support fallback categorization for transactions that cannot be categorized

ALTER TYPE public.categorisation_method ADD VALUE IF NOT EXISTS 'UNCATEGORISED_FALLBACK';
