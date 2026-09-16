import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  DollarSign,
  Eye,
  Image as ImageIcon,
  Images,
  Info,
  Layers,
  Package,
  Palette,
  Pencil,
  Save,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { assetUrl, http } from "../../lib/api";
import {
  canPublishCreatorProduct,
  emitCreatorProductsReadyRefresh,
  isCreatorProductPublished,
  setCreatorProductPublished,
} from "../../lib/creatorProductPublishing";
import { templateReadiness } from "../../lib/templateReadiness";
import ScopedProductArtworkStudio from "./ScopedProductArtworkStudio";
import ScopedArtworkMockupGenerator from "./ScopedArtworkMockupGenerator";
import CreatorArtworkScopesPanel from "./CreatorArtworkScopesPanel";
import CreatorLayersPanel from "./CreatorLayersPanel";
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
  getUniquePrintCostFromGroups,
  getVariationCost,
  money,
  resolveCreatorCommissionRate,
  resolveCreatorCommissionSource,
} from "./productBuilderUtils";
import {
  buildCreatorProductDraftFromTemplate,
  collectStudioAttributeOptions,
  creatorStudioBackPath,
  creatorTemplateSpecs,
  deriveStudioVariationIds,
  inferStudioPricingAttribute,
  normaliseStudioValue,
  seedStudioSelections,
  studioArray,
  studioVariationAttributes,
  studioVariationId,
} from "./creatorProductStudioUtils";
import "./creatorProductStudio.css";

const EMPTY_ARTWORK = { original_url: "", file_name: "", mime_type: "", status: "pending_review" };
const EMPTY_PLACEMENT = { x: 0, y: 0, width: 0, height: 0, rotation: 0 };

function resolveExistingVariationIds(existing, template) {
  const persisted = asArray(existing?.selected_template_variation_ids).map(String).filter(Boolean);
  if (persisted.length) return persisted;
  const available = new Set(asArray(template?.variations).map((variation) => studioVariationId(variation)).filter(Boolean));
  const inferred = asArray(existing?.variations)
    .map((variation) => String(variation?.template_variation_id || variation?.id || variation?.sku || ""))
    .filter(Boolean);
  return available.size ? inferred.filter((id) => available.has(id)) : inferred;
}

function getAttributeValue(variation, key) {
  const attrs = studioVariationAttributes(variation);
  const entry = Object.entries(attrs).find(([name]) => normaliseStudioValue(name) === normaliseStudioValue(key));
  return entry ? entry[1] : "";
}

function getScopedPriceMap(variations, overrides, attribute) {
  const result = {};
  asArray(variations).forEach((variation) => {
    const id = studioVariationId(variation);
    const value = getAttributeValue(variation, attribute);
    if (!id || !value) return;
    if (overrides?.[id] !== undefined && overrides[id] !== "") result[value] = overrides[id];
  });
  return result;
}

function expandScopedPrice(variations, attribute, value, price, current) {
  const next = { ...(current || {}) };
  asArray(variations).forEach((variation) => {
    const id = studioVariationId(variation);
    if (!id) return;
    if (String(getAttributeValue(variation, attribute)) === String(value)) next[id] = price;
  });
  return next;
}

function expandUniformPrice(variations, price) {
  const next = {};
  asArray(variations).forEach((variation) => {
    const id = studioVariationId(variation);
    if (id) next[id] = price;
  });
  return next;
}

function selectableTemplate(template, printOptions) {
  return normaliseStudioValue(template?.status) === "active" && templateReadiness(template, printOptions).isLaunchReady;
}

