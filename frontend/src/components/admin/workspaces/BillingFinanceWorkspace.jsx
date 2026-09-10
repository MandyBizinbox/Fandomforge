import React, { useEffect, useState } from "react";
import { http } from "../../../lib/api";
import AdminWorkspaceTabs from "./AdminWorkspaceTabs";
import SubscriptionBillingSettings from "../SubscriptionBillingSettings";
import SubscriptionManagerAdmin from "../SubscriptionManagerAdmin";
import PaystackPayoutsAdmin from "../PaystackPayoutsAdmin";

function money(value) { return `R ${Number(value || 0).toFixed(2)}`; }

function CommissionsAdmin() { const [rows, setRows] = useState([]); useEffect(() => { http.get("/admin/commissions").then((r) => setRows(r.data)); }, []); const total = rows.reduce((s, r) => s + r.amount, 0); return <div><h1 className="font-display text-5xl uppercase mb-6">Commissions</h1><div className="ff-admin-card mb-6"><div className="overline">Total</div><div className="font-display text-4xl text-[var(--ff-primary)]">{money(total)}</div></div><div className="ff-admin-card p-0"><table className="table-brutal"><thead><tr><th>Date</th><th>Order</th><th>Creator</th><th>Rate</th><th>Amount</th></tr></thead><tbody>{rows.map((c) => <tr key={c.id}><td>{new Date(c.created_at).toLocaleDateString()}</td><td className="font-mono text-xs">{c.order_id.slice(0, 8)}</td><td className="font-mono text-xs">{c.band_id.slice(0, 8)}</td><td>{(c.rate * 100).toFixed(0)}%</td><td>{money(c.amount)}</td></tr>)}</tbody></table></div></div>; }

export default function BillingFinanceWorkspace({ modules = {}, user = null, mode = "admin" } = {}) {
  return (
    <div data-testid="admin-billing-finance-workspace" className="space-y-6">
      <div>
        <p className="overline mb-2">Money</p>
        <h1 className="font-display text-5xl uppercase">Billing & Finance</h1>
        <p className="text-[var(--ff-muted-text)] mt-2 max-w-3xl">Owner subscription billing, platform commission, subscriptions, ledger and payouts are grouped here. Buyer checkout gateways stay under Shop Settings.</p>
      </div>
      <AdminWorkspaceTabs
        modules={modules}
        user={user}
        mode={mode}
        tabs={[
          { key: "owner-billing", label: "Platform Billing", ownerOnly: true, element: <SubscriptionBillingSettings /> },
          { key: "subscriptions", label: "Subscriptions", permission: "manage_subscriptions", anyModule: ["creator_subscriptions_enabled", "printer_subscriptions_enabled"], element: <SubscriptionManagerAdmin modules={modules} /> },
          { key: "ledger", label: "Wallet / Payouts", permission: "manage_payouts", moduleKey: "payouts_enabled", element: <PaystackPayoutsAdmin /> },
          { key: "commissions", label: "Commission Ledger", permission: "manage_reports", element: <CommissionsAdmin /> },
        ]}
      />
    </div>
  );
}
