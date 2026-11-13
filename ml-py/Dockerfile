# What-If AI Python ML Service (econometrics, ingestion, column mapping, NLQ)
# Build from repository root context:
#   docker build -f ml-py/Dockerfile -t whatif-ml-py .

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app/ml-py:/app

WORKDIR /app/ml-py

# Install Python package dependencies first for better Docker layer caching
COPY ml-py/pyproject.toml /app/ml-py/pyproject.toml
RUN mkdir -p /app/ml-py/app \
    && pip install --upgrade pip \
    && pip install .

# Copy ML service, FX currency config, and synthetic VN retail datasets/calendar
COPY ml-py/app /app/ml-py/app
COPY config /app/config
COPY data/synthetic /app/data/synthetic
COPY contracts /app/contracts

# Ensure relative config/fx.json lookups resolve cleanly from /app/ml-py as well
RUN ln -sfn /app/config /app/ml-py/config \
    && mkdir -p /app/ml-py/workdir \
    && groupadd --system appgroup \
    && useradd --system --gid appgroup --home-dir /app/ml-py appuser \
    && chown -R appuser:appgroup /app/ml-py

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

