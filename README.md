# Documentacion Arconte

Plataforma interna de documentacion y seguimiento de tareas para el equipo de CV trabajando en **Arconte Retail** y proyectos relacionados.

## Stack

- **Backend:** FastAPI + Uvicorn (Python 3.11)
- **Frontend:** SPA multipagina en HTML/CSS/JS vanilla (sin frameworks)
- **Datos:** JSON + XLSX como fuente de verdad del roadmap
- **Email:** Resend (notificaciones)

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

La app queda en **http://localhost:8090** (version multipagina v2).

## Correr sin Docker

```bash
# Instalar dependencias
pip install -r requirements.txt

# Version v2 (multipagina) — puerto 8090
python main_v2.py

# Version v1 (SPA monolitica) — puerto 8080
python main.py
```

## Estructura del proyecto

```
.
├── main.py                 # Servidor FastAPI v1 (puerto 8080)
├── main_v2.py              # Servidor FastAPI v2 multipagina (puerto 8090)
├── roadmap_parser.py       # Parser XLSX → roadmap.json
├── config.json             # Usuarios, tokens, credenciales email
├── docker-compose.yml      # Configuracion Docker
├── Dockerfile              # Imagen Python 3.11-slim
├── requirements.txt        # Dependencias Python
│
├── inicio.html             # Landing page (v2)
├── index.html              # SPA original (v1)
├── organigrama.html        # Organigrama del equipo
├── vision.html             # Vision del proyecto
├── proyectos.html          # Proyectos del equipo
├── tareas.html             # Gestion de tareas
├── planificador.html       # Planificador/roadmap
├── bitacora.html           # Bitacora de acuerdos
├── dashboard.html          # Dashboard de metricas
│
├── assets/                 # CSS, JS, imagenes compartidas
├── solutions/              # Reportes HTML generados
├── RoadMaps/               # Archivos XLSX fuente del roadmap
│
├── estado.json             # Estado de tareas completadas
├── roadmap.json            # Roadmap generado desde Excel
├── roadmap_edits.json      # Ediciones manuales (overrides)
├── projects.json           # Metadata de proyectos
├── solutions_meta.json     # Metadata de reportes
├── audit.json              # Log de auditoria
└── votes.json              # Votaciones
```

## API endpoints

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/api/roadmap` | Datos del roadmap |
| GET/POST | `/api/estado` | Tareas completadas |
| GET/POST | `/api/edits` | Ediciones del roadmap |
| GET/POST | `/api/projects` | Proyectos |
| POST | `/api/reload` | Re-parsear XLSX → roadmap.json |
| POST | `/api/verify-token` | Autenticacion |
| POST | `/api/notify` | Notificaciones por email |

## Autenticacion

Token-based. Los tokens de usuario estan en `config.json` bajo `users`. Token admin fallback: `cv2026`.

## Notas

- El volumen Docker monta el directorio actual, asi que cambios en codigo se reflejan con `docker compose restart` (sin rebuild).
- Si cambian las semanas del sprint (S3-S12), hay que actualizar el diccionario hardcodeado en `roadmap_parser.py`.
- La persistencia es 100% en archivos JSON, no hay base de datos.
