// PenCapture Explorer
// Vanilla JS SPA that talks to Supabase Edge Functions

const API_BASE = "https://mjusrdxsfxpvxvcxgpdu.supabase.co/functions/v1";

const el = {
  includeSamplesToggle: document.getElementById("includeSamplesToggle"),
  refreshBtn: document.getElementById("refreshBtn"),

  experimentsCount: document.getElementById("experimentsCount"),
  experimentsStatus: document.getElementById("experimentsStatus"),
  experimentsList: document.getElementById("experimentsList"),

  subjectsCount: document.getElementById("subjectsCount"),
  subjectsStatus: document.getElementById("subjectsStatus"),
  subjectsList: document.getElementById("subjectsList"),

  jsonHint: document.getElementById("jsonHint"),
  jsonTree: document.getElementById("jsonTree"),
  jsonPre: document.getElementById("jsonPre"),
  copyJsonBtn: document.getElementById("copyJsonBtn"),
  clearJsonBtn: document.getElementById("clearJsonBtn"),
};

let currentJsonText = "";
let sessionsCacheByExperiment = new Map(); // key: experimentTitle -> sessions[]
let sessionsCacheBySubject = new Map(); // key: subjectName -> sessions[]
let sessionCacheById = new Map(); // key: sessionId -> full response object

function setStatus(node, msg, type = "info") {
  if (!msg) {
    node.classList.add("hidden");
    node.textContent = "";
    return;
  }
  node.classList.remove("hidden");
  node.textContent = msg;

  node.classList.remove("text-emerald-300", "text-amber-300", "text-rose-300", "text-slate-300");
  if (type === "ok") node.classList.add("text-emerald-300");
  else if (type === "warn") node.classList.add("text-amber-300");
  else if (type === "err") node.classList.add("text-rose-300");
  else node.classList.add("text-slate-300");
}

function qs(params) {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    usp.set(k, String(v));
  });
  const s = usp.toString();
  return s ? `?${s}` : "";
}

async function apiGet(path, params = {}) {
  const url = `${API_BASE}/${path}${qs(params)}`;
  const res = await fetch(url, { method: "GET" });
  let json;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg = json?.error ? json.error : `HTTP ${res.status}`;
    const err = new Error(msg);
    err.details = json;
    err.status = res.status;
    throw err;
  }
  return json;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function prettyJson(obj) {
  return JSON.stringify(obj, null, 2);
}

function setJsonBox(obj, hintText = "") {
  currentJsonText = obj ? prettyJson(obj) : "";

  // Source of truth for copying
  el.jsonPre.textContent = currentJsonText;

  // Render collapsible tree
  el.jsonTree.innerHTML = "";
  if (obj) {
    // 1 = mostly collapsed by default
    const formatter = new JSONFormatter(obj, Infinity, {
      hoverPreviewEnabled: true,
      hoverPreviewArrayCount: 20,
      hoverPreviewFieldCount: 20,
      theme: "dark",
    });
    el.jsonTree.appendChild(formatter.render());
  }

  el.jsonHint.textContent =
    hintText || "Click a session to load its raw JSON here.";
  el.copyJsonBtn.disabled = !currentJsonText;
  el.clearJsonBtn.disabled = !currentJsonText;
}

async function copyToClipboard(text) {
  await navigator.clipboard.writeText(text);
}

function pill(text) {
  return `<span class="badge">${escapeHtml(text)}</span>`;
}

function renderSessionRow(session, opts = {}) {
  const sessionId = session.id || session.session_id || "";
  const expTitle = session.experimentTitle || session.experiment?.title || "";
  const subjName = session.subjectDisplayName || session.subject?.display_name || "";
  const subjDevice = session.subjectDeviceInstallId || session.subject?.device_install_id || "";

  const uploadedAt = session.uploaded_at || session.uploadedAt || session.created_at || session.start_at || "";
  const appVersion = session.app_version || session.appVersion || "";
  const platform = session.platform || "";
  const deviceModel = session.device_model || session.deviceModel || "";

  const meta = [
    expTitle ? pill(expTitle) : "",
    subjName ? pill(subjName) : "",
    subjDevice ? pill(subjDevice) : "",
    platform ? pill(platform) : "",
    appVersion ? pill(`v${appVersion}`) : "",
    deviceModel ? pill(deviceModel) : "",
  ].filter(Boolean).join(" ");

  const timeLine = uploadedAt
    ? `<div class="mt-1 text-xs text-slate-400">uploaded_at: ${escapeHtml(uploadedAt)}</div>`
    : "";

  return `
    <button
      class="group w-full rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-left hover:bg-slate-950/70 active:bg-slate-950"
      data-session-id="${escapeHtml(sessionId)}"
      type="button"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="truncate text-sm font-semibold text-slate-100">
            Session <span class="font-mono text-slate-300">${escapeHtml(sessionId)}</span>
          </div>
          ${timeLine}
          <div class="mt-2 flex flex-wrap gap-2">${meta}</div>
        </div>
        <div class="shrink-0 text-xs text-slate-400 group-hover:text-slate-200">View JSON</div>
      </div>
    </button>
  `;
}

