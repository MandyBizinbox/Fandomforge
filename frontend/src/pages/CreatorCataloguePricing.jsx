import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Image as ImageIcon, PackageSearch, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { http, assetUrl } from "../lib/api";
import StatusBadge from "../components/StatusBadge";
import {
  ACTIVE_V1_METHODS,
  methodLabel,
  normaliseKey,
  pricingBands as resolvePricingBands,
  safeArray,
  templatePricingInfo,
} from "../lib/cataloguePricingUtils";
import {
  templateBlankCost as resolvedTemplateBlankCost,
  templateImage as resolvedTemplateImage,
  templateReadiness as resolveTemplateReadiness,
} from "../lib/templateReadiness";

function money(value) {
  return `R ${Number(value || 0).toFixed(2)}`;
}

function firstTruthy(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") || "";
}

function firstVariationOverrideImage(variation = {}) {
  const overrides = variation.mockup_screen_overrides || {};
  return Object.values(overrides).find(Boolean) || "";
}

function templateImage(template = {}) {
  return resolvedTemplateImage(template);
}

function hasVariationImage(variation = {}) {
  return Boolean(variation.image_url || variation.product_image_url || variation.mockup_image_url || firstVariationOverrideImage(variation));
}

function blankCost(template = {}) {
  return resolvedTemplateBlankCost(template);
}

function recommendedBaseSellingPrice(template = {}) {
  return Number(
    template.recommended_base_selling_price ??
    template.recommended_selling_price ??
    template.default_selling_price ??
    template.selling_price ??
    0
  );
}

function pricingBands(template = {}, globalPrintOptions = []) {
  const blank = blankCost(template);
  return resolvePricingBands(template, globalPrintOptions).map((band) => ({
    ...band,
    estimated_total_base_cost: blank + Number(band.estimated_print_cost || 0),
  }));
}

function readiness(template = {}, globalPrintOptions = []) {
  const resolved = resolveTemplateReadiness(template, globalPrintOptions);
  return {
    ...resolved,
    bands: pricingBands(template, globalPrintOptions),
  };
}

function statsFor(templates, globalPrintOptions) {
  const rows = safeArray(templates).map((template) => readiness(template, globalPrintOptions));
  const activeTemplates = safeArray(templates).filter((template) => !["archived", "inactive"].includes(normaliseKey(template.status)));

  return {
    total: templates.length,
    active: activeTemplates.length,
    launchReady: rows.filter((row) => row.isLaunchReady).length,
    missingImages: rows.filter((row) => !row.checks.mainImage).length,
    missingVariationImages: rows.filter((row) => !row.checks.variationImages).length,
    missingBlankCost: rows.filter((row) => !row.checks.blankCost).length,
    missingPrintAreas: rows.filter((row) => !row.checks.printAreas || !row.checks.printAreaViews).length,
    missingMockups: rows.filter((row) => !row.checks.mockup).length,
    missingCreatorPricing: rows.filter((row) => !row.checks.creatorPricing).length,
    manualReview: rows.filter((row) => !row.isLaunchReady).length,
  };
}

function uniqueValues(rows, getter) {
  return Array.from(new Set(safeArray(rows).map(getter).filter(Boolean))).sort();
}

