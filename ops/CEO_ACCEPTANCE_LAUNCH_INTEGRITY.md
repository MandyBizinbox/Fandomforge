# FandomForge Final CEO Acceptance

Use this checklist only after `ops/deploy_launch_integrity_v2.sh` ends with:

`LAUNCH-INTEGRITY CANDIDATE DEPLOYED`

Run one consolidated browser session. Automated backend, frontend and Playwright tests must not be manually repeated. Use only authorised internal/test records. Do not send a real Paystack transfer or create a live card/subscription charge for acceptance.

## Minimum live proof

- [ ] **Owner login and Admin access** — a literal `owner` signs in, lands on `/admin`, and opens Platform settings, Finance, Subscriptions and Payouts.
- [ ] **Manager direct-API denial** — a limited Manager receives a backend `403` when calling a finance or payout API without the required permission.
- [ ] **Creator-created product** — a Creator creates and publishes one product to the correct storefront.
- [ ] **Platform-created Creator product** — the Owner selects a Creator, creates one product for that Creator, and confirms the correct storefront and earnings attribution.
- [ ] **Artwork and typed text persistence** — uploaded artwork and text content/font/colour/placement remain correct after save and reload.
- [ ] **Product edit without order mutation** — editing the product after ordering does not change the existing order’s product, artwork, text, costing or Printer snapshot.
- [ ] **One customer order with financial allocation** — customer total, tax/fees where enabled, Creator earnings, Printer liability and platform values reconcile to the cent.
- [ ] **Creator upgrade and downgrade** — a locked Creator action unlocks through an approved test/manual upgrade; downgrade retains existing data but blocks the next restricted action.
- [ ] **Printer limit and upgrade** — the Printer limit blocks a new job/action, then an approved test/manual upgrade unlocks it.
- [ ] **One refund** — a partial or full refund creates linked proportional reversal events without modifying the original events.
- [ ] **One chargeback** — an authorised test chargeback creates linked reversals and exposes any negative Creator or Printer balance.
- [ ] **One payout-safe adjustment** — a refund before payout removes the affected ledger row from an unsent batch, or a refund after payout creates a future negative adjustment. Do not send a transfer.
- [ ] **Printer rejection and reassignment** — the assigned Printer rejects with a reason and Admin reassigns the linked job.
- [ ] **QC, reprint and tracking** — structured QC failure, approved linked reprint, dispatch and tracking are recorded without replacing the original order snapshot.
- [ ] **Mobile public-route overflow** — homepage, shop, Creator storefront, onboarding, FAQ and policy pages have no horizontal overflow on one phone viewport.
- [ ] **Financial reconciliation report** — the deployment report shows no duplicate wallet event keys, adjustment keys, payout batch keys or provider transfer references, and no unexplained Creator/Printer liability mismatch.

## Acceptance record

- Frozen candidate SHA:
- Deployment backup/report directory:
- Browser/device:
- Acceptance started:
- Acceptance completed:
- Accepted by:
- Defects found:
- Final decision: Accepted / Corrections required
