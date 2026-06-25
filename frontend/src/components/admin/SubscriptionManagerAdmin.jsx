import React, { useEffect, useMemo, useState } from "react";
import { http } from "../../lib/api";
import StatusBadge from "../StatusBadge";
import { toast } from "sonner";
import { Plus, Save, Trash2, RefreshCw, ExternalLink, Repeat } from "lucide-react";

const emptyPlan = {
  name: "",
  audience: "creator",
  description: "",
  monthly_price: 0,
  billing_cycle: "monthly",
  trial_days: 0,
  status: "active",
  sort_order: 100,
  features_text: "",
  max_products: "",
  max_jobs_per_month: "",
  allow_product_publishing: true,
  allow_job_assignment: true,
  storefront_visible: true,
  checkout_enabled: true,
};

const emptyAssign = {
  owner_type: "creator",
  owner_id: "",
  plan_id: "",
  status: "active",
  payment_method: "manual",
  monthly_fee: "",
  billing_cycle: "monthly",
  next_billing_date: "",
  trial_ends_at: "",
  notes: "",
};

function money(value) {
  return `R ${Number(value || 0).toFixed(2)}`;
}

function toDateInput(value) {
  if (!value) return "";
  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch (_) {
    return "";
  }
}

function fromDateInput(value) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeApiError(error, fallback = "Request failed") {
  const detail = error?.response?.data?.detail;
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d?.msg || String(d)).join("; ");
  if (typeof detail === "object") return detail.message || detail.msg || JSON.stringify(detail);
  return fallback;
}

function ownerName(row) {
  return row.owner_name || row.company_name || row.name || row.contact_email || row.email || row.id;
}

function dash(value) {
  return value === undefined || value === null || value === "" ? "—" : value;
}

function shortCode(value) {
  if (!value) return "—";
  const text = String(value);
  return text.length > 26 ? `${text.slice(0, 18)}…${text.slice(-5)}` : text;
}

function subscriptionCodeLabel(sub) {
  if (sub.paystack_subscription_code) return shortCode(sub.paystack_subscription_code);
  if (sub.payment_method === "paystack" && sub.last_payment_status === "paid") return "Pending webhook";
  if (sub.payment_method === "paystack" && sub.last_payment_status === "pending_authorization") return "Awaiting payment";
  return "—";
}

