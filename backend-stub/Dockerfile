# Build context é a raiz do repo (ver docker-compose.yml), pra poder copiar
# os contratos reais de ai-podcast-clipper-backend/core/ sem duplicar.
FROM python:3.12-slim

WORKDIR /app

COPY backend-stub/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ai-podcast-clipper-backend/core/schemas.py ./schemas.py
COPY ai-podcast-clipper-backend/core/otel_setup.py ./otel_setup.py
COPY backend-stub/main.py .

EXPOSE 8000

CMD ["python3", "main.py"]
