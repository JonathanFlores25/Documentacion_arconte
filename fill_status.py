"""
Reimporta el campo `status` (COMPLETADO / EN PROCESO / EN ESPERA / ...) por tarea
en projects.json (Arconte Retail), desde la columna status del TSV.
Mapea por ORDEN (IDs 1..29) verificando el título, igual que fill_deps.py.
"""
import json, os

TSV  = r"D:\Codes\Documentacion_arconte\RoadMaps\arconte_retail_tasks.tsv"
PROJ = r"D:\Codes\Documentacion_arconte\projects.json"

with open(TSV, encoding="utf-8") as f:
    lines = f.read().splitlines()
header = lines[0].split("\t")
i_titulo, i_status = header.index("titulo"), header.index("status")
tsv = []
for line in lines[1:]:
    if not line.strip():
        continue
    cols = line.split("\t")
    tsv.append((cols[i_titulo].strip(), cols[i_status].strip()))

with open(PROJ, encoding="utf-8") as f:
    data = json.load(f)
proj = next(p for p in data.values() if isinstance(p, dict) and p.get("title") == "Arconte Retail")
flat = [t for ph in proj["phases"] for t in ph["tasks"]]
assert len(flat) == len(tsv), f"TSV={len(tsv)} vs JSON={len(flat)}"

for n, (task, (titulo, status)) in enumerate(zip(flat, tsv), start=1):
    match = "OK" if titulo[:20] == task["title"][:20] else "DIF!"
    task["status"] = status
    print(f"{n:>2}  {task['title'][:24]:<24} status={status:<12} done={task.get('done')}  [{match}]")

tmp = PROJ + ".tmp"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
os.replace(tmp, PROJ)
print("\nprojects.json actualizado con status por tarea.")
