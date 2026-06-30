import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Bold, Check, Heading2, List, ListOrdered, Package, Save } from "lucide-react";
import { http, assetUrl } from "../../lib/api";
import ProductVariationMatrix from "./ProductVariationMatrix";
import ArtworkScopeSelector from "./ArtworkScopeSelector";
import ProductArtworkStudio from "./ProductArtworkStudio";
import {
  asArray,
  buildProductVariations,
  calculatePricing,
  createDefaultArtworkGroup,
  flattenArtworkGroups,
  getPrimaryMockupFromGroups,
  getSelectedVariations,
  getEnabledTemplateVariations,
  buildStandardProductVariation,
  getTemplateAttributeRange,
  getTemplateAvailableOptionsSummary,
  getTemplateImage,
  getTemplateShortDescription,
  getUniquePrintCostFromGroups,
  getCreatorBlankPrice,
  getVariationCost,
  money,
} from "./productBuilderUtils";

const steps = [
  { key: "product_type", label: "1 Product Type" },
  { key: "product_option", label: "2 Product Option" },
  { key: "details", label: "3 Details" },
  { key: "variations", label: "4 Variations" },
  { key: "scope", label: "5 Artwork Scope" },
  { key: "artwork", label: "6 Artwork" },
  { key: "pricing", label: "7 Pricing" },
  { key: "review", label: "8 Review" },
];

const SELECTED_CARD_CLASS = "border-emerald-400/90 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(52,211,153,0.55),0_18px_45px_rgba(16,185,129,0.08)]";
const UNSELECTED_CARD_CLASS = "border-white/10 bg-black/30 hover:border-white/30 hover:bg-black/40";
const SELECTED_BADGE_CLASS = "inline-flex items-center gap-1 rounded-full border border-emerald-300/60 bg-emerald-400/15 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-200";

const emptyArtwork = {
  original_url: "",
  file_name: "",
  mime_type: "",
  status: "pending_review",
};

const emptyPlacement = {
  screen_id: "",
  print_area_id: "",
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
  scale: 1,
};

function getReadyArtworkSlots(groups) {
  return flattenArtworkGroups(groups).filter((slot) => slot.print_area_id && slot.print_option_id && slot.original_url);
}

function getGeneratedMockups(groups) {
  return flattenArtworkGroups(groups).map((slot) => slot.mockup_image_url).filter(Boolean);
}

function firstReadyArtwork(groups) {
  return getReadyArtworkSlots(groups)[0] || flattenArtworkGroups(groups)[0] || null;
}

