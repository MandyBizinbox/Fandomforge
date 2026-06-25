import React, { useMemo } from "react";
import {
  findSelectedVariation,
  getAttributeOptions,
  getProductAttributeNames,
  getVariationAttributes,
  isColourKey,
  isSizeKey,
} from "./productDisplayUtils";

function swatchStyle(value) {
  const named = {
    black: "#050505",
    white: "#ffffff",
    red: "#d21f2b",
    blue: "#1d4ed8",
    navy: "#172554",
    green: "#166534",
    forest: "#14532d",
    grey: "#737373",
    gray: "#737373",
    charcoal: "#27272a",
    yellow: "#facc15",
    orange: "#f97316",
    purple: "#7e22ce",
    pink: "#ec4899",
  };

  const key = String(value || "").trim().toLowerCase();
  return named[key] || named[key.split(" ")[0]] || null;
}

export default function VariationSelector({ product, selected, onSelectedChange, selectedVariation }) {
  const attrNames = useMemo(() => getProductAttributeNames(product), [product]);
  const variations = product?.variations || [];

  if (variations.length === 0) {
    return null;
  }

  const setValue = (key, value) => {
    const next = { ...selected, [key]: value };
    const exact = findSelectedVariation(product, next);

    if (exact) {
      onSelectedChange(next);
      return;
    }

    // If the selected combination does not exist, keep the changed value and
    // auto-fill the rest from the first available variation with that value.
    const fallback = variations.find((variation) => getVariationAttributes(variation)[key] === value);
    if (fallback) {
      onSelectedChange({ ...getVariationAttributes(fallback), [key]: value });
      return;
    }

    onSelectedChange(next);
  };

  return (
    <div className="space-y-5" data-testid="variation-selector">
      {attrNames.map((attrName) => {
        const options = getAttributeOptions(product, attrName);
        const isColour = isColourKey(attrName);
        const isSize = isSizeKey(attrName);

        return (
          <div key={attrName} data-testid={`variation-attr-${attrName}`}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <label className="label mb-0">{attrName}</label>
              {selected[attrName] && (
                <span className="text-xs text-[var(--ff-muted-text)]">{selected[attrName]}</span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {options.map((value) => {
                const active = selected[attrName] === value;
                const color = isColour ? swatchStyle(value) : null;

                return (
                  <button
                    key={`${attrName}-${value}`}
                    type="button"
                    onClick={() => setValue(attrName, value)}
                    className={`min-h-[42px] border px-4 py-2 text-xs uppercase tracking-widest font-bold inline-flex items-center gap-2 ${
                      active
                        ? "bg-[var(--ff-primary)] border-[var(--ff-primary)] text-[var(--ff-button-primary-text)]"
                        : "border-[var(--ff-card-border)] text-[var(--ff-muted-text)] hover:border-[var(--ff-primary)]"
                    } ${isSize ? "min-w-[56px] justify-center" : ""}`}
                    data-testid={`variation-option-${attrName}-${value}`}
                  >
                    {color && (
                      <span
                        className="w-4 h-4 border border-[var(--ff-card-border)] inline-block"
                        style={{ backgroundColor: color }}
                      />
                    )}
                    <span>{value}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {!selectedVariation && (
        <div className="text-xs uppercase tracking-widest text-[var(--ff-primary)] font-bold">
          Selected combination is not available.
        </div>
      )}
    </div>
  );
}
