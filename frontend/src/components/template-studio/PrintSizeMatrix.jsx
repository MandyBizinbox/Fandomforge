import React, { useMemo } from "react";
import {
  attributeProfileKey,
  blankProductionConfiguration,
  getAttributeProfileConfiguration,
  normaliseProductionConfiguration,
} from "../../lib/variationProductionConfig";
import { safeArray } from "./templateStudioUtils";

function compactKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function areaKey(area = {}) {
  const view = compactKey(
    area.view_key
    || area.screen_view
    || area.view
    || "front"
  );
  const identity = compactKey(
    area.area_key
    || area.name
    || area.id
    || "print-area"
  );
  return `${view}::${identity}`;
}

function areaLabel(area = {}) {
  const view = String(
    area.view_key
    || area.screen_view
    || area.view
    || "View"
  ).replace(/_/g, " ");

  return `${area.name || area.area_key || "Print area"} · ${view}`;
}

function cm(mm) {
  const value = Number(mm);
  if (!Number.isFinite(value) || value <= 0) return "";
  return Number((value / 10).toFixed(2));
}

export default function PrintSizeMatrix({
  productionValues = [],
  productionAttribute = "Size",
  variations = [],
  profiles = {},
  getVariationAttributeValue,
  onChange,
}) {
  const columns = useMemo(() => {
    const byKey = new Map();

    productionValues.forEach((value) => {
      const configuration = (
        getAttributeProfileConfiguration(profiles, value)
        || blankProductionConfiguration()
      );

      safeArray(configuration.print_areas).forEach((area) => {
        const key = areaKey(area);
        if (!byKey.has(key)) {
          byKey.set(key, {
            key,
            label: areaLabel(area),
          });
        }
      });
    });

    return Array.from(byKey.values());
  }, [productionValues, profiles]);

  const variationCount = (value) => safeArray(variations).filter(
    (variation) => (
      getVariationAttributeValue(variation, productionAttribute) === value
    )
  ).length;

  const updateDimension = (productionValue, columnKey, field, rawValue) => {
    const profileKey = attributeProfileKey(productionValue);
    const currentProfile = profiles?.[profileKey] || {};
    const configuration = (
      getAttributeProfileConfiguration(profiles, productionValue)
      || blankProductionConfiguration()
    );

    const parsed = String(rawValue ?? "").trim() === ""
      ? null
      : Number(rawValue);

    const millimetres = (
      parsed === null || !Number.isFinite(parsed)
        ? null
        : Math.max(0, parsed * 10)
    );

    const nextConfiguration = normaliseProductionConfiguration({
      ...configuration,
      print_areas: safeArray(configuration.print_areas).map((area) => (
        areaKey(area) === columnKey
          ? {
              ...area,
              [field]: millimetres,
            }
          : area
      )),
    });

    onChange({
      ...profiles,
      [profileKey]: {
        ...currentProfile,
        attribute_value: productionValue,
        configuration: nextConfiguration,
        updated_at: new Date().toISOString(),
      },
    });
  };

  return (
    <section className="v3-card v3-size-matrix-card">
      <div className="v3-section-heading">
        <div>
          <div className="overline">Physical output dimensions</div>
          <h2>Print size matrix</h2>
          <p>
            Set physical output dimensions in centimetres for every
            {" "}{productionAttribute || "production"} profile. Placement on
            the mockup remains percentage-based in Canvas.
          </p>
        </div>
        <div className="v3-status v3-status-ready">cm</div>
      </div>

      {columns.length ? (
        <div className="v3-size-matrix-scroll">
          <table className="v3-size-matrix">
            <thead>
              <tr>
                <th>{productionAttribute || "Profile"}</th>
                {columns.map((column) => (
                  <th key={column.key}>
                    <strong>{column.label}</strong>
                    <span>W × H cm</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {productionValues.map((value) => {
                const configuration = (
                  getAttributeProfileConfiguration(profiles, value)
                  || blankProductionConfiguration()
                );
                const areas = new Map(
                  safeArray(configuration.print_areas).map(
                    (area) => [areaKey(area), area]
                  )
                );

                return (
                  <tr key={value}>
                    <th scope="row">
                      <strong>{value}</strong>
                      <span>{variationCount(value)} variations</span>
                    </th>
                    {columns.map((column) => {
                      const area = areas.get(column.key);

                      if (!area) {
                        return (
                          <td
                            key={column.key}
                            className="v3-size-matrix-empty"
                          >
                            Not used
                          </td>
                        );
                      }

                      return (
                        <td key={column.key}>
                          <div className="v3-dimension-pair">
                            <label>
                              <span>W</span>
                              <input
                                type="number"
                                min="0"
                                step="0.1"
                                value={cm(area.width_mm)}
                                onChange={(event) => updateDimension(
                                  value,
                                  column.key,
                                  "width_mm",
                                  event.target.value
                                )}
                                aria-label={`${value} ${column.label} width cm`}
                              />
                            </label>
                            <span>×</span>
                            <label>
                              <span>H</span>
                              <input
                                type="number"
                                min="0"
                                step="0.1"
                                value={cm(area.height_mm)}
                                onChange={(event) => updateDimension(
                                  value,
                                  column.key,
                                  "height_mm",
                                  event.target.value
                                )}
                                aria-label={`${value} ${column.label} height cm`}
                              />
                            </label>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="v3-helper-banner">
          Add print areas in Canvas first. They will automatically appear here
          as columns for every {productionAttribute || "production"} profile.
        </div>
      )}
    </section>
  );
}
