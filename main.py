# -*- coding: utf-8 -*-
"""
main.py
-------
Servidor FastAPI de la plataforma informativa del equipo de CV.

Sirve las páginas estáticas (inicio, organigrama, visión, proyectos), la API
de solo lectura y la edición de contenido informativo (solo con token válido).

Arranca con:
    python main.py

Acceso en red local:
    http://<IP-de-esta-PC>:8090
"""

import ast
import json
import mimetypes
import os
import re
import urllib.error
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import uvicorn

BASE_DIR        = Path(__file__).parent
PROJECTS_FILE   = BASE_DIR / "projects.json"
CONFIG_FILE     = BASE_DIR / "config.json"
SOLUTIONS_DIR   = BASE_DIR / "solutions"
SOLUTIONS_META  = BASE_DIR / "solutions_meta.json"
FULLCV_CACHE    = BASE_DIR / "fullcv_cache.json"
INFRA_FILE      = BASE_DIR / "infra.json"
EQUIPO_FILE     = BASE_DIR / "equipo.json"
DOCS_CACHE      = BASE_DIR / "docs_cache.json"
REQUISITOS_DIR  = BASE_DIR / "requisitos"
REQUISITOS_CACHE = BASE_DIR / "requisitos_cache.json"

# ── Config ────────────────────────────────────────────────────────────────────

def load_config() -> dict:
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"admin_token": "cv2026"}


def resolve_user(token: str) -> str:
    """Devuelve el nombre del usuario dado su token, o '' si no es válido."""
    if not token:
        return ""
    cfg   = load_config()
    users = cfg.get("users", {})
    name  = next((n for n, t in users.items() if t == token), None)
    if name:
        return name
    if token == cfg.get("admin_token", "cv2026") or token == "cv2026":
        return "Admin"
    return ""


def is_valid_token(token: str) -> bool:
    return bool(resolve_user(token))


# ── Datos ─────────────────────────────────────────────────────────────────────

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


def load_infra() -> dict:
    if INFRA_FILE.exists():
        try:
            return json.loads(INFRA_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"servers": [], "deployments": [], "cameras": []}


def save_infra(data: dict) -> None:
    tmp = INFRA_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(INFRA_FILE)


# Contenido inicial de la página Equipo (organigrama + visión). Se usa solo
# mientras no exista equipo.json; al primer guardado queda todo en el archivo.
EQUIPO_DEFAULT = {
    "vision": (
        "Construir un **ecosistema de visión por computadora de clase mundial** que permita "
        "a organizaciones de cualquier tamaño detectar eventos críticos en video en tiempo real, "
        "sin depender de infraestructura de terceros ni costos variables por uso de APIs.\n\n"
        "El equipo desarrolla soluciones que van desde **seguridad física y retail** "
        "hasta **monitoreo de medios masivos**, con modelos que corren "
        "**completamente on-premise**: baja latencia, privacidad garantizada y "
        "costo operativo predecible."
    ),
    "org": [
        {"id": "abelardo", "name": "Abelardo Cruz",   "role": "Jefe de Sección",           "parent": "",         "style": "head",     "note": ""},
        {"id": "jonathan", "name": "Jonathan Flores", "role": "Head of Computer Vision",   "parent": "abelardo", "style": "head",     "note": ""},
        {"id": "juan",     "name": "Juan Camacho",    "role": "Backend & Engineer Systems","parent": "abelardo", "style": "backend",  "note": ""},
        {"id": "rodrigo",  "name": "Rodrigo Flores",  "role": "AI Engineer",               "parent": "jonathan", "style": "ai",       "note": ""},
        {"id": "israel",   "name": "Israel Mendoza",  "role": "AI Engineer",               "parent": "jonathan", "style": "ai",       "note": ""},
        {"id": "adrian",   "name": "Adrian Medina",   "role": "Engineer Systems",          "parent": "jonathan", "style": "engineer", "note": "también reporta a Juan Camacho"},
        {"id": "selene",   "name": "Selene Ventura",  "role": "Frontend",                  "parent": "juan",     "style": "frontend", "note": ""},
    ],
    "becarios": ["Gael", "Litzi", "Paola"],
}


