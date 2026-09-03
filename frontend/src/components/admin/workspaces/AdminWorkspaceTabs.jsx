import React, { useEffect, useState } from "react";

export default function AdminWorkspaceTabs({ tabs, initial = "overview", modules = {}, user = null, mode = "admin" }) {
  const isManager = mode === "manager" || user?.role === "manager";
  const managerPermissions = user?.manager_permissions || {};

  const visibleTabs = tabs.filter((tab) => {
    if (tab.ownerOnly && isManager) return false;
    if (tab.permission && isManager && managerPermissions[tab.permission] === false) return false;
    if (tab.moduleKey && modules?.[tab.moduleKey] === false) return false;
    if (tab.anyModule && !tab.anyModule.some((key) => modules?.[key] !== false)) return false;
    return true;
  });

  const [active, setActive] = useState(initial);
  const current = visibleTabs.find((tab) => tab.key === active) || visibleTabs[0];

  useEffect(() => {
    if (visibleTabs.length && !visibleTabs.some((tab) => tab.key === active)) {
      setActive(visibleTabs[0].key);
    }
  }, [active, visibleTabs]);

  if (!visibleTabs.length) {
    return <div className="ff-admin-card text-sm ff-admin-muted">You do not have access to any tabs in this workspace.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b border-[var(--ff-card-border)] pb-4">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActive(tab.key)}
            className={`ff-admin-section-link ${active === tab.key ? "is-active" : ""}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {current?.element}
    </div>
  );
}
