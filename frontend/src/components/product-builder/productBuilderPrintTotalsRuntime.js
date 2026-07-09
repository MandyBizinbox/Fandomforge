// Compact print-method totals for Builder V2 pricing/review screens.
// Keeps creator-facing pricing simple while the large ProductBuilder component is being refactored.

const SUMMARY_PREFIX = "ff_builder_print_method_summary:";
let summaryTimer = null;

function normaliseText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseMoney(value) {
  const match = String(value || "").replace(/,/g, ".").match(/R\s*([0-9]+(?:\.[0-9]+)?)/i);
  return match ? Number(match[1]) : 0;
}

function formatMoney(value) {
  return `R ${Number(value || 0).toFixed(2)}`;
}

function key() {
  return `${SUMMARY_PREFIX}${window.location.pathname}`;
}

function readSummary() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key()) || "null");
    return parsed?.lines?.length ? parsed : null;
  } catch {
    return null;
  }
}

function writeSummary(summary) {
  if (!summary?.lines?.length) return;
  try {
    window.localStorage.setItem(key(), JSON.stringify({ ...summary, saved_at: Date.now() }));
  } catch {
    // Ignore storage quota/private mode.
  }
}

function methodLabel(raw) {
  const value = normaliseText(raw);
  if (!value || value.toLowerCase() === "missing") return "Unassigned print method";
  const lower = value.toLowerCase();
  if (lower.includes("dtf")) return lower.includes("uv") ? "UV DTF" : "DTF Transfers";
  if (lower.includes("htv") || lower.includes("heat transfer")) return "HTV";
  if (lower.includes("sublimation")) return "Sublimation";
  if (lower.includes("adhesive") || lower.includes("vinyl")) return "Adhesive Vinyl";
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function findCardByHeading(text) {
  const needle = text.toLowerCase();
  return [...document.querySelectorAll("section.card, .card")].find((node) => normaliseText(node.textContent).toLowerCase().includes(needle));
}

function variationPricingCard() {
  return document.querySelector('[data-testid="variation-pricing-matrix"]');
}

function extractReviewSlotSummary() {
  const section = findCardByHeading("Production output metadata");
  if (!section || !normaliseText(section.textContent).toLowerCase().includes("artwork slots")) return null;

  const slotCards = [...section.querySelectorAll(".rounded-xl")].filter((node) => {
    const text = normaliseText(node.textContent);
    return text.includes("Costed artwork:") && text.includes("Print rule");
  });

  const totals = new Map();
  slotCards.forEach((card) => {
    const text = normaliseText(card.textContent);
    const costMatch = text.match(/Costed artwork:[\s\S]*?(R\s*[0-9]+(?:[.,][0-9]+)?)/i);
    const cost = parseMoney(costMatch?.[1] || text);
    const methodMatch = text.match(/Print rule\s*([\s\S]*?)\s*DPI/i) || text.match(/Print rule\s*([\s\S]*?)\s*Remove/i);
    const label = methodLabel(methodMatch?.[1] || "Print method");
    if (!totals.has(label)) totals.set(label, { label, total: 0, count: 0 });
    const row = totals.get(label);
    row.total = Math.round((row.total + cost) * 100) / 100;
    row.count += 1;
  });

  const lines = [...totals.values()].filter((row) => row.total > 0 || row.count > 0);
  if (!lines.length) return null;
  const total = Math.round(lines.reduce((sum, row) => sum + Number(row.total || 0), 0) * 100) / 100;
  return { lines, total, source: "review" };
}

function extractPricingFallbackSummary() {
  const matrix = variationPricingCard();
  if (!matrix) return null;
  const text = normaliseText(matrix.textContent);
  if (!text.toLowerCase().includes("print cost")) return null;
  const firstPrintCostMatch = text.match(/Print cost\s*Fundraising amount[\s\S]*?R\s*([0-9]+(?:[.,][0-9]+)?)/i)
    || text.match(/Print cost[\s\S]*?R\s*([0-9]+(?:[.,][0-9]+)?)/i);
  const value = firstPrintCostMatch ? Number(String(firstPrintCostMatch[1]).replace(",", ".")) : 0;
  if (!Number.isFinite(value) || value <= 0) return null;
  return { lines: [{ label: "Total printing", total: value, count: 1 }], total: value, source: "pricing_fallback" };
}

function compactSummaryMarkup(summary, options = {}) {
  const lines = summary?.lines || [];
  const total = Number(summary?.total || lines.reduce((sum, row) => sum + Number(row.total || 0), 0));
  const subtitle = options.subtitle || "Grouped by print method.";
  return `
    <div class="ff-print-method-summary ff-print-method-summary-inline ${options.className || ""}">
      <div class="ff-print-summary-head">
        <div>
          <div class="overline mb-1">Printing Method Totals</div>
          <h3 class="font-display text-xl uppercase text-white">Print cost summary</h3>
          <p class="text-xs text-zinc-500 mt-1">${subtitle}</p>
        </div>
        <div class="ff-print-summary-total">
          <div>Total print cost</div>
          <strong>${formatMoney(total)}</strong>
        </div>
      </div>
      <div class="ff-print-summary-grid">
        ${lines.map((row) => `
          <div class="ff-print-summary-pill">
            <span>${row.label}</span>
            <strong>${formatMoney(row.total)}</strong>
            <em>${row.count || 1} charged line${Number(row.count || 1) === 1 ? "" : "s"}</em>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function reviewSummaryMarkup(summary, options = {}) {
  const lines = summary?.lines || [];
  const total = Number(summary?.total || lines.reduce((sum, row) => sum + Number(row.total || 0), 0));
  const subtitle = options.subtitle || "Layer details are collapsed here. Only totals per print method are shown.";
  return `
    <div class="ff-print-method-summary rounded-xl border border-white/10 bg-black/30 p-5 ${options.className || ""}">
      <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <div class="overline mb-1">Printing Method Totals</div>
          <h3 class="font-display text-2xl uppercase text-white">Print cost summary</h3>
          <p class="text-xs text-zinc-500 mt-1">${subtitle}</p>
        </div>
        <div class="rounded-lg border border-[#34C759]/40 bg-[#34C759]/10 px-3 py-2 text-right">
          <div class="text-[10px] uppercase tracking-widest text-[#B8F5C3]">Total print cost</div>
          <div class="font-display text-2xl text-white">${formatMoney(total)}</div>
        </div>
      </div>
      <div class="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        ${lines.map((row) => `
          <div class="rounded-lg border border-white/10 bg-black/25 p-3">
            <div class="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">${row.label}</div>
            <div class="font-bold text-white text-lg">${formatMoney(row.total)}</div>
            <div class="text-[11px] text-zinc-600 mt-1">${row.count || 1} charged line${Number(row.count || 1) === 1 ? "" : "s"}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function placeReviewSummaryBefore(target, summary, options = {}) {
  if (!target || !summary?.lines?.length) return;
  const existing = document.querySelector(options.selector || ".ff-print-method-summary-review");
  if (existing) existing.outerHTML = reviewSummaryMarkup(summary, options);
  else target.insertAdjacentHTML("beforebegin", reviewSummaryMarkup(summary, options));
}

function insertPricingSummaryInMatrix(matrix, summary) {
  if (!matrix || !summary?.lines?.length) return;
  const inner = matrix.querySelector(".p-5") || matrix;
  let existing = inner.querySelector(".ff-print-method-summary-pricing");
  const html = compactSummaryMarkup(summary, {
    className: "ff-print-method-summary-pricing",
    subtitle: summary.source === "pricing_fallback"
      ? "Current total print cost used by pricing. Method totals refresh after Review has loaded once."
      : "Grouped by print method from the current artwork setup.",
  });
  if (existing) {
    existing.outerHTML = html;
    return;
  }

  const defaultControls = [...inner.querySelectorAll(".rounded-xl")].find((node) => normaliseText(node.textContent).toLowerCase().includes("default pricing controls"));
  if (defaultControls) defaultControls.insertAdjacentHTML("beforebegin", html);
  else inner.insertAdjacentHTML("afterbegin", html);
}

function applyReviewSummary() {
  const section = findCardByHeading("Production output metadata");
  if (!section || !normaliseText(section.textContent).toLowerCase().includes("artwork slots")) return false;
  const summary = extractReviewSlotSummary();
  if (!summary) return false;
  writeSummary(summary);
  placeReviewSummaryBefore(section, summary, {
    selector: ".ff-print-method-summary-review",
    className: "ff-print-method-summary-review",
    subtitle: "Layer details are collapsed here. Only totals per print method are shown to keep the review step readable.",
  });
  section.style.display = "none";
  return true;
}

function applyPricingSummary() {
  const matrix = variationPricingCard();
  if (!matrix) return false;
  const summary = readSummary() || extractPricingFallbackSummary();
  if (!summary) return false;
  const stray = document.querySelector(".pricing-step-full-width > .ff-print-method-summary-pricing");
  if (stray) stray.remove();
  insertPricingSummaryInMatrix(matrix, summary);
  return true;
}

function run() {
  applyReviewSummary();
  applyPricingSummary();
}

function schedule() {
  if (summaryTimer) return;
  summaryTimer = window.setTimeout(() => {
    summaryTimer = null;
    run();
  }, 180);
}

if (typeof window !== "undefined" && !window.__fandomForgePrintTotalsRuntimeLoaded) {
  window.__fandomForgePrintTotalsRuntimeLoaded = true;
  window.setTimeout(run, 400);
  window.setInterval(schedule, 800);
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
}
