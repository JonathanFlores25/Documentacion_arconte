"""
Carga las dependencias (`deps`) en el proyecto publicvector de projects.json,
desde RoadMaps/public_vector_tasks.csv.

El CSV es coma-delimitado y la columna Dependencia tiene comas (ej. "4,10",
"11,14,15"). Como SOLO esa columna tiene comas, se reconstruye contando desde el
final: las últimas 5 columnas son titulo, descripcion, area, responsable, status;
las primeras 6 son ID..Fases; lo de en medio es Dependencia.

Mapea por TÍTULO (CSV titulo -> tarea interna) porque el import reordenó por fase.
"""
import json, re, os

CSV  = r"D:\Codes\Documentacion_arconte\RoadMaps\public_vector_tasks.csv"
PROJ = r"D:\Codes\Documentacion_arconte\projects.json"
PID  = "publicvector"

def expand(raw):
    raw = (raw or "").strip()
    if not raw or raw.upper() == "N/A":
        return []
    if "--" in raw:
        a, b = re.split(r"\s*--\s*", raw, maxsplit=1)
        return list(range(int(a), int(b) + 1))
    return [int(x) for x in re.split(r"\s*,\s*", raw) if x.strip().isdigit()]

# ── Parsear CSV (robusto a comas en Dependencia) ──
rows = []  # (cid, titulo, dep_raw)
with open(CSV, encoding="utf-8") as f:
    lines = [l.rstrip("\n") for l in f if l.strip()]
for line in lines[1:]:
    cols = line.split(",")
    if len(cols) < 11 or not cols[0].strip().isdigit():
        continue
    cid     = int(cols[0].strip())
    titulo  = cols[len(cols) - 5].strip()
    dep_raw = ",".join(cols[6:len(cols) - 5]).strip()
    rows.append((cid, titulo, dep_raw))

id2title  = {cid: t for cid, t, _ in rows}
dep_by_id = {cid: [d for d in expand(dr) if d != cid] for cid, _, dr in rows}

# ── Cargar projects.json y mapear título -> id interno ──
data = json.load(open(PROJ, encoding="utf-8"))
proj = data[PID]
title2int, task_by_int = {}, {}
for ph in proj["phases"]:
    for t in ph["tasks"]:
        title2int[t["title"].strip()] = t["id"]
        task_by_int[t["id"]] = t

missing = []
for cid, titulo, _ in rows:
    internal = title2int.get(titulo)
    if not internal:
        missing.append((cid, titulo)); continue
    deps_int = [title2int.get(id2title.get(d, "")) for d in dep_by_id[cid]]
    deps_int = [x for x in deps_int if x]
    task_by_int[internal]["deps"] = deps_int
    flag = "" if len(deps_int) == len(dep_by_id[cid]) else "  <-- alguna dep no encontrada"
    print(f"{cid:>2}  {titulo[:38]:<38} dep={dep_by_id[cid]} -> {len(deps_int)} internas{flag}")

if missing:
    print("\n⚠ Títulos del CSV NO encontrados en projects.json:")
    for cid, t in missing: print(f"   {cid}: {t}")

tmp = PROJ + ".tmp"
json.dump(data, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
os.replace(tmp, PROJ)
print("\nprojects.json actualizado con deps de publicvector.")
