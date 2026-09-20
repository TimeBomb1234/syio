/* ==========================================================
   Syio: settings (theme, study preferences, data & privacy)
   Loaded on every page. Exposes window.Syio for script.js.
   ========================================================== */

(() => {
  "use strict";

  const KEYS = {
    theme: "syio:theme",   // plain string: "light" | "dark" | "system"
    prefs: "syio:prefs",   // JSON
    notes: "syio:notes",   // JSON array of saved notes
  };

  const THEMES = ["light", "dark", "system"];
  const DEPTHS = ["balanced", "bullets", "deep"];
  const BOARDS = ["ICSE", "CBSE", "State Board", "IB"];
  const CLASSES = ["6", "7", "8", "9", "10", "11", "12"];
  const DEFAULT_PREFS = { depth: "balanced", board: "CBSE", classLevel: "10" };

  const MAX_SAVED_NOTES = 50;
  const CLOSE_MS = 180; // keep in sync with .is-closing in settings.css

  const root = document.documentElement;
  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  let countLabel = null; // set once the modal is found

  // ---------- Safe storage helpers ----------

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false; // storage full or blocked
    }
  }

  // ---------- Theme ----------

  function getThemePref() {
    try {
      const value = localStorage.getItem(KEYS.theme);
      return THEMES.includes(value) ? value : "system";
    } catch {
      return "system";
    }
  }

  function applyTheme(pref, animate) {
    if (animate) {
      root.classList.add("theme-anim");
      setTimeout(() => root.classList.remove("theme-anim"), 400);
    }
    const effective = pref === "system" ? (darkQuery.matches ? "dark" : "light") : pref;
    root.dataset.theme = effective;
    root.dataset.themePref = pref;
  }

  function setTheme(pref) {
    try {
      localStorage.setItem(KEYS.theme, pref);
    } catch {
      /* the choice still applies for this visit */
    }
    applyTheme(pref, true);
  }

  // "System" follows the OS live
  darkQuery.addEventListener("change", () => {
    if (getThemePref() === "system") applyTheme("system", true);
  });

  // Keep other open tabs in sync
  window.addEventListener("storage", (event) => {
    if (event.key === KEYS.theme) applyTheme(getThemePref(), true);
  });

  // ---------- Study preferences ----------

  function getPrefs() {
    const saved = readJSON(KEYS.prefs, null);
    const s = saved && typeof saved === "object" ? saved : {};
    return {
      depth: DEPTHS.includes(s.depth) ? s.depth : DEFAULT_PREFS.depth,
      board: BOARDS.includes(s.board) ? s.board : DEFAULT_PREFS.board,
      classLevel: CLASSES.includes(s.classLevel) ? s.classLevel : DEFAULT_PREFS.classLevel,
    };
  }

  function savePrefs(changes) {
    writeJSON(KEYS.prefs, { ...getPrefs(), ...changes });
  }

  /** Pre-select the dashboard form using the saved defaults (no-op on other pages). */
  function applyDefaultsToForm() {
    const boardSelect = document.getElementById("board");
    const classSelect = document.getElementById("class_level");
    if (!boardSelect || !classSelect) return;
    const prefs = getPrefs();
    boardSelect.value = prefs.board;
    classSelect.value = prefs.classLevel;
  }

  // ---------- Saved notes ----------

  function getNotes() {
    const notes = readJSON(KEYS.notes, []);
    return Array.isArray(notes) ? notes : [];
  }

  /** Called by script.js after notes are generated. */
  function saveNote(input, notes) {
    const list = getNotes();
    list.unshift({
      id: Date.now().toString(36),
      createdAt: new Date().toISOString(),
      board: input.board,
      class_level: input.class_level,
      subject: input.subject,
      chapter: input.chapter,
      depth: input.depth,
      notes,
    });
    writeJSON(KEYS.notes, list.slice(0, MAX_SAVED_NOTES));
    refreshCount();
  }

  window.Syio = { getPrefs, saveNote };

  // ---------- Modal elements ----------

  const dialog = document.getElementById("settings-dialog");

  // Apply theme + form defaults even if the modal markup is missing
  applyTheme(getThemePref(), false);
  applyDefaultsToForm();

  if (!dialog) return;

  const closeBtn = document.getElementById("settings-close");
  const depthSelect = document.getElementById("set-depth");
  const boardSelect = document.getElementById("set-board");
  const classSelect = document.getElementById("set-class");
  const exportBtn = document.getElementById("set-export");
  const clearBtn = document.getElementById("set-clear");
  const confirmBox = document.getElementById("set-confirm");
  const confirmText = document.getElementById("set-confirm-text");
  const confirmYes = document.getElementById("set-confirm-yes");
  const confirmNo = document.getElementById("set-confirm-no");
  countLabel = document.getElementById("set-count");
  const statusLabel = document.getElementById("set-status");

  let closing = false;
  let statusTimer = null;

  function setStatus(message) {
    statusLabel.textContent = message;
    clearTimeout(statusTimer);
    if (message) statusTimer = setTimeout(() => (statusLabel.textContent = ""), 5000);
  }

  function refreshCount() {
    if (!countLabel) return;
    const count = getNotes().length;
    countLabel.textContent = count
      ? `${count} note${count === 1 ? "" : "s"} saved in this browser`
      : "No notes saved yet";
  }

  function hideConfirm() {
    confirmBox.hidden = true;
  }

  /** Make every control in the modal reflect what is currently saved. */
  function syncControls() {
    const themePref = getThemePref();
    dialog.querySelectorAll('input[name="theme"]').forEach((radio) => {
      radio.checked = radio.value === themePref;
    });

    const prefs = getPrefs();
    depthSelect.value = prefs.depth;
    boardSelect.value = prefs.board;
    classSelect.value = prefs.classLevel;
  }

  // ---------- Open / close ----------

  function openSettings() {
    syncControls();
    refreshCount();
    hideConfirm();
    setStatus("");
    closing = false;
    dialog.classList.remove("is-closing");
    dialog.showModal();
  }

  function closeSettings() {
    if (!dialog.open || closing) return;
    closing = true;
    dialog.classList.add("is-closing");
    setTimeout(() => {
      dialog.close();
      dialog.classList.remove("is-closing");
      closing = false;
    }, CLOSE_MS);
  }

  document.querySelectorAll("[data-open-settings]").forEach((button) => {
    button.addEventListener("click", openSettings);
  });

  closeBtn.addEventListener("click", closeSettings);

  // Esc key: play the closing animation instead of snapping shut
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeSettings();
  });

  // Click on the dimmed backdrop (the dialog element itself) closes it
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeSettings();
  });

  // ---------- Controls ----------

  dialog.addEventListener("change", (event) => {
    const target = event.target;

    if (target.name === "theme") {
      setTheme(target.value);
    } else if (target === depthSelect) {
      savePrefs({ depth: depthSelect.value });
      setStatus("Saved. New notes will use this depth.");
    } else if (target === boardSelect || target === classSelect) {
      savePrefs({ board: boardSelect.value, classLevel: classSelect.value });
      applyDefaultsToForm();
      setStatus("Saved. Your defaults are pre-selected on the dashboard.");
    }
  });

  // ---------- Export ----------

  exportBtn.addEventListener("click", () => {
    const notes = getNotes();
    if (!notes.length) {
      setStatus("No saved notes yet. Generate some notes first.");
      return;
    }

    const payload = {
      app: "Syio",
      exportedAt: new Date().toISOString(),
      count: notes.length,
      notes,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `syio-notes-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    setStatus(`Exported ${notes.length} note${notes.length === 1 ? "" : "s"}.`);
  });

  // ---------- Clear local cache (with confirmation) ----------

  clearBtn.addEventListener("click", () => {
    const count = getNotes().length;
    if (!count) {
      setStatus("Nothing to clear. No notes are saved in this browser.");
      return;
    }
    confirmText.textContent =
      `Delete ${count} saved note${count === 1 ? "" : "s"} from this browser? This can't be undone.`;
    confirmBox.hidden = false;
    confirmNo.focus(); // safest default
  });

  confirmNo.addEventListener("click", () => {
    hideConfirm();
    clearBtn.focus();
  });

  confirmYes.addEventListener("click", () => {
    const count = getNotes().length;
    try {
      localStorage.removeItem(KEYS.notes);
    } catch {
      /* ignore */
    }
    hideConfirm();
    refreshCount();
    setStatus(`Cleared ${count} saved note${count === 1 ? "" : "s"}.`);
    clearBtn.focus();
  });

  refreshCount();
})();
