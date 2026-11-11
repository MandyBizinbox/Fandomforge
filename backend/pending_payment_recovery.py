"""Pending-payment reminder policy, safe eligibility and branded email rendering.

This module contains no background work on import. The scheduler must be wired
only after the recovery checkout endpoint and gateway verification gate have
been validated against a disposable database. Existing pending orders are not
automatically enrolled.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from html import escape
from typing import Any, Mapping

REMINDER_1_HOURS = 24
REMINDER_2_HOURS = 48
CANCELLATION_REVIEW_HOURS = 72

RENEWAL_STATUSES = frozenset({"pending_payment", "payment_overdue"})
TERMINAL_STATUSES = frozenset({"paid", "cancelled", "refunded"})


def utc_date(value: Any) -> datetime:
    if isinstance(value, datetime):
        date = value
    elif isinstance(value, str):
        date = datetime.fromisoformat(value.replace("Z", "+00:00"))
    else:
        raise ValueError("Payment recovery requires an order creation timestamp")
    if date.tzinfo is None:
        date = date.replace(tzinfo=timezone.utc)
    return date.astimezone(timezone.utc)


def pending_recovery_eligible(order: Mapping[str, Any]) -> bool:
    """Only new, opted-in gateway orders that remain unpaid qualify."""
    return (
        order.get("payment_recovery_enabled") is True
        and order.get("status") in RENEWAL_STATUSES
        and order.get("payment_status") == "pending"
        and order.get("payment_provider") in {"payfast", "paystack", "peach"}
        and bool(order.get("buyer_email"))
        and bool(order.get("payment_id"))
        and not order.get("manual_payment_claim")
        and not order.get("recovery_payment_claim")
    )


def recovery_due_stage(order: Mapping[str, Any], now: datetime) -> int:
    """Return 0/not due, 1/first notice, 2/final notice, 3/cancellation review.

    Stage 2 and 3 additionally require confirmed SMTP delivery for each
    preceding message. Failed or stuck email must never trigger cancellation.
    """
    if not pending_recovery_eligible(order):
        return 0
    age = now.astimezone(timezone.utc) - utc_date(order.get("created_at"))
    stage = int(order.get("payment_reminder_stage") or 0)
    if stage == 0 and age >= timedelta(hours=REMINDER_1_HOURS):
        return 1
    if stage == 1 and order.get("reminder_1_delivery") == "sent" and age >= timedelta(hours=REMINDER_2_HOURS):
        sent_at = order.get("reminder_1_sent_at")
        if sent_at and now.astimezone(timezone.utc) - utc_date(sent_at) >= timedelta(hours=24):
            return 2
    if stage == 2 and order.get("reminder_2_delivery") == "sent" and age >= timedelta(hours=CANCELLATION_REVIEW_HOURS):
        sent_at = order.get("reminder_2_sent_at")
        if sent_at and now.astimezone(timezone.utc) - utc_date(sent_at) >= timedelta(hours=24):
            return 3
    return 0


def format_zar(value: Any) -> str:
    amount = Decimal(str(value if value is not None else 0)).quantize(Decimal("0.01"))
    return f"R {amount:,.2f}"


def _line_items(order: Mapping[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "name": str(item.get("product_title") or "Custom merchandise"),
            "variant": " / ".join(
                str(item.get(key)) for key in ("size", "color") if item.get(key)
            ),
            "quantity": max(1, int(item.get("quantity") or 1)),
            "total": Decimal(str(item.get("unit_price") or 0)) * max(1, int(item.get("quantity") or 1)),
        }
        for item in (order.get("items") or [])
    ]


def payment_reminder_email(order: Mapping[str, Any], *, stage: int, recovery_url: str) -> dict[str, str]:
    """Beautiful, accessible HTML plus readable text fallback.

    External text is HTML-escaped; no payment card or shipping PII is
    embedded in the email. The URL must be an HTTPS, opaque recovery token.
    """
    if stage not in (1, 2):
        raise ValueError("Only reminder stages 1 and 2 are supported")
    if not recovery_url.startswith("https://") or "?" in recovery_url:
        raise ValueError("Recovery URL must be an HTTPS one-time capability URL")

    number = str(order.get("order_number") or "your order")
    name = str((order.get("shipping_address") or {}).get("full_name") or "there").split()[0]
    total = format_zar(order.get("total"))
    is_final = stage == 2
    title = "Your merch is still waiting" if not is_final else "Last reminder: complete your merch order"
    subtitle = (
        "Your designs are saved and your order is waiting for payment."
        if not is_final else
        "We still haven't confirmed payment. Your order may be cancelled after the payment deadline."
    )
    subject = (f"Complete your FandomForge order {number}"
               if not is_final else f"Final payment reminder for {number}")

    lines = _line_items(order)
    plain_items = "\n".join(
        f"- {item['name']} ({item['variant'] or 'Standard'}) x{item['quantity']}: {format_zar(item['total'])}"
        for item in lines
    )
    plain = (
        f"Hi {name},\n\n{subtitle}\n\n"
        f"Order: {number}\n{plain_items}\nShipping: {format_zar(order.get('shipping_total'))}\n"
        f"Order total: {total}\n\n"
        f"Review your saved order and continue payment:\n{recovery_url}\n\n"
        "If you've already paid, please don't pay again. Reply with your proof of payment "
        "so we can investigate.\n\nFandomForge"
    )
    rows = "".join(
        f'<tr><td style="padding:12px 0;border-bottom:1px solid #e5e7eb">'
        f'<strong>{escape(item["name"])}</strong><br>'
        f'<span style="color:#6b7280;font-size:12px">{escape(item["variant"] or "Standard")} · '
        f'Qty {item["quantity"]}</span></td>'
        f'<td style="text-align:right;padding:12px 0;border-bottom:1px solid #e5e7eb">'
        f'{escape(format_zar(item["total"]))}</td></tr>'
        for item in lines
    )
    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>{escape(subject)}</title></head>
<body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827">
<div style="max-width:640px;margin:36px auto;background:white;border-radius:14px;overflow:hidden">
<div style="background:#0b0b0d;padding:28px 32px;border-top:5px solid #ff9100">
<strong style="color:#ff9100;font-size:21px;letter-spacing:1px">FANDOMFORGE</strong>
<div style="color:#e5e7eb;font-size:12px;letter-spacing:2px;margin-top:6px">MERCH MADE SIMPLE</div>
</div>
<div style="padding:32px">
<div style="font-size:12px;letter-spacing:2px;font-weight:bold;color:#b45309">
{"FINAL REMINDER" if is_final else "PAYMENT REMINDER"}</div>
<h1 style="font-size:28px;line-height:1.15;margin:12px 0 16px">{escape(title)}</h1>
<p>Hi {escape(name)},</p><p style="line-height:1.7">{escape(subtitle)}</p>
<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:18px;margin:24px 0">
<strong>Order {escape(number)}</strong>
<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px">{rows}
<tr><td style="padding:16px 0 4px">Shipping</td><td style="text-align:right;padding:16px 0 4px">{escape(format_zar(order.get("shipping_total")))}</td></tr>
<tr><td style="font-size:18px;font-weight:bold;padding-top:12px">Total</td>
<td style="text-align:right;font-size:22px;font-weight:bold;padding-top:12px">{escape(total)}</td></tr>
</table></div>
<a href="{escape(recovery_url, quote=True)}" style="display:block;background:#ff9100;color:#111827;text-align:center;
text-decoration:none;font-weight:bold;text-transform:uppercase;letter-spacing:1px;border-radius:6px;padding:17px">
Review Order &amp; Continue Payment</a>
<p style="font-size:13px;color:#6b7280;line-height:1.6;margin-top:24px">
Already paid? Please don't pay twice. Reply to this email with your payment details and we'll check.</p>
<p style="font-size:12px;color:#6b7280;word-break:break-all">
Button not opening? Copy this secure link:<br>{escape(recovery_url)}</p>
</div><div style="background:#111827;color:#d1d5db;padding:22px 32px;font-size:12px">
FandomForge · Merch made simple<br>This is an email about an order you placed.
</div></div></body></html>"""
    return {"subject": subject, "body": plain, "html_body": html}


