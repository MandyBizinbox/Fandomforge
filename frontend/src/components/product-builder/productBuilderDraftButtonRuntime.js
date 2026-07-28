// Builder V2 visible Save Draft control.
// Temporary UX bridge until ProductBuilder exposes a native React draft action on every step.

let draftButtonTimer = null;

function normaliseText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function lowerText(value) {
  return normaliseText(value).toLowerCase();
}

function builderShell() {
  return document.querySelector('[data-testid="creator-product-builder"], [data-testid="admin-product-builder"]');
}

function apiUrl(path) {
  return `${window.location.origin}/api${path}`;
}

function authHeaders() {
  const token = window.localStorage.getItem("ff_token")
    || window.localStorage.getItem("mf_token")
    || window.localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function showNotice(message, tone = "info") {
  let node = document.getElementById("ff-builder-draft-save-notice");
  if (!node) {
    node = document.createElement("div");
    node.id = "ff-builder-draft-save-notice";
    node.style.position = "fixed";
    node.style.right = "18px";
    node.style.bottom = "78px";
    node.style.zIndex = "100000";
    node.style.padding = "12px 14px";
    node.style.border = "1px solid rgba(255,255,255,0.18)";
    node.style.background = "#111";
    node.style.color = "#fff";
    node.style.fontSize = "12px";
    node.style.fontWeight = "800";
    node.style.textTransform = "uppercase";
    node.style.letterSpacing = "0.08em";
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.style.borderColor = tone === "error" ? "#FF3B30" : "#34C759";
  window.setTimeout(() => {
    if (node?.parentElement) node.parentElement.removeChild(node);
  }, 3500);
}

function inputForLabelText(text) {
  const labels = [...document.querySelectorAll("label, .label")];
  const label = labels.find((item) => lowerText(item.textContent).includes(text.toLowerCase()));
  if (!label) return null;
  const nested = label.querySelector?.("input, textarea, select");
  if (nested) return nested;
  return label.parentElement?.querySelector?.("input, textarea, select") || null;
}

function selectedOptionFromDetailsPanel() {
  const shell = builderShell();
  const raw = normaliseText(shell?.textContent || "");
  const marker = "Selected product option";
  const start = raw.indexOf(marker);
  if (start === -1) return "";
  const after = raw.slice(start + marker.length).trim();
  const stopWords = ["Category", "Available options", "Creator cost", "Product option"];
  let end = after.length;
  stopWords.forEach((word) => {
    const index = after.indexOf(word);
    if (index > 0 && index < end) end = index;
  });
  return after.slice(0, end).trim();
}

function pathDraftKey() {
  return `ff_builder_v2_path:${window.location.pathname}`;
}

function readPathDraft() {
  try {
    return JSON.parse(window.localStorage.getItem(pathDraftKey()) || "null") || {};
  } catch (error) {
    return {};
  }
}

function writePathDraft(patch) {
  try {
    window.localStorage.setItem(pathDraftKey(), JSON.stringify({ ...readPathDraft(), ...patch, saved_at: Date.now() }));
  } catch (error) {
    // Ignore storage failures.
  }
}

function buildInitialDraftPayload() {
  const path = readPathDraft();
  const titleInput = inputForLabelText("Product title");
  const description = document.querySelector('[data-format-field="description"]');
  const specs = document.querySelector('[data-format-field="specs"]');
  const selectedPanelChoice = selectedOptionFromDetailsPanel();
  const creatorInput = inputForLabelText("Creator");
  return {
    draft_product_id: path.draftProductId || null,
    band_id: creatorInput?.value || null,
    product_type_choice: path.productTypeChoice || "",
    product_option_choice: path.productOptionChoice || selectedPanelChoice || "",
    title: titleInput?.value || path.detailFields?.title || "",
    description: description?.value || path.detailFields?.description || "",
    specs: specs?.value || path.detailFields?.specs || "",
  };
}

function isNewBuilderUrl() {
  return /\/creator\/products\/new\/?$/.test(window.location.pathname) || /\/admin\/products\/new\/?$/.test(window.location.pathname);
}

async function saveInitialServerDraft() {
  const payload = buildInitialDraftPayload();
  if (!normaliseText(payload.product_option_choice)) {
    showNotice("Select a product option first", "error");
    return;
  }
  if (!normaliseText(payload.title)) {
    showNotice("Enter a product title first", "error");
    return;
  }

  showNotice("Saving draft…");
  const response = await fetch(apiUrl("/builder-drafts/product"), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Draft save failed");
  if (!data?.id) throw new Error("Draft saved without product id");
  writePathDraft({ draftProductId: data.id, activeStep: "details" });
  showNotice("Draft saved. Opening draft…");
  const productBase = window.location.pathname.startsWith("/admin/")
    ? "/admin/products"
    : "/creator/products";
  window.location.assign(`${productBase}/${data.id}?builderStep=details`);
}

function stepFromButton(button) {
  const text = lowerText(button?.textContent || "");
  if (text.includes("8 review")) return "review";
  return "";
}

function clickReviewStep() {
  const shell = builderShell();
  const reviewButton = [...(shell?.querySelectorAll("button") || [])].find((button) => stepFromButton(button) === "review");
  if (reviewButton) {
    reviewButton.click();
    return true;
  }
  return false;
}

function clickVisibleSaveButton() {
  const shell = builderShell();
  const buttons = [...(shell?.querySelectorAll("button") || [])];
  const saveButton = buttons.find((button) => {
    const text = lowerText(button.textContent || "");
    return !button.disabled && (text === "save" || text.includes(" save") || text === "create" || text.includes(" create"));
  });
  if (saveButton) {
    saveButton.click();
    return true;
  }
  return false;
}

function saveExistingBuilderDraft() {
  if (clickVisibleSaveButton()) {
    showNotice("Saving draft…");
    return;
  }
  const moved = clickReviewStep();
  if (!moved) {
    showNotice("Could not open Review step", "error");
    return;
  }
  showNotice("Opening Review to save draft…");
  window.setTimeout(() => {
    if (!clickVisibleSaveButton()) showNotice("Complete required fields before saving", "error");
  }, 450);
}

async function handleSaveDraftClick() {
  try {
    if (isNewBuilderUrl()) {
      await saveInitialServerDraft();
      return;
    }
    saveExistingBuilderDraft();
  } catch (error) {
    showNotice(error.message || "Could not save draft", "error");
  }
}

function ensureDraftButton() {
  const shell = builderShell();
  if (!shell || document.getElementById("ff-builder-visible-save-draft")) return;
  const button = document.createElement("button");
  button.id = "ff-builder-visible-save-draft";
  button.type = "button";
  button.textContent = "Save Draft";
  button.style.position = "fixed";
  button.style.right = "18px";
  button.style.bottom = "18px";
  button.style.zIndex = "99999";
  button.style.border = "1px solid rgba(52,199,89,0.8)";
  button.style.background = "#0A1B10";
  button.style.color = "#fff";
  button.style.padding = "12px 16px";
  button.style.fontSize = "12px";
  button.style.fontWeight = "900";
  button.style.textTransform = "uppercase";
  button.style.letterSpacing = "0.08em";
  button.style.boxShadow = "0 12px 30px rgba(0,0,0,0.45)";
  button.addEventListener("click", handleSaveDraftClick);
  document.body.appendChild(button);
}

function scheduleDraftButton() {
  if (draftButtonTimer) return;
  draftButtonTimer = window.setTimeout(() => {
    draftButtonTimer = null;
    ensureDraftButton();
  }, 180);
}

if (typeof window !== "undefined" && !window.__ffBuilderVisibleDraftButtonLoaded) {
  window.__ffBuilderVisibleDraftButtonLoaded = true;
  window.addEventListener("load", ensureDraftButton);
  window.addEventListener("click", scheduleDraftButton, true);
  const observer = new MutationObserver(scheduleDraftButton);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleDraftButton();
}
