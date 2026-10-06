# Payment Amount Verification Implementation Plan

> Execute inline using executing-plans. The user explicitly authorized inspecting, reproducing and fixing launch blockers.

**Goal:** Reject PayFast order payment notifications and verification results whose gross amount differs from the stored payment/order total, before any financial state changes.
**Architecture:** A focused provider evidence validator runs before the existing paid-order transition and before webhook completion writes. Keep existing signature and server confirmation checks.
**Tech Stack:** FastAPI, Python, pytest.
**Spec:** Uploaded FandomForge Launch-Readiness Work Handover, sections 17, 18, 35 and 36.

## Global Constraints
- Prove failure before fixing it; preserve existing functionality and folder structure.
- No production writes until current state is documented.
- No payment, payout or hidden completion calls on production as test evidence.

## Review Focus
- Underpayment, overpayment and invalid/nonfinite amounts must never become paid.
- Both webhook and server verification evidence must use the same amount rules.
- Unknown/missing payment evidence must fail closed for PayFast.
- Payment provider must match the local record.
- Duplicate successful notifications must preserve existing idempotency.

### Task 1: Validate PayFast financial evidence
**Files:** Create backend/payment_confirmation.py; modify backend/routes_main.py; create backend/tests/test_payment_confirmation.py.
**Interface:** validate_payment_confirmation(payment: dict, order: dict, provider_payload: dict) -> None; raises HTTPException(409) on invalid PayFast evidence; no state mutations.
- [ ] Write route-level tests using controlled database doubles and real payment handlers: valid 285.00, invalid 5.00, missing amount, provider mismatch; assert stored state remains unchanged on rejection.
- [ ] Run tests against main-derived baseline and capture expected failures.
- [ ] Implement Decimal-based comparison and wire into webhook before completion writes and shared paid transition before any paid mutation.
- [ ] Run focused and existing backend tests, frontend tests/build and deployment contract.
- [ ] Review diff, commit isolated branch, prepare PR; production deployment remains blocked pending server access and deployed-state verification.
