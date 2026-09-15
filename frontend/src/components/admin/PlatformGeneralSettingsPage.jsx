import React, { useEffect, useState } from "react";
import { http } from "../../lib/api";
import { toast } from "sonner";

export default function PlatformGeneralSettingsPage() {
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    http.get("/admin/settings")
      .then((response) => setSettings(response.data || {}))
      .catch((error) => toast.error(error.response?.data?.detail || "Could not load platform settings"));
  }, []);

  if (!settings) {
    return <div className="card text-sm text-[var(--ff-muted-text)]">Loading platform settings…</div>;
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6" data-testid="admin-platform-general-page">
      <section className="card space-y-4">
        <div>
          <p className="overline mb-2">General</p>
          <h2 className="font-display text-3xl uppercase">Platform Identity</h2>
        </div>
        <div>
          <label className="label">Platform name</label>
          <input className="input-base" value={settings.platform_name || "FandomForge"} disabled readOnly />
          <p className="text-xs text-[var(--ff-muted-text)] mt-1">Public identity is stored in Mongo Platform Settings and edited under Branding / Instance.</p>
        </div>
        <div>
          <label className="label">Currency</label>
          <input className="input-base" value={settings.currency || "ZAR"} disabled readOnly />
        </div>
        <div>
          <label className="label">Country</label>
          <input className="input-base" value={settings.country || "ZA"} disabled readOnly />
        </div>
        <div>
          <label className="label">Timezone</label>
          <input className="input-base" value={settings.timezone || "Africa/Johannesburg"} disabled readOnly />
        </div>
      </section>

      <section className="card space-y-3">
        <p className="overline mb-2">Settings guide</p>
        <h2 className="font-display text-3xl uppercase">Where settings live</h2>
        <p className="text-sm text-[var(--ff-muted-text)]">
          Branding and public content are controlled under Branding / Instance. Enabled SaaS modules and the default printer live under Package & Modules.
        </p>
        <p className="text-sm text-[var(--ff-muted-text)]">
          Buyer checkout and delivery settings remain under Shop Settings. Owner billing, subscriptions, commission and payouts remain under Billing & Finance.
        </p>
      </section>
    </div>
  );
}