export default function SubscriptionManagerAdmin({ modules = {} }) {
  const [plans, setPlans] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [creators, setBands] = useState([]);
  const [printers, setPrinters] = useState([]);
  const [planForm, setPlanForm] = useState(emptyPlan);
  const [editingPlanId, setEditingPlanId] = useState(null);
  const [assignForm, setAssignForm] = useState(emptyAssign);
  const [subscriptionFilter, setSubscriptionFilter] = useState("all");
  const [loading, setLoading] = useState(false);

  const creatorSubscriptionsEnabled = modules.creator_subscriptions_enabled !== false;
  const printerSubscriptionsEnabled = modules.printer_subscriptions_enabled !== false && modules.printers_enabled !== false;

  const load = async () => {
    setLoading(true);
    try {
      const [planRes, subRes, bandRes, printerRes] = await Promise.all([
        http.get("/admin/subscription-plans"),
        http.get("/admin/subscriptions"),
        http.get("/admin/creators"),
        printerSubscriptionsEnabled ? http.get("/printers") : Promise.resolve({ data: [] }),
      ]);
      setPlans(planRes.data || []);
      setSubscriptions(subRes.data || []);
      setBands(bandRes.data || []);
      setPrinters(printerRes.data || []);
    } catch (error) {
      toast.error(normalizeApiError(error, "Could not load subscriptions"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const owners = useMemo(() => {
    if (assignForm.owner_type === "printer") return printers.map((p) => ({ id: p.id, label: ownerName(p), status: p.status }));
    return creators.map((b) => ({ id: b.id, label: ownerName(b), status: b.status }));
  }, [assignForm.owner_type, creators, printers]);

  const assignPlans = useMemo(() => {
    return plans.filter((p) => p.status !== "archived" && (p.audience === "both" || p.audience === assignForm.owner_type));
  }, [plans, assignForm.owner_type]);

  const filteredSubscriptions = useMemo(() => {
    if (subscriptionFilter === "all") return subscriptions;
    return subscriptions.filter((s) => s.owner_type === subscriptionFilter);
  }, [subscriptions, subscriptionFilter]);

  const resetPlan = () => {
    setEditingPlanId(null);
    setPlanForm(emptyPlan);
  };

  const editPlan = (plan) => {
    setEditingPlanId(plan.id);
    setPlanForm({
      name: plan.name || "",
      audience: plan.audience || "creator",
      description: plan.description || "",
      monthly_price: Number(plan.monthly_price || 0),
      billing_cycle: plan.billing_cycle || "monthly",
      trial_days: Number(plan.trial_days || 0),
      status: plan.status || "active",
      sort_order: Number(plan.sort_order || 100),
      features_text: (plan.features || []).join("\n"),
      max_products: plan.limits?.max_products ?? "",
      max_jobs_per_month: plan.limits?.max_jobs_per_month ?? "",
      allow_product_publishing: plan.allow_product_publishing !== false,
      allow_job_assignment: plan.allow_job_assignment !== false,
      storefront_visible: plan.storefront_visible !== false,
      checkout_enabled: plan.checkout_enabled !== false,
    });
  };

  const savePlan = async (e) => {
    e.preventDefault();
    const payload = {
      name: planForm.name,
      audience: planForm.audience,
      description: planForm.description,
      monthly_price: Number(planForm.monthly_price || 0),
      billing_cycle: planForm.billing_cycle,
      trial_days: Number(planForm.trial_days || 0),
      status: planForm.status,
      sort_order: Number(planForm.sort_order || 100),
      features: String(planForm.features_text || "").split("\n").map((x) => x.trim()).filter(Boolean),
      limits: {
        ...(planForm.max_products !== "" ? { max_products: Number(planForm.max_products || 0) } : {}),
        ...(planForm.max_jobs_per_month !== "" ? { max_jobs_per_month: Number(planForm.max_jobs_per_month || 0) } : {}),
      },
      allow_product_publishing: !!planForm.allow_product_publishing,
      allow_job_assignment: !!planForm.allow_job_assignment,
      storefront_visible: !!planForm.storefront_visible,
      checkout_enabled: !!planForm.checkout_enabled,
    };

    try {
      if (editingPlanId) {
        await http.patch(`/admin/subscription-plans/${editingPlanId}`, payload);
        toast.success("Plan updated");
      } else {
        await http.post("/admin/subscription-plans", payload);
        toast.success("Plan created");
      }
      resetPlan();
      load();
    } catch (error) {
      toast.error(normalizeApiError(error, "Could not save plan"));
    }
  };

  const archivePlan = async (plan) => {
    if (!window.confirm(`Archive ${plan.name}? Existing subscriptions will remain assigned.`)) return;
    try {
      await http.delete(`/admin/subscription-plans/${plan.id}`);
      toast.success("Plan archived");
      load();
    } catch (error) {
      toast.error(normalizeApiError(error, "Could not archive plan"));
    }
  };

  const assignSubscription = async (e) => {
    e.preventDefault();
    if (!assignForm.owner_id) {
      toast.error("Choose an account first");
      return;
    }

    const selectedPlan = plans.find((p) => p.id === assignForm.plan_id);
    const payload = {
      owner_type: assignForm.owner_type,
      owner_id: assignForm.owner_id,
      plan_id: assignForm.plan_id || null,
      status: assignForm.status,
      payment_method: assignForm.payment_method,
      monthly_fee: assignForm.monthly_fee === "" ? selectedPlan?.monthly_price ?? 0 : Number(assignForm.monthly_fee || 0),
      billing_cycle: assignForm.billing_cycle,
      next_billing_date: fromDateInput(assignForm.next_billing_date),
      trial_ends_at: fromDateInput(assignForm.trial_ends_at),
      notes: assignForm.notes,
    };

    try {
      await http.post("/admin/subscriptions/assign", payload);
      toast.success("Subscription assigned");
      setAssignForm(emptyAssign);
      load();
    } catch (error) {
      toast.error(normalizeApiError(error, "Could not assign subscription"));
    }
  };

  const updateSubscriptionStatus = async (sub, status) => {
    try {
      await http.patch(`/admin/subscriptions/${sub.id}`, { status });
      toast.success("Subscription updated");
      load();
    } catch (error) {
      toast.error(normalizeApiError(error, "Could not update subscription"));
    }
  };

  const markPaid = async (sub) => {
    const next = sub.next_billing_date ? new Date(sub.next_billing_date) : new Date();
    next.setMonth(next.getMonth() + 1);
    try {
      await http.patch(`/admin/subscriptions/${sub.id}`, {
        status: "active",
        last_payment_status: "paid",
        last_payment_at: new Date().toISOString(),
        next_billing_date: next.toISOString(),
      });
      toast.success("Marked as paid");
      load();
    } catch (error) {
      toast.error(normalizeApiError(error, "Could not mark paid"));
    }
  };

  const syncPlanToPaystack = async (plan) => {
    try {
      await http.post(`/admin/subscription-plans/${plan.id}/paystack-sync`);
      toast.success("Plan synced to Paystack");
      load();
    } catch (error) {
      toast.error(normalizeApiError(error, "Could not sync plan to owner Paystack"));
    }
  };

  const startPaystackCheckout = async (sub) => {
    try {
      const res = await http.post(`/admin/subscriptions/${sub.id}/paystack-checkout`, {});
      const url = res.data?.authorization_url;
      if (url) {
        await navigator.clipboard?.writeText(url).catch(() => {});
        window.open(url, "_blank", "noopener,noreferrer");
        toast.success("Owner Paystack checkout link opened and copied");
      } else {
        toast.success("Owner Paystack checkout link created");
      }
      load();
    } catch (error) {
      toast.error(normalizeApiError(error, "Could not start owner Paystack checkout"));
    }
  };

  const disablePaystackSubscription = async (sub) => {
    if (!window.confirm(`Cancel Paystack billing for ${sub.owner_name}?`)) return;
    try {
      await http.post(`/admin/subscriptions/${sub.id}/paystack-disable`);
      toast.success("Paystack subscription cancelled");
      load();
    } catch (error) {
      toast.error(normalizeApiError(error, "Could not cancel Paystack subscription"));
    }
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="overline mb-2">Billing plans</p>
            <h2 className="font-display text-4xl uppercase">Subscription Manager</h2>
            <p className="text-sm text-[var(--ff-muted-text)] max-w-3xl mt-2">
              Create the monthly, annual, free or manual billing plans used for creator and printer accounts. Paid plans can be linked to the owner Paystack subscription billing account.
            </p>
          </div>
          <button type="button" onClick={load} className="btn-primary" disabled={loading}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-3 mt-6">
          <div className={`border p-4 ${creatorSubscriptionsEnabled ? "border-[#34C759]/40" : "border-[var(--ff-primary)]"}`}>
            <div className="overline mb-1">Creator subscriptions</div>
            <div className="font-display text-2xl uppercase">{creatorSubscriptionsEnabled ? "Enabled" : "Disabled"}</div>
            <p className="text-xs text-[var(--ff-muted-text)] mt-1">Controlled by Settings → SaaS Package → creator_subscriptions_enabled.</p>
          </div>
          <div className={`border p-4 ${printerSubscriptionsEnabled ? "border-[#34C759]/40" : "border-[var(--ff-primary)]"}`}>
            <div className="overline mb-1">Printer subscriptions</div>
            <div className="font-display text-2xl uppercase">{printerSubscriptionsEnabled ? "Enabled" : "Disabled"}</div>
            <p className="text-xs text-[var(--ff-muted-text)] mt-1">Disabled automatically when printer modules are off or sole-printer package is active.</p>
          </div>
        </div>
      </div>

      <div className="grid xl:grid-cols-[420px_1fr] gap-6">
        <form onSubmit={savePlan} className="card space-y-4">
          <div>
            <p className="overline mb-2">Plans</p>
            <h3 className="font-display text-3xl uppercase">{editingPlanId ? "Edit Plan" : "Create Plan"}</h3>
          </div>

          <div>
            <label className="label">Plan name</label>
            <input className="input-base" required placeholder="Example: Creator Starter" value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} />
          </div>

          <div>
            <label className="label">Plan audience</label>
            <select className="input-base" value={planForm.audience} onChange={(e) => setPlanForm({ ...planForm, audience: e.target.value })}>
              <option value="creator">Creators</option>
              <option value="printer">Printers</option>
              <option value="both">Both</option>
            </select>
          </div>

          <div>
            <label className="label">Public description</label>
            <textarea className="input-base min-h-[80px]" placeholder="Short plan description shown during signup" value={planForm.description} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Plan price</label>
              <input type="number" step="0.01" className="input-base" placeholder="0.00" value={planForm.monthly_price} onChange={(e) => setPlanForm({ ...planForm, monthly_price: e.target.value })} />
              <p className="text-xs text-[var(--ff-muted-text)] mt-1">Use 0 for free or manually-billed plans.</p>
            </div>
            <div>
              <label className="label">Billing cycle</label>
              <select className="input-base" value={planForm.billing_cycle} onChange={(e) => setPlanForm({ ...planForm, billing_cycle: e.target.value })}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
                <option value="manual">Manual</option>
              </select>
            </div>
            <div>
              <label className="label">Trial days</label>
              <input type="number" className="input-base" placeholder="0" value={planForm.trial_days} onChange={(e) => setPlanForm({ ...planForm, trial_days: e.target.value })} />
            </div>
            <div>
              <label className="label">Display order</label>
              <input type="number" className="input-base" placeholder="100" value={planForm.sort_order} onChange={(e) => setPlanForm({ ...planForm, sort_order: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Maximum products</label>
              <input type="number" className="input-base" placeholder="Leave blank for unlimited" value={planForm.max_products} onChange={(e) => setPlanForm({ ...planForm, max_products: e.target.value })} />
            </div>
            <div>
              <label className="label">Maximum jobs per month</label>
              <input type="number" className="input-base" placeholder="Leave blank for unlimited" value={planForm.max_jobs_per_month} onChange={(e) => setPlanForm({ ...planForm, max_jobs_per_month: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="label">Plan features</label>
            <textarea className="input-base min-h-[110px]" placeholder="One feature per line" value={planForm.features_text} onChange={(e) => setPlanForm({ ...planForm, features_text: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm text-[var(--ff-muted-text)]">
            {[
              ["allow_product_publishing", "Allow publishing"],
              ["allow_job_assignment", "Allow job assignment"],
              ["storefront_visible", "Storefront visible"],
              ["checkout_enabled", "Checkout enabled"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 border border-[var(--ff-card-border)] p-3">
                <input type="checkbox" checked={!!planForm[key]} onChange={(e) => setPlanForm({ ...planForm, [key]: e.target.checked })} />
                {label}
              </label>
            ))}
          </div>

          <div>
            <label className="label">Plan status</label>
            <select className="input-base" value={planForm.status} onChange={(e) => setPlanForm({ ...planForm, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <button type="submit" className="btn-primary w-full"><Save size={14} /> Save Plan</button>
          {editingPlanId && <button type="button" onClick={resetPlan} className="w-full border border-[var(--ff-card-border)] py-3 text-xs uppercase tracking-widest">Cancel Edit</button>}
        </form>

        <div className="border border-[var(--ff-card-border)] overflow-x-auto">
          <table className="table-brutal">
            <thead><tr><th>Plan</th><th>Audience</th><th>Price</th><th>Status</th><th>Paystack</th><th>Limits</th><th></th></tr></thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id}>
                  <td><b>{plan.name}</b><span className="block text-xs text-[var(--ff-muted-text)]">{plan.description}</span></td>
                  <td className="uppercase text-xs tracking-widest">{plan.audience}</td>
                  <td>{money(plan.monthly_price)}<span className="block text-xs text-[var(--ff-muted-text)]">{plan.billing_cycle}</span></td>
                  <td><StatusBadge status={plan.status} /></td>
                  <td className="text-xs text-[var(--ff-muted-text)]">
                    {plan.paystack_plan_code ? (
                      <><span className="text-[#34C759] font-bold">Synced</span><br /><code>{plan.paystack_plan_code}</code></>
                    ) : (
                      <button type="button" onClick={() => syncPlanToPaystack(plan)} className="text-xs uppercase tracking-widest text-[var(--ff-primary)] font-bold">
                        <Repeat size={13} className="inline mr-1" /> Sync
                      </button>
                    )}
                  </td>
                  <td className="text-xs text-[var(--ff-muted-text)]">Products: {plan.limits?.max_products ?? "∞"}<br />Jobs: {plan.limits?.max_jobs_per_month ?? "∞"}</td>
                  <td className="text-right whitespace-nowrap">
                    <button onClick={() => editPlan(plan)} className="text-xs uppercase tracking-widest text-[var(--ff-primary)] font-bold mr-3">Edit</button>
                    <button onClick={() => archivePlan(plan)} className="text-xs uppercase tracking-widest text-[var(--ff-muted-text)] hover:text-[var(--ff-primary)] font-bold"><Trash2 size={14} className="inline" /></button>
                  </td>
                </tr>
              ))}
              {!plans.length && <tr><td colSpan="7" className="text-[var(--ff-muted-text)]">No plans created yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid xl:grid-cols-[420px_1fr] gap-6">
        <form onSubmit={assignSubscription} className="card space-y-4">
          <div>
            <p className="overline mb-2">Assignments</p>
            <h3 className="font-display text-3xl uppercase">Assign Subscription</h3>
          </div>

          <div>
            <label className="label">Account type</label>
            <select className="input-base" value={assignForm.owner_type} onChange={(e) => setAssignForm({ ...assignForm, owner_type: e.target.value, owner_id: "", plan_id: "" })}>
              <option value="creator">Creator</option>
              <option value="printer" disabled={!printerSubscriptionsEnabled}>Printer</option>
            </select>
          </div>

          <div>
            <label className="label">Account</label>
            <select className="input-base" required value={assignForm.owner_id} onChange={(e) => setAssignForm({ ...assignForm, owner_id: e.target.value })}>
              <option value="">Choose account</option>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.label} ({o.status})</option>)}
            </select>
          </div>

          <div>
            <label className="label">Subscription plan</label>
            <select className="input-base" value={assignForm.plan_id} onChange={(e) => {
            const plan = plans.find((p) => p.id === e.target.value);
            setAssignForm({ ...assignForm, plan_id: e.target.value, monthly_fee: plan ? String(plan.monthly_price || 0) : assignForm.monthly_fee, billing_cycle: plan?.billing_cycle || assignForm.billing_cycle });
          }}>
              <option value="">Manual / Custom plan</option>
              {assignPlans.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.monthly_price)}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Subscription status</label>
              <select className="input-base" value={assignForm.status} onChange={(e) => setAssignForm({ ...assignForm, status: e.target.value })}>
              <option value="trial">Trial</option>
              <option value="active">Active</option>
              <option value="past_due">Past due</option>
              <option value="suspended">Suspended</option>
              <option value="cancelled">Cancelled</option>
              <option value="free">Free</option>
              <option value="manual">Manual</option>
              </select>
            </div>
            <div>
              <label className="label">Payment method</label>
              <select className="input-base" value={assignForm.payment_method} onChange={(e) => setAssignForm({ ...assignForm, payment_method: e.target.value })}>
              <option value="manual">Manual</option>
              <option value="manual_eft">Manual EFT</option>
              <option value="paystack">Paystack</option>
              <option value="free">Free</option>
              <option value="external">External</option>
              </select>
            </div>
            <div>
              <label className="label">Billing amount</label>
              <input type="number" step="0.01" className="input-base" placeholder="0.00" value={assignForm.monthly_fee} onChange={(e) => setAssignForm({ ...assignForm, monthly_fee: e.target.value })} />
            </div>
            <div>
              <label className="label">Billing cycle</label>
              <select className="input-base" value={assignForm.billing_cycle} onChange={(e) => setAssignForm({ ...assignForm, billing_cycle: e.target.value })}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
              <option value="manual">Manual</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Next billing date</label><input type="date" className="input-base" value={assignForm.next_billing_date} onChange={(e) => setAssignForm({ ...assignForm, next_billing_date: e.target.value })} /></div>
            <div><label className="label">Trial ends</label><input type="date" className="input-base" value={assignForm.trial_ends_at} onChange={(e) => setAssignForm({ ...assignForm, trial_ends_at: e.target.value })} /></div>
          </div>

          <div>
            <label className="label">Internal billing notes</label>
            <textarea className="input-base min-h-[80px]" placeholder="Only visible to admin users" value={assignForm.notes} onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })} />
          </div>

          <button type="submit" className="btn-primary w-full"><Plus size={14} /> Assign / Update</button>
        </form>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {["all", "creator", "printer"].map((key) => (
              <button key={key} onClick={() => setSubscriptionFilter(key)} className={`px-4 py-2 border text-xs uppercase tracking-widest ${subscriptionFilter === key ? "border-[var(--ff-primary)] bg-[var(--ff-primary)] text-[var(--ff-card-text)]" : "border-[var(--ff-card-border)] text-[var(--ff-muted-text)]"}`}>{key}</button>
            ))}
          </div>

          <div className="border border-[var(--ff-card-border)] overflow-x-auto">
            <table className="table-brutal">
              <thead><tr><th>Account</th><th>Plan</th><th>Status</th><th>Billing</th><th>Paystack</th><th>Access</th><th></th></tr></thead>
              <tbody>
                {filteredSubscriptions.map((sub) => (
                  <tr key={sub.id}>
                    <td><b>{sub.owner_name}</b><span className="block text-xs text-[var(--ff-muted-text)] uppercase">{sub.owner_type} · {sub.owner_email}</span></td>
                    <td>
                      <b>{sub.plan_name || "Manual / Custom"}</b>
                      {sub.plan_description && <span className="block text-xs text-[var(--ff-muted-text)] mt-1">{sub.plan_description}</span>}
                      <span className="block text-xs text-[var(--ff-muted-text)] mt-1">{money(sub.monthly_fee)} / {sub.billing_cycle}</span>
                    </td>
                    <td><StatusBadge status={sub.status} /><span className="block text-xs text-[var(--ff-muted-text)] mt-1">Last payment: {sub.last_payment_status || "—"}</span></td>
                    <td className="text-xs text-[var(--ff-muted-text)]">Next: {toDateInput(sub.next_billing_date) || "—"}<br />Trial: {toDateInput(sub.trial_ends_at) || "—"}</td>
                    <td className="text-xs text-[var(--ff-muted-text)] min-w-[160px]">
                      {sub.payment_method === "paystack" ? <span className="text-[#34C759] font-bold uppercase">Paystack</span> : <span>Not linked</span>}
                      <br />Plan: <code title={sub.paystack_plan_code || ""}>{shortCode(sub.paystack_plan_code)}</code>
                      <br />Sub: <code title={sub.paystack_subscription_code || ""}>{subscriptionCodeLabel(sub)}</code>
                      {sub.paystack_reference && <><br />Ref: <code title={sub.paystack_reference}>{shortCode(sub.paystack_reference)}</code></>}
                    </td>
                    <td className="text-xs text-[var(--ff-muted-text)]">Publish: {sub.can_publish_products ? "Yes" : "No"}<br />Jobs: {sub.can_receive_jobs ? "Yes" : "No"}<br />Checkout: {sub.checkout_enabled ? "Yes" : "No"}</td>
                    <td className="text-right whitespace-nowrap space-y-2">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button onClick={() => markPaid(sub)} className="text-xs uppercase tracking-widest text-[#34C759] font-bold">Paid</button>
                        <button onClick={() => startPaystackCheckout(sub)} className="text-xs uppercase tracking-widest text-[var(--ff-primary)] font-bold">
                          <ExternalLink size={13} className="inline mr-1" /> Paystack
                        </button>
                        {sub.paystack_subscription_code && <button onClick={() => disablePaystackSubscription(sub)} className="text-xs uppercase tracking-widest text-[var(--ff-muted-text)] hover:text-[var(--ff-primary)] font-bold">Cancel Billing</button>}
                      </div>
                      <select className="input-base py-1 text-xs w-32" value={sub.status} onChange={(e) => updateSubscriptionStatus(sub, e.target.value)}>
                        <option value="trial">Trial</option>
                        <option value="active">Active</option>
                        <option value="past_due">Past due</option>
                        <option value="suspended">Suspended</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="free">Free</option>
                        <option value="manual">Manual</option>
                      </select>
                    </td>
                  </tr>
                ))}
                {!filteredSubscriptions.length && <tr><td colSpan="7" className="text-[var(--ff-muted-text)]">No subscriptions found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
