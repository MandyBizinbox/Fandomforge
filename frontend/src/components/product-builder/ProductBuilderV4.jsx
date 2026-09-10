import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { toast } from "sonner";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Package, Save, Star } from "lucide-react";
import { http, assetUrl } from "../../lib/api";
import { templateReadiness } from "../../lib/templateReadiness";
import {
  emitCreatorProductsReadyRefresh,
  canPublishCreatorProduct,
  isCreatorProductPublished,
  setCreatorProductPublished,
} from "../../lib/creatorProductPublishing";
import ProductVariationMatrix from "./ProductVariationMatrix";
import ArtworkScopeSelector from "./ArtworkScopeSelector";
import ScopedProductArtworkStudio from "./ScopedProductArtworkStudio";
import ScopedArtworkMockupGenerator from "./ScopedArtworkMockupGenerator";
import "./productBuilderV4.css";
import {
  asArray,
  buildProductVariations,
  buildStandardProductVariation,
  calculatePricing,
  createDefaultArtworkGroup,
  flattenArtworkGroups,
  getCreatorBlankPrice,
  getEnabledTemplateVariations,
  getPrimaryMockupFromGroups,
  getProductBuilderStorefrontGalleryCandidates,
  getSelectedVariations,
  getTemplateAvailableOptionsSummary,
  getTemplateImage,
  getTemplateShortDescription,
  getUniquePrintCostFromGroups,
  getVariationCost,
  money,
  resolveCreatorCommissionRate,
  resolveCreatorCommissionSource,
} from "./productBuilderUtils";

const STEPS = [
  { key: "basics", label: "1 Basics", title: "Basics", description: "Choose the product type and template, then edit the sellable product information." },
  { key: "variations", label: "2 Variations", title: "Variations", description: "Choose attribute values. FandomForge creates the actual combinations automatically." },
  { key: "artwork", label: "3 Artwork", title: "Artwork", description: "Create artwork scopes, then upload and place each artwork once." },
  { key: "mockups", label: "4 Mockups", title: "Mockups", description: "Generate one mockup per artwork scope and template view — not one per size." },
  { key: "pricing", label: "5 Pricing", title: "Pricing", description: "Price by the attribute that actually changes cost — normally size — instead of pricing every colour combination." },
  { key: "review", label: "6 Review & Publish", title: "Review & Publish", description: "Check the complete product before saving or publishing it." },
];

const EMPTY_ARTWORK = { original_url: "", file_name: "", mime_type: "", status: "pending_review" };
const EMPTY_PLACEMENT = { x: 0, y: 0, width: 0, height: 0, rotation: 0 };