def load_equipo() -> dict:
    if EQUIPO_FILE.exists():
        try:
            return json.loads(EQUIPO_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return json.loads(json.dumps(EQUIPO_DEFAULT))  # copia profunda


def save_equipo(data: dict) -> None:
    tmp = EQUIPO_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(EQUIPO_FILE)


def load_solutions_meta() -> dict:
    if SOLUTIONS_META.exists():
        try:
            return json.loads(SOLUTIONS_META.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


# ── Integración Full_CV ───────────────────────────────────────────────────────
# La doc lee el catálogo de modelos de Full_CV (mismo servidor, puerto 8000) y
# lo cachea en fullcv_cache.json para seguir mostrando datos si está apagado.

FULLCV_DEFAULTS = {
    "url":              "http://localhost:8000",
    "username":         "",
    "password":         "",
    "profiles_dir":     "",
    "sync_ttl_seconds": 300,
}

# Token de sesión de Full_CV (muere cuando Full_CV se reinicia → re-login)
_fullcv_session_token: str = ""


def _now_iso() -> str:
    """UTC con offset explícito: el browser lo parsea bien aunque el
    contenedor corra en otra zona horaria."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def fullcv_config() -> dict:
    cfg = {**FULLCV_DEFAULTS, **(load_config().get("fullcv") or {})}
    env_url = os.environ.get("FULLCV_URL", "").strip()
    if env_url:
        cfg["url"] = env_url
    cfg["url"] = cfg["url"].rstrip("/")
    return cfg


def _fullcv_get(url: str, timeout: float = 4.0):
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _fullcv_post(url: str, payload: dict, timeout: float = 4.0):
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _fullcv_login(cfg: dict) -> str:
    """Login programático en Full_CV. Devuelve token de sesión o ''."""
    global _fullcv_session_token
    if not (cfg["username"] and cfg["password"]):
        return ""
    try:
        data = _fullcv_post(f"{cfg['url']}/api/login",
                            {"username": cfg["username"], "password": cfg["password"]})
        _fullcv_session_token = data.get("token", "") or ""
    except Exception:
        _fullcv_session_token = ""
    return _fullcv_session_token


def _fetch_fullcv_profiles(cfg: dict) -> dict:
    """Perfiles de benchmark indexados por model_id. Nunca lanza excepción."""
    # Opción 1: filesystem (dev / volumen montado)
    pdir = cfg.get("profiles_dir", "")
    if pdir:
        d = Path(pdir)
        if d.is_dir():
            profiles = {}
            for f in sorted(d.glob("*.json")):
                try:
                    p = json.loads(f.read_text(encoding="utf-8"))
                    mid = p.get("model_id") or f.stem
                    profiles[mid] = p
                except Exception:
                    continue
            return profiles

    # Opción 2: HTTP con login (re-login ante sesión expirada)
    if not (cfg["username"] and cfg["password"]):
        return {}
    token = _fullcv_session_token or _fullcv_login(cfg)
    if not token:
        return {}
    url = f"{cfg['url']}/api/bench/profiles?token={token}"
    try:
        data = _fullcv_get(url)
    except urllib.error.HTTPError as e:
        if e.code not in (401, 403):
            return {}
        token = _fullcv_login(cfg)          # la sesión murió: un solo retry
        if not token:
            return {}
        try:
            data = _fullcv_get(f"{cfg['url']}/api/bench/profiles?token={token}")
        except Exception:
            return {}
    except Exception:
        return {}
    if isinstance(data, dict):
        return data
    if isinstance(data, list):
        return {p.get("model_id", ""): p for p in data if isinstance(p, dict) and p.get("model_id")}
    return {}


def fetch_fullcv_snapshot() -> dict:
    """Consulta Full_CV y arma el snapshot. Lanza excepción si /api/models falla."""
    cfg    = fullcv_config()
    models = _fullcv_get(f"{cfg['url']}/api/models")
    if not isinstance(models, list):
        raise ValueError("Respuesta inesperada de /api/models")
    # Puerto donde el BROWSER puede abrir la web de Full_CV (mismo host que la doc)
    try:
        web_port = int((cfg["url"].rsplit(":", 1)[-1] or "8000").split("/")[0])
    except ValueError:
        web_port = 8000
    return {
        "synced_at":    _now_iso(),
        "last_attempt": _now_iso(),
        "ok":           True,
        "error":        None,
        "web_port":     web_port,
        "models":       models,
        "profiles":     _fetch_fullcv_profiles(cfg),
    }


def load_fullcv_cache() -> dict:
    if FULLCV_CACHE.exists():
        try:
            return json.loads(FULLCV_CACHE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_fullcv_cache(data: dict) -> None:
    tmp = FULLCV_CACHE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(FULLCV_CACHE)


# ══════════════════════════════════════════════════════════════════════════════
#  DOCUMENTACIÓN DE MODELOS ("el librito")
# ══════════════════════════════════════════════════════════════════════════════
# El repo hermano ArconteDetection_DebugTools/Models guarda, junto al código de
# cada modelo, su README (cómo funciona) y su CONTRATO (cómo integrarlo). Esta
# sección lee esos .md en vivo del filesystem y los cachea completos en
# docs_cache.json (mismo patrón que Full_CV): así el librito sigue disponible
# aunque el repo de modelos no esté montado en el servidor.
#
# SOLO LECTURA: la fuente de verdad es el repo de código, nunca se escribe ahí.

MODELS_DOCS_DEFAULTS = {
    "dir":              "",     # vacío → se prueban DOCS_DIR_CANDIDATES
    "repo_url":         "https://github.com/Celestial-Dynamics-AI/ArconteDetection_DebugTools/tree/main/Models",
    "sync_ttl_seconds": 120,
}

# Rutas donde suele vivir el repo de modelos: montaje de Docker primero, luego
# el repo hermano en desarrollo local.
DOCS_DIR_CANDIDATES = [
    "/models_docs",
    "../ArconteDetection_DebugTools/Models",
    "../../ArconteDetection_DebugTools/Models",
]

# Carpetas de terceros / artefactos que nunca son documentación nuestra
DOCS_IGNORE_DIRS = {
    ".git", "__pycache__", "node_modules", ".venv", "venv", "env",
    "site-packages", "runs", "weights", "datasets", "dist", "build",
    "TransReID-main", ".ipynb_checkpoints",
}

DOCS_MAX_DEPTH = 3      # Models/<modelo>/<sub>/doc.md — más profundo = vendored

# ── Capítulos del librito (orden de lectura) ──────────────────────────────────
BOOK_CHAPTERS = [
    {"key": "fundamentos", "icon": "🧱", "title": "Fundamentos",
     "blurb": "El andamio que comparten todos los detectores: framework de video, panel web y reconocimiento facial."},
    {"key": "retail", "icon": "🛒", "title": "Retail",
     "blurb": "Modelos del piso de venta: hurto, atención en caja y comportamiento del cliente."},
    {"key": "conteo", "icon": "🔢", "title": "Conteo y aforo",
     "blurb": "Cuánta gente entra, sale y cuánta hay dentro en este instante."},
    {"key": "acceso", "icon": "🚧", "title": "Zonas, accesos y objetos",
     "blurb": "Perímetros restringidos, identificación de personas, merodeo, estacionamiento y objetos."},
    {"key": "criticos", "icon": "🚨", "title": "Eventos críticos",
     "blurb": "Lo que exige reacción inmediata: fuego, peleas, robos, caídas, choques."},
    {"key": "medios", "icon": "📺", "title": "Medios masivos (PublicVector)",
     "blurb": "Audio y video de TV: transcripción, menciones de marca y sentimiento."},
    {"key": "servidor", "icon": "🖥", "title": "Servidor y despliegue",
     "blurb": "Notas de la máquina donde corren los modelos."},
    {"key": "otros", "icon": "📎", "title": "Otros documentos",
     "blurb": "Documentación encontrada en el repo que aún no tiene ficha curada."},
]

# ── Ficha de cada modelo ("la receta") ───────────────────────────────────────
# Clave = ruta relativa dentro de Models/. Lo que no aparece aquí se muestra
# igual, con título derivado del nombre de la carpeta, en el capítulo "otros".
#   stage: production | piloto | debug | research | framework
MODEL_CARDS = {
    "Base": {
        "chapter": "fundamentos", "stage": "framework",
        "title": "Base — Framework de detectores",
        "tagline": "Ya no se escribe el pipeline de video en cada solución: solo la lógica de inferencia.",
        "detects": "No detecta nada por sí mismo: es el esqueleto que ejecutan los demás.",
        "ingredients": ["VideoSource RTSP", "Flask", "ByteTrack", "Sinks de evidencia"],
        "inputs": "RTSP · archivo de video · webcam",
        "outputs": "Panel web + API /api/sources + evidencia en disco",
    },
    "areaRest": {
        "chapter": "fundamentos", "stage": "production",
        "title": "areaRest — Familia de detectores en panel web",
        "tagline": "Tres familias de detectores de personas montadas sobre el framework Base.",
        "detects": "Índice de la familia: zonas restringidas, flujo de personas y aforo.",
        "ingredients": ["Framework Base", "YOLO11", "Editor de zonas web"],
        "inputs": "RTSP · archivo · webcam (N fuentes por proceso)",
        "outputs": "Panel web con MJPEG anotado + API HTTP",
    },
    "areaRest/face_runner": {
        "chapter": "fundamentos", "stage": "production",
        "title": "face_runner — Reconocimiento facial AdaFace IR101",
        "tagline": "Runner mínimo y portable del modelo facial de producción, sin TensorRT ni monolito.",
        "detects": "Identidad de una persona a partir de su rostro (embedding + match).",
        "ingredients": ["AdaFace IR101 (WebFace12M)", "PyTorch", "onnxruntime"],
        "inputs": "Imagen o crop de rostro",
        "outputs": "Embedding y similitud contra la galería",
    },
    "Shoplifting": {
        "chapter": "retail", "stage": "production",
        "hardware": "~64 FPS en la version Production (worker X-CLIP asincrono); la version Debug es mas lenta porque compone el dashboard.",
        "title": "FardeoDetector V2 — Hurto en retail",
        "tagline": "Cascada barato→caro: heurística geométrica filtra, X-CLIP confirma.",
        "detects": "Fardeo: ocultar mercancía en el cuerpo o bolsa dentro de la tienda.",
        "ingredients": ["YOLO + ByteTrack", "Heurísticas geométricas", "X-CLIP"],
        "inputs": "RTSP · archivo de video",
        "outputs": "Alerta + JPG/JSON de evidencia (versión Production) y dashboard (Debug)",
    },
    "CashierPresence": {
        "chapter": "retail", "stage": "piloto",
        "title": "CashierPresence V1 — Cajero en su puesto",
        "tagline": "Sin ROI manual: segmenta el mostrador y decide si hay alguien atendiéndolo.",
        "detects": "Ausencia o presencia del cajero en su punto de trabajo.",
        "ingredients": ["YOLO segmentación (mostrador)", "YOLO personas", "CLIP"],
        "inputs": "RTSP · archivo de video",
        "outputs": "Estado presente/ausente + evidencia; scripts Debug y Production",
    },
    "areaRest/ContadorFlujo": {
        "chapter": "conteo", "stage": "production",
        "hardware": "Un YOLO por fuente, pero solo ve un recorte alrededor de la linea o del corredor, no el frame completo.",
        "title": "ContadorFlujo — Entradas y salidas",
        "tagline": "Corredor con escalera de líneas (V2): robusto a oclusiones y a tracks partidos.",
        "detects": "Cuánta gente cruza una puerta y cuánta queda dentro (inicial + entradas − salidas).",
        "ingredients": ["YOLO11x", "ByteTrack", "MediaPipe (nube de rostro)", "Reglas R1–R5"],
        "inputs": "RTSP · archivo · webcam (línea o box dibujado una vez por cámara)",
        "outputs": "JSON de conteos persistente + MJPEG anotado + evidencia por cruce",
    },
    "areaRest/ContadorAforo": {
        "chapter": "conteo", "stage": "production",
        "hardware": "Un YOLO por fuente (X pesado / S ligero) y la inferencia corre solo cada `interval` segundos (2 s por defecto, adaptativo hasta 5 s).",
        "title": "CrowdCounter — Ocupación instantánea",
        "tagline": "No cuenta cruces: cuenta cuántas personas hay en el frame ahora.",
        "detects": "Aforo / densidad de personas indoor y outdoor.",
        "ingredients": ["YOLO11", "Framework Base"],
        "inputs": "RTSP · archivo · webcam",
        "outputs": "Conteo instantáneo por fuente + MJPEG anotado + API HTTP",
    },
    "areaRest/ZonaRestringida_ReID": {
        "chapter": "acceso", "stage": "production",
        "hardware": "Con `--scene indoor` se carga un YOLO por zona y por fuente: vigilar VRAM al escalar camaras.",
        "title": "AreaRestriction + ReID — Zonas restringidas con identificación",
        "tagline": "No solo ve que alguien entró: decide con TransReID si es personal autorizado.",
        "detects": "Intrusión en zonas configurables e identidad de quien entra.",
        "ingredients": ["YOLO11", "TransReID", "AdaFace (rostro)", "Editor de zonas web"],
        "inputs": "RTSP · archivo (zonas dibujadas una vez por cámara)",
        "outputs": "Alerta con identidad probable + evidencia + MJPEG anotado",
    },
    "loitering": {
        "chapter": "acceso", "stage": "research",
        "title": "Merodeo (loitering)",
        "tagline": "Permanencia anómala de una persona en una zona durante demasiado tiempo.",
        "detects": "Merodeo: tiempo de permanencia por track dentro de un polígono.",
        "ingredients": ["YOLO + ByteTrack", "Tiempo en zona"],
        "inputs": "RTSP · archivo de video",
        "outputs": "Alerta por permanencia (baseline híbrido)",
    },
    "parkingCars": {
        "chapter": "acceso", "stage": "research",
        "title": "Ocupación de estacionamiento",
        "tagline": "Rejilla de cajones sobre el frame: cada celda ocupada o libre.",
        "detects": "Cajones ocupados y libres en un estacionamiento.",
        "ingredients": ["YOLO", "Editor de polígonos", "Rejilla de inferencia"],
        "inputs": "RTSP · archivo (polígono del estacionamiento dibujado)",
        "outputs": "Mapa de ocupación por cajón",
    },
    "trackingObjects": {
        "chapter": "acceso", "stage": "research",
        "title": "Objetos y herramientas",
        "tagline": "Detección entrenada a medida (martillos, herramienta en caja) más zonas.",
        "detects": "Presencia y salida de objetos específicos de una zona.",
        "ingredients": ["YOLO entrenado a medida", "GUI de etiquetado", "Benchmark de modelos"],
        "inputs": "RTSP · archivo de video",
        "outputs": "Alerta por objeto/zona + herramientas de entrenamiento",
    },
    "Fire": {
        "chapter": "criticos", "stage": "production",
        "title": "Fire & Smoke — Fuego y humo (RGB e IR)",
        "tagline": "YOLO detecta rápido, CLIP filtra reflejos, luces y faros que parecen fuego.",
        "detects": "Incendio y humo en escena urbana, con soporte de cámara infrarroja.",
        "ingredients": ["YOLO", "CLIP"],
        "inputs": "RTSP · archivo (RGB o IR)",
        "outputs": "Alerta + evidencia; múltiples versiones Debug (V2–V6) y una IR",
    },
    "Figthing": {
        "chapter": "criticos", "stage": "production",
        "title": "FightDetector — Peleas",
        "tagline": "Distingue confrontación real de saludos, empujones y multitud en movimiento.",
        "detects": "Peleas y confrontación física entre personas.",
        "ingredients": ["YOLO + ByteTrack", "CLIP"],
        "inputs": "RTSP · archivo de video",
        "outputs": "Alerta + evidencia; versiones Debug (v2–v6) y Production",
    },
    "Robbery": {
        "chapter": "criticos", "stage": "production",
        "title": "RobberyDetector V3 — Robo con violencia",
        "tagline": "Heurística Area Spike + CLIP Temporal V3; umbrales de una ablación de 64 combinaciones.",
        "detects": "Robo con contacto físico entre dos personas (no carterismo a distancia).",
        "ingredients": ["YOLO ByteTrack", "Heurísticas geométricas (Area Spike)", "CLIP Temporal V3 (KSM+PC+TC)"],
        "inputs": "RTSP · cámara · archivo de video",
        "outputs": "Alerta con score; Production (overlay mínimo) y Debug (dashboard + timeline)",
    },
    "Falling": {
        "chapter": "criticos", "stage": "production",
        "hardware": "RTX 4090 con yolo11x-pose + CLIP: >=15 FPS solo con 1-2 camaras; cada fuente replica YOLO (~0.4 GB VRAM) y CLIP se comparte. El cuello es computo, no VRAM (ver seccion 8 de la guia).",
        "title": "FallDetector V7 — Caídas",
        "tagline": "Reglas geométricas legibles (A/B/C/D) + juez CLIP zero-shot, con zonas de riesgo que tú dibujas.",
        "detects": "Caídas de personas en CCTV, incluida la caída al vacío desde altura; detector de triage para revisión humana.",
        "ingredients": ["YOLO11x-pose + ByteTrack", "Reglas A/B/C/D", "Juez CLIP ViT-B-32 (zero-shot)", "Zonas de riesgo", "Framework Base"],
        "inputs": "RTSP · archivo · webcam (headless; zonas de riesgo dibujadas en el panel)",
        "outputs": "Alerta en 3 colores + panel web · Production V7 (operación) y Debug V7 (calibración)",
    },
    "Smoking": {
        "chapter": "criticos", "stage": "production",
        "title": "SmokingDetector V1 — Fumar",
        "tagline": "Clasificación temporal de acción: VideoMAE propone, X-CLIP confirma.",
        "detects": "Persona fumando en zonas donde no está permitido.",
        "ingredients": ["VideoMAE", "X-CLIP", "YOLO"],
        "inputs": "RTSP · archivo de video",
        "outputs": "Alerta + evidencia; scripts Production y Debug",
    },
    "CarParts": {
        "chapter": "criticos", "stage": "production",
        "title": "Car Parts Theft — Robo de autopartes",
        "tagline": "Persona + vehículo estacionado + manipulación sostenida = alerta.",
        "detects": "Manipulación de partes de vehículos estacionados (faros, espejos, llantas).",
        "ingredients": ["YOLO + ByteTrack", "CLIP"],
        "inputs": "RTSP · archivo (cámara RGB)",
        "outputs": "Alerta + evidencia; V3, V4 y Production",
    },
    "Crash": {
        "chapter": "criticos", "stage": "research",
        "title": "CrashDetector — Choques vehiculares",
        "tagline": "Verificación semántica temporal sobre ventanas de frames.",
        "detects": "Colisiones entre vehículos en vía pública.",
        "ingredients": ["YOLO", "CLIP temporal (top-k)"],
        "inputs": "RTSP · archivo de video",
        "outputs": "Alerta; variantes de debug (CLIP top-k, temporal, V2) y Production",
    },
    "Pv_code/Video": {
        "chapter": "medios", "stage": "production",
        "title": "process_video_v2 — Menciones de marca en TV",
        "tagline": "Con --section comercial, Whisper procesa solo lo que importa: ~66 % menos tiempo.",
        "detects": "Menciones de una marca en el audio: timestamp, quién lo dijo, contexto y sentimiento.",
        "ingredients": ["ffmpeg", "ImageBind (noticiero/comercial)", "Whisper large-v3-turbo", "Qwen LLM", "Modelo de sentimiento"],
        "inputs": "Archivo de video (canal de TV, grabación) + servidor de inferencia con GPU",
        "outputs": "JSON con menciones, timestamps, contexto y sentimiento",
    },
    "PC-Server": {
        "chapter": "servidor", "stage": "framework",
        "title": "PC-Server — Máquina de inferencia",
        "tagline": "Dónde y cómo corren los modelos en el servidor del equipo.",
        "detects": "Notas de despliegue y dependencias del servidor (incluye TransReID vendorizado).",
        "ingredients": ["GPU NVIDIA", "TransReID", "Servicios de tracking"],
        "inputs": "—",
        "outputs": "—",
    },
}

DOC_KINDS = {
    "contrato": {"label": "Contrato",     "icon": "📜", "order": 1,
                 "hint": "Qué soy, qué consumo y qué produzco — para integrarme sin leer el código."},
    "guia":     {"label": "Guía",         "icon": "📖", "order": 0,
                 "hint": "Cómo funciona por dentro, cómo se corre y qué límites tiene."},
    "diseno":   {"label": "Diseño",       "icon": "📐", "order": 2,
                 "hint": "Decisiones de diseño y por qué se resolvió así."},
}


# ── Ficha técnica: se lee del propio código del modelo ────────────────────────
# Los detectores declaran su configuración en constantes MAYÚSCULAS al inicio del
# archivo (pesos del modelo, resolución, ventanas de frames, umbrales). Se leen
# con `ast` (NUNCA se ejecuta el código) y se agrupan para mostrarlas como la
# ficha técnica del modelo: qué modelo usa, cómo procesa los frames y con qué
# umbrales decide. Si el código cambia, la ficha cambia sola.

# Firmas de librerías/modelos: regex sobre el código → nombre legible
SPEC_STACK_SIGNS = [
    (r"\bfrom\s+ultralytics\b|\bimport\s+ultralytics\b|\bYOLO\s*\(",        "YOLO (ultralytics)"),
    (r"bytetrack|ByteTrack|byte_track",                                      "ByteTrack"),
    (r"botsort|BoTSORT|bot_sort",                                            "BoT-SORT"),
    (r"\bimport\s+clip\b|\bopen_clip\b|ViT-[BL]/\d+|ViT-[BL]-\d+",           "CLIP"),
    (r"XCLIP|X-CLIP|xclip",                                                  "X-CLIP"),
    (r"VideoMAE|videomae",                                                   "VideoMAE"),
    (r"mmaction|stgcn|ST-GCN|st_gcn",                                        "ST-GCN"),
    (r"TransReID|transreid|vit_transreid",                                   "TransReID"),
    (r"AdaFace|adaface|ir101|IR101",                                         "AdaFace IR101"),
    (r"\bmediapipe\b",                                                       "MediaPipe"),
    (r"faster_whisper|WhisperModel|whisper",                                 "Whisper"),
    (r"imagebind|ImageBind",                                                 "ImageBind"),
    (r"insightface|InsightFace|buffalo_l",                                   "InsightFace"),
    (r"\bimport\s+torch\b|\bfrom\s+torch\b",                                 "PyTorch"),
    (r"onnxruntime",                                                         "onnxruntime"),
    (r"tensorrt|\.engine\b",                                                 "TensorRT"),
    (r"\bimport\s+cv2\b",                                                    "OpenCV"),
    (r"\bfrom\s+flask\b|\bimport\s+flask\b",                                 "Flask (panel web)"),
]

# Clasificación de constantes por nombre (y por valor, para los pesos)
_SPEC_MODEL_KEYS = ("MODEL", "WEIGHT", "CKPT", "CHECKPOINT", "YOLO", "ARCH",
                    "EMBEDDER", "REID", "PROMPT", "CLASS", "DEVICE", "TRACKER",
                    "KP_", "LABEL", "QUERY", "_IDS", "CLIP_ORDER", "TASK")
_SPEC_VIDEO_KEYS = ("FPS", "FRAME", "SKIP", "BUFFER", "WINDOW", "HISTORY", "IMG",
                    "IMGSZ", "SIZE", "CROP", "REF_W", "REF_H", "WIDTH", "HEIGHT",
                    "RES", "SECONDS", "DURATION", "INTERVAL", "TTL", "WIN_",
                    "CONSEC", "STRIDE", "QUEUE", "BATCH", "PAD", "ZOOM", "LEN",
                    "PROC_", "EVERY", "GRACE", "HOLD", "WATCH", "COOLDOWN")
# Sufijos de tiempo: solo al final del nombre ("_S" como substring atrapaba
# cualquier palabra con S y mandaba umbrales al grupo de video)
_SPEC_TIME_SUFFIX = ("_S", "_MS", "_SEC", "_SECONDS", "_SEG")
_SPEC_THR_KEYS   = ("THR", "THRESH", "CONF", "MIN", "MAX", "SIGMA", "GAMMA",
                    "RATIO", "ALERT", "COOLDOWN", "SCORE", "IOU", "TOL", "PCT",
                    "FRAC", "CENTER", "SCALE", "LOW", "HIGH", "HITS", "VOTE", "STD",
                    "_TH", "_PX", "DIST", "EMA", "PERSIST", "BACKOFF", "MARGIN",
                    "P_HI", "P_LO", "DEG", "ANGLE", "FACTOR", "ESCALATION", "QUANT",
                    "DESC", "STEP", "DROP", "COLLAPSE", "RECOVER")
# Colores, tamaños de panel y mosaicos: son del overlay, no del modelo
_SPEC_UI_RE = re.compile(
    r"^C_|COLOR|^VIEW_|PANEL|MOSAIC|^GRID_(COLS|ROWS)$|^INFO_H$|^FRANJA|"
    r"^HEATMAP|^ZONE_ALPHA$|^ANCHO$|^ALTO$|^PATCH_GRID")
# Interruptores de comportamiento (--no-clip, --hide-zones, --save…)
_SPEC_MODE_RE = re.compile(r"^(NO|HIDE|SHOW|USE|ENABLE|DISABLE|ONLY|SAVE|DRY|FORCE)_|_ONLY$")
# Nunca publicar valores que parezcan credenciales, aunque hoy estén en None
_SPEC_SECRET_RE = re.compile(r"KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|_PWD")

SPEC_GROUPS = [
    ("modelos",  "Modelos, pesos y clases"),
    ("video",    "Video, frames y ventanas"),
    ("umbrales", "Umbrales y geometría de decisión"),
    ("modos",    "Interruptores y modos"),
    ("interfaz", "Visualización del panel"),
    ("otros",    "Otros parámetros (recursos, rutas, puertos)"),
]


def _spec_group(name: str, source: str) -> str:
    n = name.upper()
    if _SPEC_MODE_RE.search(n):
        return "modos"
    if _SPEC_UI_RE.search(n):
        return "interfaz"
    if any(k in n for k in _SPEC_MODEL_KEYS) or \
       re.search(r"\.(pt|pth|onnx|engine|safetensors|tflite)\b", source) or \
       re.search(r"ViT-[BL]", source):
        return "modelos"
    if any(k in n for k in _SPEC_VIDEO_KEYS) or n.endswith(_SPEC_TIME_SUFFIX):
        return "video"
    if any(k in n for k in _SPEC_THR_KEYS):
        return "umbrales"
    return "otros"


def _spec_value(name: str, source: str) -> str:
    """Valor listo para publicar: credenciales redactadas, largo acotado."""
    if _SPEC_SECRET_RE.search(name.upper()) and source.strip() not in ("None", "''", '""'):
        return "•••• (redactado)"
    return source if len(source) <= 160 else source[:157] + "…"


def _script_rank(name: str) -> tuple:
    """Production primero, luego el panel web, luego el resto y al final debug.
    Dentro de cada grupo gana la version mas alta (V7 antes que V0), si no la
    ficha mostraba scripts viejos abandonados."""
    low = name.lower()
    m   = re.search(r"_v(\d+)", low)
    ver = -int(m.group(1)) if m else 0
    if "production" in low:              return (0, ver, low)
    if "_web" in low or "web_" in low:   return (1, ver, low)
    if "debug" in low:                   return (3, ver, low)
    return (2, ver, low)


def _line_comment(lines: list[str], *linenos) -> str:
    """Comentario al final de una línea (se prueban varias, en orden)."""
    for ln in linenos:
        if ln and ln <= len(lines):
            m = re.search(r"#\s*(.+)$", lines[ln - 1])
            if m:
                return m.group(1).strip()
    return ""


def _seg(source: str, node) -> str:
    return re.sub(r"\s+", " ", ast.get_source_segment(source, node) or "").strip()


def _extract_arguments(tree, source: str, lines: list[str]) -> list[dict]:
    """Flags de `parser.add_argument(...)`.

    Los detectores montados sobre el framework `Base/` no declaran constantes:
    exponen sus parámetros (modelo, conf, imgsz, ventanas de frames, umbrales)
    como argumentos de línea de comandos. Sin esto la ficha salía vacía.
    """
    args = []
    for node in ast.walk(tree):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                and node.func.attr == "add_argument"):
            continue
        flags = [a.value for a in node.args
                 if isinstance(a, ast.Constant) and isinstance(a.value, str)]
        if not flags:
            continue
        flag  = next((f for f in flags if f.startswith("--")), flags[0])
        alias = [f for f in flags if f != flag]
        kw    = {k.arg: k.value for k in node.keywords if k.arg}

        tipo = ""
        if "type" in kw and isinstance(kw["type"], ast.Name):
            tipo = kw["type"].id
        action = kw["action"].value if isinstance(kw.get("action"), ast.Constant) else ""
        if action in ("store_true", "store_false"):
            tipo = "flag"

        if "default" in kw:
            default = _seg(source, kw["default"])
        elif action == "store_true":
            default = "False"
        elif action == "store_false":
            default = "True"
        else:
            default = "—"

        helptxt = ""
        if isinstance(kw.get("help"), ast.Constant) and isinstance(kw["help"].value, str):
            helptxt = " ".join(kw["help"].value.split())
        if not helptxt:
            helptxt = _line_comment(lines, node.end_lineno, node.lineno)

        choices = _seg(source, kw["choices"]) if "choices" in kw else ""

        name = flag.lstrip("-").replace("-", "_").upper()
        args.append({
            "flag":    flag,
            "alias":   " ".join(alias),
            "type":    tipo,
            "default": _spec_value(name, default),
            "choices": choices if len(choices) <= 90 else choices[:87] + "…",
            "help":    helptxt[:200],
            "group":   _spec_group(name, default),
            "line":    node.lineno,
        })
    args.sort(key=lambda a: a["line"])
    for a in args:
        a.pop("line", None)
    return args


def extract_script_specs(path: Path) -> dict | None:
    """Configuración de un script: constantes, atributos de clase y flags CLI.

    Se lee con `ast` — el código NUNCA se ejecuta ni se importa.
    """
    try:
        source = path.read_text(encoding="utf-8", errors="replace")
        tree   = ast.parse(source)
    except (OSError, SyntaxError):
        return None

    lines     = source.splitlines()
    constants = []
    skipped   = 0

    # Nivel de módulo + atributos MAYÚSCULAS de las clases (los detectores del
    # framework Base declaran NAME y sus colores como atributos de clase).
    scopes = [("", tree.body)]
    for node in tree.body:
        if isinstance(node, ast.ClassDef):
            scopes.append((node.name, node.body))

    for scope, body in scopes:
        for node in body:
            if not isinstance(node, ast.Assign) or len(node.targets) != 1:
                continue
            target = node.targets[0]
            if not isinstance(target, ast.Name):
                continue
            name = target.id
            if not re.fullmatch(r"[A-Z][A-Z0-9_]*", name):
                continue                         # privadas/minúsculas: ruido interno
            try:
                ast.literal_eval(node.value)     # solo literales
            except (ValueError, SyntaxError, TypeError, MemoryError, RecursionError):
                skipped += 1
                continue

            seg = _seg(source, node.value)
            if len(seg) > 400:                   # plantillas HTML/JS, prompts enormes
                skipped += 1
                continue

            constants.append({
                "name":    name,
                "scope":   scope,
                "value":   _spec_value(name, seg),
                "comment": _line_comment(lines, node.end_lineno, node.lineno),
                "group":   _spec_group(name, seg),
            })

    arguments = _extract_arguments(tree, source, lines)
    if not constants and not arguments:
        return None

    doc = ast.get_docstring(tree) or ""
    # Los monolitos abren su docstring con una línea decorativa (===== / -----)
    doc = re.sub(r"[=~-]{4,}", " ", doc)
    doc = " ".join(doc.strip().split())

    return {
        "file":      path.name,
        "docstring": doc[:220],
        "lines":     len(lines),
        "constants": constants,
        "arguments": arguments,
        "skipped":   skipped,
    }


def detect_model_stack(scripts: list[Path]) -> list[str]:
    """Librerías y modelos de ML detectados en el código del modelo."""
    blob = ""
    for p in scripts[:8]:
        try:
            blob += p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
    found = []
    for pattern, label in SPEC_STACK_SIGNS:
        if label not in found and re.search(pattern, blob):
            found.append(label)
    return found


def build_model_spec(root: Path, rel_dir: str) -> dict | None:
    """Ficha técnica de una carpeta de modelo (o None si no hay código)."""
    d = root / rel_dir if rel_dir else root
    try:
        scripts = [p for p in d.glob("*.py") if p.is_file()]
        if not scripts:
            # Modelos que guardan el código en una subcarpeta (p. ej.
            # loitering/merodeo_version_2/), saltando lo vendorizado.
            scripts = [p for p in d.glob("*/*.py")
                       if p.is_file() and not _skip_path(p.relative_to(root))]
        scripts = sorted(scripts, key=lambda p: _script_rank(p.name))
    except OSError:
        return None
    if not scripts:
        return None

    blocks, used = [], []
    for p in scripts:
        if len(blocks) >= 2:                      # con 2 scripts ya se entiende
            break
        spec = extract_script_specs(p)
        if spec:
            blocks.append(spec)
            used.append(p)

    # El stack se detecta SOLO en los scripts que la ficha muestra (Production
    # primero): mirando toda la carpeta se colaban librerías de versiones viejas
    # ya abandonadas (p. ej. ST-GCN del V0 en un modelo que hoy no lo usa).
    stack = detect_model_stack(used or scripts[:2])
    if not blocks and not stack:
        return None

    return {
        "stack":   stack,
        "scripts": blocks,
        "others":  [p.name for p in scripts if p.name not in {b["file"] for b in blocks}][:12],
        "params":  sum(len(b["constants"]) + len(b["arguments"]) for b in blocks),
    }


def models_docs_config() -> dict:
    cfg = {**MODELS_DOCS_DEFAULTS, **(load_config().get("models_docs") or {})}
    env_dir = os.environ.get("MODELS_DOCS_DIR", "").strip()
    if env_dir:
        cfg["dir"] = env_dir
    cfg["repo_url"] = cfg["repo_url"].rstrip("/")
    return cfg


def resolve_docs_dir() -> Path | None:
    """Primera ruta existente: config/env, luego los candidatos por defecto."""
    cfg   = models_docs_config()
    order = ([cfg["dir"]] if cfg["dir"] else []) + DOCS_DIR_CANDIDATES
    for raw in order:
        if not raw:
            continue
        p = Path(raw)
        if not p.is_absolute():
            p = (BASE_DIR / p).resolve()
        if p.is_dir():
            return p
    return None


def _doc_kind(filename: str) -> str:
    up = filename.upper()
    if up.startswith("CONTRATO"):
        return "contrato"
    if up.startswith("DISENO") or up.startswith("DISEÑO"):
        return "diseno"
    return "guia"


def _md_title(text: str, fallback: str) -> str:
    """Primer '# heading' del markdown; si no hay, el nombre del archivo."""
    for line in text.splitlines()[:40]:
        line = line.strip()
        if line.startswith("# "):
            return line[2:].strip()
    return fallback


def _iso_from_ts(ts: float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).isoformat(timespec="seconds")


def _skip_path(rel: Path) -> bool:
    return any(part in DOCS_IGNORE_DIRS for part in rel.parts)


def scan_models_docs(root: Path) -> tuple[dict, dict]:
    """Recorre el repo de modelos.

    Devuelve (models, bodies):
      models  → { rel_dir: {dir, docs[], scripts[]} }  (sin el markdown)
      bodies  → { doc_id: markdown }
    """
    models: dict = {}
    bodies: dict = {}

    for md in sorted(root.rglob("*.md")):
        rel = md.relative_to(root)
        if len(rel.parts) > DOCS_MAX_DEPTH or _skip_path(rel):
            continue
        try:
            if md.stat().st_size == 0:
                continue                       # placeholder vacío, no es doc
            text = md.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if not text.strip():
            continue

        rel_dir = rel.parent.as_posix()
        rel_dir = "" if rel_dir == "." else rel_dir
        doc_id  = rel.as_posix()
        kind    = _doc_kind(md.name)
        bodies[doc_id] = text
        entry = models.setdefault(rel_dir, {"dir": rel_dir, "docs": [], "scripts": []})
        entry["docs"].append({
            "id":       doc_id,
            "filename": md.name,
            "kind":     kind,
            "title":    _md_title(text, md.stem.replace("_", " ")),
            "bytes":    md.stat().st_size,
            "mtime":    _iso_from_ts(md.stat().st_mtime),
        })

    # Scripts que acompañan a cada doc (contexto útil en la ficha)
    for rel_dir, entry in models.items():
        d = root / rel_dir if rel_dir else root
        try:
            entry["scripts"] = sorted(p.name for p in d.glob("*.py"))[:14]
        except OSError:
            entry["scripts"] = []

    # Carpetas de modelo sin ningún .md → se listan como "documentación pendiente"
    documented_roots = {rd.split("/")[0] for rd in models if rd}
    try:
        top_dirs = sorted(p.name for p in root.iterdir() if p.is_dir())
    except OSError:
        top_dirs = []
    for name in top_dirs:
        if name in DOCS_IGNORE_DIRS or name in documented_roots:
            continue
        scripts = []
        try:
            scripts = sorted(p.name for p in (root / name).rglob("*.py")
                             if not _skip_path(p.relative_to(root)))[:14]
        except OSError:
            pass
        models[name] = {"dir": name, "docs": [], "scripts": scripts}

    return models, bodies


def build_docs_book() -> dict:
    """Arma el librito completo (capítulos + fichas + markdown). Lanza si no hay repo."""
    root = resolve_docs_dir()
    if root is None:
        raise FileNotFoundError(
            "No se encontró el repo de modelos. Configurar models_docs.dir en "
            "config.json o la env var MODELS_DOCS_DIR."
        )

    cfg              = models_docs_config()
    repo             = cfg["repo_url"]
    models, bodies   = scan_models_docs(root)
    by_chapter: dict = {c["key"]: [] for c in BOOK_CHAPTERS}

    for rel_dir, entry in models.items():
        card    = MODEL_CARDS.get(rel_dir, {})
        chapter = card.get("chapter", "otros")
        if chapter not in by_chapter:
            chapter = "otros"
        docs = sorted(entry["docs"], key=lambda d: (DOC_KINDS[d["kind"]]["order"], d["filename"]))
        name = rel_dir.split("/")[-1] if rel_dir else "Models"
        by_chapter[chapter].append({
            "key":         rel_dir or "_root",
            "dir":         rel_dir,
            "title":       card.get("title") or name,
            "short":       name,
            "tagline":     card.get("tagline", ""),
            "detects":     card.get("detects", ""),
            "ingredients": card.get("ingredients", []),
            "inputs":      card.get("inputs", ""),
            "outputs":     card.get("outputs", ""),
            "stage":       card.get("stage", "research"),
            "curated":     bool(card),
            "repo_url":    f"{repo}/{rel_dir}" if rel_dir else repo,
            "scripts":     entry["scripts"],
            "hardware":    card.get("hardware", ""),
            "spec":        build_model_spec(root, rel_dir),
            "docs":        [{**d,
                             "repo_url": f"{repo}/{d['id']}".replace("/tree/", "/blob/"),
                             "kind_label": DOC_KINDS[d["kind"]]["label"],
                             "kind_icon":  DOC_KINDS[d["kind"]]["icon"],
                             "kind_hint":  DOC_KINDS[d["kind"]]["hint"]} for d in docs],
        })

    # Orden dentro del capítulo: primero los que tienen doc, luego alfabético
    order_hint = {k: i for i, k in enumerate(MODEL_CARDS)}
    for key, items in by_chapter.items():
        items.sort(key=lambda m: (not m["docs"], order_hint.get(m["dir"], 999), m["title"].lower()))

    chapters = [{**c, "models": by_chapter[c["key"]]}
                for c in BOOK_CHAPTERS if by_chapter[c["key"]]]

    n_docs   = sum(len(m["docs"]) for c in chapters for m in c["models"])
    n_models = sum(len(c["models"]) for c in chapters)
    return {
        "synced_at":    _now_iso(),
        "last_attempt": _now_iso(),
        "ok":           True,
        "error":        None,
        "source":       str(root),
        "repo_url":     repo,
        "kinds":        DOC_KINDS,
        "spec_groups":  [{"key": k, "title": t} for k, t in SPEC_GROUPS],
        "stats": {
            "chapters":  len(chapters),
            "models":    n_models,
            "documents": n_docs,
            "pending":   sum(1 for c in chapters for m in c["models"] if not m["docs"]),
            "specs":     sum(1 for c in chapters for m in c["models"] if m.get("spec")),
            "params":    sum((m.get("spec") or {}).get("params", 0) for c in chapters for m in c["models"]),
            "bytes":     sum(len(v.encode("utf-8")) for v in bodies.values()),
        },
        "chapters": chapters,
        "bodies":   bodies,
    }


def load_docs_cache() -> dict:
    if DOCS_CACHE.exists():
        try:
            return json.loads(DOCS_CACHE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_docs_cache(data: dict) -> None:
    tmp = DOCS_CACHE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(DOCS_CACHE)


# ══════════════════════════════════════════════════════════════════════════════
#  REQUERIMIENTOS (machote de pre-ingeniería)
# ══════════════════════════════════════════════════════════════════════════════
# `requisitos/PREINGENIERIA_MACHOTE.html` es el cuestionario que se entrega al
# cliente antes de comprometer alcance. Aquí se parsea a bloques (encabezados,
# tablas, avisos, notas, campos) para mostrarlo dentro de la plataforma con el
# estilo del sitio, sin perder el original: el HTML se sigue sirviendo tal cual
# para llenarlo e imprimirlo.
#
# El machote se actualiza reemplazando ese archivo (o apuntando
# `requisitos.file` de config.json / la env var REQUISITOS_FILE a otra ruta).

REQUISITOS_CANDIDATES = [
    "requisitos/PREINGENIERIA_MACHOTE.html",
    "../Full_CV/PREINGENIERIA_MACHOTE.html",
]

# Etiquetas inline que se conservan del machote (HTML propio, no de terceros)
RQ_INLINE = {"strong", "b", "em", "i", "code", "br", "span", "sup", "sub", "u"}
RQ_SKIP   = {"style", "script", "button", "head", "title", "meta"}

# Rol de cada tabla, deducido de sus encabezados: permite presentarlas distinto
# (preguntas, criterios de aceptación, umbrales por caso de uso, etc.)
RQ_TABLE_ROLES = [
    ("casos",           ("píxeles mínimos", "aplica")),
    ("estados",         ("en qué consiste", "qué puede comprometerse")),
    ("calibracion",     ("parámetros que se ajustan",)),
    ("etapas",          ("etapa", "responsable")),
    ("preguntas",       ("pregunta",)),
    ("criterio",        ("criterio medible",)),
    ("material",        ("material", "entregado")),
    ("viabilidad",      ("resultado", "consecuencia")),
    ("consideraciones", ("punto", "descripción")),
    ("acuse",           ("por el cliente",)),
    ("camaras",         ("cámara", "casos de uso solicitados")),
    ("contactos",       ("rol requerido",)),
    ("ficha",           ("dirigido a",)),
]

# Caso de uso del machote → modelos del librito que lo implementan.
# La clave es un fragmento en minúsculas del nombre del caso.
REQ_CASE_MODELS = {
    "conteo de personas":        ["areaRest/ContadorFlujo"],
    "aforo y aglomeración":      ["areaRest/ContadorAforo"],
    "filas y zonas de atención": ["CashierPresence"],
    "conteo de objetos":         ["trackingObjects"],
    "reconocimiento facial":     ["areaRest/face_runner"],
    "demografía":                ["areaRest/face_runner"],
    "zonas restringidas":        ["areaRest/ZonaRestringida_ReID"],
    "búsqueda de una persona":   ["areaRest/ZonaRestringida_ReID"],
    "detección de caídas":       ["Falling"],
    "fuego y humo":              ["Fire"],
    "riñas y agresiones":        ["Figthing"],
    "robo con violencia":        ["Robbery", "Shoplifting"],
    "zonas prohibidas":          ["areaRest/ZonaRestringida_ReID", "parkingCars"],
}


def _rq_clean(html: str) -> str:
    return re.sub(r"\s+", " ", html).strip()


class MachoteParser(HTMLParser):
    """HTML del machote → lista de bloques serializables.

    Genérico a propósito: si el machote cambia de contenido, la sección lo
    refleja sin tocar este código (solo los roles de tabla son por encabezado).
    """

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks   = []
        self._skip    = 0
        self._bufs    = []        # pila de acumuladores inline
        self._block   = None
        self._table   = None
        self._row     = None
        self._cell    = None
        self._in_head = False
        self._fields  = 0
        self._list    = None

    # ── utilidades ────────────────────────────────────────────────────────
    def _classes(self, attrs):
        return (dict(attrs).get("class") or "").split()

    # Pila: un <li> dentro de .instrucciones no debe borrar el texto que ya
    # llevaba el bloque contenedor.
    def _start_buf(self):
        self._bufs.append([])
        self._fields = 0

    def _take_buf(self):
        return _rq_clean("".join(self._bufs.pop() if self._bufs else []))

    def _write(self, s):
        if self._bufs:
            self._bufs[-1].append(s)

    # ── apertura ──────────────────────────────────────────────────────────
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in RQ_SKIP:
            self._skip += 1
            return
        if self._skip:
            return

        if tag == "table":
            self._table = {"type": "table", "role": "", "classes": self._classes(attrs),
                           "head": [], "rows": []}
            return
        if tag == "thead":
            self._in_head = True
            return
        if tag == "tr" and self._table is not None:
            self._row = []
            return
        if tag in ("th", "td") and self._table is not None:
            self._cell = {
                "colspan": int(a.get("colspan", 1) or 1),
                "align":   "center" if "center" in (a.get("style") or "") else "",
                "num":     "num" in self._classes(attrs),
                "porque":  "col-porque" in self._classes(attrs),
                "header":  tag == "th",
            }
            self._start_buf()
            return

        if tag in ("input", "textarea"):
            kind = "checkbox" if a.get("type") == "checkbox" else (
                   "textarea" if tag == "textarea" else "text")
            hint = a.get("placeholder", "")
            self._fields += 1
            attr = f' data-hint="{hint}"' if hint else ""
            self._write(f'<span class="rq-field rq-field-{kind}"{attr}></span>')
            return

        if tag == "div":
            cls = self._classes(attrs)
            if "pie" in cls:                       # el pie del machote no se replica
                self._skip += 1
                return
            for kind in ("aviso", "nota", "instrucciones"):
                if kind in cls:
                    self._block = {"type": kind, "title": ""}
                    self._start_buf()
                    return
            return

        if tag in ("ul", "ol"):
            self._list = {"type": "list", "ordered": tag == "ol", "items": []}
            return
        if tag == "li" and self._list is not None:
            self._start_buf()
            return

        if tag in ("h1", "h2", "h3", "h4"):
            self._block = {"type": "heading", "level": int(tag[1]),
                           "salto": "salto" in self._classes(attrs)}
            self._start_buf()
            return

        if tag == "p":
            self._block = {"type": "p", "classes": self._classes(attrs)}
            self._start_buf()
            return

        if tag in RQ_INLINE:
            if tag == "span" and "titulo" in self._classes(attrs) and \
               self._block and self._block.get("type") == "aviso":
                self._block["_intitulo"] = True
                self._block["_titulo"] = []
                return
            if tag == "br":
                self._write("<br>")
                return
            cls = " ".join(c for c in self._classes(attrs) if c in ("campo", "opcional"))
            # Sin backslashes dentro de la expresión: Python 3.11 (el del
            # contenedor) no los admite en f-strings.
            attr = ' class="%s"' % cls if cls else ""
            self._write(f"<{tag}{attr}>")
            return

    # ── cierre ────────────────────────────────────────────────────────────
    def handle_endtag(self, tag):
        if tag in RQ_SKIP:
            self._skip = max(0, self._skip - 1)
            return
        if self._skip:
            return

        if tag == "table" and self._table is not None:
            cells = self._table["head"] or (self._table["rows"][0] if self._table["rows"] else [])
            heads = " ".join(c["html"].lower() for c in cells)
            for role, keys in RQ_TABLE_ROLES:
                if all(k in heads for k in keys):
                    self._table["role"] = role
                    break
            if "criterio" in self._table["classes"]:
                self._table["role"] = "criterio"
            if "ficha" in self._table["classes"]:
                self._table["role"] = "ficha"
            self.blocks.append(self._table)
            self._table = None
            return

        if tag == "thead":
            self._in_head = False
            return

        if tag == "tr" and self._row is not None:
            if self._in_head or (not self._table["head"] and
                                 self._row and all(c["header"] for c in self._row)):
                self._table["head"] = self._row
            else:
                self._table["rows"].append(self._row)
            self._row = None
            return

        if tag in ("th", "td") and self._cell is not None:
            self._cell["html"]   = self._take_buf()
            self._cell["fields"] = self._fields
            self._row.append(self._cell)
            self._cell = None
            return

        if tag == "li" and self._list is not None:
            self._list["items"].append(self._take_buf())
            return

        if tag in ("ul", "ol") and self._list is not None:
            if self._list["items"]:
                if self._block and self._block.get("type") in ("instrucciones", "aviso", "nota"):
                    self._block.setdefault("items", []).extend(self._list["items"])
                else:
                    self.blocks.append(self._list)
            self._list = None
            return

        if tag == "div" and self._block and \
           self._block["type"] in ("aviso", "nota", "instrucciones"):
            self._block["html"] = self._take_buf()
            self._block.pop("_intitulo", None)
            self._block.pop("_titulo", None)
            self.blocks.append(self._block)
            self._block = None
            return

        if tag in ("h1", "h2", "h3", "h4") and self._block and self._block["type"] == "heading":
            self._block["text"] = re.sub(r"<[^>]+>", "", self._take_buf()).strip()
            self.blocks.append(self._block)
            self._block = None
            return

        if tag == "p" and self._block and self._block["type"] == "p":
            html = self._take_buf()
            if html:
                self._block["html"] = html
                self.blocks.append(self._block)
            self._block = None
            return

        if tag in RQ_INLINE and tag != "br":
            if self._block and self._block.get("_intitulo") and tag == "span":
                self._block["title"] = re.sub(r"<[^>]+>", "",
                                              "".join(self._block["_titulo"])).strip()
                self._block["_intitulo"] = False
                return
            self._write(f"</{tag}>")
            return

    def handle_data(self, data):
        if self._skip:
            return
        if self._block and self._block.get("_intitulo"):
            self._block["_titulo"].append(data)
            return
        self._write(data)


def requisitos_config() -> dict:
    cfg  = {"file": "", **(load_config().get("requisitos") or {})}
    env  = os.environ.get("REQUISITOS_FILE", "").strip()
    if env:
        cfg["file"] = env
    return cfg


def resolve_requisitos_file() -> Path | None:
    order = ([requisitos_config()["file"]] if requisitos_config()["file"] else []) \
            + REQUISITOS_CANDIDATES
    for raw in order:
        if not raw:
            continue
        p = Path(raw)
        if not p.is_absolute():
            p = (BASE_DIR / p).resolve()
        if p.is_file():
            return p
    return None


def _rq_case_models(name: str) -> list:
    """Modelos del librito que implementan un caso de uso del machote.
    Devuelve [{dir, title}] tomando el titulo curado de MODEL_CARDS."""
    plain = re.sub(r"<[^>]+>", "", name).lower()
    for key, dirs in REQ_CASE_MODELS.items():
        if key in plain:
            return [{"dir": d,
                     "title": (MODEL_CARDS.get(d) or {}).get("title") or d.split("/")[-1]}
                    for d in dirs]
    return []


def build_requisitos() -> dict:
    """Machote → bloques + índice de apartados. Lanza si no existe el archivo."""
    path = resolve_requisitos_file()
    if path is None:
        raise FileNotFoundError(
            "No se encontró el machote de pre-ingeniería. Se busca en "
            "requisitos/PREINGENIERIA_MACHOTE.html o en la ruta de "
            "requisitos.file / REQUISITOS_FILE."
        )

    text   = path.read_text(encoding="utf-8", errors="replace")
    parser = MachoteParser()
    parser.feed(text)
    blocks = parser.blocks

    # Índice: cada h2 abre un apartado; los h3 son sus subapartados
    indice, apartado = [], None
    for i, b in enumerate(blocks):
        if b["type"] != "heading":
            continue
        if b["level"] == 2:
            apartado = {"text": b["text"], "index": i, "subs": []}
            indice.append(apartado)
        elif b["level"] == 3 and apartado:
            apartado["subs"].append({"text": b["text"], "index": i})

    # Casos de uso con su umbral y los modelos del librito que los implementan
    casos = []
    for b in blocks:
        if b["type"] == "table" and b["role"] == "casos":
            for row in b["rows"]:
                if len(row) < 6:
                    continue
                nombre = re.sub(r"<[^>]+>", "", row[1]["html"]).strip()
                if not nombre or "otros" in nombre.lower():
                    continue
                casos.append({
                    "caso":   nombre,
                    "px":     re.sub(r"<[^>]+>", "", row[3]["html"]).strip(),
                    "angulo": re.sub(r"<[^>]+>", "", row[4]["html"]).strip(),
                    "techo":  re.sub(r"<[^>]+>", "", row[5]["html"]).strip(),
                    "models": _rq_case_models(nombre),
                })

    title = next((b["text"] for b in blocks
                  if b["type"] == "heading" and b["level"] == 1), "Pre-ingeniería")
    subtitle = next((re.sub(r"<[^>]+>", "", b["html"]) for b in blocks
                     if b["type"] == "p" and "subtitulo" in b.get("classes", [])), "")

    counts = {"apartados": len(indice), "tablas": sum(1 for b in blocks if b["type"] == "table"),
              "avisos": sum(1 for b in blocks if b["type"] == "aviso"),
              "notas": sum(1 for b in blocks if b["type"] == "nota"),
              "preguntas": sum(len(b["rows"]) for b in blocks
                               if b["type"] == "table" and b["role"] == "preguntas"),
              "criterios": sum(len(b["rows"]) for b in blocks
                               if b["type"] == "table" and b["role"] == "criterio"),
              "casos": len(casos)}

    return {
        "synced_at":    _now_iso(),
        "last_attempt": _now_iso(),
        "ok":           True,
        "error":        None,
        "source":       str(path),
        "machote_url":  f"/requisitos/{path.name}" if path.parent == REQUISITOS_DIR else "",
        "mtime":        _iso_from_ts(path.stat().st_mtime),
        "title":        title,
        "subtitle":     subtitle,
        "indice":       indice,
        "casos":        casos,
        "stats":        counts,
        "blocks":       blocks,
    }


def load_requisitos_cache() -> dict:
    if REQUISITOS_CACHE.exists():
        try:
            return json.loads(REQUISITOS_CACHE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_requisitos_cache(data: dict) -> None:
    tmp = REQUISITOS_CACHE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(REQUISITOS_CACHE)


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="CV Celestial Docs", docs_url=None, redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── API routes ────────────────────────────────────────────────────────────────

@app.get("/api/projects")
def get_projects():
    return JSONResponse(load_projects())


class ProjectsBody(BaseModel):
    data:  dict
    token: str = ""


@app.post("/api/projects")
def post_projects(body: ProjectsBody):
    if not is_valid_token(body.token):
        raise HTTPException(status_code=401, detail="Token inválido")
    save_projects(body.data)
    return {"ok": True}


@app.get("/api/infra")
def get_infra():
    return JSONResponse(load_infra())


@app.post("/api/infra")
def post_infra(body: ProjectsBody):
    if not is_valid_token(body.token):
        raise HTTPException(status_code=401, detail="Token inválido")
    save_infra(body.data)
    return {"ok": True}


@app.get("/api/equipo")
def get_equipo():
    return JSONResponse(load_equipo())


@app.post("/api/equipo")
def post_equipo(body: ProjectsBody):
    if not is_valid_token(body.token):
        raise HTTPException(status_code=401, detail="Token inválido")
    save_equipo(body.data)
    return {"ok": True}


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


# ── Catálogo Full_CV (solo lectura, con caché) ────────────────────────────────

@app.get("/api/fullcv/catalog")
def fullcv_catalog(refresh: int = 0):
    """Snapshot del catálogo de modelos de Full_CV.

    Devuelve siempre 200: si Full_CV no responde se sirve el último caché
    con ok:false para que el frontend indique datos desactualizados.
    """
    cache = load_fullcv_cache()
    ttl   = fullcv_config()["sync_ttl_seconds"]

    fresh = False
    if cache.get("synced_at") and not refresh:
        try:
            age   = datetime.now(timezone.utc) - datetime.fromisoformat(cache["synced_at"])
            fresh = age.total_seconds() < ttl
        except Exception:
            fresh = False

    if fresh:
        return JSONResponse(cache)

    try:
        snapshot = fetch_fullcv_snapshot()
        save_fullcv_cache(snapshot)
        return JSONResponse(snapshot)
    except Exception as e:
        # Full_CV apagado o inaccesible: conservar models/synced_at previos
        cache["ok"]           = False
        cache["error"]        = str(e)
        cache["last_attempt"] = _now_iso()
        cache.setdefault("models", [])
        cache.setdefault("profiles", {})
        cache.setdefault("synced_at", None)
        save_fullcv_cache(cache)
        return JSONResponse(cache)


# ── Documentación de modelos (solo lectura, con caché) ────────────────────────

@app.get("/api/docs/catalog")
def docs_catalog(refresh: int = 0):
    """El librito completo: capítulos, fichas de modelo y markdown de cada doc.

    Devuelve siempre 200. Si el repo de modelos no está disponible se sirve el
    último snapshot con ok:false, para que el frontend avise que puede estar
    desactualizado sin dejar la sección vacía.
    """
    cache = load_docs_cache()
    ttl   = models_docs_config()["sync_ttl_seconds"]

    fresh = False
    if cache.get("synced_at") and not refresh:
        try:
            age   = datetime.now(timezone.utc) - datetime.fromisoformat(cache["synced_at"])
            fresh = age.total_seconds() < ttl
        except Exception:
            fresh = False

    if fresh:
        return JSONResponse(cache)

    try:
        book = build_docs_book()
        save_docs_cache(book)
        return JSONResponse(book)
    except Exception as e:
        cache["ok"]           = False
        cache["error"]        = str(e)
        cache["last_attempt"] = _now_iso()
        cache.setdefault("chapters", [])
        cache.setdefault("bodies", {})
        cache.setdefault("kinds", DOC_KINDS)
        cache.setdefault("spec_groups", [{"key": k, "title": t} for k, t in SPEC_GROUPS])
        cache.setdefault("stats", {"chapters": 0, "models": 0, "documents": 0, "pending": 0, "bytes": 0})
        cache.setdefault("synced_at", None)
        cache.setdefault("repo_url", models_docs_config()["repo_url"])
        if cache.get("synced_at"):
            save_docs_cache(cache)
        return JSONResponse(cache)


# ── Requerimientos / pre-ingeniería (solo lectura, con caché) ─────────────────

@app.get("/api/requisitos")
def requisitos_catalog(refresh: int = 0):
    """El machote de pre-ingeniería parseado a bloques.

    Igual que el librito: si el archivo no está disponible se sirve el último
    snapshot con ok:false en vez de dejar la sección vacía.
    """
    cache = load_requisitos_cache()
    ttl   = 300

    fresh = False
    if cache.get("synced_at") and not refresh:
        try:
            age   = datetime.now(timezone.utc) - datetime.fromisoformat(cache["synced_at"])
            fresh = age.total_seconds() < ttl
        except Exception:
            fresh = False
    if fresh:
        return JSONResponse(cache)

    try:
        data = build_requisitos()
        save_requisitos_cache(data)
        return JSONResponse(data)
    except Exception as e:
        cache["ok"]           = False
        cache["error"]        = str(e)
        cache["last_attempt"] = _now_iso()
        for key, default in (("blocks", []), ("indice", []), ("casos", []),
                             ("stats", {}), ("title", "Pre-ingeniería"),
                             ("subtitle", ""), ("machote_url", ""), ("synced_at", None)):
            cache.setdefault(key, default)
        if cache.get("synced_at"):
            save_requisitos_cache(cache)
        return JSONResponse(cache)


# ── Evidencias (solo lectura) ─────────────────────────────────────────────────

@app.get("/api/solutions")
def get_solutions():
    return JSONResponse(load_solutions_meta())


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
}


# Cabeceras anti-caché: sin esto el navegador reusa la versión vieja de JS/CSS
# sin revalidar y los cambios no se ven aunque se reinicie el servidor.
NO_CACHE_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma":        "no-cache",
    "Expires":       "0",
}


@app.get("/")
def serve_index():
    return FileResponse(BASE_DIR / "inicio.html", headers=NO_CACHE_HEADERS)


# Archivos que nunca deben servirse (contienen tokens/credenciales)
BLOCKED_FILES = {"config.json"}

# Páginas fusionadas en equipo.html (URLs viejas siguen funcionando)
REDIRECTS = {"organigrama.html": "/equipo.html", "vision.html": "/equipo.html"}


@app.get("/{path:path}")
def serve_static(path: str):
    if path in REDIRECTS:
        return RedirectResponse(REDIRECTS[path], status_code=301)
    # No exponer archivos fuera del directorio base
    try:
        target = (BASE_DIR / path).resolve()
        target.relative_to(BASE_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    if target.name in BLOCKED_FILES:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    if target.exists() and target.is_file() and target.suffix in STATIC_EXTENSIONS:
        return FileResponse(target, headers=NO_CACHE_HEADERS)

    # Fallback a la página de inicio
    return FileResponse(BASE_DIR / "inicio.html", headers=NO_CACHE_HEADERS)


# ── Arranque ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("── CV Celestial Docs Server ──────────────────────")

    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        local_ip = "127.0.0.1"

    print(f"  Local  : http://localhost:8090")
    print(f"  Red    : http://{local_ip}:8090")
    print("──────────────────────────────────────────────────")

    uvicorn.run(app, host="0.0.0.0", port=8090, log_level="warning")
