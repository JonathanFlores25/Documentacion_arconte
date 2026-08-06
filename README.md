# Documentacion Arconte

Plataforma interna **informativa** del equipo de CV: documenta el estado de la infraestructura, los proyectos (Arconte Retail y relacionados), sus roadmaps historicos, el organigrama y las evidencias de avances. El seguimiento activo de tareas se lleva en otra herramienta.

## Stack

- **Backend:** FastAPI + Uvicorn (Python 3.11)
- **Frontend:** Paginas HTML/CSS/JS vanilla (sin frameworks) con assets compartidos
- **Datos:** JSON (sin base de datos)

## Requisitos

- Docker y Docker Compose **o** Python 3.11+

## Correr con Docker (recomendado)

```bash
# Levantar (la primera vez hace build automaticamente)
docker compose up -d

# Ver logs
docker compose logs -f

# Detener
docker compose down

# Rebuild (si cambiaste requirements.txt)
docker compose up -d --build
```

La app queda en **http://localhost:8090**.

## Correr sin Docker

```bash
pip install -r requirements.txt
python main.py        # puerto 8090
```

## Estructura del proyecto

```
.
├── main.py                 # Servidor FastAPI (puerto 8090)
├── config.json             # Usuarios y tokens
├── docker-compose.yml      # Configuracion Docker
├── Dockerfile              # Imagen Python 3.11-slim
├── requirements.txt        # Dependencias Python
├── backup.sh               # Respaldo de datos vivos a backups/
│
├── inicio.html             # Dashboard general (pagina raiz)
├── organigrama.html        # Organigrama del equipo
├── vision.html             # Vision del equipo
├── proyectos.html          # Proyectos: roadmaps, metricas, modelos, evidencias
│
├── assets/                 # app.js, app.css, chrome.html (header/nav/modales)
├── solutions/              # Evidencias de avances (reportes HTML, videos)
│
├── projects.json           # Datos de proyectos (fuente de verdad)
└── solutions_meta.json     # Indice de evidencias por tarea/acuerdo
```

## API endpoints

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/api/projects` | Datos de proyectos |
| POST | `/api/projects` | Guardar proyectos (requiere token valido) |
| POST | `/api/verify-token` | Autenticacion |
| GET | `/api/solutions` | Indice de evidencias |
| GET | `/solutions/{archivo}` | Sirve un archivo de evidencia |

## Autenticacion

Token-based. Los tokens de usuario estan en `config.json` bajo `users`. Token admin fallback: `cv2026`. El sitio es de lectura publica en red local; con token de admin se puede editar el contenido informativo (proyectos, metricas, modelos, camaras).

## Notas

- El volumen Docker monta el directorio actual, asi que cambios en codigo se reflejan con `docker compose restart` (sin rebuild).
- La persistencia es 100% en archivos JSON, no hay base de datos. Los datos vivos (`projects.json`, `solutions_meta.json`, `solutions/`) viven en disco; respaldalos con `bash backup.sh`.
- `config.json` nunca se sirve por HTTP (bloqueado en `main.py`).
