// Controlled outsourced production-rate migration panel for Manufacturing Rules.

const PANEL_ID = "ff-outsourced-production-rate-panel";

function onManufacturingRulesPage() {
  return typeof window !== "undefined"
    && window.location.pathname === "/admin/manufacturing-rules";
}

function apiBase() {
  return process.env.REACT_APP_API_URL || "/api";
}

async function runBatch({ dryRun = true } = {}) {
  const token = window.localStorage.getItem("mf_token");
  const response = await fetch(
    `${apiBase()}/production-rules/outsourced-rates/batch`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        dry_run: Boolean(dryRun),
        strict: true,
      }),
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.detail || "Outsourced rate update failed");
  }
  return payload;
}

function formatChange(change) {
  const oldValues = change?.old || {};
  const nextValues = change?.new || {};
  return [
    `${change?.source || "profile"}: ${change?.label || change?.id || "Unnamed"}`,
    `  ${change?.profile_key || "unmatched"}`,
    `  rate ${oldValues.cost_per_cm2 ?? "—"} → ${nextValues.cost_per_cm2 ?? "—"}`,
    `  min area ${oldValues.minimum_area_cm2 ?? "—"} → ${nextValues.minimum_area_cm2 ?? "—"} cm²`,
    `  application ${oldValues.application_cost ?? "—"} → ${nextValues.application_cost ?? "—"}`,
    `  markup ${oldValues.markup_percentage ?? "—"} → ${nextValues.markup_percentage ?? "—"}%`,
  ].join("\n");
}

function summarise(result) {
  const missing = Array.isArray(result?.missing_expected_profiles)
    ? result.missing_expected_profiles
    : [];
  const matched = Array.isArray(result?.matched_profile_keys)
    ? result.matched_profile_keys
    : [];
  const overlapping = Array.isArray(result?.overlapping_application_operations)
    ? result.overlapping_application_operations
    : [];
  const changes = Array.isArray(result?.changes_preview)
    ? result.changes_preview
    : [];

  return [
    result?.dry_run ? "DRY RUN — no records changed" : "OUTSOURCED RATES APPLIED",
    `Version: ${result?.version || "unknown"}`,
    `Print options matched: ${result?.print_options_matched ?? 0}`,
    `Print options updated: ${result?.print_options_updated ?? 0}`,
    `Production methods updated: ${result?.production_methods_updated ?? 0}`,
    `Matched profiles: ${matched.length ? matched.join(", ") : "none"}`,
    `Missing expected profiles: ${missing.length ? missing.join(", ") : "none"}`,
    `Direct application operations suppressed at runtime: ${overlapping.length}`,
    "",
    "Preview:",
    ...(changes.length ? changes.slice(0, 80).map(formatChange) : ["No matching changes found."]),
  ].join("\n");
}

function setOutput(panel, text, error = false) {
  const output = panel.querySelector("[data-outsourced-rate-output]");
  if (!output) return;
  output.textContent = text;
  output.style.display = "block";
  output.style.color = error ? "#ff7b72" : "var(--ff-muted-text, #a3a3a3)";
}

function makeButton(label, action, primary = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.outsourcedRateAction = action;
  button.className = primary ? "btn-primary" : "btn-secondary";
  return button;
}

function createPanel() {
  const panel = document.createElement("section");
  panel.id = PANEL_ID;
  panel.className = "card";
  panel.style.marginTop = "1rem";
  panel.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap;">
      <div style="max-width:52rem;">
        <p class="overline" style="margin-bottom:0.5rem;">Production costing</p>
        <h2 class="font-display" style="font-size:1.75rem;text-transform:uppercase;margin:0;">
          Outsourced production rates
        </h2>
        <p style="color:var(--ff-muted-text);font-size:0.875rem;margin-top:0.5rem;">
          Updates matching Print Options and Manufacturing Rule profiles to the approved running-metre area rates. Uses a 100 cm² minimum area, R7.50 application charge and 5% production markup per physical print job. The dry run must report no missing expected profiles before Apply will succeed.
        </p>
      </div>
      <div data-outsourced-rate-actions style="display:flex;gap:0.5rem;flex-wrap:wrap;"></div>
    </div>
    <pre data-outsourced-rate-output style="display:none;white-space:pre-wrap;max-height:34rem;overflow:auto;margin-top:1rem;font-size:0.75rem;border:1px solid var(--ff-card-border);padding:0.75rem;background:rgba(0,0,0,0.25);"></pre>
  `;

  const actions = panel.querySelector("[data-outsourced-rate-actions]");
  actions.appendChild(makeButton("Dry Run", "dry-run"));
  actions.appendChild(makeButton("Apply Outsourced Rates", "apply", true));

  panel.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const action = target.dataset.outsourcedRateAction;
    if (!action) return;

    const dryRun = action !== "apply";
    if (!dryRun && !window.confirm(
      "Apply the approved outsourced production rates now? This updates matching Print Options and Manufacturing Rule profiles."
    )) return;

    const buttons = [...panel.querySelectorAll("button")];
    buttons.forEach((button) => { button.disabled = true; });
    setOutput(panel, dryRun ? "Running controlled dry run…" : "Applying outsourced production rates…");

    try {
      const result = await runBatch({ dryRun });
      setOutput(panel, summarise(result));
      if (!dryRun) {
        window.localStorage.removeItem("ff_builder_production_rules:v1");
        window.localStorage.removeItem("ff_builder_print_options:v1");
        window.setTimeout(() => window.location.reload(), 1400);
      }
    } catch (error) {
      setOutput(panel, error?.message || "Outsourced rate update failed", true);
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
    }
  });

  return panel;
}

function ensurePanel() {
  if (!onManufacturingRulesPage()) return;
  if (document.getElementById(PANEL_ID)) return;

  const heading = [...document.querySelectorAll("h1")]
    .find((node) => /manufacturing rules/i.test(node.textContent || ""));
  if (!heading) return;

  const pageContainer = heading.closest("main")
    || heading.parentElement?.parentElement
    || heading.parentElement;
  if (!pageContainer) return;

  const cards = [...pageContainer.querySelectorAll(".card")];
  const anchor = cards.find((card) => /seed legacy print option/i.test(card.textContent || ""));
  if (anchor?.parentElement) {
    anchor.insertAdjacentElement("afterend", createPanel());
  } else {
    pageContainer.appendChild(createPanel());
  }
}

function start() {
  ensurePanel();
  window.setInterval(ensurePanel, 1500);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}
