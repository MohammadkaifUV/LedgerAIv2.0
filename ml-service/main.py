from contextlib import asynccontextmanager
import os
import re

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
import spacy
from sentence_transformers import SentenceTransformer
import uvicorn

from logger import get_logger

logger = get_logger("ml-service")


def clean_fallback_text(text: str) -> str:
    sanitized = re.sub(r"[^a-zA-Z0-9\s]", " ", text or "")
    sanitized = re.sub(r"\s+", " ", sanitized).strip()
    return sanitized or (text or "").strip() or "UNKNOWN"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run once before start: python -m spacy download en_core_web_sm
    logger.info("Loading spaCy model: en_core_web_sm")
    app.state.nlp = spacy.load("en_core_web_sm")
    logger.info("Loading SentenceTransformer model: all-MiniLM-L6-v2")
    app.state.embedder = SentenceTransformer("all-MiniLM-L6-v2")
    logger.info("ML models loaded successfully")
    yield
    logger.info("Shutting down ML service")


app = FastAPI(lifespan=lifespan)


class TextRequest(BaseModel):
    text: str


@app.post("/ner")
async def get_ner(payload: TextRequest, request: Request):
    logger.debug(f"NER request received: {payload.text[:100]}")
    nlp = request.app.state.nlp
    doc = nlp(payload.text)

    first_match = next((ent.text.strip() for ent in doc.ents if ent.label_ in {"ORG", "PRODUCT"} and ent.text.strip()), None)
    if first_match:
        logger.info(f"NER match found: {first_match}")
        return {"merchant_name": first_match}

    fallback = clean_fallback_text(payload.text)
    logger.info(f"NER fallback used: {fallback[:50]}")
    return {"merchant_name": fallback}


@app.post("/embed")
async def get_embed(payload: TextRequest, request: Request):
    logger.debug(f"Embedding request received: {payload.text[:100]}")
    embedder = request.app.state.embedder

    try:
        embedding_vector = embedder.encode(payload.text)
        embedding_list = [float(val) for val in embedding_vector.tolist()]
        logger.info(f"Embedding generated successfully (dim: {len(embedding_list)})")
        return {"embedding": embedding_list}
    except Exception as exc:
        logger.error(f"Embedding generation failed: {str(exc)}")
        raise HTTPException(status_code=500, detail=f"Embedding generation failed: {str(exc)}")


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    logger.info(f"Starting ML service on port {port}")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