def order_received_email(order: Mapping[str, Any], *, recovery_url: str) -> dict[str, str]:
    """Branded checkout receipt with its saved-order recovery link."""
    if not recovery_url.startswith("https://") or "?" in recovery_url:
        raise ValueError("Recovery URL must be a secure capability URL")
    number = str(order.get("order_number") or "your order")
    recipient = str((order.get("shipping_address") or {}).get("full_name") or "there").split()[0]
    total = format_zar(order.get("total"))
    rows = _line_items(order)
    plain_lines = "\\n".join(
        f"- {item['name']} x{item['quantity']}: {format_zar(item['total'])}" for item in rows
    )
    plain = (
        f"Hi {recipient},\\n\\nWe saved your order {number}.\\n"
        f"{plain_lines}\\nShipping: {format_zar(order.get('shipping_total'))}"
        f"\\nTotal: {total}\\n\\nYour order is awaiting payment. "
        f"Review the saved items and continue securely:\\n{recovery_url}\\n\\n"
        "Already paid? Do not pay twice. Reply to this email so we can check.\\n\\nFandomForge"
    )
    table_rows = "".join(
        f'<tr><td style="padding:12px 0;border-bottom:1px solid #e5e7eb">'
        f'{escape(item["name"])}<br><small>{escape(item["variant"] or "Standard")} · Qty {item["quantity"]}</small></td>'
        f'<td style="padding:12px 0;border-bottom:1px solid #e5e7eb;text-align:right">'
        f'{escape(format_zar(item["total"]))}</td></tr>'
        for item in rows
    )
    subject = f"Your FandomForge order {number} is saved"
    html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width"></head>
