# Product template storefront defaults

The admin template stores customer-facing defaults separately from supplier/internal product data.

Fields:
- `creator_default_title`
- `creator_default_description`
- `specs`
- `material_composition`
- `care_instructions`
- `fit_notes`

When a creator starts a new product from the catalogue, `creatorProductStudioUtils` copies the title/description/specification content into the creator product draft. Material, care and fit content are appended to the draft's `specs` snapshot using headings already supported by the public Product Detail formatter.

This is intentionally snapshot-on-create behavior. Updating a template does not overwrite existing creator products.
