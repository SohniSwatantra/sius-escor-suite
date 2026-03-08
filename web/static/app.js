// Sius Escor — Live Scoreboard Client

const REFRESH_INTERVAL = 5000;

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

// ─── Race Banner ───

async function loadRace() {
  const race = await fetchJSON("/api/race");
  if (!race || !race.champshipname) {
    document.getElementById("race-banner").style.display = "none";
    return;
  }

  document.getElementById("race-banner").style.display = "block";
  document.getElementById("race-title").textContent = race.champshipname || "—";
  document.getElementById("race-event").textContent = race.event || "";
  document.getElementById("race-phase").textContent = race.phase || "";
  document.getElementById("race-city").textContent = race.city ? `${race.city}${race.country ? ', ' + race.country : ''}` : "";
  document.getElementById("race-date").textContent = race.startdate || "";
}

// ─── Stats ───

async function loadStats() {
  const stats = await fetchJSON("/api/stats");
  if (!stats) return;

  document.getElementById("stat-athletes").textContent = stats.driver_count || "0";
  document.getElementById("stat-shots").textContent = stats.shot_count || "0";
  document.getElementById("stat-avg").textContent = stats.avg_score || "—";

  if (stats.top_driver) {
    document.getElementById("stat-leader").textContent = stats.top_driver.name || "—";
    document.getElementById("stat-leader-score").textContent = stats.top_driver.tot_comp ? `Score: ${stats.top_driver.tot_comp}` : "";
  }
}

// ─── Leaderboard ───

async function loadLeaderboard() {
  const drivers = await fetchJSON("/api/drivers");
  if (!drivers || drivers.length === 0) {
    document.getElementById("leaderboard-body").innerHTML = `
      <tr><td colspan="7" class="empty-cell">No athletes registered yet. Waiting for data from desk app...</td></tr>`;
    document.getElementById("driver-count").textContent = "";
    return;
  }

  document.getElementById("driver-count").textContent = `${drivers.length} athletes`;

  let html = "";
  drivers.forEach((d, i) => {
    const rank = i + 1;
    let rankClass = "";
    if (rank === 1) rankClass = "rank-1";
    else if (rank === 2) rankClass = "rank-2";
    else if (rank === 3) rankClass = "rank-3";

    const name = d.name || `${d.family_name || ""}${d.first_name || ""}`;
    const displayName = d.family_name
      ? `${d.family_name}<span class="athlete-first">${d.first_name || ""}</span>`
      : name;

    html += `
      <tr>
        <td><span class="rank-badge ${rankClass}">${rank}</span></td>
        <td><span class="bib-badge">${d.bib || "?"}</span></td>
        <td><span class="athlete-name">${displayName}</span></td>
        <td><span class="noc-tag">${d.noc || ""}</span></td>
        <td><span class="shots-count">${d.shot_fired || 0}</span></td>
        <td><span class="score-val">${d.tot_comp || "—"}</span></td>
        <td><button class="btn btn-sm btn-outline" onclick="viewShots('${name}')">Shots</button></td>
      </tr>`;
  });

  document.getElementById("leaderboard-body").innerHTML = html;
}

// ─── Shot Details ───

async function viewShots(driverName) {
  const shots = await fetchJSON(`/api/drivers/${encodeURIComponent(driverName)}/shots`);
  const panel = document.getElementById("shot-panel");
  const grid = document.getElementById("shot-grid");

  document.getElementById("shot-panel-title").textContent = `Shots — ${driverName}`;

  if (!shots || shots.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:#6b6b6b;font-family:'Space Mono',monospace;">No shot data available</div>`;
    panel.style.display = "block";
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  let html = "";
  shots.forEach((s) => {
    const val = parseFloat(s.score);
    const high = val >= 10.5 ? "high" : "";
    html += `
      <div class="shot-card ${high}">
        <div class="shot-nr">Shot ${s.shot_nr}</div>
        <div class="shot-val">${s.score}</div>
      </div>`;
  });

  grid.innerHTML = html;
  panel.style.display = "block";
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeShotPanel() {
  document.getElementById("shot-panel").style.display = "none";
}

// ─── Refresh Loop ───

async function refresh() {
  await Promise.all([loadRace(), loadStats(), loadLeaderboard()]);
}

// Initial load
refresh();

// Auto-refresh
setInterval(refresh, REFRESH_INTERVAL);
