import React, { useMemo, useState } from "react";
import { Image as ImageIcon, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { http, assetUrl } from "../../lib/api";
import { newId, safeArray, VIEW_OPTIONS } from "./templateStudioUtils";

function isArchivedScreen(screen = {}) {
  return screen.status === "archived" || screen.archived || screen.deleted || screen.deactivated;
}

function linkedCount(screen = {}) {
  return Number(
    screen.linked_design_count ??
    screen.active_design_count ??
    screen.order_count ??
    screen.linked_order_count ??
    screen.print_area_count ??
    0
  );
}

function screenIsProtected(screen = {}) {
  return Boolean(screen.in_use || screen.has_active_designs || screen.has_orders || linkedCount(screen) > 0);
}

export default function TemplateViewManager({
  screens,
  onScreensChange,
  selectedScreenId,
  onSelectedScreenIdChange,
  mode = "manage",
}) {
  const isSelectorOnly = mode === "selector";
  const [uploadingId, setUploadingId] = useState(null);

  const allScreens = safeArray(screens);
  const activeScreens = useMemo(() => allScreens.filter((screen) => !isArchivedScreen(screen)), [allScreens]);
  const archivedScreens = useMemo(() => allScreens.filter(isArchivedScreen), [allScreens]);

  const quickViewOptions = [
    { value: "front", label: "Front" },
    { value: "back", label: "Back" },
    { value: "side", label: "Side" },
    { value: "left_sleeve", label: "Left Sleeve" },
    { value: "right_sleeve", label: "Right Sleeve" },
    { value: "neck_label", label: "Neck Label" },
    { value: "full_wrap", label: "Full Wrap" },
    { value: "mug_wrap", label: "Mug Wrap" },
    { value: "handle_side", label: "Handle Side" },
  ];

  const addScreen = (viewKey = "front") => {
    const option = VIEW_OPTIONS.find((item) => item.value === viewKey) || quickViewOptions.find((item) => item.value === viewKey) || VIEW_OPTIONS[0];
    const screen = {
      id: newId("screen"),
      name: option?.label || "Front",
      view: option?.value || "front",
      view_key: option?.value || "front",
      image_url: "",
      sort_order: activeScreens.length,
      is_primary: activeScreens.length === 0,
      status: "active",
    };
    onScreensChange([...allScreens, screen]);
    onSelectedScreenIdChange(screen.id);
  };

  const updateScreen = (screenId, patch) => {
    onScreensChange(allScreens.map((screen) => (screen.id === screenId ? { ...screen, ...patch } : screen)));
  };

  const archiveScreen = (screenId, reason = "View archived") => {
    const screen = allScreens.find((item) => item.id === screenId);
    if (!screen) return;

    const confirmed = window.confirm(
      `${screen.name || "This view"} will be deactivated instead of hard-deleted.\n\n` +
      "Existing design/order references will be protected. Continue?"
    );

    if (!confirmed) return;

    const next = allScreens.map((item) => (
      item.id === screenId
        ? {
            ...item,
            status: "archived",
            archived: true,
            deactivated: true,
            archived_at: new Date().toISOString(),
          }
        : item
    ));

    onScreensChange(next);

    if (selectedScreenId === screenId) {
      const nextActive = next.find((item) => !isArchivedScreen(item));
      onSelectedScreenIdChange(nextActive?.id || null);
    }

    toast.success(reason);
  };

  const removeScreen = (screenId) => {
    const screen = allScreens.find((item) => item.id === screenId);
    if (!screen) return;

    if (screenIsProtected(screen)) {
      archiveScreen(screenId, "View protected and archived");
      return;
    }

    const confirmed = window.confirm(
      `Delete "${screen.name || "this view"}"?\n\n` +
      "Unused views can be removed. If this view is already referenced by orders/designs, use deactivate instead."
    );

    if (!confirmed) return;

    const next = allScreens.filter((item) => item.id !== screenId);
    onScreensChange(next);

    if (selectedScreenId === screenId) {
      const nextActive = next.find((item) => !isArchivedScreen(item));
      onSelectedScreenIdChange(nextActive?.id || null);
    }

    toast.success("View deleted");
  };

  const restoreScreen = (screenId) => {
    const next = allScreens.map((screen) => (
      screen.id === screenId
        ? {
            ...screen,
            status: "active",
            archived: false,
            deleted: false,
            deactivated: false,
            restored_at: new Date().toISOString(),
          }
        : screen
    ));

    onScreensChange(next);
    onSelectedScreenIdChange(screenId);
    toast.success("View restored");
  };

  const uploadScreen = async (screenId, file) => {
    if (!file) return;
    setUploadingId(screenId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("subdir", "product-template-views");
      const response = await http.post("/files/image", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      updateScreen(screenId, { image_url: response.data.url });
      toast.success("View image uploaded");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Upload failed");
    } finally {
      setUploadingId(null);
    }
  };

  const renderViewActions = (screen) => (
    <div className="flex gap-2">
      {!isSelectorOnly && (
        <label className="studio-file-button flex-1">
          <Upload size={12} /> {uploadingId === screen.id ? "Uploading" : screen.image_url ? "Replace Image" : "Upload Image"}
          <input type="file" className="hidden" accept="image/*" onChange={(e) => uploadScreen(screen.id, e.target.files?.[0])} />
        </label>
      )}
      <button
        type="button"
        className="studio-danger-button"
        onClick={() => removeScreen(screen.id)}
        title={screenIsProtected(screen) ? "Deactivate protected view" : "Delete unused view"}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );

  return (
    <div className="studio-panel h-full">
      <div className="studio-panel-header">
        <div>
          <div className="overline mb-1">{isSelectorOnly ? "Base Views" : "Template Views"}</div>
          <h2 className="font-display text-2xl uppercase">{isSelectorOnly ? "Choose View" : "Base Perspective Views"}</h2>
          <p className="text-xs text-zinc-500 mt-2 max-w-sm">
            {isSelectorOnly
              ? "Select the base view you want to draw production print areas on. Admin users may delete unused views or deactivate protected views from here."
              : "Upload one clean fallback image per view type: Front, Back, Side, Sleeve and Neck Label. Colour-specific images are added under Variations as overrides."}
          </p>
        </div>
        {!isSelectorOnly && (
          <button type="button" className="btn-primary text-xs" onClick={() => addScreen("front")}><Plus size={14} /> Add Front</button>
        )}
      </div>

      {!isSelectorOnly && (
        <div className="mb-4 border border-white/10 bg-black/20 rounded-xl p-3">
          <div className="label mb-2">Quick add base views</div>
          <div className="flex flex-wrap gap-2">
            {quickViewOptions.map((option) => {
              const exists = activeScreens.some((screen) => (screen.view_key || screen.view) === option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  className={exists ? "btn-secondary text-xs opacity-60" : "btn-secondary text-xs"}
                  onClick={() => addScreen(option.value)}
                  disabled={exists}
                  title={exists ? `${option.label} already exists` : `Add ${option.label}`}
                >
                  <Plus size={13} /> {exists ? `${option.label} added` : `Add ${option.label}`}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-zinc-500 mt-3">
            Add generic fallback views here first. Variation colour images will appear as overrides after these base views exist.
          </p>
        </div>
      )}

      <div className="grid gap-3 max-h-[640px] overflow-auto pr-1">
        {activeScreens.map((screen) => {
          const selected = selectedScreenId === screen.id;
          const viewOption = VIEW_OPTIONS.find((item) => item.value === (screen.view_key || screen.view)) || quickViewOptions.find((item) => item.value === (screen.view_key || screen.view));

          if (isSelectorOnly) {
            return (
              <div key={screen.id} className={selected ? "view-card active" : "view-card"}>
                <button
                  type="button"
                  className="view-card-preview"
                  onClick={() => onSelectedScreenIdChange(screen.id)}
                >
                  {screen.image_url ? (
                    <img src={assetUrl(screen.image_url)} alt={screen.name} />
                  ) : (
                    <ImageIcon size={24} className="text-zinc-700" />
                  )}
                </button>
                <div className="view-card-body">
                  <button type="button" className="text-left w-full" onClick={() => onSelectedScreenIdChange(screen.id)}>
                    <div className="font-bold text-sm">{viewOption?.label || screen.name || "Base View"}</div>
                    <div className="text-xs text-zinc-500 mt-1">{screen.name || "Fallback image"}</div>
                    <div className="text-[10px] uppercase tracking-widest text-zinc-500 mt-2">
                      {screen.image_url ? "Base image ready" : "No base image"}
                    </div>
                  </button>
                  <div className="mt-3">{renderViewActions(screen)}</div>
                </div>
              </div>
            );
          }

          return (
            <div key={screen.id} className={selected ? "view-card active" : "view-card"}>
              <button type="button" className="view-card-preview" onClick={() => onSelectedScreenIdChange(screen.id)}>
                {screen.image_url ? (
                  <img src={assetUrl(screen.image_url)} alt={screen.name} />
                ) : (
                  <ImageIcon size={24} className="text-zinc-700" />
                )}
              </button>
              <div className="view-card-body">
                <input className="input-base text-sm mb-2" value={screen.name || ""} onChange={(e) => updateScreen(screen.id, { name: e.target.value })} placeholder="Example: Front fallback" />
                <select
                  className="input-base text-sm mb-2"
                  value={screen.view_key || screen.view || "front"}
                  onChange={(e) => {
                    const option = VIEW_OPTIONS.find((item) => item.value === e.target.value) || quickViewOptions.find((item) => item.value === e.target.value);
                    updateScreen(screen.id, {
                      view: e.target.value,
                      view_key: e.target.value,
                      name: screen.name || option?.label || "View",
                    });
                  }}
                >
                  {VIEW_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                {renderViewActions(screen)}
              </div>
            </div>
          );
        })}

        {activeScreens.length === 0 && (
          <button type="button" className="dropzone" onClick={() => addScreen("front")}>
            <ImageIcon className="mx-auto mb-3 text-[#FF3B30]" />
            <div className="font-bold uppercase tracking-widest text-xs">{isSelectorOnly ? "No base views yet" : "Add first base view"}</div>
            <div className="text-xs text-zinc-500 mt-2">
              {isSelectorOnly
                ? "Go to Base Views first and add Front, Back, Side or Neck Label."
                : "Create generic fallback views only. Example: Front, Back, Side, Neck Label."}
            </div>
          </button>
        )}
      </div>

      {archivedScreens.length > 0 && !isSelectorOnly && (
        <div className="mt-5 border border-white/10 bg-black/20 rounded-xl p-3">
          <div className="label mb-2">Archived / deactivated views</div>
          <div className="space-y-2">
            {archivedScreens.map((screen) => (
              <div key={screen.id} className="flex items-center justify-between gap-3 text-xs border border-white/10 rounded-lg p-2">
                <div>
                  <div className="font-bold text-zinc-200">{screen.name || screen.view_key || "Archived view"}</div>
                  <div className="text-zinc-500">Soft-deleted view. Restore only if it should be used again.</div>
                </div>
                <button type="button" className="btn-secondary text-[10px]" onClick={() => restoreScreen(screen.id)}>
                  <RotateCcw size={12} /> Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
