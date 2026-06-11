# DocumentacionCV_Celestial — Contexto para Claude

Plataforma interna de documentación y seguimiento de tareas para el equipo de CV trabajando en **Arconte Retail** y proyectos relacionados.

## Stack tecnológico

- **Backend:** FastAPI + Uvicorn, Python 3, openpyxl, resend
- **Frontend:** SPA en HTML/CSS/JS vanilla (`index.html`, 3789 líneas, sin frameworks)
- **Datos:** JSON (estado, edits, roadmap, projects) + XLSX como fuente de verdad del roadmap
- **Puerto:** 8080, binding 0.0.0.0 (accesible en red local)

## Archivos clave

| Archivo | Rol |
|---|---|
| `main.py` | Servidor FastAPI completo (286 líneas) |
| `roadmap_parser.py` | Parser de .xlsx → roadmap.json (230 líneas) |
| `index.html` | SPA frontend completa (3789 líneas) |
| `config.json` | Usuarios, tokens, credenciales email |
| `estado.json` | Persistencia del estado de tareas completadas |
| `roadmap.json` | Roadmap generado desde Excel |
| `roadmap_edits.json` | Ediciones manuales desde la UI (overrides) |
| `projects.json` | Metadata de proyectos del equipo |

## API endpoints principales

- `GET /api/roadmap` — datos del roadmap
- `GET/POST /api/estado` — tareas completadas
- `GET/POST /api/edits` — ediciones del roadmap
- `GET/POST /api/projects` — proyectos
- `POST /api/reload` — re-parsear XLSX → roadmap.json
- `POST /api/verify-token` — autenticación de usuario
- `POST /api/notify` — notificaciones por email (Resend)
- `GET /` — sirve index.html

## Autenticación

Token-based. Los tokens están en `config.json` bajo `users`. Token admin fallback: `"cv2026"`. Se verifica en frontend con modal y en backend con `/api/verify-token`.

## Modelo de datos del roadmap

```
arconte_retail:
  phases[]: {title, status, start_iso, end_iso, tasks[]}
    tasks[]: {id, area, description, responsible, done_xlsx}
  acuerdos[]: {session, iso_date, hora, display, items[]}
    items[]: {text, responsible, status, date}
```

**Areas:** PM, Infra, AI Eng, Datos, Frontend
**Status roadmap:** active, done, paused, continuous
**Status acuerdos:** COMPLETADO, EN PROCESO, PENDIENTE, CANCELADO

## Semanas hardcodeadas en el parser

El mapeo S3–S12 está hardcodeado en `roadmap_parser.py`. Si cambia el año o las fechas del sprint, hay que actualizar ese diccionario.

Rango actual: S3 = 2026-04-20 → S12 = 2026-06-27

## Equipo y carpetas de documentación

- `Jonathan/` — Docs de proyectos CV: AutoPartes, Incendio, Pelea, ReID, REID-Semantico, Roi-REID
- `Roy/Archivo/` — Resumen de trabajo (app React compilada)
- `Israel/`, `Selene/` — Carpetas vacías (pendientes de documentar)

## Persistencia

Sin base de datos. Todo en JSON. Escritura atómica (patrón .tmp → rename). El XLSX (`RoadMaps/`) es la fuente de verdad; se parsea con `POST /api/reload`. Los overrides manuales van a `roadmap_edits.json`.

## Iniciar el servidor

```bash
python main.py
```