function renderExpandableCard({ title, subtitle, right, bodyId, buttonId }) {
  return `
    <div class="rounded-2xl border border-slate-800 bg-slate-950/30">
      <button
        id="${escapeHtml(buttonId)}"
        class="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-slate-950/50 active:bg-slate-950"
        type="button"
        aria-expanded="false"
      >
        <div class="min-w-0">
          <div class="truncate text-base font-semibold">${escapeHtml(title)}</div>
          ${subtitle ? `<div class="mt-1 text-sm text-slate-400">${escapeHtml(subtitle)}</div>` : ""}
        </div>
        <div class="flex items-center gap-3">
          ${right || ""}
          <span class="text-slate-400">▾</span>
        </div>
      </button>
      <div id="${escapeHtml(bodyId)}" class="hidden border-t border-slate-800 p-4"></div>
    </div>
  `;
}

function togglePanel(button, panel) {
  const isOpen = !panel.classList.contains("hidden");
  if (isOpen) {
    panel.classList.add("hidden");
    button.setAttribute("aria-expanded", "false");
  } else {
    panel.classList.remove("hidden");
    button.setAttribute("aria-expanded", "true");
  }
}

function getIncludeSamples() {
  return el.includeSamplesToggle.checked;
}

// ---- Experiments ----

async function loadExperiments() {
  setStatus(el.experimentsStatus, "Loading experiments...");
  el.experimentsList.innerHTML = "";
  sessionsCacheByExperiment.clear();

  const experiments = await apiGet("experiments");
  el.experimentsCount.textContent = `${experiments.length} total`;
  setStatus(el.experimentsStatus, "", "ok");

  const html = experiments.map((exp) => {
    const expTitle = exp.title || "(untitled)";
    const expId = exp.id || "";
    const bodyId = `exp-body-${expId}`;
    const buttonId = `exp-btn-${expId}`;

    return renderExpandableCard({
      title: expTitle,
      subtitle: exp.description || "",
      right: pill(`id: ${String(expId).slice(0, 8)}…`),
      bodyId,
      buttonId,
    });
  }).join("");

  el.experimentsList.innerHTML = html;

  // wire up expand click
  experiments.forEach((exp) => {
    const expTitle = exp.title || "";
    const expId = exp.id || "";
    const button = document.getElementById(`exp-btn-${expId}`);
    const panel = document.getElementById(`exp-body-${expId}`);

    button.addEventListener("click", async () => {
      const wasEmpty = panel.innerHTML.trim() === "";
      togglePanel(button, panel);
      if (!panel.classList.contains("hidden") && wasEmpty) {
        await renderExperimentSessions(panel, expTitle);
      }
    });
  });
}

async function renderExperimentSessions(panel, experimentTitle) {
  panel.innerHTML = `
    <div class="mb-3 flex items-center justify-between gap-3">
      <div class="text-sm text-slate-300">Sessions for <span class="font-semibold">${escapeHtml(experimentTitle)}</span></div>
      <div class="text-xs text-slate-500">includeSamples: ${getIncludeSamples() ? "true" : "false"}</div>
    </div>
    <div class="text-sm text-slate-400">Loading sessions…</div>
  `;

  const includeSamples = getIncludeSamples();
  const data = await apiGet("getSessionData", {
    experiment: experimentTitle,
    includeSamples: includeSamples ? "true" : "false",
  });

  const sessions = data.sessions || [];
  sessionsCacheByExperiment.set(experimentTitle, sessions);

  if (sessions.length === 0) {
    panel.innerHTML = `<div class="text-sm text-slate-400">No sessions found.</div>`;
    return;
  }

  panel.innerHTML = `
    <div class="mb-3 flex items-center justify-between gap-3">
      <div class="text-sm text-slate-300">
        Found <span class="font-semibold">${sessions.length}</span> session(s)
      </div>
      <div class="text-xs text-slate-500">Click a session to view JSON below</div>
    </div>
    <div class="grid gap-2">${sessions.map((s) => renderSessionRow(s)).join("")}</div>
  `;

  panel.querySelectorAll("[data-session-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const sessionId = btn.getAttribute("data-session-id");
      await loadSessionJson(sessionId);
    });
  });
}

// ---- Subjects ----

