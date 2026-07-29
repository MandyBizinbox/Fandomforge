import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { toast } from "sonner";
import { ArrowLeft, Bold, Check, Heading2, List, ListOrdered, Package, Save } from "lucide-react";
import { http, assetUrl } from "../../lib/api";
import {
  canPublishCreatorProduct,
  emitCreatorProductsReadyRefresh,
  getCreatorProductArtworkStatus,
  getCreatorProductRejectionReason,
  isCreatorProductPublished,
  needsCreatorPricingApproval,
  setCreatorProductPublished,
} from "../../lib/creatorProductPublishing";
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
  getTemplateAvailableOptionsSummary,
  getTemplateImage,
  getTemplateShortDescription,
  getUniquePrintCostFromGroups,
  estimateProductionOperationCostFromGroups,
  getCreatorBlankPrice,
  getVariationCost,
  resolveCreatorCommissionRate,
  resolveCreatorCommissionSource,
  getEffectivePricingStatus,
  hasEffectivePricingBlocker,
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
  const { user } = useAuth();
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
  const [productionOperations, setProductionOperations] = useState([]);
  const [product, setProduct] = useState(null);
  const [submittedProduct, setSubmittedProduct] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [creatorAccount, setCreatorAccount] = useState(null);
  const [pricingOverrideReason, setPricingOverrideReason] = useState("");
  const [savingPricingOverride, setSavingPricingOverride] = useState(false);
  const [pricingControl, setPricingControl] = useState(null);
  const [pricingControlLoading, setPricingControlLoading] = useState(false);
  const [savingManualPricing, setSavingManualPricing] = useState(false);

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
    publish_on_approval: false,
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

  const selectedCreatorAccount = useMemo(() => {
    if (!isAdmin) return creatorAccount || {};
    return creators.find((creator) => creator.id === form.band_id) || {};
  }, [creatorAccount, creators, form.band_id, isAdmin]);

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

  const productionOperationEstimate = useMemo(
    () => estimateProductionOperationCostFromGroups(form.artwork_groups, printOptions, productionOperations, selectedTemplate),
    [form.artwork_groups, printOptions, productionOperations, selectedTemplate]
  );

  const creatorVisiblePrintCost = useMemo(
    () => Math.round((Number(printCost || 0) + Number(productionOperationEstimate.creatorCost || 0)) * 100) / 100,
    [printCost, productionOperationEstimate.creatorCost]
  );

  const commissionRate = useMemo(() => {
    const source = selectedCreatorAccount?.id ? selectedCreatorAccount : product;
    return resolveCreatorCommissionRate(source);
  }, [product, selectedCreatorAccount]);

  const commissionSource = useMemo(() => {
    const source = selectedCreatorAccount?.id ? selectedCreatorAccount : product;
    return resolveCreatorCommissionSource(source);
  }, [product, selectedCreatorAccount]);

  const primaryManualPricingRow = useMemo(() => {
    const rows = asArray(pricingControl?.variations);
    return rows.find((row) => row.variation_key === "default" && row.manual_override_active)
      || rows.find((row) => row.manual_override_active)
      || null;
  }, [pricingControl]);

  const pricing = calculatePricing({
    sellingPrice: primaryManualPricingRow?.effective_selling_price ?? form.selling_price,
    blankCost: primaryManualPricingRow?.effective_base_product_cost ?? blankCost,
    printCost: primaryManualPricingRow?.effective_print_cost ?? creatorVisiblePrintCost,
    commissionRate,
    commissionSource,
    pricingOverrideApproved: Boolean(product?.pricing_override_approved),
  });

  const readyArtworkSlots = getReadyArtworkSlots(form.artwork_groups);
  const generatedMockups = getGeneratedMockups(form.artwork_groups);
  const uploadedArtworkSlots = form.artwork_groups.flatMap((group) => asArray(group.artworks)).filter((slot) => slot.original_url);
  const uploadedWithoutPrintMethod = uploadedArtworkSlots.filter((slot) => !slot.print_option_id);
  const primaryArtwork = firstReadyArtwork(form.artwork_groups);
  const productPrimaryMockup = getPrimaryMockupFromGroups(form.artwork_groups) || form.primary_mockup_image_url || form.mockup_image_url || "";

  useEffect(() => {
    if (isAdmin) return;
    http.get("/creators/me").then((response) => setCreatorAccount(response.data || null)).catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const requests = [
          http.get(isAdmin ? "/admin/product-templates" : "/product-templates"),
          http.get("/print-options"),
          http.get("/production-operations").catch(() => ({ data: [] })),
        ];

        requests.push(http.get("/public/product-types?status=active"));
        if (isAdmin) requests.push(http.get("/admin/creators"));
        if (!isNew) requests.push(http.get(isAdmin ? `/admin/products/${routeId}` : `/products/${routeId}`));

        const responses = await Promise.all(requests);
        setTemplates(asArray(responses[0].data));
        setPrintOptions(asArray(responses[1].data));
        setProductionOperations(asArray(responses[2].data));

        let cursor = 3;
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
            publish_on_approval: false,
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
    let mounted = true;
    async function loadPricingControl() {
      if (!isAdmin || isNew || user?.role !== "super_admin" || !product?.id) {
        setPricingControl(null);
        return;
      }
      setPricingControlLoading(true);
      try {
        const response = await http.get(`/admin/products/${product.id}/pricing-control`);
        if (mounted) setPricingControl(response.data);
      } catch (error) {
        console.warn("Could not load admin pricing control", error);
      } finally {
        if (mounted) setPricingControlLoading(false);
      }
    }
    loadPricingControl();
    return () => {
      mounted = false;
    };
  }, [isAdmin, isNew, product?.id, user?.role]);

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
      publish_on_approval: false,
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
      publish_on_approval: false,
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
    if (form.published && !pricing.canPublishWithOverride) return "Selling price is below the minimum price needed to cover production and platform costs.";
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
      publish_on_approval: false,
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
        const savedProduct = response.data;
        const destination = isAdmin ? `/admin/products/${savedProduct.id}` : `/creator/products/${savedProduct.id}`;
        setProduct(savedProduct);
        setSubmittedProduct(null);
        if (!isAdmin) emitCreatorProductsReadyRefresh();
        toast.success("Product created");
        navigate(destination, { replace: true });
        return;
      }

      const response = await http.patch(isAdmin ? `/admin/products/${routeId}` : `/products/${routeId}`, payload);
      const savedProduct = response.data;
      setProduct(savedProduct);
      setForm((current) => ({
        ...current,
        artworks: asArray(savedProduct.artworks),
        artwork_groups: asArray(savedProduct.artwork_groups),
        mockup_images: asArray(savedProduct.mockup_images),
        mockup_image_url: savedProduct.mockup_image_url || "",
        primary_mockup_image_url: savedProduct.primary_mockup_image_url || savedProduct.mockup_image_url || "",
      }));
      if (!isAdmin) emitCreatorProductsReadyRefresh();
      setActiveStep("review");
      navigate(isAdmin ? `/admin/products/${savedProduct.id}` : `/creator/products/${savedProduct.id}`, { replace: true });
      toast.success("Product saved");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not save product");
    } finally {
      setSaving(false);
    }
  };

  const publishProduct = async () => {
    if (!product || !canPublishCreatorProduct(product)) return;

    setPublishing(true);
    try {
      const updated = await setCreatorProductPublished(http, product, true);
      setProduct(updated);
      setForm((current) => ({
        ...current,
        published: Boolean(updated.published),
        publish_on_approval: false,
      }));
      emitCreatorProductsReadyRefresh();
      toast.success("Product published");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Publish update failed");
    } finally {
      setPublishing(false);
    }
  };

  const updatePricingOverride = async (approved) => {
    if (!isAdmin || user?.role !== "super_admin" || !product?.id) return;
    const reason = pricingOverrideReason.trim();
    if (!reason) {
      toast.error("Pricing override reason is required");
      return;
    }

    setSavingPricingOverride(true);
    const endpoint = `/admin/products/${product.id}/pricing-override`;
    try {
      const response = await http.patch(endpoint, {
        approved,
        reason,
      });
      const refreshed = await http.get(`/admin/products/${product.id}`).catch(() => response);
      setProduct(refreshed.data || response.data);
      setPricingOverrideReason("");
      toast.success(approved ? "Pricing override approved" : "Pricing override removed");
    } catch (error) {
      console.error("Pricing override request failed", {
        status: error.response?.status,
        path: endpoint,
        detail: error.response?.data?.detail || error.message,
      });
      toast.error(error.response?.data?.detail || "Could not update pricing override");
    } finally {
      setSavingPricingOverride(false);
    }
  };

  const saveManualPricingOverrides = async (overrides) => {
    if (!isAdmin || user?.role !== "super_admin" || !product?.id) return;
    setSavingManualPricing(true);
    const endpoint = `/admin/products/${product.id}/pricing-control`;
    try {
      const response = await http.patch(endpoint, { overrides });
      setPricingControl(response.data);
      setProduct(response.data.product);
      setForm((current) => ({
        ...current,
        selling_price: response.data.product?.selling_price ?? current.selling_price,
      }));
      toast.success("Manual pricing override saved");
    } catch (error) {
      console.error("Manual pricing override request failed", {
        status: error.response?.status,
        path: endpoint,
        detail: error.response?.data?.detail || error.message,
      });
      toast.error(error.response?.data?.detail || "Could not save manual pricing override");
    } finally {
      setSavingManualPricing(false);
    }
  };

  const canContinueProductType = Boolean(selectedProductTypeId || (!isNew && selectedTemplate));
  const canContinueProductOption = Boolean(selectedTemplate);
  const canContinueDetails = Boolean(selectedTemplate && form.title.trim() && (!isAdmin || form.band_id));
  const stepIndex = steps.findIndex((step) => step.key === activeStep);
  const pricingWorkspace = activeStep === "pricing";
  const wideWorkspace = activeStep === "artwork" || activeStep === "review" || pricingWorkspace;

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

      {!isAdmin && !isNew && product && (
        <CreatorPublishingPanel product={product} publishing={publishing} onPublish={publishProduct} />
      )}

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

      <div className={wideWorkspace ? "product-builder-layout grid grid-cols-1 gap-5" : "product-builder-layout grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5"}>
        <main className={wideWorkspace ? "product-builder-main min-w-0 min-h-[820px]" : "product-builder-main min-w-0 card min-h-[720px]"}>
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
              user={user}
              selectedVariations={selectedVariations}
              updateVariationPrice={updateVariationPrice}
              pricingControl={pricingControl}
              pricingControlLoading={pricingControlLoading}
              savingManualPricing={savingManualPricing}
              onSaveManualPricing={saveManualPricingOverrides}
              pricingOverrideReason={pricingOverrideReason}
              setPricingOverrideReason={setPricingOverrideReason}
              savingPricingOverride={savingPricingOverride}
              onUpdatePricingOverride={updatePricingOverride}
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

        {!wideWorkspace && (
          <aside className="product-builder-aside space-y-4">
            <BuilderSidebar
              pricing={pricing}
              productPrimaryMockup={productPrimaryMockup}
            />
          </aside>
        )}

      </div>

      {activeStep !== "review" && (
        <BuilderNavigation
          stepIndex={stepIndex}
          prevStep={prevStep}
          nextStep={nextStep}
        />
      )}
    </div>
  );
}

