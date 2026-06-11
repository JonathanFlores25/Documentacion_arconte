"""
roadmap_parser.py
-----------------
Lee los archivos xlsx o csv de RoadMaps/ y genera roadmap.json en el directorio base.
Se ejecuta via POST /api/reload o al arrancar main.py.

Formato esperado de columnas (CSV o primera hoja xlsx):
    tipo, proyecto, fecha_inicio, fecha_fin, semana_inicio, semana_fin,
    Fases, titulo, descripcion, area, responsable, status

Ejemplo de fila:
    tarea,arconte_retail,20/04/2026,24/04/2026,S1,S1,1,Planeación,...,PM,Abelardo,COMPLETADO
"""

import csv
import json
import re
from pathlib import Path

try:
    import openpyxl
    HAS_OPENPYXL = True
except ImportError:
    HAS_OPENPYXL = False


# ── Helpers ───────────────────────────────────────────────────────────────────

def parse_date(val) -> str | None:
    """Parsea fechas DD/MM/YYYY o YYYY-MM-DD → ISO 'YYYY-MM-DD'. Retorna None si falla."""
    s = str(val).strip() if val is not None else ""
    if not s or s.lower() in ("none", "nan", ""):
        return None
    # DD/MM/YYYY
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return f"{y}-{mo:02d}-{d:02d}"
    # YYYY-MM-DD already
    if re.match(r"\d{4}-\d{2}-\d{2}", s):
        return s[:10]
    return None


def cell_str(val) -> str:
    """Convierte un valor de celda a cadena limpia."""
    if val is None:
        return ""
    s = str(val).strip()
    return "" if s.lower() in ("none", "nan") else s


# ── Readers ───────────────────────────────────────────────────────────────────

def read_csv(path: Path) -> list[dict]:
    """Lee un CSV (UTF-8 o UTF-8-BOM) y devuelve lista de dicts."""
    text = path.read_text(encoding="utf-8-sig", errors="replace")
    reader = csv.DictReader(text.splitlines())
    return [row for row in reader]


def read_xlsx(path: Path) -> list[dict]:
    """
    Lee la primera hoja del xlsx y devuelve lista de dicts.
    Busca la fila de encabezados buscando la celda 'tipo' o 'Fases'.
    """
    wb = openpyxl.load_workbook(str(path), data_only=True)
    ws = wb.active

    all_rows = list(ws.iter_rows(min_row=1, values_only=True))
    if not all_rows:
        return []

    # Localizar la fila de encabezados
    header_idx = None
    headers: list[str] = []
    for i, row in enumerate(all_rows):
        cells_lower = [cell_str(c).lower() for c in row]
        if "tipo" in cells_lower or "fases" in cells_lower:
            headers = [cell_str(c) for c in row]
            header_idx = i
            break

    if header_idx is None:
        print("[roadmap_parser] No se encontró fila de encabezados en el xlsx")
        return []

    result = []
    for row in all_rows[header_idx + 1:]:
        if not any(c for c in row if c is not None):
            continue
        d: dict = {}
        for j, col_name in enumerate(headers):
            if col_name and j < len(row):
                d[col_name] = row[j]
        result.append(d)
    return result


# ── Core parser ───────────────────────────────────────────────────────────────

