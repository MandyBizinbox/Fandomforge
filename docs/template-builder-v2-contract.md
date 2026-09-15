# Template Builder V2 production contract

## Sequence

1. Select the reusable product type blueprint.
2. Configure the supplier product template.
3. Select or generate template variations.
4. Configure template-level print areas and only add variation overrides where size, shape or placement differs.
5. Configure supported print-pricing rules.
6. Configure the template image gallery and mockup views.
7. Review creator visibility and launch readiness.

## Effective production precedence

Production values resolve in this order:

1. Product-template default.
2. Matching variation production rule.
3. Exact template variation override.

The same resolver must be used by template readiness, creator catalogue pricing, Product Builder and production snapshots.

## Print-area geometry

Supported geometry types:

- `rectangle`
- `circle`
- `ellipse`
- `polygon`
- `mask`

Each print area may carry:

- percentage placement (`x_pct`, `y_pct`, `width_pct`, `height_pct`)
- physical output size (`width_mm`, `height_mm`)
- `bleed_mm`
- `safe_margin_mm`
- `rotation_deg`
- `polygon_points`
- `mask_url`
- `pricing_area_mode` (`bounding_box` or `shape`)

Creator artwork must be clipped to the effective geometry. Production output and readiness must use the same effective area.

## Artwork and mockup modes

A template may expose one or more artwork modes:

- `single_area`
- `front_back`
- `full_wrap`

A full-wrap artwork is authored once. Front, back and angled product mockups are derived views of that same artwork rather than separate creator uploads.

## Visibility

`status = active` and `creator_visible = true` are separate controls. The admin interface must clearly show whether an active template is hidden from creators.
