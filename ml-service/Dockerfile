# Use a slim Python base
FROM python:3.11-slim

WORKDIR /app

# Install system deps needed by spaCy
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the spaCy model so it's baked into the image
RUN python -m spacy download en_core_web_sm

# Pre-cache SentenceTransformers model
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

# Copy source
COPY main.py .

EXPOSE $PORT

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-5000}
