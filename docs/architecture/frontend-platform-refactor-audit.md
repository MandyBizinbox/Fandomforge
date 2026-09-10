# FandomForge Frontend / Platform Refactor Audit

Status: active refactor programme
Base branch audited: `feature/template-production-routing-v3`
Started: 2026-08-31

## Refactor contract

FandomForge is moving from compatibility-patch driven UI behaviour to a canonical architecture:

1. MongoDB/API owns persistent business state.
2. React components render and edit API-backed state.
3. React Router owns navigation and workspace selection.
4. Platform Settings owns brand/theme tokens.
5. CSS owns presentation through reusable semantic primitives.
6. Runtime DOM mutation/observer code is temporary compatibility code only and must be removed as canonical components replace it.
7. A successful migration removes obsolete code instead of leaving parallel implementations active indefinitely.

## Immediate findings

### 1. Admin dashboard is a god file

`frontend/src/pages/AdminDashboard.jsx` is roughly 150 KB and owns unrelated domains including dashboard overview, product/template workspaces, catalogue tools, creators, printers, fulfilment, billing and settings. This creates broad edit blast-radius and makes extracting or testing one workspace difficult.

Classification: REFACTOR.

Target: route/domain components under dedicated folders. `AdminDashboard.jsx` should eventually become a small route composition layer rather than the implementation of most admin screens.

### 2. Products & Templates uses stateful JavaScript tabs as routing

The current Products & Templates workspace mounts Product Types, Templates, Sellable Products, Categories, Attributes and Print Options inside `AdminWorkspaceTabs`.

`frontend/src/routes/AdminDashboardRoute.jsx` then uses a `MutationObserver`, DOM query and programmatic `.click()` to force the Templates tab when `/admin/product-templates` loads.

Classification: MIGRATE / DELETE.

Target: real routes and links. Workspace selection must survive refresh/deep-link naturally through React Router, with no DOM click bridge.

### 3. Runtime UI patches are imported at route startup

`AdminDashboardRoute.jsx` imports runtime side-effect modules including:

- `productBuilderV2Runtime`
- `productBuilderPricingSimplificationRuntime`
- `productBuilderTextColourRuntime`
- `productBuilderDraftButtonRuntime`
- `adminManufacturingRulesThemeRuntime`

Classification: AUDIT individually; migrate behaviour into canonical components then DELETE.

No new feature should be implemented as a DOM/runtime side-effect patch unless required as a short-lived emergency compatibility measure.

### 4. Platform theming has a sound token engine but legacy components fight it

`frontend/src/lib/theme.js` already normalises Platform Settings and applies semantic CSS variables including:

- `--ff-primary`
- `--ff-accent`
- `--ff-page-bg`
- `--ff-page-text`
- `--ff-surface-bg`
- `--ff-card-bg`
- `--ff-card-text`
- `--ff-card-border`
- `--ff-muted-text`
- `--ff-input-*`
- `--ff-header-*`
- `--ff-button-*`

This should be the canonical presentation source.

However `frontend/src/platformThemeOverrides.css` currently has to intercept legacy hard-coded Tailwind tokens such as `text-[#FF3B30]` and uses broad `!important` overrides. This is compatibility CSS rather than a maintainable design system.

Classification:

- `lib/theme.js`: KEEP / STRENGTHEN.
- `platformThemeOverrides.css`: MIGRATE / SHRINK.
- hard-coded brand colours in JSX: REFACTOR.
- `index.css` (~55 KB): SPLIT and rationalise.
- duplicate `styles/theme-overrides.css`: AUDIT / consolidate.

### 5. Platform contact data is patched after render

`frontend/src/lib/platform.js` installs a MutationObserver to find hard-coded Forge email / WhatsApp anchors and rewrite them using Platform Settings.

Classification: MIGRATE / DELETE.

Target: components render contact data directly from `usePlatformConfig()` or semantic platform contact components. No DOM crawling should be required once old hard-coded links are removed.

### 6. Multiple generations of major product components coexist

Examples in Product Builder / Template Studio include:

- ProductBuilderV3 + ProductBuilderV4
- ProductTemplateStudioPage + ProductTemplateStudioV3Page
- multiple VariationMockupGenerator implementations
- ProductArtworkStudio at roughly 89 KB
- ProductBuilderV4 at roughly 51 KB
- ProductTemplateStudioPage at roughly 48 KB
- TemplateVariationMatrix at roughly 44 KB

Classification: establish canonical versions, migrate live callers, then DELETE obsolete versions.

