import React, { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Copy, Plus, Trash2 } from "lucide-react";
import { assetUrl } from "../../lib/api";
import { geometryClipStyle } from "../../lib/printAreaGeometry";
import {
  clampPercent,
  getPrintAreaOption,
  getPrintSizePreset,
  normalizeArea,
  PRINT_AREA_OPTIONS,
  printSizeLabel,
  safeArray,
} from "./templateStudioUtils";

const MIN_AREA_PERCENT = 1;

function pointerToPercent(event, rect) {
  const width = rect.width || 1;
  const height = rect.height || 1;

  return {
    x: clampPercent(((event.clientX - rect.left) / width) * 100),
    y: clampPercent(((event.clientY - rect.top) / height) * 100),
  };
}

function areaBoxPatch(box = {}) {
  const width = clampPercent(Number(box.width ?? box.width_pct ?? 30), MIN_AREA_PERCENT, 100);
  const height = clampPercent(Number(box.height ?? box.height_pct ?? 30), MIN_AREA_PERCENT, 100);
  const x = clampPercent(Number(box.x ?? box.x_pct ?? 30), 0, Math.max(0, 100 - width));
  const y = clampPercent(Number(box.y ?? box.y_pct ?? 25), 0, Math.max(0, 100 - height));

  return {
    x,
    y,
    width,
    height,
    x_pct: x,
    y_pct: y,
    width_pct: width,
    height_pct: height,
  };
}

function resizeAreaFromHandle(startArea, dx, dy, handle) {
  const start = areaBoxPatch(startArea);
  let x = start.x;
  let y = start.y;
  let width = start.width;
  let height = start.height;

  if (handle.includes("e")) {
    width = clampPercent(start.width + dx, MIN_AREA_PERCENT, Math.max(MIN_AREA_PERCENT, 100 - start.x));
  }

  if (handle.includes("s")) {
    height = clampPercent(start.height + dy, MIN_AREA_PERCENT, Math.max(MIN_AREA_PERCENT, 100 - start.y));
  }

  if (handle.includes("w")) {
    const right = start.x + start.width;
    x = clampPercent(start.x + dx, 0, Math.max(0, right - MIN_AREA_PERCENT));
    width = clampPercent(right - x, MIN_AREA_PERCENT, 100 - x);
  }

  if (handle.includes("n")) {
    const bottom = start.y + start.height;
    y = clampPercent(start.y + dy, 0, Math.max(0, bottom - MIN_AREA_PERCENT));
    height = clampPercent(bottom - y, MIN_AREA_PERCENT, 100 - y);
  }

  return areaBoxPatch({ x, y, width, height });
}

function areaGeometryLayerStyle(area, selected) {
  return {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    border: `2px dashed ${selected ? "var(--ff-primary, #FF3B30)" : "rgba(15, 23, 42, 0.82)"}`,
    background: selected
      ? "color-mix(in srgb, var(--ff-primary, #FF3B30) 18%, transparent)"
      : "rgba(255, 255, 255, 0.16)",
    filter: "drop-shadow(0 0 1px rgba(255, 255, 255, 0.95))",
    transform: `rotate(${Number(area.rotation_deg || 0)}deg)`,
    transformOrigin: "center",
    ...geometryClipStyle(area),
  };
}

