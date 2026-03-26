"""
services/llm_parser.py
──────────────────────
STEP 4 METHOD 2 — Direct LLM transaction extraction.

Sends full text + identifier to Gemini, which returns
structured transaction JSON directly.
"""

import json
import logging

from google import genai
from config import GEMINI_API_KEY, GEMINI_MODEL_NAME
from services.llm_retry import call_with_retry

client = genai.Client(api_key=GEMINI_API_KEY)
logger = logging.getLogger("ledgerai.llm_parser")


def parse_with_llm(full_text: str, identifier_json: dict) -> str:
    """
    Ask Gemini to directly extract transactions from the document text.
    Returns raw LLM response string (caller must parse JSON from it).
    """
    doc_family = identifier_json.get("document_family", "BANK_ACCOUNT_STATEMENT")
    doc_subtype = identifier_json.get("document_subtype", "")

    # Get parsing hints to help LLM skip non-transaction rows
    hints = identifier_json.get("parsing_hints", {})
    skip_labels = hints.get("summary_section_labels", [])[:10]
    layout = hints.get("layout_type", "SINGLE_COLUMN")

    skip_instruction = ""
    if skip_labels:
        skip_instruction = f"\n- SKIP lines starting with: {', '.join(skip_labels)}"

    prompt = f"""
Extract ALL transactions from {doc_family} ({doc_subtype}).

LAYOUT: {layout}{skip_instruction}

STEPS:
1. Find transaction lines (date + description + amount)
2. Handle multi-line transactions CAREFULLY:
   - Only merge if next line is clearly a continuation (no date, no amount, indented or very short)
   - DO NOT merge if next line looks like a separate transaction or has amounts
   - DO NOT merge lines separated by page breaks, section dividers, or pipe symbols (|)
   - When in doubt, treat as separate transactions rather than merging
3. Extract details field AS-IS (keep all prefixes, reference numbers, original text)
4. Classify debit vs credit (use ALL methods):
   - Column headers (Debit/Credit, Withdrawal/Deposit)
   - Balance change: decreased = debit (out), increased = credit (in)
   - Keywords: PAYMENT/REFUND/DEPOSIT = credit, PURCHASE/FEE/WITHDRAWAL = debit
5. Skip: headers, footers, summaries (Opening/Closing Balance, Total)

CRITICAL RULES:
- Every transaction needs EXACTLY ONE of debit or credit (never both, never neither)
- If unsure, use balance change to decide
- Normalize dates to YYYY-MM-DD
- Handle Indian number format (1,00,000.00)
- Details field: preserve original text exactly as it appears, do NOT strip prefixes or clean
- DO NOT merge unrelated lines - be conservative with multi-line merging
- Confidence: 0.95 normal, 0.85 if debit/credit unclear, 0.70 if uncertain

OUTPUT: [{{"date": "YYYY-MM-DD", "details": "...", "debit": float|null, "credit": float|null, "balance": float|null, "confidence": 0.0-1.0}}]

DOCUMENT:
{full_text}

Return ONLY JSON array.
"""

    logger.info("Starting LLM parse: family=%s, text_len=%d",
                doc_family, len(full_text))

    response = call_with_retry(
        client, GEMINI_MODEL_NAME, prompt,
        config={"temperature": 0},
    )

    llm_response = response.text.strip()
    logger.info("LLM parse complete: response_len=%d", len(llm_response))

    return llm_response