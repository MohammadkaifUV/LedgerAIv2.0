# LedgerAI Parser

This directory contains the Python-based PDF parser for extracting transactions from financial documents.

## Directory Structure

```
parser/
├── config.py                       # Configuration settings
├── requirements.txt                # Python dependencies
├── test_parser.py                  # Test script
├── __init__.py                     # Package init
│
├── db/
│   ├── connection.py              # Supabase client
│   └── __init__.py
│
├── repository/
│   ├── document_repo.py           # Document CRUD operations
│   ├── statement_category_repo.py # Format management
│   └── __init__.py
│
└── services/
    ├── processing_engine.py       # Main pipeline orchestrator
    ├── pdf_service.py             # PDF text extraction
    ├── identifier_service.py      # Document classification
    ├── llm_parser.py              # LLM-based extraction
    ├── extraction_service.py      # Code generation
    ├── validation_service.py      # Transaction validation
    ├── code_gen_client.py         # Claude API client
    ├── code_sandbox.py            # Safe code execution
    ├── llm_retry.py               # Retry logic
    ├── post_process.py            # Post-processing
    ├── __init__.py
    └── prompts/
        ├── __init__.py
        ├── bank_statement.py
        ├── credit_card.py
        ├── wallet.py
        ├── loan.py
        ├── investment.py
        └── demat.py
```

## Quick Start

### 1. Install Dependencies
```bash
cd backend/parser
pip install -r requirements.txt
```

### 2. Configure Environment
Add to `backend/.env`:
```bash
GEMINI_API_KEY=your_gemini_key
ANTHROPIC_API_KEY=your_anthropic_key
CODE_GEN_PROVIDER=anthropic
```

### 3. Test
```bash
python test_parser.py
```

## Usage

### Process a Document
```python
import sys
sys.path.insert(0, '/path/to/backend/parser')

from services.processing_engine import process_document

# Process document by ID
process_document(document_id=1)
```

### Extract PDF Text
```python
from services.pdf_service import extract_pdf_text

text = extract_pdf_text('/path/to/statement.pdf', password=None)
print(f"Extracted {len(text)} characters")
```

### Classify Document
```python
from services.identifier_service import classify_document_llm

pages = [text]  # Split by page
identifier = classify_document_llm(pages)
print(f"Institution: {identifier['institution_name']}")
print(f"Type: {identifier['document_family']}")
```

## Pipeline Flow

```
1. PDF Upload
   ↓
2. Text Extraction (pdf_service.py)
   ↓
3. Document Classification (identifier_service.py)
   ↓
4. Format Check (statement_category_repo.py)
   ↓
5. Code Generation (if new format)
   ↓
6. Dual Extraction (CODE + LLM)
   ↓
7. Validation & Comparison
   ↓
8. Save to Database
```

## Key Features

- **Multi-strategy PDF extraction** - Handles various PDF formats
- **Automatic classification** - Detects bank statements, credit cards, etc.
- **Dual extraction** - Runs both CODE and LLM for accuracy
- **Format learning** - Stores extraction logic for reuse
- **Safe execution** - AST validation and sandboxed code execution
- **Password support** - Handles encrypted PDFs

## Configuration

Edit `config.py` or set environment variables:

```python
# Supabase
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

# Gemini AI (classification & LLM parsing)
GEMINI_API_KEY
GEMINI_MODEL_NAME=gemini-2.5-flash
CLASSIFIER_MODEL=gemini-2.5-flash

# Claude (code generation)
CODE_GEN_PROVIDER=anthropic
ANTHROPIC_API_KEY
ANTHROPIC_MODEL=claude-sonnet-4-5-20241022
```

## Testing

Run the test script to verify setup:
```bash
python test_parser.py
```

This will check:
- Module imports
- Configuration
- Supabase connection

## Documentation

For complete documentation, see the project root:
- `START_HERE.md` - Quick overview
- `README_PARSER.md` - Quick start guide
- `PARSER_INTEGRATION_SUMMARY.md` - Architecture details
- `NEXT_STEPS.md` - Setup instructions

## Support

For issues or questions, check the documentation in the project root directory.
