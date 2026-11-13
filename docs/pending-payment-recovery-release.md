# FandomForge pending-payment recovery — implementation and release gate

**Scope:** new online-shop orders that remain unpaid. Existing/legacy pending orders are not enrolled. No GitHub Actions, hosted CI or cloud scheduler.

## Buyer lifecycle

1. On successful online gateway checkout creation, store `payment_recovery_enabled=true` and queue a branded order receipt with an opaque, HTTPS saved-order link.
2. After **24 hours**, if the order remains pending, queue reminder 1.
3. After **48 hours**, and **at least 24 hours after reminder 1 was actually sent**, queue reminder 2. Mark the order `payment_overdue`. Do not mark `payment_status=paid`.
4. After **72 hours**, and **at least 24 hours after reminder 2 was actually sent**, verify merchant payment history before considering cancellation.
5. A confirmed payment is settled through the existing idempotent finance wrappers. If the verification fails or is inconclusive, keep the order overdue and mark it for financial review. Explicitly failed/expired transactions can be cancelled automatically.
6. An optional, separately enabled PayFast policy can also cancel when a successful authenticated merchant-history query finds no credit after the grace period.
7. If a signed PayFast ITN subsequently reports paid funds for a cancelled order, preserve the credit as a `payment_reconciliation_exceptions` record for manual refund or reinstatement. Do not create creator/printer earnings automatically for cancelled sales.

The worker polls every five minutes, and the email queue has its own SMTP retry logic. A reminder is **not** counted as delivered until the SMTP worker reports `sent`. A failed or suppressed reminder cannot trigger the next stage or cancellation.

## Statuses

- `pending_payment`: checkout created, awaiting funds.
- `payment_overdue`: second reminder queued and payment remains outstanding. It remains unpaid in the payment ledger.
- `cancelled`: verified unpaid after the grace period and cancellation gate.
- `paid` and all fulfilment statuses: unchanged, never eligible for reminders.

Admin order detail shows reminder 1/2 progress and a cancellation-review badge.

## Recovery URL and security

- `/order-payment/<opaque-token>` loads the **existing** stored order: items, variations, delivery method, amount and payment status. It does not write to localStorage and cannot create a second order.
- The backend stores only SHA-256 of the random link token, which expires seven days after issue.
- `POST /api/order-payment-recovery/<token>/continue` re-verifies the existing PayFast reference before reconstructing its hosted checkout URL with the **same merchant reference**. No new order or payment record is inserted.
- Other gateway methods are displayed read-only and require support to resume until their equivalent safe retry integration is built.
- Public response deliberately omits buyer email, telephone number and full address.
- The SMTP worker suppresses pending reminders if the order has since been paid or cancelled.

## Feature flags (both default OFF)

```text
FF_PENDING_PAYMENT_AUTOMATION_ENABLED=false
FF_PENDING_PAYMENT_CANCEL_UNCONFIRMED_PAYFAST=false
FANDOMFORGE_PUBLIC_ORIGIN=https://fandomforge.co.za
```

Do not enable either flag on production until VPS syntax, full offline tests, disposable MongoDB integration, SMTP sandbox delivery, URL review, and finance exception tests pass.

## Critical validation

- Test 24h/48h/72h and actual-sent timestamps, including delayed/failed SMTP.
- Test two workers racing to enqueue a reminder; unique `recovery_key` index prevents duplicates.
- Verify all reminder emails produce `text/plain` + `text/html` MIME alternatives with escaped user data.
- Verify saved-order link lookup, expiry, full item summary, no buyer PII leakage and exact same-order PayFast retry.
- Test: customer pays between scheduler scan and email queue claim. Sender suppresses stale reminder.
- Test: customer pays between provider verification and cancellation CAS. Query must reject paid order.
- Test: unverified PayFast history, API outage and manual EFT never auto-cancel.
- Test: signed late PayFast payment after cancellation creates one exception, never posts earned wallets, stops repeat callbacks.
- Run in disposable MongoDB and isolated backend process. Never manipulate live orders or send test emails to real customers.
- Verify production frontend and backend rollback procedures before any live switch.

## Release and branch conflict

This draft branch started at deployed `72fcf67`. PR #140 contains an independent Creator WhatsApp placement refinement on a sibling branch; reconcile the branches before an eventual production release to avoid reverting #140.

**Present state:** Code draft only. No Git merge, VPS validation, flag enablement or production deployment. Existing PR #139 remains the live payment reconciliation release.
