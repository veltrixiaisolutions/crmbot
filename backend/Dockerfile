FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

RUN mkdir -p /app/uploads && useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8040

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8040"]
