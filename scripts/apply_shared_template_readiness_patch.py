#!/usr/bin/env python3
"""Replace duplicate template readiness calculations with the shared resolver."""
from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ADMIN = ROOT / "frontend" / "src" / "components" / "template-studio" / "ProductTemplatesPage.jsx"
CREATOR = ROOT / "frontend" / "src" / "pages" / "CreatorCataloguePricing.jsx"


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"ABORT: expected one {label} block, found {count}.")
    return source.replace(old, new, 1)


def patch_admin(source: str) -> str:
    source = replace_once(
        source,
        '''} from "../../lib/cataloguePricingUtils";\n''',
        '''} from "../../lib/cataloguePricingUtils";\nimport {\n  templateBlankCost as resolvedTemplateBlankCost,\n  templateImage as resolvedTemplateImage,\n  templateReadiness as resolveTemplateReadiness,\n} from "../../lib/templateReadiness";\n''',
        "admin readiness import",
    )

    source = replace_once(
        source,
        '''function templateImage(template = {}) {\n  return firstTruthy(\n    template.creator_catalogue_thumbnail_url,\n    template.product_image_url,\n    template.mockup_url,\n    safeArray(template.mockup_images)[0],\n    safeArray(template.variations).find((variation) => variation.image_url)?.image_url,\n    safeArray(template.variations).map(firstVariationOverrideImage).find(Boolean),\n    safeArray(template.mockup_screens).find((screen) => screen.image_url)?.image_url\n  );\n}\n''',
        '''function templateImage(template = {}) {\n  return resolvedTemplateImage(template);\n}\n''',
        "admin template image",
    )

    source = replace_once(
        source,
        '''function blankCost(template = {}) {\n  const enabledVariations = safeArray(template.variations).filter((variation) => variation.enabled !== false && variation.status !== "archived");\n  const variationCosts = enabledVariations\n    .map((variation) => Number(variation.creator_blank_price ?? variation.base_blank_cost ?? variation.platform_blank_cost ?? variation.cost ?? 0))\n    .filter((value) => value > 0);\n\n  if (variationCosts.length) return Math.min(...variationCosts);\n\n  return Number(\n    template.creator_blank_price ??\n    template.base_blank_cost ??\n    template.base_price ??\n    template.platform_blank_cost ??\n    0\n  );\n}\n''',
        '''function blankCost(template = {}) {\n  return resolvedTemplateBlankCost(template);\n}\n''',
        "admin blank cost",
    )

    start = source.index("function readiness(template = {}, globalPrintOptions = []) {")
    end_marker = "\n}\n\nfunction countWhere"
    end = source.index(end_marker, start) + 2
    source = (
        source[:start]
        + '''function readiness(template = {}, globalPrintOptions = []) {\n  return resolveTemplateReadiness(template, globalPrintOptions);\n}'''
        + source[end:]
    )
    return source


def patch_creator(source: str) -> str:
    source = replace_once(
        source,
        '''} from "../lib/cataloguePricingUtils";\n''',
        '''} from "../lib/cataloguePricingUtils";\nimport {\n  templateBlankCost as resolvedTemplateBlankCost,\n  templateImage as resolvedTemplateImage,\n  templateReadiness as resolveTemplateReadiness,\n} from "../lib/templateReadiness";\n''',
        "creator readiness import",
    )

    source = replace_once(
        source,
        '''function templateImage(template = {}) {\n  return firstTruthy(\n    template.creator_catalogue_thumbnail_url,\n    template.product_image_url,\n    template.mockup_url,\n    safeArray(template.mockup_images)[0],\n    safeArray(template.variations).find((variation) => variation.image_url)?.image_url,\n    safeArray(template.variations).map(firstVariationOverrideImage).find(Boolean),\n    safeArray(template.mockup_screens).find((screen) => screen.image_url)?.image_url\n  );\n}\n''',
        '''function templateImage(template = {}) {\n  return resolvedTemplateImage(template);\n}\n''',
        "creator template image",
    )

    source = replace_once(
        source,
        '''function blankCost(template = {}) {\n  const enabledVariations = safeArray(template.variations).filter((variation) => variation.enabled !== false && variation.status !== "archived");\n  const variationCosts = enabledVariations\n    .map((variation) => Number(variation.creator_blank_price ?? variation.base_blank_cost ?? variation.platform_blank_cost ?? variation.cost ?? 0))\n    .filter((value) => value > 0);\n\n  if (variationCosts.length) return Math.min(...variationCosts);\n\n  return Number(\n    template.creator_blank_price ??\n    template.base_blank_cost ??\n    template.base_price ??\n    template.platform_blank_cost ??\n    0\n  );\n}\n''',
        '''function blankCost(template = {}) {\n  return resolvedTemplateBlankCost(template);\n}\n''',
        "creator blank cost",
    )

    start = source.index("function readiness(template = {}, globalPrintOptions = []) {")
    end_marker = "\n}\n\nfunction statsFor"
    end = source.index(end_marker, start) + 2
    source = (
        source[:start]
        + '''function readiness(template = {}, globalPrintOptions = []) {\n  const resolved = resolveTemplateReadiness(template, globalPrintOptions);\n  return {\n    ...resolved,\n    bands: pricingBands(template, globalPrintOptions),\n  };\n}'''
        + source[end:]
    )
    return source


def main() -> None:
    admin_source = ADMIN.read_text(encoding="utf-8")
    creator_source = CREATOR.read_text(encoding="utf-8")

    if "resolveTemplateReadiness" in admin_source and "resolveTemplateReadiness" in creator_source:
        print("Shared readiness integration already applied.")
        return

    ADMIN.write_text(patch_admin(admin_source), encoding="utf-8")
    CREATOR.write_text(patch_creator(creator_source), encoding="utf-8")
    print("Applied shared template readiness integration.")


if __name__ == "__main__":
    main()
