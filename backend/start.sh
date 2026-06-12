#!/bin/bash
set -e

# Use DATABASE_URL from environment, defaulting to persistent storage at /data
export DATABASE_URL=${DATABASE_URL:-sqlite:////data/tku.db}

# Ensure the directory for the database file exists
DB_FILE="${DATABASE_URL#sqlite:///}"
mkdir -p "$(dirname "$DB_FILE")"

# On first run (no DB file yet), seed initial data
if [ ! -f "$DB_FILE" ]; then
    echo "[start] Database not found at $DB_FILE — running initial seed..."
    python seed.py
    echo "[start] Seed complete."
fi

echo "[start] Starting uvicorn on port 7860..."
exec uvicorn app.main:app --host 0.0.0.0 --port 7860 --workers 1
