# HANDOFF — Estado del proyecto para continuar en otra máquina

> **Para el Claude de la otra PC / servidor:** lee este archivo completo antes de
> hacer nada. Resume dónde quedamos y qué falta. Lee también `CLAUDE.md`.
> Última actualización: **2026-06-17**.

---

## 1. Qué es esto

Plataforma interna de documentación/seguimiento del equipo de CV (Arconte Retail).
FastAPI + frontend HTML/JS vanilla. Sin base de datos: **todo se persiste en
archivos JSON** dentro de la carpeta del proyecto. Detalle completo del stack en
`CLAUDE.md`.

Dos servidores que comparten la misma `app`:
- `python main.py`     → puerto **8080**, sirve `index.html` (versión actual).
- `python main_v2.py`  → puerto **8090**, sirve `inicio.html` (versión nueva multipágina).

**Ya está en producción y se está consumiendo.** No se puede perder data.

---

## 2. 🔴 LO MÁS IMPORTANTE: los datos viven en archivos sueltos

Estos son los archivos/carpetas con la **información viva**. Hay que tratarlos
como datos (no como código) y nunca borrarlos ni meterlos dentro de una imagen
Docker:

- `projects.json`        — metadata y roadmaps de proyectos del equipo
- `estado.json`          — tareas completadas
- `roadmap.json`         — roadmap generado desde el xlsx
- `roadmap_edits.json`   — ediciones manuales del roadmap
- `votes.json`           — propuestas/votaciones de borrado
- `solutions_meta.json`  — metadata de evidencias subidas
- `audit.json`           — bitácora de auditoría
- `config.json`          — **SECRETO**: tokens de usuarios + API key de Resend (email)
- `solutions/`           — archivos de evidencia subidos por los usuarios
- `RoadMaps/`            — el .xlsx fuente del roadmap

> ⚠️ **OJO con git:** el commit "Clean v1" (e0d2070) **reseteó/vació** varios de
> estos JSON en el repo. Es decir, lo que está versionado en git puede estar
> **vacío**. La data buena son los archivos reales en disco de la PC origen.
> Al mover a otra máquina hay que **copiar los archivos reales por scp/rsync**,
> NO confiar en el `git clone`. (Hay copias `projects.json.bak`..`.bak5` como
> respaldos manuales antiguos.)

---

## 3. Objetivo / hacia dónde vamos

El usuario va a **mover todo a un servidor** para dejarlo corriendo de forma
permanente (hoy se cae si se cierra la terminal de Windows). Plan acordado:

1. **Dockerizar** con los datos en un **volumen montado** (fuera del contenedor)
   para que reconstruir la imagen nunca borre nada, y con `restart: unless-stopped`
   para que sobreviva reinicios del servidor.
2. **Script de respaldo** (cron) que cada X horas copie todos los JSON +
   `solutions/` + `RoadMaps/` a una carpeta con fecha.
3. (Después, con calma) **Reorganizar** la estructura del proyecto sin perder data.

Preferencias del usuario aún por confirmar en la otra máquina:
- Tipo(s) de respaldo: copias locales / push a git / nube / snapshot antes de
  cada borrado. (Se le preguntó pero decidió mover al servidor antes de elegir.)
- Host definitivo (servidor Linux / VM, etc.).

---

## 4. Próximos pasos sugeridos (en el servidor)

- [ ] Confirmar que los archivos de datos de la sección 2 llegaron **con contenido**
      (no vacíos). Verificar `projects.json` sobre todo.
- [ ] Crear `Dockerfile` (Python 3 + `requirements.txt` + uvicorn).
- [ ] Crear `docker-compose.yml`:
      - servicio para `main.py` (8080) y/o `main_v2.py` (8090);
      - **volumen** montando los JSON, `solutions/`, `RoadMaps/`, `config.json`
        desde el host (no copiados a la imagen);
      - `restart: unless-stopped`.
- [ ] `.dockerignore` que excluya `__pycache__/`, `.venv`, los `*.bak`, etc.
- [ ] Script de backup + cron.
- [ ] Sacar `config.json` del control de versiones si se va a usar repo público
      (tiene la API key de Resend y los tokens). Considerar `.env`.

---

## 5. Notas técnicas útiles

- **Error `ConnectionResetError [WinError 10054]` al arrancar:** es **cosmético y
  solo de Windows** (bug del ProactorEventLoop de asyncio cuando un cliente cierra
  la conexión de golpe). No afecta al servidor y **no aparece en Linux** (usa
  SelectorEventLoop). Al pasar al servidor Linux desaparece solo.
- Escritura de JSON es atómica (patrón `.tmp` → `replace`). Bien.
- El roadmap xlsx (`RoadMaps/`) es la fuente de verdad; se re-parsea con
  `POST /api/reload` o subiendo archivo en `POST /api/upload-roadmap`.
- Token admin fallback: `cv2026`. Usuarios/tokens reales en `config.json`.
- `assets/*` son la fuente viva de la versión v2; **no** correr `build_pages.py`.

---

## 6. Cómo retomar

En la otra PC, con el repo ya clonado y los datos copiados:

```
python main.py        # versión actual, :8080
# o
python main_v2.py     # versión nueva, :8090
```

Y a Claude le basta con: **"lee HANDOFF.md y continuemos con la dockerización"**.
