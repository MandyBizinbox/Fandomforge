// Lightweight admin helper for Manufacturing Rules migration.
// Adds explicit dry-run/import buttons without changing the large admin page component.

const FF_LEGACY_SEED_PANEL_ID = "ff-legacy-print-option-costing-seed-panel";

function onManufacturingRulesPage() {
  return typeof window !== "undefined" && window.location.pathname === "/admin/manufacturing-rules";
}

function apiBase() {
  return process.env.REACT_APP_API_URL || "/api";
}

async function seedLegacyCosting({ dryRun = true } = {}) {
  const token = window.localStorage.getItem("mf_token");
  const response = await fetch(`${apiBase()}/production-rules/seed-legacy-print-option-costing`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      dry_run: Boolean(dryRun),
      raw_cost_source: "print_option_fallback_to_method",
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.detail || "Legacy costing seed failed");
  }
  return payload;
}

function summariseResult(result) {
  const updates = Array.isArray(result?.updates_preview) ? result.updates_preview : [];
  const unmatched = result?.unmatched_methods || {};
  return [
    `${result?.dry_run ? "Dry run" : "Import complete"}`,
    `Print options seen: ${result?.print_options_seen ?? 0}`,
    `Methods with profiles: ${result?.methods_with_legacy_profiles ?? 0}`,
    `Methods ${result?.dry_run ? "previewed" : "updated"}: ${result?.dry_run ? updates.length : result?.methods_updated ?? 0}`,
    Object.keys(unmatched).length ? `Unmatched methods: ${Object.entries(unmatched).map(([key, count]) => `${key} (${count})`).join(", ")}` : "Unmatched methods: none",
  ].join("\n");
}

function setPanelOutput(panel, text, error = false) {
  const output = panel.querySelector("[data-ff-legacy-seed-output]");
  if (!output) return;
  output.textContent = text;
  output.style.color = error ? "#ff7b72" : "#a3a3a3";
  output.style.display = "block";
}

function button(label, action) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.className = action === "run" ? "btn-primary" : "btn-secondary";
  btn.dataset.ffLegacySeedAction = action;
  return btn;
}

function createPanel() {
  const panel = document.createElement("div");
  panel.id = FF_LEGACY_SEED_PANEL_ID;
  panel.className = "card";
  panel.style.marginTop = "1rem";
  panel.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap;">
      <div>
        <p class="overline" style="margin-bottom:0.5rem;">Migration</p>
        <h2 class="font-display" style="font-size:1.75rem;text-transform:uppercase;margin:0;">Seed legacy Print Option costing</h2>
        <p style="color:var(--ff-muted-text);font-size:0.875rem;margin-top:0.5rem;max-width:48rem;">
          Imports existing Print Option pricing into Manufacturing Rules as linked costing profiles. Default mode remains safe: Print Option first, Method fallback.
        </p>
      </div>
      <div data-ff-legacy-seed-actions style="display:flex;gap:0.5rem;flex-wrap:wrap;"></div>
    </div>
    <pre data-ff-legacy-seed-output style="display:none;white-space:pre-wrap;margin-top:1rem;font-size:0.75rem;border:1px solid var(--ff-card-border);padding:0.75rem;background:rgba(0,0,0,0.25);"></pre>
  `;

  const actions = panel.querySelector("[data-ff-legacy-seed-actions]");
  actions.appendChild(button("Dry Run", "dry-run"));
  actions.appendChild(button("Import Legacy Costing", "run"));

  panel.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const action = target.dataset.ffLegacySeedAction;
    if (!action) return;

    const dryRun = action !== "run";
    if (!dryRun && !window.confirm("Import legacy Print Option costing into Manufacturing Rules now? This updates production method documents but keeps Print Option-first fallback mode.")) {
      return;
    }

    [...panel.querySelectorAll("button")].forEach((btn) => { btn.disabled = true; });
    setPanelOutput(panel, dryRun ? "Running dry run…" : "Importing legacy costing…");
    try {
      const result = await seedLegacyCosting({ dryRun });
      setPanelOutput(panel, summariseResult(result));
      if (!dryRun) {
        window.localStorage.removeItem("ff_builder_production_rules:v1");
        window.setTimeout(() => window.location.reload(), 900);
      }
    } catch (error) {
      setPanelOutput(panel, error?.message || "Legacy costing seed failed", true);
    } finally {
      [...panel.querySelectorAll("button")].forEach((btn) => { btn.disabled = false; });
    }
  });

  return panel;
}

function ensureLegacySeedPanel() {
  if (!onManufacturingRulesPage()) return;
  if (document.getElementById(FF_LEGACY_SEED_PANEL_ID)) return;

  const pageTitle = [...document.querySelectorAll("h1")].find((node) => /manufacturing rules/i.test(node.textContent || ""));
  const statsGrid = pageTitle?.closest("div")?.parentElement?.parentElement?.querySelector(".grid.md\\:grid-cols-4");
  if (statsGrid?.parentElement) {
    statsGrid.insertAdjacentElement("afterend", createPanel());
  }
}

function startLegacySeedRuntime() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  ensureLegacySeedPanel();
  window.setInterval(ensureLegacySeedPanel, 1500);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startLegacySeedRuntime, { once: true });
} else {
  startLegacySeedRuntime();
}
