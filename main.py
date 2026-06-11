"""
main.py
-------
Servidor FastAPI para la documentación del equipo de CV.

Arranca con:
    python main.py

Acceso en red local:
    http://<IP-de-esta-PC>:8080
"""

import json
import mimetypes
import re
import resend
from pathlib import Path
from datetime import datetime

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import uvicorn

BASE_DIR        = Path(__file__).parent
ESTADO_FILE     = BASE_DIR / "estado.json"
ROADMAP_FILE    = BASE_DIR / "roadmap.json"
EDITS_FILE      = BASE_DIR / "roadmap_edits.json"
PROJECTS_FILE   = BASE_DIR / "projects.json"
CONFIG_FILE     = BASE_DIR / "config.json"
VOTES_FILE      = BASE_DIR / "votes.json"
SOLUTIONS_DIR   = BASE_DIR / "solutions"
SOLUTIONS_META  = BASE_DIR / "solutions_meta.json"

# ── Config ────────────────────────────────────────────────────────────────────

def load_config() -> dict:
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"admin_token": "cv2026", "notify_emails": [], "smtp": {}}


def send_email(subject: str, body: str) -> None:
    cfg     = load_config()
    api_key = cfg.get("resend_api_key", "")
    tos     = cfg.get("notify_emails", [])
    if not tos or not api_key:
        return
    resend.api_key = api_key
    resend.Emails.send({
        "from":    "onboarding@resend.dev",
        "to":      tos,
        "subject": subject,
        "html":    body.replace("\n", "<br>"),
    })


# ── Helpers de estado ─────────────────────────────────────────────────────────

def load_estado() -> dict:
    if ESTADO_FILE.exists():
        try:
            return json.loads(ESTADO_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"tasks": {}}


def save_estado(data: dict) -> None:
    tmp = ESTADO_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(ESTADO_FILE)


