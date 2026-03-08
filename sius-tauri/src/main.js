const { invoke } = window.__TAURI__.core;
const { open } = window.__TAURI__.dialog;

let pollInterval = null;
let pollCount = 0;

// DOM elements
const apiUrlInput = document.getElementById("api-url");
const folderPathInput = document.getElementById("folder-path");
const btnFolder = document.getElementById("btn-folder");
const btnStart = document.getElementById("btn-start");
const btnPreview = document.getElementById("btn-preview");
const btnStop = document.getElementById("btn-stop");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const statusCount = document.getElementById("status-count");
const racePanel = document.getElementById("race-panel");
const raceEvent = document.getElementById("race-event");
const raceInfo = document.getElementById("race-info");
const competitorsPanel = document.getElementById("competitors-panel");
const competitorCount = document.getElementById("competitor-count");
const competitorBody = document.getElementById("competitor-body");
const emptyPanel = document.getElementById("empty-panel");
const logContent = document.getElementById("log-content");
const logCountEl = document.getElementById("log-count");

let logEntries = 0;

function timeStamp() {
  return new Date().toLocaleTimeString("en-GB");
}

function addLog(message, type = "") {
  logEntries++;
  const entry = document.createElement("div");
  entry.className = "log-entry";
  const cls = type === "ok" ? "log-ok" : type === "err" ? "log-err" : "";
  entry.innerHTML = `<span class="log-time">[${timeStamp()}]</span> <span class="${cls}">${message}</span>`;
  logContent.appendChild(entry);
  logContent.scrollTop = logContent.scrollHeight;
  logCountEl.textContent = `${logEntries} entries`;
}

function setStatus(text, state = "idle") {
  statusText.textContent = text;
  statusDot.className = "status-dot";
  if (state === "active") statusDot.classList.add("active");
  if (state === "error") statusDot.classList.add("error");
}

function renderRaceDetails(details) {
  racePanel.style.display = "block";
  emptyPanel.style.display = "none";

  const fields = [
    ["champshipname", "Championship"],
    ["city", "City"],
    ["country", "Country"],
    ["event", "Event"],
    ["phase", "Phase"],
    ["startdate", "Date"],
    ["status", "Status"],
    ["category", "Category"],
  ];

  raceEvent.textContent = details.event || "";
  raceInfo.innerHTML = "";

  for (const [key, label] of fields) {
    if (details[key]) {
      raceInfo.innerHTML += `
        <div class="race-info-item">
          <div class="label">${label}</div>
          <div class="value">${details[key]}</div>
        </div>`;
    }
  }
}

function renderCompetitors(entries) {
  competitorsPanel.style.display = "block";
  competitorCount.textContent = `${entries.length} athletes`;
  competitorBody.innerHTML = "";

  for (const entry of entries) {
    const f = entry.fields;
    const name = `${f.first_name || ""} ${f.family_name || ""}`.trim();
    const shots = entry.lap_details || [];

    const shotsHtml = shots
      .map((s) => {
        const val = parseFloat(s.val);
        const cls = val >= 10.5 ? "shot-chip high" : "shot-chip";
        return `<span class="${cls}">${s.val}</span>`;
      })
      .join("");

    competitorBody.innerHTML += `
      <tr>
        <td><span class="bib-badge">${f.bib || "?"}</span></td>
        <td><strong>${name}</strong></td>
        <td><span class="noc-tag">${f.noc || ""}</span></td>
        <td><span class="score">${f.tot_comp || "-"}</span></td>
        <td><div class="shots-row">${shotsHtml || "-"}</div></td>
      </tr>`;
  }
}

// Folder selection
btnFolder.addEventListener("click", async () => {
  try {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      folderPathInput.value = selected;
      await invoke("set_folder", { path: selected });
      btnStart.disabled = false;
      btnPreview.disabled = false;
      addLog(`Folder selected: ${selected}`, "ok");
      setStatus("Ready — folder selected");
    }
  } catch (e) {
    addLog(`Folder selection error: ${e}`, "err");
  }
});

// API URL sync
apiUrlInput.addEventListener("change", async () => {
  await invoke("set_api_url", { url: apiUrlInput.value });
  addLog(`API URL updated: ${apiUrlInput.value}`);
});

// Sync initial URL
window.addEventListener("DOMContentLoaded", async () => {
  await invoke("set_api_url", { url: apiUrlInput.value });
});

// Preview
btnPreview.addEventListener("click", async () => {
  try {
    addLog("Previewing data...");
    const data = await invoke("preview_data");
    renderRaceDetails(data.race_details);
    renderCompetitors(data.xml_obj);
    addLog(`Preview loaded: ${data.xml_obj.length} competitors`, "ok");
  } catch (e) {
    addLog(`Preview error: ${e}`, "err");
    setStatus(`Error: ${e}`, "error");
  }
});

// Poll once
async function doPoll() {
  try {
    await invoke("set_api_url", { url: apiUrlInput.value });
    const raw = await invoke("poll_and_send");
    const result = JSON.parse(raw);
    pollCount++;
    statusCount.textContent = `${pollCount} polls`;

    if (result.status === 200) {
      addLog(`Poll #${pollCount}: sent ${result.competitors} competitors — HTTP ${result.status}`, "ok");
      setStatus(`Tracking active — last poll OK`, "active");
    } else {
      addLog(`Poll #${pollCount}: HTTP ${result.status}`, "err");
      setStatus(`Warning: HTTP ${result.status}`, "error");
    }

    // Also refresh the preview
    try {
      const data = await invoke("preview_data");
      renderRaceDetails(data.race_details);
      renderCompetitors(data.xml_obj);
    } catch (_) {}
  } catch (e) {
    addLog(`Poll error: ${e}`, "err");
    setStatus(`Error: ${e}`, "error");
  }
}

// Start
btnStart.addEventListener("click", async () => {
  if (pollInterval) return;

  addLog("Match tracking started — polling every 10s", "ok");
  setStatus("Tracking active", "active");
  btnStart.disabled = true;
  btnStop.disabled = false;

  await doPoll();
  pollInterval = setInterval(doPoll, 10000);
});

// Stop
btnStop.addEventListener("click", () => {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  btnStart.disabled = false;
  btnStop.disabled = true;
  setStatus("Stopped");
  addLog("Match tracking stopped");
});