export default function CreatorCataloguePricing() {
  const [templates, setTemplates] = useState([]);
  const [printOptions, setPrintOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    category: "",
    productType: "",
    printMethod: "",
    launchReadyOnly: false,
    activeOnly: true,
    missingPricing: false,
    missingImage: false,
  });

  const load = async () => {
    setLoading(true);
    try {
      const [templateRes, printOptionRes] = await Promise.all([
        http.get("/product-templates"),
        http.get("/print-options").catch(() => ({ data: [] })),
      ]);
      setTemplates(safeArray(templateRes.data));
      setPrintOptions(safeArray(printOptionRes.data));
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not load catalogue pricing");
      setTemplates([]);
      setPrintOptions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => {
    return safeArray(templates).map((template) => {
      const ready = readiness(template, printOptions);
      return {
        template,
        ready,
        image: templateImage(template),
        blank: blankCost(template),
        recommended: recommendedBaseSellingPrice(template),
        methods: Array.from(new Set(ready.options.map(methodLabel))),
      };
    });
  }, [templates, printOptions]);

  const categories = useMemo(() => uniqueValues(templates, (template) => template.category || template.category_slug), [templates]);
  const productTypes = useMemo(() => uniqueValues(templates, (template) => template.product_type || template.product_type_slug || template.product_type_name), [templates]);
  const methods = ACTIVE_V1_METHODS;

  const filteredRows = useMemo(() => {
    return rows.filter(({ template, ready, methods: rowMethods }) => {
      const statusKey = normaliseKey(template.status);
      if (filters.activeOnly && ["inactive", "archived"].includes(statusKey)) return false;
      if (filters.category && (template.category || template.category_slug) !== filters.category) return false;
      if (filters.productType && (template.product_type || template.product_type_slug || template.product_type_name) !== filters.productType) return false;
      if (filters.printMethod && !rowMethods.includes(filters.printMethod)) return false;
      if (filters.launchReadyOnly && !ready.isLaunchReady) return false;
      if (filters.missingPricing && ready.checks.creatorPricing) return false;
      if (filters.missingImage && ready.checks.mainImage) return false;
      return true;
    });
  }, [rows, filters]);

  const stats = useMemo(() => statsFor(templates, printOptions), [templates, printOptions]);

  const patchFilter = (patch) => setFilters((current) => ({ ...current, ...patch }));

  return (
    <div className="min-h-screen page-shell px-4 py-8 md:px-8" data-testid="creator-catalogue-pricing-page">
      <div className="max-w-[1500px] mx-auto">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-8">
          <div>
            <Link to="/creator" className="btn-secondary text-xs mb-5 inline-flex">
              <ArrowLeft size={14} /> Back to Creator Console
            </Link>
            <div className="overline mb-2">Creator Catalogue</div>
            <h1 className="font-display text-5xl uppercase">Catalogue Pricing</h1>
            <p className="text-sm text-[var(--ff-muted-text)] mt-3 max-w-3xl">
              Use this catalogue to view available blanks, base costs and estimated print costs for standard print sizes. Pricing is indicative and may change depending on artwork, print method, quantity and supplier availability.
            </p>
          </div>
          <button type="button" onClick={load} className="btn-secondary" disabled={loading}>
            <RefreshCw size={14} /> {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-0 border border-[var(--ff-card-border)] mb-6">
          <Stat label="Total templates" value={stats.total} />
          <Stat label="Active templates" value={stats.active} />
          <Stat label="Launch ready" value={stats.launchReady} />
          <Stat label="Missing images" value={stats.missingImages} />
          <Stat label="Missing pricing" value={stats.missingCreatorPricing} />
        </div>

        <div className="card mb-6">
          <div className="overline mb-3">Filters</div>
          <div className="grid md:grid-cols-4 xl:grid-cols-7 gap-3">
            <select className="input-base" value={filters.category} onChange={(event) => patchFilter({ category: event.target.value })}>
              <option value="">All categories</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>

            <select className="input-base" value={filters.productType} onChange={(event) => patchFilter({ productType: event.target.value })}>
              <option value="">All product types</option>
              {productTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>

            <select className="input-base" value={filters.printMethod} onChange={(event) => patchFilter({ printMethod: event.target.value })}>
              <option value="">All V1 methods</option>
              {methods.map((method) => <option key={method} value={method}>{method}</option>)}
            </select>

            <label className="flex items-center gap-2 text-xs uppercase tracking-widest border border-[var(--ff-card-border)] px-3 py-2">
              <input type="checkbox" checked={filters.launchReadyOnly} onChange={(event) => patchFilter({ launchReadyOnly: event.target.checked })} />
              Launch-ready only
            </label>

            <label className="flex items-center gap-2 text-xs uppercase tracking-widest border border-[var(--ff-card-border)] px-3 py-2">
              <input type="checkbox" checked={filters.activeOnly} onChange={(event) => patchFilter({ activeOnly: event.target.checked })} />
              Active only
            </label>

            <label className="flex items-center gap-2 text-xs uppercase tracking-widest border border-[var(--ff-card-border)] px-3 py-2">
              <input type="checkbox" checked={filters.missingPricing} onChange={(event) => patchFilter({ missingPricing: event.target.checked })} />
              Missing pricing
            </label>

            <label className="flex items-center gap-2 text-xs uppercase tracking-widest border border-[var(--ff-card-border)] px-3 py-2">
              <input type="checkbox" checked={filters.missingImage} onChange={(event) => patchFilter({ missingImage: event.target.checked })} />
              Missing image
            </label>
          </div>
        </div>

        <div className="border border-[var(--ff-card-border)] overflow-x-auto">
          <table className="table-brutal min-w-[1350px]">
            <thead>
              <tr>
                <th>Product image</th>
                <th>Product name</th>
                <th>Type / category</th>
                <th>SKU</th>
                <th>Blank cost</th>
                <th>Recommended base selling price</th>
                <th>Available print methods</th>
                <th>Standard print size options</th>
                <th>Estimated print cost</th>
                <th>Estimated total base cost</th>
                <th>Launch-ready status</th>
                <th>Notes / restrictions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(({ template, ready, image, blank, recommended, methods: rowMethods }) => {
                const primaryBand = ready.bands[0] || null;
                return (
                  <tr key={template.id}>
                    <td>
                      <div className="w-20 h-20 border border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)] flex items-center justify-center overflow-hidden">
                        {image ? <img src={assetUrl(image)} alt={template.name} className="w-full h-full object-contain" /> : <ImageIcon size={22} className="text-[var(--ff-muted-text)]" />}
                      </div>
                    </td>
                    <td>
                      <div className="font-bold">{template.name}</div>
                      <div className="text-xs text-[var(--ff-muted-text)]">{safeArray(template.variations).length} variation(s)</div>
                    </td>
                    <td>
                      <div>{template.product_type_name || template.product_type || "—"}</div>
                      <div className="text-xs text-[var(--ff-muted-text)]">{template.category || "—"}</div>
                    </td>
                    <td>{template.blank_sku || template.sku || "—"}</td>
                    <td>{blank > 0 ? money(blank) : "—"}</td>
                    <td>{recommended > 0 ? money(recommended) : "—"}</td>
                    <td>{rowMethods.length ? rowMethods.join(", ") : "—"}</td>
                    <td>{ready.bands.length ? ready.bands.map((band) => band.size_band).join(", ") : "—"}</td>
                    <td>{primaryBand ? money(primaryBand.estimated_print_cost) : "—"}</td>
                    <td>{primaryBand ? money(primaryBand.estimated_total_base_cost) : "—"}</td>
                    <td>
                      <StatusBadge status={ready.isLaunchReady ? "active" : ready.pricingReady ? "pending" : "draft"} />
                      <div className="text-[11px] text-[var(--ff-muted-text)] mt-1">{ready.label}</div>
                    </td>
                    <td>
                      {ready.missing.length ? (
                        <span>Needs {ready.missing.join(", ")}</span>
                      ) : (
                        <span>Ready for creator product setup</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={12} className="p-10 text-center text-[var(--ff-muted-text)]">
                    <PackageSearch className="mx-auto mb-3" />
                    No catalogue pricing rows match the selected filters.
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td colSpan={12} className="p-10 text-center text-[var(--ff-muted-text)] overline">Loading catalogue pricing…</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card mt-6 text-xs text-[var(--ff-muted-text)] leading-relaxed">
          <div className="overline mb-2">V1 method boundary</div>
          <p>
            Sellable methods shown here are limited to Sublimation, DTF Transfers, HTV, UV DTF and Adhesive Vinyl. Laser, Screen Printing and Embroidery are treated as non-V1 methods and are not shown as sellable catalogue pricing options.
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="p-4 border-r border-b border-[var(--ff-card-border)]">
      <div className="overline mb-2">{label}</div>
      <div className="font-display text-3xl">{value}</div>
    </div>
  );
}
