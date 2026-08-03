export const PRINT_AREA_GEOMETRY_TYPES = [
  { value: "rectangle", label: "Rectangle" },
  { value: "circle", label: "Circle" },
  { value: "ellipse", label: "Ellipse" },
  { value: "polygon", label: "Polygon" },
  { value: "mask", label: "Custom mask" },
];

const GEOMETRY_ALIASES = {
  rect: "rectangle",
  square: "rectangle",
  round: "circle",
  oval: "ellipse",
  custom: "mask",
  svg: "mask",
  png: "mask",
};

function numberOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveNumber(value) {
  const number = numberOr(value, 0);
  return number > 0 ? number : 0;
}

export function normaliseGeometryType(value) {
  const key = String(value || "rectangle")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "_");

  const resolved = GEOMETRY_ALIASES[key] || key;
  return PRINT_AREA_GEOMETRY_TYPES.some((option) => option.value === resolved)
    ? resolved
    : "rectangle";
}

export function normalisePolygonPoints(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((point) => {
      if (Array.isArray(point)) {
        return {
          x_pct: numberOr(point[0], 0),
          y_pct: numberOr(point[1], 0),
        };
      }

      if (!point || typeof point !== "object") return null;

      return {
        x_pct: numberOr(point.x_pct ?? point.x, 0),
        y_pct: numberOr(point.y_pct ?? point.y, 0),
      };
    })
    .filter(Boolean);
}

export function normalisePrintAreaGeometry(area = {}) {
  const geometryType = normaliseGeometryType(
    area.geometry_type
      || area.shape_type
      || area.clip_shape
      || area.shape
  );

  const maskUrl = String(
    area.mask_url
      || area.clip_mask_url
      || area.shape_mask_url
      || ""
  );

  const polygonPoints = normalisePolygonPoints(
    area.polygon_points
      || area.points
      || area.clip_points
  );

  return {
    ...area,
    geometry_type: geometryType,
    shape_type: geometryType,
    clip_shape: geometryType,
    mask_url: maskUrl,
    clip_mask_url: maskUrl,
    polygon_points: polygonPoints,
    bleed_mm: positiveNumber(area.bleed_mm),
    safe_margin_mm: positiveNumber(
      area.safe_margin_mm ?? area.safe_zone_mm
    ),
    rotation_deg: numberOr(
      area.rotation_deg ?? area.rotation ?? 0,
      0
    ),
    pricing_area_mode:
      area.pricing_area_mode === "shape"
        ? "shape"
        : "bounding_box",
  };
}

export function printAreaDimensions(area = {}) {
  const widthMm = positiveNumber(
    area.width_mm
      ?? area.print_width_mm
      ?? area.print_area_width_mm
  );
  const heightMm = positiveNumber(
    area.height_mm
      ?? area.print_height_mm
      ?? area.print_area_height_mm
  );

  return { widthMm, heightMm };
}

export function hasUsablePrintArea(area = {}) {
  const normalised = normalisePrintAreaGeometry(area);
  const { widthMm, heightMm } = printAreaDimensions(normalised);

  if (widthMm > 0 && heightMm > 0) return true;

  const widthPct = positiveNumber(
    normalised.width_pct ?? normalised.width
  );
  const heightPct = positiveNumber(
    normalised.height_pct ?? normalised.height
  );

  if (widthPct > 0 && heightPct > 0) return true;

  if (normalised.geometry_type === "polygon") {
    return normalised.polygon_points.length >= 3;
  }

  if (normalised.geometry_type === "mask") {
    return Boolean(normalised.mask_url);
  }

  return false;
}

export function printAreaChargedAreaCm2(area = {}) {
  const normalised = normalisePrintAreaGeometry(area);

  const explicit = positiveNumber(
    normalised.charged_area_cm2
      ?? normalised.area_cm2
      ?? normalised.print_area_cm2
      ?? normalised.dynamic_area_cm2
  );
  if (explicit > 0) return explicit;

  const { widthMm, heightMm } = printAreaDimensions(normalised);
  if (!widthMm || !heightMm) return 0;

  const boxAreaMm2 = widthMm * heightMm;

  if (normalised.pricing_area_mode !== "shape") {
    return boxAreaMm2 / 100;
  }

  if (normalised.geometry_type === "circle") {
    const diameter = Math.min(widthMm, heightMm);
    return (Math.PI * Math.pow(diameter / 2, 2)) / 100;
  }

  if (normalised.geometry_type === "ellipse") {
    return (Math.PI * (widthMm / 2) * (heightMm / 2)) / 100;
  }

  return boxAreaMm2 / 100;
}

export function geometryClipStyle(area = {}) {
  const geometry = normalisePrintAreaGeometry(area);

  if (geometry.geometry_type === "circle") {
    return { borderRadius: "50%" };
  }

  if (geometry.geometry_type === "ellipse") {
    return { borderRadius: "50%" };
  }

  if (geometry.geometry_type === "polygon" && geometry.polygon_points.length >= 3) {
    const polygon = geometry.polygon_points
      .map((point) => `${point.x_pct}% ${point.y_pct}%`)
      .join(", ");
    return { clipPath: `polygon(${polygon})` };
  }

  if (geometry.geometry_type === "mask" && geometry.mask_url) {
    return {
      WebkitMaskImage: `url(${geometry.mask_url})`,
      maskImage: `url(${geometry.mask_url})`,
      WebkitMaskSize: "100% 100%",
      maskSize: "100% 100%",
      WebkitMaskRepeat: "no-repeat",
      maskRepeat: "no-repeat",
    };
  }

  return {};
}
