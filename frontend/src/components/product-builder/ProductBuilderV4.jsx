import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { toast } from "sonner";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Package, Save, Star } from "lucide-react";
import { http, assetUrl } from "../../lib/api";
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
  { key: "pricing", label: "5 Pricing", title: "Pricing", description: "Set the selling price and see the production economics." },
  { key: "review", label: "6 Review & Publish", title: "Review & Publish", description: "Check the complete product before saving or publishing it." },
];

const EMPTY_ARTWORK = { original_url: "", file_name: "", mime_type: "", status: "pending_review" };
const EMPTY_PLACEMENT = { x: 0, y: 0, width: 0, height: 0, rotation: 0 };

function normalise(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function templateMatchesType(template, type) {
  if (!type) return true;
  const templateKeys = [template.product_type_slug, template.product_type_key, template.product_type, template.category, template.category_id, template.category_slug].map(normalise).filter(Boolean);
  const typeKeys = [type.slug, type.category, type.key, type.name, type.id].map(normalise).filter(Boolean);
  return templateKeys.some((key) => typeKeys.includes(key));
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
    selected_template_variation_ids: [], variation_price_overrides: {}, selling_price: 0, published: false,
    artwork_groups: [], mockup_images: [], mockup_image_url: "", primary_mockup_image_url: "",
  });

  const selectedType = useMemo(() => productTypes.find((type) => type.id === selectedProductTypeId) || null, [productTypes, selectedProductTypeId]);
  const filteredTemplates = useMemo(() => templates.filter((template) => templateMatchesType(template, selectedType)), [templates, selectedType]);
  const selectedTemplate = useMemo(() => templates.find((template) => template.id === form.template_id) || null, [templates, form.template_id]);
  const availableVariations = useMemo(() => getEnabledTemplateVariations(selectedTemplate), [selectedTemplate]);
  const hasVariations = availableVariations.length > 0;
  const selectedVariations = useMemo(() => getSelectedVariations(selectedTemplate, form.selected_template_variation_ids), [selectedTemplate, form.selected_template_variation_ids]);
  const blankCost = useMemo(() => selectedVariations.length ? Math.max(...selectedVariations.map((item) => getVariationCost(item, selectedTemplate))) : getCreatorBlankPrice(selectedTemplate), [selectedVariations, selectedTemplate]);
  const printCost = useMemo(() => getUniquePrintCostFromGroups(form.artwork_groups, printOptions, selectedTemplate), [form.artwork_groups, printOptions, selectedTemplate]);
  const commissionSource = useMemo(() => creatorAccount?.id ? creatorAccount : product, [creatorAccount, product]);
  const commissionRate = useMemo(() => resolveCreatorCommissionRate(commissionSource), [commissionSource]);
  const pricing = useMemo(() => calculatePricing({ sellingPrice: form.selling_price, blankCost, printCost, commissionRate, commissionSource, pricingOverrideApproved: Boolean(product?.pricing_override_approved) }), [blankCost, commissionRate, commissionSource, form.selling_price, printCost, product]);
  const artworkSlots = useMemo(() => form.artwork_groups.flatMap((group) => asArray(group.artworks)).filter((slot) => slot?.original_url), [form.artwork_groups]);
  const readyArtworkSlots = useMemo(() => artworkSlots.filter((slot) => slot.print_option_id), [artworkSlots]);
  const generatedMockups = useMemo(() => form.artwork_groups.flatMap((group) => asArray(group.variation_mockups)).filter((row) => row?.image_url), [form.artwork_groups]);
  const galleryCandidates = useMemo(() => getProductBuilderStorefrontGalleryCandidates(selectedTemplate, form.artwork_groups), [selectedTemplate, form.artwork_groups]);

  useEffect(() => {
    if (!isAdmin) http.get("/creators/me").then((response) => setCreatorAccount(response.data || null)).catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const requests = [
          http.get(isAdmin ? "/admin/product-templates" : "/product-templates"),
          http.get("/print-options"),
          http.get("/public/product-types?status=active"),
        ];
        if (isAdmin) requests.push(http.get("/admin/creators"));
        if (!isNew) requests.push(http.get(isAdmin ? `/admin/products/${routeId}` : `/products/${routeId}`));
        const responses = await Promise.all(requests);
        if (!mounted) return;
        setTemplates(asArray(responses[0].data));
        setPrintOptions(asArray(responses[1].data));
        setProductTypes(asArray(responses[2].data));
        let cursor = 3;
        if (isAdmin) { setCreators(asArray(responses[cursor].data)); cursor += 1; }
        if (!isNew) {
          const existing = responses[cursor].data;
          setProduct(existing);
          const groups = asArray(existing.artwork_groups).length ? asArray(existing.artwork_groups) : asArray(existing.artworks).length ? [{ ...createDefaultArtworkGroup(), artworks: asArray(existing.artworks), primary_mockup_image_url: existing.primary_mockup_image_url || existing.mockup_image_url || "" }] : [];
          setForm({
            band_id: existing.band_id || "", template_id: existing.template_id || "", title: existing.title || "", slug: existing.slug || "",
            description: existing.description || "", specs: existing.specs || "", category: existing.category || "", brand: existing.brand || "", active: existing.active !== false,
            selected_template_variation_ids: asArray(existing.selected_template_variation_ids),
            variation_price_overrides: Object.fromEntries(asArray(existing.variations).map((variation) => [variation.template_variation_id || variation.id || variation.sku, variation.price_override ?? ""]).filter(([key]) => key)),
            selling_price: existing.selling_price || 0, published: Boolean(existing.published), artwork_groups: groups,
            mockup_images: asArray(existing.mockup_images), mockup_image_url: existing.mockup_image_url || "", primary_mockup_image_url: existing.primary_mockup_image_url || existing.mockup_image_url || "",
          });
          const type = asArray(responses[2].data).find((row) => normalise(row.id) === normalise(existing.product_type_id) || normalise(row.category) === normalise(existing.category));
          if (type) setSelectedProductTypeId(type.id);
        }
      } catch (error) { toast.error(error.response?.data?.detail || "Could not load product builder"); }
      finally { if (mounted) setLoading(false); }
    }
    load();
    return () => { mounted = false; };
  }, [isAdmin, isNew, routeId]);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const chooseType = (typeId) => {
    const type = productTypes.find((row) => row.id === typeId);
    setSelectedProductTypeId(typeId);
    setForm((current) => ({ ...current, template_id: "", selected_template_variation_ids: [], variation_price_overrides: {}, artwork_groups: [], mockup_images: [], mockup_image_url: "", primary_mockup_image_url: "", category: type?.category || current.category, specs: "" }));
  };

  const chooseTemplate = (template) => {
    const templateSpecs = getTemplateSpecs(template);
    setForm((current) => ({
      ...current, template_id: template.id, selected_template_variation_ids: [], variation_price_overrides: {}, artwork_groups: [], mockup_images: [], mockup_image_url: "", primary_mockup_image_url: "",
      title: current.title || template.name || "", description: current.description || template.description || "", specs: templateSpecs || current.specs || "", category: template.category || current.category,
    }));
  };

  const setVariations = (ids) => setForm((current) => ({ ...current, selected_template_variation_ids: ids, variation_price_overrides: Object.fromEntries(Object.entries(current.variation_price_overrides || {}).filter(([key]) => ids.includes(key))), artwork_groups: [], mockup_images: [], mockup_image_url: "", primary_mockup_image_url: "" }));

  const setArtworkGroups = (groups) => {
    const flattened = flattenArtworkGroups(groups);
    const primary = flattened.find((slot) => slot.original_url) || flattened[0] || null;
    const generatedPrimary = getPrimaryMockupFromGroups(groups);
    const candidates = getProductBuilderStorefrontGalleryCandidates(selectedTemplate, groups).map((item) => item.url).filter(Boolean);
    setForm((current) => {
      const retained = asArray(current.mockup_images).filter((url) => candidates.includes(url));
      const images = retained.length ? retained : candidates;
      const primaryMockup = [current.primary_mockup_image_url, current.mockup_image_url, generatedPrimary, images[0]].find((url) => url && images.includes(url)) || images[0] || "";
      return { ...current, artwork_groups: groups, mockup_images: images, mockup_image_url: primaryMockup, primary_mockup_image_url: primaryMockup,
        artwork: primary?.original_url ? { original_url: primary.original_url, file_name: primary.file_name || "artwork", mime_type: primary.mime_type || "", status: primary.status || (isAdmin ? "approved" : "pending_review") } : EMPTY_ARTWORK,
        placement: primary?.placement || EMPTY_PLACEMENT };
    });
  };

  const validateStep = (key) => {
    if (key === "basics") { if (!form.title.trim()) return "Enter a product name."; if (!selectedProductTypeId) return "Select a product type."; if (!form.template_id) return "Select a template."; }
    if (key === "variations" && hasVariations && !form.selected_template_variation_ids.length) return "Select at least one attribute combination.";
    if (key === "artwork") { if (!form.artwork_groups.length) return "Create at least one artwork scope."; if (!readyArtworkSlots.length) return "Upload artwork and assign a print method."; }
    if (key === "mockups" && !generatedMockups.length) return "Generate at least one artwork-scope mockup.";
    if (key === "pricing" && Number(form.selling_price || 0) <= 0) return "Enter a selling price.";
    return null;
  };

  const goToStep = (key) => {
    const targetIndex = STEPS.findIndex((step) => step.key === key);
    const currentIndex = STEPS.findIndex((step) => step.key === activeStep);
    if (targetIndex > currentIndex) {
      for (let index = currentIndex; index < targetIndex; index += 1) { const error = validateStep(STEPS[index].key); if (error) { toast.error(error); return; } }
    }
    setActiveStep(key); window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const nextStep = () => { const index = STEPS.findIndex((step) => step.key === activeStep); const error = validateStep(activeStep); if (error) { toast.error(error); return; } if (index < STEPS.length - 1) goToStep(STEPS[index + 1].key); };
  const prevStep = () => { const index = STEPS.findIndex((step) => step.key === activeStep); if (index > 0) setActiveStep(STEPS[index - 1].key); };

  const buildPayload = () => {
    const primary = form.artwork_groups.flatMap((group) => asArray(group.artworks)).find((slot) => slot?.original_url) || null;
    const baseVariations = hasVariations ? buildProductVariations(selectedTemplate, form.selected_template_variation_ids, form.variation_price_overrides) : [buildStandardProductVariation(selectedTemplate)];
    const mockupMap = new Map();
    form.artwork_groups.flatMap((group) => asArray(group.variation_mockups)).filter((mockup) => mockup?.image_url).forEach((mockup) => {
      const ids = asArray(mockup.variation_ids).length ? asArray(mockup.variation_ids) : [mockup.variation_id];
      ids.filter(Boolean).forEach((id) => mockupMap.set(id, [...(mockupMap.get(id) || []), mockup]));
    });
    const variations = baseVariations.map((variation) => {
      const mockups = mockupMap.get(variation.template_variation_id || variation.id) || [];
      return { ...variation, variation_mockups: mockups, mockup_images: mockups.map((item) => item.image_url).filter(Boolean), mockup_image_url: mockups[0]?.image_url || "", primary_mockup_image_url: mockups[0]?.image_url || "" };
    });
    const selectedGallery = asArray(form.mockup_images).filter(Boolean);
    const primaryMockup = selectedGallery.includes(form.primary_mockup_image_url) ? form.primary_mockup_image_url : selectedGallery[0] || getPrimaryMockupFromGroups(form.artwork_groups) || "";
    const mockupImages = primaryMockup ? [primaryMockup, ...selectedGallery.filter((url) => url !== primaryMockup)] : selectedGallery;
    return {
      ...(isAdmin ? { band_id: form.band_id } : {}), template_id: form.template_id, title: form.title.trim(), slug: form.slug.trim(), description: form.description || "", specs: form.specs || "", category: form.category || selectedTemplate?.category || "", brand: form.brand || "", active: form.active !== false,
      selling_price: Number(form.selling_price || 0), print_cost: pricing.print, mockup_images: mockupImages, mockup_image_url: primaryMockup, primary_mockup_image_url: primaryMockup, variations,
      attribute_ids: asArray(selectedTemplate?.attribute_ids), spec_attributes: {}, customization_enabled: false, published: isAdmin ? Boolean(form.published) : false, publish_on_approval: false,
      selected_template_variation_ids: form.selected_template_variation_ids, selected_print_area_id: primary?.print_area_id || "", selected_print_option_id: primary?.print_option_id || "",
      artwork: primary?.original_url ? { original_url: primary.original_url, file_name: primary.file_name || "artwork", mime_type: primary.mime_type || "", status: primary.status || (isAdmin ? "approved" : "pending_review") } : EMPTY_ARTWORK,
      artworks: flattenArtworkGroups(form.artwork_groups), artwork_groups: form.artwork_groups, placement: primary?.placement || EMPTY_PLACEMENT,
      estimated_blank_cost: pricing.blank, estimated_print_cost: pricing.print, estimated_total_cost: pricing.production, commission_rate: pricing.rate, estimated_commission: pricing.commission, estimated_creator_profit: pricing.profit,
    };
  };

  const publishCreator = async (target) => {
    if (!target?.id) return;
    setPublishing(true);
    try { const response = await setCreatorProductPublished(target.id, true); setProduct(response?.data || { ...target, published: true }); update("published", true); toast.success("Product published"); }
    catch (error) { toast.error(error.response?.data?.detail || "Could not publish product"); }
    finally { setPublishing(false); }
  };

  const save = async ({ publish = false } = {}) => {
    const error = ["basics", "variations", "artwork", "mockups", "pricing"].map(validateStep).find(Boolean);
    if (error) { toast.error(error); return false; }
    const payload = buildPayload();
    if (publish && !isAdmin && !canPublishCreatorProduct(product || payload)) { toast.error("This creator product cannot be published until its review requirements are complete."); return false; }
    setSaving(true);
    try {
      const response = isNew ? await http.post(isAdmin ? "/admin/products" : "/products", payload) : await http.put(isAdmin ? `/admin/products/${routeId}` : `/products/${routeId}`, payload);
      const saved = response.data; setProduct(saved); if (!isAdmin) emitCreatorProductsReadyRefresh();
      if (isNew) navigate(isAdmin ? `/admin/products/${saved.id}` : `/creator/products/${saved.id}`, { replace: true });
      toast.success(isNew ? "Product created" : "Product saved");
      if (publish && !isAdmin && saved.id) await publishCreator(saved);
      return true;
    } catch (err) { toast.error(err.response?.data?.detail || "Could not save product"); return false; }
    finally { setSaving(false); }
  };

  const toggleGalleryImage = (url) => {
    const selected = new Set(asArray(form.mockup_images)); if (selected.has(url)) selected.delete(url); else selected.add(url);
    const images = [...selected]; const primary = images.includes(form.primary_mockup_image_url) ? form.primary_mockup_image_url : images[0] || "";
    update("mockup_images", images); update("mockup_image_url", primary); update("primary_mockup_image_url", primary);
  };

  const stepIndex = STEPS.findIndex((step) => step.key === activeStep);
  const readyToPublish = pricing.canPublishWithOverride && readyArtworkSlots.length > 0 && generatedMockups.length > 0 && Boolean(form.template_id);

  if (loading) return <div className="product-builder-shell min-h-[calc(100vh-120px)] flex items-center justify-center"><div className="text-sm text-zinc-400">Loading product builder…</div></div>;

  return <div className="product-builder-shell min-h-[calc(100vh-120px)]" data-testid={`${mode}-product-builder-v4`}>
    <header className="flex items-start justify-between gap-4 mb-5"><div><div className="overline mb-1">{isAdmin ? "Admin Product Builder" : "Creator Product Builder"}</div><h1 className="font-display text-4xl md:text-5xl leading-none uppercase">{form.title || (isNew ? "New Product" : "Edit Product")}</h1><p className="text-sm text-zinc-500 mt-2">One clean flow: product → attributes → artwork scopes → mockups → price.</p></div><button type="button" className="btn-secondary !px-4 !py-2 text-xs" onClick={() => navigate(backTo)}><ArrowLeft size={13} /> Back</button></header>
    <nav className="mb-5 overflow-x-auto" aria-label="Product builder steps"><div className="flex min-w-max gap-2">{STEPS.map((step, index) => { const active = step.key === activeStep; const complete = index < stepIndex; return <button key={step.key} type="button" onClick={() => goToStep(step.key)} className={`px-3 py-2 rounded-xl border text-[11px] uppercase tracking-widest font-bold transition ${active ? "border-[#FF3B30] bg-[#FF3B30]/15 text-white" : complete ? "border-emerald-400/30 bg-emerald-400/5 text-emerald-200" : "border-white/10 bg-white/[0.03] text-zinc-500 hover:text-white"}`}>{complete && <Check size={12} className="inline mr-1" />}{step.label}</button>; })}</div></nav>
    <div className="mb-5 border border-white/10 bg-black/20 rounded-2xl p-4"><div className="text-xs uppercase tracking-widest text-zinc-500">Step {stepIndex + 1} of {STEPS.length}</div><div className="text-2xl font-display uppercase text-white mt-1">{STEPS[stepIndex].title}</div><div className="text-sm text-zinc-400 mt-1">{STEPS[stepIndex].description}</div></div>
    <main className="product-builder-main min-w-0">
      {activeStep === "basics" && <BasicsStep form={form} update={update} productTypes={productTypes} selectedProductTypeId={selectedProductTypeId} chooseType={chooseType} templates={filteredTemplates} selectedTemplate={selectedTemplate} chooseTemplate={chooseTemplate} creators={creators} isAdmin={isAdmin} product={product} />}
      {activeStep === "variations" && <VariationsStep template={selectedTemplate} selectedIds={form.selected_template_variation_ids} onChange={setVariations} hasVariations={hasVariations} />}
      {activeStep === "artwork" && <ArtworkStep template={selectedTemplate} printOptions={printOptions} artworkGroups={form.artwork_groups} onArtworkGroupsChange={setArtworkGroups} selectedVariations={selectedVariations} isAdmin={isAdmin} />}
      {activeStep === "mockups" && <MockupsStep template={selectedTemplate} artworkGroups={form.artwork_groups} selectedVariations={selectedVariations} onArtworkGroupsChange={setArtworkGroups} candidates={galleryCandidates} selectedImages={form.mockup_images} primaryImage={form.primary_mockup_image_url} toggleImage={toggleGalleryImage} setPrimary={(url) => { update("primary_mockup_image_url", url); update("mockup_image_url", url); }} generatedMockups={generatedMockups} />}
      {activeStep === "pricing" && <PricingStep form={form} update={update} pricing={pricing} selectedVariations={selectedVariations} isAdmin={isAdmin} />}
      {activeStep === "review" && <ReviewStep form={form} selectedType={selectedType} selectedTemplate={selectedTemplate} selectedVariations={selectedVariations} readyArtworkSlots={readyArtworkSlots} generatedMockups={generatedMockups} pricing={pricing} readyToPublish={readyToPublish} isAdmin={isAdmin} saving={saving} publishing={publishing} save={save} product={product} publishCreator={publishCreator} />}
    </main>
    <footer className="mt-6 sticky bottom-0 z-20 border-t border-white/10 bg-black/90 backdrop-blur-xl py-3 flex items-center justify-between gap-3"><button type="button" className="builder-nav-button builder-nav-button-secondary" onClick={prevStep} disabled={stepIndex === 0}><ChevronLeft size={15} /> Previous</button><button type="button" className="builder-nav-button builder-nav-button-save" onClick={() => save()} disabled={saving}><Save size={14} /> Save</button>{stepIndex < STEPS.length - 1 ? <button type="button" className="builder-nav-button builder-nav-button-primary" onClick={nextStep}>Next <ChevronRight size={15} /></button> : <button type="button" className="builder-nav-button builder-nav-button-primary" onClick={() => save({ publish: true })} disabled={saving || publishing || !readyToPublish}>{isAdmin ? "Save & Publish" : "Submit / Publish"}</button>}</footer>
  </div>;
}

