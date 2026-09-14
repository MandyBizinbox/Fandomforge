# Creator Product Studio UI scope

This branch intentionally replaces only the **creator-facing** Product Builder shell.

- Creator create/edit routes use `CreatorProductStudio`.
- Admin/SuperAdmin routes continue using `ProductBuilderV4` unchanged.
- The creator studio is a full-screen overlay, so the Creator Console navigation is hidden while designing.
- Product selection happens in Catalogue before entering Studio.
- Product details stay editable in the left drawer.
- Variants, pricing and readiness stay visible in the right drawer.
- Design, mockup, pricing, costing, manufacturing and publish payloads reuse the existing Product Builder utilities/components.
- Styling is component-scoped and uses the existing `--ff-*` Platform Settings tokens.

No billing, payout, checkout, order finance, manufacturing costing or deployment logic is changed here.
