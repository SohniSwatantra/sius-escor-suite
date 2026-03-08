"""
Sius Escor Web — Modern FastAPI server with SQLite.
Receives race data from the desk app, serves it via a styled web UI.
"""
import json
import os
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
import sqlite3
import uvicorn

DB_PATH = Path(__file__).parent / "sius_escor.db"
STATIC_DIR = Path(__file__).parent / "static"

app = FastAPI(title="Sius Escor Live", version="2.0")
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS race_details (
            id TEXT PRIMARY KEY,
            type TEXT,
            champshipname TEXT,
            city TEXT,
            country TEXT,
            startdate TEXT,
            enddate TEXT,
            timezone TEXT,
            disciplines TEXT,
            timestamp_created TEXT,
            filename TEXT,
            creator TEXT,
            phase TEXT,
            category TEXT,
            grp TEXT,
            event TEXT,
            relay TEXT,
            stage TEXT,
            sorting TEXT,
            kind TEXT,
            status TEXT,
            timestamp_competition TEXT,
            version TEXT
        );

        CREATE TABLE IF NOT EXISTS drivers (
            name TEXT PRIMARY KEY,
            family_name TEXT,
            first_name TEXT,
            bib INTEGER,
            noc TEXT,
            fp INTEGER,
            starttime TEXT,
            tot_comp REAL,
            rank_archiv INTEGER DEFAULT 0,
            rec_index INTEGER DEFAULT 0,
            shot_fired INTEGER DEFAULT 0,
            avg_ind TEXT DEFAULT '',
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS lap_times (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            driver_name TEXT,
            shot_nr INTEGER,
            score REAL,
            source TEXT DEFAULT '',
            x TEXT DEFAULT '',
            y TEXT DEFAULT '',
            isinnerten INTEGER DEFAULT 0,
            issighter INTEGER DEFAULT 0,
            timestamp TEXT DEFAULT '',
            UNIQUE(driver_name, shot_nr)
        );
    """)
    conn.commit()
    conn.close()


init_db()


# ──────────────────── API ENDPOINTS ────────────────────


@app.post("/start_race", summary="Receive race data from desk app")
async def start_race(request: Request):
    payload = await request.json()

    conn = get_db()
    now = datetime.now().isoformat()

    # Race details
    rd = payload.get("race_details", {})
    if rd.get("id") or rd.get("champshipname"):
        race_id = rd.get("id", rd.get("champshipname", "unknown"))
        conn.execute("""
            INSERT OR REPLACE INTO race_details
            (id, type, champshipname, city, country, startdate, enddate,
             timezone, disciplines, timestamp_created, filename, creator,
             phase, category, grp, event, relay, stage, sorting, kind,
             status, timestamp_competition, version)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            race_id, rd.get("type", ""), rd.get("champshipname", ""),
            rd.get("city", ""), rd.get("country", ""),
            rd.get("startdate", ""), rd.get("enddate", ""),
            rd.get("timezone", ""), rd.get("disciplines", ""),
            rd.get("timestamp_created", ""), rd.get("filename", ""),
            rd.get("creator", ""), rd.get("phase", ""),
            rd.get("category", ""), rd.get("group", ""),
            rd.get("event", ""), rd.get("relay", ""),
            rd.get("stage", ""), rd.get("sorting", ""),
            rd.get("kind", ""), rd.get("status", ""),
            rd.get("timestamp_competition", ""), rd.get("version", ""),
        ))

    # Drivers and lap times
    entries = payload.get("xml_obj", [])
    for entry in entries:
        # Handle both flat dict and {fields, lap_details} formats
        if "fields" in entry:
            fields = entry["fields"]
            laps = entry.get("lap_details", [])
        else:
            fields = entry
            laps = entry.get("lap_details", [])

        family = fields.get("family_name", "")
        first = fields.get("first_name", "")
        name = f"{family}{first}"

        conn.execute("""
            INSERT OR REPLACE INTO drivers
            (name, family_name, first_name, bib, noc, fp, starttime,
             tot_comp, rank_archiv, rec_index, shot_fired, avg_ind, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            name, family, first,
            int(fields.get("bib", 0)),
            fields.get("noc", ""),
            int(fields.get("fp", 0)),
            fields.get("starttime", ""),
            float(fields.get("tot_comp", 0)),
            int(fields.get("rank_archiv", 0)),
            int(fields.get("rec_index", 0)),
            int(fields.get("shot_fired", 0)),
            fields.get("avg_ind", ""),
            now,
        ))

        for lap in laps:
            # Support both {nr, val} and {number, score} formats
            nr = lap.get("nr") or lap.get("number", 0)
            val = lap.get("val") or lap.get("score", 0)
            conn.execute("""
                INSERT OR REPLACE INTO lap_times
                (driver_name, shot_nr, score, source, x, y, isinnerten, issighter, timestamp)
                VALUES (?,?,?,?,?,?,?,?,?)
            """, (
                name, int(nr), float(val),
                lap.get("source", ""),
                lap.get("x", ""),
                lap.get("y", ""),
                1 if lap.get("isinnerten") in (True, "true") else 0,
                1 if lap.get("issighter") in (True, "true") else 0,
                lap.get("timestamp", ""),
            ))

    conn.commit()
    conn.close()

    return {"status": "ok", "drivers_processed": len(entries)}


@app.get("/api/race", summary="Get race details")
async def get_race():
    conn = get_db()
    row = conn.execute("SELECT * FROM race_details ORDER BY rowid DESC LIMIT 1").fetchone()
    conn.close()
    if row:
        return dict(row)
    return {}


@app.get("/api/drivers", summary="Get all drivers")
async def get_drivers():
    conn = get_db()
    rows = conn.execute("SELECT * FROM drivers ORDER BY tot_comp DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/drivers/{name}/shots", summary="Get shots for a driver")
async def get_driver_shots(name: str):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM lap_times WHERE driver_name = ? ORDER BY shot_nr", (name,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/stats", summary="Get overall stats")
async def get_stats():
    conn = get_db()
    driver_count = conn.execute("SELECT COUNT(*) as c FROM drivers").fetchone()["c"]
    shot_count = conn.execute("SELECT COUNT(*) as c FROM lap_times").fetchone()["c"]
    avg_score = conn.execute("SELECT AVG(tot_comp) as a FROM drivers").fetchone()["a"]
    top = conn.execute("SELECT name, tot_comp FROM drivers ORDER BY tot_comp DESC LIMIT 1").fetchone()
    conn.close()
    return {
        "driver_count": driver_count,
        "shot_count": shot_count,
        "avg_score": round(avg_score or 0, 2),
        "top_driver": dict(top) if top else None,
    }


# ──────────────────── WEB UI ────────────────────


@app.get("/", response_class=HTMLResponse, summary="Live scoreboard")
async def scoreboard():
    html_path = STATIC_DIR / "index.html"
    return HTMLResponse(html_path.read_text())


# Legacy endpoint compatibility
@app.get("/drivers/", summary="Legacy: get all drivers")
async def get_drivers_legacy():
    conn = get_db()
    rows = conn.execute("SELECT * FROM drivers ORDER BY tot_comp DESC").fetchall()
    conn.close()
    return {"users_data": [dict(r) for r in rows]}


if __name__ == "__main__":
    print("Sius Escor Web running at http://localhost:5001")
    uvicorn.run(app, host="0.0.0.0", port=5001)