async function loadSubjects() {
  setStatus(el.subjectsStatus, "Loading subjects...");
  el.subjectsList.innerHTML = "";
  sessionsCacheBySubject.clear();

  const resp = await apiGet("subjects");
  const subjects = resp.subjects || [];

  el.subjectsCount.textContent = `${subjects.length} total`;
  setStatus(el.subjectsStatus, "", "ok");

  const html = subjects.map((subj) => {
    const subjectName = subj.display_name || "(no name)";
    const subjectId = subj.id || "";
    const deviceInstallId = subj.device_install_id || "";
    const bodyId = `subj-body-${subjectId}`;
    const buttonId = `subj-btn-${subjectId}`;

    const right = [
      deviceInstallId ? pill(deviceInstallId) : "",
      subj.last_seen_at ? pill(`last: ${subj.last_seen_at}`) : "",
    ].filter(Boolean).join(" ");

    return renderExpandableCard({
      title: subjectName,
      subtitle: `id: ${subjectId}`,
      right,
      bodyId,
      buttonId,
    });
  }).join("");

  el.subjectsList.innerHTML = html;

  subjects.forEach((subj) => {
    const subjectName = subj.display_name || "";
    const subjectId = subj.id || "";
    const button = document.getElementById(`subj-btn-${subjectId}`);
    const panel = document.getElementById(`subj-body-${subjectId}`);

    button.addEventListener("click", async () => {
      const wasEmpty = panel.innerHTML.trim() === "";
      togglePanel(button, panel);
      if (!panel.classList.contains("hidden") && wasEmpty) {
        await renderSubjectSessions(panel, subjectName);
      }
    });
  });
}

async function renderSubjectSessions(panel, subjectName) {
  panel.innerHTML = `
    <div class="mb-3 flex items-center justify-between gap-3">
      <div class="text-sm text-slate-300">Sessions for <span class="font-semibold">${escapeHtml(subjectName)}</span></div>
      <div class="text-xs text-slate-500">includeSamples: ${getIncludeSamples() ? "true" : "false"}</div>
    </div>
    <div class="text-sm text-slate-400">Loading sessions…</div>
  `;

  const includeSamples = getIncludeSamples();
  const data = await apiGet("getSessionData", {
    subjectName,
    includeSamples: includeSamples ? "true" : "false",
  });

  const sessions = data.sessions || [];
  sessionsCacheBySubject.set(subjectName, sessions);

  if (sessions.length === 0) {
    panel.innerHTML = `<div class="text-sm text-slate-400">No sessions found.</div>`;
    return;
  }

  panel.innerHTML = `
    <div class="mb-3 flex items-center justify-between gap-3">
      <div class="text-sm text-slate-300">
        Found <span class="font-semibold">${sessions.length}</span> session(s)
      </div>
      <div class="text-xs text-slate-500">Click a session to view JSON below</div>
    </div>
    <div class="grid gap-2">${sessions.map((s) => renderSessionRow(s)).join("")}</div>
  `;

  panel.querySelectorAll("[data-session-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const sessionId = btn.getAttribute("data-session-id");
      await loadSessionJson(sessionId);
    });
  });
}

// ---- Session JSON ----

async function loadSessionJson(sessionId) {
  if (!sessionId) return;

  const includeSamples = getIncludeSamples();
  const cacheKey = `${sessionId}|${includeSamples ? "1" : "0"}`;

  // cache per includeSamples mode
  if (sessionCacheById.has(cacheKey)) {
    const cached = sessionCacheById.get(cacheKey);
    setJsonBox(
      cached,
      `Session ${sessionId} (cached), includeSamples=${includeSamples ? "true" : "false"}`
    );
    return;
  }

  setJsonBox(null, `Loading session ${sessionId}…`);
  try {
    const data = await apiGet("getSessionData", {
      sessionId,
      includeSamples: includeSamples ? "true" : "false",
    });
    sessionCacheById.set(cacheKey, data);
    setJsonBox(
      data,
      `Session ${sessionId}, includeSamples=${includeSamples ? "true" : "false"}`
    );
  } catch (err) {
    setJsonBox(
      { error: err.message, details: err.details || null },
      `Failed to load session ${sessionId}`
    );
  }
}

// ---- UI actions ----

async function refreshAll() {
  setJsonBox(null, "Click a session to load its raw JSON here.");
  el.copyJsonBtn.disabled = true;
  el.clearJsonBtn.disabled = true;

  sessionCacheById.clear();

  await Promise.allSettled([loadExperiments(), loadSubjects()]);
}

el.refreshBtn.addEventListener("click", () => {
  refreshAll().catch((e) => console.error(e));
});

el.copyJsonBtn.addEventListener("click", async () => {
  if (!currentJsonText) return;
  try {
    await copyToClipboard(currentJsonText);
    el.copyJsonBtn.textContent = "Copied";
    setTimeout(() => (el.copyJsonBtn.textContent = "Copy JSON"), 900);
  } catch {
    el.copyJsonBtn.textContent = "Copy failed";
    setTimeout(() => (el.copyJsonBtn.textContent = "Copy JSON"), 1200);
  }
});

el.clearJsonBtn.addEventListener("click", () => {
  setJsonBox(null, "Click a session to load its raw JSON here.");
});

el.includeSamplesToggle.addEventListener("change", () => {
  // Do not auto-refetch everything, but clear JSON viewer so user sees mode changed.
  setJsonBox(null, `includeSamples changed to ${getIncludeSamples() ? "true" : "false"}. Click a session again.`);
  sessionCacheById.clear();
});

// initial
refreshAll().catch((e) => {
  console.error(e);
  setStatus(el.experimentsStatus, `Failed to load: ${e.message}`, "err");
  setStatus(el.subjectsStatus, `Failed to load: ${e.message}`, "err");
});