function BasicsStep({ form, update, productTypes, selectedProductTypeId, chooseType, templates, selectedTemplate, chooseTemplate, creators, isAdmin, product }) {
  return <div className="space-y-6">
    <section className="card space-y-5"><div><div className="overline mb-1">Product basics</div><p className="text-sm text-zinc-500">Choose the template here. Its production specs are loaded into the editable Specs box below.</p></div>
      {isAdmin && <Field label="Creator"><select className="input-base" value={form.band_id} onChange={(e) => update("band_id", e.target.value)} disabled={Boolean(product?.band_id)}><option value="">Select creator</option>{creators.map((creator) => <option key={creator.id} value={creator.id}>{creator.name}</option>)}</select></Field>}
      <Field label="Product type"><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{productTypes.map((type) => <button key={type.id} type="button" onClick={() => chooseType(type.id)} className={`text-left rounded-xl border p-4 ${selectedProductTypeId === type.id ? "border-emerald-400 bg-emerald-500/10" : "border-white/10 bg-black/20 hover:border-white/30"}`}><div className="font-bold text-white">{type.name}</div><div className="text-xs text-zinc-500 mt-1">{type.category || type.slug}</div></button>)}</div></Field>
      <Field label="Template"><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{templates.map((template) => { const selected = selectedTemplate?.id === template.id; const image = getTemplateImage(template); return <button key={template.id} type="button" onClick={() => chooseTemplate(template)} className={`text-left rounded-xl border p-4 transition ${selected ? "border-emerald-400 bg-emerald-500/10" : "border-white/10 bg-black/20 hover:border-white/30"}`}><div className="flex gap-3"><div className="w-20 h-20 shrink-0 rounded-lg bg-black border border-white/10 overflow-hidden flex items-center justify-center">{image ? <img src={assetUrl(image)} alt={template.name} className="w-full h-full object-contain" /> : <Package size={24} className="text-zinc-700" />}</div><div className="min-w-0"><div className="font-display text-xl uppercase">{template.name}</div><div className="text-xs text-zinc-500 mt-1">{getTemplateShortDescription(template)}</div>{selected && <div className="text-[10px] uppercase tracking-widest text-emerald-300 mt-2">Selected</div>}</div></div><div className="grid grid-cols-2 gap-2 mt-4"><Info label="Base" value={money(getCreatorBlankPrice(template))} /><Info label="Print areas" value={String(asArray(template.print_areas).length)} /></div></button>; })}</div>{!templates.length && <div className="text-sm text-zinc-500">Select a product type to see compatible templates.</div>}</Field>
      <div className="grid md:grid-cols-2 gap-4"><Field label="Product name"><input className="input-base" value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="Creator logo hoodie" /></Field><Field label="Slug"><input className="input-base" value={form.slug} onChange={(e) => update("slug", e.target.value)} placeholder="creator-logo-hoodie" /></Field></div>
      <div className="grid md:grid-cols-2 gap-4"><Field label="Category"><input className="input-base" value={form.category} onChange={(e) => update("category", e.target.value)} /></Field><Field label="Brand"><input className="input-base" value={form.brand} onChange={(e) => update("brand", e.target.value)} placeholder="FandomForge" /></Field></div>
      <Field label="Description"><textarea className="input-base" rows={5} value={form.description} onChange={(e) => update("description", e.target.value)} /></Field>
      <Field label="Specs / features — editable"><textarea className="input-base" rows={8} value={form.specs} onChange={(e) => update("specs", e.target.value)} placeholder={selectedTemplate ? "Template specs will appear here…" : "Select a template first…"} /></Field>
      {selectedTemplate && <div className="rounded-xl border border-white/10 bg-black/20 p-4"><div className="overline mb-2">Template production summary</div><div className="grid sm:grid-cols-3 gap-3"><Info label="Options" value={getTemplateAvailableOptionsSummary(selectedTemplate).join(" · ") || "Configured"} /><Info label="Print areas" value={String(asArray(selectedTemplate.print_areas).length)} /><Info label="Production methods" value={String(asArray(selectedTemplate.production_methods || selectedTemplate.print_options).length || "Configured")} /></div></div>}
      <label className="flex items-center gap-3 text-sm text-white"><input type="checkbox" checked={form.active !== false} onChange={(e) => update("active", e.target.checked)} /> Active product</label>
    </section>
  </div>;
}

