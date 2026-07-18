# FandomForge Launch-Integrity Implementation Manifest

Starting SHA: `b6b9b3fa59a6618f964f5535e713b334c93ac9e9`

Completion branch: `agent/fandomforge-launch-integrity-overnight-20260718`

Production remains unchanged until `ops/deploy_launch_integrity_v2.sh` is executed with a pinned candidate SHA.

## Authoritative services

- Platform and financial settings: `backend/launch_integrity/settings.py`
- Role and Manager policy: `backend/launch_integrity/permissions.py`
- Entitlements and usage: `backend/launch_integrity/entitlements.py`
- Product/design versions: `backend/launch_integrity/design.py`
- Pricing and allocations: `backend/launch_integrity/pricing.py`
- Wallet ledger and compatibility: `backend/launch_integrity/finance.py`
- Partial/full manual reversals: `backend/launch_integrity/finance_reversals.py`
- Provider amount reversals: `backend/launch_integrity/provider_reversals.py`
- Printer operations and reprints: `backend/launch_integrity/printer_ops.py`
- Universal audit: `backend/launch_integrity/audit.py` and `middleware.py`
- Non-destructive product/artwork mutations: `backend/launch_integrity/safety_routes.py`
- Owner/Admin review: `backend/launch_integrity/review_routes.py`
- Existing Friday Paystack payout controls: `backend/payout_launch_routes.py` and `payout_retry_guard.py`
- Existing durable email worker: `backend/email_delivery.py`

## Settings precedence

1. Existing platform settings document controls platform-wide modules and defaults.
2. A disabled platform module blocks the feature for every account.
3. Active account subscription and plan entitlements control account access and limits.
4. A recorded, unexpired Owner/Admin entitlement override may change the plan value.
5. Usage and reset period determine numeric-limit availability.
6. Frontend visibility is informational; backend service/API enforcement is authoritative.

## Pricing precedence

1. Product template and selected template variation blank costs.
2. Current global print-option record; embedded options remain historic/display references.
3. Current production-operation records.
4. Assigned Printer-specific price, then platform fallback.
5. Platform default commission, then Creator override.
6. Snapshotted tax, gateway-fee, shipping and settings versions.
7. Immutable product/order financial snapshot for replay and refunds.

## Data-safety guarantees

- No production collection is dropped or truncated.
- No production document is deleted by the deployment.
- Product deletion routes archive instead of deleting.
- Artwork uploads create unique files and asset versions; they do not overwrite an immutable URL.
- Existing order financial amounts are not rewritten.
- Completed payouts are not rewritten.
- Refunds and chargebacks create linked negative events and preserve originals.
- Legacy commission/payout records remain for compatibility and reconciliation.
- Historic data with missing allocations is marked legacy/unavailable rather than guessed.
- The provenance backfill is dry-run by default and is not applied by the production deployment.
- E2E support routes require non-production mode, explicit E2E mode and an E2E-prefixed database.
- Automated tests send no Paystack transfer, card charge or live subscription charge.

## Implemented current entitlements

Creator:

- Product publishing
- Maximum products
- Storefront visibility
- Checkout availability
- Artwork storage limit
- Team-member limit
- Payout delay/frequency metadata
- Current reporting access

Printer:

- Active/monthly job volume
- Template access
- Team-member limit
- Pricing tools
- Payout visibility
- Current reporting access

Future-disabled registry keys are present for external ecommerce, advanced analytics/reports, exports, bulk tools, custom themes/domains, additional stores/locations, API/webhooks, promotions, automated acceptance, routing priority and other explicitly deferred features.

## Automated evidence

Backend:

- Owner and Manager policy tests
- Settings/module/entitlement separation
- Design and text contracts
- Deterministic currency allocation and pricing replay
- Route precedence
- Mongo-backed paid-event idempotency
- Partial/full refunds and chargebacks
- Payout-batch release and post-payout negative adjustments
- Creator/Printer entitlement limits and overrides
- Printer assignment/reassignment and audit linkage
- Existing payout and email-worker tests

Browser:

- Literal Owner UI login and Admin route
- Limited Manager direct-API denial
- Creator-attributed product/storefront/order workflow
- Platform-created Creator product workflow
- Immutable order evidence after product edit
- Creator upgrade/downgrade
- Independent Printer limit/upgrade/downgrade
- Refund, chargeback and Printer exception/reprint workflow
- Public mobile overflow/readability routes
- JSON evidence, JUnit, HTML report, screenshots/video/trace on failure

The Product Builder drag/position visual interaction remains part of the single CEO browser checklist. Automated browser evidence uses UI login and storefront rendering plus authenticated real-API workflows; it must not be represented as full visual Builder interaction testing.

## Deferred

WooCommerce, Shopify, Etsy/marketplace integrations, custom domains, multiple stores/Printer locations, advanced analytics/reports/exports, email marketing, discount engine, capacity calendars, operating hours/holidays, automated Printer acceptance, white-label documents, advanced courier/POD, full external API and Creator webhook product.
