FROM python:3.11-slim

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*

COPY kal_api/requirements.railway.txt /app/kal_api/requirements.railway.txt
COPY kal_mlb/requirements.railway.txt /app/kal_mlb/requirements.railway.txt
RUN pip install --no-cache-dir -r /app/kal_api/requirements.railway.txt && \
    pip install --no-cache-dir -r /app/kal_mlb/requirements.railway.txt || true

COPY kal_api /app/kal_api
COPY kal_mlb /app/kal_mlb

ENV PYTHONUNBUFFERED=1
ENV PORT=8000
EXPOSE 8000

CMD ["uvicorn", "kal_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
