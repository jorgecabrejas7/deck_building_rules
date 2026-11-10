import os
import sqlite3
import subprocess
import sys
import time
from datetime import date
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "backup_db.py"


def test_backup_written_and_old_ones_pruned(tmp_path):
    db, out = tmp_path / "pod.sqlite3", tmp_path / "backups"
    sqlite3.connect(db).execute("create table t (x)").connection.close()
    out.mkdir()
    old, recent = out / "pod-old.sqlite3", out / "pod-recent.sqlite3"
    for f, days in ((old, 15), (recent, 13)):
        f.write_text("x")
        t = time.time() - days * 86400
        os.utime(f, (t, t))  # age is by mtime
    subprocess.run([sys.executable, str(SCRIPT), str(db), str(out)], check=True)
    assert (out / f"pod-{date.today():%Y%m%d}.sqlite3").exists()
    assert recent.exists() and not old.exists()