function normalise(value) { return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"); }
function idKey(values) { return asArray(values).map(String).filter(Boolean).sort().join("|"); }
function isBuilderSelectableTemplate(template, globalPrintOptions = []) {
  return normalise(template?.status) === "active" && templateReadiness(template, globalPrintOptions).isLaunchReady;
}
function templateMatchesType(template, type) {
  if (!type) return true;
  const templateKeys = [template.product_type_id, template.product_type_slug, template.product_type_key, template.product_type, template.category, template.category_id, template.category_slug].map(normalise).filter(Boolean);
  const typeKeys = [type.id, type.slug, type.category, type.key, type.name].map(normalise).filter(Boolean);
  return templateKeys.some((key) => typeKeys.includes(key));
}
function resolveExistingVariationIds(existing, template) {
  const persisted = asArray(existing?.selected_template_variation_ids).map(String).filter(Boolean);
  if (persisted.length) return persisted;
  const available = new Set(asArray(template?.variations).map((variation) => String(variation?.id || variation?.template_variation_id || variation?.sku || "")).filter(Boolean));
  const inferred = asArray(existing?.variations)
    .map((variation) => String(variation?.template_variation_id || variation?.id || variation?.sku || ""))
    .filter(Boolean);
  return available.size ? inferred.filter((id) => available.has(id)) : inferred;
}
function resolveExistingProductType(existing, template, productTypes) {
  const types = asArray(productTypes);
  const templateTypeId = normalise(template?.product_type_id);
  if (templateTypeId) {
    const direct = types.find((row) => normalise(row.id) === templateTypeId);
    if (direct) return direct;
  }
  if (template) {
    const matched = types.find((row) => templateMatchesType(template, row));
    if (matched) return matched;
  }
  return types.find((row) => normalise(row.id) === normalise(existing?.product_type_id) || normalise(row.category) === normalise(existing?.category)) || null;
}
function getTemplateSpecs(template) {
  if (!template) return "";
  const value = template.specs ?? template.specifications ?? template.product_specs ?? template.features ?? template.specification_text ?? "";
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? item : `${item.label || item.name || "Spec"}: ${item.value ?? ""}`).join("\n");
  if (value && typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}: ${typeof item === "object" ? JSON.stringify(item) : item}`).join("\n");
  return String(value || "");
}
function getVariationLabel(variation) {
  if (!variation) return "Variation";
  if (variation.label) return variation.label;
  const attrs = variation.attributes || variation.attribute_values || {};
  const values = Object.values(attrs).filter((value) => value !== undefined && value !== null && String(value).trim() !== "");
  return values.length ? values.join(" / ") : variation.name || variation.sku || "Variation";
}
function getVariationAttributes(variation) { return variation?.attributes || variation?.attribute_values || variation?.options || {}; }
function getAttributeValue(variation, key) {
  const attrs = getVariationAttributes(variation);
  const entry = Object.entries(attrs).find(([name]) => normalise(name) === normalise(key));
  return entry ? entry[1] : "";
}
function inferPricingAttribute(variations) {
  const rows = asArray(variations);
  if (!rows.length) return "";
  const keys = Object.keys(getVariationAttributes(rows[0]));
  if (!keys.length) return "";
  const scored = keys.map((key) => {
    const values = new Set(rows.map((row) => String(getAttributeValue(row, key) || "")).filter(Boolean));
    const name = normalise(key);
    const sizeBonus = /(size|sizes|apparel-size|clothing-size)/.test(name) ? 100 : 0;
    const colourPenalty = /(color|colour|shade|finish)/.test(name) ? -20 : 0;
    return { key, count: values.size, score: sizeBonus + colourPenalty + Math.min(values.size, 50) };
  });
  return scored.sort((a, b) => b.score - a.score)[0]?.key || keys[0];
}
function getVariationId(variation) { return variation?.template_variation_id || variation?.id || variation?.sku; }
function getScopedPriceMap(variations, overrides, attribute) {
  const result = {};
  asArray(variations).forEach((variation) => {
    const id = getVariationId(variation);
    const value = getAttributeValue(variation, attribute);
    if (!id || !value) return;
    if (overrides?.[id] !== undefined && overrides[id] !== "") result[value] = overrides[id];
  });
  return result;
}
function expandScopedPrice(variations, attribute, value, price, current) {
  const next = { ...(current || {}) };
  asArray(variations).forEach((variation) => {
    const id = getVariationId(variation);
    if (!id) return;
    if (String(getAttributeValue(variation, attribute)) === String(value)) next[id] = price;
  });
  return next;
}
function expandUniformPrice(variations, price) {
  const next = {};
  asArray(variations).forEach((variation) => {
    const id = getVariationId(variation);
    if (id) next[id] = price;
  });
  return next;
}
function formatCostRange(costs) {
  const values = costs.map(Number).filter((value) => Number.isFinite(value));
  if (!values.length) return "—";
  const min = Math.min(...values);
  const max = Math.max(...values);
  return Math.abs(max - min) < 0.005 ? money(min) : `${money(min)} – ${money(max)}`;
}

export default function ProductBuilderV4({ mode = "creator", backTo = "/creator/products" }) {
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  const { user } = useAuth();
  const isAdmin = mode === "admin";
  const isNew = !routeId || routeId === "new";
  const [activeStep, setActiveStep] = useState("basics");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [product, setProduct] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [creators, setCreators] = useState([]);
  const [printOptions, setPrintOptions] = useState([]);
  const [creatorAccount, setCreatorAccount] = useState(null);
  const [selectedProductTypeId, setSelectedProductTypeId] = useState("");
  const [form, setForm] = useState({
    band_id: "", template_id: "", title: "", slug: "", description: "", specs: "", category: "", brand: "", active: true,
    selected_template_variation_ids: [], variation_price_overrides: {}, variation_pricing_mode: "by_attribute", selling_price: 0, published: false,
    artwork_groups: [], mockup_images: [], mockup_image_url: "", primary_mockup_image_url: "",
  });

  const selectedType = useMemo(() => productTypes.find((type) => type.id === selectedProductTypeId) || null, [productTypes, selectedProductTypeId]);
  const filteredTemplates = useMemo(() => templates.filter((template) => templateMatchesType(template, selectedType)), [templates, selectedType]);
  const selectedTemplate = useMemo(() => templates.find((template) => template.id === form.template_id) || null, [templates, form.template_id]);
  const availableVariations = useMemo(() => getEnabledTemplateVariations(selectedTemplate), [selectedTemplate]);
  const hasVariations = availableVariations.length > 0;
  const selectedVariations = useMemo(() => getSelectedVariations(selectedTemplate, form.selected_template_variation_ids), [selectedTemplate, form.selected_template_variation_ids]);
  const pricingAttribute = useMemo(() => inferPricingAttribute(selectedVariations), [selectedVariations]);
  const scopedPriceMap = useMemo(() => getScopedPriceMap(selectedVariations, form.variation_price_overrides, pricingAttribute), [selectedVariations, form.variation_price_overrides, pricingAttribute]);
  const blankCost = useMemo(() => selectedVariations.length ? Math.max(...selectedVariations.map((item) => getVariationCost(item, selectedTemplate))) : getCreatorBlankPrice(selectedTemplate), [selectedVariations, selectedTemplate]);
  const printCost = useMemo(() => getUniquePrintCostFromGroups(form.artwork_groups, printOptions, selectedTemplate), [form.artwork_groups, printOptions, selectedTemplate]);
  const commissionSource = useMemo(() => creatorAccount?.id ? creatorAccount : product, [creatorAccount, product]);
  const commissionRate = useMemo(() => resolveCreatorCommissionRate(commissionSource), [commissionSource]);
  const effectiveSellingPrice = useMemo(() => {
    if (form.variation_pricing_mode === "uniform") return Number(form.selling_price || 0);
    const values = Object.values(scopedPriceMap).map(Number).filter((value) => value > 0);
    return values.length ? Math.max(...values) : Number(form.selling_price || 0);
  }, [form.variation_pricing_mode, scopedPriceMap, form.selling_price]);
  const pricing = useMemo(() => calculatePricing({ sellingPrice: effectiveSellingPrice, blankCost, printCost, commissionRate, commissionSource, pricingOverrideApproved: Boolean(product?.pricing_override_approved) }), [blankCost, commissionRate, commissionSource, effectiveSellingPrice, printCost, product]);
  const artworkSlots = useMemo(() => form.artwork_groups.flatMap((group) => asArray(group.artworks)).filter((slot) => slot?.original_url), [form.artwork_groups]);
  const readyArtworkSlots = useMemo(() => artworkSlots.filter((slot) => slot.print_option_id), [artworkSlots]);
  const generatedMockups = useMemo(() => form.artwork_groups.flatMap((group) => asArray(group.variation_mockups)).filter((row) => row?.image_url), [form.artwork_groups]);
  const galleryCandidates = useMemo(() => getProductBuilderStorefrontGalleryCandidates(selectedTemplate, form.artwork_groups), [selectedTemplate, form.artwork_groups]);

  useEffect(() => { if (!isAdmin) http.get("/creators/me").then((response) => setCreatorAccount(response.data || null)).catch(() => {}); }, [isAdmin]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const requests = [http.get(isAdmin ? "/admin/product-templates" : "/product-templates"), http.get("/print-options"), http.get("/public/product-types?status=active")];
        if (isAdmin) requests.push(http.get("/admin/creators"));
        if (!isNew) requests.push(http.get(isAdmin ? `/admin/products/${routeId}` : `/products/${routeId}`));
        const responses = await Promise.all(requests);
        if (!mounted) return;
        const loadedTemplates = asArray(responses[0].data);
        const loadedPrintOptions = asArray(responses[1].data);
        const loadedProductTypes = asArray(responses[2].data);
        const selectableTemplates = loadedTemplates.filter((template) => isBuilderSelectableTemplate(template, loadedPrintOptions));
        let templatesForBuilder = selectableTemplates;
        setPrintOptions(loadedPrintOptions); setProductTypes(loadedProductTypes);
        let cursor = 3;
        if (isAdmin) { setCreators(asArray(responses[cursor].data)); cursor += 1; }
        if (!isNew) {
          const existing = responses[cursor].data;
          const existingTemplate = loadedTemplates.find((template) => String(template.id) === String(existing.template_id)) || null;
          if (existingTemplate && !selectableTemplates.some((template) => String(template.id) === String(existingTemplate.id))) {
            templatesForBuilder = [...selectableTemplates, existingTemplate];
          }
          const existingVariationIds = resolveExistingVariationIds(existing, existingTemplate);
          setProduct(existing);
          const groups = asArray(existing.artwork_groups).length ? asArray(existing.artwork_groups) : asArray(existing.artworks).length ? [{ ...createDefaultArtworkGroup(), artworks: asArray(existing.artworks), primary_mockup_image_url: existing.primary_mockup_image_url || existing.mockup_image_url || "" }] : [];
          const existingVariationPrices = Object.fromEntries(asArray(existing.variations).map((variation) => [variation.template_variation_id || variation.id || variation.sku, variation.price_override ?? ""]).filter(([key]) => key));
          const existingPriceValues = Object.values(existingVariationPrices).map(Number).filter((value) => Number.isFinite(value) && value > 0);
          const inferredUniformPricing = existingVariationPrices && existingPriceValues.length > 0 && new Set(existingPriceValues.map((value) => value.toFixed(2))).size === 1;
          setForm({
            band_id: existing.band_id || "", template_id: existing.template_id || "", title: existing.title || "", slug: existing.slug || "", description: existing.description || "", specs: existing.specs || "", category: existing.category || existingTemplate?.category || "", brand: existing.brand || existingTemplate?.brand || "", active: existing.active !== false,
            selected_template_variation_ids: existingVariationIds,
            variation_price_overrides: existingVariationPrices,
            variation_pricing_mode: existing.variation_pricing_mode || (inferredUniformPricing ? "uniform" : "by_attribute"),
            selling_price: existing.selling_price || (inferredUniformPricing ? existingPriceValues[0] : 0), published: Boolean(existing.published), artwork_groups: groups,
            mockup_images: asArray(existing.mockup_images), mockup_image_url: existing.mockup_image_url || "", primary_mockup_image_url: existing.primary_mockup_image_url || existing.mockup_image_url || "",
          });
          const type = resolveExistingProductType(existing, existingTemplate, loadedProductTypes);
          if (type) setSelectedProductTypeId(type.id);
        }
        setTemplates(templatesForBuilder);
      } catch (error) { toast.error(error.response?.data?.detail || "Could not load product builder"); }
      finally { if (mounted) setLoading(false); }
    }
    load(); return () => { mounted = false; };
  }, [isAdmin, isNew, routeId]);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const chooseType = (typeId) => {
    if (String(typeId) === String(selectedProductTypeId)) return;
    const type = productTypes.find((row) => row.id === typeId); setSelectedProductTypeId(typeId);
    setForm((current) => ({ ...current, template_id: "", selected_template_variation_ids: [], variation_price_overrides: {}, variation_pricing_mode: "by_attribute", selling_price: 0, artwork_groups: [], mockup_images: [], mockup_image_url: "", primary_mockup_image_url: "", category: type?.category || current.category, specs: "" }));
  };
  const chooseTemplate = (template) => {
    if (String(template?.id || "") === String(form.template_id || "")) return;
    const templateSpecs = getTemplateSpecs(template);
    setForm((current) => ({ ...current, template_id: template.id, selected_template_variation_ids: [], variation_price_overrides: {}, variation_pricing_mode: "by_attribute", selling_price: 0, artwork_groups: [], mockup_images: [], mockup_image_url: "", primary_mockup_image_url: "", title: current.title || template.name || "", description: current.description || template.description || "", specs: templateSpecs || current.specs || "", category: template.category || current.category }));
  };
  const setVariations = (ids) => setForm((current) => {
    const nextIds = asArray(ids).map(String).filter(Boolean);
    if (idKey(nextIds) === idKey(current.selected_template_variation_ids)) return current;
    return {
      ...current,
      selected_template_variation_ids: nextIds,
      variation_price_overrides: Object.fromEntries(Object.entries(current.variation_price_overrides || {}).filter(([key]) => nextIds.includes(String(key)))),
      // Artwork is creator work, not disposable variation UI state. Preserve it
      // when the variation set changes; scope tools can reconcile membership.
      artwork_groups: current.artwork_groups,
      mockup_images: current.mockup_images,
      mockup_image_url: current.mockup_image_url,
      primary_mockup_image_url: current.primary_mockup_image_url,
    };
  });
  const setScopedPrice = (attributeValue, price) => {
    const nextOverrides = expandScopedPrice(selectedVariations, pricingAttribute, attributeValue, price, form.variation_price_overrides);
    setForm((current) => ({ ...current, variation_pricing_mode: "by_attribute", variation_price_overrides: nextOverrides, selling_price: Number(price || 0) > 0 ? Number(price) : current.selling_price }));
  };
  const setUniformPrice = (price) => {
    const numeric = Number(price || 0);
    setForm((current) => ({ ...current, variation_pricing_mode: "uniform", variation_price_overrides: expandUniformPrice(selectedVariations, price), selling_price: numeric > 0 ? numeric : price }));
  };
  const setPricingMode = (mode) => {
    if (mode === "uniform") {
      const currentPrice = Number(form.selling_price || Object.values(scopedPriceMap).map(Number).find((value) => value > 0) || 0);
      setUniformPrice(currentPrice);
      return;
    }
    setForm((current) => ({ ...current, variation_pricing_mode: "by_attribute" }));
  };
  const setArtworkGroups = (groups) => {
    const flattened = flattenArtworkGroups(groups); const primary = flattened.find((slot) => slot.original_url) || flattened[0] || null; const generatedPrimary = getPrimaryMockupFromGroups(groups);
    const candidates = getProductBuilderStorefrontGalleryCandidates(selectedTemplate, groups).map((item) => item.url).filter(Boolean);
    setForm((current) => {
      const retained = asArray(current.mockup_images).filter((url) => candidates.includes(url)); const images = retained.length ? retained : candidates;
      const primaryMockup = [current.primary_mockup_image_url, current.mockup_image_url, generatedPrimary, images[0]].find((url) => url && images.includes(url)) || images[0] || "";
      return { ...current, artwork_groups: groups, mockup_images: images, mockup_image_url: primaryMockup, primary_mockup_image_url: primaryMockup, artwork: primary?.original_url ? { original_url: primary.original_url, file_name: primary.file_name || "artwork", mime_type: primary.mime_type || "", status: primary.status || (isAdmin ? "approved" : "pending_review") } : EMPTY_ARTWORK, placement: primary?.placement || EMPTY_PLACEMENT };
    });
  };

  const validateStep = (key) => {
    if (key === "basics") { if (!form.title.trim()) return "Enter a product name."; if (!selectedProductTypeId) return "Select a product type."; if (!form.template_id) return "Select a template."; }
    if (key === "variations" && hasVariations && !form.selected_template_variation_ids.length) return "Select at least one attribute combination.";
    if (key === "artwork") { if (!form.artwork_groups.length) return "Create at least one artwork scope."; if (!readyArtworkSlots.length) return "Upload artwork and assign a print method."; }
    if (key === "mockups" && !generatedMockups.length) return "Generate at least one artwork-scope mockup.";
    if (key === "pricing" && !effectiveSellingPrice) return "Set at least one scoped selling price.";
    return null;
  };
  const goToStep = (key) => { const targetIndex = STEPS.findIndex((step) => step.key === key); const currentIndex = STEPS.findIndex((step) => step.key === activeStep); if (targetIndex > currentIndex) { for (let index = currentIndex; index < targetIndex; index += 1) { const error = validateStep(STEPS[index].key); if (error) { toast.error(error); return; } } } setActiveStep(key); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const nextStep = () => { const index = STEPS.findIndex((step) => step.key === activeStep); const error = validateStep(activeStep); if (error) { toast.error(error); return; } if (index < STEPS.length - 1) goToStep(STEPS[index + 1].key); };
  const prevStep = () => { const index = STEPS.findIndex((step) => step.key === activeStep); if (index > 0) setActiveStep(STEPS[index - 1].key); };

  const buildPayload = () => {
    const primary = form.artwork_groups.flatMap((group) => asArray(group.artworks)).find((slot) => slot?.original_url) || null;
    const baseVariations = hasVariations ? buildProductVariations(selectedTemplate, form.selected_template_variation_ids, form.variation_price_overrides) : [buildStandardProductVariation(selectedTemplate)];
    const mockupMap = new Map();
    form.artwork_groups.flatMap((group) => asArray(group.variation_mockups)).filter((mockup) => mockup?.image_url).forEach((mockup) => { const ids = asArray(mockup.variation_ids).length ? asArray(mockup.variation_ids) : [mockup.variation_id]; ids.filter(Boolean).forEach((id) => mockupMap.set(id, [...(mockupMap.get(id) || []), mockup])); });
    const variations = baseVariations.map((variation) => { const mockups = mockupMap.get(variation.template_variation_id || variation.id) || []; return { ...variation, variation_mockups: mockups, mockup_images: mockups.map((item) => item.image_url).filter(Boolean), mockup_image_url: mockups[0]?.image_url || "", primary_mockup_image_url: mockups[0]?.image_url || "" }; });
    const selectedGallery = asArray(form.mockup_images).filter(Boolean); const primaryMockup = selectedGallery.includes(form.primary_mockup_image_url) ? form.primary_mockup_image_url : selectedGallery[0] || getPrimaryMockupFromGroups(form.artwork_groups) || ""; const mockupImages = primaryMockup ? [primaryMockup, ...selectedGallery.filter((url) => url !== primaryMockup)] : selectedGallery;
    return { ...(isAdmin ? { band_id: form.band_id } : {}), template_id: form.template_id, title: form.title.trim(), slug: form.slug.trim(), description: form.description || "", specs: form.specs || "", category: form.category || selectedTemplate?.category || "", brand: form.brand || "", active: form.active !== false, selling_price: Number(form.selling_price || 0), variation_pricing_mode: form.variation_pricing_mode, print_cost: pricing.print, mockup_images: mockupImages, mockup_image_url: primaryMockup, primary_mockup_image_url: primaryMockup, variations, attribute_ids: asArray(selectedTemplate?.attribute_ids), spec_attributes: {}, customization_enabled: false, published: isAdmin ? Boolean(form.published) : false, publish_on_approval: false, selected_template_variation_ids: form.selected_template_variation_ids, selected_print_area_id: primary?.print_area_id || "", selected_print_option_id: primary?.print_option_id || "", artwork: primary?.original_url ? { original_url: primary.original_url, file_name: primary.file_name || "artwork", mime_type: primary.mime_type || "", status: primary.status || (isAdmin ? "approved" : "pending_review") } : EMPTY_ARTWORK, artworks: flattenArtworkGroups(form.artwork_groups), artwork_groups: form.artwork_groups, placement: primary?.placement || EMPTY_PLACEMENT, estimated_blank_cost: pricing.blank, estimated_print_cost: pricing.print, estimated_total_cost: pricing.production, commission_rate: pricing.rate, estimated_commission: pricing.commission, estimated_creator_profit: pricing.profit };
  };
  const publishCreator = async (target) => { if (!target?.id) return; setPublishing(true); try { const response = await setCreatorProductPublished(target.id, true); setProduct(response?.data || { ...target, published: true }); update("published", true); toast.success("Product published"); } catch (error) { toast.error(error.response?.data?.detail || "Could not publish product"); } finally { setPublishing(false); } };
  const save = async ({ publish = false } = {}) => {
    const error = ["basics", "variations", "artwork", "mockups", "pricing"].map(validateStep).find(Boolean); if (error) { toast.error(error); return false; }
    const payload = buildPayload(); if (publish && !isAdmin && !canPublishCreatorProduct(product || payload)) { toast.error("This creator product cannot be published until its review requirements are complete."); return false; }
    setSaving(true);
    try { const response = isNew ? await http.post(isAdmin ? "/admin/products" : "/products", payload) : await http.put(isAdmin ? `/admin/products/${routeId}` : `/products/${routeId}`, payload); const saved = response.data; setProduct(saved); if (!isAdmin) emitCreatorProductsReadyRefresh(); if (isNew) navigate(isAdmin ? `/admin/products/${saved.id}` : `/creator/products/${saved.id}`, { replace: true }); toast.success(isNew ? "Product created" : "Product saved"); if (publish && !isAdmin && saved.id) await publishCreator(saved); return true; } catch (err) { toast.error(err.response?.data?.detail || "Could not save product"); return false; } finally { setSaving(false); }
  };
  const toggleGalleryImage = (url) => { const selected = new Set(asArray(form.mockup_images)); if (selected.has(url)) selected.delete(url); else selected.add(url); const images = [...selected]; const primary = images.includes(form.primary_mockup_image_url) ? form.primary_mockup_image_url : images[0] || ""; update("mockup_images", images); update("mockup_image_url", primary); update("primary_mockup_image_url", primary); };
  const stepIndex = STEPS.findIndex((step) => step.key === activeStep);
  const readyToPublish = pricing.canPublishWithOverride && readyArtworkSlots.length > 0 && generatedMockups.length > 0 && Boolean(form.template_id);
  if (loading) return <div className="product-builder-shell min-h-[calc(100vh-120px)] flex items-center justify-center"><div className="text-sm pb4-muted">Loading product builder…</div></div>;
  return <div className="product-builder-shell min-h-[calc(100vh-120px)]" data-testid={`${mode}-product-builder-v4`}>
    <header className="pb4-header"><div><div className="overline mb-1">{isAdmin ? "Admin Product Builder" : "Creator Product Builder"}</div><h1 className="font-display text-4xl md:text-5xl leading-none uppercase">{form.title || (isNew ? "New Product" : "Edit Product")}</h1><p className="text-sm pb4-muted mt-2">One clean flow: product → attributes → artwork scopes → mockups → price.</p></div><button type="button" className="btn-secondary !px-4 !py-2 text-xs" onClick={() => navigate(backTo)}><ArrowLeft size={13} /> Back</button></header>
    <nav className="pb4-step-nav" aria-label="Product builder steps"><div className="pb4-step-nav__inner">{STEPS.map((step, index) => { const active = step.key === activeStep; const complete = index < stepIndex; return <button key={step.key} type="button" onClick={() => goToStep(step.key)} className={`pb4-step-tab ${active ? "is-active" : complete ? "is-complete" : ""}`}>{complete && <Check size={12} className="inline mr-1" />}{step.label}</button>; })}</div></nav>
    <div className="pb4-step-summary"><div className="pb4-step-summary__eyebrow">Step {stepIndex + 1} of {STEPS.length}</div><div className="pb4-step-summary__title">{STEPS[stepIndex].title}</div><div className="pb4-step-summary__copy">{STEPS[stepIndex].description}</div></div>
    <main className="product-builder-main min-w-0">
      {activeStep === "basics" && <BasicsStep form={form} update={update} productTypes={productTypes} selectedProductTypeId={selectedProductTypeId} chooseType={chooseType} templates={filteredTemplates} selectedTemplate={selectedTemplate} chooseTemplate={chooseTemplate} creators={creators} isAdmin={isAdmin} product={product} />}
      {activeStep === "variations" && <VariationsStep template={selectedTemplate} selectedIds={form.selected_template_variation_ids} onChange={setVariations} hasVariations={hasVariations} />}
      {activeStep === "artwork" && <ArtworkStep template={selectedTemplate} printOptions={printOptions} artworkGroups={form.artwork_groups} onArtworkGroupsChange={setArtworkGroups} selectedVariations={selectedVariations} isAdmin={isAdmin} />}
      {activeStep === "mockups" && <MockupsStep template={selectedTemplate} artworkGroups={form.artwork_groups} selectedVariations={selectedVariations} onArtworkGroupsChange={setArtworkGroups} candidates={galleryCandidates} selectedImages={form.mockup_images} primaryImage={form.primary_mockup_image_url} toggleImage={toggleGalleryImage} setPrimary={(url) => { update("primary_mockup_image_url", url); update("mockup_image_url", url); }} generatedMockups={generatedMockups} />}
      {activeStep === "pricing" && <PricingStep form={form} update={update} pricing={pricing} selectedVariations={selectedVariations} pricingAttribute={pricingAttribute} scopedPriceMap={scopedPriceMap} setScopedPrice={setScopedPrice} setUniformPrice={setUniformPrice} setPricingMode={setPricingMode} isAdmin={isAdmin} />}
      {activeStep === "review" && <ReviewStep form={form} selectedType={selectedType} selectedTemplate={selectedTemplate} selectedVariations={selectedVariations} readyArtworkSlots={readyArtworkSlots} generatedMockups={generatedMockups} pricing={pricing} readyToPublish={readyToPublish} isAdmin={isAdmin} saving={saving} publishing={publishing} save={save} product={product} publishCreator={publishCreator} />}
    </main>
    <footer className="pb4-footer"><button type="button" className="builder-nav-button builder-nav-button-secondary" onClick={prevStep} disabled={stepIndex === 0}><ChevronLeft size={15} /> Previous</button><button type="button" className="builder-nav-button builder-nav-button-save" onClick={() => save()} disabled={saving}><Save size={14} /> Save</button>{stepIndex < STEPS.length - 1 ? <button type="button" className="builder-nav-button builder-nav-button-primary" onClick={nextStep}>Next <ChevronRight size={15} /></button> : <button type="button" className="builder-nav-button builder-nav-button-primary" onClick={() => save({ publish: true })} disabled={saving || publishing || !readyToPublish}>{isAdmin ? "Save & Publish" : "Submit / Publish"}</button>}</footer>
  </div>;
}

function BasicsStep({ form, update, productTypes, selectedProductTypeId, chooseType, templates, selectedTemplate, chooseTemplate, creators, isAdmin, product }) {
  const selectedType = productTypes.find((type) => String(type.id) === String(selectedProductTypeId)) || null;
  return <div className="space-y-6"><section className="card space-y-5">
    <div><div className="overline mb-1">Product basics</div><p className="text-sm pb4-muted">Start with a product type. Matching templates appear next, and full template information only opens after you choose one.</p></div>
    {isAdmin && <Field label="Creator"><select className="input-base" value={form.band_id} onChange={(e) => update("band_id", e.target.value)} disabled={Boolean(product?.band_id)}><option value="">Select creator</option>{creators.map((creator) => <option key={creator.id} value={creator.id}>{creator.name}</option>)}</select></Field>}

    <section className="pb4-selection-stage" aria-labelledby="pb4-select-type-title">
      <div className="pb4-selection-stage__header"><div><div className="pb4-selection-stage__step">1</div><div><div id="pb4-select-type-title" className="overline">Select type</div><div className="pb4-selection-stage__title">What are you making?</div></div></div>{selectedType && <div className="pb4-selection-stage__status">{selectedType.name}</div>}</div>
      <div className="pb4-type-grid">{productTypes.map((type) => { const selected = String(selectedProductTypeId) === String(type.id); return <button key={type.id} type="button" aria-pressed={selected} onClick={() => chooseType(type.id)} className={`pb4-type-card ${selected ? "is-selected" : ""}`}><span>{type.name}</span>{selected && <Check size={13} />}</button>; })}</div>
    </section>

    {selectedProductTypeId ? <section className="pb4-selection-stage is-open" aria-labelledby="pb4-select-template-title">
      <div className="pb4-selection-stage__header"><div><div className="pb4-selection-stage__step">2</div><div><div id="pb4-select-template-title" className="overline">Choose template</div><div className="pb4-selection-stage__title">{selectedType?.name || "Matching products"}</div></div></div><div className="pb4-selection-stage__status">{templates.length} option{templates.length === 1 ? "" : "s"}</div></div>
      {templates.length ? <div className="pb4-template-browser">
        <div className="pb4-template-grid">{templates.map((template) => { const selected = selectedTemplate?.id === template.id; const image = getTemplateImage(template); return <button key={template.id} type="button" aria-pressed={selected} onClick={() => chooseTemplate(template)} className={`pb4-template-card ${selected ? "is-selected" : ""}`}><div className="pb4-template-card__image">{image ? <img src={assetUrl(image)} alt={template.name} /> : <Package size={24} className="pb4-muted" />}</div><div className="pb4-template-card__body"><div className="pb4-template-card__title">{template.name}</div><div className="pb4-template-card__meta"><span>{money(getCreatorBlankPrice(template))}</span><span>{asArray(template.print_areas).length} print area{asArray(template.print_areas).length === 1 ? "" : "s"}</span></div>{selected && <div className="pb4-selected-label">Selected</div>}</div></button>; })}</div>
        {selectedTemplate ? <aside className="pb4-template-detail" aria-live="polite"><div className="pb4-template-detail__hero">{getTemplateImage(selectedTemplate) ? <img src={assetUrl(getTemplateImage(selectedTemplate))} alt={selectedTemplate.name} /> : <Package size={42} className="pb4-muted" />}</div><div className="pb4-template-detail__content"><div className="overline mb-1">Selected template</div><h3 className="pb4-template-detail__title">{selectedTemplate.name}</h3><p className="pb4-template-detail__description">{getTemplateShortDescription(selectedTemplate)}</p><div className="pb4-template-detail__stats"><Info label="Base" value={money(getCreatorBlankPrice(selectedTemplate))} /><Info label="Print areas" value={String(asArray(selectedTemplate.print_areas).length)} /><Info label="Options" value={getTemplateAvailableOptionsSummary(selectedTemplate).join(" · ") || "Configured"} /><Info label="Production" value={String(asArray(selectedTemplate.production_methods || selectedTemplate.print_options).length || "Configured")} /></div></div></aside> : <div className="pb4-template-detail pb4-template-detail--empty"><Package size={28} /><div><div className="font-bold">Choose a template</div><div className="text-sm pb4-muted mt-1">Select one of the compact cards to open its product information here.</div></div></div>}
      </div> : <div className="pb4-empty-state">No active templates are available for this product type.</div>}
    </section> : <div className="pb4-empty-state">Select a product type above to open its available templates.</div>}

    {selectedTemplate && <section className="pb4-selection-stage is-open" aria-labelledby="pb4-product-info-title">
      <div className="pb4-selection-stage__header"><div><div className="pb4-selection-stage__step">3</div><div><div id="pb4-product-info-title" className="overline">Product information</div><div className="pb4-selection-stage__title">Make it sellable</div></div></div></div>
      <div className="grid md:grid-cols-2 gap-4"><Field label="Product name"><input className="input-base" value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="Creator logo hoodie" /></Field><Field label="Slug"><input className="input-base" value={form.slug} onChange={(e) => update("slug", e.target.value)} placeholder="creator-logo-hoodie" /></Field></div>
      <div className="grid md:grid-cols-2 gap-4"><Field label="Category"><input className="input-base" value={form.category} onChange={(e) => update("category", e.target.value)} /></Field><Field label="Brand"><input className="input-base" value={form.brand} onChange={(e) => update("brand", e.target.value)} placeholder="FandomForge" /></Field></div>
      <Field label="Description"><textarea className="input-base" rows={5} value={form.description} onChange={(e) => update("description", e.target.value)} /></Field>
      <Field label="Specs / features — editable"><textarea className="input-base" rows={8} value={form.specs} onChange={(e) => update("specs", e.target.value)} placeholder="Template specs will appear here…" /></Field>
      <label className="flex items-center gap-3 text-sm text-[var(--ff-card-text)]"><input type="checkbox" checked={form.active !== false} onChange={(e) => update("active", e.target.checked)} /> Active product</label>
    </section>}
  </section></div>;
}
function VariationsStep({ template, selectedIds, onChange, hasVariations }) { return <div className="space-y-5"><ProductVariationMatrix template={template} selectedIds={selectedIds} onChange={onChange} hasTemplateVariations={hasVariations} /></div>; }
function ArtworkStep({ template, printOptions, artworkGroups, onArtworkGroupsChange, selectedVariations, isAdmin }) { return <div className="space-y-6"><ArtworkScopeSelector selectedVariations={selectedVariations} hasTemplateVariations={Boolean(asArray(template?.variations).length)} groups={artworkGroups} onChange={onArtworkGroupsChange} /><div className="pb4-divider"><ScopedProductArtworkStudio template={template} printOptions={printOptions} artworkGroups={artworkGroups} onArtworkGroupsChange={onArtworkGroupsChange} selectedVariations={selectedVariations} isAdmin={isAdmin} /></div></div>; }
function MockupsStep({ template, artworkGroups, selectedVariations, onArtworkGroupsChange, candidates, selectedImages, primaryImage, toggleImage, setPrimary, generatedMockups }) { return <div className="space-y-6"><ScopedArtworkMockupGenerator template={template} artworkGroups={artworkGroups} selectedVariations={selectedVariations} onArtworkGroupsChange={onArtworkGroupsChange} /><section className="card"><div className="overline mb-1">Storefront gallery</div><p className="text-sm pb4-muted">Select which template and artwork-scope images appear on the storefront. One generated image can represent every size inside its artwork scope.</p><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">{candidates.map((candidate) => { const url = candidate.url; const selected = selectedImages.includes(url); const primary = primaryImage === url; return <button key={`${url}-${candidate.key || candidate.id || "image"}`} type="button" onClick={() => toggleImage(url)} className={`pb4-gallery-card ${selected ? "is-selected" : ""}`}><img src={assetUrl(url)} alt={candidate.label || "Product mockup"} className="pb4-gallery-image" /><div className="pb4-gallery-caption"><div className="pb4-gallery-title text-xs font-bold">{candidate.label || "Mockup"}</div><div className="pb4-gallery-meta">{selected ? "Selected for storefront" : "Not selected"}</div></div>{selected && <span className="pb4-gallery-badge">Selected</span>}{primary && <span className="pb4-gallery-primary">Primary</span>}<span className="absolute bottom-14 right-2"><span onClick={(event) => { event.stopPropagation(); setPrimary(url); }} className="pb4-gallery-action"><Star size={10} /> Make primary</span></span></button>; })}</div>{!candidates.length && <div className="pb4-empty-state mt-4">Generate an artwork-scope mockup first.</div>}<div className="mt-5 text-xs pb4-muted">Generated images: {generatedMockups.length}. Storefront images selected: {selectedImages.length}.</div></section></div>; }

function PricingStep({ form, update, pricing, selectedVariations, pricingAttribute, scopedPriceMap, setScopedPrice, setUniformPrice, setPricingMode, isAdmin }) {
  const values = useMemo(() => [...new Set(asArray(selectedVariations).map((variation) => String(getAttributeValue(variation, pricingAttribute) || "")).filter(Boolean))], [selectedVariations, pricingAttribute]);
  const productionByValue = useMemo(() => values.map((value) => {
    const matching = asArray(selectedVariations).filter((variation) => String(getAttributeValue(variation, pricingAttribute)) === String(value));
    const costs = matching.map((variation) => Number(getVariationCost(variation, null)) + Number(pricing.print || 0));
    return { value, costs, production: formatCostRange(costs), maxProduction: costs.length ? Math.max(...costs) : 0 };
  }), [selectedVariations, pricingAttribute, values, pricing.print]);
  const uniformPrice = Number(form.selling_price || 0);
  const currentScopedPrice = (value) => Number(scopedPriceMap[value] || 0);
  return <div className="space-y-6">
    <section className="card">
      <div className="overline mb-1">Scoped variation pricing</div>
      <h2 className="text-2xl font-display uppercase mt-1">Price by {pricingAttribute || "attribute"}</h2>
      <p className="text-sm pb4-muted mt-2">Choose one simple pricing rule. Production cost is shown separately because different sizes can cost FandomForge different amounts to manufacture.</p>
      <div className="mt-5 grid sm:grid-cols-2 gap-3">
        <button type="button" onClick={() => setPricingMode("by_attribute")} className={`text-left rounded-xl border p-4 transition ${form.variation_pricing_mode !== "uniform" ? "border-emerald-400 bg-emerald-500/10" : "border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)]"}`}>
          <div className="font-bold text-[var(--ff-card-text)]">Price by {pricingAttribute || "attribute"}</div>
          <div className="text-xs pb4-muted mt-1">Different sizes can have different selling prices.</div>
        </button>
        <button type="button" onClick={() => setPricingMode("uniform")} className={`text-left rounded-xl border p-4 transition ${form.variation_pricing_mode === "uniform" ? "border-emerald-400 bg-emerald-500/10" : "border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)]"}`}>
          <div className="font-bold text-[var(--ff-card-text)]">Same price for all sizes</div>
          <div className="text-xs pb4-muted mt-1">One selling price is applied to every selected variation.</div>
        </button>
      </div>

      {form.variation_pricing_mode === "uniform" ? <div className="mt-5 border border-[var(--ff-card-border)] rounded-xl p-4 bg-[var(--ff-surface-bg)]">
        <div className="text-xs uppercase tracking-widest pb4-muted">Selling price for every selected variation</div>
        <div className="flex items-center gap-2 mt-2"><span className="pb4-muted">R</span><input className="input-base max-w-xs text-xl font-bold" type="number" min="0" step="0.01" value={uniformPrice || ""} onChange={(event) => setUniformPrice(event.target.value)} placeholder="0.00" /></div>
        <div className="text-xs pb4-muted mt-2">Colours and sizes all use this same selling price. Production cost remains variation-specific below.</div>
      </div> : pricingAttribute ? <div className="mt-5 space-y-2">
        {productionByValue.map(({ value, production, maxProduction }) => {
          const selling = currentScopedPrice(value);
          const margin = selling > 0 ? selling - maxProduction : 0;
          return <div key={value} className="grid lg:grid-cols-[1fr_auto_auto] items-center gap-4 border border-[var(--ff-card-border)] rounded-xl p-3 bg-[var(--ff-surface-bg)]">
            <div><div className="font-bold text-[var(--ff-card-text)]">{value}</div><div className="text-[10px] uppercase tracking-widest pb4-muted">Applies to every selected variation with {pricingAttribute} = {value}</div></div>
            <div className="text-right"><div className="text-[10px] uppercase tracking-widest pb4-muted">Production cost</div><div className="font-bold text-amber-200">{production}</div><div className="text-[10px] pb4-muted">highest cost used for safety: {money(maxProduction)}</div></div>
            <div className="flex items-center gap-2"><span className="pb4-muted">R</span><input aria-label={`${value} selling price`} className="input-base w-32 text-right font-bold" type="number" min="0" step="0.01" value={scopedPriceMap[value] ?? ""} onChange={(event) => setScopedPrice(value, event.target.value)} placeholder="0.00" /></div>
            {selling > 0 && <div className={`lg:col-start-2 lg:col-span-2 text-xs ${margin >= 0 ? "text-emerald-300" : "text-red-300"}`}>Selling price {money(selling)} {margin >= 0 ? "covers" : "is below"} the highest production cost by {money(Math.abs(margin))} before platform/commission costs.</div>}
          </div>;
        })}
      </div> : <div className="mt-5 flex items-center gap-2"><span className="pb4-muted">R</span><input className="input-base max-w-xs text-xl font-bold" type="number" min="0" step="0.01" value={form.selling_price} onChange={(e) => update("selling_price", e.target.value)} /></div>}
      <div className="mt-5 grid sm:grid-cols-3 gap-3"><Info label="Selected variations" value={String(selectedVariations.length || 1)} /><Info label="Pricing rules" value={String(form.variation_pricing_mode === "uniform" ? 1 : values.length || 1)} /><Info label="Resolved variation prices" value={String(Object.keys(form.variation_price_overrides || {}).length || (selectedVariations.length ? selectedVariations.length : 1))} /></div>
    </section>
    <section className="card"><div className="overline mb-1">Live economics</div><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4"><Metric label="Highest base cost" value={money(pricing.blank)} /><Metric label="Printing" value={money(pricing.print)} /><Metric label="Highest production total" value={money(pricing.production)} /><Metric label="Platform / commission" value={money(pricing.commission)} /></div><div className="mt-5 border border-[var(--ff-card-border)] rounded-xl p-5"><div className="text-xs uppercase tracking-widest pb4-muted">Representative selling price</div><div className="text-2xl font-bold text-[var(--ff-card-text)] mt-2">{money(effectiveRepresentativePrice(form, scopedPriceMap))}</div><div className={`mt-3 text-lg font-bold ${pricing.profit >= 0 ? "text-emerald-300" : "text-red-300"}`}>Creator / fundraising amount: {money(pricing.profit)}</div><div className="text-xs pb4-muted mt-1">Minimum profitable price: {money(pricing.minimumSellingPrice || 0)}</div></div></section>
    {isAdmin && <label className="card flex items-center gap-3 text-sm"><input type="checkbox" checked={form.published} onChange={(e) => update("published", e.target.checked)} /> Publish when saved</label>}
  </div>;
}
function effectiveRepresentativePrice(form, scopedPriceMap) { if (form.variation_pricing_mode === "uniform") return Number(form.selling_price || 0); const values = Object.values(scopedPriceMap).map(Number).filter((value) => value > 0); return values.length ? Math.max(...values) : Number(form.selling_price || 0); }

function ReviewStep({ form, product, selectedType, selectedTemplate, selectedVariations, readyArtworkSlots, generatedMockups, pricing, readyToPublish, isAdmin, saving, publishing, save, publishCreator }) {
  const published = Boolean(product && isCreatorProductPublished(product));
  return <div className="space-y-6"><section className="card"><div className="overline mb-1">Final product check</div><div className="grid md:grid-cols-2 gap-4 mt-5"><Info label="Product" value={form.title || "Untitled"} /><Info label="Type" value={selectedType?.name || form.category || "Not selected"} /><Info label="Template" value={selectedTemplate?.name || "Not selected"} /><Info label="Variations" value={selectedVariations.length ? `${selectedVariations.length} selected` : "Standard product"} /><Info label="Artwork scopes" value={`${asArray(form.artwork_groups).length}`} /><Info label="Artwork ready" value={`${readyArtworkSlots.length}`} /><Info label="Mockups" value={`${generatedMockups.length} generated`} /><Info label="Storefront gallery" value={`${form.mockup_images.length} selected`} /><Info label="Selling price" value={money(effectiveRepresentativePrice(form, getScopedPriceMap(selectedVariations, form.variation_price_overrides, inferPricingAttribute(selectedVariations))))} /></div></section><section className="card"><div className="overline mb-3">Readiness</div><Checklist done={Boolean(form.title.trim()) && Boolean(selectedType)} label="Product basics complete" /><Checklist done={Boolean(form.template_id)} label="Template selected and specs loaded" /><Checklist done={!asArray(selectedTemplate?.variations).length || selectedVariations.length > 0} label="Attribute combinations selected" /><Checklist done={readyArtworkSlots.length > 0} label="Artwork uploaded and routed" /><Checklist done={generatedMockups.length > 0} label="Artwork-scope mockups generated" /><Checklist done={form.mockup_images.length > 0} label="Storefront gallery selected" /><Checklist done={pricing.canPublishWithOverride} label="Pricing covers required costs" /></section><section className="card"><div className="overline mb-3">Action</div>{isAdmin ? <button type="button" className="btn-primary" disabled={saving} onClick={() => save({ publish: true })}>Save & Publish</button> : published ? <div className="text-sm text-emerald-300">Product is published.</div> : <div className="flex flex-wrap gap-3"><button type="button" className="btn-primary" disabled={saving} onClick={() => save()}>Save Product</button><button type="button" className="btn-secondary" disabled={saving || publishing || !readyToPublish} onClick={() => save({ publish: true })}>{publishing ? "Publishing…" : "Save & Submit / Publish"}</button></div>}{!readyToPublish && !isAdmin && <div className="text-xs pb4-muted mt-3">Complete artwork, scope mockups and profitable pricing before publishing.</div>}</section></div>;
}
function Field({ label, children }) { return <div><label className="label">{label}</label>{children}</div>; }
function Info({ label, value }) { return <div className="pb4-info-card"><div className="pb4-info-label">{label}</div><div className="pb4-info-value">{value || "—"}</div></div>; }
function Metric({ label, value }) { return <div className="pb4-info-card pb4-metric-card"><div className="pb4-info-label">{label}</div><div className="pb4-metric-value">{value}</div></div>; }
function Checklist({ done, label }) { return <div className={`pb4-check ${done ? "is-done" : ""}`}><span className="pb4-check__icon">{done && <Check size={12} />}</span><span>{label}</span></div>; }
