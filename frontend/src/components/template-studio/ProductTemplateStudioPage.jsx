import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { http, assetUrl } from "../../lib/api";
import TemplateVariationMatrix from "./TemplateVariationMatrix";
import TemplateViewManager from "./TemplateViewManager";
import PrintAreaCanvas from "./PrintAreaCanvas";
import PrintAreaInspector from "./PrintAreaInspector";
import TemplateGalleryManager from "./TemplateGalleryManager";
import { blankTemplate, newId, safeArray, slugify } from "./templateStudioUtils";

function moneyRound(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function defaultCreatorBlankPrice(platformCost, explicitCreatorPrice = null) {
  if (explicitCreatorPrice !== null && explicitCreatorPrice !== undefined && explicitCreatorPrice !== "") {
    return moneyRound(explicitCreatorPrice);
  }

  return moneyRound(Number(platformCost || 0) * 1.1);
}

function defaultBlankProfit(platformCost, creatorPrice) {
  return moneyRound(Number(creatorPrice || 0) - Number(platformCost || 0));
}

function defaultBlankMargin(platformCost, creatorPrice) {
  const cost = Number(platformCost || 0);
  if (!cost) return 0;
  return moneyRound((defaultBlankProfit(cost, creatorPrice) / cost) * 100);
}

export default function ProductTemplateStudioPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialProductTypeId = searchParams.get("product_type_id") || "";
  const [initialBlueprintApplied, setInitialBlueprintApplied] = useState(false);

  const [template, setTemplate] = useState(blankTemplate);
  const [categories, setCategories] = useState([]);
  const [attributes, setAttributes] = useState([]);
  const [printOptions, setPrintOptions] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [selectedScreenId, setSelectedScreenId] = useState(null);
  const [selectedAreaId, setSelectedAreaId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [activeTab, setActiveTab] = useState("setup");

  const selectedScreen = useMemo(
    () => safeArray(template.mockup_screens).find((screen) => screen.id === selectedScreenId) || safeArray(template.mockup_screens)[0] || null,
    [template.mockup_screens, selectedScreenId]
  );

  const selectedArea = useMemo(
    () => safeArray(template.print_areas).find((area) => area.id === selectedAreaId) || null,
    [template.print_areas, selectedAreaId]
  );

  const selectedProductType = useMemo(
    () => safeArray(productTypes).find((item) => item.id === template.product_type_id) || null,
    [productTypes, template.product_type_id]
  );

  useEffect(() => {
    Promise.all([
      http.get("/categories"),
      http.get("/attributes"),
      http.get("/print-options"),
      http.get("/admin/product-types"),
    ]).then(([catRes, attrRes, printRes, productTypeRes]) => {
      setCategories(safeArray(catRes.data));
      setAttributes(safeArray(attrRes.data));
      setPrintOptions(safeArray(printRes.data));
      setProductTypes(safeArray(productTypeRes.data));
    }).catch(() => toast.error("Could not load production setup data"));
  }, []);

  useEffect(() => {
    if (isNew) return;
    setLoading(true);
    http.get(`/admin/product-templates/${id}`)
      .then((response) => {
        const data = { ...blankTemplate, ...response.data };
        const platformCost = Number(data.platform_blank_cost || data.base_blank_cost || data.base_price || 0);
        const creatorPrice = defaultCreatorBlankPrice(platformCost, data.creator_blank_price);

        setTemplate({
          ...data,
          platform_blank_cost: platformCost,
          base_blank_cost: Number(data.base_blank_cost || platformCost || 0),
          base_price: Number(data.base_price || platformCost || 0),
          creator_blank_price: creatorPrice,
          platform_blank_profit: defaultBlankProfit(platformCost, creatorPrice),
          platform_blank_margin_percent: defaultBlankMargin(platformCost, creatorPrice),
          size_chart: data.size_chart || {
            enabled: false,
            title: "Size Guide",
            unit: "cm",
            columns: ["Size", "Chest", "Length"],
            rows: [],
            notes: "",
          },
        });
        setSelectedScreenId(safeArray(data.mockup_screens)[0]?.id || null);
      })
      .catch((error) => toast.error(error.response?.data?.detail || "Could not load template"))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  const updateTemplate = (patch) => setTemplate((current) => ({ ...current, ...patch }));

  const selectedAttributeObjects = useMemo(
    () => safeArray(attributes).filter((attribute) => safeArray(template.attribute_ids).includes(attribute.id)),
    [attributes, template.attribute_ids]
  );

  const save = async () => {
    if (!template.name.trim()) { toast.error("Template name is required"); return; }
    if (!template.category.trim()) { toast.error("Category is required"); return; }

    setSaving(true);
    try {
      const payload = {
        ...template,
        slug: template.slug || slugify(template.name),
        category: template.category,
        platform_blank_cost: Number(template.platform_blank_cost || template.base_blank_cost || template.base_price || 0),
        creator_blank_price: Number(template.creator_blank_price || defaultCreatorBlankPrice(template.platform_blank_cost || template.base_blank_cost || template.base_price || 0)),
        platform_blank_profit: defaultBlankProfit(
          Number(template.platform_blank_cost || template.base_blank_cost || template.base_price || 0),
          Number(template.creator_blank_price || defaultCreatorBlankPrice(template.platform_blank_cost || template.base_blank_cost || template.base_price || 0))
        ),
        platform_blank_margin_percent: defaultBlankMargin(
          Number(template.platform_blank_cost || template.base_blank_cost || template.base_price || 0),
          Number(template.creator_blank_price || defaultCreatorBlankPrice(template.platform_blank_cost || template.base_blank_cost || template.base_price || 0))
        ),
        base_price: Number(template.platform_blank_cost || template.base_price || template.base_blank_cost || 0),
        base_blank_cost: Number(template.platform_blank_cost || template.base_blank_cost || template.base_price || 0),
        mockup_url: template.mockup_url || template.product_image_url || safeArray(template.mockup_screens).find((screen) => screen.image_url)?.image_url || "",
        product_image_url: template.product_image_url || template.mockup_url || safeArray(template.mockup_screens).find((screen) => screen.image_url)?.image_url || "",
        available_sizes: Array.from(new Set(selectedAttributeObjects.find((attr) => attr.name?.toLowerCase().includes("size"))?.values || template.available_sizes || [])),
        available_colors: Array.from(new Set(selectedAttributeObjects.find((attr) => attr.name?.toLowerCase().includes("colo"))?.values || template.available_colors || [])),
        selected_attribute_values: template.selected_attribute_values || {},
        variations: safeArray(template.variations),
        size_chart: template.size_chart || {
          enabled: false,
          title: "Size Guide",
          unit: "cm",
          columns: ["Size", "Chest", "Length"],
          rows: [],
          notes: "",
        },
        mockup_screens: safeArray(template.mockup_screens),
        print_areas: safeArray(template.print_areas),
        template_gallery: safeArray(template.template_gallery),
        artwork_modes: safeArray(template.artwork_modes),
        creator_visible: template.creator_visible !== false,
        admin_visible: template.admin_visible !== false,
      };

      const response = isNew
        ? await http.post("/admin/product-templates", payload)
        : await http.patch(`/admin/product-templates/${id}`, payload);

      toast.success("Product template saved");
      if (isNew) navigate(`/admin/product-templates/${response.data.id}`);
      else setTemplate({ ...blankTemplate, ...response.data });
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not save template");
    } finally {
      setSaving(false);
    }
  };

  const uploadProductImage = async (file) => {
    if (!file) return;
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("subdir", "product-template-primary");
      const response = await http.post("/files/image", formData, { headers: { "Content-Type": "multipart/form-data" } });
      const primaryGalleryImage = {
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
      };
      const gallery = safeArray(template.template_gallery)
        .filter((row) => row.role !== "catalogue_thumbnail")
        .map((row) => ({ ...row, is_primary: false }));
      updateTemplate({
        product_image_url: response.data.url,
        mockup_url: response.data.url,
        template_gallery: [primaryGalleryImage, ...gallery],
      });
      toast.success("Primary image uploaded");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Image upload failed");
    }
  };

  const updateSelectedArea = (area) => {
    updateTemplate({ print_areas: safeArray(template.print_areas).map((item) => (item.id === area.id ? area : item)) });
  };

  const selectedTemplatePrintRuleIds = () => {
    const ids = new Set([
      ...safeArray(template.print_option_ids),
      ...safeArray(template.print_options).map((option) => option.id).filter(Boolean),
    ]);

    return Array.from(ids);
  };

  const selectedTemplatePrintRules = () => {
    const selectedIds = new Set(selectedTemplatePrintRuleIds());
    const globalById = new Map(safeArray(printOptions).map((option) => [option.id, option]));

    return Array.from(selectedIds)
      .map((id) => {
        const globalOption = globalById.get(id) || {};
        const templateOption = safeArray(template.print_options).find((option) => option.id === id) || {};
        return { ...globalOption, ...templateOption, id };
      })
      .filter((option) => option.id);
  };

  const toggleTemplatePrintRule = (option) => {
    if (!option?.id) return;

    const selectedIds = selectedTemplatePrintRuleIds();
    const exists = selectedIds.includes(option.id);

    if (exists) {
      const nextIds = selectedIds.filter((id) => id !== option.id);
      updateTemplate({
        print_option_ids: nextIds,
        print_options: selectedTemplatePrintRules().filter((item) => item.id !== option.id),
        print_areas: safeArray(template.print_areas).map((area) => ({
          ...area,
          allowed_print_option_ids: safeArray(area.allowed_print_option_ids).filter((id) => id !== option.id),
        })),
      });
      return;
    }

    const nextOption = {
      ...option,
      id: option.id,
      print_method: option.print_method || option.method || option.rule_name || "",
      method: option.method || option.print_method || option.rule_name || "",
      rule_name: option.rule_name || option.print_method || option.method || "",
      print_size: option.print_size || "",
      print_cost_max: Number(option.print_cost_max || 0),
      platform_print_cost: Number(option.platform_print_cost || option.print_cost_max || 0),
      creator_print_price: Number(option.creator_print_price || 0),
      platform_print_profit: Number(option.platform_print_profit || 0),
      calculation_type: option.calculation_type || "",
      cost_per_cm2: option.cost_per_cm2 ?? null,
      minimum_print_cost: option.minimum_print_cost ?? 0,
      waste_percentage: option.waste_percentage ?? 0,
      markup_percentage: option.markup_percentage ?? 0,
      sheet_width_mm: option.sheet_width_mm ?? 0,
      sheet_height_mm: option.sheet_height_mm ?? 0,
      sheet_cost: option.sheet_cost ?? 0,
      standard_print_size_key: option.standard_print_size_key || "",
      width_mm: option.width_mm ?? 0,
      height_mm: option.height_mm ?? 0,
      dpi: option.dpi || 300,
      fit_mode: option.fit_mode || "contain",
      print_positions: safeArray(option.print_positions),
      status: option.status || "active",
    };

    updateTemplate({
      print_option_ids: [...selectedIds, option.id],
      print_options: [...selectedTemplatePrintRules(), nextOption],
    });
  };

  const cloneBlueprintScreens = (baseViews = []) => {
    const cloned = safeArray(baseViews).map((view, index) => {
      const viewKey = view.view_key || view.view || "front";

      return {
        id: newId("screen"),
        name: view.name || viewKey,
        view: viewKey,
        view_key: viewKey,
        image_url: "",
        sort_order: Number(view.sort_order ?? index),
        is_primary: Boolean(view.is_primary || index === 0),
      };
    });

    return { cloned };
  };

  const templateHasProductionSetup = () => {
    return (
      safeArray(template.mockup_screens).length > 0 ||
      safeArray(template.print_areas).length > 0 ||
      safeArray(template.variations).length > 0
    );
  };

  const applyProductTypeBlueprint = (productTypeId) => {
    const productType = safeArray(productTypes).find((item) => item.id === productTypeId);

    if (!productType) {
      updateTemplate({ product_type_id: productTypeId || "" });
      return;
    }

    const isSameBlueprint = template.product_type_id === productType.id;
    const shouldConfirmReset = templateHasProductionSetup() && !initialBlueprintApplied;

    if (shouldConfirmReset) {
      const confirmed = window.confirm(
        "Re-applying this blueprint will replace the current template mockup view placeholders.\n\n" +
        "Supplier variation data will remain, but template print areas should be reviewed afterwards.\n\n" +
        "Continue?"
      );

      if (!confirmed) {
        return;
      }
    }

    const { cloned: clonedScreens } = cloneBlueprintScreens(productType.base_views || productType.mockup_screens);
    const categoryFromId = categories.find((category) => category.id === productType.category_id);

    updateTemplate({
      product_type_id: productType.id,
      category_id: productType.category_id || template.category_id || "",
      category: productType.category || categoryFromId?.slug || categoryFromId?.name || template.category || "",
      mockup_screens: clonedScreens,
      print_areas: [],
      attribute_ids: safeArray(productType.attribute_ids),
      selected_attribute_values: productType.default_attribute_values || {},
      print_option_ids: [],
      variations: safeArray(template.variations),
    });

    setSelectedScreenId(clonedScreens[0]?.id || null);
    setSelectedAreaId(null);

    toast.success(`${productType.name} blueprint ${isSameBlueprint ? "re-applied" : "applied"}`);
  };

  useEffect(() => {
    if (!isNew) return;
    if (!initialProductTypeId || initialBlueprintApplied) return;
    if (!safeArray(productTypes).length) return;

    applyProductTypeBlueprint(initialProductTypeId);
    setInitialBlueprintApplied(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, initialProductTypeId, initialBlueprintApplied, productTypes]);

  if (loading) return <div className="card text-zinc-400">Loading template studio...</div>;

  return (
    <div className="template-studio-page" data-testid="product-template-studio">
      <div className="studio-topbar">
        <div className="flex items-center gap-4">
          <Link to="/admin/product-templates" className="btn-secondary text-xs"><ChevronLeft size={14} /> Back</Link>
          <div>
            <div className="overline mb-1">Product Template Studio</div>
            <h1 className="font-display text-4xl uppercase">{isNew ? "New Template" : template.name || "Edit Template"}</h1>
          </div>
        </div>
        <div className="flex gap-3">
          <select className="input-base w-40" value={template.status || "draft"} onChange={(e) => updateTemplate({ status: e.target.value })}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
          <button type="button" onClick={save} disabled={saving} className="btn-primary"><Save size={14} /> {saving ? "Saving" : "Save Template"}</button>
        </div>
      </div>

      <div className="studio-tabs">
        {[
          ["setup", "1. Product"],
          ["variations", "2. Variations"],
          ["views", "3. Editor Views"],
          ["print-areas", "4. Print Areas"],
          ["print-rules", "5. Print Rules"],
          ["gallery", "6. Gallery & Mockups"],
          ["size-guide", "7. Size Guide"],
        ].map(([tab, label]) => (
          <button key={tab} type="button" className={activeTab === tab ? "studio-tab active" : "studio-tab"} onClick={() => setActiveTab(tab)}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === "setup" && (
        <div className="grid xl:grid-cols-[1fr_360px] gap-5">
          <div className="studio-panel">
            <div className="studio-panel-header"><div><div className="overline mb-1">Basics</div><h2 className="font-display text-2xl uppercase">Blank Product Details</h2></div></div>
            <div className="grid md:grid-cols-2 gap-4">
              <label className="md:col-span-2">
                <span className="label">Product Type Blueprint</span>
                <select
                  className="input-base"
                  value={template.product_type_id || ""}
                  onChange={(e) => applyProductTypeBlueprint(e.target.value)}
                >
                  <option value="">Start without blueprint</option>
                  {safeArray(productTypes).map((productType) => (
                    <option key={productType.id} value={productType.id}>
                      {productType.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-zinc-500 mt-2">
                  Choose this first. The blueprint provides the generic family skeleton: base views and attribute defaults. Supplier-specific print areas and print rules stay on this template.
                </p>
                {safeArray(template.mockup_screens).length + safeArray(template.print_areas).length + safeArray(template.variations).length > 0 && (
                  <p className="text-xs text-amber-300 mt-2">
                    Changing or re-applying a blueprint will reset base views and print areas. Supplier variations are kept.
                  </p>
                )}
              </label>

              <div className="md:col-span-2 border border-white/10 bg-white/[0.03] rounded-xl p-4 text-xs text-zinc-300">
                <div className="font-bold uppercase tracking-widest text-zinc-100 mb-3">Template setup checklist</div>
                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <span className="block text-[#FF7A1A] font-bold mb-1">1. Product type</span>
                    Choose the reusable production blueprint.
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <span className="block text-[#FF7A1A] font-bold mb-1">2. Template</span>
                    Add the supplier blank, costs and catalogue details.
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <span className="block text-[#FF7A1A] font-bold mb-1">3. Variations</span>
                    Generate or select colours, sizes, shapes and SKUs.
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <span className="block text-[#FF7A1A] font-bold mb-1">4. Editor views</span>
                    Upload the base image used to place artwork.
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <span className="block text-[#FF7A1A] font-bold mb-1">5. Print areas</span>
                    Set defaults, then override only differing variations.
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <span className="block text-[#FF7A1A] font-bold mb-1">6. Print rules</span>
                    Assign supported manufacturing and pricing rules.
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <span className="block text-[#FF7A1A] font-bold mb-1">7. Gallery</span>
                    Add catalogue, front, back, angled and wrap images.
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <span className="block text-[#FF7A1A] font-bold mb-1">8. Publish</span>
                    Review visibility and activate the completed template.
                  </div>
                </div>
                <p className="mt-3 text-zinc-500">
                  Blueprint = production skeleton. Template = supplier-specific blank. Variations = supplier colour, size, cost and SKU setup.
                </p>
              </div>

              {template.product_type_id && (
                <div className="md:col-span-2 border border-[#34C759]/30 bg-[#34C759]/10 rounded-xl p-4 text-xs text-[#B8F5C3]">
                  <div className="font-bold uppercase tracking-widest mb-2">Blueprint source summary</div>
                  <div className="grid sm:grid-cols-4 gap-2">
                    <div><span className="block text-[#7BE08B]">Source</span>{selectedProductType?.name || "Selected blueprint"}</div>
                    <div><span className="block text-[#7BE08B]">Base views</span>{safeArray(template.mockup_screens).length}</div>
                    <div><span className="block text-[#7BE08B]">Print areas</span>{safeArray(template.print_areas).length}</div>
                    <div><span className="block text-[#7BE08B]">Attributes</span>{safeArray(template.attribute_ids).length}</div>
                  </div>
                  <p className="mt-3 text-[#B8F5C3]/80">
                    This template is now supplier-specific. Add brand, blank SKU, costs, colours, sizes, supplier SKUs and colour image overrides.
                  </p>
                </div>
              )}

              <label><span className="label">Template name</span><input className="input-base" value={template.name} onChange={(e) => updateTemplate({ name: e.target.value, slug: template.slug || slugify(e.target.value) })} /></label>
              <label><span className="label">Slug</span><input className="input-base" value={template.slug || ""} onChange={(e) => updateTemplate({ slug: e.target.value })} /></label>
              <label><span className="label">Category</span><select className="input-base" value={template.category_id || ""} onChange={(e) => { const cat = categories.find((item) => item.id === e.target.value); updateTemplate({ category_id: e.target.value, category: cat?.slug || cat?.name || "" }); }}><option value="">Select category</option>{categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select></label>
              <label><span className="label">Brand</span><input className="input-base" value={template.brand || ""} onChange={(e) => updateTemplate({ brand: e.target.value })} /></label>
              <label><span className="label">Blank SKU / Code</span><input className="input-base" value={template.blank_sku || ""} onChange={(e) => updateTemplate({ blank_sku: e.target.value })} /></label>
              <label>
                <span className="label">Default platform blank cost</span>
                <input
                  className="input-base"
                  type="number"
                  step="0.01"
                  value={template.platform_blank_cost || template.base_blank_cost || 0}
                  onChange={(e) => {
                    const platformCost = Number(e.target.value || 0);
                    const creatorPrice = defaultCreatorBlankPrice(platformCost);

                    updateTemplate({
                      platform_blank_cost: platformCost,
                      base_blank_cost: platformCost,
                      base_price: platformCost,
                      creator_blank_price: creatorPrice,
                      platform_blank_profit: defaultBlankProfit(platformCost, creatorPrice),
                      platform_blank_margin_percent: defaultBlankMargin(platformCost, creatorPrice),
                    });
                  }}
                />
              </label>

              <label>
                <span className="label">Default creator blank price</span>
                <input
                  className="input-base"
                  type="number"
                  step="0.01"
                  value={template.creator_blank_price || defaultCreatorBlankPrice(template.platform_blank_cost || template.base_blank_cost || 0)}
                  onChange={(e) => {
                    const platformCost = Number(template.platform_blank_cost || template.base_blank_cost || 0);
                    const creatorPrice = Number(e.target.value || 0);

                    updateTemplate({
                      creator_blank_price: creatorPrice,
                      platform_blank_profit: defaultBlankProfit(platformCost, creatorPrice),
                      platform_blank_margin_percent: defaultBlankMargin(platformCost, creatorPrice),
                    });
                  }}
                />
              </label>

              <div className="md:col-span-2 grid sm:grid-cols-2 gap-3">
                <div className="border border-white/10 bg-black/20 rounded-xl p-4">
                  <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Default platform profit</div>
                  <div className="font-display text-2xl uppercase">
                    R {Number(template.platform_blank_profit || defaultBlankProfit(template.platform_blank_cost || template.base_blank_cost || 0, template.creator_blank_price || 0)).toFixed(2)}
                  </div>
                </div>
                <div className="border border-white/10 bg-black/20 rounded-xl p-4">
                  <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Default blank margin</div>
                  <div className="font-display text-2xl uppercase">
                    {Number(template.platform_blank_margin_percent || defaultBlankMargin(template.platform_blank_cost || template.base_blank_cost || 0, template.creator_blank_price || 0)).toFixed(2)}%
                  </div>
                </div>
              </div>
              <label><span className="label">Supplier name</span><input className="input-base" value={template.supplier_name || ""} onChange={(e) => updateTemplate({ supplier_name: e.target.value })} /></label>
              <label><span className="label">Supplier URL</span><input className="input-base" value={template.supplier_url || ""} onChange={(e) => updateTemplate({ supplier_url: e.target.value })} /></label>
              <label className="md:col-span-2"><span className="label">Description</span><textarea className="input-base" rows={4} value={template.description || ""} onChange={(e) => updateTemplate({ description: e.target.value })} /></label>
              <label className="md:col-span-2"><span className="label">Supplier notes</span><textarea className="input-base" rows={3} value={template.supplier_notes || ""} onChange={(e) => updateTemplate({ supplier_notes: e.target.value })} /></label>
            </div>
          </div>
          <div className="space-y-5">
            <div className="studio-panel">
              <div className="overline mb-2">Primary Image</div>
              <div className="aspect-square bg-black border border-white/15 flex items-center justify-center overflow-hidden mb-4">
                {template.product_image_url || template.mockup_url ? <img src={assetUrl(template.product_image_url || template.mockup_url)} alt="Primary" className="w-full h-full object-contain" /> : <span className="text-zinc-600 text-sm">No primary image</span>}
              </div>
              <label className="studio-file-button w-full justify-center">Upload Primary Image<input type="file" className="hidden" accept="image/*" onChange={(e) => uploadProductImage(e.target.files?.[0])} /></label>
              <p className="text-xs text-zinc-500 mt-3">This also becomes the catalogue-thumbnail role in Gallery & Mockups.</p>
            </div>

            <div className="studio-panel">
              <div className="overline mb-2">Catalogue visibility</div>
              <div className="space-y-3">
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={template.creator_visible !== false}
                    onChange={(event) => updateTemplate({ creator_visible: event.target.checked })}
                  />
                  <span>
                    <strong className="block">Visible to creators</strong>
                    <span className="text-xs text-zinc-500">Required for Create Printable Product.</span>
                  </span>
                </label>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={template.admin_visible !== false}
                    onChange={(event) => updateTemplate({ admin_visible: event.target.checked })}
                  />
                  <span>
                    <strong className="block">Visible in admin catalogue</strong>
                    <span className="text-xs text-zinc-500">Keep enabled unless deliberately archived from normal admin use.</span>
                  </span>
                </label>
              </div>

              {template.status === "active" && template.creator_visible === false && (
                <div className="mt-4 rounded-lg border border-[#FFB020]/40 bg-[#FFB020]/10 p-3 text-xs text-[#FFD27A]">
                  This template is Active but hidden from creators. It will not appear in Create Printable Product.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "variations" && (
        <TemplateVariationMatrix
          attributes={attributes}
          selectedAttributeIds={safeArray(template.attribute_ids)}
          onSelectedAttributeIdsChange={(attribute_ids) => updateTemplate({ attribute_ids })}
          selectedAttributeValues={template.selected_attribute_values || {}}
          onSelectedAttributeValuesChange={(selected_attribute_values) => updateTemplate({ selected_attribute_values })}
          variations={safeArray(template.variations)}
          onVariationsChange={(variations) => updateTemplate({ variations })}
          screens={safeArray(template.mockup_screens)}
          baseCost={template.platform_blank_cost || template.base_blank_cost || template.base_price || 0}
          baseCreatorPrice={template.creator_blank_price || defaultCreatorBlankPrice(template.platform_blank_cost || template.base_blank_cost || template.base_price || 0)}
        />
      )}

      {activeTab === "size-guide" && (
        <SizeGuideEditor
          sizeChart={template.size_chart}
          onChange={(size_chart) => updateTemplate({ size_chart })}
        />
      )}

      {activeTab === "views" && (
        <div className="space-y-4">
          <div className="studio-panel">
            <div className="overline mb-1">Base view library</div>
            <p className="text-sm text-zinc-400">
              These are the generic fallback images for the template. Do not create colour-specific views here. Use simple view types such as Front, Back, Side, Sleeve and Neck Label.
            </p>
          </div>
          <TemplateViewManager
          screens={safeArray(template.mockup_screens)}
          onScreensChange={(mockup_screens) => updateTemplate({ mockup_screens })}
          selectedScreenId={selectedScreen?.id || selectedScreenId}
          onSelectedScreenIdChange={setSelectedScreenId}
        />
        </div>
      )}

      {activeTab === "print-rules" && (
        <PrintRulesPanel
          printOptions={printOptions}
          selectedRules={selectedTemplatePrintRules()}
          selectedRuleIds={selectedTemplatePrintRuleIds()}
          onToggleRule={toggleTemplatePrintRule}
        />
      )}

      {activeTab === "gallery" && (
        <TemplateGalleryManager
          gallery={safeArray(template.template_gallery)}
          artworkModes={safeArray(template.artwork_modes)}
          printAreas={safeArray(template.print_areas)}
          onGalleryChange={(template_gallery) => {
            const primary = safeArray(template_gallery).find((row) => row.is_primary)
              || safeArray(template_gallery).find((row) => row.role === "catalogue_thumbnail");
            updateTemplate({
              template_gallery,
              product_image_url: primary?.image_url || template.product_image_url || "",
              mockup_url: primary?.image_url || template.mockup_url || "",
              mockup_images: safeArray(template_gallery).map((row) => row.image_url).filter(Boolean),
            });
          }}
          onArtworkModesChange={(artwork_modes) => updateTemplate({ artwork_modes })}
        />
      )}

      {activeTab === "print-areas" && (
        <div className="grid xl:grid-cols-[300px_1fr_320px] gap-5 min-h-[700px]">
          <TemplateViewManager
            screens={safeArray(template.mockup_screens)}
            onScreensChange={(mockup_screens) => updateTemplate({ mockup_screens })}
            selectedScreenId={selectedScreen?.id || selectedScreenId}
            onSelectedScreenIdChange={(screenId) => { setSelectedScreenId(screenId); setSelectedAreaId(null); }}
            mode="selector"
          />
          <PrintAreaCanvas
            screen={selectedScreen}
            printAreas={safeArray(template.print_areas)}
            onPrintAreasChange={(print_areas) => updateTemplate({ print_areas })}
            selectedAreaId={selectedAreaId}
            onSelectedAreaIdChange={setSelectedAreaId}
          />
          <PrintAreaInspector
            selectedArea={selectedArea}
            printOptions={
              selectedTemplatePrintRules().length
                ? selectedTemplatePrintRules()
                : printOptions
            }
            onChange={updateSelectedArea}
          />
        </div>
      )}
    </div>
  );
}

function printRuleLabel(option) {
  return option?.rule_name || option?.print_method || option?.method || option?.id || "Print rule";
}

function printRuleTypeLabel(option) {
  const type = option?.calculation_type || "fixed";

  if (type === "area_fixed_rate") return "Dynamic area rate";
  if (type === "area_from_sheet") return "Area from sheet";
  if (type === "full_sheet") return "Full sheet";
  return "Fixed price";
}

function formatRand(value) {
  return `R ${Number(value || 0).toFixed(2)}`;
}

function PrintRulesPanel({ printOptions = [], selectedRules = [], selectedRuleIds = [], onToggleRule }) {
  const selectedSet = new Set(safeArray(selectedRuleIds));

  const sortedOptions = safeArray(printOptions).slice().sort((a, b) =>
    String(printRuleLabel(a)).localeCompare(String(printRuleLabel(b)))
  );

  return (
    <div className="grid xl:grid-cols-[1fr_360px] gap-5">
      <div className="studio-panel">
        <div className="studio-panel-header">
          <div>
            <div className="overline mb-1">Template print rules</div>
            <h2 className="font-display text-2xl uppercase">Supported Print Pricing Rules</h2>
            <p className="text-sm text-zinc-400 mt-2">
              Choose the print costing rules this supplier template can use. Print areas decide where a rule is allowed; this page decides which rules belong to the template.
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-3">
          {sortedOptions.map((option) => {
            const active = selectedSet.has(option.id);
            const type = option.calculation_type || "fixed";
            const isDynamic = ["area_fixed_rate", "area_from_sheet", "full_sheet"].includes(type);

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onToggleRule(option)}
                className={active ? "print-rule-card active" : "print-rule-card"}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-left">
                    <div className="font-bold text-sm">{printRuleLabel(option)}</div>
                    <div className="text-xs text-zinc-500 mt-1">{printRuleTypeLabel(option)}</div>
                  </div>
                  <span className={active ? "studio-pill active" : "studio-pill"}>
                    {active ? "Selected" : "Add"}
                  </span>
                </div>

                <div className="print-rule-meta-grid">
                  {isDynamic ? (
                    <>
                      <InfoMini label="Rate / cm²" value={option.cost_per_cm2 ? formatRand(option.cost_per_cm2) : "—"} />
                      <InfoMini label="Minimum" value={formatRand(option.minimum_print_cost)} />
                      <InfoMini label="Waste" value={`${Number(option.waste_percentage || 0)}%`} />
                      <InfoMini label="Fixed max" value={formatRand(option.print_cost_max)} />
                    </>
                  ) : (
                    <>
                      <InfoMini label="Fixed platform" value={formatRand(option.platform_print_cost || option.print_cost_max)} />
                      <InfoMini label="Creator price" value={formatRand(option.creator_print_price)} />
                      <InfoMini label="Profit" value={formatRand(option.platform_print_profit)} />
                      <InfoMini label="Size" value={option.standard_print_size_key || option.print_size || "—"} />
                    </>
                  )}
                </div>

                {type === "area_from_sheet" || type === "full_sheet" ? (
                  <div className="text-[11px] text-zinc-500 text-left mt-3">
                    Sheet: {Number(option.sheet_width_mm || 0)}×{Number(option.sheet_height_mm || 0)}mm · {formatRand(option.sheet_cost)}
                  </div>
                ) : null}

                {isDynamic ? (
                  <div className="text-[11px] text-zinc-500 text-left mt-3">
                    Dynamic rules calculate final print cost from the selected print area and artwork placement size.
                  </div>
                ) : null}
              </button>
            );
          })}

          {!sortedOptions.length && (
            <div className="text-sm text-zinc-500 border border-dashed border-white/15 rounded-xl p-6">
              No global print rules configured yet.
            </div>
          )}
        </div>
      </div>

      <div className="studio-panel">
        <div className="overline mb-3">Selected rules</div>
        <div className="space-y-3">
          <Info label="Rules selected" value={safeArray(selectedRules).length} />
          <Info label="Dynamic rules" value={safeArray(selectedRules).filter((rule) => ["area_fixed_rate", "area_from_sheet", "full_sheet"].includes(rule.calculation_type)).length} />
          <Info label="Fixed rules" value={safeArray(selectedRules).filter((rule) => !["area_fixed_rate", "area_from_sheet", "full_sheet"].includes(rule.calculation_type)).length} />
        </div>

        <p className="text-xs text-zinc-500 mt-5">
          After selecting rules here, go to Print Areas and assign which selected rules are allowed on each print area.
        </p>
      </div>
    </div>
  );
}

function InfoMini({ label, value }) {
  return (
    <div className="print-rule-mini">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="border border-white/10 bg-black/20 rounded-xl p-4">
      <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">{label}</div>
      <div className="font-display text-3xl uppercase">{value}</div>
    </div>
  );
}



function normaliseSizeChart(sizeChart = {}) {
  return {
    enabled: Boolean(sizeChart.enabled),
    title: sizeChart.title || "Size Guide",
    unit: sizeChart.unit || "cm",
    columns: Array.isArray(sizeChart.columns) && sizeChart.columns.length ? sizeChart.columns : ["Size", "Chest", "Length"],
    rows: Array.isArray(sizeChart.rows) ? sizeChart.rows : [],
    notes: sizeChart.notes || "",
  };
}

function SizeGuideEditor({ sizeChart, onChange }) {
  const chart = normaliseSizeChart(sizeChart);

  const patch = (updates) => onChange({ ...chart, ...updates });

  const updateColumn = (index, value) => {
    const columns = chart.columns.map((column, idx) => (idx === index ? value : column));
    const rows = chart.rows.map((row) => {
      const next = [...row];
      while (next.length < columns.length) next.push("");
      return next.slice(0, columns.length);
    });
    patch({ columns, rows });
  };

  const addColumn = () => {
    const columns = [...chart.columns, `Column ${chart.columns.length + 1}`];
    const rows = chart.rows.map((row) => [...row, ""]);
    patch({ columns, rows });
  };

  const removeColumn = (index) => {
    if (chart.columns.length <= 1) return;
    const columns = chart.columns.filter((_, idx) => idx !== index);
    const rows = chart.rows.map((row) => row.filter((_, idx) => idx !== index));
    patch({ columns, rows });
  };

  const updateCell = (rowIndex, columnIndex, value) => {
    const rows = chart.rows.map((row, idx) => {
      if (idx !== rowIndex) return row;
      const next = [...row];
      while (next.length < chart.columns.length) next.push("");
      next[columnIndex] = value;
      return next;
    });
    patch({ rows });
  };

  const addRow = () => {
    patch({ rows: [...chart.rows, chart.columns.map(() => "")] });
  };

  const removeRow = (index) => {
    patch({ rows: chart.rows.filter((_, idx) => idx !== index) });
  };

  return (
    <div className="card space-y-5">
      <div>
        <div className="overline mb-1">Supplier size guide</div>
        <h2 className="font-display text-3xl uppercase">Template Size Guide</h2>
        <p className="text-sm text-zinc-500 mt-2">
          Set the supplier/brand sizing table once on the template. Creators inherit this guide and cannot edit it in Product Builder.
        </p>
      </div>

      <label className="flex items-center gap-3 text-sm text-zinc-200">
        <input
          type="checkbox"
          checked={chart.enabled}
          onChange={(event) => patch({ enabled: event.target.checked })}
        />
        Enable size guide on public product pages
      </label>

      <div className="grid md:grid-cols-3 gap-3">
        <label>
          <span className="label">Title</span>
          <input className="input-base" value={chart.title} onChange={(event) => patch({ title: event.target.value })} />
        </label>
        <label>
          <span className="label">Unit</span>
          <input className="input-base" value={chart.unit} onChange={(event) => patch({ unit: event.target.value })} placeholder="cm" />
        </label>
      </div>

      <div className="border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-black/30">
              <tr>
                {chart.columns.map((column, index) => (
                  <th key={index} className="p-2 min-w-[140px] text-left align-top">
                    <div className="flex gap-2">
                      <input
                        className="input-base text-xs"
                        value={column}
                        onChange={(event) => updateColumn(index, event.target.value)}
                      />
                      <button
                        type="button"
                        className="text-[#FFB4B0] text-xs px-2"
                        onClick={() => removeColumn(index)}
                        disabled={chart.columns.length <= 1}
                        title="Remove column"
                      >
                        ×
                      </button>
                    </div>
                  </th>
                ))}
                <th className="p-2 w-[90px]"></th>
              </tr>
            </thead>
            <tbody>
              {chart.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t border-white/10">
                  {chart.columns.map((_, columnIndex) => (
                    <td key={columnIndex} className="p-2">
                      <input
                        className="input-base text-xs"
                        value={row[columnIndex] || ""}
                        onChange={(event) => updateCell(rowIndex, columnIndex, event.target.value)}
                      />
                    </td>
                  ))}
                  <td className="p-2 text-right">
                    <button
                      type="button"
                      className="text-[#FFB4B0] text-xs uppercase tracking-widest"
                      onClick={() => removeRow(rowIndex)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}

              {!chart.rows.length && (
                <tr>
                  <td colSpan={chart.columns.length + 1} className="p-6 text-center text-zinc-500">
                    No size rows yet. Add supplier sizes below.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={addRow}>Add row</button>
        <button type="button" className="border border-white/15 text-zinc-200 px-4 py-3 text-xs uppercase tracking-widest font-bold" onClick={addColumn}>Add column</button>
      </div>

      <label>
        <span className="label">Notes</span>
        <textarea
          className="input-base"
          rows={3}
          value={chart.notes}
          onChange={(event) => patch({ notes: event.target.value })}
          placeholder="Measurements are approximate. Allow 1–2cm tolerance."
        />
      </label>
    </div>
  );
}

