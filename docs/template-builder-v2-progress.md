# Template Builder V2 implementation progress

## Implemented in current branch

- Shared effective production resolver.
- Template defaults, matching production rules and exact variation overrides now resolve through one path.
- Creator pricing evaluates effective variation print-area dimensions.
- Shared readiness utility used by Admin and Creator Catalogue.
- Active templates with `creator_visible = false` are labelled `Hidden from creators`.
- Template print-area coverage counts inherited defaults as configured.
- Rectangle, circle, ellipse, polygon and custom-mask geometry types.
- Bleed, safe margin, rotation and pricing-area mode fields.
- Backend persistence for geometry, variation print-area overrides, visibility, artwork modes and semantic gallery rows.
- Ordered Template Studio sequence: Product → Variations → Editor Views → Print Areas → Print Rules → Gallery & Mockups → Size Guide.
- Explicit Creator/Admin visibility controls with an Active-but-hidden warning.
- Semantic template gallery roles and creator artwork-mode controls.
- Circle creation and shape-aware Admin canvas preview.
- Creator editor shows effective geometry and generated mockups clip artwork to rectangle, circle, ellipse, polygon or custom mask.
- Focused tests and branch validation.

## Validation

- npm install: PASS.
- Focused frontend tests: 10/10 PASS.
- Frontend production build: PASS.
- Backend models `py_compile`: PASS.

## Still required before merge

- Complete configurable full-wrap projection into derived front, back and angled mockup views.
- Browser-test save/reload of visibility, gallery, artwork modes and geometry fields.
- Browser-test Cork Coaster circle and square creator workflows.
- Browser-test mug separate front/back and full-wrap workflows.
- Review existing unrelated React Hook warnings separately; they do not currently fail the production build.
