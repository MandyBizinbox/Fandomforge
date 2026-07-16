# FandomForge Sprint 1 — Public Frontend Audit

**Programme:** Public Launch Readiness Programme  
**Sprint:** Sprint 1 — Public Frontend Completion  
**Branch:** `agent/public-launch-readiness-sprint-1`  
**Audit date:** 16 July 2026  
**Status:** In progress  
**Current recommendation:** NO GO pending creator-journey, checkout and production-environment validation

## Audit standard

Every public route must help a first-time visitor understand, trust and use FandomForge without seeing developer language, placeholder content or contradictory commercial claims.

## Completed in this branch

### Public policy framework

- Added a public legal index at `/legal`.
- Added direct routes for all required launch policies.
- Added local launch-ready policy content for:
  - Customer Terms
  - Creator Terms
  - Privacy Policy
  - Shipping Policy
  - Returns Policy
  - Intellectual Property Policy
  - Prohibited Content Policy
  - Copyright Complaints Procedure
  - Payout Policy
  - Store Suspension Policy
- Retained Production Partner Terms for the printer onboarding path.
- Replaced the public `This policy is not available yet` fallback with usable local policy content.
- Added a controlled support message for unknown policy keys.
- Corrected footer legal navigation and removed the refund link that incorrectly opened general shop terms.

### Creator onboarding

- Restricted generic `/register` to customer-account creation.
- Removed the generic creator and printer role selector that bypassed dedicated onboarding.
- Added direct links to creator-store onboarding and printer applications.
- Added customer acceptance of Customer Terms and Privacy Policy.
- Added creator acceptance of Creator Terms, Prohibited Content Policy, Payout Policy and Privacy Policy.
- Prevented creator applicants from jumping directly to later onboarding steps.
- Added step-level validation for required fields, email addresses and password length.
- Improved store URL preview and removed duplicated or developer-oriented wording.
- Replaced manual-billing implementation language in the plan selector with customer-facing copy.

### Homepage and trust copy

- Removed the statement that private stores are a future option.
- Replaced the misleading `Social proof` heading when no live creator gallery exists.
- Improved creator-store card accessibility and linked public creator cards to their storefronts.
- Clarified public, unlisted and private visibility wording without claiming unverified access behaviour.
- Added complete company registration information to the footer.

### Metadata

- Replaced generic page title and description with commercial launch metadata.
- Added canonical, Open Graph and Twitter metadata.
- Removed developer-facing HTML comments.
- Improved the JavaScript-disabled message.

## Route inventory

| Route | Purpose | Current status | Remaining validation |
|---|---|---:|---|
| `/` | Public homepage | Updated | Desktop and mobile visual QA |
| `/sell` | Become a Creator / How It Works / FAQ | Existing copy broadly launch-facing | Confirm pricing and free-access claims against live plan configuration |
| `/register` | Customer signup | Updated | Complete live signup and account-login test |
| `/register/creator` | Creator onboarding | Updated | Complete account, billing, approval and dashboard test |
| `/register/printer` | Production-partner onboarding | Not audited in this batch | Full copy and workflow review |
| `/login` | Account login | Not audited in this batch | Error, reset and redirect behaviour |
| `/about` | Company explanation | Existing content | Mobile and link QA |
| `/contact` | Contact and support | Existing content | Submit live form and verify delivery |
| `/legal` | Legal index | Added | Visual QA |
| `/terms` | Customer Terms | Added/fallback protected | Legal review before final launch approval |
| `/creator-terms` | Creator Terms | Added/fallback protected | Legal review before final launch approval |
| `/privacy-policy` | Privacy Policy | Added/fallback protected | Confirm Information Officer process and actual processors |
| `/shipping-policy` | Shipping Policy | Added/fallback protected | Confirm production and courier estimates |
| `/returns` | Returns Policy | Added/fallback protected | Legal and operational review |
| `/intellectual-property` | IP Policy | Added/fallback protected | Legal review |
| `/prohibited-content` | Content rules | Added/fallback protected | Operations review |
| `/copyright-complaints` | Rights complaint process | Added/fallback protected | Confirm complaint ownership and response process |
| `/payout-policy` | Creator earnings and payouts | Added/fallback protected | Confirm actual payout timing and ledger rules |
| `/store-suspension-policy` | Enforcement | Added/fallback protected | Confirm admin enforcement capability |
| `/creators/:slug` | Public creator store | Not audited in this batch | Visibility, product and empty-state QA |
| `/product/:id` | Product detail | Not audited in this batch | Variation, pricing and artwork QA |
| `/cart` | Cart | Not audited in this batch | Persistence, totals and empty state |
| `/checkout` | Checkout | Not audited in this batch | Payment, delivery, failure and recovery tests |
| `/order-confirmation/:id` | Order confirmation | Not audited in this batch | Paid and failed payment states |
| `/order-tracking/:token` | Customer tracking | Not audited in this batch | Valid, invalid and expired token states |

## Known contradictions requiring live confirmation

1. The public sales page describes free store access while the creator onboarding flow can expose recurring subscription plans. Confirm whether the store is always free, whether only optional plans are paid, or whether the public claim must change.
2. The launch definition includes email verification, but the current public creator flow does not visibly show a verification step. Confirm backend and transactional-email behaviour.
3. Public, unlisted and private store rules must be tested against actual API filtering and direct-link behaviour.
4. Policy API records may override local policy content. Confirm that production records are current and do not contain legacy or placeholder text.
5. Support promises, production estimates, return windows and payout operations require business-owner confirmation before final launch approval.

## Deferred by scope

The following were not changed because they do not directly remove a public launch blocker:

- Dependency upgrades
- React or CRACO migration
- Backend refactoring
- Creator Studio feature expansion
- AI tools
- Background removal
- Advanced SVG editing
- New product types
- New billing architecture

## Next audit sequence

1. Run the complete creator journey from registration to published storefront.
2. Run a customer order from product selection through payment and confirmation.
3. Test public, unlisted and private creator visibility.
4. Test contact and transactional email delivery.
5. Run desktop Chrome and Edge validation.
6. Run responsive mobile validation for all public routes and forms.
7. Confirm production environment, JWT secret, payment descriptors and sender identities outside Git.
8. Update the launch blocker register and issue final GO or NO GO recommendation.
