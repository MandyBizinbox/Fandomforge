#!/usr/bin/env python3
"""Temporary guarded migration for the product-template list performance pass."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTES = ROOT / "backend" / "routes_main.py"
FRONTEND = ROOT / "frontend" / "src" / "components" / "template-studio" / "ProductTemplatesPage.jsx"


SUMMARY_BLOCK = r'''PRODUCT_TEMPLATE_LIST_PROJECTION: Dict[str, int] = {
    "_id": 0,
    "id": 1,
    "name": 1,
    "brand": 1,
    "blank_sku": 1,
    "status": 1,
    "category": 1,
    "product_type_id": 1,
    "product_type": 1,
    "product_type_slug": 1,
    "product_type_name": 1,
    "creator_catalogue_thumbnail_url": 1,
    "product_image_url": 1,
    "mockup_url": 1,
    "mockup_images": 1,
    "creator_blank_price": 1,
    "base_blank_cost": 1,
    "base_price": 1,
    "platform_blank_cost": 1,
    "creator_visible": 1,
    "admin_visible": 1,
    "template_gallery": 1,
    "print_options": 1,
    "print_option_ids": 1,
    "print_areas": 1,
    "variation_production_rules": 1,
    "production_rules": 1,
    "mockup_screens.id": 1,
    "mockup_screens.status": 1,
    "mockup_screens.archived": 1,
    "mockup_screens.deleted": 1,
    "mockup_screens.image_url": 1,
    "mockup_screens.view_key": 1,
    "mockup_screens.view": 1,
    "mockup_screens.screen_view": 1,
    "mockup_screens.name": 1,
    "variations.id": 1,
    "variations.attributes": 1,
    "variations.enabled": 1,
    "variations.status": 1,
    "variations.archived": 1,
    "variations.deleted": 1,
    "variations.image_url": 1,
    "variations.product_image_url": 1,
    "variations.mockup_image_url": 1,
    "variations.mockup_screen_overrides": 1,
    "variations.view_overrides": 1,
    "variations.creator_blank_price": 1,
    "variations.base_blank_cost": 1,
    "variations.platform_blank_cost": 1,
    "variations.cost": 1,
    "variations.print_area_overrides": 1,
    "variations.print_area_override": 1,
    "variations.print_width_mm": 1,
    "variations.width_mm": 1,
    "variations.print_area_width_mm": 1,
    "variations.print_height_mm": 1,
    "variations.height_mm": 1,
    "variations.print_area_height_mm": 1,
}


@admin_router.get("/product-templates/summary")
async def admin_product_template_summaries(
    request: Request,
    status: Optional[str] = None,
    category: Optional[str] = None,
    user: User = Depends(get_current_user),
):
    _require_manager_permission(user, "manage_product_templates")
    db = request.app.state.db
    q: Dict = {}

    if status:
        q["status"] = status

    if category:
        q["category"] = category

    return await (
        db.product_templates
        .find(q, PRODUCT_TEMPLATE_LIST_PROJECTION)
        .sort("name", 1)
        .to_list(1000)
    )


'''


HELPERS_BLOCK = r'''function resolvedReadiness(template, globalPrintOptions = [], readinessById = null) {
  const templateId = template?.id ? String(template.id) : "";
  return (templateId && readinessById?.get(templateId)) || readiness(template, globalPrintOptions);
}

function countWhere(templates, predicate, globalPrintOptions = [], readinessById = null) {
  return safeArray(templates).filter((template) =>
    predicate(resolvedReadiness(template, globalPrintOptions, readinessById), template)
  ).length;
}

function templateStats(templates, globalPrintOptions = [], readinessById = null) {
  const rows = safeArray(templates);
  const count = (predicate) => countWhere(rows, predicate, globalPrintOptions, readinessById);

  return {
    total: rows.length,
    active: rows.filter((template) => !["inactive", "archived"].includes(normalise(template.status))).length,
    launchReady: count((ready) => ready.launchReady),
    missingImages: count((ready) => !ready.checks.mainImage),
    missingVariationImages: count((ready) => !ready.checks.variationImages),
    missingBlankCost: count((ready) => !ready.checks.blankCost),
    missingPrintAreas: count((ready) => !ready.checks.printAreas || !ready.checks.printAreaViews),
    missingMockups: count((ready) => !ready.checks.mockup),
    missingCreatorPricing: count((ready) => !ready.checks.creatorPricing),
    inactiveMethods: count((ready) =>
      safeArray(ready.activeMethods).some((option) =>
        INACTIVE_METHOD_KEYS.some((inactive) => resolvedMethodKey(option).includes(inactive))
      )
    ),
    manualReview: count((ready) => !ready.launchReady),
  };
}

function readinessMatchesFilter(template, filter, globalPrintOptions = [], readinessById = null) {
  if (filter === "all") return true;
  const ready = resolvedReadiness(template, globalPrintOptions, readinessById);
'''


LOAD_BLOCK = r'''  const load = async () => {
    setLoading(true);
    const qs = status !== "all" ? `?status=${status}` : "";
    const templateRequest = http.get(`/admin/product-templates/summary${qs}`);
    const printOptionRequest = http.get("/print-options").catch(() => ({ data: [] }));
    const productTypeRequest = http.get("/admin/product-types").catch(() =>
      http.get("/product-types").catch(() => ({ data: [] }))
    );

    try {
      const templateResponse = await templateRequest;
      setTemplates(collectionFromResponse(templateResponse.data));
    } catch (error) {
      setTemplates([]);
      toast.error(error.response?.data?.detail || "Could not load product templates");
    } finally {
      setLoading(false);
    }

    const [printOptionResponse, productTypeResponse] = await Promise.all([
      printOptionRequest,
      productTypeRequest,
    ]);
    setPrintOptions(collectionFromResponse(printOptionResponse.data));
    setProductTypes(collectionFromResponse(productTypeResponse.data));
  };
'''


READINESS_CACHE = r'''  const readinessById = useMemo(() => {
    const map = new Map();
    safeArray(templates).forEach((template) => {
      if (!template?.id) return;
      map.set(String(template.id), readiness(template, printOptions));
    });
    return map;
  }, [templates, printOptions]);

'''


def transform_routes(source: str) -> str:
    if "PRODUCT_TEMPLATE_LIST_PROJECTION" in source:
        return source

    marker = '@admin_router.get("/product-templates", response_model=List[ProductTemplate])\n'
    if source.count(marker) != 1:
        raise RuntimeError("product template list route marker missing or duplicated")

    source = source.replace(marker, SUMMARY_BLOCK + marker, 1)

    if '@admin_router.get("/product-templates/summary")' not in source:
        raise RuntimeError("summary route was not inserted")
    return source


def transform_frontend(source: str) -> str:
    # Replace helper block up to (but not including) the filter-specific branches.
    helper_pattern = re.compile(
        r'function countWhere\(templates, predicate, globalPrintOptions = \[\]\) \{.*?'
        r'function readinessMatchesFilter\(template, filter, globalPrintOptions = \[\]\) \{\n'
        r'  if \(filter === "all"\) return true;\n'
        r'  const ready = readiness\(template, globalPrintOptions\);\n',
        re.S,
    )
    source, helper_count = helper_pattern.subn(HELPERS_BLOCK, source, count=1)
    if helper_count != 1 and "function resolvedReadiness" not in source:
        raise RuntimeError("template readiness helper block was not transformed")

    load_pattern = re.compile(
        r'  const load = async \(\) => \{.*?\n  \};\n\n  useEffect',
        re.S,
    )
    if 'http.get(`/admin/product-templates/summary${qs}`)' not in source:
        source, load_count = load_pattern.subn(LOAD_BLOCK + "\n  useEffect", source, count=1)
        if load_count != 1:
            raise RuntimeError("template list load block was not transformed")

    cache_marker = "  const filteredTemplates = useMemo(\n"
    if "const readinessById = useMemo(() => {" not in source:
        if source.count(cache_marker) != 1:
            raise RuntimeError("filteredTemplates marker missing or duplicated")
        source = source.replace(cache_marker, READINESS_CACHE + cache_marker, 1)

    source = source.replace(
        "const matchesReadiness = readinessMatchesFilter(template, readinessFilter, printOptions);",
        "const matchesReadiness = readinessMatchesFilter(template, readinessFilter, printOptions, readinessById);",
        1,
    )
    source = source.replace(
        "[templates, readinessFilter, printOptions, productTypeFilter]",
        "[templates, readinessFilter, printOptions, productTypeFilter, readinessById]",
        1,
    )
    source = source.replace(
        "const stats = useMemo(() => templateStats(templates, printOptions), [templates, printOptions]);",
        "const stats = useMemo(() => templateStats(templates, printOptions, readinessById), [templates, printOptions, readinessById]);",
        1,
    )
    source = source.replace(
        "const ready = readiness(template, printOptions);",
        "const ready = resolvedReadiness(template, printOptions, readinessById);",
        1,
    )

    required = (
        'http.get(`/admin/product-templates/summary${qs}`)',
        "const readinessById = useMemo(() => {",
        "templateStats(templates, printOptions, readinessById)",
        "resolvedReadiness(template, printOptions, readinessById)",
        "readinessMatchesFilter(template, readinessFilter, printOptions, readinessById)",
    )
    for needle in required:
        if needle not in source:
            raise RuntimeError(f"frontend performance invariant missing: {needle}")

    return source


def main() -> None:
    ROUTES.write_text(transform_routes(ROUTES.read_text(encoding="utf-8")), encoding="utf-8")
    FRONTEND.write_text(transform_frontend(FRONTEND.read_text(encoding="utf-8")), encoding="utf-8")
    print("template-list-performance-migration-ok")


if __name__ == "__main__":
    main()
