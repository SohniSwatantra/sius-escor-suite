# Sius Escor Suite

A complete scoring system for ISSF shooting competitions powered by Sius Ascor data.

## Projects

### `sius-tauri/` — Desktop App (Tauri)
A native desktop application that monitors a folder for ISSF XML files from a Sius Ascor scoring system, parses competitor and shot data, and uploads it to a remote server in real-time.

- **Tech:** Tauri (Rust + HTML/CSS/JS)
- **Features:** Folder selection, XML parsing, live polling every 10s, activity log
- **Run:** `cd sius-tauri && npm install && npm run tauri dev`

### `web/` — Live Scoreboard (FastAPI)
A web application that receives race data from the desktop app and displays a live scoreboard accessible from any browser.

- **Tech:** FastAPI, SQLite, vanilla JS
- **Features:** Leaderboard with rankings, shot-by-shot details, auto-refresh every 5s, stats dashboard
- **Run:** `cd web && pip install fastapi uvicorn && python server.py`
- **Open:** http://localhost:5001

### `fake_sius/` — Test Data
Sample ISSF XML files for testing without a real Sius Ascor system.

## Design
UI inspired by [Neue Machina Inktrap](https://pangrampangram.com/products/neue-machina) typography — geometric monospace aesthetic with Space Mono / Space Grotesk fonts, `#FF4D00` accent color, dark/light contrast, pill-shaped elements.
