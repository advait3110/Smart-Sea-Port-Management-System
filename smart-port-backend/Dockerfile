# =========================================================
# BACKEND IMAGE - FastAPI + ML (Python 3.14)
# =========================================================

FROM python:3.14-slim

# Show logs immediately (needed for CloudWatch later), no .pyc files.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# XGBoost needs the OpenMP library (libgomp1); the slim image lacks it.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgomp1 \
 && rm -rf /var/lib/apt/lists/*

# Run as a normal user, not root (safer). UID 1000 matches the
# default "ubuntu" user on the EC2 server.
RUN groupadd --gid 1000 appuser \
 && useradd --uid 1000 --gid 1000 --create-home appuser

WORKDIR /app

# Install packages first (Docker re-uses this step when only code changes).
COPY requirements.txt .
RUN pip install -r requirements.txt

# Copy the application code (.dockerignore keeps secrets and data out).
COPY . .

# Folders for saved data (Docker volumes are attached here).
RUN mkdir -p /app/ml_models /app/ais_state \
 && chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

# ONE worker on purpose: the AISStream collector runs inside the app,
# and two workers would start two collectors writing the same file.
# --proxy-headers: Audit Logs record the user's real IP, not Nginx's.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--proxy-headers", "--forwarded-allow-ips", "*"]