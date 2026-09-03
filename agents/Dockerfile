FROM python:3.11-slim

WORKDIR /app

# Ensure shared/ and agents/ are importable even when agents are volume-mounted.
ENV PYTHONPATH=/app:/app/agents

# System deps for spaCy, Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ curl \
    && rm -rf /var/lib/apt/lists/*

COPY agents/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Download spaCy model
RUN python -m spacy download en_core_web_sm

# Copy shared base + all agents
COPY . .

RUN adduser --disabled-password --gecos "" appuser
USER appuser