def rows_to_roadmap(rows: list[dict], target_proyecto: str = "arconte_retail") -> dict:
    """
    Convierte lista de filas en estructura de roadmap.
    Agrupa tareas por número de fase (columna 'Fases').
    """
    # Filtrar filas de tipo 'tarea' del proyecto correcto
    task_rows = []
    for r in rows:
        tipo = cell_str(r.get("tipo", "")).lower()
        proj = cell_str(r.get("proyecto", "")).lower().replace(" ", "_")
        if tipo == "tarea" and proj == target_proyecto:
            task_rows.append(r)

    if not task_rows:
        print(f"[roadmap_parser] No se encontraron tareas para '{target_proyecto}'")

    # Agrupar por número de fase
    phases_map: dict[int, list] = {}
    for r in task_rows:
        raw = cell_str(r.get("Fases") or r.get("fases") or "")
        try:
            fase_num = int(float(raw))
        except (ValueError, TypeError):
            continue
        if fase_num not in phases_map:
            phases_map[fase_num] = []
        phases_map[fase_num].append(r)

    phases = []
    for fase_num in sorted(phases_map.keys()):
        fase_rows = phases_map[fase_num]

        # Rango de fechas de la fase = min inicio / max fin de sus tareas
        starts = [parse_date(r.get("fecha_inicio")) for r in fase_rows]
        ends   = [parse_date(r.get("fecha_fin"))   for r in fase_rows]
        starts = [s for s in starts if s]
        ends   = [e for e in ends   if e]
        start_iso = min(starts) if starts else None
        end_iso   = max(ends)   if ends   else None

        # Estado de la fase
        statuses = [cell_str(r.get("status", "")).upper() for r in fase_rows]
        if all(s == "COMPLETADO" for s in statuses):
            phase_status = "done"
        elif any(s in ("EN ESPERA", "EN_ESPERA", "PAUSED") for s in statuses):
            phase_status = "paused"
        else:
            phase_status = "active"

        # Dependencias de la fase (columna depends_on / depende_de / fase_previa)
        # Valor: número(s) de fase separados por coma, ej. "4" o "1,3"
        depends_on: list[int] = []
        for r in fase_rows:
            raw_dep = cell_str(
                r.get("depends_on") or r.get("depende_de") or r.get("fase_previa") or ""
            )
            if raw_dep:
                for part in re.split(r"[,;\s]+", raw_dep):
                    part = part.strip()
                    try:
                        dep_num = int(float(part))
                        if dep_num not in depends_on:
                            depends_on.append(dep_num)
                    except (ValueError, TypeError):
                        pass
                break  # tomar el primer valor no vacío de las filas de la fase

        # Construir tareas
        tasks = []
        for idx, r in enumerate(fase_rows, start=1):
            status_raw = cell_str(r.get("status", "")).upper()
            # Descripción: preferir 'descripcion', fallback a 'titulo'
            desc = cell_str(r.get("descripcion") or r.get("descripción") or r.get("titulo") or "")
            if not desc:
                desc = cell_str(r.get("titulo", ""))
            tasks.append({
                "id": f"{fase_num}_{idx}",
                "area": cell_str(r.get("area", "")),
                "description": desc,
                "responsible": cell_str(r.get("responsable", "")),
                "done_xlsx": status_raw == "COMPLETADO",
            })

        phases.append({
            "title": f"Fase {fase_num}",
            "status": phase_status,
            "start_iso": start_iso,
            "end_iso": end_iso,
            "depends_on": depends_on,   # números de fase (1-indexed) de los que depende
            "tasks": tasks,
        })

    return {"phases": phases, "acuerdos": []}


# ── Entry point ───────────────────────────────────────────────────────────────

def parse_all(base_dir: Path) -> dict:
    roadmap_dir = base_dir / "RoadMaps"
    rows: list[dict] = []
    source = None

    if roadmap_dir.exists():
        # Preferir xlsx si openpyxl está disponible
        if HAS_OPENPYXL:
            for xlsx in sorted(roadmap_dir.glob("*.xlsx")):
                try:
                    rows = read_xlsx(xlsx)
                    source = xlsx
                    break
                except Exception as e:
                    print(f"[roadmap_parser] Error leyendo {xlsx.name}: {e}")

        # Fallback a CSV
        if not rows:
            for csv_file in sorted(roadmap_dir.glob("*.csv")):
                try:
                    rows = read_csv(csv_file)
                    source = csv_file
                    break
                except Exception as e:
                    print(f"[roadmap_parser] Error leyendo {csv_file.name}: {e}")

    if not rows:
        print(f"[roadmap_parser] No se encontró ningún archivo válido en {roadmap_dir}")
        return {}

    print(f"[roadmap_parser] Leyendo: {source.name} ({len(rows)} filas)")

    arconte_data = rows_to_roadmap(rows, target_proyecto="arconte_retail")

    roadmap = {"arconte_retail": arconte_data}

    output = base_dir / "roadmap.json"
    output.write_text(json.dumps(roadmap, indent=2, ensure_ascii=False), encoding="utf-8")

    n_phases = len(arconte_data["phases"])
    n_tasks  = sum(len(p["tasks"]) for p in arconte_data["phases"])
    print(f"[roadmap_parser] roadmap.json generado — {n_phases} fases, {n_tasks} tareas")
    return roadmap


if __name__ == "__main__":
    import sys
    base = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
    parse_all(base)
