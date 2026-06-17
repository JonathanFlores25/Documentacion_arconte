"""
Rellena el campo `deps` (lista de IDs internos) en cada tarea de "Arconte Retail"
en projects.json, a partir de la columna Dependencia del TSV fuente.

- Mapea el ID numerico del TSV (1..29) -> ID interno de projects.json por ORDEN
  (las tareas estan en el mismo orden), verificando ademas que el titulo coincida.
- Expande la columna Dependencia: "N/A" -> [], "5,6,7" -> [5,6,7],
  "1--11"/"1 -- 19" -> rango, numero suelto -> [n].
- Corrige auto-referencias: tarea 19 (Autoetiquetado) -> 17, tarea 22 (Labeling) -> 21.
"""
import json
import re

TSV   = r"D:\Codes\Documentacion_arconte\RoadMaps\arconte_retail_tasks.tsv"
PROJ  = r"D:\Codes\Documentacion_arconte\projects.json"

# Correcciones de auto-referencia (id_tarea -> deps numericos corregidos)
SELF_FIX = {19: [17], 22: [21]}


def expand_dep(raw):
    raw = (raw or "").strip()
    if not raw or raw.upper() == "N/A":
        return []
    # Rango: "1--11" o "1 -- 19"
    if "--" in raw:
        a, b = re.split(r"\s*--\s*", raw, maxsplit=1)
        return list(range(int(a), int(b) + 1))
    # Lista por comas
    return [int(x) for x in re.split(r"\s*,\s*", raw) if x.strip().isdigit()]


# --- Parsear TSV ---
tsv_rows = {}  # id_num -> {"title":..., "deps":[...]}
with open(TSV, encoding="utf-8") as f:
    lines = f.read().splitlines()
header = lines[0].split("\t")
i_id, i_dep, i_titulo = header.index("ID"), header.index("Dependencia"), header.index("titulo")
for line in lines[1:]:
    if not line.strip():
        continue
    cols = line.split("\t")
    tid = int(cols[i_id])
    deps = SELF_FIX.get(tid, expand_dep(cols[i_dep]))
    # quitar autorreferencia residual por seguridad
    deps = [d for d in deps if d != tid]
    tsv_rows[tid] = {"title": cols[i_titulo].strip(), "deps": deps}

# --- Cargar projects.json ---
with open(PROJ, encoding="utf-8") as f:
    data = json.load(f)

proj = next(p for p in data.values() if isinstance(p, dict) and p.get("title") == "Arconte Retail")
flat = [t for ph in proj["phases"] for t in ph["tasks"]]

assert len(flat) == len(tsv_rows), f"TSV={len(tsv_rows)} vs JSON={len(flat)} tareas"

# Mapa: id_num TSV (1-indexed por orden) -> id interno
num_to_internal = {n + 1: t["id"] for n, t in enumerate(flat)}

print(f"{'#':>3}  {'titulo TSV':<26} {'titulo JSON':<26} {'deps#':<14} -> deps internos")
print("-" * 110)
for n, task in enumerate(flat, start=1):
    row = tsv_rows[n]
    match = "OK" if row["title"][:20] == task["title"][:20] else "DIF!"
    dep_internal = [num_to_internal[d] for d in row["deps"]]
    task["deps"] = dep_internal
    print(f"{n:>3}  {row['title'][:26]:<26} {task['title'][:26]:<26} "
          f"{str(row['deps']):<14} -> {dep_internal}  [{match}]")

# --- Escritura atomica ---
tmp = PROJ + ".tmp"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
import os
os.replace(tmp, PROJ)
print("\nprojects.json actualizado.")
