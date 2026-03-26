"""
FastAPI entry point for LedgerAI Parser Service
"""
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional
import logging
import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.processing_engine import process_document
from repository.document_repo import get_document, get_staging_transactions
from db.connection import get_client

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="LedgerAI Parser API",
    description="PDF financial document parser with dual extraction (CODE + LLM)",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this based on your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "LedgerAI Parser API",
        "status": "running",
        "version": "1.0.0"
    }

@app.get("/health")
async def health_check():
    """Detailed health check with database connectivity"""
    try:
        supabase = get_client()
        # Test database connection
        result = supabase.table("documents").select("document_id").limit(1).execute()

        return {
            "status": "healthy",
            "database": "connected",
            "timestamp": "2026-03-26T16:51:38.744Z"
        }
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "database": "disconnected",
                "error": str(e)
            }
        )

@app.post("/api/documents/process/{document_id}")
async def process_document_endpoint(
    document_id: int,
    background_tasks: BackgroundTasks
):
    """
    Process a document that's already uploaded to Supabase

    Args:
        document_id: ID of the document in the documents table

    Returns:
        Processing status
    """
    try:
        # Verify document exists
        doc = get_document(document_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        # Start processing in background
        background_tasks.add_task(process_document, document_id)

        return {
            "status": "processing_started",
            "document_id": document_id,
            "message": "Document processing has been queued"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting document processing: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/documents/process-sync/{document_id}")
async def process_document_sync(document_id: int):
    """
    Process a document synchronously (waits for completion)

    Args:
        document_id: ID of the document in the documents table

    Returns:
        Processing result
    """
    try:
        # Verify document exists
        doc = get_document(document_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        # Process document synchronously
        result = process_document(document_id)

        return {
            "status": "completed",
            "document_id": document_id,
            "result": result
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing document: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/documents/{document_id}/status")
async def get_document_status(document_id: int):
    """
    Get the current status of a document

    Args:
        document_id: ID of the document

    Returns:
        Document status and metadata
    """
    try:
        doc = get_document(document_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        return {
            "document_id": document_id,
            "status": doc.get("status"),
            "file_name": doc.get("file_name"),
            "institution_name": doc.get("institution_name"),
            "statement_type": doc.get("statement_type"),
            "transaction_parsed_type": doc.get("transaction_parsed_type"),
            "created_at": doc.get("created_at"),
            "updated_at": doc.get("updated_at")
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching document status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/documents/{document_id}/transactions")
async def get_document_transactions(document_id: int):
    """
    Get extracted transactions for a document (both CODE and LLM results)

    Args:
        document_id: ID of the document

    Returns:
        Staging transactions with CODE and LLM results
    """
    try:
        transactions = get_staging_transactions(document_id)

        if not transactions:
            return {
                "document_id": document_id,
                "transactions": [],
                "message": "No transactions found. Document may still be processing."
            }

        # Separate CODE and LLM results
        code_results = [t for t in transactions if t.get("parser_type") == "CODE"]
        llm_results = [t for t in transactions if t.get("parser_type") == "LLM"]

        return {
            "document_id": document_id,
            "code_results": code_results,
            "llm_results": llm_results,
            "total_code": len(code_results),
            "total_llm": len(llm_results)
        }
    except Exception as e:
        logger.error(f"Error fetching transactions: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/documents/recent")
async def get_recent_documents(limit: int = 20, user_id: Optional[int] = None):
    """
    Get recent documents

    Args:
        limit: Maximum number of documents to return
        user_id: Optional user ID filter

    Returns:
        List of recent documents
    """
    try:
        supabase = get_client()
        query = supabase.table("documents").select("*").order("created_at", desc=True).limit(limit)

        if user_id:
            query = query.eq("user_id", user_id)

        result = query.execute()

        return {
            "documents": result.data,
            "count": len(result.data)
        }
    except Exception as e:
        logger.error(f"Error fetching recent documents: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/documents/{document_id}/approve")
async def approve_transactions(
    document_id: int,
    account_id: int = Form(...),
    selected_parser: str = Form(...)
):
    """
    Approve transactions and move them to uncategorized_transactions

    Args:
        document_id: ID of the document
        account_id: Account to link transactions to
        selected_parser: Which parser result to use ("CODE" or "LLM")

    Returns:
        Approval status
    """
    try:
        if selected_parser not in ["CODE", "LLM"]:
            raise HTTPException(status_code=400, detail="selected_parser must be 'CODE' or 'LLM'")

        # Get staging transactions for selected parser
        transactions = get_staging_transactions(document_id)
        selected_txns = [t for t in transactions if t.get("parser_type") == selected_parser]

        if not selected_txns:
            raise HTTPException(status_code=404, detail=f"No {selected_parser} transactions found")

        supabase = get_client()

        # Insert into uncategorized_transactions
        for txn in selected_txns:
            txn_data = txn.get("transaction_json", {})

            insert_data = {
                "user_id": get_document(document_id).get("user_id"),
                "account_id": account_id,
                "document_id": document_id,
                "staging_transaction_id": txn.get("staging_transaction_id"),
                "txn_date": txn_data.get("date"),
                "debit": txn_data.get("debit"),
                "credit": txn_data.get("credit"),
                "balance": txn_data.get("balance"),
                "details": txn_data.get("details")
            }

            supabase.table("uncategorized_transactions").insert(insert_data).execute()

        # Update document status
        supabase.table("documents").update({
            "status": "APPROVED",
            "transaction_parsed_type": selected_parser
        }).eq("document_id", document_id).execute()

        return {
            "status": "approved",
            "document_id": document_id,
            "transactions_approved": len(selected_txns),
            "parser_used": selected_parser
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving transactions: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