function findColourHex(variations, attributeKey, value) {
  const match = studioArray(variations).find((variation) => (
    normaliseStudioValue(getAttributeValue(variation, attributeKey)) === normaliseStudioValue(value)
  ));
  const candidates = [
    match?.colour_hex,
    match?.color_hex,
    match?.hex,
    match?.swatch_hex,
    match?.attributes?.colour_hex,
    match?.attributes?.color_hex,
  ];
  const hex = candidates.find((candidate) => /^#[0-9a-f]{6}$/i.test(String(candidate || "")));
  return hex || "";
}

function templateImage(template) {
  const source = template || {};
  return source.creator_catalogue_thumbnail_url
    || source.primary_image
    || source.product_image_url
    || source.mockup_url
    || asArray(source.mockup_images)[0]
    || asArray(source.mockup_screens).find((screen) => screen?.image_url)?.image_url
    || "";
}

function StudioAccordion({ title, icon: Icon, open, onToggle, summary, children }) {
  return (
    <section className={`creator-studio-accordion ${open ? "is-open" : ""}`}>
      <button type="button" className="creator-studio-accordion-head" onClick={onToggle}>
        <span className="creator-studio-accordion-title"><Icon size={15} /> {title}</span>
        <span className="creator-studio-accordion-summary">{summary}</span>
        <ChevronDown size={15} className="creator-studio-accordion-chevron" />
      </button>
      {open && <div className="creator-studio-accordion-body">{children}</div>}
    </section>
  );
}

function StudioField({ label, children, hint }) {
  return (
    <label className="creator-studio-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function ReadinessItem({ done, children }) {
  return <div className={`creator-studio-ready-row ${done ? "is-done" : ""}`}><span>{done && <Check size={11} />}</span>{children}</div>;
}

export default function CreatorProductStudio({ mode = "creator", backTo }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: routeId } = useParams();
  const isAdmin = mode === "admin";
  const isNew = !routeId || routeId === "new";
  const resolvedBackTo = backTo || (isAdmin ? "/admin/products" : "/creator/products");
  const catalogueTemplateId = useMemo(() => (
    isNew ? new URLSearchParams(location.search).get("template") || "" : ""
  ), [isNew, location.search]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [product, setProduct] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [creators, setCreators] = useState([]);
  const [printOptions, setPrintOptions] = useState([]);
  const [creatorAccount, setCreatorAccount] = useState(null);
  const [workspace, setWorkspace] = useState("design");
  const [viewMode, setViewMode] = useState("edit");
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [scopeMatrixOpen, setScopeMatrixOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [mockupsOpen, setMockupsOpen] = useState(false);
  const [activeArtworkGroupId, setActiveArtworkGroupId] = useState("");
  const [activeArtworkSlotId, setActiveArtworkSlotId] = useState("");
  const [scopePrompted, setScopePrompted] = useState(false);
  const [templateInfoOpen, setTemplateInfoOpen] = useState(true);
  const [variantsOpen, setVariantsOpen] = useState(true);
  const [pricingOpen, setPricingOpen] = useState(true);
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [selectedValues, setSelectedValues] = useState({});
  const [form, setForm] = useState({
    band_id: "",
    template_id: "",
    title: "",
    slug: "",
    description: "",
    specs: "",
    material_composition: "",
    care_instructions: "",
    fit_notes: "",
    category: "",
    brand: "",
    active: true,
    published: false,
    selected_template_variation_ids: [],
    variation_price_overrides: {},
    variation_pricing_mode: "by_attribute",
    selling_price: 0,
    artwork_groups: [],
    mockup_images: [],
    mockup_image_url: "",
    primary_mockup_image_url: "",
  });

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!isAdmin && isNew && !catalogueTemplateId) {
        navigate("/creator?section=catalogue", { replace: true });
        return;
      }

      setLoading(true);
      try {
        const requests = [
          http.get(isAdmin ? "/admin/product-templates" : "/product-templates"),
          http.get("/print-options"),
          isAdmin ? http.get("/admin/creators") : http.get("/creators/me"),
        ];
        if (!isNew) requests.push(http.get(isAdmin ? `/admin/products/${routeId}` : `/products/${routeId}`));
        const responses = await Promise.all(requests);
        if (!mounted) return;

        const loadedTemplates = asArray(responses[0].data);
        const loadedPrintOptions = asArray(responses[1].data);
        const thirdResponse = responses[2].data;
        const creator = isAdmin ? null : thirdResponse || null;
        const loadedCreators = isAdmin ? asArray(thirdResponse) : [];
        const launchReady = loadedTemplates.filter((template) => selectableTemplate(template, loadedPrintOptions));
        let templatesForStudio = launchReady;
        let selected = null;
        let existing = null;

        if (isNew) {
          selected = catalogueTemplateId
            ? launchReady.find((template) => String(template.id) === String(catalogueTemplateId)) || null
            : null;
          if (!isAdmin && !selected) {
            toast.error("That catalogue product is no longer available.");
            navigate("/creator?section=catalogue", { replace: true });
            return;
          }
        } else {
          existing = responses[3].data;
          selected = loadedTemplates.find((template) => String(template.id) === String(existing.template_id)) || null;
          if (selected && !launchReady.some((template) => String(template.id) === String(selected.id))) {
            templatesForStudio = [...launchReady, selected];
          }
        }

        setTemplates(templatesForStudio);
        setPrintOptions(loadedPrintOptions);
        setCreatorAccount(creator);
        setCreators(loadedCreators);

        if (isNew && selected) {
          const initialIds = asArray(selected.default_selected_variation_ids || selected.default_variation_ids).map(String).filter(Boolean);
          const enabled = getEnabledTemplateVariations(selected);
          const productDraft = buildCreatorProductDraftFromTemplate(selected);
          setSelectedValues(seedStudioSelections(enabled, initialIds));
          setForm((current) => ({
            ...current,
            ...productDraft,
            selected_template_variation_ids: initialIds,
          }));
        }

        if (!isNew && existing) {
          const existingTemplate = selected;
          const existingVariationIds = resolveExistingVariationIds(existing, existingTemplate);
          const groups = asArray(existing.artwork_groups).length
            ? asArray(existing.artwork_groups)
            : asArray(existing.artworks).length
              ? [{
                  ...createDefaultArtworkGroup(),
                  artworks: asArray(existing.artworks),
                  primary_mockup_image_url: existing.primary_mockup_image_url || existing.mockup_image_url || "",
                }]
              : [];
          const existingVariationPrices = Object.fromEntries(
            asArray(existing.variations)
              .map((variation) => [variation.template_variation_id || variation.id || variation.sku, variation.price_override ?? ""])
              .filter(([key]) => key)
          );
          const existingPriceValues = Object.values(existingVariationPrices).map(Number).filter((value) => Number.isFinite(value) && value > 0);
          const inferredUniformPricing = existingPriceValues.length > 0 && new Set(existingPriceValues.map((value) => value.toFixed(2))).size === 1;
          const enabled = getEnabledTemplateVariations(existingTemplate);
          const templateDraft = buildCreatorProductDraftFromTemplate(existingTemplate || {});

          setProduct(existing);
          setSelectedValues(seedStudioSelections(enabled, existingVariationIds));
          setForm({
            band_id: existing.band_id || "",
            template_id: existing.template_id || "",
            title: existing.title || "",
            slug: existing.slug || "",
            description: existing.description || templateDraft.description || "",
            specs: existing.specs || templateDraft.specs || "",
            material_composition: existing.material_composition || templateDraft.material_composition || "",
            care_instructions: existing.care_instructions || templateDraft.care_instructions || "",
            fit_notes: existing.fit_notes || templateDraft.fit_notes || "",
            category: existing.category || existingTemplate?.category || "",
            brand: existing.brand || existingTemplate?.brand || "",
            active: existing.active !== false,
            published: Boolean(existing.published),
            selected_template_variation_ids: existingVariationIds,
            variation_price_overrides: existingVariationPrices,
            variation_pricing_mode: existing.variation_pricing_mode || (inferredUniformPricing ? "uniform" : "by_attribute"),
            selling_price: existing.selling_price || (inferredUniformPricing ? existingPriceValues[0] : 0),
            artwork_groups: groups,
            mockup_images: asArray(existing.mockup_images),
            mockup_image_url: existing.mockup_image_url || "",
            primary_mockup_image_url: existing.primary_mockup_image_url || existing.mockup_image_url || "",
          });
        }
      } catch (error) {
        toast.error(error.response?.data?.detail || "Could not load the product studio");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [catalogueTemplateId, isAdmin, isNew, navigate, routeId]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => String(template.id) === String(form.template_id)) || null,
    [templates, form.template_id]
  );
  const availableVariations = useMemo(() => getEnabledTemplateVariations(selectedTemplate), [selectedTemplate]);
  const attributeOptions = useMemo(() => collectStudioAttributeOptions(availableVariations), [availableVariations]);
  const selectedVariations = useMemo(
    () => getSelectedVariations(selectedTemplate, form.selected_template_variation_ids),
    [selectedTemplate, form.selected_template_variation_ids]
  );
  const pricingAttribute = useMemo(() => inferStudioPricingAttribute(selectedVariations), [selectedVariations]);
  const scopedPriceMap = useMemo(
    () => getScopedPriceMap(selectedVariations, form.variation_price_overrides, pricingAttribute),
    [selectedVariations, form.variation_price_overrides, pricingAttribute]
  );
  const blankCost = useMemo(
    () => selectedVariations.length
      ? Math.max(...selectedVariations.map((variation) => getVariationCost(variation, selectedTemplate)))
      : getCreatorBlankPrice(selectedTemplate),
    [selectedVariations, selectedTemplate]
  );
  const printCost = useMemo(
    () => getUniquePrintCostFromGroups(form.artwork_groups, printOptions, selectedTemplate),
    [form.artwork_groups, printOptions, selectedTemplate]
  );
  const assignedCreator = useMemo(
    () => isAdmin ? creators.find((creator) => String(creator.id) === String(form.band_id)) || null : creatorAccount,
    [creatorAccount, creators, form.band_id, isAdmin]
  );
  const commissionSource = useMemo(() => assignedCreator?.id ? assignedCreator : product, [assignedCreator, product]);
  const commissionRate = useMemo(() => resolveCreatorCommissionRate(commissionSource), [commissionSource]);
  const effectiveSellingPrice = useMemo(() => {
    if (form.variation_pricing_mode === "uniform") return Number(form.selling_price || 0);
    const values = Object.values(scopedPriceMap).map(Number).filter((value) => value > 0);
    return values.length ? Math.max(...values) : Number(form.selling_price || 0);
  }, [form.variation_pricing_mode, form.selling_price, scopedPriceMap]);
  const pricing = useMemo(() => calculatePricing({
    sellingPrice: effectiveSellingPrice,
    blankCost,
    printCost,
    commissionRate,
    commissionSource,
    pricingOverrideApproved: Boolean(product?.pricing_override_approved),
  }), [blankCost, commissionRate, commissionSource, effectiveSellingPrice, printCost, product]);
  const artworkSlots = useMemo(
    () => form.artwork_groups.flatMap((group) => asArray(group.artworks)).filter((slot) => slot?.original_url),
    [form.artwork_groups]
  );
  const readyArtworkSlots = useMemo(() => artworkSlots.filter((slot) => slot.print_option_id), [artworkSlots]);
  const generatedMockups = useMemo(
    () => form.artwork_groups.flatMap((group) => asArray(group.variation_mockups)).filter((row) => row?.image_url),
    [form.artwork_groups]
  );
  const galleryCandidates = useMemo(
    () => getProductBuilderStorefrontGalleryCandidates(selectedTemplate, form.artwork_groups),
    [selectedTemplate, form.artwork_groups]
  );
  const hasVariations = availableVariations.length > 0;
  const hasSelectedVariations = !hasVariations || form.selected_template_variation_ids.length > 0;
  const readyToSave = Boolean(form.title.trim())
    && Boolean(form.template_id)
    && (!isAdmin || Boolean(form.band_id))
    && hasSelectedVariations
    && readyArtworkSlots.length > 0
    && generatedMockups.length > 0
    && effectiveSellingPrice > 0;

  useEffect(() => {
    if (loading || scopePrompted || form.artwork_groups.length) return;
    if (form.selected_template_variation_ids.length <= 1) return;
    setDetailsOpen(false);
    setLayersOpen(false);
    setMockupsOpen(false);
    setScopeMatrixOpen(true);
    setScopePrompted(true);
  }, [loading, scopePrompted, form.artwork_groups.length, form.selected_template_variation_ids.length]);

  useEffect(() => {
    if (!form.artwork_groups.length) {
      setActiveArtworkGroupId("");
      setActiveArtworkSlotId("");
      return;
    }
    if (!form.artwork_groups.some((group) => group.id === activeArtworkGroupId)) {
      setActiveArtworkGroupId(form.artwork_groups[0].id);
    }
  }, [activeArtworkGroupId, form.artwork_groups]);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const chooseAdminTemplate = (templateId) => {
    if (!isAdmin || !isNew) return;
    const selected = templates.find((template) => String(template.id) === String(templateId)) || null;
    if (!selected) {
      setSelectedValues({});
      setForm((current) => ({
        ...current,
        template_id: "",
        title: "",
        description: "",
        specs: "",
        material_composition: "",
        care_instructions: "",
        fit_notes: "",
        category: "",
        brand: "",
        selected_template_variation_ids: [],
        variation_price_overrides: {},
        selling_price: 0,
        artwork_groups: [],
        mockup_images: [],
        mockup_image_url: "",
        primary_mockup_image_url: "",
      }));
      return;
    }

    const initialIds = asArray(selected.default_selected_variation_ids || selected.default_variation_ids).map(String).filter(Boolean);
    const enabled = getEnabledTemplateVariations(selected);
    const draft = buildCreatorProductDraftFromTemplate(selected);
    setSelectedValues(seedStudioSelections(enabled, initialIds));
    setForm((current) => ({
      ...current,
      ...draft,
      band_id: current.band_id,
      slug: "",
      published: current.published,
      selected_template_variation_ids: initialIds,
      variation_price_overrides: {},
      variation_pricing_mode: "by_attribute",
      selling_price: 0,
      artwork_groups: [],
      mockup_images: [],
      mockup_image_url: "",
      primary_mockup_image_url: "",
    }));
    setActiveArtworkGroupId("");
    setActiveArtworkSlotId("");
    setScopePrompted(false);
  };

  const toggleAttributeValue = (key, value) => {
    const next = { ...selectedValues, [key]: studioArray(selectedValues[key]) };
    const values = new Set(next[key]);
    if (values.has(value)) values.delete(value); else values.add(value);
    next[key] = [...values];
    setSelectedValues(next);
    const ids = deriveStudioVariationIds(availableVariations, next);
    setForm((current) => ({
      ...current,
      selected_template_variation_ids: ids,
      variation_price_overrides: Object.fromEntries(
        Object.entries(current.variation_price_overrides || {}).filter(([id]) => ids.includes(String(id)))
      ),
    }));
  };

  const selectAllAttributeValues = (key, values) => {
    const next = { ...selectedValues, [key]: [...values] };
    setSelectedValues(next);
    const ids = deriveStudioVariationIds(availableVariations, next);
    setForm((current) => ({ ...current, selected_template_variation_ids: ids }));
  };

  const setArtworkGroups = (groups) => {
    const flattened = flattenArtworkGroups(groups);
    const primary = flattened.find((slot) => slot.original_url) || flattened[0] || null;
    const generatedPrimary = getPrimaryMockupFromGroups(groups);
    const candidates = getProductBuilderStorefrontGalleryCandidates(selectedTemplate, groups).map((item) => item.url).filter(Boolean);
    setForm((current) => {
      const retained = asArray(current.mockup_images).filter((url) => candidates.includes(url));
      const images = retained.length ? retained : candidates;
      const primaryMockup = [current.primary_mockup_image_url, current.mockup_image_url, generatedPrimary, images[0]]
        .find((url) => url && images.includes(url)) || images[0] || "";
      return {
        ...current,
        artwork_groups: groups,
        mockup_images: images,
        mockup_image_url: primaryMockup,
        primary_mockup_image_url: primaryMockup,
        artwork: primary?.original_url ? {
          original_url: primary.original_url,
          file_name: primary.file_name || "artwork",
          mime_type: primary.mime_type || "",
          status: primary.status || (isAdmin ? "approved" : "pending_review"),
        } : EMPTY_ARTWORK,
        placement: primary?.placement || EMPTY_PLACEMENT,
      };
    });
  };

  const setScopedPrice = (attributeValue, price) => {
    const nextOverrides = expandScopedPrice(
      selectedVariations,
      pricingAttribute,
      attributeValue,
      price,
      form.variation_price_overrides
    );
    setForm((current) => ({
      ...current,
      variation_pricing_mode: "by_attribute",
      variation_price_overrides: nextOverrides,
      selling_price: Number(price || 0) > 0 ? Number(price) : current.selling_price,
    }));
  };

  const setUniformPrice = (price) => {
    const numeric = Number(price || 0);
    setForm((current) => ({
      ...current,
      variation_pricing_mode: "uniform",
      variation_price_overrides: expandUniformPrice(selectedVariations, price),
      selling_price: numeric > 0 ? numeric : price,
    }));
  };

  const setPricingMode = (nextMode) => {
    if (nextMode === "uniform") {
      const currentPrice = Number(
        form.selling_price || Object.values(scopedPriceMap).map(Number).find((value) => value > 0) || 0
      );
      setUniformPrice(currentPrice);
      return;
    }
    setForm((current) => ({ ...current, variation_pricing_mode: "by_attribute" }));
  };

  const toggleGalleryImage = (url) => {
    const selected = new Set(asArray(form.mockup_images));
    if (selected.has(url)) selected.delete(url); else selected.add(url);
    const images = [...selected];
    const primary = images.includes(form.primary_mockup_image_url) ? form.primary_mockup_image_url : images[0] || "";
    setForm((current) => ({
      ...current,
      mockup_images: images,
      mockup_image_url: primary,
      primary_mockup_image_url: primary,
    }));
  };

  const buildPayload = () => {
    const primary = form.artwork_groups.flatMap((group) => asArray(group.artworks)).find((slot) => slot?.original_url) || null;
    const baseVariations = hasVariations
      ? buildProductVariations(selectedTemplate, form.selected_template_variation_ids, form.variation_price_overrides)
      : [buildStandardProductVariation(selectedTemplate)];
    const mockupMap = new Map();
    form.artwork_groups
      .flatMap((group) => asArray(group.variation_mockups))
      .filter((mockup) => mockup?.image_url)
      .forEach((mockup) => {
        const ids = asArray(mockup.variation_ids).length ? asArray(mockup.variation_ids) : [mockup.variation_id];
        ids.filter(Boolean).forEach((id) => mockupMap.set(id, [...(mockupMap.get(id) || []), mockup]));
      });
    const variations = baseVariations.map((variation) => {
      const mockups = mockupMap.get(variation.template_variation_id || variation.id) || [];
      return {
        ...variation,
        variation_mockups: mockups,
        mockup_images: mockups.map((item) => item.image_url).filter(Boolean),
        mockup_image_url: mockups[0]?.image_url || "",
        primary_mockup_image_url: mockups[0]?.image_url || "",
      };
    });
    const selectedGallery = asArray(form.mockup_images).filter(Boolean);
    const primaryMockup = selectedGallery.includes(form.primary_mockup_image_url)
      ? form.primary_mockup_image_url
      : selectedGallery[0] || getPrimaryMockupFromGroups(form.artwork_groups) || "";
    const mockupImages = primaryMockup
      ? [primaryMockup, ...selectedGallery.filter((url) => url !== primaryMockup)]
      : selectedGallery;

    return {
      ...(isAdmin ? { band_id: form.band_id } : {}),
      template_id: form.template_id,
      title: form.title.trim(),
      slug: form.slug.trim(),
      description: form.description || "",
      specs: form.specs || "",
      material_composition: form.material_composition || "",
      care_instructions: form.care_instructions || "",
      fit_notes: form.fit_notes || "",
      category: form.category || selectedTemplate?.category || "",
      brand: form.brand || "",
      active: form.active !== false,
      selling_price: Number(form.selling_price || 0),
      variation_pricing_mode: form.variation_pricing_mode,
      print_cost: pricing.print,
      mockup_images: mockupImages,
      mockup_image_url: primaryMockup,
      primary_mockup_image_url: primaryMockup,
      variations,
      attribute_ids: asArray(selectedTemplate?.attribute_ids),
      spec_attributes: {},
      customization_enabled: false,
      published: isAdmin ? Boolean(form.published) : false,
      publish_on_approval: false,
      ...(!isAdmin ? {
        review_submission_status: "draft",
        review_submitted_at: null,
      } : {}),
      selected_template_variation_ids: form.selected_template_variation_ids,
      selected_print_area_id: primary?.print_area_id || "",
      selected_print_option_id: primary?.print_option_id || "",
      artwork: primary?.original_url ? {
        original_url: primary.original_url,
        file_name: primary.file_name || "artwork",
        mime_type: primary.mime_type || "",
        status: primary.status || (isAdmin ? "approved" : "pending_review"),
      } : EMPTY_ARTWORK,
      artworks: flattenArtworkGroups(form.artwork_groups),
      artwork_groups: form.artwork_groups,
      placement: primary?.placement || EMPTY_PLACEMENT,
      estimated_blank_cost: pricing.blank,
      estimated_print_cost: pricing.print,
      estimated_total_cost: pricing.production,
      commission_rate: pricing.rate,
      estimated_commission: pricing.commission,
      estimated_creator_profit: pricing.profit,
    };
  };

  const validateDraft = () => {
    if (isAdmin && !form.band_id) return "Choose the creator who owns this product.";
    if (!form.title.trim()) return "Add a product title in Product details.";
    if (!form.template_id) return isAdmin ? "Choose a Catalogue template." : "Choose a product from the Catalogue.";
    return null;
  };

  const validateReview = () => {
    const draftError = validateDraft();
    if (draftError) return draftError;
    if (hasVariations && !form.selected_template_variation_ids.length) return "Choose at least one variant.";
    if (!form.artwork_groups.length || !readyArtworkSlots.length) return "Add artwork and choose a print method.";
    if (!generatedMockups.length) return "Generate at least one mockup.";
    if (!effectiveSellingPrice) return "Set a selling price.";
    return null;
  };

  const persistDraft = async ({ redirect = true, quiet = false } = {}) => {
    const error = validateDraft();
    if (error) {
      toast.error(error);
      return null;
    }
    setSaving(true);
    try {
      const payload = isAdmin
        ? buildPayload()
        : {
            ...buildPayload(),
            review_submission_status: "draft",
            review_submitted_at: null,
            published: false,
          };
      const response = isAdmin
        ? (isNew
            ? await http.post("/admin/products", payload)
            : await http.put(`/admin/products/${routeId}`, payload))
        : (isNew
            ? await http.post("/products", payload)
            : await http.patch(`/products/${routeId}`, payload));
      const saved = response.data;
      setProduct(saved);
      if (!isAdmin) emitCreatorProductsReadyRefresh();
      if (!quiet) toast.success(isAdmin ? (isNew ? "Product created" : "Product saved") : (isNew ? "Draft created" : "Draft saved"));
      if (isAdmin && isNew) {
        navigate(`/admin/products/${saved.id}`, { replace: true });
      } else if (!isAdmin && redirect) {
        navigate("/creator/products", { replace: true });
      }
      return saved;
    } catch (error) {
      toast.error(error.response?.data?.detail || (isAdmin ? "Could not save product" : "Could not save draft"));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = async () => {
    await persistDraft({ redirect: !isAdmin });
  };

  const sendForReview = async () => {
    if (isAdmin) return;
    const error = validateReview();
    if (error) {
      toast.error(error);
      return;
    }
    setSubmittingReview(true);
    try {
      const saved = await persistDraft({ redirect: false, quiet: true });
      if (!saved?.id) return;
      const response = await http.post(`/products/${saved.id}/submit-review`);
      setProduct(response.data);
      emitCreatorProductsReadyRefresh();
      toast.success(product?.artwork_review_status === "rejected" ? "Product resubmitted for review" : "Product sent for review");
      navigate("/creator/products", { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not send product for review");
    } finally {
      setSubmittingReview(false);
    }
  };

  const publish = async () => {
    if (isAdmin) return;
    if (!product?.id) {
      await persistDraft({ redirect: true });
      return;
    }
    if (!canPublishCreatorProduct(product)) {
      toast.error("This product is not ready to publish yet. Complete review requirements first.");
      return;
    }
    setPublishing(true);
    try {
      const response = await setCreatorProductPublished(product.id, true);
      setProduct(response?.data || { ...product, published: true });
      toast.success("Product published");
      navigate("/creator/products", { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not publish product");
    } finally {
      setPublishing(false);
    }
  };

  const backPath = isAdmin
    ? resolvedBackTo
    : isNew && catalogueTemplateId
      ? creatorStudioBackPath(catalogueTemplateId)
      : resolvedBackTo;
  const selectedImage = form.primary_mockup_image_url || form.mockup_image_url || templateImage(selectedTemplate);
  const published = isAdmin ? Boolean(form.published) : isCreatorProductPublished(product || {});
  const reviewSubmissionStatus = product?.review_submission_status || "draft";
  const reviewPending = !isAdmin && reviewSubmissionStatus === "submitted" && product?.artwork_review_status === "pending_review";
  const reviewRejected = !isAdmin && product?.artwork_review_status === "rejected";
  const reviewApproved = !isAdmin && product?.artwork_review_status === "approved";
  const reviewStatusLabel = isAdmin
    ? (published ? "Live" : "Admin draft")
    : published
      ? "Live"
      : reviewPending
        ? "In review"
        : reviewRejected
          ? "Changes requested"
          : reviewApproved
            ? "Approved"
            : readyToSave
              ? "Ready for review"
              : "Draft";
  const priceValues = pricingAttribute
    ? [...new Set(selectedVariations.map((variation) => String(getAttributeValue(variation, pricingAttribute) || "")).filter(Boolean))]
    : [];

  if (loading) {
    return <div className="creator-product-studio creator-product-studio-loading"><div>Opening product studio…</div></div>;
  }

  return (
    <div className="creator-product-studio" data-testid={isAdmin ? "admin-product-studio" : "creator-product-studio"}>
      <header className="creator-studio-topbar">
        <button type="button" className="creator-studio-icon-button" onClick={() => navigate(backPath)} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <div className="creator-studio-topbar-product">
          <span>{isAdmin ? (isNew ? "Create admin product" : "Edit admin product") : (isNew ? "Create product" : "Edit product")}</span>
          <strong>{form.title || selectedTemplate?.name || "Untitled product"}</strong>
        </div>
        <div className="creator-studio-topbar-mode" role="tablist" aria-label="Studio mode">
          <button type="button" className={viewMode === "edit" ? "is-active" : ""} onClick={() => !reviewPending && setViewMode("edit")} disabled={reviewPending}><Pencil size={14} /> Edit</button>
          <button type="button" className={viewMode === "preview" ? "is-active" : ""} onClick={() => setViewMode("preview")}><Eye size={14} /> Preview</button>
        </div>
        <div className="creator-studio-topbar-actions">
          <span className={`creator-studio-save-state ${readyToSave && !reviewPending ? "is-ready" : ""}`}>{reviewStatusLabel}</span>
          {isAdmin ? (
            <button type="button" className="btn-primary creator-studio-save" onClick={saveDraft} disabled={saving}>
              <Save size={14} /> {saving ? "Saving…" : "Save product"}
            </button>
          ) : !reviewPending ? (
            <>
              <button type="button" className="btn-secondary creator-studio-save creator-studio-save-draft" onClick={saveDraft} disabled={saving || submittingReview}>
                <Save size={14} /> {saving ? "Saving…" : "Save draft"}
              </button>
              <button type="button" className="btn-primary creator-studio-review-submit" onClick={sendForReview} disabled={saving || submittingReview || !readyToSave}>
                <Sparkles size={14} /> {submittingReview ? "Sending…" : reviewRejected ? "Resubmit for review" : "Send for review"}
              </button>
            </>
          ) : (
            <span className="creator-studio-review-lock">Editing locked while review is pending</span>
          )}
        </div>
      </header>

      <div className={`creator-studio-body ${(detailsOpen || scopeMatrixOpen || layersOpen || mockupsOpen) ? "has-details" : "details-collapsed"}`}>
        <aside className="creator-studio-left-rail" aria-label="Product tools">
          <button type="button" className={detailsOpen ? "is-active" : ""} onClick={() => { const next = !detailsOpen; setDetailsOpen(next); if (next) { setScopeMatrixOpen(false); setLayersOpen(false); setMockupsOpen(false); } }} title="Store product details"><Info size={19} /><span>Details</span></button>
          <button type="button" className={scopeMatrixOpen ? "is-active" : ""} onClick={() => { const next = !scopeMatrixOpen; setScopeMatrixOpen(next); if (next) { setDetailsOpen(false); setLayersOpen(false); setMockupsOpen(false); } }} title="Artwork scopes"><SlidersHorizontal size={19} /><span>Scopes</span></button>
          <button type="button" className={workspace === "design" && viewMode === "edit" ? "is-active" : ""} onClick={() => { setViewMode("edit"); setWorkspace("design"); setMockupsOpen(false); }} title="Design"><Palette size={19} /><span>Design</span></button>
          <button type="button" className={layersOpen ? "is-active" : ""} onClick={() => { const next = !layersOpen; setLayersOpen(next); if (next) { setDetailsOpen(false); setScopeMatrixOpen(false); setMockupsOpen(false); } }} title="Artwork layers"><Layers size={19} /><span>Layers</span></button>
          <button type="button" className={mockupsOpen ? "is-active" : ""} onClick={() => { const next = !mockupsOpen; setMockupsOpen(next); setViewMode("edit"); setWorkspace("design"); if (next) { setDetailsOpen(false); setScopeMatrixOpen(false); setLayersOpen(false); } }} title="Mockups"><Images size={19} /><span>Mockups</span></button>
        </aside>

        {detailsOpen && (
          <aside className="creator-studio-left-panel">
            <div className="creator-studio-panel-heading">
              <div><span>Product</span><strong>Details</strong></div>
              <button type="button" className="creator-studio-panel-close" onClick={() => setDetailsOpen(false)}>×</button>
            </div>

            {isAdmin && (
              <StudioAccordion title="Admin product setup" icon={Package} open={true} onToggle={() => {}} summary={form.band_id && form.template_id ? "Assigned" : "Choose owner & template"}>
                <div className="creator-studio-product-note">SuperAdmin uses the same production Studio as creators, with direct ownership and storefront controls.</div>
                <StudioField label="Creator" hint={product?.band_id ? "Creator ownership is locked after the product is created." : "Choose the storefront that will own this product."}>
                  <select value={form.band_id} onChange={(event) => update("band_id", event.target.value)} disabled={Boolean(product?.band_id)}>
                    <option value="">Select creator</option>
                    {creators.map((creator) => <option key={creator.id} value={creator.id}>{creator.name}</option>)}
                  </select>
                </StudioField>
                <StudioField label="Catalogue template" hint={isNew ? "Choose the production template this sellable product is built from." : "Template ownership is locked after creation."}>
                  <select value={form.template_id} onChange={(event) => chooseAdminTemplate(event.target.value)} disabled={!isNew}>
                    <option value="">Select template</option>
                    {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                  </select>
                </StudioField>
                <StudioField label="Storefront status">
                  <select value={form.published ? "published" : "draft"} onChange={(event) => update("published", event.target.value === "published")}>
                    <option value="draft">Draft / hidden</option>
                    <option value="published">Published / live</option>
                  </select>
                </StudioField>
              </StudioAccordion>
            )}

            <StudioAccordion title="Store product information" icon={Info} open={true} onToggle={() => {}} summary="Title & storefront copy">
              <div className="creator-studio-product-note">These fields belong to this sellable product. The Catalogue template stays unchanged.</div>
              <StudioField label="Store product title">
                <input value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="Product title" />
              </StudioField>
              <StudioField label="Storefront slug" hint="Optional — FandomForge can generate this if left blank.">
                <input value={form.slug} onChange={(event) => update("slug", event.target.value)} placeholder="product-slug" />
              </StudioField>
              <StudioField label="Storefront description">
                <textarea rows={5} value={form.description} onChange={(event) => update("description", event.target.value)} />
              </StudioField>
              <StudioField label="Specifications & features" hint="Copied from the Catalogue template as an editable product snapshot.">
                <textarea rows={6} value={form.specs} onChange={(event) => update("specs", event.target.value)} placeholder="Capacity, dimensions, features or product specifications" />
              </StudioField>
              <StudioField label="Material / composition">
                <textarea rows={3} value={form.material_composition} onChange={(event) => update("material_composition", event.target.value)} placeholder="Ceramic, 100% cotton, polyester blend…" />
              </StudioField>
              <StudioField label="Care instructions">
                <textarea rows={3} value={form.care_instructions} onChange={(event) => update("care_instructions", event.target.value)} placeholder="Washing, handling or care instructions" />
              </StudioField>
              <StudioField label="Fit / sizing notes">
                <textarea rows={3} value={form.fit_notes} onChange={(event) => update("fit_notes", event.target.value)} placeholder="Fit, sizing or capacity guidance" />
              </StudioField>
            </StudioAccordion>

            <StudioAccordion title="Template information" icon={Package} open={templateInfoOpen} onToggle={() => setTemplateInfoOpen((value) => !value)} summary={selectedTemplate?.name || "Catalogue product"}>
              {selectedTemplate ? (
                <>
                  <div className="creator-studio-template-card">
                    <div className="creator-studio-template-image">
                      {templateImage(selectedTemplate) ? <img src={assetUrl(templateImage(selectedTemplate))} alt={selectedTemplate?.name || "Product"} /> : <Package size={26} />}
                    </div>
                    <div><strong>{selectedTemplate?.name || "Product"}</strong><span>Base from {money(getCreatorBlankPrice(selectedTemplate))}</span></div>
                  </div>
                  <div className="creator-studio-template-meta">
                    {selectedTemplate?.brand && <span>Brand <strong>{selectedTemplate.brand}</strong></span>}
                    {selectedTemplate?.category && <span>Category <strong>{selectedTemplate.category}</strong></span>}
                  </div>
                  {creatorTemplateSpecs(selectedTemplate) && <div className="creator-studio-template-specs">{creatorTemplateSpecs(selectedTemplate)}</div>}
                </>
              ) : (
                <div className="creator-studio-note">Choose a Catalogue template above to load production information.</div>
              )}
            </StudioAccordion>
          </aside>
        )}

        {scopeMatrixOpen && (
          <aside className="creator-studio-left-panel">
            <div className="creator-studio-panel-heading">
              <div><span>Artwork</span><strong>Scopes</strong></div>
              <button type="button" className="creator-studio-panel-close" onClick={() => setScopeMatrixOpen(false)}>×</button>
            </div>
            <CreatorArtworkScopesPanel
              selectedVariations={selectedVariations}
              hasTemplateVariations={hasVariations}
              groups={form.artwork_groups}
              onChange={setArtworkGroups}
              activeGroupId={activeArtworkGroupId}
              onActiveGroupChange={setActiveArtworkGroupId}
            />
          </aside>
        )}

        {layersOpen && (
          <aside className="creator-studio-left-panel">
            <div className="creator-studio-panel-heading">
              <div><span>Artwork</span><strong>Layers</strong></div>
              <button type="button" className="creator-studio-panel-close" onClick={() => setLayersOpen(false)}>×</button>
            </div>
            <CreatorLayersPanel
              groups={form.artwork_groups}
              activeGroupId={activeArtworkGroupId}
              activeSlotId={activeArtworkSlotId}
              onSelectGroup={(groupId) => setActiveArtworkGroupId(groupId)}
              onSelectSlot={(groupId, slotId) => { setActiveArtworkGroupId(groupId); setActiveArtworkSlotId(slotId); }}
            />
          </aside>
        )}

        {mockupsOpen && (
          <aside className="creator-studio-left-panel creator-studio-mockups-panel">
            <div className="creator-studio-panel-heading">
              <div><span>Storefront</span><strong>Mockups</strong></div>
              <button type="button" className="creator-studio-panel-close" onClick={() => setMockupsOpen(false)}>×</button>
            </div>
            <div className="creator-studio-mockups-scroll">
              <div className="creator-studio-mockups-intro">
                <strong>Generate product mockups</strong>
                <span>Build shopper-ready images from the artwork and variants you selected.</span>
              </div>
              <ScopedArtworkMockupGenerator
                template={selectedTemplate}
                artworkGroups={form.artwork_groups}
                selectedVariations={selectedVariations}
                onArtworkGroupsChange={setArtworkGroups}
              />
              <section className="creator-studio-gallery creator-studio-mockups-gallery">
                <div className="creator-studio-section-title"><span>Storefront gallery</span><strong>{form.mockup_images.length} selected</strong></div>
                <div className="creator-studio-gallery-grid">
                  {galleryCandidates.map((candidate) => {
                    const url = candidate.url;
                    const selected = form.mockup_images.includes(url);
                    const primary = form.primary_mockup_image_url === url;
                    return (
                      <button key={`${url}-${candidate.key || candidate.id || "image"}`} type="button" className={`creator-studio-gallery-card ${selected ? "is-selected" : ""}`} onClick={() => toggleGalleryImage(url)}>
                        <img src={assetUrl(url)} alt={candidate.label || "Product mockup"} />
                        <span>{candidate.label || "Mockup"}</span>
                        {selected && <b><Check size={11} /> Selected</b>}
                        {primary && <em>Primary</em>}
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          </aside>
        )}

        <main className="creator-studio-canvas">
          {!selectedTemplate ? (
            <div className="creator-studio-empty-canvas">
              <div className="creator-studio-empty-product"><Package size={58} /></div>
              <span>Choose a product</span>
              <h2>Select a Catalogue template in Details</h2>
              <p>{isAdmin ? "Assign a creator and choose the production template to start the SuperAdmin product Studio." : "Return to the Catalogue and choose a product to start designing."}</p>
            </div>
          ) : viewMode === "preview" ? (
            <div className="creator-studio-preview">
              <div className="creator-studio-preview-image">
                {selectedImage ? <img src={assetUrl(selectedImage)} alt={form.title || "Product preview"} /> : <ImageIcon size={46} />}
              </div>
              <div className="creator-studio-preview-copy">
                <span>Storefront preview</span>
                <h1>{form.title || selectedTemplate?.name || "Untitled product"}</h1>
                {form.brand && <div className="creator-studio-preview-brand">{form.brand}</div>}
                <p>{form.description || "Add a product description from the Product details panel."}</p>
                <div className="creator-studio-preview-price">{effectiveSellingPrice > 0 ? money(effectiveSellingPrice) : "Price not set"}</div>
                <div className="creator-studio-preview-meta">{form.selected_template_variation_ids.length || 1} variant{form.selected_template_variation_ids.length === 1 ? "" : "s"} · {form.mockup_images.length} storefront image{form.mockup_images.length === 1 ? "" : "s"}</div>
              </div>
            </div>
          ) : workspace === "mockups" ? (
            <div className="creator-studio-workspace">
              <div className="creator-studio-workspace-heading"><span>Mockups</span><strong>Choose what shoppers will see</strong></div>
              <ScopedArtworkMockupGenerator
                template={selectedTemplate}
                artworkGroups={form.artwork_groups}
                selectedVariations={selectedVariations}
                onArtworkGroupsChange={setArtworkGroups}
              />
              <section className="creator-studio-gallery">
                <div className="creator-studio-section-title"><span>Storefront gallery</span><strong>{form.mockup_images.length} selected</strong></div>
                <div className="creator-studio-gallery-grid">
                  {galleryCandidates.map((candidate) => {
                    const url = candidate.url;
                    const selected = form.mockup_images.includes(url);
                    const primary = form.primary_mockup_image_url === url;
                    return (
                      <button key={`${url}-${candidate.key || candidate.id || "image"}`} type="button" className={`creator-studio-gallery-card ${selected ? "is-selected" : ""}`} onClick={() => toggleGalleryImage(url)}>
                        <img src={assetUrl(url)} alt={candidate.label || "Product mockup"} />
                        <span>{candidate.label || "Mockup"}</span>
                        {selected && <b><Check size={11} /> Selected</b>}
                        {primary && <em>Primary</em>}
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          ) : hasSelectedVariations ? (
            <div className="creator-studio-workspace creator-studio-design-workspace">
              <div className="creator-studio-workspace-heading"><span>Design</span><strong>Place artwork on the product</strong></div>
              {!form.artwork_groups.length ? (
                <div className="creator-studio-scope-cta">
                  <div><span>Artwork variations</span><strong>Choose how artwork should vary across the selected products</strong><p>The variation matrix opens separately so it does not take over the design canvas.</p></div>
                  <button type="button" className="btn-secondary" onClick={() => { setScopeMatrixOpen(true); setDetailsOpen(false); setLayersOpen(false); }}>Open artwork scopes</button>
                </div>
              ) : (
                <ScopedProductArtworkStudio
                  template={selectedTemplate}
                  printOptions={printOptions}
                  artworkGroups={form.artwork_groups}
                  onArtworkGroupsChange={setArtworkGroups}
                  selectedVariations={selectedVariations}
                  isAdmin={isAdmin}
                  creatorMode={!isAdmin}
                  activeGroupId={activeArtworkGroupId}
                  onActiveGroupChange={setActiveArtworkGroupId}
                  activeSlotId={activeArtworkSlotId}
                  onActiveSlotChange={setActiveArtworkSlotId}
                />
              )}
            </div>
          ) : (
            <div className="creator-studio-empty-canvas">
              <div className="creator-studio-empty-product">
                {templateImage(selectedTemplate) ? <img src={assetUrl(templateImage(selectedTemplate))} alt={selectedTemplate?.name || "Product"} /> : <Package size={58} />}
              </div>
              <span>Choose variants</span>
              <h2>Select the colours and sizes you want to sell</h2>
              <p>Variant choices live in the panel on the right. Your production template is already loaded.</p>
            </div>
          )}
        </main>

        <aside className="creator-studio-right-panel">
          <StudioAccordion title="Variants" icon={SlidersHorizontal} open={variantsOpen} onToggle={() => setVariantsOpen((value) => !value)} summary={!selectedTemplate ? "Choose template" : hasVariations ? `${form.selected_template_variation_ids.length} selected` : "Standard product"}>
            {!selectedTemplate ? (
              <div className="creator-studio-note">Choose a Catalogue template first.</div>
            ) : !hasVariations ? (
              <div className="creator-studio-note">This product has no selectable variants.</div>
            ) : (
              <div className="creator-studio-variant-groups">
                {attributeOptions.map((attribute) => {
                  const active = new Set(studioArray(selectedValues[attribute.key]));
                  const colourLike = /(colour|color)/i.test(attribute.key);
                  return (
                    <div key={attribute.key} className="creator-studio-variant-group">
                      <div className="creator-studio-variant-group-head">
                        <strong>{attribute.label}</strong>
                        <button type="button" onClick={() => selectAllAttributeValues(attribute.key, attribute.values)}>Select all</button>
                      </div>
                      <div className="creator-studio-variant-options">
                        {attribute.values.map((value) => {
                          const checked = active.has(value);
                          const hex = colourLike ? findColourHex(availableVariations, attribute.key, value) : "";
                          return (
                            <button key={value} type="button" className={`creator-studio-variant-chip ${checked ? "is-selected" : ""}`} onClick={() => toggleAttributeValue(attribute.key, value)}>
                              {colourLike && <span className="creator-studio-colour-swatch" style={hex ? { backgroundColor: hex } : undefined} />}
                              <span>{value}</span>
                              {checked && <Check size={12} />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <div className="creator-studio-combination-count"><strong>{form.selected_template_variation_ids.length}</strong><span>real product combinations</span></div>
              </div>
            )}
          </StudioAccordion>

          <StudioAccordion title="Pricing" icon={DollarSign} open={pricingOpen} onToggle={() => setPricingOpen((value) => !value)} summary={effectiveSellingPrice > 0 ? money(effectiveSellingPrice) : "Set price"}>
            {!selectedTemplate ? (
              <div className="creator-studio-note">Choose a Catalogue template first.</div>
            ) : (
              <>
                <div className="creator-studio-price-mode">
                  <button type="button" className={form.variation_pricing_mode !== "uniform" ? "is-active" : ""} onClick={() => setPricingMode("by_attribute")}>By {pricingAttribute || "variant"}</button>
                  <button type="button" className={form.variation_pricing_mode === "uniform" ? "is-active" : ""} onClick={() => setPricingMode("uniform")}>Same price</button>
                </div>
                {form.variation_pricing_mode === "uniform" ? (
                  <StudioField label="Selling price">
                    <div className="creator-studio-money-input"><span>R</span><input type="number" min="0" step="0.01" value={form.selling_price || ""} onChange={(event) => setUniformPrice(event.target.value)} placeholder="0.00" /></div>
                  </StudioField>
                ) : priceValues.length ? (
                  <div className="creator-studio-price-list">
                    {priceValues.map((value) => (
                      <div key={value} className="creator-studio-price-row">
                        <span>{value}</span>
                        <div className="creator-studio-money-input"><span>R</span><input type="number" min="0" step="0.01" value={scopedPriceMap[value] ?? ""} onChange={(event) => setScopedPrice(value, event.target.value)} placeholder="0.00" /></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="creator-studio-note">Choose variants first to set scoped pricing.</div>
                )}
                <div className="creator-studio-cost-grid">
                  <div><span>Base</span><strong>{money(pricing.blank)}</strong></div>
                  <div><span>Artwork printing</span><strong>{money(pricing.print)}</strong></div>
                  <div><span>Production</span><strong>{money(pricing.production)}</strong></div>
                  <div><span>{isAdmin ? "Creator amount" : "Your amount"}</span><strong className={pricing.profit >= 0 ? "is-positive" : "is-negative"}>{money(pricing.profit)}</strong></div>
                </div>
              </>
            )}
          </StudioAccordion>

          <StudioAccordion title="Product readiness" icon={Sparkles} open={readinessOpen} onToggle={() => setReadinessOpen((value) => !value)} summary={readyToSave ? "Ready" : "In progress"}>
            <div className="creator-studio-readiness">
              {isAdmin && <ReadinessItem done={Boolean(form.band_id)}>Creator assigned</ReadinessItem>}
              <ReadinessItem done={Boolean(form.template_id)}>Template selected</ReadinessItem>
              <ReadinessItem done={Boolean(form.title.trim())}>Product title</ReadinessItem>
              <ReadinessItem done={hasSelectedVariations}>Variants selected</ReadinessItem>
              <ReadinessItem done={readyArtworkSlots.length > 0}>Artwork + print method</ReadinessItem>
              <ReadinessItem done={generatedMockups.length > 0}>Mockup generated</ReadinessItem>
              <ReadinessItem done={effectiveSellingPrice > 0}>Selling price</ReadinessItem>
            </div>
            {!isAdmin && product?.id && !published && (
              <button type="button" className="btn-secondary creator-studio-publish" disabled={publishing || !canPublishCreatorProduct(product)} onClick={publish}>
                {publishing ? "Publishing…" : "Publish product"}
              </button>
            )}
            {published && <div className="creator-studio-live-note"><Check size={13} /> Product is live</div>}
            {isAdmin && !published && <div className="creator-studio-note">Set Storefront status to Published, then Save product when this product should go live.</div>}
          </StudioAccordion>
        </aside>
      </div>
    </div>
  );
}