function VariationsStep({ template, selectedIds, onChange, hasVariations }) { return <div className="space-y-5"><ProductVariationMatrix template={template} selectedIds={selectedIds} onChange={onChange} hasTemplateVariations={hasVariations} /></div>; }

function ArtworkStep({ template, printOptions, artworkGroups, onArtworkGroupsChange, selectedVariations, isAdmin }) {
  return <div className="space-y-6"><ArtworkScopeSelector selectedVariations={selectedVariations} hasTemplateVariations={Boolean(asArray(template?.variations).length)} groups={artworkGroups} onChange={onArtworkGroupsChange} /><div className="border-t border-white/10 pt-6"><ScopedProductArtworkStudio template={template} printOptions={printOptions} artworkGroups={artworkGroups} onArtworkGroupsChange={onArtworkGroupsChange} selectedVariations={selectedVariations} isAdmin={isAdmin} /></div></div>;
}

function MockupsStep({ template, artworkGroups, selectedVariations, onArtworkGroupsChange, candidates, selectedImages, primaryImage, toggleImage, setPrimary, generatedMockups }) {
  return <div className="space-y-6"><ScopedArtworkMockupGenerator template={template} artworkGroups={artworkGroups} selectedVariations={selectedVariations} onArtworkGroupsChange={onArtworkGroupsChange} /><section className="card"><div className="overline mb-1">Storefront gallery</div><p className="text-sm text-zinc-500">Select which template and artwork-scope images appear on the storefront. One generated image can represent every size inside its artwork scope.</p><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">{candidates.map((candidate) => { const url = candidate.url; const selected = selectedImages.includes(url); const primary = primaryImage === url; return <button key={`${url}-${candidate.key || candidate.id || "image"}`} type="button" onClick={() => toggleImage(url)} className={`relative text-left rounded-xl overflow-hidden border ${selected ? "border-emerald-400" : "border-white/10"}`}><img src={assetUrl(url)} alt={candidate.label || "Product mockup"} className="w-full aspect-square object-contain bg-black" /><div className="p-3 bg-black/60"><div className="text-xs font-bold text-white">{candidate.label || "Mockup"}</div><div className="text-[10px] text-zinc-500 mt-1">{selected ? "Selected for storefront" : "Not selected"}</div></div>{selected && <span className="absolute top-2 left-2 text-[9px] uppercase tracking-widest bg-emerald-400 text-black px-2 py-1 rounded-full">Selected</span>}{primary && <span className="absolute top-2 right-2 text-[9px] uppercase tracking-widest bg-white text-black px-2 py-1 rounded-full">Primary</span>}<span className="absolute bottom-14 right-2"><span onClick={(event) => { event.stopPropagation(); setPrimary(url); }} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-black/80 text-[9px] uppercase tracking-widest text-white"><Star size={10} /> Make primary</span></span></button>; })}</div>{!candidates.length && <div className="mt-4 border border-dashed border-white/15 rounded-xl p-5 text-sm text-zinc-500">Generate an artwork-scope mockup first.</div>}<div className="mt-5 text-xs text-zinc-500">Generated images: {generatedMockups.length}. Storefront images selected: {selectedImages.length}.</div></section></div>;
}

