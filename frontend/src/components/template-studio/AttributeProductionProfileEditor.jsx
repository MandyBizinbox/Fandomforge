import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Layers3 } from "lucide-react";
import { toast } from "sonner";
import ProductionConfigurationEditor from "./ProductionConfigurationEditor";
import PrintSizeMatrix from "./PrintSizeMatrix";
import WorkspaceTabs from "./WorkspaceTabs";
import { getVariationLabel, safeArray } from "./templateStudioUtils";
import {
  attributeProfileKey,
  blankProductionConfiguration,
  getAttributeProfileConfiguration,
  getVariationAttributeValue,
  initialiseAttributeProductionProfiles,
  normaliseProductionConfiguration,
  productionConfigurationComplete,
  productionGeometryConfigurationComplete,
  productionImageConfigurationComplete,
  resolveVariationProductionConfiguration,
} from "../../lib/variationProductionConfig";
import {
  composeAttributeGeometryPreview,
  geometryOnlyProductionConfiguration,
} from "../../lib/attributeProductionComposition";

function selectedAttributes(attributes, template) {
  const selectedIds = new Set(safeArray(template.attribute_ids));
  return safeArray(attributes).filter(
    (attribute) => selectedIds.has(attribute.id)
  );
}

function attributeName(attribute) {
  return attribute?.name || attribute?.slug || "";
}

function findDefaultAttribute(attributes, patterns, fallbackIndex = 0) {
  const matching = safeArray(attributes).find((attribute) => {
    const value = String(attribute?.name || "") + " " + String(attribute?.slug || "");
    return patterns.some((pattern) => pattern.test(value));
  });

  return attributeName(matching || safeArray(attributes)[fallbackIndex]);
}

function valuesForAttribute(variations, name) {
  return Array.from(
    new Set(
      safeArray(variations)
        .map((variation) => getVariationAttributeValue(variation, name))
        .filter(Boolean)
    )
  );
}

function profileCount(variations, attribute, value) {
  return safeArray(variations).filter(
    (variation) => (
      getVariationAttributeValue(variation, attribute) === value
    )
  ).length;
}

