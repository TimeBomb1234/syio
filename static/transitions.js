/* ==========================================================
   Syio: page transitions
   Intercepts internal links, plays the curtain, then navigates.
   The new page starts covered (see _transition_head.html) and
   reveals itself once it is ready.
   ========================================================== */

(() => {
  "use strict";

  const STORAGE_KEY = "syio-pt";
  const MIN_HOLD_MS = 250;      // how long the logo stays before the reveal
  const FONT_WAIT_MS = 800;     // don't wait longer than this for web fonts
  const NAV_BUFFER_MS = 80;     // small buffer so the logo underline finishes

  const root = document.documentElement;
  const overlay = document.querySelector(".pt");
  const layerCount = document.querySelectorAll(".pt-layer").length;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // If the overlay markup is missing, do nothing and let links work normally.
  if (!overlay || layerCount === 0) return;

  let busy = false;

  // ---------- Timing (read from CSS so the two files stay in sync) ----------

  function cssMs(name, fallback) {
    const raw = getComputedStyle(root).getPropertyValue(name).trim();
    const value = parseFloat(raw);
    if (Number.isNaN(value)) return fallback;
    return raw.endsWith("ms") ? value : raw.endsWith("s") ? value * 1000 : value;
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function coverDuration() {
    return cssMs("--pt-dur", 520) + cssMs("--pt-stagger", 60) * (layerCount - 1);
  }

  function revealDuration() {
    return (
      cssMs("--pt-out-lead", 180) +
      cssMs("--pt-dur", 520) +
      cssMs("--pt-stagger", 60) * (layerCount - 1)
    );
  }

  // ---------- Leaving the current page ----------

  function leave(url) {
    busy = true;

    // Going to the landing page sweeps the other way, like "back"
    const direction = url.pathname === "/" ? "rtl" : "ltr";

    root.classList.remove("pt-hold", "pt-out");
    root.classList.toggle("pt-rtl", direction === "rtl");
    root.classList.add("pt-in");

    try {
      sessionStorage.setItem(STORAGE_KEY, direction);
    } catch {
      /* storage blocked: the next page simply appears without the reveal */
    }

    setTimeout(() => {
      window.location.assign(url.href);
    }, coverDuration() + NAV_BUFFER_MS);
  }

  // ---------- Arriving on the new page ----------

  function cleanup() {
    root.classList.remove("pt-in", "pt-hold", "pt-out", "pt-rtl");
    busy = false;
  }

  async function reveal() {
    if (!root.classList.contains("pt-hold")) return; // normal page load

    const fontsReady = document.fonts && document.fonts.ready
      ? Promise.race([document.fonts.ready, wait(FONT_WAIT_MS)])
      : Promise.resolve();

    await Promise.all([fontsReady, wait(MIN_HOLD_MS)]);

    root.classList.remove("pt-hold");
    root.classList.add("pt-out");
    setTimeout(cleanup, revealDuration() + 60);
  }

  // ---------- Link interception ----------

  function shouldIntercept(event, link) {
    if (event.defaultPrevented) return false;
    if (event.button !== 0) return false;                                  // left click only
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false; // new tab/window
    if (reducedMotion.matches) return false;                               // respect user setting
    if (link.hasAttribute("download")) return false;
    if (link.hasAttribute("data-no-transition")) return false;
    if (link.target && link.target !== "_self") return false;
    return true;
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link || !shouldIntercept(event, link)) return;

    const url = new URL(link.href, window.location.href);

    if (url.origin !== window.location.origin) return;                     // external link, mailto:, etc.
    if (url.pathname === window.location.pathname && url.search === window.location.search) {
      return;                                                              // same page or #anchor
    }

    event.preventDefault();
    if (busy) return;                                                      // ignore double clicks
    leave(url);
  });

  // Back/forward can restore this page from the browser cache mid-transition.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) cleanup();
  });

  reveal();
})();
