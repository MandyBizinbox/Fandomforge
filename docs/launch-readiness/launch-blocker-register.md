# FandomForge Launch Blocker Register

**Programme:** Public Launch Readiness Programme  
**Sprint:** Sprint 1 — Public Frontend Completion  
**Updated:** 16 July 2026

## Severity rules

- **🔴 Launch Blocker:** prevents signup, publishing, purchasing or fulfilment; creates material security, legal, privacy, pricing or trust failure.
- **🟠 High:** serious issue that should be corrected before broad promotion but may not stop a controlled soft launch.
- **🟡 Medium:** creates friction or inconsistency without breaking the core transaction.
- **🟢 Cosmetic:** visual or wording improvement with low operational risk.

## Open items

| ID | Severity | Area | Issue | Evidence required to close | Status |
|---|---|---|---|---|---|
| FF-LAUNCH-001 | 🔴 | Production security | Confirm production does not use the documented placeholder JWT secret. | Production environment inspection and authenticated-session smoke test. | Open — outside Git |
| FF-LAUNCH-002 | 🔴 | Production configuration | Confirm backend environment is configured for production rather than preview. | Production service environment and restart verification. | Open — outside Git |
| FF-LAUNCH-003 | 🔴 | Creator journey | Complete creator signup, billing or launch-access handling, dashboard entry, profile setup and first product publication. | Recorded end-to-end test with screenshots or QA notes. | Open |
| FF-LAUNCH-004 | 🔴 | Customer journey | Complete a real or sandbox customer order from product page through checkout, payment callback and order confirmation. | Successful test order and order record verification. | Open |
| FF-LAUNCH-005 | 🔴 | Email | Confirm account, payment, order and fulfilment emails are delivered with FandomForge branding and working links. | Received test emails and link validation. | Open |
| FF-LAUNCH-006 | 🔴 | Pricing | Confirm public `free store access` claims match the production creator-plan configuration. | Approved commercial rule and live plan comparison. | Open |
| FF-LAUNCH-007 | 🔴 | Visibility | Confirm public, unlisted and private stores follow intended search and direct-link rules. | Visibility matrix test against production API and storefront routes. | Open |
| FF-LAUNCH-008 | 🔴 | Policies | Confirm policy wording matches actual payout, return, delivery, data-processing and suspension operations. | Business-owner and legal review of published policy set. | Open |
| FF-LAUNCH-009 | 🔴 | Policy source | Confirm production API policy records do not override the new frontend fallbacks with outdated or placeholder content. | Query each `/api/public/policies/{key}` endpoint in production. | Open |
| FF-LAUNCH-010 | 🔴 | Contact | Confirm public contact form successfully creates and delivers an enquiry. | Live form submission and received notification. | Open |
| FF-LAUNCH-011 | 🟠 | Printer journey | Review printer registration and application copy, validation, approval and dashboard redirect. | End-to-end application test. | Open |
| FF-LAUNCH-012 | 🟠 | Storefront | Review public storefront empty states, unavailable products and invalid creator slugs. | Browser QA notes. | Open |
| FF-LAUNCH-013 | 🟠 | Product | Confirm product options, pricing, artwork preview, stock and unavailable states are understandable. | Product-page QA across representative templates. | Open |
| FF-LAUNCH-014 | 🟠 | Checkout recovery | Confirm failed, cancelled and abandoned payment states return users to a recoverable page. | Payment-failure test cases. | Open |
| FF-LAUNCH-015 | 🟠 | Brand cleanup | Search production source and rendered pages for MerchForge, OrderHub and legacy-domain references. | Repository search plus browser-rendered page search. | Open |
| FF-LAUNCH-016 | 🟠 | Browser QA | Validate public routes in current Chrome and Edge desktop. | Completed browser checklist. | Open |
| FF-LAUNCH-017 | 🟠 | Mobile QA | Validate navigation, forms, cards, policy content, cart and checkout at common mobile widths. | Completed responsive checklist. | Open |
| FF-LAUNCH-018 | 🟡 | SEO | Add and verify a production social-sharing image when the final brand asset is approved. | Deployed `og:image` and preview check. | Open |
| FF-LAUNCH-019 | 🟡 | Accessibility | Run keyboard, focus, label and contrast review across the public transaction path. | Accessibility QA notes. | Open |
| FF-LAUNCH-020 | 🟢 | Dependency maintenance | Resolve the `react-day-picker` and `date-fns` install conflict after launch. | Clean install without `--legacy-peer-deps`. | Deferred post-launch |

## Closed in the current branch

| ID | Previous severity | Resolution | Status |
|---|---|---|---|
| FF-CLOSED-001 | 🔴 | Replaced unavailable-policy placeholder behaviour with launch-ready local policy fallbacks. | Closed in branch |
| FF-CLOSED-002 | 🔴 | Added all required policy routes and a public legal index. | Closed in branch |
| FF-CLOSED-003 | 🔴 | Removed generic creator and printer role registration that bypassed dedicated onboarding. | Closed in branch |
| FF-CLOSED-004 | 🟠 | Added terms acceptance to customer and creator signup. | Closed in branch |
| FF-CLOSED-005 | 🟠 | Added sequential creator onboarding validation and prevented step skipping. | Closed in branch |
| FF-CLOSED-006 | 🟠 | Corrected footer legal links and the incorrect refund-link target. | Closed in branch |
| FF-CLOSED-007 | 🟠 | Removed public wording that described private stores as a future feature. | Closed in branch |
| FF-CLOSED-008 | 🟡 | Replaced fallback `Social proof` wording when no creator gallery records exist. | Closed in branch |
| FF-CLOSED-009 | 🟡 | Removed developer-facing HTML and plan-selection wording. | Closed in branch |
| FF-CLOSED-010 | 🟡 | Added commercial metadata, canonical URL and social-sharing metadata. | Closed in branch |

## Launch decision rule

A GO recommendation cannot be issued while any open 🔴 item remains untested or unresolved. High-severity items require explicit acceptance if deferred into a controlled soft launch.
