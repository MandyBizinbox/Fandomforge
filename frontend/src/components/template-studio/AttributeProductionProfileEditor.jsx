import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Layers3 } from "lucide-react";
import { toast } from "sonner";
import ProductionConfigurationEditor from "./ProductionConfigurationEditor";
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
    const value = `${attribute?.name || ""} ${attribute?.slug || ""}`;
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

  const configured = (
    ownership.mode === "attribute"
    && ownership.image_attribute === imageAttribute
    && ownership.production_attribute === productionAttribute
    && Object.keys(template.attribute_image_profiles || {}).length > 0
    && Object.keys(template.attribute_production_profiles || {}).length > 0
  );

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
      `${imageAttribute} now owns product images and ${productionAttribute} owns print geometry`
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

  const geometryEditorConfiguration = composeAttributeGeometryPreview(
    imageConfiguration,
    productionConfiguration
  );

  const updateImageProfile = (configuration) => {
    const key = attributeProfileKey(selectedImageValue);

    const nextConfiguration = normaliseProductionConfiguration({
      screens: configuration.screens,
      print_areas: [],
      print_option_ids: [],
      print_options: [],
    });

    onChange({
      attribute_image_profiles: {
        ...(template.attribute_image_profiles || {}),
        [key]: {
          attribute_value: selectedImageValue,
          configuration: nextConfiguration,
          updated_at: new Date().toISOString(),
        },
      },
    });
  };

  const updateProductionProfile = (configuration) => {
    const key = attributeProfileKey(selectedProductionValue);
    const geometryConfiguration = geometryOnlyProductionConfiguration(
      configuration
    );

    onChange({
      attribute_production_profiles: {
        ...(template.attribute_production_profiles || {}),
        [key]: {
          attribute_value: selectedProductionValue,
          configuration: normaliseProductionConfiguration(
            geometryConfiguration
          ),
          updated_at: new Date().toISOString(),
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

  return (
    <div className="v3-attribute-profile-editor">
      <section className="v3-card">
        <div className="v3-section-heading">
          <div>
            <div className="overline">Attribute ownership</div>
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
          Example: Small / White resolves to the Small print-area profile
          plus the White product-image profile. Profiles remain linked;
          they are not copied into 140 separate editable records.
        </div>
      </section>

      {configured && (
        <>
          <section className="v3-card">
            <div className="v3-section-heading">
              <div>
                <div className="overline">Image profiles</div>
                <h2>{imageAttribute} product images</h2>
                <p>
                  Upload each view once. Every variation with the same
                  {` ${imageAttribute}`} value inherits these images.
                </p>
              </div>
            </div>

            <div className="v3-profile-tabs">
              {imageValues.map((value) => {
                const config = getAttributeProfileConfiguration(
                  template.attribute_image_profiles,
                  value
                );

                const ready = productionImageConfigurationComplete(
                  config || {}
                );

                return (
                  <button
                    type="button"
                    key={value}
                    className={
                      selectedImageValue === value ? "active" : ""
                    }
                    onClick={() => setSelectedImageValue(value)}
                  >
                    <strong>{value}</strong>
                    <span>
                      {profileCount(variations, imageAttribute, value)}
                      {" "}variations
                    </span>
                    <em className={ready ? "ready" : "incomplete"}>
                      {ready ? "Ready" : "Incomplete"}
                    </em>
                  </button>
                );
              })}
            </div>
          </section>

          {selectedImageValue && (
            <ProductionConfigurationEditor
              mode="images"
              value={imageConfiguration}
              onChange={updateImageProfile}
              printOptions={printOptions}
              title={`${selectedImageValue} product images`}
              subtitle={`These views are inherited by every variation where ${imageAttribute} is ${selectedImageValue}.`}
            />
          )}

          <section className="v3-card">
            <div className="v3-section-heading">
              <div>
                <div className="overline">Production profiles</div>
                <h2>{productionAttribute} print geometry and rules</h2>
                <p>
                  Define dimensions and manufacturing rules once for each
                  {` ${productionAttribute}`} value. The canvas previews the
                  selected size on the currently selected {imageAttribute}
                  image profile.
                </p>
              </div>
            </div>

            <div className="v3-profile-tabs">
              {productionValues.map((value) => {
                const config = getAttributeProfileConfiguration(
                  template.attribute_production_profiles,
                  value
                );

                const ready = productionGeometryConfigurationComplete(
                  config || {}
                );

                return (
                  <button
                    type="button"
                    key={value}
                    className={
                      selectedProductionValue === value ? "active" : ""
                    }
                    onClick={() => setSelectedProductionValue(value)}
                  >
                    <strong>{value}</strong>
                    <span>
                      {profileCount(
                        variations,
                        productionAttribute,
                        value
                      )}
                      {" "}variations
                    </span>
                    <em className={ready ? "ready" : "incomplete"}>
                      {ready ? "Ready" : "Incomplete"}
                    </em>
                  </button>
                );
              })}
            </div>
          </section>

          {selectedProductionValue && (
            <ProductionConfigurationEditor
              mode="geometry"
              value={geometryEditorConfiguration}
              onChange={updateProductionProfile}
              printOptions={printOptions}
              title={`${selectedProductionValue} print geometry and rules`}
              subtitle={`Previewing ${selectedProductionValue} geometry on the ${selectedImageValue || imageAttribute} image profile. Replacing that colour image updates this canvas without changing the geometry.`}
            />
          )}

          <section className="v3-card v3-resolution-summary">
            <div>
              <div className="overline">Resolved variation matrix</div>
              <h2>
                {readyCount} of {variations.length} variations ready
              </h2>
              <p>
                Every final variation is resolved from one image profile
                and one production profile.
              </p>
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
                : `${variations.length - readyCount} incomplete`}
            </div>

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
          </section>
        </>
      )}
    </div>
  );
}
