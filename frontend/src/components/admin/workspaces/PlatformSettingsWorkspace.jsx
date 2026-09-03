import React from "react";
import AdminWorkspaceTabs from "./AdminWorkspaceTabs";
import FeaturePackageSettings from "../FeaturePackageSettings";
import InstanceBrandingSettings from "../InstanceBrandingSettings";
import AdminPlatformGeneralSettings from "../settings/AdminPlatformGeneralSettings";

export default function PlatformSettingsWorkspace({ modules = {}, user = null, mode = "admin" } = {}) {
  return (
    <div data-testid="admin-platform-settings-workspace" className="space-y-6">
      <div>
        <p className="overline mb-2">Owner controls</p>
        <h1 className="font-display text-5xl uppercase">Platform Settings</h1>
        <p className="text-[var(--ff-muted-text)] mt-2 max-w-3xl">Control enabled modules, package behaviour and public instance branding for this deployment.</p>
      </div>
      <AdminWorkspaceTabs
        modules={modules}
        user={user}
        mode={mode}
        tabs={[
          { key: "package", label: "SaaS Package", ownerOnly: true, element: <FeaturePackageSettings /> },
          { key: "branding", label: "Branding / Instance", permission: "manage_platform_branding", element: <InstanceBrandingSettings /> },
          { key: "general", label: "General", ownerOnly: true, element: <AdminPlatformGeneralSettings initialTab="general" compact /> },
        ]}
      />
    </div>
  );
}
