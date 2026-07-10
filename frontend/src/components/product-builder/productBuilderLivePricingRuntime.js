// Live Builder pricing refresh for manufacturing profile changes.
// React state remains authoritative; this helper fixes immediate visual lag in the
// artwork studio cost summary while print profile transitions settle.

const PROFILE_CACHE_KEY = "ff_builder_print_option_profiles:v1";
const PROFILE_REFRESH_MS = 6000;

let profilesCache = [];
let profilesFetchedAt = 0;
let profilesLoading = false;

function apiBase() {
  return process.env.REACT_APP_API_URL || "/api";
}

function normalise(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value) {
  return `R ${number(value).toFixed(2)}`;
}

function readCachedProfiles() {
  if (profilesCache.length) return profilesCache;
  try {
    const cached = JSON.parse(window.localStorage.getItem(PROFILE_CACHE_KEY) || "null");
    if (Array.isArray(cached?.items)) {
      profilesCache = cached.items;
      profilesFetchedAt = number(cached.fetchedAt, 0);
      return profilesCache;
    }
  } catch (error) {
    // Ignore malformed cache.
  }
  return [];
}

async function fetchProfiles(force = false) {
  if (profilesLoading) return readCachedProfiles();
  if (!force && profilesCache.length && Date.now() - profilesFetchedAt < PROFILE_REFRESH_MS) return profilesCache;
  profilesLoading = true;
  try {
    const response = await fetch(`${apiBase()}/production-rules/print-option-profiles`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) return readCachedProfiles();
    const payload = await response.json();
    profilesCache = Array.isArray(payload) ? payload : [];
    profilesFetchedAt = Date.now();
    window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ items: profilesCache, fetchedAt: profilesFetchedAt }));
    return profilesCache;
  } catch (error) {
    return readCachedProfiles();
  } finally {
    profilesLoading = false;
  }
}

function builderShell() {
  return document.querySelector('[data-testid="product-artwork-studio"], .studio-v21');
}

function selectLooksLikePrintMethod(select) {
  if (!(select instanceof HTMLSelectElement)) return false;
  const label = select.closest("label")?.textContent || "";
  if (/print\s+method/i.test(label)) return true;
  const selectedText = select.selectedOptions?.[0]?.textContent || "";
  return /dtf|sublimation|htv|vinyl|print/i.test(selectedText) && !/colour|color/i.test(label);
}

function parseMoney(text) {
  const match = String(text || "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? number(match[0]) : 0;
}

function costValueElement(labelText) {
  const shell = builderShell();
  if (!shell) return null;
  const labels = [...shell.querySelectorAll("div,span")].filter((node) => normalise(node.textContent) === normalise(labelText));
  for (const label of labels) {
    const parent = label.parentElement;
    const candidate = parent?.querySelector?.(".font-display") || label.nextElementSibling;
    if (candidate && /r\s*\d|\d/i.test(candidate.textContent || "")) return candidate;
  }
  return null;
}

function activeAreaDimensionsMm() {
  const shell = builderShell();
  if (!shell) return { widthMm: 0, heightMm: 0 };
  const text = shell.textContent || "";
  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*mm/gi)];
  if (!matches.length) return { widthMm: 0, heightMm: 0 };
  // Prefer the last visible inspector/active area dimension, which is usually the
  // selected layer area. Fallback behaviour still keeps pricing safe.
  const match = matches[matches.length - 1];
  return { widthMm: number(match[1]), heightMm: number(match[2]) };
}

function activeLayerPlacementPct() {
  const shell = builderShell();
  if (!shell) return { widthPct: 100, heightPct: 100 };
  const candidates = [...shell.querySelectorAll("main div")].filter((node) => {
    const cls = String(node.className || "");
    const style = node.getAttribute("style") || "";
    return cls.includes("border-[#34C759]") && /width:\s*[-\d.]+%/i.test(style) && /height:\s*[-\d.]+%/i.test(style);
  });
  const node = candidates[candidates.length - 1];
  const style = node?.getAttribute("style") || "";
  const width = style.match(/width:\s*([-\d.]+)%/i);
  const height = style.match(/height:\s*([-\d.]+)%/i);
  return {
    widthPct: width ? number(width[1], 100) : 100,
    heightPct: height ? number(height[1], 100) : 100,
  };
}

function calculateProfileCost(profile) {
  if (!profile) return 0;
  const calculationType = profile.calculation_type || "fixed";
  const { widthMm, heightMm } = activeAreaDimensionsMm();
  const { widthPct, heightPct } = activeLayerPlacementPct();
  const chargedWidthMm = widthMm * (widthPct / 100);
  const chargedHeightMm = heightMm * (heightPct / 100);
  const areaCm2 = (chargedWidthMm / 10) * (chargedHeightMm / 10);

  if (["fixed", "manual", "flat_rate"].includes(calculationType)) {
    return number(profile.print_cost_max ?? profile.platform_print_cost ?? profile.creator_print_price ?? 0);
  }

  if (["sheet", "full_sheet"].includes(calculationType)) {
    return number(profile.sheet_cost ?? profile.print_cost_max ?? profile.platform_print_cost ?? 0);
  }

  let costPerCm2 = number(profile.cost_per_cm2, 0);
  if (calculationType === "area_from_sheet" && !costPerCm2) {
    const sheetAreaCm2 = (number(profile.sheet_width_mm) / 10) * (number(profile.sheet_height_mm) / 10);
    costPerCm2 = sheetAreaCm2 > 0 ? number(profile.sheet_cost) / sheetAreaCm2 : 0;
  }

  let raw = areaCm2 * costPerCm2;
  raw *= 1 + number(profile.waste_percentage) / 100;
  raw *= 1 + number(profile.markup_percentage) / 100;
  return Math.round(Math.max(raw, number(profile.minimum_print_cost)) * 100) / 100;
}

function applyLiveCost(select) {
  const optionId = select?.value || "";
  if (!optionId) return;
  const profile = readCachedProfiles().find((item) => item.id === optionId);
  if (!profile) return;

  const selectedEl = costValueElement("Selected artwork cost");
  const totalEl = costValueElement("Total artwork cost");
  if (!selectedEl || !totalEl) return;

  const previousSelected = parseMoney(selectedEl.textContent);
  const previousTotal = parseMoney(totalEl.textContent);
  const nextSelected = calculateProfileCost(profile);
  const nextTotal = Math.round((previousTotal - previousSelected + nextSelected) * 100) / 100;

  selectedEl.textContent = money(nextSelected);
  totalEl.textContent = money(nextTotal);
  selectedEl.dataset.ffLiveProfileCost = String(nextSelected);
  totalEl.dataset.ffLiveProfileCost = String(nextTotal);
}

function scheduleLiveCost(select) {
  fetchProfiles(false).then(() => {
    [0, 80, 240, 500].forEach((delay) => window.setTimeout(() => applyLiveCost(select), delay));
  });
}

function startLivePricingRuntime() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  fetchProfiles(true);
  document.addEventListener("change", (event) => {
    const target = event.target;
    if (target instanceof HTMLSelectElement && selectLooksLikePrintMethod(target)) {
      scheduleLiveCost(target);
    }
  }, true);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startLivePricingRuntime, { once: true });
} else {
  startLivePricingRuntime();
}
