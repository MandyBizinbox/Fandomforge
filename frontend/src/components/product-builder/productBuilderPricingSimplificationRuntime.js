// Creator-facing pricing simplification.
//
// The commercial calculation still retains the full production and platform-fee
// model, but the Builder presents one creator-controlled amount: Mark-Up /
// Fundraising. Product cost is shown as one inclusive amount and the recommended
// selling price is calculated from that cost plus the creator amount.

let pricingUiTimer = null;
let lastPricingUiRun = 0;

function normaliseText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function lowerText(value) {
  return normaliseText(value).toLowerCase();
}

function setText(element, value) {
  if (!element) return;
  const next = String(value ?? "");
  if (element.textContent !== next) element.textContent = next;
}

function parseMoney(value) {
  const text = normaliseText(value);
  const currencyMatch = text.match(/R\s*([0-9][0-9\s,.]*)/i);
  const candidate = currencyMatch ? currencyMatch[1] : text;
  const cleaned = String(candidate || "")
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value) {
  const numeric = Number(value);
  return `R ${Number.isFinite(numeric) ? Math.max(numeric, 0).toFixed(2) : "0.00"}`;
}

function setNativeValue(element, value) {
  if (!(element instanceof HTMLInputElement)) return;
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (descriptor?.set) descriptor.set.call(element, value);
  else element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function builderShell() {
  return document.querySelector('[data-testid="creator-product-builder"], [data-testid="admin-product-builder"]');
}

function injectPricingStyles() {
  if (document.getElementById("ff-pricing-simplification-styles")) return;
  const style = document.createElement("style");
  style.id = "ff-pricing-simplification-styles";
  style.textContent = `
    .ff-pricing-hidden { display: none !important; }
    [data-ff-pricing-summary-grid="1"] {
      grid-template-columns: minmax(0, 1fr) !important;
    }
    [data-testid="variation-pricing-matrix"] table[data-ff-pricing-table="1"] {
      min-width: 720px !important;
    }
    [data-testid="variation-pricing-matrix"] .ff-calculated-price-input {
      cursor: default !important;
      background: rgba(255,255,255,0.035) !important;
      color: #fff !important;
    }
    @media (min-width: 768px) {
      [data-ff-pricing-summary-grid="1"] {
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function cardByTitle(panel, title) {
  const wanted = lowerText(title);
  const heading = [...panel.querySelectorAll(".overline")]
    .find((element) => lowerText(element.textContent) === wanted);
  return heading?.closest(".rounded-xl") || null;
}

function cardTitle(card) {
  return card?.querySelector(".overline") || null;
}

function cardDescription(card) {
  if (!card) return null;
  const candidates = [...card.querySelectorAll("div")]
    .filter((element) => String(element.className || "").includes("text-[11px]"));
  return candidates[candidates.length - 1] || null;
}

function metricLabel(card) {
  if (!card) return null;
  return [...card.querySelectorAll("span")]
    .find((element) => String(element.className || "").includes("uppercase")) || null;
}

function metricValue(card) {
  if (!card) return null;
  const candidates = [...card.querySelectorAll("span")]
    .filter((element) => /R\s*[0-9]|Pending/i.test(normaliseText(element.textContent)));
  return candidates[candidates.length - 1] || null;
}

function markupValueFromCard(card) {
  if (!card) return null;
  const input = card.querySelector("input");
  if (input instanceof HTMLInputElement) {
    const parsed = parseMoney(input.value);
    if (parsed !== null) return parsed;
  }
  return parseMoney(metricValue(card)?.textContent || card.textContent);
}

function simplifyPricingSummary(panel) {
  if (!(panel instanceof HTMLElement)) return;

  const totalCard = cardByTitle(panel, "Total product cost") || cardByTitle(panel, "Product cost");
  const markupCard = cardByTitle(panel, "Fundraising amount") || cardByTitle(panel, "Mark-Up / Fundraising");
  const sellingCard = cardByTitle(panel, "Recommended selling price");
  const profitCard = cardByTitle(panel, "Profit per sale");
  const platformCard = cardByTitle(panel, "Platform fee");

  if (!totalCard || !markupCard || !sellingCard) return;

  setText(cardTitle(totalCard), "Product Cost");
  setText(metricLabel(totalCard), "Inclusive product cost");
  setText(cardDescription(totalCard), "Includes the product, printing and applicable platform fee.");

  setText(cardTitle(markupCard), "Mark-Up / Fundraising");
  setText(metricLabel(markupCard), "Per sale");
  setText(cardDescription(markupCard), "Your profit or fundraising amount from each sale.");
  const markupInput = markupCard.querySelector("input");
  if (markupInput instanceof HTMLInputElement) {
    markupInput.setAttribute("aria-label", "Mark-Up / Fundraising amount");
  }

  setText(cardTitle(sellingCard), "Recommended Selling Price");
  setText(metricLabel(sellingCard), "Customer price");
  setText(cardDescription(sellingCard), "Product cost plus your mark-up or fundraising amount.");

  profitCard?.classList.add("ff-pricing-hidden");
  platformCard?.classList.add("ff-pricing-hidden");

  const grid = totalCard.parentElement;
  if (grid instanceof HTMLElement) grid.dataset.ffPricingSummaryGrid = "1";

  const sellingPrice = parseMoney(metricValue(sellingCard)?.textContent || sellingCard.textContent);
  const markup = markupValueFromCard(markupCard);
  if (sellingPrice !== null && markup !== null) {
    setText(metricValue(totalCard), formatMoney(Math.max(sellingPrice - markup, 0)));
  }

  const intro = panel.querySelector("p");
  if (intro) {
    setText(intro, "Set your mark-up or fundraising amount. FandomForge calculates the inclusive product cost and recommended selling price.");
  }
}

function pricingSummaryPanels(scope = document) {
  const panels = new Set();
  [...scope.querySelectorAll(".overline")]
    .filter((element) => lowerText(element.textContent) === "pricing summary")
    .forEach((element) => {
      const panel = element.closest("section");
      if (panel) panels.add(panel);
    });
  return [...panels];
}

function labelByText(scope, text) {
  const wanted = lowerText(text);
  return [...scope.querySelectorAll("label")]
    .find((label) => lowerText(label.textContent).includes(wanted)) || null;
}

function setCheckboxCopy(label, copy) {
  if (!label) return;
  const textNode = [...label.childNodes]
    .find((node) => node.nodeType === Node.TEXT_NODE && normaliseText(node.textContent));
  if (textNode) {
    if (normaliseText(textNode.textContent) !== copy) textNode.textContent = ` ${copy}`;
    return;
  }
  let span = label.querySelector("[data-ff-pricing-checkbox-copy]");
  if (!span) {
    span = document.createElement("span");
    span.dataset.ffPricingCheckboxCopy = "1";
    label.appendChild(span);
  }
  setText(span, copy);
}

function readonlyCalculatedInput(input) {
  if (!(input instanceof HTMLInputElement)) return;
  input.readOnly = true;
  input.tabIndex = -1;
  input.setAttribute("aria-readonly", "true");
  input.classList.add("ff-calculated-price-input");
}

function tableRowInputs(row) {
  if (!(row instanceof HTMLTableRowElement)) return { markupInput: null, retailInput: null };
  const cells = [...row.cells];
  return {
    markupInput: cells[3]?.querySelector("input") || null,
    retailInput: cells[4]?.querySelector("input") || null,
  };
}

function updateVariationRow(row) {
  if (!(row instanceof HTMLTableRowElement)) return;
  const cells = [...row.cells];
  if (cells.length < 6) return;

  cells[2].classList.add("ff-pricing-hidden");
  cells[5].classList.add("ff-pricing-hidden");

  const { markupInput, retailInput } = tableRowInputs(row);
  readonlyCalculatedInput(retailInput);

  const markup = parseMoney(markupInput?.value);
  const retail = parseMoney(retailInput?.value);
  if (markup !== null && retail !== null) {
    setText(cells[1], formatMoney(Math.max(retail - markup, 0)));
  }

  const markupHelp = cells[3]?.querySelector("div");
  if (markupHelp) setText(markupHelp, "Your profit or fundraising amount for this sale.");

  const retailHelp = cells[4]?.querySelector("div");
  if (retailHelp) {
    retailHelp.className = "text-[10px] text-zinc-500 mt-1";
    setText(retailHelp, "Calculated from product cost and mark-up.");
  }

  if (markupInput instanceof HTMLInputElement) {
    markupInput.setAttribute("aria-label", `${normaliseText(cells[0]?.textContent)} Mark-Up / Fundraising amount`);
  }
  if (retailInput instanceof HTMLInputElement) {
    retailInput.setAttribute("aria-label", `${normaliseText(cells[0]?.textContent)} recommended selling price`);
  }
}

function attachApplyMarkupHandler(matrix) {
  if (!(matrix instanceof HTMLElement) || matrix.dataset.ffMarkupApplyHandler === "1") return;
  matrix.dataset.ffMarkupApplyHandler = "1";

  matrix.addEventListener("click", (event) => {
    const button = event.target?.closest?.("button");
    if (!button || !lowerText(button.textContent).includes("check & apply pricing")) return;

    if (button.dataset.ffMarkupReplay === "1") {
      delete button.dataset.ffMarkupReplay;
      return;
    }

    const checkbox = matrix.querySelector('input[type="checkbox"]');
    if (!(checkbox instanceof HTMLInputElement) || !checkbox.checked) return;

    const pricingStep = matrix.closest(".pricing-step-full-width") || builderShell();
    const summaryPanel = pricingSummaryPanels(pricingStep)[0];
    const markupCard = summaryPanel
      ? (cardByTitle(summaryPanel, "Mark-Up / Fundraising") || cardByTitle(summaryPanel, "Fundraising amount"))
      : null;
    const defaultMarkupInput = markupCard?.querySelector("input");
    if (!(defaultMarkupInput instanceof HTMLInputElement)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const defaultMarkup = defaultMarkupInput.value;
    matrix.querySelectorAll("tbody tr").forEach((row) => {
      const { markupInput } = tableRowInputs(row);
      if (markupInput instanceof HTMLInputElement) setNativeValue(markupInput, defaultMarkup);
    });

    checkbox.click();

    window.setTimeout(() => {
      button.dataset.ffMarkupReplay = "1";
      button.click();
    }, 80);
  }, true);
}

function simplifyVariationMatrix(matrix) {
  if (!(matrix instanceof HTMLElement)) return;

  const heading = [...matrix.querySelectorAll("h2")]
    .find((element) => lowerText(element.textContent).includes("variation pricing"));
  setText(heading, "Variation Mark-Up");

  const headingCopy = heading?.parentElement?.querySelector("p");
  if (headingCopy) {
    setText(headingCopy, "Set the profit or fundraising amount for each variation. Recommended selling prices are calculated when pricing is applied.");
  }

  const controlHeading = [...matrix.querySelectorAll(".overline")]
    .find((element) => lowerText(element.textContent) === "default pricing controls");
  const controlBlock = controlHeading?.closest(".rounded-xl") || null;
  const defaultMarkupLabel = labelByText(matrix, "Default fundraising");
  const defaultRetailLabel = labelByText(matrix, "Default retail price");
  const checkbox = matrix.querySelector('input[type="checkbox"]');
  const checkboxLabel = checkbox?.closest("label") || null;

  defaultMarkupLabel?.classList.add("ff-pricing-hidden");
  defaultRetailLabel?.classList.add("ff-pricing-hidden");
  setText(controlHeading, "Variation controls");
  const controlCopy = controlHeading?.parentElement?.querySelector("p");
  if (controlCopy) {
    setText(controlCopy, "Use the Mark-Up / Fundraising amount above as the default and apply it to every variation when required.");
  }
  setCheckboxCopy(checkboxLabel, "Apply Mark-Up / Fundraising to all variations");

  const table = matrix.querySelector("table");
  if (table instanceof HTMLTableElement) {
    table.dataset.ffPricingTable = "1";
    const headers = [...table.querySelectorAll("thead th")];
    if (headers.length >= 6) {
      setText(headers[1], "Product Cost");
      headers[2].classList.add("ff-pricing-hidden");
      setText(headers[3], "Mark-Up / Fundraising");
      setText(headers[4], "Recommended Selling Price");
      headers[5].classList.add("ff-pricing-hidden");
    }

    const rows = [...table.querySelectorAll("tbody tr")];
    rows.forEach(updateVariationRow);

    const standardOnly = rows.length === 1 && lowerText(rows[0].cells?.[0]?.textContent).includes("standard product");
    table.classList.toggle("ff-pricing-hidden", standardOnly);
    controlBlock?.classList.toggle("ff-pricing-hidden", standardOnly);
    if (standardOnly) setText(heading, "Apply Pricing");
  }

  const footerCopy = [...matrix.querySelectorAll("p")]
    .find((element) => lowerText(element.textContent).includes("final fee breakdown"));
  if (footerCopy) {
    setText(footerCopy, "Product cost includes all required production and platform charges.");
  }

  attachApplyMarkupHandler(matrix);
}

function simplifyPricingStep(shell) {
  const pricingStep = shell?.querySelector(".pricing-step-full-width");
  if (!pricingStep) return;

  const topCopy = pricingStep.querySelector(":scope > div:first-child p");
  if (topCopy) {
    setText(topCopy, "Enter your Mark-Up / Fundraising amount, then apply pricing to calculate the inclusive product cost and recommended selling price.");
  }

  pricingSummaryPanels(pricingStep).forEach(simplifyPricingSummary);
  const matrix = pricingStep.querySelector('[data-testid="variation-pricing-matrix"]');
  simplifyVariationMatrix(matrix);
}

function simplifyReview(shell) {
  pricingSummaryPanels(shell).forEach(simplifyPricingSummary);

  shell.querySelectorAll("div").forEach((element) => {
    const text = normaliseText(element.textContent);
    if (!text.startsWith("Costed artwork:")) return;
    const withoutCost = text
      .replace(/^Costed artwork:\s*/i, "Production size: ")
      .replace(/\s*·\s*R\s*[0-9][0-9\s,.]*$/i, "");
    setText(element, withoutCost);
  });
}

function simplifySidebar(shell) {
  const pricingHeading = [...shell.querySelectorAll(".overline")]
    .find((element) => lowerText(element.textContent) === "pricing estimate");
  const section = pricingHeading?.closest("section");
  if (!section) return;

  const rows = [...section.querySelectorAll("tbody tr")];
  if (rows.length < 3) return;

  const selling = parseMoney(rows[1].cells?.[1]?.textContent);
  const markup = parseMoney(rows[2].cells?.[1]?.textContent);
  if (selling !== null && markup !== null) {
    setText(rows[0].cells?.[0], "Product cost");
    setText(rows[0].cells?.[1], formatMoney(Math.max(selling - markup, 0)));
  }
  setText(rows[1].cells?.[0], "Recommended selling price");
  setText(rows[2].cells?.[0], "Mark-Up / Fundraising");

  const note = section.querySelector("p");
  if (note) setText(note, "Product cost includes all required production and platform charges.");
}

function simplifySubmittedProduct() {
  const submitted = document.querySelector('[data-testid="creator-product-approval-submitted"]');
  if (!submitted) return;
  [...submitted.querySelectorAll("div")].forEach((element) => {
    if (lowerText(element.textContent) === "estimated creator/fundraising amount") {
      setText(element, "Mark-Up / Fundraising");
    }
  });
}

function runPricingSimplification() {
  if (typeof document === "undefined") return;
  const now = Date.now();
  if (now - lastPricingUiRun < 120) return;
  lastPricingUiRun = now;

  injectPricingStyles();
  const shell = builderShell();
  if (shell) {
    simplifyPricingStep(shell);
    simplifyReview(shell);
    simplifySidebar(shell);
  }
  simplifySubmittedProduct();
}

function schedulePricingSimplification() {
  if (pricingUiTimer) return;
  pricingUiTimer = window.setTimeout(() => {
    pricingUiTimer = null;
    runPricingSimplification();
  }, 80);
}

if (typeof window !== "undefined" && !window.__fandomForgePricingSimplificationRuntimeLoaded) {
  window.__fandomForgePricingSimplificationRuntimeLoaded = true;
  runPricingSimplification();
  window.setTimeout(runPricingSimplification, 250);
  const observer = new MutationObserver(schedulePricingSimplification);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}
