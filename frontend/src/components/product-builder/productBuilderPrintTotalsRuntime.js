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

function extractVariationCosts() {
  const matrix = variationPricingCard();
  if (!matrix) return { product: 0, printing: 0, total: 0 };
  const firstRow = matrix.querySelector("tbody tr");
  if (!firstRow) return { product: 0, printing: 0, total: 0 };
  const cells = firstRow.querySelectorAll("td");
  const product = parseMoney(cells[1]?.textContent || "");
  const printing = parseMoney(cells[2]?.textContent || "");
  return { product, printing, total: Math.round((product + printing) * 100) / 100 };
}

function extractPricingFallbackSummary() {
  const costs = extractVariationCosts();
  if (!costs.printing) return null;
  return { lines: [{ label: "Printing", total: costs.printing, count: 1 }], total: costs.printing, source: "pricing_fallback" };
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

function productionCostBlock() {
  const candidates = [...document.querySelectorAll(".grid > .rounded-xl, .rounded-xl")];
  return candidates.find((node) => normaliseText(node.textContent).toLowerCase().includes("estimated production cost"));
}

function productionBreakdownMarkup(productCost, printingCost, totalCost, summary) {
  const lines = summary?.lines || [];
  const methodLines = lines.length && summary?.source !== "pricing_fallback"
    ? `<div class="ff-production-method-lines">${lines.map((row) => `<div><span>${row.label}</span><strong>${formatMoney(row.total)}</strong></div>`).join("")}</div>`
    : "";
  return `
    <div class="ff-production-cost-breakdown">
      <div><span>Product</span><strong>${formatMoney(productCost)}</strong></div>
      <div><span>Printing</span><strong>${formatMoney(printingCost)}</strong></div>
      ${methodLines}
      <div class="ff-production-total"><span>Total</span><strong>${formatMoney(totalCost)}</strong></div>
    </div>
  `;
}

function applyProductionCostBreakdown() {
  const block = productionCostBlock();
  if (!block) return false;
  const summary = readSummary() || extractPricingFallbackSummary();
  const costs = extractVariationCosts();
  const existing = block.querySelector(".ff-production-cost-breakdown");
  const originalMetric = [...block.querySelectorAll(".flex")].find((node) => normaliseText(node.textContent).toLowerCase().includes("product + printing"));

  const printingCost = Number(summary?.total || costs.printing || 0);
  const totalFromSummary = parseMoney(originalMetric?.textContent || "");
  const productCost = costs.product || Math.max(0, totalFromSummary - printingCost);
  const totalCost = productCost + printingCost || totalFromSummary;

  if (!printingCost && !totalCost) return false;

  if (originalMetric) originalMetric.style.display = "none";
  const html = productionBreakdownMarkup(productCost, printingCost, totalCost, summary || { lines: [], source: "pricing_fallback" });
  if (existing) existing.outerHTML = html;
  else block.insertAdjacentHTML("afterbegin", html);
  return true;
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

function removePricingMatrixSummary() {
  document.querySelectorAll(".ff-print-method-summary-pricing, [data-testid='variation-pricing-matrix'] .ff-print-method-summary").forEach((node) => node.remove());
}

function run() {
  applyReviewSummary();
  removePricingMatrixSummary();
  applyProductionCostBreakdown();
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
