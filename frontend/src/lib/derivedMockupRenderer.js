import { assetUrl } from "./api";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value || 0)));
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = assetUrl(source);
  });
}

function roleDefaults(role = "") {
  if (role === "back_mockup") {
    return {
      source_x_pct: 50,
      source_y_pct: 0,
      source_width_pct: 50,
      source_height_pct: 100,
    };
  }

  if (role === "angled_mockup" || role === "side_mockup") {
    return {
      source_x_pct: 15,
      source_y_pct: 0,
      source_width_pct: 70,
      source_height_pct: 100,
    };
  }

  return {
    source_x_pct: 0,
    source_y_pct: 0,
    source_width_pct: 50,
    source_height_pct: 100,
  };
}

export function normaliseDerivedMockupProjection(
  crop = {},
  role = "front_mockup"
) {
  const defaults = roleDefaults(role);

  return {
    source_x_pct: clamp(
      crop.source_x_pct ?? defaults.source_x_pct,
      0,
      100
    ),
    source_y_pct: clamp(
      crop.source_y_pct ?? defaults.source_y_pct,
      0,
      100
    ),
    source_width_pct: clamp(
      crop.source_width_pct ?? defaults.source_width_pct,
      1,
      100
    ),
    source_height_pct: clamp(
      crop.source_height_pct ?? defaults.source_height_pct,
      1,
      100
    ),
    target_x_pct: clamp(crop.target_x_pct ?? 25, 0, 100),
    target_y_pct: clamp(crop.target_y_pct ?? 25, 0, 100),
    target_width_pct: clamp(crop.target_width_pct ?? 50, 1, 100),
    target_height_pct: clamp(crop.target_height_pct ?? 50, 1, 100),
    opacity: clamp(crop.opacity ?? 1, 0, 1),
    rotation_deg: Number(crop.rotation_deg || 0),
    curve_strength: clamp(crop.curve_strength ?? 0, 0, 1),
  };
}

function sourceSegments(sourceCanvas, projection) {
  const sourceWidth = sourceCanvas.width || 1;
  const sourceHeight = sourceCanvas.height || 1;
  const sx = (projection.source_x_pct / 100) * sourceWidth;
  const sy = (projection.source_y_pct / 100) * sourceHeight;
  const sw = (projection.source_width_pct / 100) * sourceWidth;
  const sh = (projection.source_height_pct / 100) * sourceHeight;

  if (sx + sw <= sourceWidth) {
    return [{ sx, sy, sw, sh, fraction: 1 }];
  }

  const firstWidth = Math.max(0, sourceWidth - sx);
  const secondWidth = Math.max(0, sw - firstWidth);

  return [
    {
      sx,
      sy,
      sw: firstWidth,
      sh,
      fraction: firstWidth / sw,
    },
    {
      sx: 0,
      sy,
      sw: secondWidth,
      sh,
      fraction: secondWidth / sw,
    },
  ].filter((segment) => segment.sw > 0 && segment.fraction > 0);
}

function drawFlatProjection(context, sourceCanvas, projection, target) {
  let cursorX = target.x;

  sourceSegments(sourceCanvas, projection).forEach((segment) => {
    const targetWidth = target.width * segment.fraction;
    context.drawImage(
      sourceCanvas,
      segment.sx,
      segment.sy,
      segment.sw,
      segment.sh,
      cursorX,
      target.y,
      targetWidth,
      target.height
    );
    cursorX += targetWidth;
  });
}

function drawCurvedProjection(context, sourceCanvas, projection, target) {
  const strips = 80;
  const segments = sourceSegments(sourceCanvas, projection);
  const totalSourceWidth = segments.reduce((sum, segment) => sum + segment.sw, 0);
  if (!totalSourceWidth) return;

  const flattened = [];
  let sourceCursor = 0;
  segments.forEach((segment) => {
    flattened.push({
      ...segment,
      start: sourceCursor,
      end: sourceCursor + segment.sw,
    });
    sourceCursor += segment.sw;
  });

  for (let index = 0; index < strips; index += 1) {
    const fractionStart = index / strips;
    const fractionEnd = (index + 1) / strips;
    const virtualStart = fractionStart * totalSourceWidth;
    const virtualEnd = fractionEnd * totalSourceWidth;
    const virtualMiddle = (virtualStart + virtualEnd) / 2;
    const segment = flattened.find(
      (item) => virtualMiddle >= item.start && virtualMiddle <= item.end
    ) || flattened[flattened.length - 1];
    const localStart = Math.max(0, virtualStart - segment.start);
    const localEnd = Math.min(segment.sw, virtualEnd - segment.start);
    const sourceStripWidth = Math.max(0.5, localEnd - localStart);
    const normalizedX = ((index + 0.5) / strips) * 2 - 1;
    const edgeCompression = 1 - projection.curve_strength * Math.pow(Math.abs(normalizedX), 2) * 0.22;
    const targetStripWidth = target.width / strips;
    const targetStripHeight = target.height * edgeCompression;
    const targetY = target.y + (target.height - targetStripHeight) / 2;

    context.drawImage(
      sourceCanvas,
      segment.sx + localStart,
      segment.sy,
      sourceStripWidth,
      segment.sh,
      target.x + index * targetStripWidth,
      targetY,
      targetStripWidth + 0.75,
      targetStripHeight
    );
  }
}

export async function renderDerivedMockupCanvas({
  baseImageUrl,
  sourceArtworkCanvas,
  crop = {},
  role = "front_mockup",
}) {
  if (!baseImageUrl) throw new Error("Derived mockup base image is required");
  if (!sourceArtworkCanvas?.width || !sourceArtworkCanvas?.height) {
    throw new Error("Full-wrap artwork source is empty");
  }

  const baseImage = await loadImage(baseImageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = baseImage.naturalWidth || baseImage.width;
  canvas.height = baseImage.naturalHeight || baseImage.height;
  const context = canvas.getContext("2d");
  const projection = normaliseDerivedMockupProjection(crop, role);
  const target = {
    x: (projection.target_x_pct / 100) * canvas.width,
    y: (projection.target_y_pct / 100) * canvas.height,
    width: (projection.target_width_pct / 100) * canvas.width,
    height: (projection.target_height_pct / 100) * canvas.height,
  };

  context.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
  context.save();
  context.globalAlpha = projection.opacity;
  context.translate(
    target.x + target.width / 2,
    target.y + target.height / 2
  );
  context.rotate((projection.rotation_deg * Math.PI) / 180);
  context.translate(
    -(target.x + target.width / 2),
    -(target.y + target.height / 2)
  );

  if (projection.curve_strength > 0) {
    drawCurvedProjection(
      context,
      sourceArtworkCanvas,
      projection,
      target
    );
  } else {
    drawFlatProjection(
      context,
      sourceArtworkCanvas,
      projection,
      target
    );
  }

  context.restore();
  return canvas;
}