export default function AttributeProductionProfileEditor({
  template,
  variations,
  attributes,
  printOptions,
  onChange,
}) {
  const availableAttributes = useMemo(
    () => selectedAttributes(attributes, template),
    [attributes, template]
  );

  const ownership = template.variation_inheritance || {};

  const defaultImageAttribute = (
    ownership.image_attribute
    || findDefaultAttribute(
      availableAttributes,
      [/colou?r/i, /finish/i, /material/i],
      0
    )
  );

  const defaultProductionAttribute = (
    ownership.production_attribute
    || findDefaultAttribute(
      availableAttributes,
      [/size/i, /dimension/i, /shape/i],
      availableAttributes.length > 1 ? 1 : 0
    )
  );

  const [imageAttribute, setImageAttribute] = useState(
    defaultImageAttribute
  );

  const [productionAttribute, setProductionAttribute] = useState(
    defaultProductionAttribute
  );

  const imageValues = useMemo(
    () => valuesForAttribute(variations, imageAttribute),
    [variations, imageAttribute]
  );

  const productionValues = useMemo(
    () => valuesForAttribute(variations, productionAttribute),
    [variations, productionAttribute]
  );

  const [selectedImageValue, setSelectedImageValue] = useState(
    imageValues[0] || ""
  );

  const [selectedProductionValue, setSelectedProductionValue] = useState(
    productionValues[0] || ""
  );

  const configured = (
    ownership.mode === "attribute"
    && ownership.image_attribute === imageAttribute
    && ownership.production_attribute === productionAttribute
    && Object.keys(template.attribute_image_profiles || {}).length > 0
    && Object.keys(template.attribute_production_profiles || {}).length > 0
  );

  useEffect(() => {
    if (!imageAttribute && defaultImageAttribute) {
      setImageAttribute(defaultImageAttribute);
    }
  }, [defaultImageAttribute, imageAttribute]);

  useEffect(() => {
    if (!productionAttribute && defaultProductionAttribute) {
      setProductionAttribute(defaultProductionAttribute);
    }
  }, [defaultProductionAttribute, productionAttribute]);

  useEffect(() => {
    if (!imageValues.includes(selectedImageValue)) {
      setSelectedImageValue(imageValues[0] || "");
    }
  }, [imageValues, selectedImageValue]);

  useEffect(() => {
    if (!productionValues.includes(selectedProductionValue)) {
      setSelectedProductionValue(productionValues[0] || "");
    }
  }, [productionValues, selectedProductionValue]);

  const applyOwnership = () => {
    if (!imageAttribute || !productionAttribute) {
      toast.error(
        "Select the attributes that own images and production geometry"
      );
      return;
    }

    const patch = initialiseAttributeProductionProfiles(
      template,
      variations,
      imageAttribute,
      productionAttribute
    );

    onChange(patch);
    toast.success(
      imageAttribute
      + " now owns product images and "
      + productionAttribute
      + " owns print geometry"
    );
  };

  const imageConfiguration = (
    getAttributeProfileConfiguration(
      template.attribute_image_profiles,
      selectedImageValue
    )
    || blankProductionConfiguration()
  );

  const productionConfiguration = (
    getAttributeProfileConfiguration(
      template.attribute_production_profiles,
      selectedProductionValue
    )
    || blankProductionConfiguration()
  );

  const composedConfiguration = composeAttributeGeometryPreview(
    imageConfiguration,
    productionConfiguration
  );

  const updateImageScreens = (screens) => {
    if (!selectedImageValue) return;

    const imageKey = attributeProfileKey(selectedImageValue);
    const nextImageConfiguration = normaliseProductionConfiguration({
      screens,
      print_areas: [],
      print_option_ids: [],
      print_options: [],
    });

    onChange({
      attribute_image_profiles: {
        ...(template.attribute_image_profiles || {}),
        [imageKey]: {
          ...(template.attribute_image_profiles?.[imageKey] || {}),
          attribute_value: selectedImageValue,
          configuration: nextImageConfiguration,
          updated_at: new Date().toISOString(),
        },
      },
    });
  };

  const updateComposedWorkspace = (configuration) => {
    if (!selectedImageValue || !selectedProductionValue) return;

    const imageKey = attributeProfileKey(selectedImageValue);
    const productionKey = attributeProfileKey(selectedProductionValue);
    const now = new Date().toISOString();

    const nextImageConfiguration = normaliseProductionConfiguration({
      screens: configuration.screens,
      print_areas: [],
      print_option_ids: [],
      print_options: [],
    });

    const nextProductionConfiguration = normaliseProductionConfiguration(
      geometryOnlyProductionConfiguration(configuration)
    );

    onChange({
      attribute_image_profiles: {
        ...(template.attribute_image_profiles || {}),
        [imageKey]: {
          ...(template.attribute_image_profiles?.[imageKey] || {}),
          attribute_value: selectedImageValue,
          configuration: nextImageConfiguration,
          updated_at: now,
        },
      },
      attribute_production_profiles: {
        ...(template.attribute_production_profiles || {}),
        [productionKey]: {
          ...(template.attribute_production_profiles?.[productionKey] || {}),
          attribute_value: selectedProductionValue,
          configuration: nextProductionConfiguration,
          updated_at: now,
        },
      },
    });
  };

  const resolvedStatus = useMemo(
    () => safeArray(variations).map((variation) => {
      const configuration = resolveVariationProductionConfiguration(
        variation,
        template
      );

      return {
        variation,
        complete: productionConfigurationComplete(configuration),
      };
    }),
    [template, variations]
  );

  const readyCount = resolvedStatus.filter(
    (row) => row.complete
  ).length;

  const imageReady = productionImageConfigurationComplete(
    imageConfiguration
  );

  const productionReady = productionGeometryConfigurationComplete(
    productionConfiguration
  );

  const ownershipConfiguration = (
    <div className="v3-inline-ownership-config">
      <div className="v3-attribute-profile-grid">
        <label>
          <span>Product images grouped by</span>
          <select
            value={imageAttribute}
            onChange={(event) => setImageAttribute(event.target.value)}
          >
            <option value="">Select attribute</option>
            {availableAttributes.map((attribute) => (
              <option
                key={attribute.id}
                value={attributeName(attribute)}
              >
                {attributeName(attribute)}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Print geometry grouped by</span>
          <select
            value={productionAttribute}
            onChange={(event) => setProductionAttribute(event.target.value)}
          >
            <option value="">Select attribute</option>
            {availableAttributes.map((attribute) => (
              <option
                key={attribute.id}
                value={attributeName(attribute)}
              >
                {attributeName(attribute)}
              </option>
            ))}
          </select>
        </label>

        <div className="v3-attribute-owner-summary">
          <span>Manufacturing rules grouped by</span>
          <strong>{productionAttribute || "Not selected"}</strong>
        </div>
      </div>

      <button
        type="button"
        className="v3-button v3-button-primary"
        onClick={applyOwnership}
      >
        <Layers3 size={15} />
        Apply ownership
      </button>
    </div>
  );

  return (
    <div className="v3-attribute-profile-editor v3-production-studio-v2 v3-production-studio-v3">
      {!configured ? (
        <section className="v3-card v3-ownership-setup-card">
          <div className="v3-section-heading">
            <div>
              <div className="overline">Attribute ownership</div>
              <h2>Choose what owns images and production geometry</h2>
              <p>
                Configure this once. The production workspace will then
                combine the selected image and geometry profiles visually.
              </p>
            </div>
          </div>
          {ownershipConfiguration}
        </section>
      ) : (
        <WorkspaceTabs
          ariaLabel="Production studio workspace"
          initialTab="canvas"
          className="v3-production-workspace-tabs v3-production-workspace-tabs-compact"
          headerContent={(
            <>
              <details className="v3-command-popover v3-ownership-popover">
                <summary>
                  <span>Attribute-owned</span>
                  <small>
                    Images: {imageAttribute}
                    {" · "}
                    Geometry: {productionAttribute}
                  </small>
                </summary>
                <div className="v3-command-popover-panel">
                  <div className="overline">Production ownership</div>
                  {ownershipConfiguration}
                </div>
              </details>

              <label className="v3-command-select" htmlFor="v3-image-profile-select">
                <span>{imageAttribute}</span>
                <select
                  id="v3-image-profile-select"
                  value={selectedImageValue}
                  onChange={(event) => setSelectedImageValue(event.target.value)}
                >
                  {imageValues.map((value) => {
                    const configuration = getAttributeProfileConfiguration(
                      template.attribute_image_profiles,
                      value
                    );
                    const ready = productionImageConfigurationComplete(
                      configuration || {}
                    );

                    return (
                      <option key={value} value={value}>
                        {value}
                        {" · "}
                        {ready ? "Ready" : "Incomplete"}
                      </option>
                    );
                  })}
                </select>
              </label>

              <label className="v3-command-select" htmlFor="v3-production-profile-select">
                <span>{productionAttribute}</span>
                <select
                  id="v3-production-profile-select"
                  value={selectedProductionValue}
                  onChange={(event) => setSelectedProductionValue(event.target.value)}
                >
                  {productionValues.map((value) => {
                    const configuration = getAttributeProfileConfiguration(
                      template.attribute_production_profiles,
                      value
                    );
                    const ready = productionGeometryConfigurationComplete(
                      configuration || {}
                    );

                    return (
                      <option key={value} value={value}>
                        {value}
                        {" · "}
                        {ready ? "Ready" : "Incomplete"}
                      </option>
                    );
                  })}
                </select>
              </label>

              <details className="v3-command-status">
                <summary
                  className={
                    readyCount === variations.length
                      ? "ready"
                      : "incomplete"
                  }
                >
                  <CheckCircle2 size={15} />
                  <span>{readyCount} / {variations.length} ready</span>
                </summary>
                <div className="v3-command-status-panel">
                  <strong>
                    {selectedProductionValue || "—"}
                    {" / "}
                    {selectedImageValue || "—"}
                  </strong>
                  <small>
                    Images {imageReady ? "ready" : "incomplete"}
                    {" · "}
                    Geometry {productionReady ? "ready" : "incomplete"}
                  </small>
                  {resolvedStatus.length > 0 && (
                    <div className="v3-resolved-example">
                      <span>Example</span>
                      <strong>{getVariationLabel(resolvedStatus[0].variation)}</strong>
                      <small>
                        Images from{" "}
                        {getVariationAttributeValue(
                          resolvedStatus[0].variation,
                          imageAttribute
                        )}
                        {" · "}
                        Geometry from{" "}
                        {getVariationAttributeValue(
                          resolvedStatus[0].variation,
                          productionAttribute
                        )}
                      </small>
                    </div>
                  )}
                </div>
              </details>
            </>
          )}
          tabs={[
            {
              id: "canvas",
              label: "Canvas",
              content: (
                <ProductionConfigurationEditor
                  mode="composed"
                  value={composedConfiguration}
                  onChange={updateComposedWorkspace}
                  onScreensChange={updateImageScreens}
                  printOptions={printOptions}
                  title={
                    String(selectedProductionValue)
                    + " / "
                    + String(selectedImageValue)
                  }
                  subtitle=""
                />
              ),
            },
            {
              id: "size-matrix",
              label: "Size matrix",
              badge: productionValues.length,
              content: (
                <PrintSizeMatrix
                  productionValues={productionValues}
                  productionAttribute={productionAttribute}
                  variations={variations}
                  profiles={template.attribute_production_profiles || {}}
                  getVariationAttributeValue={getVariationAttributeValue}
                  onChange={(attribute_production_profiles) => onChange({
                    attribute_production_profiles,
                  })}
                />
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
