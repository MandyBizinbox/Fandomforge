// Builder artwork dimension helper.
// Calculates the selected image/text layer's physical print size from the
// selected template print-area dimensions and the layer placement percentage.

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, decimals = 1) {
  const factor = Math.pow(10, decimals);
  return Math.round(number(value) * factor) / factor;
}

function normalise(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function builderShell() {
  return document.querySelector('[data-testid="product-artwork-studio"], .studio-v21');
}

function parsePrintAreaMm(shell) {
  if (!shell) return { widthMm: 0, heightMm: 0 };

  const inspector = findInspector(shell) || shell;
  const candidates = [inspector.textContent || "", shell.textContent || ""];

  for (const text of candidates) {
    const matches = [...String(text || "").matchAll(/(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*mm/gi)];
    if (matches.length) {
      const match = matches[matches.length - 1];
      return { widthMm: number(match[1]), heightMm: number(match[2]) };
    }
  }

  return { widthMm: 0, heightMm: 0 };
}

function selectedLayerBox(shell) {
  if (!shell) return null;

  const candidates = [...shell.querySelectorAll("div")].filter((node) => {
    const cls = String(node.className || "");
    const style = node.getAttribute("style") || "";
    if (!/width:\s*[-\d.]+%/i.test(style) || !/height:\s*[-\d.]+%/i.test(style)) return false;
    if (cls.includes("border-[#34C759]")) return true;
    if (node.querySelector?.('button[aria-label^="Resize"]')) return true;
    return false;
  });

  return candidates[candidates.length - 1] || null;
}

function parseLayerPlacementPct(node) {
  const style = node?.getAttribute?.("style") || "";
  const width = style.match(/width:\s*([-\d.]+)%/i);
  const height = style.match(/height:\s*([-\d.]+)%/i);
  return {
    widthPct: width ? number(width[1], 100) : 100,
    heightPct: height ? number(height[1], 100) : 100,
  };
}

function findInspector(shell) {
  const nodes = [...(shell || document).querySelectorAll("aside,section,div")];
  return nodes.find((node) => {
    const text = normalise(node.textContent || "");
    return text.includes("inspector") && (text.includes("image layer") || text.includes("text layer"));
  }) || null;
}

function findLayerTitle(inspector) {
  if (!inspector) return null;
  const headings = [...inspector.querySelectorAll("h1,h2,h3,div,span")];
  return headings.find((node) => /image layer|text layer/i.test(node.textContent || "")) || null;
}

function ensureDimensionPanel(inspector) {
  if (!inspector) return null;
  let panel = inspector.querySelector("[data-ff-layer-dimensions]");
  if (panel) return panel;

  panel = document.createElement("div");
  panel.dataset.ffLayerDimensions = "1";
  panel.style.margin = "10px 0 14px";
  panel.style.padding = "10px 12px";
  panel.style.border = "1px solid rgba(52,199,89,0.35)";
  panel.style.background = "rgba(52,199,89,0.08)";
  panel.style.color = "#fff";
  panel.style.fontSize = "12px";
  panel.style.lineHeight = "1.45";

  const title = findLayerTitle(inspector);
  const anchor = title?.parentElement || title;
  if (anchor?.insertAdjacentElement) anchor.insertAdjacentElement("afterend", panel);
  else inspector.prepend(panel);

  return panel;
}

function updateLayerDimensions() {
  if (typeof document === "undefined") return;
  const shell = builderShell();
  if (!shell) return;

  const inspector = findInspector(shell);
  const box = selectedLayerBox(shell);
  const { widthMm: areaWidthMm, heightMm: areaHeightMm } = parsePrintAreaMm(shell);
  const panel = ensureDimensionPanel(inspector);
  if (!panel) return;

  if (!box || !areaWidthMm || !areaHeightMm) {
    panel.innerHTML = `<div style="letter-spacing:.16em;text-transform:uppercase;color:#9ca3af;font-size:10px;font-weight:700;">Artwork size</div><div style="margin-top:4px;color:#9ca3af;">Select a layer inside a print area.</div>`;
    return;
  }

  const { widthPct, heightPct } = parseLayerPlacementPct(box);
  const widthMm = areaWidthMm * (widthPct / 100);
  const heightMm = areaHeightMm * (heightPct / 100);
  const widthCm = widthMm / 10;
  const heightCm = heightMm / 10;
  const areaCm2 = widthCm * heightCm;

  panel.innerHTML = `
    <div style="letter-spacing:.16em;text-transform:uppercase;color:#9ca3af;font-size:10px;font-weight:700;">Artwork print size</div>
    <div style="font-weight:800;font-size:15px;margin-top:4px;">${round(widthCm, 1)} × ${round(heightCm, 1)} cm</div>
    <div style="color:#9ca3af;margin-top:2px;">${round(widthMm, 0)} × ${round(heightMm, 0)} mm · ${round(areaCm2, 1)} cm²</div>
    <div style="color:#9ca3af;margin-top:2px;">Print area: ${round(areaWidthMm / 10, 1)} × ${round(areaHeightMm / 10, 1)} cm · Layer: ${round(widthPct, 1)}% × ${round(heightPct, 1)}%</div>
  `;
}

function startLayerDimensionsRuntime() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  updateLayerDimensions();
  window.setInterval(updateLayerDimensions, 350);
  document.addEventListener("change", updateLayerDimensions, true);
  document.addEventListener("mouseup", updateLayerDimensions, true);
  document.addEventListener("keyup", updateLayerDimensions, true);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startLayerDimensionsRuntime, { once: true });
} else {
  startLayerDimensionsRuntime();
}
