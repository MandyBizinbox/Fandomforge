# FandomForge Launch-Integrity CEO Acceptance

Use this checklist only after `deploy_launch_integrity.sh` ends with:

`LAUNCH-INTEGRITY CANDIDATE DEPLOYED`

Record defects in one consolidated pass. Do not create or send a real payout batch during acceptance.

## 1. Public experience

- [ ] Homepage loads on mobile and desktop without overflow.
- [ ] FAQ loads immediately and is readable.
- [ ] Creator onboarding loads immediately and is readable.
- [ ] Public Creator storefront loads and product cards are intact.
- [ ] Public policy routes load and contain `help@fandomforge.co.za`.
- [ ] Production timing remains 2–3 business days.
- [ ] Courier timing remains 3–4 business days after dispatch.
- [ ] Problem reporting remains within 7 days.
- [ ] Friday Paystack payout wording remains accurate.

## 2. Platform Owner and permissions

- [ ] Literal `owner` account logs in and lands on `/admin`.
- [ ] Owner can open Platform settings, finance, subscriptions and payouts.
- [ ] Owner can open read-only Creator and Printer review views.
- [ ] Admin can manage ordinary platform operations.
- [ ] Admin cannot change Owner-only settings.
- [ ] Limited Manager sees only permitted functions.
- [ ] A copied direct URL does not bypass Manager permissions.

## 3. Creator product integrity

- [ ] Creator opens Product Builder and loads existing drafts/products.
- [ ] Template and variation selection works.
- [ ] Artwork upload creates a new immutable asset/version.
- [ ] Text content, font, colour and placement reload correctly.
- [ ] Product publication appears on the correct Creator storefront.
- [ ] Editing the product does not change a previously placed order.
- [ ] Product removal archives the product instead of deleting its document or artwork.

## 4. Platform-created Creator product

- [ ] Owner selects the correct Creator.
- [ ] Owner creates a product for that Creator.
- [ ] Owner uploads artwork/text and publishes it.
- [ ] Product appears on the selected Creator’s storefront.
- [ ] Creator attribution and earnings are visible in Admin review.
- [ ] Audit history shows the real Owner/Admin actor.

## 5. Checkout, costing and immutable order

Use only the approved production payment method; do not charge a card merely for acceptance.

- [ ] Product selling price and variation are correct.
- [ ] Tax is displayed only if production tax settings enable it.
- [ ] Shipping and payment-fee treatment match configured rules.
- [ ] Order contains Creator, product, template, variation, artwork/text and Printer snapshots.
- [ ] Creator earnings, Printer liability and platform values reconcile in Admin Finance.
- [ ] Order totals reconcile to the cent.

## 6. Refunds and chargebacks

Use an authorised internal/test order only.

- [ ] Partial item/quantity refund creates linked negative adjustments.
- [ ] Replaying the same idempotency key creates no duplicate.
- [ ] Full refund closes the remaining refundable balance.
- [ ] Chargeback/reversal shows any negative Creator or Printer balance.
- [ ] Original financial transactions remain visible and unchanged.
- [ ] Refund before payout removes disputed rows from the unsent batch.
- [ ] Refund after payout appears as a future-balance adjustment.

## 7. Friday Creator payouts

Do not send a real transfer during acceptance.

- [ ] Creator payout account page loads.
- [ ] Verified and unverified states display correctly.
- [ ] Unverified Creator is excluded from a Friday batch preview.
- [ ] Admin sees blocked Creator reasons.
- [ ] Friday batch requires approval before send.
- [ ] Failed transfer retry is limited to the original reserved ledger rows.
- [ ] Duplicate references or duplicate wallet membership are absent from the deployment report.

## 8. Subscriptions and entitlements

- [ ] Free Creator receives a structured limit message at a locked action.
- [ ] Plans page shows only approved active plans and their existing prices.
- [ ] Test/manual upgrade unlocks the restricted action.
- [ ] Downgrade retains existing products but blocks a new restricted action.
- [ ] Printer job limit behaves the same way.
- [ ] Temporary Owner override records a reason and expiry.
- [ ] Platform module disabled blocks the feature even when the plan includes it.

## 9. Printer operations

- [ ] Printer sees assigned immutable production details.
- [ ] Printer can accept or reject with a reason.
- [ ] Admin can reassign a rejected job.
- [ ] Replacement Printer can accept and update production status.
- [ ] QC pass/fail is structured.
- [ ] Damage/failure creates an operational exception.
- [ ] Reprint request and approval create a linked reprint job.
- [ ] Original order snapshot remains unchanged.
- [ ] Dispatch, courier and tracking save correctly.
- [ ] Creator/Admin/customer notifications are queued.
- [ ] Printer payout linkage remains tied to the original liability event.

## 10. Audit and support operations

- [ ] Platform, Creator, Printer, product, artwork, subscription, finance, payout and Printer actions appear in Audit.
- [ ] Audit payloads do not expose secret keys or full bank details.
- [ ] Contact form creates a durable message.
- [ ] Contact notification is delivered to `help@fandomforge.co.za`.
- [ ] Support staff can access the mailbox.
- [ ] Deployment report records MX, SPF, DKIM and DMARC state where available.
- [ ] Failed email shows attempt count, last error and next retry/dead-letter visibility.

## Acceptance record

- Candidate SHA:
- Deployment backup/report directory:
- Browser/device:
- Acceptance start:
- Acceptance completed:
- Accepted by:
- Defects found:
- Final decision: Accepted / Corrections required
