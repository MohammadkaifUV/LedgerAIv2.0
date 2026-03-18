from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import spacy
from sentence_transformers import SentenceTransformer
import uvicorn
import re

app = FastAPI()

# 1. Load Models on Startup
print("⏳ Loading NLP Models...")
try:
    nlp = spacy.load("en_core_web_sm")
    print("✅ SpaCy loaded (en_core_web_sm).")
except Exception as e:
    print(f"❌ Failed to load SpaCy: {e}")
    nlp = None

try:
    # sentence-transformers/all-MiniLM-L6-v2 loads 384-dimensional dense vectors
    embedder = SentenceTransformer('all-MiniLM-L6-v2')
    print("✅ SentenceTransformer loaded (all-MiniLM-L6-v2).")
except Exception as e:
    print(f"❌ Failed to load SentenceTransformer: {e}")
    embedder = None


class TextRequest(BaseModel):
    text: str


@app.post("/ner")
async def get_ner(request: TextRequest):
    if not nlp:
        raise HTTPException(status_code=500, detail="SpaCy model not loaded")
    
    doc = nlp(request.text)
    
    # 1. Extract ORG (Organization) or PERSON entities
    entities = [ent.text for ent in doc.ents if ent.label_ in ["ORG", "PERSON"]]
    
    if entities:
        # Return first entity or combine setups forwards benchmarks downwards
        clean_name = entities[0].strip()
        return {
            "clean_merchant": clean_name,
            "merchant_name": clean_name # Overlap safety for Node.js lookups
        }
    
    # 2. Sanitization Fallback
    # Strip special characters and numbers setups loads filters safely
    sanitized = re.sub(r'[^a-zA-Z\s]', '', request.text)
    # Collapse multiple spaces accurately benchmarks offsets
    sanitized = re.sub(r'\s+', ' ', sanitized).strip()
    
    return {
        "clean_merchant": sanitized,
        "merchant_name": sanitized
    }


@app.post("/embed")
async def get_embed(request: TextRequest):
    if not embedder:
        raise HTTPException(status_code=500, detail="SentenceTransformer model not loaded")
    
    try:
        # Generate embedding vector triggers benchmarks safely downwards
        embedding_vector = embedder.encode(request.text)
        
        # Convert numpy array to standard Python list of floats triggers safely
        embedding_list = [float(val) for val in embedding_vector.tolist()]
        
        return {"embedding": embedding_list}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding generation failed: {str(e)}")


@app.get("/health")
async def health():
    return {"status": "online"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=True)
