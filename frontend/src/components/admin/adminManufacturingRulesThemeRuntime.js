// Applies admin dashboard theme variables to the standalone Manufacturing Rules route.
// This prevents the page from inheriting the light public page-shell theme.

const BODY_CLASS = "ff-admin-manufacturing-rules-route";
const STYLE_ID = "ff-admin-manufacturing-rules-theme";

function ensureStyle() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    body.${BODY_CLASS} {
      --bg-primary: #0A0A0A;
      --bg-secondary: #111111;
      --bg-surface: #161616;
      --text-primary: #FFFFFF;
      --text-secondary: #A3A3A3;
      --text-muted: #737373;
      --border: rgba(255,255,255,0.15);
      --brand: #FF3B30;
      --brand-hover: #FF5A52;
      --ff-page-bg: #0A0A0A;
      --ff-page-text: #FFFFFF;
      --ff-card-bg: #111111;
      --ff-card-text: #FFFFFF;
      --ff-muted-text: #A3A3A3;
      --ff-card-border: rgba(255,255,255,0.15);
      --ff-primary: #FF3B30;
      background: #0A0A0A !important;
      color: #FFFFFF !important;
      color-scheme: dark;
    }
    body.${BODY_CLASS} #root,
    body.${BODY_CLASS} .App,
    body.${BODY_CLASS} .page-shell {
      background: #0A0A0A !important;
      color: #FFFFFF !important;
    }
    body.${BODY_CLASS} .page-shell {
      min-height: 100vh;
    }
    body.${BODY_CLASS} .card {
      background: #111111;
      border-color: rgba(255,255,255,0.15);
      color: #FFFFFF;
    }
    body.${BODY_CLASS} input,
    body.${BODY_CLASS} textarea,
    body.${BODY_CLASS} select {
      color-scheme: dark;
    }
    body.${BODY_CLASS} .input-base,
    body.${BODY_CLASS} textarea.input-base,
    body.${BODY_CLASS} select.input-base {
      background: rgba(0,0,0,0.35) !important;
      border-color: rgba(255,255,255,0.2) !important;
      color: #FFFFFF !important;
    }
    body.${BODY_CLASS} .btn-secondary {
      color: #FFFFFF;
      border-color: rgba(255,255,255,0.2);
    }
    body.${BODY_CLASS} .overline,
    body.${BODY_CLASS} .label {
      color: #A3A3A3;
    }
  `;
  document.head.appendChild(style);
}

function syncRouteTheme() {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  ensureStyle();
  const active = window.location.pathname.startsWith("/admin/manufacturing-rules");
  document.body.classList.toggle(BODY_CLASS, active);
}

function patchHistoryMethod(methodName) {
  if (typeof window === "undefined") return;
  const original = window.history?.[methodName];
  if (typeof original !== "function" || original.__ffManufacturingRulesPatched) return;
  const patched = function patchedHistoryMethod(...args) {
    const result = original.apply(this, args);
    window.setTimeout(syncRouteTheme, 0);
    return result;
  };
  patched.__ffManufacturingRulesPatched = true;
  window.history[methodName] = patched;
}

function startManufacturingRulesThemeRuntime() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  patchHistoryMethod("pushState");
  patchHistoryMethod("replaceState");
  window.addEventListener("popstate", syncRouteTheme);
  window.addEventListener("hashchange", syncRouteTheme);
  syncRouteTheme();
  window.setInterval(syncRouteTheme, 1000);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startManufacturingRulesThemeRuntime, { once: true });
  } else {
    startManufacturingRulesThemeRuntime();
  }
}
