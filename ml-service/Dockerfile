# Hugging Face Spaces requires python base + port 7860
FROM python:3.11-slim

# HF Spaces runs as non-root user 1000
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app

# Install system deps needed by spaCy (as root briefly)
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*
USER user

# Install Python dependencies
COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download spaCy model into image
RUN python -m spacy download en_core_web_sm

# Pre-cache SentenceTransformers model into image
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

# Copy source
COPY --chown=user main.py .

EXPOSE 7860

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]