Version suffixes should not become permanent architecture. The target is a canonical component tree with explicit domain names.

### 7. CSS is split by historical fixes rather than ownership

Current top-level styling includes at least:

- `index.css`
- `App.css`
- `platformThemeOverrides.css`
- `styles/theme-overrides.css`
- template/product-builder compatibility CSS files

Classification: REFACTOR.

Target CSS structure:

```
styles/
  tokens.css          # semantic variable aliases/defaults only
  base.css            # reset, body, typography, links
  primitives.css      # card, panel, buttons, fields, tables, badges
  layout.css          # page/workspace/dashboard shells
  utilities.css       # small FandomForge-specific utilities only
  domains/
    product-system.css
    product-builder.css
    template-studio.css
    orders.css
```

Platform Settings continues to provide runtime values for semantic variables. Domain CSS consumes those variables; it does not override component-specific hard-coded brand values with `!important` selectors.

## Canonical data rule

Persistent business configuration must round-trip through Mongo/API. React state is allowed for temporary interface state only, for example:

- open/closed modal
- current unsaved input draft
- hover/drag state
- local filters/sort before navigation

React state must not be the only source for:

- template identity/configuration
- product variations
- product pricing
- artwork placement / saved mockup metadata
- platform branding
- product/category/attribute definitions
- order/production state

Every refactored page must document the endpoint(s) that hydrate its durable state.

## Migration classifications

Use these labels during the file-by-file audit:

### KEEP
Canonical implementation; improve only where needed.

### REFACTOR
Correct responsibility/data source but file/component structure or styling needs cleanup.

### MIGRATE
Temporary implementation whose behaviour must be moved into a canonical component/route/model.

### DELETE
Obsolete after migration; must be removed, not merely left unused.

## Refactor sequence

### Phase 1 — Platform UI foundation + Product System routes

- remove DOM-click template tab bridge
- replace product-system JavaScript tabs with real routes
- create a shared Product System workspace header/navigation
- keep all existing Mongo/API endpoints unchanged
- preserve current template editor URLs
- begin replacing hard-coded colour classes with semantic theme primitives in touched files

### Phase 2 — Admin shell decomposition

Extract admin domains from `AdminDashboard.jsx`:

- overview
- accounts
- product system
- fulfilment
- finance
- settings

AdminDashboard becomes route composition and permission/navigation configuration only.

### Phase 3 — Platform settings / design system

- define canonical theme primitives
- move touched components onto semantic classes
- split `index.css`
- remove duplicate/overlapping theme override rules as coverage reaches 100%
- replace platform contact MutationObserver with data-bound components

### Phase 4 — Product Template Studio

- choose one canonical studio implementation
- split data/controller state from visual panels
- split large variation / print-area / gallery components by responsibility
- remove compatibility CSS once canonical styles cover the studio
- delete obsolete studio versions

### Phase 5 — Product Builder

- canonicalise V4 as unsuffixed ProductBuilder
- split hydration/persistence into hooks/services
- split steps into files
- remove runtime patch imports one by one after their behaviour is represented canonically
- delete V3 and obsolete mockup implementations when no live caller remains

### Phase 6 — Creator / Printer / Customer surfaces

Refactor each dashboard and public/customer flow page-by-page using the same route/data/theme contract.

## Change safety rules

- no mass rewrite PRs
- one domain slice per PR
- do not change Mongo schema and UI architecture in the same PR unless the data contract requires it
- preserve deep links or provide explicit redirects
- tests/build must pass before merge
- remove replaced runtime/CSS compatibility code in the same slice when safe
- production remains deployable after every merge

## Current priority queue

P0:
1. Product System real routes (Templates / Product Types / Categories / Attributes)
2. remove Templates-tab MutationObserver
3. establish reusable Product System navigation pattern

P1:
4. extract Sellable Products and Print Options from AdminDashboard into standalone route components
5. migrate remaining Product System workspace tabs to routes
6. first semantic CSS primitive pass on Product System pages

P2:
7. split AdminDashboard domain workspaces
8. remove product-builder route-level runtime imports as canonical behaviour is verified
9. consolidate theme CSS layers

## Definition of done for a migrated page

A page is considered migrated only when:

- it has a concrete route/deep link
- durable state hydrates from a documented API/Mongo source
- no DOM observer/click injection is required to select or configure it
- it consumes semantic Platform Settings theme tokens
- its primary component is reasonably scoped and domain-owned
- replaced compatibility code is removed
- refresh/back/forward navigation works without reconstructing state from unrelated UI state
- production build/tests pass
