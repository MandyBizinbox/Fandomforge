import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, Copy, ImagePlus, Save, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { assetUrl, http } from "../../lib/api";
import ProductionConfigurationEditor from "./ProductionConfigurationEditor";
import AttributeProductionProfileEditor from "./AttributeProductionProfileEditor";
import TemplateGalleryManager from "./TemplateGalleryManager";
import {
  blankTemplate,
  buildVariationCombinations,
  getVariationLabel,
  money,
  newId,
  safeArray,
  slugify,
} from "./templateStudioUtils";
import {
  applyProductionConfigurationToVariations,
  blankProductionConfiguration,
  compileVariableTemplateProduction,
  getVariationProductionConfiguration,
  resolveVariationProductionConfiguration,
  normaliseProductionConfiguration,
  productionConfigurationComplete,
  setVariationProductionConfiguration,
  variationProductionSummary,
} from "../../lib/variationProductionConfig";
import "./templateStudioV3.css";

const SECTION_LABELS = {
  product: "Product",
  production: "Production setup",
  variations: "Variations & production",
  gallery: "Gallery & mockups",
  "size-guide": "Size guide",
};

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function creatorPriceFor(cost, explicit = null) {
  if (explicit !== null && explicit !== undefined && explicit !== "") return roundMoney(explicit);
  return roundMoney(Number(cost || 0) * 1.1);
}

function profitFor(cost, creatorPrice) {
  return roundMoney(Number(creatorPrice || 0) - Number(cost || 0));
}

function marginFor(cost, creatorPrice) {
  const value = Number(cost || 0);
  return value > 0 ? roundMoney((profitFor(value, creatorPrice) / value) * 100) : 0;
}

function activeVariations(template = {}) {
  return safeArray(template.variations).filter((variation) => variation && variation.enabled !== false && variation.status !== "archived");
}

function templatePath(id, section) {
  return `/admin/product-templates/${id || "new"}/${section}`;
}

function selectedAttributeObjects(attributes, template) {
  return safeArray(attributes).filter((attribute) => safeArray(template.attribute_ids).includes(attribute.id));
}

function comparableConfiguration(variation, template) {
  const configuration = getVariationProductionConfiguration(variation, template);
  return JSON.stringify({ ...configuration, configured_at: null });
}

function variationConfigurationsEqual(variations, template) {
  const rows = activeVariations({ variations });
  if (rows.length < 2) return true;
  const serialised = rows.map((variation) => comparableConfiguration(variation, template));
  return serialised.every((value) => value === serialised[0]);
}

function SizeGuideEditor({ value, onChange }) {
  const guide = value || blankTemplate.size_chart;
  const columns = safeArray(guide.columns);
  const rows = safeArray(guide.rows);
  const patch = (next) => onChange({ ...guide, ...next });

  const updateColumn = (index, nextValue) => {
    const next = [...columns];
    next[index] = nextValue;
    patch({ columns: next });
  };

  const removeColumn = (index) => {
    patch({
      columns: columns.filter((_, itemIndex) => itemIndex !== index),
      rows: rows.map((row) => safeArray(row).filter((_, itemIndex) => itemIndex !== index)),
    });
  };

  const updateCell = (rowIndex, columnIndex, nextValue) => {
    const nextRows = rows.map((row) => [...safeArray(row)]);
    while (nextRows[rowIndex].length < columns.length) nextRows[rowIndex].push("");
    nextRows[rowIndex][columnIndex] = nextValue;
    patch({ rows: nextRows });
  };

  return (
    <section className="v3-card">
      <div className="v3-section-heading">
        <div>
          <div className="overline">Supplier size guide</div>
          <h2>Template size guide</h2>
          <p>Creators inherit this guide. It is not part of the production-area configuration.</p>
        </div>
      </div>

      <label className="v3-check-row">
        <input type="checkbox" checked={Boolean(guide.enabled)} onChange={(event) => patch({ enabled: event.target.checked })} />
        Show this size guide on product pages
      </label>

      <div className="v3-form-grid v3-form-grid-two">
        <label><span>Title</span><input value={guide.title || ""} onChange={(event) => patch({ title: event.target.value })} /></label>
        <label><span>Unit</span><input value={guide.unit || "cm"} onChange={(event) => patch({ unit: event.target.value })} /></label>
      </div>

      <div className="v3-size-table">
        <div className="v3-size-row v3-size-header">
          {columns.map((column, index) => (
            <div key={`${column}-${index}`}>
              <input value={column} onChange={(event) => updateColumn(index, event.target.value)} />
              <button type="button" onClick={() => removeColumn(index)} aria-label="Remove column">×</button>
            </div>
          ))}
        </div>
        {rows.map((row, rowIndex) => (
          <div className="v3-size-row" key={`row-${rowIndex}`}>
            {columns.map((_, columnIndex) => (
              <input key={`${rowIndex}-${columnIndex}`} value={row[columnIndex] || ""} onChange={(event) => updateCell(rowIndex, columnIndex, event.target.value)} />
            ))}
            <button type="button" className="v3-inline-danger" onClick={() => patch({ rows: rows.filter((_, index) => index !== rowIndex) })}>Remove</button>
          </div>
        ))}
      </div>

      <div className="v3-button-row">
        <button type="button" className="v3-button v3-button-primary" onClick={() => patch({ rows: [...rows, columns.map(() => "")] })}>Add row</button>
        <button type="button" className="v3-button v3-button-secondary" onClick={() => patch({ columns: [...columns, `Column ${columns.length + 1}`], rows: rows.map((row) => [...row, ""]) })}>Add column</button>
      </div>

      <label className="v3-field"><span>Notes</span><textarea rows={4} value={guide.notes || ""} onChange={(event) => patch({ notes: event.target.value })} /></label>
    </section>
  );
}

