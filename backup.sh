#!/usr/bin/env bash
# backup.sh — Respaldo automático de los datos vivos del proyecto.
# Guarda una copia con fecha en backups/YYYY-MM-DD_HH-MM/
# Uso manual:  bash backup.sh
# Cron cada 6h: 0 */6 * * * /ruta/al/proyecto/backup.sh >> /ruta/al/proyecto/backups/backup.log 2>&1

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_ROOT="$PROJECT_DIR/backups"
TIMESTAMP="$(date +%Y-%m-%d_%H-%M)"
DEST="$BACKUP_ROOT/$TIMESTAMP"

mkdir -p "$DEST"

# ── Archivos JSON de datos ─────────────────────────────────────────────────
for f in projects.json solutions_meta.json config.json; do
    [ -f "$PROJECT_DIR/$f" ] && cp "$PROJECT_DIR/$f" "$DEST/"
done

# ── Carpetas de datos ──────────────────────────────────────────────────────
[ -d "$PROJECT_DIR/solutions"  ] && cp -r "$PROJECT_DIR/solutions"  "$DEST/"

echo "[$TIMESTAMP] Respaldo guardado en $DEST"

# ── Limpieza: conservar solo los últimos 30 respaldos ─────────────────────
cd "$BACKUP_ROOT"
ls -1d */ 2>/dev/null | sort | head -n -30 | xargs -r rm -rf