<body style="background:#f3f4f6;margin:0;color:#111827;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:640px;margin:36px auto;background:white;border-radius:14px;overflow:hidden">
<div style="background:#0b0b0d;padding:28px 32px;border-top:5px solid #ff9100">
<strong style="font-size:21px;color:#ff9100;letter-spacing:1px">FANDOMFORGE</strong>
<div style="color:#e5e7eb;font-size:12px;letter-spacing:2px;margin-top:6px">MERCH MADE SIMPLE</div></div>
<div style="padding:32px">
<div style="color:#b45309;font-size:12px;letter-spacing:2px;font-weight:bold">ORDER RECEIVED</div>
<h1 style="font-size:28px;line-height:1.15;margin:12px 0">Your merch is on its way to becoming real.</h1>
<p>Hi {escape(recipient)},</p>
<p style="line-height:1.7">We've saved your order. Complete payment below so we can start processing it.</p>
<div style="border:1px solid #e5e7eb;background:#f9fafb;padding:18px;border-radius:8px;margin:24px 0">
<strong>Order {escape(number)}</strong>
<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px">
{table_rows}<tr><td style="padding-top:12px">Shipping</td><td style="text-align:right;padding-top:12px">{escape(format_zar(order.get("shipping_total")))}</td></tr>
<tr><td style="padding-top:12px;font-size:18px;font-weight:bold">Total</td>
<td style="text-align:right;padding-top:12px;font-size:22px;font-weight:bold">{escape(total)}</td></tr>
</table></div>
<a href="{escape(recovery_url, quote=True)}" style="display:block;background:#ff9100;color:#111827;
border-radius:6px;padding:17px;text-align:center;font-weight:bold;text-decoration:none;text-transform:uppercase">
Review Your Order &amp; Pay Securely</a>
<p style="font-size:13px;color:#6b7280;line-height:1.6;margin-top:24px">
Already paid? Don't pay twice. Reply to this email and we'll investigate.</p>
<p style="font-size:12px;color:#6b7280;word-break:break-all">
Copy this secure link if the button does not open:<br>{escape(recovery_url)}</p>
</div><div style="background:#111827;color:#d1d5db;padding:22px 32px;font-size:12px">
FandomForge · Merch made simple</div></div></body></html>"""
    return {"subject": subject, "body": plain, "html_body": html}
