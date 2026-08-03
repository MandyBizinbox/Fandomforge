# Template Builder V2 implementation progress

## Implemented in current branch

- Shared print-area geometry contract.
- Rectangle, circle, ellipse, polygon and custom-mask geometry types.
- Bleed, safe margin, rotation and pricing-area mode fields in the frontend contract.
- Effective production resolver now merges template defaults, production rules and exact variation overrides.
- Creator catalogue pricing now evaluates effective variation print-area dimensions.
- Template print-area coverage counts inherited defaults as configured.
- Shaped print-area controls in Admin Template Studio.
- Circle creation and shape-aware canvas preview.
- Focused unit tests and pull-request CI.

## Still required before merge

- Persist new geometry, visibility, artwork-mode and gallery fields in backend Pydantic models.
- Expose creator/admin visibility controls in Template Studio.
- Reorder Template Studio navigation to Product → Variations → Print Areas → Print Rules → Gallery/Mockups → Readiness.
- Add role-based template image gallery.
- Add full-wrap to front/back/angled derived mockup rendering.
- Apply effective geometry clipping inside Creator Product Builder and production output.
- Replace duplicated readiness calculations with one shared readiness utility.