export default function ProductTemplateStudioV3Page() {
  const { id, section } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [template, setTemplate] = useState(blankTemplate);
  const [categories, setCategories] = useState([]);
  const [attributes, setAttributes] = useState([]);
  const [printOptions, setPrintOptions] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [structureMode, setStructureMode] = useState("single");
  const [setupMode, setSetupMode] = useState("shared");
  const [sharedConfig, setSharedConfig] = useState(blankProductionConfiguration());
  const [selectedVariationId, setSelectedVariationId] = useState("");
  const [copyTargets, setCopyTargets] = useState([]);

  const variations = activeVariations(template);
  const variableProduct = structureMode === "variable";
  const allowedSections = useMemo(
    () => variableProduct
      ? ["product", "variations", "gallery", "size-guide"]
      : ["product", "production", "gallery", "size-guide"],
    [variableProduct]
  );
  const currentSection = allowedSections.includes(section) ? section : allowedSections[0];
  const baseId = isNew ? "new" : id;

  useEffect(() => {
    Promise.all([
      http.get("/categories"),
      http.get("/attributes"),
      http.get("/print-options"),
      http.get("/admin/product-types"),
    ]).then(([categoryResponse, attributeResponse, printResponse, productTypeResponse]) => {
      setCategories(safeArray(categoryResponse.data));
      setAttributes(safeArray(attributeResponse.data));
      setPrintOptions(safeArray(printResponse.data));
      setProductTypes(safeArray(productTypeResponse.data));
    }).catch(() => toast.error("Could not load template setup data"));
  }, []);

  useEffect(() => {
    if (!isNew) return;
    const initialProductTypeId = searchParams.get("product_type_id") || "";
    if (initialProductTypeId) setTemplate((current) => ({ ...current, product_type_id: initialProductTypeId }));
  }, [isNew, searchParams]);

  useEffect(() => {
    if (isNew) return;
    setLoading(true);
    http.get(`/admin/product-templates/${id}`)
      .then((response) => {
        const data = { ...blankTemplate, ...response.data };
        const platformCost = Number(data.platform_blank_cost || data.base_blank_cost || data.base_price || 0);
        const creatorPrice = creatorPriceFor(platformCost, data.creator_blank_price);
        const next = {
          ...data,
          platform_blank_cost: platformCost,
          base_blank_cost: platformCost,
          base_price: platformCost,
          creator_blank_price: creatorPrice,
          platform_blank_profit: profitFor(platformCost, creatorPrice),
          platform_blank_margin_percent: marginFor(platformCost, creatorPrice),
          size_chart: data.size_chart || blankTemplate.size_chart,
          template_gallery: safeArray(data.template_gallery),
          artwork_modes: safeArray(data.artwork_modes),
        };
        const nextVariations = activeVariations(next);
        setTemplate(next);
        setStructureMode(nextVariations.length ? "variable" : "single");
        if (nextVariations.length) {
          const firstVariation = nextVariations[0];
          setSelectedVariationId(firstVariation.id);
          setCopyTargets(nextVariations.map((variation) => variation.id));
          setSharedConfig(getVariationProductionConfiguration(firstVariation, next));
          const storedMode = next.variation_inheritance?.mode;
          setSetupMode(
            storedMode === "attribute"
              ? "attribute"
              : storedMode === "individual"
                ? "individual"
                : variationConfigurationsEqual(next.variations, next)
                  ? "shared"
                  : "individual"
          );
        }
      })
      .catch((error) => toast.error(error.response?.data?.detail || "Could not load template"))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  useEffect(() => {
    if (loading) return;
    if (section && allowedSections.includes(section)) return;
    navigate(templatePath(baseId, allowedSections[0]), { replace: true });
  }, [allowedSections, baseId, loading, navigate, section]);

  useEffect(() => {
    if (!variations.length) {
      setSelectedVariationId("");
      return;
    }
    if (!variations.some((variation) => variation.id === selectedVariationId)) {
      setSelectedVariationId(variations[0].id);
    }
  }, [selectedVariationId, variations]);

  const updateTemplate = (patch) => setTemplate((current) => ({ ...current, ...patch }));
  const selectedVariation = variations.find((variation) => variation.id === selectedVariationId) || variations[0] || null;
  const selectedConfig = selectedVariation
    ? getVariationProductionConfiguration(selectedVariation, template)
    : blankProductionConfiguration();

  const galleryPrintAreas = variableProduct && variations.length
    ? resolveVariationProductionConfiguration(
        variations[0],
        template
      ).print_areas
    : safeArray(template.print_areas);

  const chooseStructure = (nextMode) => {
    if (nextMode === structureMode) return;

    if (nextMode === "single" && variations.length) {
      const confirmed = window.confirm(
        "Switch this template to a non-variable product?\n\nThe first variation production setup will become the single product setup and the variation records will be removed when you save."
      );
      if (!confirmed) return;
      const firstConfiguration = getVariationProductionConfiguration(variations[0], template);
      updateTemplate({
        variations: [],
        mockup_screens: firstConfiguration.screens,
        print_areas: firstConfiguration.print_areas,
        print_option_ids: firstConfiguration.print_option_ids,
        print_options: firstConfiguration.print_options,
      });
      setSelectedVariationId("");
      setCopyTargets([]);
    }

    if (nextMode === "variable" && !variations.length) {
      setSharedConfig(normaliseProductionConfiguration({
        screens: safeArray(template.mockup_screens),
        print_areas: safeArray(template.print_areas),
        print_option_ids: safeArray(template.print_option_ids),
        print_options: safeArray(template.print_options),
      }));
    }

    setStructureMode(nextMode);
  };

  const applyBlueprint = (productTypeId) => {
    const productType = productTypes.find((item) => item.id === productTypeId);
    if (!productType) {
      updateTemplate({ product_type_id: productTypeId });
      return;
    }
    const category = categories.find((item) => item.id === productType.category_id);
    updateTemplate({
      product_type_id: productType.id,
      category_id: productType.category_id || template.category_id || "",
      category: productType.category || category?.slug || category?.name || template.category || "",
      attribute_ids: safeArray(productType.attribute_ids),
      selected_attribute_values: productType.default_attribute_values || template.selected_attribute_values || {},
    });
  };

  const uploadPrimaryImage = async (file) => {
    if (!file) return;
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("subdir", "product-template-primary");
      const response = await http.post("/files/image", formData, { headers: { "Content-Type": "multipart/form-data" } });
      const nextGallery = safeArray(template.template_gallery)
        .filter((row) => row.role !== "catalogue_thumbnail")
        .map((row) => ({ ...row, is_primary: false }));
      updateTemplate({
        product_image_url: response.data.url,
        mockup_url: response.data.url,
        template_gallery: [{
          id: newId("gallery"),
          name: file.name.replace(/\.[^.]+$/, ""),
          image_url: response.data.url,
          role: "catalogue_thumbnail",
          view_key: "front",
          source_print_area_id: "",
          derived_from_artwork_mode: "",
          crop: {},
          sort_order: 0,
          is_primary: true,
          status: "active",
        }, ...nextGallery],
      });
    } catch (error) {
      toast.error(error.response?.data?.detail || "Primary image upload failed");
    }
  };

  const toggleAttribute = (attributeId) => {
    const current = new Set(safeArray(template.attribute_ids));
    if (current.has(attributeId)) current.delete(attributeId); else current.add(attributeId);
    const nextIds = Array.from(current);
    const values = { ...(template.selected_attribute_values || {}) };
    Object.keys(values).forEach((key) => { if (!nextIds.includes(key)) delete values[key]; });
    updateTemplate({ attribute_ids: nextIds, selected_attribute_values: values });
  };

  const toggleAttributeValue = (attribute, value) => {
    const key = attribute.id || attribute.name || attribute.slug;
    const selected = new Set(safeArray(template.selected_attribute_values?.[key]));
    if (selected.has(value)) selected.delete(value); else selected.add(value);
    updateTemplate({
      selected_attribute_values: {
        ...(template.selected_attribute_values || {}),
        [key]: Array.from(selected),
      },
    });
  };

  const generateVariations = () => {
    const selectedAttributes = selectedAttributeObjects(attributes, template);
    const generated = buildVariationCombinations(
      selectedAttributes,
      safeArray(template.variations),
      Number(template.platform_blank_cost || 0),
      template.selected_attribute_values || {}
    ).map((variation) => ({
      ...variation,
      platform_blank_cost: Number(variation.platform_blank_cost ?? variation.base_blank_cost ?? template.platform_blank_cost ?? 0),
      creator_blank_price: Number(variation.creator_blank_price ?? template.creator_blank_price ?? 0),
    }));

    if (!generated.length) {
      toast.error("Select at least one attribute value before generating variations");
      return;
    }

    const firstExisting = generated.find((variation) => productionConfigurationComplete(getVariationProductionConfiguration(variation, template)));
    const initialConfig = firstExisting
      ? getVariationProductionConfiguration(firstExisting, template)
      : normaliseProductionConfiguration({
          screens: safeArray(template.mockup_screens),
          print_areas: safeArray(template.print_areas),
          print_option_ids: safeArray(template.print_option_ids),
          print_options: safeArray(template.print_options),
        });

    updateTemplate({
      variations: generated,
      variation_inheritance: {
        ...(template.variation_inheritance || {}),
        mode: "shared",
      },
    });
    setStructureMode("variable");
    setSelectedVariationId(generated[0].id);
    setSharedConfig(initialConfig);
    setSetupMode("shared");
    setCopyTargets(generated.map((variation) => variation.id));
    navigate(templatePath(baseId, "variations"));
    toast.success(`${generated.length} variations generated. Choose shared, attribute-owned or individual production setup.`);
  };

  const patchVariation = (variationId, patch) => {
    updateTemplate({
      variations: safeArray(template.variations).map((variation) => variation.id === variationId ? { ...variation, ...patch } : variation),
    });
  };

  const updateSelectedVariationConfig = (configuration) => {
    if (!selectedVariation) return;
    updateTemplate({
      variations: safeArray(template.variations).map((variation) => variation.id === selectedVariation.id
        ? setVariationProductionConfiguration(variation, configuration)
        : variation),
    });
  };

  const applySharedToAll = () => {
    if (!productionConfigurationComplete(sharedConfig)) {
      toast.error("Complete the editor image, print areas, physical dimensions and print rules before applying this setup");
      return;
    }
    updateTemplate({
      variations: applyProductionConfigurationToVariations(
        template.variations,
        sharedConfig
      ),
      variation_inheritance: {
        ...(template.variation_inheritance || {}),
        mode: "shared",
      },
    });
    setCopyTargets(variations.map((variation) => variation.id));
    toast.success(`Production configuration copied into all ${variations.length} variations`);
  };

  const copySelectedConfiguration = () => {
    if (!selectedVariation) return;
    if (!productionConfigurationComplete(selectedConfig)) {
      toast.error("Complete this variation production setup before copying it");
      return;
    }
    const targets = copyTargets.length ? copyTargets : variations.map((variation) => variation.id);
    updateTemplate({
      variations: applyProductionConfigurationToVariations(template.variations, selectedConfig, targets),
    });
    toast.success(`Production configuration copied to ${targets.length} variation${targets.length === 1 ? "" : "s"}`);
  };

  const save = async () => {
    if (!template.name?.trim()) { toast.error("Template name is required"); return; }
    if (!template.category?.trim()) { toast.error("Category is required"); return; }

    setSaving(true);
    try {
      let payload = {
        ...template,
        slug: template.slug || slugify(template.name),
        platform_blank_cost: Number(template.platform_blank_cost || 0),
        creator_blank_price: Number(template.creator_blank_price || creatorPriceFor(template.platform_blank_cost)),
        base_blank_cost: Number(template.platform_blank_cost || 0),
        base_price: Number(template.platform_blank_cost || 0),
        platform_blank_profit: profitFor(template.platform_blank_cost, template.creator_blank_price),
        platform_blank_margin_percent: marginFor(template.platform_blank_cost, template.creator_blank_price),
        creator_visible: template.creator_visible !== false,
        admin_visible: template.admin_visible !== false,
        template_gallery: safeArray(template.template_gallery),
        artwork_modes: safeArray(template.artwork_modes),
        size_chart: template.size_chart || blankTemplate.size_chart,
      };

      if (variableProduct) {
        if (!variations.length) throw new Error("Generate at least one variation before saving a variable product");
        const incomplete = variations.filter(
          (variation) => !productionConfigurationComplete(
            resolveVariationProductionConfiguration(
              variation,
              payload
            )
          )
        );
        if (incomplete.length) {
          throw new Error(`${incomplete.length} variation production setup${incomplete.length === 1 ? " is" : "s are"} incomplete`);
        }
        payload = compileVariableTemplateProduction(payload, payload.variations);
      } else {
        payload.variations = [];
      }

      const response = isNew
        ? await http.post("/admin/product-templates", payload)
        : await http.patch(`/admin/product-templates/${id}`, payload);
      const saved = { ...blankTemplate, ...response.data };
      setTemplate(saved);
      setStructureMode(
        activeVariations(saved).length ? "variable" : "single"
      );

      const savedMode = saved.variation_inheritance?.mode;

      setSetupMode(
        savedMode === "attribute"
          ? "attribute"
          : savedMode === "individual"
            ? "individual"
            : variationConfigurationsEqual(saved.variations, saved)
              ? "shared"
              : "individual"
      );

      toast.success("Product template saved");
      if (isNew) navigate(templatePath(saved.id, "product"), { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.detail || error.message || "Could not save template");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="v3-card">Loading product template…</div>;

  return (
    <div className="template-studio-v3" data-testid="product-template-studio-v3">
      <header className="v3-page-header">
        <div className="v3-title-row">
          <NavLink to="/admin/product-templates" className="v3-back"><ArrowLeft size={16} /> Back</NavLink>
          <div>
            <div className="overline">Product template studio</div>
            <h1>{isNew ? "New product template" : template.name || "Product template"}</h1>
            <p>{variableProduct ? `${variations.length || "No"} production-owned variation${variations.length === 1 ? "" : "s"}` : "Single product production configuration"}</p>
          </div>
        </div>
        <div className="v3-save-row">
          <select value={template.status || "draft"} onChange={(event) => updateTemplate({ status: event.target.value })}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
          <button type="button" className="v3-button v3-button-primary" disabled={saving} onClick={save}><Save size={16} /> {saving ? "Saving…" : "Save template"}</button>
        </div>
      </header>

      <nav className="v3-route-nav" aria-label="Template sections">
        {allowedSections.map((item, index) => (
          <NavLink key={item} to={templatePath(baseId, item)} className={({ isActive }) => isActive ? "active" : ""}>
            <span>{index + 1}</span>{SECTION_LABELS[item]}
          </NavLink>
        ))}
      </nav>

      {currentSection === "product" && (
        <div className="v3-layout-two">
          <section className="v3-card">
            <div className="v3-section-heading"><div><div className="overline">Product</div><h2>Blank product details</h2><p>Select the product type first, then define this supplier-specific blank.</p></div></div>

            <div className="v3-structure-selector">
              <div className="overline">Product structure</div>
              <div className="v3-decision-grid">
                <button type="button" className={!variableProduct ? "active" : ""} onClick={() => chooseStructure("single")}>
                  <strong>Non-variable product</strong>
                  <span>One sellable product owns one complete production setup.</span>
                </button>
                <button type="button" className={variableProduct ? "active" : ""} onClick={() => chooseStructure("variable")}>
                  <strong>Variable product</strong>
                  <span>Every generated variation owns its own complete production setup.</span>
                </button>
              </div>
            </div>

            <div className="v3-form-grid v3-form-grid-two">
              <label className="v3-span-two"><span>Product type blueprint</span><select value={template.product_type_id || ""} onChange={(event) => applyBlueprint(event.target.value)}><option value="">Select product type</option>{productTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
              <label><span>Template name</span><input value={template.name || ""} onChange={(event) => updateTemplate({ name: event.target.value, slug: template.slug || slugify(event.target.value) })} /></label>
              <label><span>Slug</span><input value={template.slug || ""} onChange={(event) => updateTemplate({ slug: event.target.value })} /></label>
              <label><span>Category</span><select value={template.category_id || ""} onChange={(event) => { const category = categories.find((item) => item.id === event.target.value); updateTemplate({ category_id: event.target.value, category: category?.slug || category?.name || "" }); }}><option value="">Select category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <label><span>Brand</span><input value={template.brand || ""} onChange={(event) => updateTemplate({ brand: event.target.value })} /></label>
              <label><span>Blank SKU / code</span><input value={template.blank_sku || ""} onChange={(event) => updateTemplate({ blank_sku: event.target.value })} /></label>
              <label><span>Platform blank cost</span><input type="number" step="0.01" value={template.platform_blank_cost || 0} onChange={(event) => { const cost = Number(event.target.value || 0); const creator = creatorPriceFor(cost); updateTemplate({ platform_blank_cost: cost, base_blank_cost: cost, base_price: cost, creator_blank_price: creator, platform_blank_profit: profitFor(cost, creator), platform_blank_margin_percent: marginFor(cost, creator) }); }} /></label>
              <label><span>Creator blank price</span><input type="number" step="0.01" value={template.creator_blank_price || 0} onChange={(event) => { const creator = Number(event.target.value || 0); updateTemplate({ creator_blank_price: creator, platform_blank_profit: profitFor(template.platform_blank_cost, creator), platform_blank_margin_percent: marginFor(template.platform_blank_cost, creator) }); }} /></label>
              <div className="v3-metric"><span>Platform profit</span><strong>{money(profitFor(template.platform_blank_cost, template.creator_blank_price))}</strong></div>
              <div className="v3-metric"><span>Blank margin</span><strong>{marginFor(template.platform_blank_cost, template.creator_blank_price).toFixed(2)}%</strong></div>
              <label><span>Supplier name</span><input value={template.supplier_name || ""} onChange={(event) => updateTemplate({ supplier_name: event.target.value })} /></label>
              <label><span>Supplier URL</span><input value={template.supplier_url || ""} onChange={(event) => updateTemplate({ supplier_url: event.target.value })} /></label>
              <label className="v3-span-two"><span>Description</span><textarea rows={5} value={template.description || ""} onChange={(event) => updateTemplate({ description: event.target.value })} /></label>
              <label className="v3-span-two"><span>Supplier notes</span><textarea rows={3} value={template.supplier_notes || ""} onChange={(event) => updateTemplate({ supplier_notes: event.target.value })} /></label>
            </div>
          </section>

          <aside className="v3-sidebar-stack">
            <section className="v3-card">
              <div className="overline">Primary catalogue image</div>
              <div className="v3-primary-image">{template.product_image_url || template.mockup_url ? <img src={assetUrl(template.product_image_url || template.mockup_url)} alt="Primary template" /> : <ImagePlus size={42} />}</div>
              <label className="v3-upload"><ImagePlus size={15} /> Upload primary image<input type="file" accept="image/*" onChange={(event) => uploadPrimaryImage(event.target.files?.[0])} /></label>
            </section>
            <section className="v3-card">
              <div className="overline">Catalogue visibility</div>
              <label className="v3-check-row"><input type="checkbox" checked={template.creator_visible !== false} onChange={(event) => updateTemplate({ creator_visible: event.target.checked })} />Visible to creators</label>
              <label className="v3-check-row"><input type="checkbox" checked={template.admin_visible !== false} onChange={(event) => updateTemplate({ admin_visible: event.target.checked })} />Visible in admin catalogue</label>
              {template.status === "active" && template.creator_visible === false && <div className="v3-warning">This template is active but hidden from Create Printable Product.</div>}
            </section>
            <section className="v3-card">
              <div className="overline">Current workflow</div>
              <strong className="v3-structure-label">{variableProduct ? "Variable product" : "Non-variable product"}</strong>
              <p>{variableProduct ? "Generate the variations next, then choose shared, attribute-owned or individual production setup." : "Configure the complete product in Production Setup."}</p>
            </section>
          </aside>
        </div>
      )}

      {currentSection === "production" && !variableProduct && (
        <ProductionConfigurationEditor
          value={{ screens: template.mockup_screens, print_areas: template.print_areas, print_option_ids: template.print_option_ids, print_options: template.print_options }}
          onChange={(configuration) => updateTemplate({ mockup_screens: configuration.screens, print_areas: configuration.print_areas, print_option_ids: configuration.print_option_ids, print_options: configuration.print_options })}
          printOptions={printOptions}
          title="Single product production setup"
          subtitle="This product has no variations, so the complete editor image, print areas and print rules belong here."
        />
      )}

      {currentSection === "variations" && variableProduct && (
        <div className="v3-variation-workspace">
          <section className="v3-card">
            <div className="v3-section-heading"><div><div className="overline">Variation matrix</div><h2>Select and generate variations</h2><p>After generation, choose shared setup, attribute-owned setup or fully independent variations.</p></div><button type="button" className="v3-button v3-button-primary" onClick={generateVariations}><Wand2 size={15} /> Generate</button></div>
            <div className="v3-attribute-list">{attributes.map((attribute) => <button type="button" key={attribute.id} className={safeArray(template.attribute_ids).includes(attribute.id) ? "active" : ""} onClick={() => toggleAttribute(attribute.id)}>{attribute.name}</button>)}</div>
            {selectedAttributeObjects(attributes, template).map((attribute) => { const key = attribute.id || attribute.name || attribute.slug; const selected = new Set(safeArray(template.selected_attribute_values?.[key])); return <div className="v3-attribute-values" key={key}><strong>{attribute.name}</strong><div>{safeArray(attribute.values).map((value) => <label key={value}><input type="checkbox" checked={selected.has(value)} onChange={() => toggleAttributeValue(attribute, value)} />{value}</label>)}</div></div>; })}
          </section>

          {!variations.length ? (
            <section className="v3-card v3-empty-state">
              <Wand2 size={34} />
              <h2>Generate the product variations</h2>
              <p>Select the relevant attributes and supplier values above. Production can then be shared globally, owned by attributes or configured per variation.</p>
            </section>
          ) : (
            <>
              <section className="v3-card v3-decision-card">
                <div className="overline">Production setup method</div>
                <h2>How should these variations be configured?</h2>
                <div className="v3-decision-grid">
                  <button
                    type="button"
                    className={setupMode === "shared" ? "active" : ""}
                    onClick={() => {
                      setSetupMode("shared");
                      setSharedConfig(
                        getVariationProductionConfiguration(
                          selectedVariation || variations[0],
                          template
                        )
                      );
                      updateTemplate({
                        variation_inheritance: {
                          ...(template.variation_inheritance || {}),
                          mode: "shared",
                        },
                      });
                    }}
                  >
                    <strong>Same setup for all variations</strong>
                    <span>
                      One complete setup is copied to every variation.
                      Best when every combination is physically identical.
                    </span>
                  </button>

                  <button
                    type="button"
                    className={setupMode === "attribute" ? "active" : ""}
                    onClick={() => setSetupMode("attribute")}
                  >
                    <strong>Configure by attribute</strong>
                    <span>
                      Let one attribute own images and another own print
                      geometry. Best for Size × Colour products.
                    </span>
                  </button>

                  <button
                    type="button"
                    className={setupMode === "individual" ? "active" : ""}
                    onClick={() => {
                      setSetupMode("individual");
                      updateTemplate({
                        variation_inheritance: {
                          ...(template.variation_inheritance || {}),
                          mode: "individual",
                        },
                      });
                    }}
                  >
                    <strong>Configure every variation separately</strong>
                    <span>
                      Every combination owns independent images, dimensions
                      and manufacturing rules.
                    </span>
                  </button>
                </div>
              </section>

              {setupMode === "shared" ? (
                <>
                  <ProductionConfigurationEditor value={sharedConfig} onChange={setSharedConfig} printOptions={printOptions} title="Shared production setup" subtitle={`This configuration will be copied into all ${variations.length} variations. Each variation remains independently editable afterwards.`} />
                  <div className="v3-sticky-action"><button type="button" className="v3-button v3-button-primary" onClick={applySharedToAll}><Check size={16} /> Apply this complete configuration to all {variations.length} variations</button></div>
                </>
              ) : setupMode === "attribute" ? (
                <AttributeProductionProfileEditor
                  template={template}
                  variations={variations}
                  attributes={attributes}
                  printOptions={printOptions}
                  onChange={updateTemplate}
                />
              ) : (
                <div className="v3-individual-layout">
                  <aside className="v3-variation-list">
                    {variations.map((variation) => { const summary = variationProductionSummary(variation, template); return <button type="button" key={variation.id} className={variation.id === selectedVariation?.id ? "active" : ""} onClick={() => setSelectedVariationId(variation.id)}><strong>{getVariationLabel(variation)}</strong><span>{summary.screens} view(s) · {summary.printAreas} area(s) · {summary.printRules} rule(s)</span><em className={summary.complete ? "ready" : "incomplete"}>{summary.complete ? "Ready" : "Incomplete"}</em></button>; })}
                  </aside>
                  <div className="v3-variation-editor">
                    {selectedVariation && (
                      <>
                        <section className="v3-card">
                          <div className="v3-section-heading"><div><div className="overline">Selected variation</div><h2>{getVariationLabel(selectedVariation)}</h2></div></div>
                          <div className="v3-form-grid v3-form-grid-four">
                            <label><span>SKU</span><input value={selectedVariation.sku || ""} onChange={(event) => patchVariation(selectedVariation.id, { sku: event.target.value })} /></label>
                            <label><span>Supplier SKU</span><input value={selectedVariation.supplier_sku || ""} onChange={(event) => patchVariation(selectedVariation.id, { supplier_sku: event.target.value })} /></label>
                            <label><span>Platform blank cost</span><input type="number" step="0.01" value={selectedVariation.platform_blank_cost ?? selectedVariation.base_blank_cost ?? 0} onChange={(event) => patchVariation(selectedVariation.id, { platform_blank_cost: Number(event.target.value || 0), base_blank_cost: Number(event.target.value || 0) })} /></label>
                            <label><span>Creator blank price</span><input type="number" step="0.01" value={selectedVariation.creator_blank_price ?? 0} onChange={(event) => patchVariation(selectedVariation.id, { creator_blank_price: Number(event.target.value || 0) })} /></label>
                          </div>
                        </section>
                        <ProductionConfigurationEditor value={selectedConfig} onChange={updateSelectedVariationConfig} printOptions={printOptions} title={`${getVariationLabel(selectedVariation)} production setup`} subtitle="This is the complete production record for this variation." />
                        <section className="v3-card">
                          <div className="v3-section-heading"><div><div className="overline">Copy production setup</div><h2>Apply to selected variations</h2><p>Copy this complete setup to matching colour, size or material variations without creating parent-level production areas.</p></div><button type="button" className="v3-button v3-button-primary" onClick={copySelectedConfiguration}><Copy size={15} /> Copy setup</button></div>
                          <div className="v3-copy-targets">{variations.map((variation) => <label key={variation.id}><input type="checkbox" checked={copyTargets.includes(variation.id)} onChange={(event) => setCopyTargets((current) => event.target.checked ? Array.from(new Set([...current, variation.id])) : current.filter((item) => item !== variation.id))} />{getVariationLabel(variation)}</label>)}</div>
                        </section>
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {currentSection === "gallery" && (
        <TemplateGalleryManager gallery={safeArray(template.template_gallery)} artworkModes={safeArray(template.artwork_modes)} printAreas={galleryPrintAreas} onGalleryChange={(template_gallery) => updateTemplate({ template_gallery })} onArtworkModesChange={(artwork_modes) => updateTemplate({ artwork_modes })} />
      )}

      {currentSection === "size-guide" && <SizeGuideEditor value={template.size_chart} onChange={(size_chart) => updateTemplate({ size_chart })} />}
    </div>
  );
}
