import React, { useId, useMemo, useRef, useState } from "react";

export default function WorkspaceTabs({
  tabs = [],
  initialTab,
  ariaLabel = "Workspace tabs",
  className = "",
}) {
  const firstEnabled = tabs.find((tab) => tab && tab.disabled !== true)?.id || "";
  const [activeTab, setActiveTab] = useState(initialTab || firstEnabled);
  const baseId = useId();
  const tabRefs = useRef({});

  const enabledTabs = useMemo(
    () => tabs.filter((tab) => tab && tab.disabled !== true),
    [tabs]
  );

  const selectTab = (id, focus = false) => {
    setActiveTab(id);
    if (focus) {
      const focusSelectedTab = () => tabRefs.current[id]?.focus();
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(focusSelectedTab);
      } else {
        focusSelectedTab();
      }
    }
  };

  const handleKeyDown = (event, currentId) => {
    const currentIndex = enabledTabs.findIndex((tab) => tab.id === currentId);
    if (currentIndex < 0) return;

    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % enabledTabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + enabledTabs.length) % enabledTabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = enabledTabs.length - 1;
    else return;

    event.preventDefault();
    selectTab(enabledTabs[nextIndex].id, true);
  };

  return (
    <div className={["workspace-tabs", className].filter(Boolean).join(" ")}>
      <div className="workspace-tabs__list" role="tablist" aria-label={ariaLabel}>
        {tabs.map((tab) => {
          const selected = activeTab === tab.id;
          const tabId = `${baseId}-tab-${tab.id}`;
          const panelId = `${baseId}-panel-${tab.id}`;
          return (
            <button
              key={tab.id}
              ref={(node) => { tabRefs.current[tab.id] = node; }}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              disabled={tab.disabled}
              className={selected ? "workspace-tabs__tab active" : "workspace-tabs__tab"}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, tab.id)}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge !== null && (
                <span className="workspace-tabs__badge">{tab.badge}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="workspace-tabs__panels">
        {tabs.map((tab) => {
          const selected = activeTab === tab.id;
          const tabId = `${baseId}-tab-${tab.id}`;
          const panelId = `${baseId}-panel-${tab.id}`;
          return (
            <div
              key={tab.id}
              id={panelId}
              role="tabpanel"
              aria-labelledby={tabId}
              hidden={!selected}
              className="workspace-tabs__panel"
            >
              {tab.content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
