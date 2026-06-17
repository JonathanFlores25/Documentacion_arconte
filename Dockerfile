FROM python:3.11-slim

# Evita .pyc y buffering de stdout para que los logs aparezcan en docker logs
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Instala dependencias en tiempo de build (no van al volumen montado)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# El código fuente y los datos llegan por el volumen montado en docker-compose.
# No se copia nada más aquí — así git pull + restart aplica cambios sin rebuild.
