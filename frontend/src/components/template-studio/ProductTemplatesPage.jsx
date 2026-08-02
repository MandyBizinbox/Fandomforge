import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Copy, Plus, Brush, Image as ImageIcon, Archive, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { http, assetUrl } from "../../lib/api";
import StatusBadge from "../StatusBadge";
import { money, safeArray } from "./templateStudioUtils";
import {
  methodKey as resolvedMethodKey,
  templatePrintOptions as resolveTemplatePrintOptions,
  templatePricingInfo,
} from "../../lib/cataloguePricingUtils";

const INACTIVE_METHOD_KEYS = ["laser", "screen print", "screen printing", "screen_print", "embroidery"];

function normalise(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function firstTruthy(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") || "";
}

function collectionFromResponse(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function looksLikeId(value) {
  const text = String(value || "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) || /^[0-9a-f]{24}$/i.test(text);
}

function productTypeLabel(type = {}) {
  return firstTruthy(type.name, type.label, type.title, type.display_name, type.slug, type.id, "Unnamed product type");
}

function productTypeKeys(type = {}) {
  return [type.id, type._id, type.slug, type.key, type.name].filter(Boolean).map(String);
}

function buildProductTypeLookup(productTypes = []) {
  const map = new Map();
  safeArray(productTypes).forEach((type) => {
    const label = productTypeLabel(type);
    productTypeKeys(type).forEach((key) => {
      if (!map.has(key)) map.set(key, label);
    });
  });
  return map;
}

function templateProductTypeKeys(template = {}) {
  return [
    template.product_type_id,
    template.product_type,
    template.product_type_slug,
    template.product_type_name,
  ].filter(Boolean).map(String);
}

function templateProductTypeValue(template = {}) {
  return firstTruthy(
    template.product_type_id,
    template.product_type,
    template.product_type_slug,
    template.product_type_name
  );
}

function templateProductTypeLabel(template = {}, productTypeLookup = new Map()) {
  const keys = templateProductTypeKeys(template);
  for (const key of keys) {
    const label = productTypeLookup.get(String(key));
    if (label) return label;
  }

  const fallback = firstTruthy(template.product_type_name, template.product_type, template.product_type_slug, template.product_type_id);
  if (!fallback) return "Unassigned product type";
  return looksLikeId(fallback) ? "Unknown product type" : fallback;
}

function firstVariationOverrideImage(variation = {}) {
  return Object.values(variation.mockup_screen_overrides || {}).find(Boolean) || "";
}

function templateImage(template = {}) {
  return firstTruthy(
    template.creator_catalogue_thumbnail_url,
    template.product_image_url,
    template.mockup_url,
    safeArray(template.mockup_images)[0],
    safeArray(template.variations).find((variation) => variation.image_url)?.image_url,
    safeArray(template.variations).map(firstVariationOverrideImage).find(Boolean),
    safeArray(template.mockup_screens).find((screen) => screen.image_url)?.image_url
  );
}

function hasVariationImage(variation = {}) {
  return Boolean(variation.image_url || variation.product_image_url || variation.mockup_image_url || firstVariationOverrideImage(variation));
}

function blankCost(template = {}) {
  const enabledVariations = safeArray(template.variations).filter((variation) => variation.enabled !== false && variation.status !== "archived");
  const variationCosts = enabledVariations
    .map((variation) => Number(variation.creator_blank_price ?? variation.base_blank_cost ?? variation.platform_blank_cost ?? variation.cost ?? 0))
    .filter((value) => value > 0);

  if (variationCosts.length) return Math.min(...variationCosts);

  return Number(
    template.creator_blank_price ??
    template.base_blank_cost ??
    template.base_price ??
    template.platform_blank_cost ??
    0
  );
}

function templatePrintOptions(template = {}, globalPrintOptions = []) {
  return resolveTemplatePrintOptions(template, globalPrintOptions);
}

function activeV1Options(template = {}, globalPrintOptions = []) {
  return templatePricingInfo(template, globalPrintOptions).activeOptions;
}

function readiness(template = {}, globalPrintOptions = []) {
  const enabledVariations = safeArray(template.variations).filter((variation) => variation.enabled !== false && variation.status !== "archived");
  const activeScreens = safeArray(template.mockup_screens).filter((screen) => screen.status !== "archived" && !screen.archived && !screen.deleted);
  const activeAreas = safeArray(template.print_areas).filter((area) => area.status !== "archived" && !area.archived && !area.deleted);
  const hasTemplateImageFallback = Boolean(
    activeScreens.some((screen) => screen.image_url)
    || template.product_image_url
    || template.mockup_url
    || safeArray(template.mockup_images)[0]
  );
  const pricingInfo = templatePricingInfo(template, globalPrintOptions);
  const activeMethods = activeV1Options(template, globalPrintOptions);

  const checks = {
    mainImage: Boolean(templateImage(template)),
    variationImages:
      enabledVariations.length === 0
      || hasTemplateImageFallback
      || enabledVariations.every(hasVariationImage),
    blankCost: blankCost(template) > 0,
    activePrintMethod: activeMethods.length > 0,
    printAreas: activeAreas.length > 0,
    printAreaViews: activeScreens.length > 0,
    mockup: Boolean(template.mockup_url || safeArray(template.mockup_images)[0] || activeScreens.some((screen) => screen.image_url)),
    creatorPricing: pricingInfo.hasPricing && blankCost(template) > 0,
  };

  const missing = [];
  if (!checks.mainImage) missing.push("image");
  if (!checks.variationImages) missing.push("variation images");
  if (!checks.blankCost) missing.push("blank cost");
  if (!checks.activePrintMethod) missing.push("V1 print method");
  if (!checks.printAreas) missing.push("print areas");
  if (!checks.printAreaViews) missing.push("print area views");
  if (!checks.mockup) missing.push("mockups");
  if (!checks.creatorPricing) missing.push("creator pricing");

  const statusKey = normalise(template.status);
  const pricingReady = checks.blankCost && checks.activePrintMethod && checks.creatorPricing;
  const launchReady = statusKey === "launch ready" || statusKey === "launch_ready" || (statusKey === "active" && missing.length === 0);

  let label = "Draft";
  if (statusKey === "inactive" || statusKey === "archived") label = "Inactive";
  else if (launchReady) label = "Launch ready";
  else if (!checks.mainImage) label = "Needs images";
  else if (!checks.variationImages) label = "Needs variation images";
  else if (!checks.printAreas || !checks.printAreaViews) label = "Needs print areas";
  else if (!checks.blankCost || !checks.creatorPricing) label = "Needs pricing";
  else if (!checks.mockup) label = "Needs mockups";
  else if (pricingReady) label = "Pricing ready";

  return { checks, missing, pricingReady, launchReady, label, activeMethods, pricingInfo };
}

function countWhere(templates, predicate, globalPrintOptions = []) {
  return safeArray(templates).filter((template) => predicate(readiness(template, globalPrintOptions), template)).length;
}

function templateStats(templates, globalPrintOptions = []) {
  const rows = safeArray(templates);
  return {
    total: rows.length,
    active: rows.filter((template) => !["inactive", "archived"].includes(normalise(template.status))).length,
    launchReady: countWhere(rows, (ready) => ready.launchReady, globalPrintOptions),
    missingImages: countWhere(rows, (ready) => !ready.checks.mainImage, globalPrintOptions),
    missingVariationImages: countWhere(rows, (ready) => !ready.checks.variationImages, globalPrintOptions),
    missingBlankCost: countWhere(rows, (ready) => !ready.checks.blankCost, globalPrintOptions),
    missingPrintAreas: countWhere(rows, (ready) => !ready.checks.printAreas || !ready.checks.printAreaViews, globalPrintOptions),
    missingMockups: countWhere(rows, (ready) => !ready.checks.mockup, globalPrintOptions),
    missingCreatorPricing: countWhere(rows, (ready) => !ready.checks.creatorPricing, globalPrintOptions),
    inactiveMethods: countWhere(
      rows,
      (ready, template) => templatePrintOptions(template, globalPrintOptions).some((option) => INACTIVE_METHOD_KEYS.some((inactive) => resolvedMethodKey(option).includes(inactive))),
      globalPrintOptions
    ),
    manualReview: countWhere(rows, (ready) => !ready.launchReady, globalPrintOptions),
  };
}

function readinessMatchesFilter(template, filter, globalPrintOptions = []) {
  if (filter === "all") return true;
  const ready = readiness(template, globalPrintOptions);

  if (filter === "launch_ready") return ready.launchReady;
  if (filter === "pricing_ready") return ready.pricingReady;
  if (filter === "needs_images") return !ready.checks.mainImage;
  if (filter === "needs_variation_images") return !ready.checks.variationImages;
  if (filter === "needs_blank_cost") return !ready.checks.blankCost;
  if (filter === "needs_print_areas") return !ready.checks.printAreas || !ready.checks.printAreaViews;
  if (filter === "needs_mockups") return !ready.checks.mockup;
  if (filter === "needs_creator_pricing") return !ready.checks.creatorPricing;
  if (filter === "inactive_methods") return templatePrintOptions(template, globalPrintOptions).some((option) => INACTIVE_METHOD_KEYS.some((inactive) => resolvedMethodKey(option).includes(inactive)));
  if (filter === "manual_review") return !ready.launchReady;

  return true;
}

export default function ProductTemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [printOptions, setPrintOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [duplicatingId, setDuplicatingId] = useState("");
  const [archivingId, setArchivingId] = useState("");
  const [status, setStatus] = useState("all");
  const [readinessFilter, setReadinessFilter] = useState("all");
  const [productTypeFilter, setProductTypeFilter] = useState("all");
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const qs = status !== "all" ? `?status=${status}` : "";
      const [templateResponse, printOptionResponse, productTypeResponse] = await Promise.all([
        http.get(`/admin/product-templates${qs}`),
        http.get("/print-options").catch(() => ({ data: [] })),
        http.get("/admin/product-types").catch(() => http.get("/product-types").catch(() => ({ data: [] }))),
      ]);
      setTemplates(collectionFromResponse(templateResponse.data));
      setPrintOptions(collectionFromResponse(printOptionResponse.data));
      setProductTypes(collectionFromResponse(productTypeResponse.data));
    } catch (error) {
      setTemplates([]);
      setPrintOptions([]);
      setProductTypes([]);
      toast.error(error.response?.data?.detail || "Could not load product templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const productTypeLookup = useMemo(() => buildProductTypeLookup(productTypes), [productTypes]);

  const productTypeOptions = useMemo(() => {
    const map = new Map();

    safeArray(productTypes).forEach((type) => {
      const label = productTypeLabel(type);
      const key = String(firstTruthy(type.id, type._id, type.slug, type.name));
      if (key) map.set(key, label);
    });

    safeArray(templates).forEach((template) => {
      const value = templateProductTypeValue(template);
      if (!value) return;
      const key = String(value);
      if (!map.has(key)) map.set(key, templateProductTypeLabel(template, productTypeLookup));
    });

    return Array.from(map.entries())
      .filter(([, label]) => label && !looksLikeId(label))
      .sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  }, [templates, productTypes, productTypeLookup]);

  const filteredTemplates = useMemo(
    () =>
      safeArray(templates).filter((template) => {
        const matchesReadiness = readinessMatchesFilter(template, readinessFilter, printOptions);
        const keys = templateProductTypeKeys(template);
        const matchesProductType = productTypeFilter === "all" || keys.includes(String(productTypeFilter));
        return matchesReadiness && matchesProductType;
      }),
    [templates, readinessFilter, printOptions, productTypeFilter]
  );

  const stats = useMemo(() => templateStats(templates, printOptions), [templates, printOptions]);

  const duplicateTemplate = async (event, template) => {
    event.preventDefault();
    event.stopPropagation();

    if (!template?.id) return;

    setDuplicatingId(template.id);
    try {
      const response = await http.post(`/admin/product-templates/duplicate/${template.id}`);
      toast.success("Template duplicated");
      await load();
      if (response.data?.id) navigate(`/admin/product-templates/${response.data.id}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not duplicate template");
    } finally {
      setDuplicatingId("");
    }
  };

  const archiveTemplate = async (event, template) => {
    event.preventDefault();
    event.stopPropagation();

    if (!template?.id) return;
    const isArchived = normalise(template.status) === "archived";
    const action = isArchived ? "restore" : "archive";

    if (!isArchived) {
      const confirmed = window.confirm(
        `Archive template "${template.name}"?\n\nThis removes it from active template workflows, but keeps the production data for safety.`
      );
      if (!confirmed) return;
    }

    setArchivingId(template.id);
    try {
      await http.patch(`/admin/product-templates/${template.id}`, {
        status: isArchived ? "active" : "archived",
      });
      toast.success(isArchived ? "Template restored" : "Template archived");
      await load();
    } catch (error) {
      toast.error(error.response?.data?.detail || `Could not ${action} template`);
    } finally {
      setArchivingId("");
    }
  };

  return (
    <div data-testid="admin-product-templates-page">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-8">
        <div>
          <div className="overline mb-2">Production catalogue</div>
          <h1 className="font-display text-5xl uppercase">Product Templates</h1>
          <p className="text-zinc-400 text-sm mt-3 max-w-2xl">
            Build blank product templates with variation images, production costs, mockup views and printable areas.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <select className="input-base md:w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="launch_ready">Launch ready</option>
            <option value="draft">Draft</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
          <select className="input-base md:w-56" value={productTypeFilter} onChange={(e) => setProductTypeFilter(e.target.value)}>
            <option value="all">All product types</option>
            {productTypeOptions.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select className="input-base md:w-56" value={readinessFilter} onChange={(e) => setReadinessFilter(e.target.value)}>
            <option value="all">All readiness</option>
            <option value="launch_ready">Launch-ready templates</option>
            <option value="pricing_ready">Pricing ready</option>
            <option value="needs_images">Missing images</option>
            <option value="needs_variation_images">Missing variation images</option>
            <option value="needs_blank_cost">Missing blank cost</option>
            <option value="needs_print_areas">Missing print areas/views</option>
            <option value="needs_mockups">Missing mockups</option>
            <option value="needs_creator_pricing">Missing creator pricing</option>
            <option value="inactive_methods">Using inactive methods</option>
            <option value="manual_review">Manual review required</option>
          </select>
          <button type="button" onClick={() => navigate("/admin/product-templates/new")} className="btn-primary">
            <Plus size={14} /> New Template
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-0 border border-white/10 mb-6">
        <ReadinessStat label="Total templates" value={stats.total} />
        <ReadinessStat label="Active templates" value={stats.active} />
        <ReadinessStat label="Launch-ready" value={stats.launchReady} positive />
        <ReadinessStat label="Missing images" value={stats.missingImages} warning />
        <ReadinessStat label="Missing pricing" value={stats.missingCreatorPricing} warning />
        <ReadinessStat label="Missing variation images" value={stats.missingVariationImages} warning />
        <ReadinessStat label="Missing blank cost" value={stats.missingBlankCost} warning />
        <ReadinessStat label="Missing print areas" value={stats.missingPrintAreas} warning />
        <ReadinessStat label="Missing mockups" value={stats.missingMockups} warning />
        <ReadinessStat label="Manual review" value={stats.manualReview} warning />
      </div>

      {loading ? (
        <div className="card text-zinc-400">Loading templates...</div>
      ) : filteredTemplates.length === 0 ? (
        <div className="card text-center py-12">
          <Brush className="mx-auto mb-4 text-[#FF3B30]" size={40} />
          <div className="font-display text-3xl uppercase mb-2">No templates found</div>
          <p className="text-zinc-400 text-sm mb-6">Adjust the filters or create your first production-safe blank product template.</p>
          <button type="button" onClick={() => navigate("/admin/product-templates/new")} className="btn-primary mx-auto">
            <Plus size={14} /> Create Template
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredTemplates.map((template) => {
            const image = templateImage(template);
            const ready = readiness(template, printOptions);
            const isArchived = normalise(template.status) === "archived";
            const areas = safeArray(template.print_areas).filter((area) => area.status !== "archived" && !area.archived && !area.deleted).length;
            const views = safeArray(template.mockup_screens).filter((screen) => screen.status !== "archived" && !screen.archived && !screen.deleted).length;

            return (
              <div key={template.id} className={`text-left border border-white/15 bg-white/[0.03] hover:border-[#FF3B30] transition-colors ${isArchived ? "opacity-60" : ""}`}>
                <button type="button" onClick={() => navigate(`/admin/product-templates/${template.id}`)} className="block w-full text-left">
                  <div className="aspect-[4/3] bg-black border-b border-white/10 flex items-center justify-center overflow-hidden">
                    {image ? <img src={assetUrl(image)} alt={template.name} className="w-full h-full object-contain" /> : <ImageIcon className="text-zinc-700" size={44} />}
                  </div>
                </button>

                <div className="p-5">
                  <button type="button" onClick={() => navigate(`/admin/product-templates/${template.id}`)} className="block w-full text-left">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <h2 className="font-display text-2xl uppercase leading-tight">{template.name}</h2>
                        <p className="text-xs text-zinc-500 mt-1">{template.brand || "No brand"} {template.blank_sku ? `· ${template.blank_sku}` : ""}</p>
                        <p className="text-[11px] text-zinc-600 mt-1">{templateProductTypeLabel(template, productTypeLookup)}</p>
                      </div>
                      <StatusBadge status={template.status || "draft"} />
                    </div>

                    <div className="mb-4 border border-white/10 bg-black/20 rounded-xl p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-widest text-zinc-500">Readiness</div>
                          <div className="font-bold text-sm mt-1">{ready.label}</div>
                        </div>
                        {ready.launchReady ? <CheckCircle2 size={22} className="text-[#34C759]" /> : <AlertTriangle size={22} className="text-[#FFB020]" />}
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-2">
                        {ready.missing.length ? `Needs ${ready.missing.join(", ")}` : "All launch checks pass."}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs text-zinc-400">
                      <div className="border border-white/10 p-2"><span className="overline block mb-1">Cost</span>{money(blankCost(template))}</div>
                      <div className="border border-white/10 p-2"><span className="overline block mb-1">Vars</span>{safeArray(template.variations).length}</div>
                      <div className="border border-white/10 p-2"><span className="overline block mb-1">Areas</span>{areas}/{views}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400 mt-2">
                      <div className="border border-white/10 p-2"><span className="overline block mb-1">V1 methods</span>{ready.activeMethods.length}</div>
                      <div className="border border-white/10 p-2"><span className="overline block mb-1">Creator pricing</span>{ready.checks.creatorPricing ? "Ready" : "Missing"}</div>
                    </div>
                  </button>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <button type="button" onClick={() => navigate(`/admin/product-templates/${template.id}`)} className="btn-secondary text-xs">Edit</button>
                    <button type="button" onClick={(event) => duplicateTemplate(event, template)} disabled={duplicatingId === template.id} className="btn-secondary text-xs">
                      <Copy size={13} /> {duplicatingId === template.id ? "Duplicating…" : "Duplicate"}
                    </button>
                    <button
                      type="button"
                      onClick={(event) => archiveTemplate(event, template)}
                      disabled={archivingId === template.id}
                      className={isArchived ? "btn-secondary text-xs" : "btn-secondary text-xs border-[#FFB020]/50 text-[#FFB020]"}
                      title={isArchived ? "Restore template" : "Archive template"}
                    >
                      {isArchived ? <RotateCcw size={13} /> : <Archive size={13} />}
                      {archivingId === template.id ? "Saving…" : isArchived ? "Restore" : "Archive"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReadinessStat({ label, value, positive = false, warning = false }) {
  return (
    <div className="p-4 border-r border-b border-white/10">
      <div className="overline mb-2">{label}</div>
      <div className={`font-display text-3xl ${positive ? "text-[#34C759]" : warning && value > 0 ? "text-[#FFB020]" : ""}`}>{value}</div>
    </div>
  );
}