function BuilderNavigation({ stepIndex, prevStep, nextStep }) {
  const saveDraft = () => {
    window.dispatchEvent(new CustomEvent("ff-builder-save-draft"));
  };

  return (
    <section className="builder-navigation" aria-label="Product builder actions">
      <button type="button" className="builder-nav-button builder-nav-button-secondary" onClick={prevStep} disabled={stepIndex === 0}>
        Previous
      </button>
      <button
        id="ff-builder-visible-save-draft"
        type="button"
        className="builder-nav-button builder-nav-button-save"
        onClick={saveDraft}
      >
        <Save size={14} /> Save Draft
      </button>
      <button type="button" className="builder-nav-button builder-nav-button-primary" onClick={nextStep}>
        Next
      </button>
    </section>
  );
}

function BuilderSidebar({ pricing, productPrimaryMockup }) {
  return (
    <>
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
            <tr>
              <td className="text-zinc-400">Estimated production cost</td>
              <td className="text-right">{pricing.print > 0 ? money(pricing.production) : "Pending"}</td>
            </tr>
            <tr>
              <td className="text-zinc-400">Estimated selling price</td>
              <td className="text-right">{money(pricing.minimumSellingPrice || 0)}</td>
            </tr>
            <tr className="border-t border-white/15">
              <td className="font-bold pt-2">Markup / fundraising amount</td>
              <td className={`text-right font-bold pt-2 ${pricing.profit >= 0 ? "text-[#34C759]" : "text-[#FF3B30]"}`}>{money(pricing.profit)}</td>
            </tr>
          </tbody>
        </table>
        <p className="text-xs text-zinc-500 mt-3">Printing includes print cost plus production labour estimate.</p>
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

function ProductDetailsStep({ isAdmin, creators, form, product, isNew, update, applyTextFormat }) {
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
          <div className="text-xs text-zinc-500 border border-white/10 rounded-xl p-3">
            Creator products stay unpublished until artwork review is approved. Once approved, publish the product from this page or the Products list.
          </div>
        )}
      </section>

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

function getPricingReviewMessages(product = {}, isAdmin = false, pricing = {}) {
  const messages = [];
  const pricingStatus = getEffectivePricingStatus(product, pricing);
  const artworkStatus = product?.artwork_review_status;
  const artworkBlocking = Boolean(artworkStatus && !["approved", "not_required"].includes(artworkStatus));
  const pricingBlocking = pricingStatus === "pending_creator_approval" || pricingStatus === "price_below_minimum";

  if (pricingBlocking) {
    messages.push("Pricing update needs your approval before this product can go live.");
  }

  if (artworkBlocking) {
    messages.push("Artwork review pending. Your product will stay unpublished until review is complete.");
  }

  if (!isAdmin && pricingStatus !== "override_approved" && (pricingBlocking || artworkBlocking)) {
    messages.push("This product will stay unpublished until artwork and pricing are reviewed.");
  } else if (!isAdmin && pricingStatus === "override_approved" && artworkBlocking) {
    messages.push("This product will stay unpublished until artwork review is complete.");
  }

  return [...new Set(messages)];
}

function PricingSummaryPanel({ pricing = {}, sellingPrice = 0, product = {}, isAdmin = false, compact = false, fundraisingValue = "", onFundraisingChange = null, showPlatformFee = true }) {
  const fundraisingAmount = Number(fundraisingValue || Math.max(Number(pricing.profit || 0), 0) || 0);
  const rate = Number(pricing.rate || 0);
  const minimumSellingPrice = rate >= 1
    ? pricing.production + fundraisingAmount
    : Math.ceil(((Number(pricing.production || 0) + fundraisingAmount) / (1 - rate)) * 100) / 100;
  const actualSellingPrice = Number(sellingPrice || 0);
  const platformFeeAmount = Math.round(actualSellingPrice * rate * 100) / 100;
  const profitAfterFundraising = Math.round((
    actualSellingPrice
    - Number(pricing.production || 0)
    - platformFeeAmount
    - fundraisingAmount
  ) * 100) / 100;
  const reviewMessages = getPricingReviewMessages(product, isAdmin, pricing);
  const overrideActive = Boolean(product?.pricing_override_approved || pricing.pricingOverrideApproved);
  const manualPricingActive = Boolean(product?.manual_pricing_override_active);
  const statusTone = pricing.canPublishProfitably
    ? "border-[#34C759]/40 text-[#A7F3C4] bg-[#34C759]/10"
    : overrideActive || manualPricingActive
    ? "border-amber-400/50 text-amber-100 bg-amber-500/10"
    : "border-[#FF3B30]/50 text-[#FFB4B0] bg-[#FF3B30]/10";
  const statusLabel = pricing.canPublishProfitably
    ? "Price covers estimated costs"
    : overrideActive
    ? "Pricing override approved"
    : manualPricingActive
    ? "Manual override active"
    : "Price below minimum";

  return (
    <section className={compact ? "border border-white/10 bg-black/20 rounded-xl p-4 w-full" : "card w-full"}>
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-5">
        <div>
          <div className="overline mb-1">Pricing Summary</div>
          <p className="text-sm text-zinc-500 max-w-3xl">
            Pricing updates as product, artwork, print method, and variation settings change.
          </p>
        </div>
        <div className={`text-xs rounded-lg px-3 py-2 border font-bold uppercase tracking-widest ${statusTone}`}>
          {statusLabel}
        </div>
      </div>

      <div className={`grid md:grid-cols-2 ${showPlatformFee ? "xl:grid-cols-5" : "xl:grid-cols-4"} gap-4 text-sm`}>
        <PricingSummaryGroup title="Total product cost">
          <PricingSummaryMetric label="Blank product + printing" value={pricing.print > 0 ? money(pricing.production) : "Pending print method"} />
          <div className="text-[11px] leading-relaxed text-zinc-500">
            The complete estimated production cost for one item.
          </div>
        </PricingSummaryGroup>

        <PricingSummaryGroup title="Fundraising amount">
          {onFundraisingChange ? (
            <input
              className="input-base"
              type="number"
              step="0.01"
              min="0"
              value={fundraisingValue}
              onChange={(event) => onFundraisingChange(event.target.value)}
            />
          ) : (
            <PricingSummaryMetric label="Amount" value={money(fundraisingAmount)} />
          )}
          <div className="text-[11px] leading-relaxed text-zinc-500">
            The amount you want to raise from each sale.
          </div>
        </PricingSummaryGroup>

        <PricingSummaryGroup title="Recommended selling price">
          <PricingSummaryMetric label="Customer price" value={money(minimumSellingPrice)} />
          <div className="text-[11px] leading-relaxed text-zinc-500">
            Recommended to cover the product and your fundraising target.
          </div>
        </PricingSummaryGroup>

        <PricingSummaryGroup title="Profit per sale">
          <PricingSummaryMetric
            label="Additional profit"
            value={money(profitAfterFundraising)}
            valueClassName={profitAfterFundraising >= 0 ? "text-[#34C759]" : "text-[#FF3B30]"}
          />
          <div className="text-[11px] leading-relaxed text-zinc-500">
            What remains after your fundraising target and required costs.
          </div>
        </PricingSummaryGroup>

        {showPlatformFee && (
          <PricingSummaryGroup title="Platform fee">
            <PricingSummaryMetric label={`Platform fee ${Number(rate * 100).toFixed(2)}%`} value={money(platformFeeAmount)} />
            <div className="text-[11px] leading-relaxed text-zinc-500">
              Confirmed here during final review.
            </div>
          </PricingSummaryGroup>
        )}
      </div>

      {manualPricingActive && (
        <div className="border border-amber-400/50 bg-amber-500/10 p-3 text-xs text-amber-100 rounded-lg mt-4">
          <div className="font-bold uppercase tracking-widest text-[11px] mb-1">Manual pricing override active</div>
          {isAdmin
            ? "Manual pricing override values are being used for this product's effective pricing. This is separate from the pricing blocker override."
            : "FandomForge has adjusted pricing for this product."}
        </div>
      )}

      {overrideActive && (
        <div className="border border-amber-400/50 bg-amber-500/10 p-3 text-xs text-amber-100 rounded-lg mt-4">
          <div className="font-bold uppercase tracking-widest text-[11px] mb-1">Pricing override approved</div>
          <div>This product is below the normal minimum selling price, but FandomForge has approved a pricing override. Artwork and other product requirements still apply.</div>
          {product?.pricing_override_reason && <span className="block mt-2">Reason: {product.pricing_override_reason}</span>}
          {product?.pricing_override_by && <span className="block">Approved by: {product.pricing_override_by}</span>}
          {product?.pricing_override_at && <span className="block">Approved at: {new Date(product.pricing_override_at).toLocaleString()}</span>}
        </div>
      )}

      {!pricing.canPublishProfitably && Number(sellingPrice || 0) > 0 && (
        <div className={`border p-3 text-xs rounded-lg mt-4 ${overrideActive ? "border-amber-400/40 bg-amber-500/10 text-amber-100" : "border-[#FF3B30]/50 bg-[#FF3B30]/10 text-[#FFB4B0]"}`}>
          {overrideActive
            ? "This product is below the normal minimum selling price, but FandomForge has approved a pricing override."
            : "This selling price may be too low to cover production and platform costs. Increase the selling price or reduce the fundraising amount."}
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

function PricingSummaryGroup({ title, children }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="overline mb-3">{title}</div>
      <div className="grid gap-3">{children}</div>
    </div>
  );
}

function PricingSummaryMetric({ label, value, valueClassName = "text-white" }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-2 last:border-b-0 last:pb-0">
      <span className="text-xs uppercase tracking-widest text-zinc-500">{label}</span>
      <span className={`font-bold text-right ${valueClassName}`}>{value}</span>
    </div>
  );
}

function PricingStep({
  form,
  update,
  pricing,
  product,
  isAdmin,
  user,
  selectedVariations = [],
  updateVariationPrice,
  pricingControl,
  pricingControlLoading,
  savingManualPricing,
  onSaveManualPricing,
  pricingOverrideReason,
  setPricingOverrideReason,
  savingPricingOverride,
  onUpdatePricingOverride,
}) {
  const safeSelectedVariations = asArray(selectedVariations);
  const overrides = form.variation_price_overrides || {};
  const [desiredFundraisingAmount, setDesiredFundraisingAmount] = useState(() => Math.max(Number(pricing.profit || 0), 0).toFixed(2));
  const canUseAdminPricingControl = Boolean(isAdmin && user?.role === "super_admin" && product?.id);

  const updateDesiredFundraisingAmount = (value) => {
    setDesiredFundraisingAmount(value);
    const desired = Number(value || 0);
    const rate = Number(pricing.rate || 0);
    const suggestedPrice = rate >= 1 ? pricing.production + desired : (pricing.production + desired) / (1 - rate);
    update("selling_price", Number.isFinite(suggestedPrice) ? suggestedPrice.toFixed(2) : "0.00");
  };

  return (
    <div className="pricing-step-full-width w-full max-w-none space-y-6">
      <div>
        <div className="overline mb-1">Pricing</div>
        <p className="text-sm text-zinc-500 max-w-3xl">
          Pricing updates as product, artwork, print method, and variation settings change.
        </p>
      </div>

      <PricingSummaryPanel
        pricing={pricing}
        sellingPrice={form.selling_price}
        product={product}
        isAdmin={isAdmin}
        fundraisingValue={desiredFundraisingAmount}
        onFundraisingChange={updateDesiredFundraisingAmount}
        showPlatformFee={false}
      />

      <VariationPricingMatrix
        variations={safeSelectedVariations}
        defaultSellingPrice={form.selling_price}
        updateDefaultSellingPrice={(value) => update("selling_price", value)}
        retailOverrides={overrides}
        updateVariationPrice={updateVariationPrice}
        pricing={pricing}
        fundraisingAmount={desiredFundraisingAmount}
        updateFundraisingAmount={updateDesiredFundraisingAmount}
        pricingControl={pricingControl}
        loadingPricingControl={pricingControlLoading}
        canManagePricingControl={canUseAdminPricingControl}
        savingManualPricing={savingManualPricing}
        onSaveManualPricing={onSaveManualPricing}
      />

      {isAdmin && product && (
        <PricingOverridePanel
          product={product}
          pricing={pricing}
          user={user}
          reason={pricingOverrideReason}
          setReason={setPricingOverrideReason}
          saving={savingPricingOverride}
          onUpdate={onUpdatePricingOverride}
        />
      )}
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
  const pricingStatus = pricing?.canPublishProfitably ? "Covers costs" : pricing?.canPublishWithOverride ? "Override approved" : "Needs price review";
  const artworkStatus = product?.artwork_review_status || (safeReadyArtworkSlots.length ? "Ready for review" : "Needs artwork");
  const productTypeLabel = selectedTemplate?.product_type || selectedTemplate?.product_type_name || selectedTemplate?.category || selectedTemplate?.product_type_slug || "Product option";
  const publishingMode = isAdmin
    ? (form.published ? "Publish on save" : "Save unpublished")
    : "Manual publish after approval";

  const ready = Boolean(
    selectedTemplate &&
    (!hasTemplateVariations || safeSelectedVariations.length) &&
    safeReadyArtworkSlots.length &&
    safeGeneratedMockups.length &&
    pricing?.canPublishWithOverride
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
              <ChecklistItem done={Boolean(pricing?.canPublishWithOverride)} label={`Pricing: ${pricingStatus.toLowerCase()}`} />
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

function PricingOverridePanel({ product, pricing, user, reason, setReason, saving, onUpdate }) {
  const overrideActive = Boolean(product?.pricing_override_approved);
  const needsOverride = hasEffectivePricingBlocker(product, pricing) && Number(product?.selling_price || 0) > 0;
  const canOverride = user?.role === "super_admin";

  if (!overrideActive && !needsOverride) return null;

  return (
    <section className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-5" data-testid="admin-pricing-override-panel">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div className="overline mb-2">Pricing Review Status</div>
          <h2 className="font-display text-3xl uppercase text-white">
            {overrideActive ? "Pricing override active" : needsOverride ? "Pricing blocker detected" : "Pricing override available"}
          </h2>
          <p className="text-sm text-amber-100 mt-2 max-w-3xl">
            {overrideActive
              ? "This product is below the normal pricing threshold, but FandomForge has approved an exception."
              : "Pricing must cover costs unless a Super Admin override is approved. Artwork and other product requirements still apply."}
          </p>

          {overrideActive && (
            <div className="grid sm:grid-cols-3 gap-3 text-sm mt-4">
              <Info label="Reason" value={product.pricing_override_reason || "No reason saved"} />
              <Info label="By" value={product.pricing_override_by || "Unknown"} />
              <Info label="At" value={product.pricing_override_at ? new Date(product.pricing_override_at).toLocaleString() : "Unknown"} />
            </div>
          )}
        </div>

        {canOverride && (
          <div className="w-full lg:max-w-sm space-y-3">
            <label>
              <span className="label">{overrideActive ? "Removal reason" : "Reason"}</span>
              <textarea
                className="input-base"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Required for audit trail"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {overrideActive ? (
                <button type="button" className="btn-secondary" disabled={saving} onClick={() => onUpdate(false)}>
                  {saving ? "Saving..." : "Remove Override"}
                </button>
              ) : (
                <button type="button" className="btn-primary" disabled={saving} onClick={() => onUpdate(true)}>
                  {saving ? "Saving..." : "Approve Pricing Override"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function VariationPricingMatrix({
  variations = [],
  defaultSellingPrice = 0,
  updateDefaultSellingPrice,
  retailOverrides = {},
  updateVariationPrice,
  pricing = {},
  fundraisingAmount = "0",
  updateFundraisingAmount,
  pricingControl,
  loadingPricingControl = false,
  canManagePricingControl = false,
  savingManualPricing = false,
  onSaveManualPricing,
}) {
  const selectedVariations = asArray(variations);
  const adminRows = asArray(pricingControl?.variations);
  const rate = Number(pricing.rate || 0);
  const safeRate = Math.max(0, Math.min(rate, 0.95));
  const defaultFundraisingAmount = Math.max(Number(fundraisingAmount || 0), 0);
  const [applyToAll, setApplyToAll] = useState(false);

  const noProfitMinimum = (baseCost, printCost) => {
    const production = Number(baseCost || 0) + Number(printCost || 0);
    return safeRate >= 1 ? production : Math.ceil((production / (1 - safeRate)) * 100) / 100;
  };

  const retailForFundraising = (baseCost, printCost, desiredFundraising) => {
    const production = Number(baseCost || 0) + Number(printCost || 0);
    const desired = Math.max(Number(desiredFundraising || 0), 0);
    return safeRate >= 1
      ? Math.ceil((production + desired) * 100) / 100
      : Math.ceil(((production + desired) / (1 - safeRate)) * 100) / 100;
  };

  const creatorAmountForRetail = (retailPrice, baseCost, printCost) => {
    const price = Number(retailPrice || 0);
    const commission = price * safeRate;
    return Math.round((price - Number(baseCost || 0) - Number(printCost || 0) - commission) * 100) / 100;
  };

  const rows = useMemo(() => {
    const findAdminRow = (variation = {}) => {
      const keys = [variation.id, variation.template_variation_id, variation.sku, "default"].filter(Boolean).map(String);
      return adminRows.find((row) => keys.includes(String(row.variation_key || ""))) || null;
    };

    const buildRow = (variation = null, index = 0) => {
      const adminRow = variation ? findAdminRow(variation) : adminRows.find((row) => String(row.variation_key || "") === "default") || null;
      const key = variation?.id || variation?.template_variation_id || variation?.sku || "standard";
      const retailOverride = retailOverrides[key] ?? retailOverrides[variation?.template_variation_id] ?? "";
      const baseCost = Number(
        adminRow?.effective_base_product_cost ??
        adminRow?.calculated_base_product_cost ??
        (variation ? getVariationCost(variation, null) : pricing.blank) ??
        0
      );
      const printCost = Number(
        adminRow?.effective_print_cost ??
        adminRow?.calculated_print_cost ??
        pricing.print ??
        0
      );
      const retailPrice = retailOverride === "" || retailOverride === null || retailOverride === undefined
        ? Number(defaultSellingPrice || 0)
        : Number(retailOverride || 0);
      const minimumRetail = noProfitMinimum(baseCost, printCost);
      const effectiveRetailPrice = Math.max(Number(retailPrice || 0), minimumRetail);
      const creatorAmount = creatorAmountForRetail(effectiveRetailPrice, baseCost, printCost);

      return {
        key,
        isStandard: !variation,
        variation,
        adminRow,
        label: variation
          ? variation.label || Object.entries(variation.attributes || {}).map(([attr, value]) => `${attr}: ${value}`).join(" / ") || key
          : "Standard product",
        sublabel: variation?.sku || variation?.template_variation_id || (variation ? key : "No variations"),
        baseCost,
        printCost,
        retailPrice: effectiveRetailPrice,
        retailOverride,
        creatorAmount,
        minimumRetail,
        sortOrder: index,
      };
    };

    if (selectedVariations.length) {
      return selectedVariations.map((variation, index) => buildRow(variation, index));
    }

    return [buildRow(null, 0)];
  }, [adminRows, defaultSellingPrice, pricing.blank, pricing.print, retailOverrides, selectedVariations, safeRate]);

  const setRowRetail = (row, value) => {
    const raw = Number(value || 0);
    const clamped = Math.max(raw, row.minimumRetail);
    const next = Number.isFinite(clamped) ? clamped.toFixed(2) : row.minimumRetail.toFixed(2);

    if (row.isStandard) {
      updateDefaultSellingPrice?.(next);
      return;
    }

    updateVariationPrice?.(row.key, next);
  };

  const setRowFundraising = (row, value) => {
    const desired = Math.max(Number(value || 0), 0);
    const retail = retailForFundraising(row.baseCost, row.printCost, desired);
    setRowRetail(row, retail);
  };

  const applyRetailToAllRows = (value) => {
    rows.forEach((row) => setRowRetail(row, value));
  };

  const applyFundraisingToAllRows = (value) => {
    rows.forEach((row) => setRowFundraising(row, value));
  };

  const handleDefaultFundraisingChange = (value) => {
    updateFundraisingAmount?.(value);
    if (applyToAll) applyFundraisingToAllRows(value);
  };

  const handleDefaultRetailChange = (value) => {
    updateDefaultSellingPrice?.(value);
    if (applyToAll) applyRetailToAllRows(value);
  };

  const handleApplyToAllChange = (checked) => {
    setApplyToAll(checked);
    if (checked) applyRetailToAllRows(defaultSellingPrice);
  };

  const defaultMinimum = noProfitMinimum(Number(pricing.blank || 0), Number(pricing.print || 0));
  const defaultRetailValue = Math.max(Number(defaultSellingPrice || 0), defaultMinimum).toFixed(2);

  return (
    <section className="card w-full" data-testid="variation-pricing-matrix">
      <div className="p-5">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4 mb-5">
          <div>
            <div className="overline mb-2">Pricing Table</div>
            <h2 className="font-display text-3xl uppercase text-white">Variation pricing</h2>
            <p className="text-sm text-zinc-400 mt-2 max-w-4xl">
              Use one row for standard products or one row per variation. Base and print cost calculate automatically. Fundraising and retail price can be adjusted per row.
            </p>
          </div>

          {canManagePricingControl && (
            <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-amber-100">
              Admin manual pricing controls remain available after save
            </div>
          )}
        </div>

        {loadingPricingControl && canManagePricingControl ? (
          <div className="overline text-zinc-500">Loading pricing control...</div>
        ) : (
          <>
            <div className="mb-4 rounded-xl border border-white/10 bg-black/25 p-4">
              <div className="flex flex-col xl:flex-row xl:items-end gap-4">
                <div className="flex-1">
                  <div className="overline mb-2">Default pricing controls</div>
                  <p className="text-xs text-zinc-500 max-w-3xl">
                    Set the default fundraising amount and retail selling price. Use Apply to all to push the default retail price to every variation row.
                  </p>
                </div>

                <label className="block min-w-[190px]">
                  <span className="label">Default fundraising</span>
                  <input
                    className="input-base"
                    type="number"
                    step="0.01"
                    min="0"
                    value={fundraisingAmount}
                    onChange={(event) => handleDefaultFundraisingChange(event.target.value)}
                  />
                </label>

                <label className="block min-w-[190px]">
                  <span className="label">Default retail price</span>
                  <input
                    className="input-base"
                    type="number"
                    step="0.01"
                    min={defaultMinimum.toFixed(2)}
                    value={defaultRetailValue}
                    onChange={(event) => handleDefaultRetailChange(event.target.value)}
                  />
                  <span className="mt-1 block text-[10px] text-zinc-500">Minimum {money(defaultMinimum)}</span>
                </label>

                <label className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={applyToAll}
                    onChange={(event) => handleApplyToAllChange(event.target.checked)}
                  />
                  Apply retail price to all rows
                </label>
              </div>
            </div>

            <div className="w-full overflow-x-auto border border-white/10 rounded-xl">
            <table className="w-full min-w-[980px] text-xs">
              <colgroup>
                <col className="w-[280px]" />
                <col className="w-[130px]" />
                <col className="w-[140px]" />
                <col className="w-[210px]" />
                <col className="w-[260px]" />
                <col className="w-[160px]" />
              </colgroup>
              <thead>
                <tr className="text-left text-zinc-500 border-b border-white/10">
                  <th className="py-3 px-4 sticky left-0 z-10 bg-[#080808] whitespace-nowrap">Variation</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Base</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Print cost</th>
                  <th className="py-3 px-3 whitespace-nowrap">Fundraising amount</th>
                  <th className="py-3 px-3 whitespace-nowrap">Retail selling price</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Minimum</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const retailTooLow = Number(row.retailPrice || 0) < Number(row.minimumRetail || 0);
                  return (
                    <tr key={row.key} className="border-b border-white/5 align-top">
                      <td className="py-3 px-4 text-white sticky left-0 z-10 bg-[#080808]">
                        <div className="font-bold leading-snug">{row.label}</div>
                        <div className="text-[11px] text-zinc-500">{row.sublabel}</div>
                      </td>

                      <td className="py-3 px-3 text-right text-zinc-400 whitespace-nowrap">{money(row.baseCost)}</td>
                      <td className="py-3 px-3 text-right text-zinc-400 whitespace-nowrap">{money(row.printCost)}</td>

                      <td className="py-3 px-3">
                        <input
                          className="input-base w-[160px] text-xs"
                          type="number"
                          step="0.01"
                          min="0"
                          value={Math.max(Number(row.creatorAmount || 0), 0).toFixed(2)}
                          onChange={(event) => setRowFundraising(row, event.target.value)}
                        />
                        <div className="text-[10px] text-zinc-500 mt-1">Saved through row selling price</div>
                      </td>

                      <td className="py-3 px-3">
                        <input
                          className="input-base w-[150px] text-xs"
                          type="number"
                          step="0.01"
                          min={row.minimumRetail.toFixed(2)}
                          value={Number(row.retailPrice || 0).toFixed(2)}
                          onChange={(event) => setRowRetail(row, event.target.value)}
                        />
                        <div className={retailTooLow ? "text-[10px] text-[#FFB4B0] mt-1" : "text-[10px] text-zinc-500 mt-1"}>
                          Minimum {money(row.minimumRetail)}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right font-bold text-white whitespace-nowrap">{money(row.minimumRetail)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}

        <p className="text-xs text-zinc-500 mt-3">
          Retail prices cannot be lower than the amount needed to cover required costs. The final fee breakdown is shown on Review.
        </p>
      </div>
    </section>
  );
}

function PriceInput({ value, onChange, disabled = false }) {
  return (
    <input
      className="input-base w-[140px]"
      type="number"
      min="0"
      step="0.01"
      value={value ?? ""}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function CreatorPublishingPanel({ product, publishing, onPublish }) {
  const artworkStatus = getCreatorProductArtworkStatus(product);
  const published = isCreatorProductPublished(product);
  const pricingPending = needsCreatorPricingApproval(product);
  const readyToPublish = canPublishCreatorProduct(product);
  const rejectionReason = getCreatorProductRejectionReason(product);
  const pricingOverrideActive = Boolean(product?.pricing_override_approved);
  const manualPricingActive = Boolean(product?.manual_pricing_override_active);

  let heading = "Awaiting review";
  let copy = "This product is still waiting for artwork approval before it can be published.";
  let tone = "border-white/10 bg-black/25 text-zinc-300";

  if (published) {
    heading = "Published";
    copy = "This product is live in your store.";
    tone = "border-emerald-400/40 bg-emerald-500/10 text-emerald-100";
  } else if (readyToPublish) {
    heading = "Ready to publish";
    copy = artworkStatus === "approved"
      ? "Your artwork has been approved. Publish this product to make it available in your store."
      : "This product is ready to publish. Publish it to make it available in your store.";
    tone = "border-amber-400/60 bg-amber-500/10 text-amber-50";
  } else if (artworkStatus === "rejected") {
    heading = "Changes needed";
    copy = "This product needs changes before it can be published.";
    tone = "border-[#FF3B30]/50 bg-[#FF3B30]/10 text-[#FFB4B0]";
  } else if (pricingPending) {
    heading = "Awaiting review";
    copy = "This product is still waiting for pricing approval before it can be published.";
  }

  return (
    <section className={`mb-6 rounded-xl border p-5 ${tone}`} data-testid="creator-product-publishing-panel">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="overline mb-2">Publishing</div>
          <h2 className="font-display text-3xl uppercase text-white">{heading}</h2>
          <p className="text-sm mt-2 max-w-2xl">{copy}</p>
          {artworkStatus === "rejected" && rejectionReason && (
            <p className="text-xs mt-3 text-[#FFB4B0]">Reason: {rejectionReason}</p>
          )}
          {pricingOverrideActive && (
            <p className="text-xs mt-3 text-amber-100">
              Pricing approved by FandomForge. This product has a pricing override approved by the platform.
            </p>
          )}
          {manualPricingActive && (
            <p className="text-xs mt-3 text-amber-100">
              FandomForge has adjusted pricing for this product. Effective selling price: {money(product.effective_selling_price || product.selling_price)}.
            </p>
          )}
        </div>

        {readyToPublish && (
          <button type="button" className="btn-primary md:self-end" disabled={publishing} onClick={onPublish}>
            <Package size={14} /> {publishing ? "Publishing..." : "Publish Product"}
          </button>
        )}
      </div>
    </section>
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
