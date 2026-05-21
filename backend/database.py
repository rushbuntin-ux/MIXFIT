import os
import sqlite3
from pathlib import Path
from typing import Optional
from models import MeasurementProfile

_data_dir = Path(os.environ.get("DATA_DIR", Path(__file__).parent / "data"))
DB_PATH = _data_dir / "mixfit.db"


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS profiles (
                user_id TEXT PRIMARY KEY,
                data    TEXT NOT NULL
            )
        """)


def upsert_profile(profile: MeasurementProfile) -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "INSERT OR REPLACE INTO profiles (user_id, data) VALUES (?, ?)",
            (profile.user_id, profile.model_dump_json()),
        )


def fetch_profile(user_id: str) -> Optional[MeasurementProfile]:
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute(
            "SELECT data FROM profiles WHERE user_id = ?", (user_id,)
        ).fetchone()
    if row is None:
        return None
    return MeasurementProfile.model_validate_json(row[0])
