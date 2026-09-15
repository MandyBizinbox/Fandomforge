# FandomForge Sprint 1 — Public Frontend Audit

**Programme:** Public Launch Readiness Programme  
**Sprint:** Sprint 1 — Public Frontend Completion  
**Branch:** `agent/public-launch-readiness-sprint-1`  
**Audit date:** 16 July 2026  
**Status:** Git implementation in progress  
**Current recommendation:** NO GO pending end-to-end, email, visibility, policy and production-environment validation

## Audit standard

Every public route must help a first-time visitor understand, trust and use FandomForge without seeing developer language, placeholder content, inaccurate payment states or contradictory commercial claims.

## Completed in this branch

### Public policy framework

- Added a public legal index at `/legal`.
- Added direct routes for all required launch policies.
- Added local launch-ready content for Customer Terms, Creator Terms, Privacy, Shipping, Returns, Intellectual Property, Prohibited Content, Copyright Complaints, Payouts and Store Suspension.
- Retained Production Partner Terms for the production-partner application path.
- Replaced unavailable-policy placeholders with usable local policies.
- Rejected backend defaults containing phrases such as `will be published here`, preventing them from replacing complete public copy.
- Added a controlled support state for unknown policy keys.
- Corrected footer legal navigation and the returns/refund destination.

### Customer and account access

- Restricted `/register` to customer accounts so creators and production partners cannot bypass their dedicated onboarding.
- Added Customer Terms and Privacy Policy acceptance.
- Removed the unverified public Google sign-in redirect to `auth.emergentagent.com`.
- Added safe role-based dashboard redirects and guarded the `next` route.
- Added clearer login errors and password visibility control.
- Migrated authentication browser storage from the legacy `mf_token` key to `ff_token` while retaining existing sessions.

### Creator onboarding

- Added sequential four-step onboarding with required-field, email and password validation.
- Prevented direct step skipping.
- Added store URL preview and cleaner commercial explanations.
- Added Creator Terms, Prohibited Content, Payout Policy and Privacy Policy acceptance.
- Replaced manual-billing implementation language with customer-facing plan copy.

### Production-partner onboarding

- Rebuilt the public application into a sequential, validated four-step flow.
- Added missing address and business-location fields.
- Added capability, production-method and production-area selection.
- Removed internal `sole-printer mode` language from the closed-application state.
- Added Production Partner Terms and Privacy Policy acceptance.
- Added secure billing and approval explanations without implementation detail.

### Homepage, storefront and product trust

- Removed wording that described private stores as a future option.
- Replaced the misleading `Social proof` heading when no public creator gallery exists.
- Linked valid creator cards to storefronts and improved image descriptions.
- Added creator-store error, missing-banner and no-products states.
- Converted supported creator social details into external links.
- Replaced the product page's endless load-failure state with a recoverable error and support path.
- Added clearer stock, selected-option, size-guide, shipping and returns information.

### Cart, checkout and order confirmation

- Replaced visible legacy `MF` image placeholders with `FF`.
- Migrated cart storage from `mf_cart` to `ff_cart` while retaining existing customer carts.
- Added clear empty-cart and empty-checkout recovery paths.
- Added checkout policy acceptance and clearer delivery/contact fields.
- Hid the mock payment method from public checkout.
- Removed `platform administrator` wording from payment failures.
- Preserved the cart during hosted-payment redirects until payment is confirmed.
- Added accurate pending, failed and paid order messages.
- Corrected pending orders so they no longer display `Total paid`.
- Added manual-payment detail rendering where those details are returned.
- Added payment-verification warnings and payment-help paths.

### Metadata and trust navigation

- Added commercial page title, description, canonical, Open Graph and Twitter metadata.
- Removed developer-facing HTML comments.
- Added complete company registration information to the footer.
- Expanded public support and legal navigation.

## Route inventory

| Route | Purpose | Branch status | Remaining validation |
|---|---|---:|---|
| `/` | Public homepage | Updated | Desktop and mobile visual QA |
| `/sell` | Become a Creator / How It Works / FAQ | Existing copy broadly launch-facing | Confirm free-access and plan claims against production configuration |
| `/register` | Customer signup | Updated | Complete live registration and login test |
| `/register/creator` | Creator onboarding | Updated | Complete billing, approval, dashboard and first-product test |
| `/register/printer` | Production-partner application | Updated | Complete billing, approval and dashboard test |
| `/login` | Account login | Updated | Test all account roles and invalid credentials |
| `/about` | Company explanation | Existing content | Mobile and link QA |
| `/contact` | Contact and support | Existing content | Submit live form and verify notification delivery |
| `/legal` | Legal index | Added | Visual QA |
| Required policy routes | Public legal framework | Added and fallback protected | Business-owner and legal review |
| `/creators/:slug` | Creator store | Updated | Test public, unlisted, private and invalid store behaviour |
| `/product/:id` | Product detail | Updated | Test representative products, variations and customisation |
| `/cart` | Cart | Updated | Test persistence, quantities, mixed-store rules and totals |
| `/checkout` | Checkout | Updated | Test all delivery and payment methods, failures and recovery |
| `/order-confirmation/:id` | Order confirmation | Updated | Test paid, pending, failed and manual-payment states |
| `/order-tracking/:token` | Customer tracking | Not yet audited | Test valid, invalid and expired tokens |

## Verified code-level blockers still open

1. The public sales page describes free access while production can expose recurring creator plans. The commercial rule must be confirmed.
2. The launch definition includes email verification, but public creator signup currently creates an active user directly. An existing verification path has not been confirmed.
3. Public, unlisted and private store rules still require API and browser validation.
4. Production policy records may contain substantial but outdated content. Placeholder defaults are now filtered, but production data must still be reviewed.
5. Support promises, production estimates, return windows and payout operations require business-owner confirmation.
6. Production environment mode, JWT secret, payment descriptors and sender identities cannot be validated from Git alone.

## Validation limitations

- GitHub Actions returned no workflow run for the current branch.
- The connected environment does not provide GitHub CLI access.
- Repository cloning could not resolve GitHub from the local shell, so an npm production build was not executed here.
- No claim is made that browser, payment, email or deployment validation has passed.

## Deferred by scope

- Dependency upgrades and CRACO migration
- Backend refactoring unrelated to a verified public blocker
- Creator Studio feature expansion
- AI tools and background removal
- Advanced SVG editing
- New product types
- New billing architecture

## Next audit sequence

1. Complete creator registration through published storefront.
2. Complete a customer purchase through payment and order confirmation.
3. Validate public, unlisted and private creator visibility.
4. Test contact and transactional email delivery.
5. Run desktop Chrome and Edge validation.
6. Run responsive mobile validation.
7. Confirm production environment, JWT secret, payment descriptors and sender identities.
8. Review all policy wording against actual operating rules.
9. Update the blocker register and issue the final GO or NO GO recommendation.
