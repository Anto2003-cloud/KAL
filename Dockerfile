FROM python:3.11-slim

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*

COPY api/requirements.txt /app/api/requirements.txt
COPY kal_mlb/requirements.txt /app/kal_mlb/requirements.txt
RUN pip install --no-cache-dir -r /app/api/requirements.txt && \
    pip install --no-cache-dir -r /app/kal_mlb/requirements.txt || true

COPY api /app/api
COPY kal_mlb /app/kal_mlb

ENV PYTHONUNBUFFERED=1
ENV PORT=8000
EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
