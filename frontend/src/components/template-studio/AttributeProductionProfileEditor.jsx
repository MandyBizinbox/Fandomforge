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

  const [ownershipOpen, setOwnershipOpen] = useState(!configured);

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

  useEffect(() => {
    if (configured) {
      setOwnershipOpen(false);
    }
  }, [configured]);

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
    setOwnershipOpen(false);

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

  return (
    <div className="v3-attribute-profile-editor v3-production-studio-v2">
      <details
        className="v3-card v3-ownership-details"
        open={ownershipOpen}
        onToggle={(event) => setOwnershipOpen(event.currentTarget.open)}
      >
        <summary>
          <div>
            <div className="overline">Production ownership</div>
            <strong>
              Images: {imageAttribute || "Not selected"}
              {" · "}
              Geometry & rules: {productionAttribute || "Not selected"}
            </strong>
          </div>
          <span>{configured ? "Configured" : "Needs setup"}</span>
        </summary>

        <div className="v3-ownership-details-body">
          <div className="v3-section-heading">
            <div>
              <h2>Configure production by attribute</h2>
              <p>
                Images and print geometry can be owned by different
                attributes. Final variations automatically inherit both.
              </p>
            </div>

            <button
              type="button"
              className="v3-button v3-button-primary"
              onClick={applyOwnership}
            >
              <Layers3 size={15} />
              Apply attribute ownership
            </button>
          </div>

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

          <div className="v3-helper-banner">
            Image profiles and production profiles remain separate records.
            This workspace composes them for editing so one product view shows
            its image and printable boundaries together.
          </div>
        </div>
      </details>

      {configured && (
        <>
          <section className="v3-card v3-production-profile-toolbar">
            <div className="v3-profile-selector">
              <label htmlFor="v3-image-profile-select">
                Image profile · {imageAttribute}
              </label>
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
                      {profileCount(variations, imageAttribute, value)}
                      {" variations · "}
                      {ready ? "Ready" : "Incomplete"}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="v3-profile-selector">
              <label htmlFor="v3-production-profile-select">
                Production profile · {productionAttribute}
              </label>
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
                      {profileCount(variations, productionAttribute, value)}
                      {" variations · "}
                      {ready ? "Ready" : "Incomplete"}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="v3-profile-resolution">
              <span>Current resolution</span>
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
            </div>
          </section>

          <WorkspaceTabs
            ariaLabel="Production studio workspace"
            initialTab="canvas"
            className="v3-production-workspace-tabs"
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
                      + " production views"
                    }
                    subtitle={
                      "Edit "
                      + selectedProductionValue
                      + " geometry on the "
                      + selectedImageValue
                      + " image profile. Replace images, position print areas and set manufacturing rules in one workspace."
                    }
                  />
                ),
              },
              {
                id: "size-matrix",
                label: "Print size matrix",
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

          <details className="v3-card v3-resolution-details">
            <summary>
              <div>
                <div className="overline">Resolved variation matrix</div>
                <strong>
                  {readyCount} of {variations.length} variations ready
                </strong>
              </div>
              <div
                className={
                  readyCount === variations.length
                    ? "v3-status v3-status-ready"
                    : "v3-status v3-status-warning"
                }
              >
                <CheckCircle2 size={16} />
                {readyCount === variations.length
                  ? "All combinations ready"
                  : String(variations.length - readyCount) + " incomplete"}
              </div>
            </summary>

            {resolvedStatus.length > 0 && (
              <div className="v3-resolved-example">
                <span>Example resolution</span>
                <strong>
                  {getVariationLabel(resolvedStatus[0].variation)}
                </strong>
                <small>
                  Images from{" "}
                  {getVariationAttributeValue(
                    resolvedStatus[0].variation,
                    imageAttribute
                  )}
                  {" · "}Geometry from{" "}
                  {getVariationAttributeValue(
                    resolvedStatus[0].variation,
                    productionAttribute
                  )}
                </small>
              </div>
            )}
          </details>
        </>
      )}
    </div>
  );
}
