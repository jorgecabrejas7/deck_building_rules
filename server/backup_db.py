"""Usage: backup_db.py DB_PATH BACKUP_DIR -- online SQLite backup, keeps 14 days."""
import sqlite3
import sys
import time
from datetime import date
from pathlib import Path

db, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
src = sqlite3.connect(db)
dst = sqlite3.connect(out / f"pod-{date.today():%Y%m%d}.sqlite3")
src.backup(dst)
dst.close()
src.close()
for f in out.glob("pod-*.sqlite3"):
    if f.stat().st_mtime < time.time() - 14 * 86400:
        f.unlink()
