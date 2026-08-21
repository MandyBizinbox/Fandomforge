import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Copy } from "lucide-react";
import TemplateViewManager from "./TemplateViewManager";
import PrintAreaCanvas from "./PrintAreaCanvas";
import PrintAreaInspector from "./PrintAreaInspector";
import { safeArray } from "./templateStudioUtils";
import {
  normaliseProductionConfiguration,
  productionConfigurationComplete,
  productionGeometryConfigurationComplete,
  productionImageConfigurationComplete,
} from "../../lib/variationProductionConfig";

function uniqueSelectedOptions(configuration, globalOptions) {
  const ids = new Set([
    ...safeArray(configuration.print_option_ids),
    ...safeArray(configuration.print_areas).flatMap(
      (area) => safeArray(area.allowed_print_option_ids)
    ),
  ]);

  const globals = new Map(
    safeArray(globalOptions).map((option) => [option.id, option])
  );

  const locals = new Map(
    safeArray(configuration.print_options).map(
      (option) => [option.id, option]
    )
  );

  return Array.from(ids)
    .map((id) => ({
      ...(globals.get(id) || {}),
      ...(locals.get(id) || {}),
      id,
    }))
    .filter((option) => option.id);
}

export default function ProductionConfigurationEditor({
  value,
  onChange,
  printOptions = [],
  title = "Production Setup",
  subtitle = "Set the editor image, print areas, physical dimensions and print rules in one place.",
  onCopyRequested = null,
  copyLabel = "Copy this setup",
  mode = "complete",
}) {
  const configuration = useMemo(
    () => normaliseProductionConfiguration(value),
    [value]
  );

  const [selectedScreenId, setSelectedScreenId] = useState(
    configuration.screens[0]?.id || null
  );

  const [selectedAreaId, setSelectedAreaId] = useState(
    configuration.print_areas[0]?.id || null
  );

  useEffect(() => {
    if (
      !configuration.screens.some(
        (screen) => screen.id === selectedScreenId
      )
    ) {
      setSelectedScreenId(configuration.screens[0]?.id || null);
    }
  }, [configuration.screens, selectedScreenId]);

  useEffect(() => {
    if (
      !configuration.print_areas.some(
        (area) => area.id === selectedAreaId
      )
    ) {
      setSelectedAreaId(configuration.print_areas[0]?.id || null);
    }
  }, [configuration.print_areas, selectedAreaId]);

  const selectedScreen = (
    configuration.screens.find(
      (screen) => screen.id === selectedScreenId
    )
    || configuration.screens[0]
    || null
  );

  const selectedArea = (
    configuration.print_areas.find(
      (area) => area.id === selectedAreaId
    )
    || null
  );

  const selectedRules = new Set(
    configuration.print_areas.flatMap(
      (area) => safeArray(area.allowed_print_option_ids)
    )
  );

  const complete = (
    mode === "images"
      ? productionImageConfigurationComplete(configuration)
      : mode === "geometry"
        ? productionGeometryConfigurationComplete(configuration)
        : productionConfigurationComplete(configuration)
  );

  const readyLabel = (
    mode === "images"
      ? "Images ready"
      : mode === "geometry"
        ? "Geometry ready"
        : "Production ready"
  );

  const ownershipLabel = (
    mode === "images"
      ? "Image attribute"
      : mode === "geometry"
        ? "Production attribute"
        : "Complete product"
  );

  const helperText = (
    mode === "images"
      ? "Upload each Front, Back, Sleeve or other product image once for this attribute value. Every matching variation inherits these editor views."
      : mode === "geometry"
        ? "Select a reference view, draw the printable boundary and set physical dimensions and manufacturing rules. Every matching variation inherits this geometry."
        : "Add the product/editor image as a view, select it, draw the printable boundary, then choose the manufacturing rule in the print-area inspector."
  );

  const commit = (patch) => {
    const source = {
      ...configuration,
      ...patch,
    };

    if (mode === "images") {
      source.print_areas = [];
      source.print_option_ids = [];
      source.print_options = [];
    }

    const next = normaliseProductionConfiguration(source);

    if (mode !== "images") {
      next.print_option_ids = Array.from(
        new Set(
          next.print_areas.flatMap(
            (area) => safeArray(area.allowed_print_option_ids)
          )
        )
      );

      next.print_options = uniqueSelectedOptions(next, printOptions);
    }

    onChange(next);
  };

  const updateSelectedArea = (area) => {
    commit({
      print_areas: configuration.print_areas.map(
        (item) => item.id === area.id ? area : item
      ),
    });
  };

  return (
    <section
      className="v3-production-editor"
      data-testid="production-configuration-editor"
    >
      <div className="v3-section-heading">
        <div>
          <div className="overline">
            {mode === "images"
              ? "Variation images"
              : mode === "geometry"
                ? "Print geometry and rules"
                : "Production configuration"}
          </div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>

        <div className="v3-heading-actions">
          <div
            className={
              complete
                ? "v3-status v3-status-ready"
                : "v3-status v3-status-warning"
            }
          >
            {complete
              ? <CheckCircle2 size={16} />
              : <CircleAlert size={16} />}
            {complete ? readyLabel : "Setup incomplete"}
          </div>

          {onCopyRequested && copyLabel && (
            <button
              type="button"
              className="v3-button v3-button-secondary"
              onClick={() => onCopyRequested(configuration)}
            >
              <Copy size={15} />
              {copyLabel}
            </button>
          )}
        </div>
      </div>

      <div className="v3-production-summary">
        <div>
          <span>Editor views</span>
          <strong>{configuration.screens.length}</strong>
        </div>
        <div>
          <span>Print areas</span>
          <strong>{configuration.print_areas.length}</strong>
        </div>
        <div>
          <span>Print rules</span>
          <strong>{selectedRules.size}</strong>
        </div>
        <div>
          <span>Ownership</span>
          <strong>{ownershipLabel}</strong>
        </div>
      </div>

      <div className="v3-helper-banner">{helperText}</div>

      {mode === "images" ? (
        <div className="v3-production-grid v3-production-grid-images">
          <TemplateViewManager
            screens={configuration.screens}
            onScreensChange={(screens) => commit({ screens })}
            selectedScreenId={selectedScreen?.id || selectedScreenId}
            onSelectedScreenIdChange={setSelectedScreenId}
          />
        </div>
      ) : (
        <div className="v3-production-grid">
          <TemplateViewManager
            screens={configuration.screens}
            onScreensChange={(screens) => commit({ screens })}
            selectedScreenId={selectedScreen?.id || selectedScreenId}
            onSelectedScreenIdChange={(screenId) => {
              setSelectedScreenId(screenId);
              const firstArea = configuration.print_areas.find(
                (area) => area.screen_id === screenId
              );
              setSelectedAreaId(firstArea?.id || null);
            }}
            mode={mode === "geometry" ? "selector" : "manage"}
          />

          <PrintAreaCanvas
            screen={selectedScreen}
            printAreas={configuration.print_areas}
            onPrintAreasChange={(print_areas) => commit({ print_areas })}
            selectedAreaId={selectedAreaId}
            onSelectedAreaIdChange={setSelectedAreaId}
          />

          <PrintAreaInspector
            selectedArea={selectedArea}
            printOptions={printOptions}
            onChange={updateSelectedArea}
          />
        </div>
      )}
    </section>
  );
}