function formatPrintSizeLabel(value) {
  if (!value) return "Custom production size";
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function productionSizeText(slot) {
  const widthMm = Number(slot?.width_mm || 0);
  const heightMm = Number(slot?.height_mm || 0);
  const dpi = Number(slot?.dpi || 300);
  const label = formatPrintSizeLabel(slot?.standard_print_size_key || slot?.area_key || slot?.screen_view);

  if (!widthMm || !heightMm) {
    return `${label} — size not set — ${dpi}DPI`;
  }

  const widthPx = Math.round((widthMm / 25.4) * dpi);
  const heightPx = Math.round((heightMm / 25.4) * dpi);

  return `${label} — ${widthMm}×${heightMm}mm — ${widthPx}×${heightPx}px @ ${dpi}DPI`;
}



function normalizeTypeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function templateMatchesProductType(template, productType) {
  if (!template || !productType) return false;

  const templateTypeId = String(template.product_type_id || "").trim();
  const productTypeId = String(productType.id || "").trim();

  if (templateTypeId && productTypeId && templateTypeId === productTypeId) return true;

  const templateKeys = [
    template.product_type_slug,
    template.product_type_key,
    template.product_type,
    template.category,
    template.category_id,
    template.category_slug,
  ].map(normalizeTypeKey).filter(Boolean);

  const productTypeKeys = [
    productType.slug,
    productType.category,
    productType.key,
    productType.name,
  ].map(normalizeTypeKey).filter(Boolean);

  return templateKeys.some((key) => productTypeKeys.includes(key));
}

export default function ProductBuilder({ mode = "creator", backTo = "/creator/products" }) {
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  const isNew = !routeId || routeId === "new";
  const isAdmin = mode === "admin";

  const [activeStep, setActiveStep] = useState("product_type");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creators, setBands] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [selectedProductTypeId, setSelectedProductTypeId] = useState("");
  const [printOptions, setPrintOptions] = useState([]);
  const [product, setProduct] = useState(null);
  const [submittedProduct, setSubmittedProduct] = useState(null);

  const [form, setForm] = useState({
    band_id: "",
    template_id: "",
    title: "",
    description: "",
    specs: "",
    selected_template_variation_ids: [],
    selected_print_area_id: "",
    selected_print_option_id: "",
    selling_price: 0,
    variation_price_overrides: {},
    published: false,
    publish_on_approval: !isAdmin,
    artwork: emptyArtwork,
    placement: emptyPlacement,
    artworks: [],
    artwork_groups: [],
    mockup_images: [],
    mockup_image_url: "",
    primary_mockup_image_url: "",
  });

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === form.template_id) || null,
    [templates, form.template_id]
  );

  const selectedProductType = useMemo(
    () => productTypes.find((type) => type.id === selectedProductTypeId) || null,
    [productTypes, selectedProductTypeId]
  );

  const filteredTemplates = useMemo(() => {
    if (!selectedProductType) return isNew ? [] : templates;
    return templates.filter((template) => templateMatchesProductType(template, selectedProductType));
  }, [isNew, selectedProductType, templates]);

  const availableTemplateVariations = useMemo(() => getEnabledTemplateVariations(selectedTemplate), [selectedTemplate]);
  const hasTemplateVariations = availableTemplateVariations.length > 0;

  const selectedVariations = useMemo(() => {
    return getSelectedVariations(selectedTemplate, form.selected_template_variation_ids);
  }, [selectedTemplate, form.selected_template_variation_ids]);

  const blankCost = useMemo(() => {
    if (selectedVariations.length) {
      return Math.max(...selectedVariations.map((item) => getVariationCost(item, selectedTemplate)));
    }
    return getCreatorBlankPrice(selectedTemplate);
  }, [selectedVariations, selectedTemplate]);

  const printCost = useMemo(
    () => getUniquePrintCostFromGroups(form.artwork_groups, printOptions, selectedTemplate),
    [form.artwork_groups, printOptions, selectedTemplate]
  );

  const pricing = calculatePricing({
    sellingPrice: form.selling_price,
    blankCost,
    printCost,
    commissionRate: 0.15,
  });

  const readyArtworkSlots = getReadyArtworkSlots(form.artwork_groups);
  const generatedMockups = getGeneratedMockups(form.artwork_groups);
  const uploadedArtworkSlots = form.artwork_groups.flatMap((group) => asArray(group.artworks)).filter((slot) => slot.original_url);
  const uploadedWithoutPrintMethod = uploadedArtworkSlots.filter((slot) => !slot.print_option_id);
  const primaryArtwork = firstReadyArtwork(form.artwork_groups);
  const productPrimaryMockup = getPrimaryMockupFromGroups(form.artwork_groups) || form.primary_mockup_image_url || form.mockup_image_url || "";

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const requests = [
          http.get(isAdmin ? "/admin/product-templates" : "/product-templates"),
          http.get("/print-options"),
        ];

        requests.push(http.get("/public/product-types?status=active"));
        if (isAdmin) requests.push(http.get("/admin/creators"));
        if (!isNew) requests.push(http.get(isAdmin ? `/admin/products/${routeId}` : `/products/${routeId}`));

        const responses = await Promise.all(requests);
        setTemplates(asArray(responses[0].data));
        setPrintOptions(asArray(responses[1].data));

        let cursor = 2;
        setProductTypes(asArray(responses[cursor].data));
        cursor += 1;
        if (isAdmin) {
          setBands(asArray(responses[cursor].data));
          cursor += 1;
        }

        if (!isNew) {
          const existing = responses[cursor].data;
          setProduct(existing);
          const existingGroups = asArray(existing.artwork_groups).length
            ? asArray(existing.artwork_groups)
            : asArray(existing.artworks).length
            ? [{ ...createDefaultArtworkGroup(), artworks: asArray(existing.artworks), primary_mockup_image_url: existing.primary_mockup_image_url || existing.mockup_image_url || "" }]
            : [];
          setForm({
            band_id: existing.band_id || "",
            template_id: existing.template_id || "",
            title: existing.title || "",
            description: existing.description || "",
            specs: existing.specs || "",
            selected_template_variation_ids: asArray(existing.selected_template_variation_ids),
            selected_print_area_id: existing.selected_print_area_id || "",
            selected_print_option_id: existing.selected_print_option_id || "",
            selling_price: existing.selling_price || 0,
            variation_price_overrides: Object.fromEntries(
              asArray(existing.variations)
                .filter((variation) => variation?.id || variation?.template_variation_id || variation?.sku)
                .map((variation) => [
                  variation.template_variation_id || variation.id || variation.sku,
                  variation.price_override ?? "",
                ])
            ),
            published: Boolean(existing.published),
            publish_on_approval: Boolean(existing.publish_on_approval),
            artwork: existing.artwork || emptyArtwork,
            placement: existing.placement || emptyPlacement,
            artworks: asArray(existing.artworks),
            artwork_groups: existingGroups,
            mockup_images: asArray(existing.mockup_images),
            mockup_image_url: existing.mockup_image_url || "",
            primary_mockup_image_url: existing.primary_mockup_image_url || existing.mockup_image_url || "",
          });
        }
      } catch (error) {
        toast.error(error.response?.data?.detail || "Could not load product builder");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [isAdmin, isNew, routeId]);

  useEffect(() => {
    if (!selectedTemplate || selectedProductTypeId || !productTypes.length) return;
    const type = productTypes.find((row) => row.id === selectedTemplate.product_type_id)
      || productTypes.find((row) => row.category === selectedTemplate.category);
    if (type) setSelectedProductTypeId(type.id);
  }, [productTypes, selectedProductTypeId, selectedTemplate]);

  useEffect(() => {
    if (!selectedTemplate || !isNew || form.title) return;
    setForm((current) => ({
      ...current,
      title: selectedTemplate.name,
      description: selectedTemplate.description || "",
      selling_price: current.selling_price || Math.ceil((getCreatorBlankPrice(selectedTemplate) + 80) / 0.85),
    }));
  }, [selectedTemplate, isNew, form.title]);

  const chooseProductType = (typeId) => {
    setSelectedProductTypeId(typeId);
    const type = productTypes.find((row) => row.id === typeId);
    setForm((current) => ({
      ...current,
      template_id: "",
      selected_template_variation_ids: [],
      variation_price_overrides: {},
      selected_print_area_id: "",
      selected_print_option_id: "",
      artworks: [],
      artwork_groups: [],
      artwork: emptyArtwork,
      placement: emptyPlacement,
      mockup_images: [],
      mockup_image_url: "",
      primary_mockup_image_url: "",
      published: false,
      publish_on_approval: !isAdmin,
      category: type?.category || current.category || "",
    }));
  };

  const chooseTemplate = (template) => {
    setForm((current) => ({
      ...current,
      template_id: template.id,
      selected_template_variation_ids: [],
      variation_price_overrides: {},
      selected_print_area_id: "",
      selected_print_option_id: "",
      artworks: [],
      artwork_groups: [],
      artwork: emptyArtwork,
      placement: emptyPlacement,
      mockup_images: [],
      mockup_image_url: "",
      primary_mockup_image_url: "",
      published: false,
      publish_on_approval: !isAdmin,
      category: template.category || current.category || "",
    }));
  };

  const update = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const applyTextFormat = (key, kind) => {
    const active = document.activeElement;
    const currentValue = String(form[key] || "");
    const hasSelection = active?.dataset?.formatField === key && typeof active.selectionStart === "number";
    const start = hasSelection ? active.selectionStart : currentValue.length;
    const end = hasSelection ? active.selectionEnd : currentValue.length;
    const selected = currentValue.slice(start, end);
    const before = currentValue.slice(0, start);
    const after = currentValue.slice(end);
    const fallback = selected || (kind === "heading" ? "Heading" : kind === "numbered" ? "Item" : kind === "bullet" ? "Item" : "text");
    const prefix = before && !before.endsWith("\n") ? "\n" : "";
    let replacement = fallback;

    if (kind === "bold") replacement = `**${fallback}**`;
    if (kind === "heading") replacement = `${prefix}## ${fallback}\n`;
    if (kind === "bullet") replacement = `${prefix}- ${fallback}`;
    if (kind === "numbered") replacement = `${prefix}1. ${fallback}`;

    update(key, `${before}${replacement}${after}`);
  };

  const updateVariationPrice = (variationId, value) => {
    setForm((current) => ({
      ...current,
      variation_price_overrides: {
        ...(current.variation_price_overrides || {}),
        [variationId]: value,
      },
    }));
  };


  const setSelectedVariationIds = (ids) => {
    setForm((current) => ({
      ...current,
      selected_template_variation_ids: ids,
      variation_price_overrides: Object.fromEntries(
        Object.entries(current.variation_price_overrides || {}).filter(([key]) => ids.includes(key))
      ),
      artwork_groups: [],
      artworks: [],
      artwork: emptyArtwork,
      placement: emptyPlacement,
      mockup_images: [],
      mockup_image_url: "",
      primary_mockup_image_url: "",
    }));
  };

  const setArtworkGroups = (groups) => {
    const flattened = flattenArtworkGroups(groups);
    const primary = flattened.find((slot) => slot.original_url) || flattened[0] || null;
    const mockups = getGeneratedMockups(groups);
    const primaryMockup = getPrimaryMockupFromGroups(groups);

    setForm((current) => ({
      ...current,
      artwork_groups: groups,
      artworks: flattened,
      selected_print_area_id: primary?.print_area_id || current.selected_print_area_id || "",
      selected_print_option_id: primary?.print_option_id || current.selected_print_option_id || "",
      artwork: primary?.original_url
        ? {
            original_url: primary.original_url,
            file_name: primary.file_name || "artwork",
            mime_type: primary.mime_type || "",
            status: primary.status || (isAdmin ? "approved" : "pending_review"),
            notes: primary.notes || "",
          }
        : current.artwork,
      placement: primary?.placement || current.placement,
      mockup_images: mockups,
      mockup_image_url: primaryMockup || current.mockup_image_url || "",
      primary_mockup_image_url: primaryMockup || current.primary_mockup_image_url || "",
    }));
  };

  const validate = () => {
    if (isAdmin && !form.band_id) return "Select a creator.";
    if (!form.template_id) return "Select a product option.";
    if (!form.title.trim()) return "Enter a product title.";
    if (hasTemplateVariations && !form.selected_template_variation_ids.length) return "Select at least one variation.";
    if (!form.artwork_groups.length) return "Create at least one artwork group.";
    if (!readyArtworkSlots.length) return "Add at least one artwork file and print method.";
    if (!generatedMockups.length) return "Generate at least one mockup.";
    if (Number(form.selling_price || 0) <= 0) return "Enter a selling price.";
    if (form.published && !pricing.canPublishProfitably) return "Selling price is below the minimum price needed to cover production and platform costs.";
    return null;
  };

  const save = async () => {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }

    const primary = primaryArtwork;
    const variations = hasTemplateVariations
      ? buildProductVariations(
        selectedTemplate,
        form.selected_template_variation_ids,
        form.variation_price_overrides
      )
      : [buildStandardProductVariation(selectedTemplate)];
    const mockupImages = generatedMockups;
    const primaryMockup = productPrimaryMockup || mockupImages[0] || "";
    const legacyArtwork = primary?.original_url
      ? {
          original_url: primary.original_url,
          file_name: primary.file_name,
          mime_type: primary.mime_type,
          status: primary.status || (isAdmin ? "approved" : "pending_review"),
          notes: primary.notes || "",
        }
      : emptyArtwork;

    const payload = {
      ...(isAdmin ? { band_id: form.band_id } : {}),
      template_id: form.template_id,
      title: form.title.trim(),
      description: form.description || "",
      specs: form.specs || "",
      category: selectedTemplate?.category || "",
      selling_price: Number(form.selling_price || 0),
      print_cost: pricing.print,
      mockup_images: primaryMockup ? [primaryMockup, ...mockupImages.filter((image) => image !== primaryMockup)] : mockupImages,
      mockup_image_url: primaryMockup,
      primary_mockup_image_url: primaryMockup,
      variations,
      attribute_ids: asArray(selectedTemplate?.attribute_ids),
      spec_attributes: {},
      customization_enabled: false,
      published: isAdmin ? Boolean(form.published) : false,
      publish_on_approval: isAdmin ? Boolean(form.published) : Boolean(form.publish_on_approval),
      selected_template_variation_ids: form.selected_template_variation_ids,
      selected_print_area_id: primary?.print_area_id || "",
      selected_print_option_id: primary?.print_option_id || "",
      artwork: legacyArtwork,
      artworks: flattenArtworkGroups(form.artwork_groups),
      artwork_groups: form.artwork_groups,
      placement: primary?.placement || emptyPlacement,
      estimated_blank_cost: pricing.blank,
      estimated_print_cost: pricing.print,
      estimated_total_cost: pricing.production,
      commission_rate: pricing.rate,
      estimated_commission: pricing.commission,
      estimated_creator_profit: pricing.profit,
    };

    setSaving(true);
    try {
      if (isNew) {
        const response = await http.post(isAdmin ? "/admin/products" : "/products", payload);
        toast.success("Product created");
        if (!isAdmin) {
          setSubmittedProduct(response.data);
        } else {
          navigate(`/admin/products/${response.data.id}`, { replace: true });
        }
      } else {
        const response = await http.patch(isAdmin ? `/admin/products/${routeId}` : `/products/${routeId}`, payload);
        setProduct(response.data);
        setForm((current) => ({
          ...current,
          artworks: asArray(response.data.artworks),
          artwork_groups: asArray(response.data.artwork_groups),
          mockup_images: asArray(response.data.mockup_images),
          mockup_image_url: response.data.mockup_image_url || "",
          primary_mockup_image_url: response.data.primary_mockup_image_url || response.data.mockup_image_url || "",
        }));
        toast.success("Product saved");
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not save product");
    } finally {
      setSaving(false);
    }
  };

  const canContinueProductType = Boolean(selectedProductTypeId || (!isNew && selectedTemplate));
  const canContinueProductOption = Boolean(selectedTemplate);
  const canContinueDetails = Boolean(selectedTemplate && form.title.trim() && (!isAdmin || form.band_id));
  const stepIndex = steps.findIndex((step) => step.key === activeStep);

  const getStepGateError = (stepKey) => {
    if (stepKey === "product_type" && !canContinueProductType) return "Select a product type.";
    if (stepKey === "product_option" && !canContinueProductOption) return "Select a product option.";
    if (stepKey === "details" && !canContinueDetails) {
      if (isAdmin && !form.band_id) return "Select a creator.";
      return "Enter a product title.";
    }
    if (stepKey === "variations" && hasTemplateVariations && !form.selected_template_variation_ids.length) return "Select at least one variation.";
    if (stepKey === "scope" && !form.artwork_groups.length) return "Create at least one artwork group.";
    if (stepKey === "artwork") {
      if (!readyArtworkSlots.length) return "Add at least one artwork file and print method.";
      if (!generatedMockups.length) return "Generate at least one mockup.";
    }
    if (stepKey === "pricing" && Number(form.selling_price || 0) <= 0) return "Enter a selling price.";
    return null;
  };

  const goToStep = (targetKey) => {
    const targetIndex = steps.findIndex((step) => step.key === targetKey);
    if (targetIndex <= stepIndex) {
      setActiveStep(targetKey);
      return;
    }

    for (let index = 0; index < targetIndex; index += 1) {
      const error = getStepGateError(steps[index].key);
      if (error) {
        toast.error(error);
        setActiveStep(steps[index].key);
        return;
      }
    }

    setActiveStep(targetKey);
  };

  const nextStep = () => {
    const error = getStepGateError(activeStep);
    if (error) {
      toast.error(error);
      return;
    }
    const next = steps[Math.min(stepIndex + 1, steps.length - 1)];
    if (next) setActiveStep(next.key);
  };

  const prevStep = () => {
    const previous = steps[Math.max(stepIndex - 1, 0)];
    if (previous) setActiveStep(previous.key);
  };

  if (loading) return <div className="overline">Loading product builder…</div>;

  if (submittedProduct && !isAdmin && isNew) {
    return (
      <div className="product-builder-shell min-h-[calc(100vh-120px)]" data-testid="creator-product-approval-submitted">
        <div className="card max-w-3xl mx-auto mt-10">
          <div className="overline mb-2">Product sent for approval</div>
          <h1 className="font-display text-5xl uppercase mb-4">Review pending</h1>
          <p className="text-sm text-zinc-400 leading-relaxed mb-5">
            Your product has been submitted for artwork and pricing review. Final pricing may be checked before the product goes live to make sure production costs are correct.
          </p>
          <div className="grid sm:grid-cols-2 gap-3 text-sm mb-6">
            <Info label="Product" value={submittedProduct.title || "New product"} />
            <Info label="Review status" value={submittedProduct.artwork_review_status || submittedProduct.creator_pricing_approval_status || "Pending review"} />
            <Info label="Estimated selling price" value={money(submittedProduct.selling_price ?? form.selling_price)} />
            <Info label="Estimated creator/fundraising amount" value={money(submittedProduct.estimated_creator_profit ?? pricing.profit)} />
            <Info label="Visibility" value="Unpublished" />
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn-primary" onClick={() => navigate(backTo)}>Back to Products</button>
            <button type="button" className="btn-secondary" onClick={() => window.location.assign("/creator/products/new")}>Create another product</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="product-builder-shell min-h-[calc(100vh-120px)]" data-testid={`${mode}-product-builder`}>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <div className="overline mb-2">{isAdmin ? "Admin Product Builder" : "Creator Product Builder"}</div>
          <h1 className="font-display text-5xl uppercase">{isNew ? "New Product" : form.title || "Edit Product"}</h1>
        </div>
        <button type="button" className="btn-secondary" onClick={() => navigate(backTo)}>
          <ArrowLeft size={14} /> Back
        </button>
      </div>

      <div className="mb-6 overflow-auto">
        <div className="flex gap-2 min-w-max">
          {steps.map((step, index) => {
            const active = activeStep === step.key;
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => goToStep(step.key)}
                className={`px-4 py-3 rounded-xl border text-xs uppercase tracking-widest font-bold ${active ? "border-[#FF3B30] bg-[#FF3B30]/15 text-white" : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white"}`}
              >
                {step.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className={activeStep === "artwork" || activeStep === "review" ? "product-builder-layout grid grid-cols-1 gap-5" : "product-builder-layout grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5"}>
        <main className={activeStep === "artwork" || activeStep === "review" ? "product-builder-main min-w-0 min-h-[820px]" : "product-builder-main min-w-0 card min-h-[720px]"}>
          {activeStep === "product_type" && (
            <ProductTypeStep
              productTypes={productTypes}
              selectedProductTypeId={selectedProductTypeId}
              selectedTemplate={selectedTemplate}
              isNew={isNew}
              chooseProductType={chooseProductType}
            />
          )}

          {activeStep === "product_option" && (
            <ProductOptionStep
              templates={filteredTemplates}
              selectedProductType={selectedProductType}
              form={form}
              chooseTemplate={chooseTemplate}
            />
          )}

          {activeStep === "details" && (
            <ProductDetailsStep
              isAdmin={isAdmin}
              creators={creators}
              form={form}
              selectedTemplate={selectedTemplate}
              product={product}
              isNew={isNew}
              update={update}
              applyTextFormat={applyTextFormat}
            />
          )}

          {activeStep === "variations" && selectedTemplate && (
            <ProductVariationMatrix
              template={selectedTemplate}
              selectedIds={form.selected_template_variation_ids}
              onChange={setSelectedVariationIds}
              hasTemplateVariations={hasTemplateVariations}
            />
          )}

          {activeStep === "scope" && (
            <ArtworkScopeSelector
              selectedVariations={selectedVariations}
              hasTemplateVariations={hasTemplateVariations}
              groups={form.artwork_groups}
              onChange={setArtworkGroups}
            />
          )}

          {activeStep === "artwork" && selectedTemplate && (
            <ProductArtworkStudio
              template={selectedTemplate}
              printOptions={printOptions}
              artworkGroups={form.artwork_groups}
              onArtworkGroupsChange={setArtworkGroups}
              selectedVariations={selectedVariations}
              isAdmin={isAdmin}
            />
          )}

          {activeStep === "pricing" && (
            <PricingStep
              form={form}
              update={update}
              pricing={pricing}
              product={product}
              isAdmin={isAdmin}
              selectedVariations={selectedVariations}
              updateVariationPrice={updateVariationPrice}
            />
          )}

          {activeStep === "review" && (
            <ReviewStep
              form={form}
              selectedTemplate={selectedTemplate}
              selectedVariations={selectedVariations}
              hasTemplateVariations={hasTemplateVariations}
              readyArtworkSlots={readyArtworkSlots}
              uploadedWithoutPrintMethod={uploadedWithoutPrintMethod}
              generatedMockups={generatedMockups}
              pricing={pricing}
              product={product}
              isAdmin={isAdmin}
              save={save}
              saving={saving}
              productPrimaryMockup={productPrimaryMockup}
              onRemoveArtworkSlot={(slotId) => {
                if (!slotId) return;

                const nextGroups = asArray(form.artwork_groups)
                  .map((group) => ({
                    ...group,
                    artworks: asArray(group.artworks).filter((slot) => slot.id !== slotId),
                  }))
                  .filter((group) => asArray(group.artworks).length > 0);

                setArtworkGroups(nextGroups);
                toast.success("Artwork slot removed");
              }}
            />
          )}
        </main>

        {activeStep !== "artwork" && activeStep !== "review" && (
          <aside className="product-builder-aside space-y-4">
            <BuilderSidebar
              canContinueProductType={canContinueProductType}
              canContinueProductOption={canContinueProductOption}
              canContinueDetails={canContinueDetails}
              hasTemplateVariations={hasTemplateVariations}
              form={form}
              readyArtworkSlots={readyArtworkSlots}
              generatedMockups={generatedMockups}
              pricing={pricing}
              productPrimaryMockup={productPrimaryMockup}
              stepIndex={stepIndex}
              activeStep={activeStep}
              prevStep={prevStep}
              nextStep={nextStep}
              save={save}
              saving={saving}
              isNew={isNew}
            />
          </aside>
        )}

        {activeStep === "artwork" && (
          <section className="card flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-2 text-xs">
              <ChecklistItem done={Boolean(canContinueProductType)} label="Product type" />
              <ChecklistItem done={Boolean(canContinueProductOption)} label="Product option" />
              <ChecklistItem done={Boolean(canContinueDetails)} label="Details" />
              <ChecklistItem done={!hasTemplateVariations || form.selected_template_variation_ids.length > 0} label={hasTemplateVariations ? `${form.selected_template_variation_ids.length} variations` : "No variations needed"} />
              <ChecklistItem done={form.artwork_groups.length > 0} label={`${form.artwork_groups.length} groups`} />
              <ChecklistItem
                done={readyArtworkSlots.length > 0}
                label={
                  uploadedWithoutPrintMethod.length
                    ? `${uploadedWithoutPrintMethod.length} missing print method`
                    : `${readyArtworkSlots.length} art ready`
                }
              />
              <ChecklistItem done={generatedMockups.length > 0} label={`${generatedMockups.length} mockups`} />
              <ChecklistItem done={pricing.canPublishProfitably} label="Price covers costs" />
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" onClick={prevStep}>Previous</button>
              <button type="button" className="btn-primary" onClick={nextStep}>Next</button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function BuilderSidebar({ canContinueProductType, canContinueProductOption, canContinueDetails, hasTemplateVariations, form, readyArtworkSlots, generatedMockups, pricing, productPrimaryMockup, stepIndex, activeStep, prevStep, nextStep, save, saving, isNew }) {
  return (
    <>
      <section className="card">
        <div className="overline mb-3">Progress</div>
        <ChecklistItem done={Boolean(canContinueProductType)} label="Product type selected" />
        <ChecklistItem done={Boolean(canContinueProductOption)} label="Product option selected" />
        <ChecklistItem done={Boolean(canContinueDetails)} label="Details complete" />
        <ChecklistItem done={!hasTemplateVariations || form.selected_template_variation_ids.length > 0} label={hasTemplateVariations ? `${form.selected_template_variation_ids.length} variation(s) selected` : "No variations needed"} />
        <ChecklistItem done={form.artwork_groups.length > 0} label={`${form.artwork_groups.length} artwork group(s)`} />
        <ChecklistItem done={readyArtworkSlots.length > 0} label={`${readyArtworkSlots.length} artwork slot(s) ready`} />
        <ChecklistItem done={generatedMockups.length > 0} label={`${generatedMockups.length} mockup(s) generated`} />
        <ChecklistItem done={pricing.canPublishProfitably} label="Price covers costs" />
      </section>

      <section className="card">
        <div className="overline mb-3">Primary Mockup</div>
        {productPrimaryMockup ? (
          <img src={assetUrl(productPrimaryMockup)} alt="Primary mockup" className="w-full max-h-56 object-contain bg-black border border-white/10 rounded-lg" />
        ) : (
          <div className="text-sm text-zinc-500 border border-dashed border-white/15 p-4 rounded-lg">
            Generate at least one mockup from an artwork group.
          </div>
        )}
      </section>

      <section className="card">
        <div className="overline mb-3">Pricing estimate</div>
        <table className="w-full text-sm">
          <tbody>
            <tr><td className="text-zinc-400">Base product cost</td><td className="text-right">{money(pricing.blank)}</td></tr>
            <tr><td className="text-zinc-400">Estimated print cost</td><td className="text-right">{pricing.print > 0 ? money(pricing.print) : "Pending"}</td></tr>
            <tr><td className="text-zinc-400">Minimum selling price</td><td className="text-right">{money(pricing.minimumSellingPrice || 0)}</td></tr>
            <tr className="border-t border-white/15"><td className="font-bold pt-2">Estimated creator/fundraising amount</td><td className={`text-right font-bold pt-2 ${pricing.profit >= 0 ? "text-[#34C759]" : "text-[#FF3B30]"}`}>{money(pricing.profit)}</td></tr>
          </tbody>
        </table>
        <p className="text-xs text-zinc-500 mt-3">Estimate updates as artwork and print method are selected.</p>
      </section>

      <section className="card flex gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={prevStep} disabled={stepIndex === 0}>Previous</button>
        {activeStep !== "review" ? (
          <button type="button" className="btn-primary flex-1" onClick={nextStep}>Next</button>
        ) : (
          <button type="button" className="btn-primary flex-1" disabled={saving} onClick={save}><Save size={14} /> {saving ? "Saving…" : isNew ? "Create" : "Save"}</button>
        )}
      </section>
    </>
  );
}

function ProductTypeStep({ productTypes = [], selectedProductTypeId, selectedTemplate, isNew, chooseProductType }) {
  return (
    <div className="space-y-6 product-builder-main">
      <div>
        <div className="overline mb-1">Choose product type</div>
        <p className="text-sm text-zinc-500 max-w-3xl">Start with the product type so the next screen only shows matching product options.</p>
      </div>

      <section className="border border-white/10 bg-black/20 p-5 rounded-xl space-y-4">
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {productTypes.map((type) => {
            const selected = selectedProductTypeId === type.id;

            return (
              <button
                key={type.id}
                type="button"
                aria-pressed={selected}
                onClick={() => chooseProductType(type.id)}
                className={`relative w-full text-left border rounded-xl p-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black ${selected ? SELECTED_CARD_CLASS : UNSELECTED_CARD_CLASS}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-white">{type.name}</div>
                    <div className="text-xs text-zinc-500 mt-1">{type.category || type.slug}</div>
                  </div>
                  {selected && (
                    <span className={SELECTED_BADGE_CLASS}>
                      Selected <Check size={12} />
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {!productTypes.length && (
          <div className="text-sm text-zinc-500 border border-dashed border-white/15 rounded-xl p-4">No active product types are available yet.</div>
        )}

        {!isNew && selectedTemplate && !selectedProductTypeId && (
          <div className="text-xs text-zinc-500 border border-white/10 rounded-xl p-3">
            Existing product option: {selectedTemplate.name}. Select a product type to change the available options.
          </div>
        )}
      </section>
    </div>
  );
}

function ProductOptionStep({ templates = [], selectedProductType, form, chooseTemplate }) {
  return (
    <div className="space-y-6 product-builder-main">
      <div>
        <div className="overline mb-1">Choose product option</div>
        <p className="text-sm text-zinc-500 max-w-3xl">
          Creator cost excludes printing. Final selling price depends on print area, print method and fundraising amount.
        </p>
      </div>

      {selectedProductType && (
        <div className="text-sm text-zinc-500 border border-white/10 bg-black/20 rounded-xl p-3">
          Showing available options for {selectedProductType.name}.
        </div>
      )}

      <section className="border border-white/10 bg-black/20 p-5 rounded-xl">
        <div className="hidden lg:grid gap-3 lg:grid-cols-[88px_minmax(140px,1.1fr)_minmax(180px,1.3fr)_minmax(150px,0.9fr)_minmax(150px,0.8fr)] px-3 pb-2 text-[10px] uppercase tracking-widest text-zinc-500">
          <div>Picture</div>
          <div>Name</div>
          <div>Description</div>
          <div>Available options</div>
          <div>Creator cost excl. printing</div>
        </div>
        <div className="grid gap-3 max-h-[680px] overflow-auto pr-1">
          {templates.map((template) => {
            const image = getTemplateImage(template);
            const selected = form.template_id === template.id;

            return (
              <button
                key={template.id}
                type="button"
                aria-pressed={selected}
                onClick={() => chooseTemplate(template)}
                className={`relative w-full text-left border rounded-xl p-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black ${selected ? SELECTED_CARD_CLASS : UNSELECTED_CARD_CLASS}`}
              >
                <div className="grid gap-3 lg:grid-cols-[88px_minmax(140px,1.1fr)_minmax(180px,1.3fr)_minmax(150px,0.9fr)_minmax(150px,0.8fr)] lg:items-center">
                  <div>
                    {image ? (
                      <img src={assetUrl(image)} alt={template.name} className="h-20 w-20 object-contain bg-black border border-white/10 rounded" />
                    ) : (
                      <div className="h-20 w-20 bg-black border border-white/10 rounded flex items-center justify-center"><Package size={24} className="text-zinc-600" /></div>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1 lg:hidden">Name</div>
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="font-bold text-white">{template.name}</div>
                      {selected && (
                        <span className={SELECTED_BADGE_CLASS}>
                          Selected <Check size={12} />
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1 lg:hidden">Description</div>
                    <div className="text-xs text-zinc-400 line-clamp-3">{getTemplateShortDescription(template)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1 lg:hidden">Available options</div>
                    <div className="space-y-1 text-xs text-zinc-300">
                      {getTemplateAvailableOptionsSummary(template).map((line) => <div key={line}>{line}</div>)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Creator cost excl. printing</div>
                    <div className="font-bold text-white">{money(getCreatorBlankPrice(template))}</div>
                    <div className="text-[11px] text-zinc-500 mt-1">Final selling price depends on print area, print method and fundraising amount.</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {!templates.length && (
          <div className="text-sm text-zinc-500 border border-dashed border-white/15 rounded-xl p-4">No active product options match this product type.</div>
        )}
      </section>
    </div>
  );
}

function ProductDetailsStep({ isAdmin, creators, form, selectedTemplate, product, isNew, update, applyTextFormat }) {
  return (
    <div className="space-y-6 product-builder-main">
      <div>
        <div className="overline mb-1">Product details</div>
        <p className="text-sm text-zinc-500 max-w-3xl">Create the sellable product shell first. Variations and artwork are configured in the next steps.</p>
      </div>

      <section className="border border-white/10 bg-black/20 p-5 rounded-xl space-y-4">
        {isAdmin && (
          <div>
            <label className="label">Creator</label>
            <select className="input-base" value={form.band_id} onChange={(e) => update("band_id", e.target.value)} disabled={!isNew && Boolean(product?.band_id)}>
              <option value="">Select creator</option>
              {creators.map((creator) => <option key={creator.id} value={creator.id}>{creator.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="label">Product title</label>
          <input className="input-base" value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="Creator logo hoodie" />
        </div>

        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <label className="label mb-0">Description</label>
            <TextFormatToolbar field="description" onFormat={applyTextFormat} />
          </div>
          <textarea
            className="input-base"
            rows={6}
            data-format-field="description"
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
          />
        </div>

        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <label className="label mb-0">Specs / Features</label>
            <TextFormatToolbar field="specs" onFormat={applyTextFormat} />
          </div>
          <textarea
            className="input-base"
            rows={5}
            data-format-field="specs"
            value={form.specs || ""}
            onChange={(e) => update("specs", e.target.value)}
            placeholder="Fabric, fit, care, print method, sizing notes..."
          />
        </div>

        {isAdmin && (
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={form.published} onChange={(e) => update("published", e.target.checked)} />
            Publish product when saved
          </label>
        )}

        {!isAdmin && (
          <div className="space-y-3">
            <label className="flex items-center gap-3 text-sm border border-white/10 rounded-xl p-3">
              <input type="checkbox" checked={Boolean(form.publish_on_approval)} onChange={(e) => update("publish_on_approval", e.target.checked)} />
              <span>
                <span className="font-bold text-white">Publish automatically after approval</span>
                <span className="block text-xs text-zinc-500 mt-1">If enabled, your product will go live automatically once artwork is approved. If disabled, you can publish it manually after approval.</span>
              </span>
            </label>
            <div className="text-xs text-zinc-500 border border-white/10 rounded-xl p-3">Creator products stay unpublished until artwork review is approved.</div>
          </div>
        )}
      </section>

      {selectedTemplate && (
        <div className="border border-white/10 bg-black/20 p-5 rounded-xl">
          <div className="overline mb-2">Selected product option</div>
          <div className="grid md:grid-cols-4 gap-4 text-sm">
            <Info label="Product option" value={selectedTemplate.name} />
            <Info label="Category" value={selectedTemplate.category} />
            <Info label="Available options" value={getTemplateAttributeRange(selectedTemplate)} />
            <Info label="Creator cost excl. printing" value={money(getCreatorBlankPrice(selectedTemplate))} />
          </div>
        </div>
      )}
    </div>
  );
}

function TextFormatToolbar({ field, onFormat }) {
  const buttons = [
    { key: "heading", label: "Heading", icon: <Heading2 size={14} /> },
    { key: "bullet", label: "Bullet list", icon: <List size={14} /> },
    { key: "numbered", label: "Numbered list", icon: <ListOrdered size={14} /> },
    { key: "bold", label: "Bold", icon: <Bold size={14} /> },
  ];

  return (
    <div className="flex flex-wrap gap-1">
      {buttons.map((button) => (
        <button
          key={button.key}
          type="button"
          title={button.label}
          aria-label={button.label}
          onClick={() => onFormat?.(field, button.key)}
          className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-white/10 bg-black/20 text-zinc-300 hover:text-white hover:border-white/30"
        >
          {button.icon}
        </button>
      ))}
    </div>
  );
}

function getPricingReviewMessages(product = {}, isAdmin = false) {
  const messages = [];

  if (product?.requires_creator_pricing_approval || product?.creator_pricing_approval_status === "pending_creator_approval") {
    messages.push("Pricing update needs your approval before this product can go live.");
  }

  if (product?.artwork_review_status && product.artwork_review_status !== "approved") {
    messages.push("Artwork review pending. Your product will stay unpublished until review is complete.");
  }

  if (!isAdmin) {
    messages.push("This product will stay unpublished until artwork and pricing are reviewed.");
  }

  return [...new Set(messages)];
}

function PricingSummaryPanel({ pricing = {}, sellingPrice = 0, product = {}, isAdmin = false, compact = false }) {
  const minimumSellingPrice = pricing.minimumSellingPrice || pricing.minimumRetail || 0;
  const reviewMessages = getPricingReviewMessages(product, isAdmin);
  const printCostValue = pricing.print > 0 ? money(pricing.print) : "Pending print method";

  return (
    <section className={compact ? "border border-white/10 bg-black/20 rounded-xl p-4" : "card"}>
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-4">
        <div>
          <div className="overline mb-1">Pricing summary</div>
          <p className="text-sm text-zinc-500 max-w-3xl">
            Pricing updates as you choose your product, print area and options. Final pricing may be reviewed before the product goes live to make sure production costs are correct.
          </p>
        </div>
        <div className={`text-xs rounded-lg px-3 py-2 border ${pricing.canPublishProfitably ? "border-[#34C759]/40 text-[#A7F3C4] bg-[#34C759]/10" : "border-[#FF3B30]/50 text-[#FFB4B0] bg-[#FF3B30]/10"}`}>
          {pricing.canPublishProfitably ? "Price covers estimated costs" : "Price may be too low"}
        </div>
      </div>

      <p className="text-xs text-zinc-500 mb-4">
        Base product cost + print cost + platform commission must be covered before creator/fundraising earnings are available.
      </p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
        <Info label="Base product cost" value={money(pricing.blank)} />
        <Info label="Estimated print cost" value={printCostValue} />
        <Info label="Estimated production cost" value={money(pricing.production)} />
        <Info label={`Platform commission ${Math.round((pricing.rate || 0) * 100)}%`} value={money(pricing.commission)} />
        <Info label="Minimum selling price" value={money(minimumSellingPrice)} />
        <Info label="Your selling price" value={money(sellingPrice)} />
        <Info label="Estimated creator/fundraising amount" value={money(pricing.profit)} />
        <Info label="Pricing review status" value={product?.creator_pricing_approval_status || (isAdmin ? "Admin controlled" : "Review may be required")} />
      </div>

      {!pricing.canPublishProfitably && Number(sellingPrice || 0) > 0 && (
        <div className="border border-[#FF3B30]/50 bg-[#FF3B30]/10 p-3 text-xs text-[#FFB4B0] rounded-lg mt-4">
          This selling price may be too low to cover production and platform costs. Increase the selling price or reduce the fundraising amount.
        </div>
      )}

      {reviewMessages.length > 0 && (
        <div className="space-y-2 mt-4">
          {reviewMessages.map((message) => (
            <div key={message} className="border border-white/10 bg-black/20 p-3 text-xs text-zinc-400 rounded-lg">{message}</div>
          ))}
        </div>
      )}
    </section>
  );
}

function PricingStep({ form, update, pricing, product, isAdmin, selectedVariations = [], updateVariationPrice }) {
  const safeSelectedVariations = asArray(selectedVariations);
  const overrides = form.variation_price_overrides || {};
  const [desiredFundraisingAmount, setDesiredFundraisingAmount] = useState(() => Math.max(Number(pricing.profit || 0), 0).toFixed(2));

  useEffect(() => {
    setDesiredFundraisingAmount(Math.max(Number(pricing.profit || 0), 0).toFixed(2));
  }, [form.selling_price, pricing.production, pricing.rate, pricing.profit]);

  const updateDesiredFundraisingAmount = (value) => {
    setDesiredFundraisingAmount(value);
    const desired = Number(value || 0);
    const rate = Number(pricing.rate || 0);
    const suggestedPrice = rate >= 1 ? pricing.production + desired : (pricing.production + desired) / (1 - rate);
    update("selling_price", Number.isFinite(suggestedPrice) ? suggestedPrice.toFixed(2) : "0.00");
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <div className="overline mb-1">Pricing</div>
        <p className="text-sm text-zinc-500 max-w-3xl">
          Set the selling price customers will see. You can also enter a desired fundraising amount per item and the builder will suggest the selling price needed to cover production and commission.
        </p>
      </div>

      <PricingSummaryPanel pricing={pricing} sellingPrice={form.selling_price} product={product} isAdmin={isAdmin} />

      <div className="card grid md:grid-cols-2 gap-4">
        <div>
          <label className="label">Default retail selling price</label>
          <input
            className="input-base"
            type="number"
            step="0.01"
            min="0"
            value={form.selling_price}
            onChange={(e) => update("selling_price", e.target.value)}
          />
          <p className="text-xs text-zinc-500 mt-2">This is the price saved on the product.</p>
        </div>

        <div>
          <label className="label">Desired fundraising amount per item</label>
          <input
            className="input-base"
            type="number"
            step="0.01"
            min="0"
            value={desiredFundraisingAmount}
            onChange={(e) => updateDesiredFundraisingAmount(e.target.value)}
          />
          <p className="text-xs text-zinc-500 mt-2">Changing this updates the selling price suggestion using the current 15% platform commission.</p>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="font-bold text-white">Variation selling prices</div>
            <p className="text-xs text-zinc-500 mt-1">
              Most products can use the default selling price. Only override a variation if that size/colour should sell at a different price.
            </p>
          </div>
        </div>

        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="text-left text-zinc-500 border-b border-white/10">
              <th className="py-2 pr-3">Variation</th>
              <th className="py-2 pr-3">SKU</th>
              <th className="py-2 pr-3 text-right">Base product cost</th>
              <th className="py-2 pr-3">Selling price override</th>
              <th className="py-2 text-right">Effective price</th>
            </tr>
          </thead>
          <tbody>
            {safeSelectedVariations.map((variation) => {
              const overrideValue = overrides[variation.id] ?? "";
              const effectivePrice = overrideValue === "" || overrideValue === null || overrideValue === undefined
                ? Number(form.selling_price || 0)
                : Number(overrideValue || 0);
              const variationProductionCost = getVariationCost(variation, null) + Number(pricing.print || 0);
              const variationMinimumPrice = pricing.rate >= 1 ? variationProductionCost : Math.ceil((variationProductionCost / (1 - pricing.rate)) * 100) / 100;
              const overrideTooLow = effectivePrice > 0 && effectivePrice < variationMinimumPrice;

              return (
                <tr key={variation.id} className="border-b border-white/5 align-top">
                  <td className="py-3 pr-3 text-white">{variation.label || Object.entries(variation.attributes || {}).map(([k, v]) => `${k}: ${v}`).join(" / ") || variation.id}</td>
                  <td className="py-3 pr-3 text-zinc-400">{variation.sku || "—"}</td>
                  <td className="py-3 pr-3 text-right text-zinc-400">{money(getVariationCost(variation, null))}</td>
                  <td className="py-3 pr-3">
                    <input
                      className="input-base max-w-[160px]"
                      type="number"
                      step="0.01"
                      min="0"
                      value={overrideValue}
                      onChange={(e) => updateVariationPrice(variation.id, e.target.value)}
                      placeholder={String(form.selling_price || "")}
                    />
                    {overrideTooLow && (
                      <div className="text-[11px] text-[#FFB4B0] mt-2">Below the estimated minimum of {money(variationMinimumPrice)}.</div>
                    )}
                  </td>
                  <td className={`py-3 text-right font-bold ${overrideTooLow ? "text-[#FFB4B0]" : "text-white"}`}>{money(effectivePrice)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReviewStep({
  form = {},
  selectedTemplate,
  selectedVariations = [],
  hasTemplateVariations = true,
  readyArtworkSlots = [],
  uploadedWithoutPrintMethod = [],
  generatedMockups = [],
  pricing = {},
  product = {},
  isAdmin = false,
  save,
  saving,
  productPrimaryMockup,
  onRemoveArtworkSlot,
}) {
  const title = String(form.title || "");
  const artworkGroups = asArray(form.artwork_groups);
  const safeReadyArtworkSlots = asArray(readyArtworkSlots);
  const safeGeneratedMockups = asArray(generatedMockups);
  const safeSelectedVariations = asArray(selectedVariations);
  const safeUploadedWithoutPrintMethod = asArray(uploadedWithoutPrintMethod);
  const variationStatus = hasTemplateVariations ? `${safeSelectedVariations.length} selected variation(s)` : "Standard product";
  const variationDetail = hasTemplateVariations ? `${safeSelectedVariations.length} variation(s) selected` : "No variations needed";
  const pricingStatus = pricing?.canPublishProfitably ? "Covers costs" : "Needs price review";
  const artworkStatus = product?.artwork_review_status || (safeReadyArtworkSlots.length ? "Ready for review" : "Needs artwork");
  const productTypeLabel = selectedTemplate?.product_type || selectedTemplate?.product_type_name || selectedTemplate?.category || selectedTemplate?.product_type_slug || "Product option";
  const publishingMode = isAdmin
    ? (form.published ? "Publish on save" : "Save unpublished")
    : (form.publish_on_approval ? "Publish after approval" : "Manual publish after approval");

  const ready = Boolean(
    selectedTemplate &&
    (!hasTemplateVariations || safeSelectedVariations.length) &&
    safeReadyArtworkSlots.length &&
    safeGeneratedMockups.length &&
    pricing?.canPublishProfitably
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div>
          <div className="overline mb-1">Final review</div>
          <h2 className="font-display text-4xl uppercase">Confirm product setup</h2>
          <p className="text-sm text-zinc-500 mt-2 max-w-3xl">Check the product details, artwork output and pricing before saving.</p>
        </div>
        <div className={`text-xs rounded-lg px-3 py-2 border self-start lg:self-end ${ready ? "border-[#34C759]/40 text-[#A7F3C4] bg-[#34C759]/10" : "border-white/10 text-zinc-400 bg-black/20"}`}>
          {ready ? "Ready to save" : "Draft can be saved"}
        </div>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_360px] gap-5">
        <div className="grid lg:grid-cols-2 gap-5">
          <section className="card">
            <div className="overline mb-3">Readiness checklist</div>
            <div className="grid gap-1">
              <ChecklistItem done={Boolean(selectedTemplate)} label={`Product option: ${selectedTemplate?.name || "Missing"}`} />
              <ChecklistItem done={Boolean(title.trim())} label={`Title: ${title || "Missing"}`} />
              <ChecklistItem done={!hasTemplateVariations || safeSelectedVariations.length > 0} label={variationDetail} />
              <ChecklistItem done={artworkGroups.length > 0} label={`Artwork groups: ${artworkGroups.length}`} />
              <ChecklistItem done={safeReadyArtworkSlots.length > 0} label={`Ready artwork slots: ${safeReadyArtworkSlots.length}`} />
              <ChecklistItem done={safeGeneratedMockups.length > 0} label={`Mockups generated: ${safeGeneratedMockups.length}`} />
              <ChecklistItem done={Boolean(pricing?.canPublishProfitably)} label={`Pricing: ${pricingStatus.toLowerCase()}`} />
            </div>

            {safeUploadedWithoutPrintMethod.length > 0 && (
              <div className="border border-[#FF3B30]/50 bg-[#FF3B30]/10 p-3 text-xs text-[#FFB4B0] rounded-lg mt-4">
                {safeUploadedWithoutPrintMethod.length} uploaded artwork slot(s) still need a print method. Go back to Artwork and select a print method for each uploaded artwork.
              </div>
            )}
          </section>

          <section className="card">
            <div className="overline mb-3">Product details</div>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <Info label="Product title" value={title || "Missing"} />
              <Info label="Product option" value={selectedTemplate?.name || "Missing"} />
              <Info label="Product type/category" value={productTypeLabel} />
              <Info label="Variation status" value={variationStatus} />
              <Info label="Publishing mode" value={publishingMode} />
              <Info label="Artwork review status" value={artworkStatus} />
              <Info label="Pricing review status" value={pricingStatus} />
              {!hasTemplateVariations && <Info label="Variation requirement" value="No variations needed" />}
            </div>
          </section>
        </div>

        <section className="card">
          <div className="overline mb-3">Primary mockup</div>
          {productPrimaryMockup ? (
            <img src={assetUrl(productPrimaryMockup)} alt="Primary product mockup" className="w-full max-h-[420px] object-contain bg-black border border-white/10 rounded-lg" />
          ) : (
            <div className="min-h-[220px] text-sm text-zinc-500 border border-dashed border-white/15 rounded-lg flex items-center justify-center p-4 text-center">
              No mockup generated.
            </div>
          )}
        </section>
      </div>

      <PricingSummaryPanel pricing={pricing} sellingPrice={form.selling_price} product={product} isAdmin={isAdmin} />

      <section className="card">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
          <div>
            <div className="overline mb-1">Production output metadata</div>
            <h3 className="font-display text-2xl uppercase">Artwork slots</h3>
          </div>
          <div className="text-xs text-zinc-500 border border-white/10 rounded-lg px-3 py-2">
            {safeReadyArtworkSlots.length} ready slot(s)
          </div>
        </div>

        {safeReadyArtworkSlots.length ? (
          <div className="grid lg:grid-cols-2 gap-3">
            {safeReadyArtworkSlots.map((slot, index) => (
              <div key={slot.id || `${slot.print_area_id || "area"}-${index}`} className="border border-white/10 bg-black/20 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-white truncate">
                      {slot.artwork_group_label || "Artwork group"} · {slot.area_key || slot.screen_view || slot.print_area_id || "Print area"}
                    </div>
                    <div className="text-xs text-zinc-500 mt-1">
                      {slot.calculated_print_cost !== undefined
                        ? `Costed artwork: ${slot.print_width_mm || 0}x${slot.print_height_mm || 0}mm · ${slot.area_cm2 || 0}cm² · ${money(slot.calculated_print_cost || 0)}`
                        : `Production size: ${slot.standard_print_size_key || "Custom / unset"}`}
                    </div>
                    {slot.placement_box_width_mm && slot.placement_box_height_mm ? (
                      <div className="text-[11px] text-zinc-600 mt-1">
                        Placement box: {slot.placement_box_width_mm}x{slot.placement_box_height_mm}mm
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    className="border border-[#FF3B30]/60 text-[#FFB4B0] hover:bg-[#FF3B30]/15 rounded-lg px-3 py-2 text-[10px] uppercase tracking-widest font-bold shrink-0"
                    onClick={() => onRemoveArtworkSlot?.(slot.id)}
                  >
                    Remove
                  </button>
                </div>

                <div className="grid sm:grid-cols-2 gap-3 mt-4 text-xs">
                  <Info label="Print area ID" value={slot.print_area_id || "Missing"} />
                  <Info label="Screen" value={slot.screen_view || slot.screen_id || "Missing"} />
                  <Info label="Print rule" value={slot.rule_name || slot.print_method || "Missing"} />
                  <Info label="DPI" value={slot.dpi || "300"} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-zinc-500 border border-dashed border-white/15 rounded-xl p-4">No ready artwork slots yet.</div>
        )}
      </section>

      <div className="card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-sm text-zinc-500">
          {ready ? "Everything needed for production review is present." : "You can save a draft, then return to complete any missing review items."}
        </div>
        <button type="button" className="btn-primary sm:min-w-[180px]" disabled={saving} onClick={save}>
          <Save size={14} /> {saving ? "Saving..." : ready ? "Save Product" : "Save Draft"}
        </button>
      </div>
    </div>
  );
}

function ChecklistItem({ done, label }) {
  return (
    <div className="flex items-center gap-2 text-sm mb-2">
      <span className={done ? "text-[#34C759]" : "text-zinc-600"}><Check size={14} /></span>
      <span className={done ? "text-zinc-200" : "text-zinc-500"}>{label}</span>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-zinc-500 mb-1">{label}</div>
      <div className="font-bold text-white">{value}</div>
    </div>
  );
}