function PricingStep({ form, update, pricing, selectedVariations, isAdmin }) { return <div className="space-y-6"><section className="card"><div className="overline mb-1">Live economics</div><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4"><Metric label="Base product" value={money(pricing.blank)} /><Metric label="Printing" value={money(pricing.print)} /><Metric label="Production total" value={money(pricing.production)} /><Metric label="Platform / commission" value={money(pricing.commission)} /></div><div className="mt-5 border border-white/10 rounded-xl p-5"><div className="text-xs uppercase tracking-widest text-zinc-500">Selling price</div><div className="flex items-center gap-2 mt-2"><span className="text-zinc-500">R</span><input className="input-base max-w-xs text-xl font-bold" type="number" min="0" step="0.01" value={form.selling_price} onChange={(e) => update("selling_price", e.target.value)} /></div><div className={`mt-4 text-lg font-bold ${pricing.profit >= 0 ? "text-emerald-300" : "text-red-300"}`}>Creator / fundraising amount: {money(pricing.profit)}</div><div className="text-xs text-zinc-500 mt-1">Minimum profitable price: {money(pricing.minimumSellingPrice || 0)}</div></div></section>{isAdmin && <label className="card flex items-center gap-3 text-sm"><input type="checkbox" checked={form.published} onChange={(e) => update("published", e.target.checked)} /> Publish when saved</label>}{selectedVariations.length > 1 && <div className="text-xs text-zinc-500">Variation pricing remains optional; leave it alone unless a particular attribute combination needs a different selling price.</div>}</div>; }

function ReviewStep({ form, product, selectedType, selectedTemplate, selectedVariations, readyArtworkSlots, generatedMockups, pricing, readyToPublish, isAdmin, saving, publishing, save, publishCreator }) {
  const published = Boolean(product && isCreatorProductPublished(product));
  return <div className="space-y-6"><section className="card"><div className="overline mb-1">Final product check</div><div className="grid md:grid-cols-2 gap-4 mt-5"><Info label="Product" value={form.title || "Untitled"} /><Info label="Type" value={selectedType?.name || form.category || "Not selected"} /><Info label="Template" value={selectedTemplate?.name || "Not selected"} /><Info label="Variations" value={selectedVariations.length ? `${selectedVariations.length} selected` : "Standard product"} /><Info label="Artwork scopes" value={`${asArray(form.artwork_groups).length}`} /><Info label="Artwork ready" value={`${readyArtworkSlots.length}`} /><Info label="Mockups" value={`${generatedMockups.length} generated`} /><Info label="Storefront gallery" value={`${form.mockup_images.length} selected`} /><Info label="Selling price" value={money(form.selling_price)} /></div></section><section className="card"><div className="overline mb-3">Readiness</div><Checklist done={Boolean(form.title.trim()) && Boolean(selectedType)} label="Product basics complete" /><Checklist done={Boolean(form.template_id)} label="Template selected and specs loaded" /><Checklist done={!asArray(selectedTemplate?.variations).length || selectedVariations.length > 0} label="Attribute combinations selected" /><Checklist done={readyArtworkSlots.length > 0} label="Artwork uploaded and routed" /><Checklist done={generatedMockups.length > 0} label="Artwork-scope mockups generated" /><Checklist done={form.mockup_images.length > 0} label="Storefront gallery selected" /><Checklist done={pricing.canPublishWithOverride} label="Pricing covers required costs" /></section><section className="card"><div className="overline mb-3">Action</div>{isAdmin ? <button type="button" className="btn-primary" disabled={saving} onClick={() => save({ publish: true })}>Save & Publish</button> : published ? <div className="text-sm text-emerald-300">Product is published.</div> : <div className="flex flex-wrap gap-3"><button type="button" className="btn-primary" disabled={saving} onClick={() => save()}>Save Product</button><button type="button" className="btn-secondary" disabled={saving || publishing || !readyToPublish} onClick={() => save({ publish: true })}>{publishing ? "Publishing…" : "Save & Submit / Publish"}</button></div>}{!readyToPublish && !isAdmin && <div className="text-xs text-zinc-500 mt-3">Complete artwork, scope mockups and profitable pricing before publishing.</div>}</section></div>;
}

function Field({ label, children }) { return <div><label className="label">{label}</label>{children}</div>; }
function Info({ label, value }) { return <div className="border border-white/10 rounded-xl p-3"><div className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</div><div className="text-sm text-white mt-1 break-words">{value || "—"}</div></div>; }
function Metric({ label, value }) { return <div className="border border-white/10 rounded-xl p-4"><div className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</div><div className="text-xl font-bold text-white mt-1">{value}</div></div>; }
function Checklist({ done, label }) { return <div className="flex items-center gap-3 py-2 text-sm"><span className={`w-5 h-5 rounded-full border flex items-center justify-center ${done ? "border-emerald-400 bg-emerald-400 text-black" : "border-white/15 text-zinc-600"}`}>{done && <Check size={12} />}</span><span className={done ? "text-white" : "text-zinc-500"}>{label}</span></div>; }
