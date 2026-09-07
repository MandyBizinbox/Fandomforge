#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILDER = ROOT / "frontend/src/components/product-builder/ProductBuilderV4.jsx"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one {label}, found {count}")
    return text.replace(old, new, 1)


def main():
    source = BUILDER.read_text(encoding="utf-8")

    source = replace_once(
        source,
        'import { http, assetUrl } from "../../lib/api";\n',
        'import { http, assetUrl } from "../../lib/api";\nimport { templateReadiness } from "../../lib/templateReadiness";\n',
        "template readiness import anchor",
    )

    source = replace_once(
        source,
        'function idKey(values) { return asArray(values).map(String).filter(Boolean).sort().join("|"); }\n',
        'function idKey(values) { return asArray(values).map(String).filter(Boolean).sort().join("|"); }\n'
        'function isBuilderSelectableTemplate(template, globalPrintOptions = []) {\n'
        '  return normalise(template?.status) === "active" && templateReadiness(template, globalPrintOptions).isLaunchReady;\n'
        '}\n',
        "eligibility helper anchor",
    )

    old_load = '''        const loadedTemplates = asArray(responses[0].data);\n        const loadedProductTypes = asArray(responses[2].data);\n        setTemplates(loadedTemplates); setPrintOptions(asArray(responses[1].data)); setProductTypes(loadedProductTypes);\n        let cursor = 3;\n        if (isAdmin) { setCreators(asArray(responses[cursor].data)); cursor += 1; }\n        if (!isNew) {\n          const existing = responses[cursor].data;\n          const existingTemplate = loadedTemplates.find((template) => String(template.id) === String(existing.template_id)) || null;\n'''
    new_load = '''        const loadedTemplates = asArray(responses[0].data);\n        const loadedPrintOptions = asArray(responses[1].data);\n        const loadedProductTypes = asArray(responses[2].data);\n        const selectableTemplates = loadedTemplates.filter((template) => isBuilderSelectableTemplate(template, loadedPrintOptions));\n        let templatesForBuilder = selectableTemplates;\n        setPrintOptions(loadedPrintOptions); setProductTypes(loadedProductTypes);\n        let cursor = 3;\n        if (isAdmin) { setCreators(asArray(responses[cursor].data)); cursor += 1; }\n        if (!isNew) {\n          const existing = responses[cursor].data;\n          const existingTemplate = loadedTemplates.find((template) => String(template.id) === String(existing.template_id)) || null;\n          if (existingTemplate && !selectableTemplates.some((template) => String(template.id) === String(existingTemplate.id))) {\n            templatesForBuilder = [...selectableTemplates, existingTemplate];\n          }\n'''
    source = replace_once(source, old_load, new_load, "template loading block")

    source = replace_once(
        source,
        '          if (type) setSelectedProductTypeId(type.id);\n        }\n',
        '          if (type) setSelectedProductTypeId(type.id);\n        }\n        setTemplates(templatesForBuilder);\n',
        "final template assignment anchor",
    )

    checks = [
        'import { templateReadiness } from "../../lib/templateReadiness";',
        'normalise(template?.status) === "active"',
        'templateReadiness(template, globalPrintOptions).isLaunchReady',
        'const selectableTemplates = loadedTemplates.filter',
        'templatesForBuilder = [...selectableTemplates, existingTemplate]',
        'setTemplates(templatesForBuilder);',
        'const validateStep = (key) =>',
        'const buildPayload = () =>',
        'const save = async ({ publish = false } = {}) =>',
    ]
    for marker in checks:
        if marker not in source:
            raise RuntimeError(f"Missing expected marker after transform: {marker}")

    BUILDER.write_text(source, encoding="utf-8")


if __name__ == "__main__":
    main()
