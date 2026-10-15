# Reproducible single-container build: Vite static files plus the FastAPI API.
FROM node:22.14.0-bookworm-slim AS frontend-build

WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN VITE_PUBLIC_API_URL= VITE_API_URL= npm run build

FROM python:3.12.9-slim-bookworm AS python-dependencies

WORKDIR /app/backend
COPY backend/requirements.lock ./requirements.lock
RUN python -m pip install --no-cache-dir -r requirements.lock

FROM python:3.12.9-slim-bookworm AS test

WORKDIR /app
COPY --from=python-dependencies /usr/local /usr/local
COPY --from=frontend-build /src/frontend/node_modules /app/frontend/node_modules
COPY backend ./backend
COPY frontend ./frontend
COPY tools ./tools
RUN python -m compileall backend/app \
    && (cd backend && python -m unittest discover -s tests -p "test_*.py") \
    && python -m unittest discover -s tools/calibration -p "test_*.py" \
    && npm --prefix frontend test \
    && npm --prefix frontend run build

FROM python:3.12.9-slim-bookworm AS runtime

WORKDIR /app/backend
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    NUTRI_SCAN_DB=/data/nutri_scan.sqlite3 \
    NUTRI_SCAN_COOKIE_SECURE=false \
    NUTRI_SCAN_STATIC_DIR=/app/frontend-dist

COPY --from=python-dependencies /usr/local /usr/local
COPY backend ./
COPY --from=frontend-build /src/frontend/dist /app/frontend-dist
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /data \
    && chown -R appuser:appuser /app /data
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