def load_edits() -> dict:
    if EDITS_FILE.exists():
        try:
            return json.loads(EDITS_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def load_projects() -> dict:
    if PROJECTS_FILE.exists():
        try:
            return json.loads(PROJECTS_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_projects(data: dict) -> None:
    tmp = PROJECTS_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(PROJECTS_FILE)


def save_edits_file(data: dict) -> None:
    tmp = EDITS_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(EDITS_FILE)


def load_votes() -> dict:
    if VOTES_FILE.exists():
        try:
            return json.loads(VOTES_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"proposals": []}


def save_votes(data: dict) -> None:
    tmp = VOTES_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(VOTES_FILE)


def execute_roadmap_deletion(project: str) -> None:
    """Elimina el roadmap de un proyecto tras alcanzar el consenso de votos."""
    # Siempre limpia projects.json para cualquier proyecto
    projects = load_projects()
    if project in projects:
        projects[project]["phases"]       = []
        projects[project]["sprint_tasks"] = {}
        projects[project]["acuerdos"]     = []
        save_projects(projects)

    if project == "arconte_retail":
        # Además limpia roadmap.json (roadmap xlsx) y sus edits
        if ROADMAP_FILE.exists():
            try:
                roadmap = json.loads(ROADMAP_FILE.read_text(encoding="utf-8"))
            except Exception:
                roadmap = {}
            roadmap["arconte_retail"] = {"phases": [], "acuerdos": []}
            tmp = ROADMAP_FILE.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(roadmap, indent=2, ensure_ascii=False), encoding="utf-8")
            tmp.replace(ROADMAP_FILE)
        edits = load_edits()
        edits["arconte_retail"] = {
            "added_tasks": [], "deleted_ids": [], "phase_shifts": {},
            "acuerdos_edits": {"status_overrides": {}, "deleted_items": [], "added_items": [], "added_sessions": []}
        }
        save_edits_file(edits)
        # Limpia tareas de estado que empiecen con retail_
        estado = load_estado()
        estado["tasks"] = {k: v for k, v in estado["tasks"].items() if not k.startswith("retail_")}
        save_estado(estado)
    else:
        # Limpia tareas de estado para el proyecto
        estado = load_estado()
        estado["tasks"] = {k: v for k, v in estado["tasks"].items() if not k.startswith(f"{project}_")}
        save_estado(estado)


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="CV Celestial Docs", docs_url=None, redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── API routes ────────────────────────────────────────────────────────────────

@app.get("/api/roadmap")
def get_roadmap():
    if not ROADMAP_FILE.exists():
        raise HTTPException(status_code=404, detail="roadmap.json no generado aún")
    return JSONResponse(json.loads(ROADMAP_FILE.read_text(encoding="utf-8")))


@app.get("/api/estado")
def get_estado():
    return JSONResponse(load_estado())


class TaskUpdate(BaseModel):
    done: bool


@app.post("/api/estado/{task_id}")
def update_task(task_id: str, body: TaskUpdate):
    estado = load_estado()
    estado["tasks"][task_id] = body.done
    save_estado(estado)
    return {"ok": True, "task_id": task_id, "done": body.done}


# ── Edits (estructura del roadmap) ───────────────────────────────────────────

@app.get("/api/edits")
def get_edits():
    return JSONResponse(load_edits())


class EditsBody(BaseModel):
    data: dict


@app.post("/api/edits")
def post_edits(body: EditsBody):
    save_edits_file(body.data)
    return {"ok": True}


@app.get("/api/projects")
def get_projects():
    return JSONResponse(load_projects())


class ProjectsBody(BaseModel):
    data: dict


@app.post("/api/projects")
def post_projects(body: ProjectsBody):
    save_projects(body.data)
    return {"ok": True}


class RoadmapBody(BaseModel):
    data: dict


@app.post("/api/roadmap")
def post_roadmap(body: RoadmapBody):
    tmp = ROADMAP_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(body.data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(ROADMAP_FILE)
    return {"ok": True}


@app.post("/api/reload")
def reload_roadmap():
    from roadmap_parser import parse_all
    parse_all(BASE_DIR)
    return {"ok": True}


@app.post("/api/upload-roadmap")
async def upload_roadmap(file: UploadFile = File(...)):
    """Recibe un archivo CSV o xlsx, lo guarda en RoadMaps/ y re-parsea el roadmap."""
    allowed = {".csv", ".xlsx"}
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in allowed:
        raise HTTPException(status_code=400, detail="Solo se permiten archivos .csv o .xlsx")

    roadmap_dir = BASE_DIR / "RoadMaps"
    roadmap_dir.mkdir(exist_ok=True)

    # Eliminar archivos anteriores del mismo tipo para evitar acumulación
    for old in roadmap_dir.glob(f"*{suffix}"):
        old.unlink()

    dest = roadmap_dir / file.filename
    content = await file.read()
    dest.write_bytes(content)

    from roadmap_parser import parse_all
    try:
        parse_all(BASE_DIR)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al parsear: {e}")

    return {"ok": True, "filename": file.filename}


class TokenBody(BaseModel):
    token: str


@app.post("/api/verify-token")
def verify_token(body: TokenBody):
    cfg   = load_config()
    users = cfg.get("users", {})
    name  = next((n for n, t in users.items() if t == body.token), None)
    if name:
        return {"ok": True, "name": name}
    # compatibilidad con token único legacy
    if body.token and body.token == cfg.get("admin_token", ""):
        return {"ok": True, "name": "Admin"}
    return {"ok": False, "name": None}


class NotifyBody(BaseModel):
    token:   str
    action:  str   # add | edit | delete
    type:    str   # tarea | acuerdo | fase
    project: str
    detail:  str


@app.post("/api/notify")
def post_notify(body: NotifyBody):
    action_label = {"add": "agregó", "edit": "modificó", "delete": "eliminó"}.get(body.action, body.action)
    subject = f"[CV Celestial] Se {action_label} {body.type} en {body.project}"
    text    = (
        f"Acción  : {action_label} {body.type}\n"
        f"Proyecto: {body.project}\n"
        f"Detalle : {body.detail}\n"
        f"Fecha   : {datetime.now().strftime('%Y-%m-%d %H:%M')}\n"
    )
    try:
        send_email(subject, text)
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "reason": str(e)}


# ── Debug xlsx (temporal) ────────────────────────────────────────────────────

@app.get("/api/debug-xlsx")
def debug_xlsx():
    """Devuelve las primeras 120 filas del sheet de roadmap para inspección."""
    import openpyxl
    xlsx = BASE_DIR / "RoadMaps" / "Arconte_Retail_Roadmap_v6.xlsx"
    if not xlsx.exists():
        raise HTTPException(status_code=404, detail="xlsx no encontrado")
    wb = openpyxl.load_workbook(str(xlsx), data_only=True)
    ws = wb["Roadmap Arconte 2M"]
    rows = []
    for i, row in enumerate(ws.iter_rows(min_row=1, max_row=120, values_only=True), start=1):
        cells = [str(c) if c is not None else "" for c in row[:10]]
        rows.append({"row": i, "cols": cells})
    return JSONResponse({"rows": rows})


# ── Votación para eliminar roadmap ───────────────────────────────────────────

class VoteProposalBody(BaseModel):
    token:   str
    project: str
    reason:  str

class VoteCastBody(BaseModel):
    token: str


@app.get("/api/votes")
def get_votes():
    return JSONResponse(load_votes())


@app.post("/api/votes")
def create_vote_proposal(body: VoteProposalBody):
    cfg   = load_config()
    users = cfg.get("users", {})
    name  = next((n for n, t in users.items() if t == body.token), None)
    if not name:
        raise HTTPException(status_code=401, detail="Token inválido")
    votes_data = load_votes()
    existing = [p for p in votes_data["proposals"] if p["project"] == body.project and p["status"] == "pending"]
    if existing:
        raise HTTPException(status_code=409, detail="Ya existe una propuesta pendiente para este proyecto")
    total_users = len(users)
    # Umbral por defecto: mayoría simple (50% + 1). Se puede forzar otro valor
    # con "votes_needed_override" en config.json (útil para debugging; quitar o
    # poner null para volver a la mayoría automática).
    override    = cfg.get("votes_needed_override")
    needed      = override if isinstance(override, int) and override > 0 else (total_users // 2) + 1
    vote_id     = f"v_{int(datetime.now().timestamp())}"
    now_str     = datetime.now().strftime("%Y-%m-%d %H:%M")
    proposal = {
        "id":          vote_id,
        "project":     body.project,
        "reason":      body.reason,
        "proposed_by": name,
        "proposed_at": now_str,
        "votes":       [{"user": name, "voted_at": now_str}],
        "needed":      needed,
        "total_users": total_users,
        "status":      "pending",
    }
    votes_data["proposals"].append(proposal)
    approved = len(proposal["votes"]) >= needed
    if approved:
        proposal["status"]      = "approved"
        proposal["approved_at"] = now_str
        save_votes(votes_data)
        execute_roadmap_deletion(body.project)
    else:
        save_votes(votes_data)
    return {"ok": True, "approved": approved, "proposal": proposal}


@app.post("/api/votes/{vote_id}/cast")
def cast_vote(vote_id: str, body: VoteCastBody):
    cfg   = load_config()
    users = cfg.get("users", {})
    name  = next((n for n, t in users.items() if t == body.token), None)
    if not name:
        raise HTTPException(status_code=401, detail="Token inválido")
    votes_data = load_votes()
    proposal   = next((p for p in votes_data["proposals"] if p["id"] == vote_id), None)
    if not proposal:
        raise HTTPException(status_code=404, detail="Propuesta no encontrada")
    if proposal["status"] != "pending":
        raise HTTPException(status_code=409, detail="La propuesta ya no está activa")
    if any(v["user"] == name for v in proposal["votes"]):
        raise HTTPException(status_code=409, detail="Ya votaste en esta propuesta")
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    proposal["votes"].append({"user": name, "voted_at": now_str})
    approved = len(proposal["votes"]) >= proposal["needed"]
    if approved:
        proposal["status"]      = "approved"
        proposal["approved_at"] = now_str
    save_votes(votes_data)
    if approved:
        execute_roadmap_deletion(proposal["project"])
    return {"ok": True, "approved": approved, "proposal": proposal}


@app.post("/api/votes/{vote_id}/cancel")
def cancel_vote(vote_id: str, body: VoteCastBody):
    cfg   = load_config()
    users = cfg.get("users", {})
    name  = next((n for n, t in users.items() if t == body.token), None)
    if not name:
        raise HTTPException(status_code=401, detail="Token inválido")
    votes_data = load_votes()
    proposal   = next((p for p in votes_data["proposals"] if p["id"] == vote_id), None)
    if not proposal:
        raise HTTPException(status_code=404, detail="Propuesta no encontrada")
    if proposal["status"] != "pending":
        raise HTTPException(status_code=409, detail="La propuesta ya no está activa")
    if proposal["proposed_by"] != name:
        raise HTTPException(status_code=403, detail="Solo quien propuso puede cancelar")
    now_str                    = datetime.now().strftime("%Y-%m-%d %H:%M")
    proposal["status"]         = "cancelled"
    proposal["cancelled_by"]   = name
    proposal["cancelled_at"]   = now_str
    save_votes(votes_data)
    return {"ok": True}


# ── Soluciones adjuntas a tareas ─────────────────────────────────────────────

def load_solutions_meta() -> dict:
    if SOLUTIONS_META.exists():
        try:
            return json.loads(SOLUTIONS_META.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_solutions_meta(data: dict) -> None:
    tmp = SOLUTIONS_META.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(SOLUTIONS_META)


@app.get("/api/solutions")
def get_solutions():
    return JSONResponse(load_solutions_meta())


@app.post("/api/solutions/upload")
async def upload_solution(
    task_key:    str = Form(...),
    uploaded_by: str = Form("Anónimo"),
    file:        UploadFile = File(...),
):
    original_name = file.filename or "evidencia"
    safe_key  = "".join(c if (c.isalnum() or c in "_-") else "_" for c in task_key)
    if not safe_key:
        raise HTTPException(status_code=400, detail="task_key inválido")

    # Nombre único: clave_timestamp_nombreoriginal (sin caracteres peligrosos)
    safe_orig = re.sub(r"[^\w.\-]", "_", original_name)
    ts        = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename  = f"{safe_key}_{ts}_{safe_orig}"

    SOLUTIONS_DIR.mkdir(exist_ok=True)
    dest = SOLUTIONS_DIR / filename
    dest.write_bytes(await file.read())

    url  = f"/solutions/{filename}"
    meta = load_solutions_meta()
    # Historial: lista de evidencias por tarea
    if task_key not in meta or not isinstance(meta[task_key], list):
        meta[task_key] = []
    meta[task_key].append({
        "url":         url,
        "filename":    original_name,
        "uploaded_by": uploaded_by or "Anónimo",
        "uploaded_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
    })
    save_solutions_meta(meta)

    return {"ok": True, "url": url, "entry": meta[task_key][-1]}


@app.post("/api/solutions/remove")
async def remove_solution(payload: dict):
    task_key = payload.get("task_key", "")
    url      = payload.get("url", "")
    if not task_key or not url:
        raise HTTPException(status_code=400, detail="task_key y url requeridos")
    meta = load_solutions_meta()
    entries = meta.get(task_key, [])
    new_entries = [e for e in entries if e.get("url") != url]
    meta[task_key] = new_entries
    save_solutions_meta(meta)
    # Borrar archivo físico si existe
    filename = Path(url).name
    target   = SOLUTIONS_DIR / filename
    if target.exists():
        target.unlink()
    return {"ok": True, "removed": len(entries) - len(new_entries)}


@app.get("/solutions/{filename:path}")
def serve_solution_file(filename: str):
    """Sirve cualquier archivo de evidencia sin restricción de extensión."""
    safe_name = Path(filename).name  # evita path traversal
    target    = SOLUTIONS_DIR / safe_name
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="Evidencia no encontrada")
    mime = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
    return FileResponse(target, media_type=mime)


# ── Static files ──────────────────────────────────────────────────────────────

STATIC_EXTENSIONS = {
    ".html", ".css", ".js", ".json", ".png", ".jpg", ".jpeg",
    ".svg", ".ico", ".woff", ".woff2", ".ttf", ".webm", ".mp4",
    ".xlsx",
}


# Cabeceras anti-caché: el frontend es un solo index.html servido como archivo.
# Sin esto, el navegador reusa la versión vieja sin revalidar y los cambios de
# JS/CSS no se ven aunque se reinicie el servidor. Forzamos revalidación siempre.
NO_CACHE_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma":        "no-cache",
    "Expires":       "0",
}


@app.get("/")
def serve_index():
    return FileResponse(BASE_DIR / "index.html", headers=NO_CACHE_HEADERS)


@app.get("/{path:path}")
def serve_static(path: str):
    # No exponer archivos fuera del directorio base
    try:
        target = (BASE_DIR / path).resolve()
        target.relative_to(BASE_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    if target.exists() and target.is_file() and target.suffix in STATIC_EXTENSIONS:
        return FileResponse(target, headers=NO_CACHE_HEADERS)

    # Fallback a index.html para rutas SPA (por si se agrega router después)
    return FileResponse(BASE_DIR / "index.html", headers=NO_CACHE_HEADERS)


# ── Arranque ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("── CV Celestial Docs Server ──────────────────────")
    # parse_all deshabilitado — roadmap parte limpio (usar POST /api/reload para re-cargar xlsx)

    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        local_ip = "127.0.0.1"

    print(f"  Local  : http://localhost:8080")
    print(f"  Red    : http://{local_ip}:8080")
    print("──────────────────────────────────────────────────")

    uvicorn.run(app, host="0.0.0.0", port=8080, log_level="warning")
