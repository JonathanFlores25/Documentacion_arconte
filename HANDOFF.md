# HANDOFF — Estado del proyecto para continuar en otra máquina

> **Para el Claude de la otra PC / servidor:** lee este archivo completo antes de
> hacer nada. Lee también `CLAUDE.md`.
> Última actualización: **2026-07-15** (refactor a plataforma informativa).

---

## 1. Qué es esto

Plataforma interna **informativa** del equipo de CV (Arconte Retail y proyectos
relacionados). FastAPI + frontend HTML/JS vanilla. Sin base de datos: **todo se
persiste en archivos JSON** dentro de la carpeta del proyecto. Detalle completo
del stack en `CLAUDE.md`.

**Un solo servidor:**
- `python main.py` → puerto **8090**, sirve `inicio.html` + páginas + `/api/*`.

En 2026-07-15 se refactorizó todo: se eliminó el seguimiento de tareas
(checkboxes, cierres con evidencia, planificador, vista semanal, bitácora,
votaciones, notificaciones por email, uploads y el flujo xlsx). La plataforma
quedó como documentación read-only, con edición de contenido informativo
(proyectos, métricas, modelos, cámaras) solo para admins con token.

**Ya está en producción y se está consumiendo.** No se puede perder data.

---

## 2. 🔴 LO MÁS IMPORTANTE: los datos viven en archivos sueltos

Archivos/carpetas con la **información viva**. Tratarlos como datos (no como
código) y nunca borrarlos ni meterlos dentro de una imagen Docker:

- `projects.json`        — fuente de verdad: proyectos, roadmaps, acuerdos, modelos, métricas
- `solutions_meta.json`  — índice de evidencias
- `config.json`          — **SECRETO**: tokens de usuarios y credenciales Full_CV (bloqueado en HTTP por `main.py`)
- `solutions/`           — archivos de evidencia (reportes HTML, videos)
- `fullcv_cache.json`    — caché del catálogo de Full_CV (regenerable; ignorado por git)
- `infra.json`           — infraestructura (servidores, despliegues, cámaras), editable desde el sitio

> ⚠️ **OJO con git:** lo versionado puede diferir de los archivos reales en
> disco. La data buena son los archivos en disco. Al mover de máquina, copiar
> por scp/rsync, NO confiar solo en `git clone`. Hay respaldos con fecha en
> `backups/` (ignorada por git); se generan con `bash backup.sh`.

---

## 3. Despliegue

```bash
docker compose up -d          # servicio cv-docs, puerto 8090, restart unless-stopped
docker compose up -d --build  # si cambió requirements.txt
```

- El código y los datos se montan por volumen (`.:/app`): `git pull` +
  `docker compose restart` aplica cambios sin rebuild.
- Respaldo por cron sugerido: `0 */6 * * * /ruta/backup.sh >> /ruta/backups/backup.log 2>&1`

---

## 4. Notas técnicas útiles

- Escritura de JSON es atómica (patrón `.tmp` → `replace`).
- Token admin fallback: `cv2026`. Usuarios/tokens reales en `config.json`.
- `POST /api/projects` exige un token válido en el body (`{data, token}`).
- `assets/*` y los `.html` se editan a mano; no existe build step.
- Los estados `done` de tareas dentro de `projects.json` son historial congelado
  (se muestran read-only); no hay endpoints para modificarlos.

## 5. Integración Full_CV (2026-07-16)

La doc muestra un **catálogo de modelos vivo** leído de Full_CV (FastAPI :8000,
mismo servidor). Detalle en `CLAUDE.md`. Lo operativo:

- `GET /api/fullcv/catalog` consulta `FULLCV_URL/api/models` server-side y
  cachea en `fullcv_cache.json`; si Full_CV está apagado se sirve el caché
  (el frontend muestra chip ámbar con la fecha).
- En Docker la URL viene de la env `FULLCV_URL` (docker-compose ya trae
  `host.docker.internal:8000` + `extra_hosts`). Smoke test desde el contenedor:
  `curl http://host.docker.internal:8000/api/models`.
- Bench profiles (VRAM): opcional. Configurar en `config.json.fullcv` un
  `profiles_dir` (ruta a `data/profiles` de Full_CV) **o** `username`/`password`
  de un admin de Full_CV (login programático, re-login automático).
- Nota: el catálogo re-publica métricas de bench que en Full_CV son admin-only;
  aceptado por ser LAN interna.
- Los modelos vinculados en `projects.json` solo agregan `fullcv_id`
  (+`linked_by`, `linked_at`); los campos manuales nunca se sobreescriben.

---

## 6. Cómo retomar

En la otra PC, con el repo clonado y los datos copiados:

```
python main.py        # :8090
```
