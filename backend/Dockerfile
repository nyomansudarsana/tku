# Hugging Face Spaces — Docker SDK
# Port 7860 is required by HF Spaces.
# SQLite database is persisted at /data/tku.db (HF persistent storage).

FROM python:3.11-slim

WORKDIR /app

# Install dependencies first (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# HF Spaces requires port 7860
EXPOSE 7860

# Make startup script executable
RUN chmod +x start.sh

CMD ["./start.sh"]