export default function PrintAreaCanvas({
  screen,
  printAreas,
  onPrintAreasChange,
  selectedAreaId,
  onSelectedAreaIdChange,
}) {
  const canvasRef = useRef(null);
  const [mode, setMode] = useState("select");
  const [draft, setDraft] = useState(null);
  const [drag, setDrag] = useState(null);

  const screenAreas = useMemo(
    () => safeArray(printAreas)
      .map((area) => normalizeArea(area))
      .filter((area) => area.screen_id === screen?.id),
    [printAreas, screen]
  );

  const updateArea = (areaId, patch) => {
    onPrintAreasChange(
      safeArray(printAreas).map((area) => (
        area.id === areaId
          ? normalizeArea({ ...area, ...areaBoxPatch({ ...area, ...patch }) })
          : area
      ))
    );
  };

  const addDefaultArea = (areaKey = "", geometryType = "rectangle") => {
    if (!screen) return;

    const screenView = screen.view_key || screen.view || "front";
    const areaOption = areaKey
      ? getPrintAreaOption(areaKey)
      : PRINT_AREA_OPTIONS.find((option) => option.defaultView === screenView) || PRINT_AREA_OPTIONS[0];
    const preset = getPrintSizePreset(areaOption.defaultSize || "custom");
    const isCircle = geometryType === "circle";

    const area = normalizeArea({
      name: isCircle ? `${areaOption.label || screen.name || "View"} Circle` : areaOption.label || `${screen.name || "View"} Print Area`,
      screen_id: screen.id,
      screen_view: screenView,
      view_key: screenView,
      area_key: areaOption.value,
      geometry_type: geometryType,
      shape_type: geometryType,
      print_size: preset.value,
      standard_print_size_key: preset.value,
      x: 30,
      y: 25,
      width: 30,
      height: 30,
      width_mm: preset.width_mm,
      height_mm: isCircle ? preset.width_mm : preset.height_mm,
      dpi: 300,
      fit_mode: "contain",
      required: areaOption.value === "neck_label",
      allowed_print_option_ids: [],
    });

    onPrintAreasChange([...safeArray(printAreas), area]);
    onSelectedAreaIdChange(area.id);
    setMode("select");
  };

  const duplicateSelected = () => {
    const selected = safeArray(printAreas).find((area) => area.id === selectedAreaId);
    if (!selected) return;

    const selectedBox = areaBoxPatch(selected);
    const copy = normalizeArea({
      ...selected,
      id: undefined,
      name: `${selected.name} Copy`,
      ...areaBoxPatch({
        ...selectedBox,
        x: selectedBox.x + 3,
        y: selectedBox.y + 3,
      }),
    });

    onPrintAreasChange([...safeArray(printAreas), copy]);
    onSelectedAreaIdChange(copy.id);
  };

  const deleteSelected = () => {
    if (!selectedAreaId) return;
    onPrintAreasChange(safeArray(printAreas).filter((area) => area.id !== selectedAreaId));
    onSelectedAreaIdChange(null);
  };

  const onCanvasPointerDown = (event) => {
    if (!screen || !canvasRef.current || mode !== "draw") return;

    event.preventDefault();

    const rect = canvasRef.current.getBoundingClientRect();
    const start = pointerToPercent(event, rect);
    setDraft({ ...start, startX: start.x, startY: start.y, width: 0, height: 0 });
  };

  const onCanvasPointerMove = (event) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const point = pointerToPercent(event, rect);

    if (draft) {
      const x = Math.min(draft.startX, point.x);
      const y = Math.min(draft.startY, point.y);
      const width = Math.abs(point.x - draft.startX);
      const height = Math.abs(point.y - draft.startY);

      setDraft(areaBoxPatch({ ...draft, x, y, width, height }));
      return;
    }

    if (!drag) return;

    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;

    if (drag.type === "move") {
      const start = areaBoxPatch(drag.area);

      updateArea(drag.area.id, {
        x: clampPercent(start.x + dx, 0, Math.max(0, 100 - start.width)),
        y: clampPercent(start.y + dy, 0, Math.max(0, 100 - start.height)),
        width: start.width,
        height: start.height,
      });
      return;
    }

    if (drag.type === "resize") {
      updateArea(drag.area.id, resizeAreaFromHandle(drag.area, dx, dy, drag.handle || "se"));
    }
  };

  const onCanvasPointerUp = () => {
    if (draft && draft.width > MIN_AREA_PERCENT && draft.height > MIN_AREA_PERCENT) {
      const screenView = screen.view_key || screen.view || "front";
      const areaOption = PRINT_AREA_OPTIONS.find((option) => option.defaultView === screenView) || PRINT_AREA_OPTIONS[0];
      const preset = getPrintSizePreset(areaOption.defaultSize || "custom");

      const area = normalizeArea({
        name: areaOption.label || `${screen.name || "View"} Print Area`,
        screen_id: screen.id,
        screen_view: screenView,
        view_key: screenView,
        area_key: areaOption.value,
        geometry_type: "rectangle",
        shape_type: "rectangle",
        print_size: preset.value,
        standard_print_size_key: preset.value,
        ...areaBoxPatch(draft),
        width_mm: preset.width_mm,
        height_mm: preset.height_mm,
        dpi: 300,
        fit_mode: "contain",
        required: areaOption.value === "neck_label",
        allowed_print_option_ids: [],
      });

      onPrintAreasChange([...safeArray(printAreas), area]);
      onSelectedAreaIdChange(area.id);
      setMode("select");
    }

    setDraft(null);
    setDrag(null);
  };

  useEffect(() => {
    if (!draft && !drag) return undefined;

    const handleWindowPointerMove = (event) => {
      event.preventDefault();
      onCanvasPointerMove(event);
    };

    const handleWindowPointerUp = (event) => {
      event.preventDefault();
      onCanvasPointerUp(event);
    };

    window.addEventListener("pointermove", handleWindowPointerMove, { passive: false });
    window.addEventListener("pointerup", handleWindowPointerUp, { passive: false });
    window.addEventListener("pointercancel", handleWindowPointerUp, { passive: false });

    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerUp);
    };
    // The active drag/draft snapshot must remain stable during each pointer operation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, drag]);

  const beginAreaDrag = (event, area, type, handle = "") => {
    event.preventDefault();
    event.stopPropagation();

    if (!canvasRef.current) return;

    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch (error) {
      // Pointer capture is a convenience only; window listeners handle the drag either way.
    }

    const rect = canvasRef.current.getBoundingClientRect();
    setDrag({
      type,
      handle,
      area: normalizeArea(area),
      start: pointerToPercent(event, rect),
    });
    onSelectedAreaIdChange(area.id);
    setMode("select");
  };

  return (
    <div className="studio-panel h-full">
      <div className="studio-panel-header">
        <div>
          <div className="overline mb-1">Printable boundaries</div>
          <h2 className="font-display text-2xl uppercase">Print areas</h2>
          <p className="text-xs text-zinc-500 mt-2 max-w-md">
            Draw the exact printable boundary for the selected product view. Geometry, physical size and manufacturing rules are saved with this production setup.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={mode === "draw" ? "btn-primary text-xs" : "btn-secondary text-xs"}
            onClick={() => setMode(mode === "draw" ? "select" : "draw")}
          >
            <Plus size={13} /> Draw area
          </button>
          <select
            className="input-base text-xs max-w-[220px]"
            value=""
            onChange={(event) => event.target.value && addDefaultArea(event.target.value)}
          >
            <option value="">Add standard area</option>
            {PRINT_AREA_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button type="button" className="btn-secondary text-xs" onClick={() => addDefaultArea()}>
            Add rectangle
          </button>
          <button type="button" className="btn-secondary text-xs" onClick={() => addDefaultArea("custom", "circle")}>
            <Circle size={13} /> Add circle
          </button>
          <button type="button" className="btn-secondary text-xs" onClick={duplicateSelected} disabled={!selectedAreaId}>
            <Copy size={13} /> Duplicate
          </button>
          <button type="button" className="studio-danger-button" onClick={deleteSelected} disabled={!selectedAreaId} aria-label="Delete selected print area">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {!screen ? (
        <div className="dropzone h-[520px] flex items-center justify-center text-zinc-500">
          Select a product view first.
        </div>
      ) : !screen.image_url ? (
        <div className="dropzone h-[520px] flex items-center justify-center text-center text-zinc-500">
          Upload an editor image for this product view before drawing print areas.
        </div>
      ) : (
        <div className={mode === "draw" ? "print-canvas drawing" : "print-canvas"}>
          <div
            ref={canvasRef}
            className="print-canvas-image-shell"
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onPointerCancel={onCanvasPointerUp}
          >
            <img src={assetUrl(screen.image_url)} alt={screen.name} className="print-canvas-image" draggable="false" />

            {screenAreas.map((area) => {
              const box = areaBoxPatch(area);
              const selected = selectedAreaId === area.id;

              return (
                <div
                  key={area.id}
                  className={selected ? "print-area-box selected" : "print-area-box"}
                  data-geometry={area.geometry_type || "rectangle"}
                  style={{
                    left: `${box.x}%`,
                    top: `${box.y}%`,
                    width: `${box.width}%`,
                    height: `${box.height}%`,
                    background: "transparent",
                    borderColor: "transparent",
                  }}
                  onPointerDown={(event) => beginAreaDrag(event, area, "move")}
                >
                  <div style={areaGeometryLayerStyle(area, selected)} />
                  <span className="print-area-label relative z-[2]">{area.name}</span>
                  <small className="print-area-meta relative z-[2] block text-[10px] leading-tight">
                    {(area.geometry_type || "rectangle")} · {printSizeLabel(area.width_mm, area.height_mm, area.dpi || 300)}
                  </small>

                  {selected && ["nw", "ne", "sw", "se"].map((handle) => (
                    <button
                      key={handle}
                      type="button"
                      className={`print-area-handle print-area-handle-${handle}`}
                      onPointerDown={(event) => beginAreaDrag(event, area, "resize", handle)}
                      aria-label={`Resize print area ${handle}`}
                    />
                  ))}
                </div>
              );
            })}

            {draft && (
              <div
                className="print-area-box draft"
                style={{
                  left: `${draft.x}%`,
                  top: `${draft.y}%`,
                  width: `${draft.width}%`,
                  height: `${draft.height}%`,
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
