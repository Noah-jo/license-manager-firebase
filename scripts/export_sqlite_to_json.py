import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "licenses.db"
OUTPUT_PATH = Path(__file__).resolve().parents[1] / "licenses-export.json"


def main():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM software ORDER BY expiry ASC, name ASC").fetchall()
    conn.close()

    licenses = []
    for row in rows:
        licenses.append(
            {
                "name": row["name"],
                "seats": row["seats"],
                "expiry": row["expiry"],
                "paymentMethod": row["payment_method"] or "",
                "price": float(row["price"] or 0),
                "pic": row["pic"] or "",
                "user": row["user"] or "",
                "subLink": row["sub_link"] or "",
                "remarks": row["remarks"] or "",
            }
        )

    OUTPUT_PATH.write_text(json.dumps(licenses, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Exported {len(licenses)} licenses to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()

