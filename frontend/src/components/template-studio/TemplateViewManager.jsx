import React, { useState } from "react";
import { Image as ImageIcon, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { http, assetUrl } from "../../lib/api";
import { newId, safeArray, VIEW_OPTIONS } from "./templateStudioUtils";

export default function TemplateViewManager({
  screens,
  onScreensChange,
  selectedScreenId,
  onSelectedScreenIdChange,
  mode = "manage",
}) {
  const isSelectorOnly = mode === "selector";
  const [uploadingId, setUploadingId] = useState(null);

  const quickViewOptions = [
    { value: "front", label: "Front" },
    { value: "back", label: "Back" },
    { value: "side", label: "Side" },
    { value: "left_sleeve", label: "Left Sleeve" },
    { value: "right_sleeve", label: "Right Sleeve" },
    { value: "neck_label", label: "Neck Label" },
  ];

  const addScreen = (viewKey = "front") => {
    const option = VIEW_OPTIONS.find((item) => item.value === viewKey) || VIEW_OPTIONS[0];
    const screen = {
      id: newId("screen"),
      name: option?.label || "Front",
      view: option?.value || "front",
      view_key: option?.value || "front",
      image_url: "",
      sort_order: safeArray(screens).length,
      is_primary: safeArray(screens).length === 0,
    };
    onScreensChange([...safeArray(screens), screen]);
    onSelectedScreenIdChange(screen.id);
  };

  const updateScreen = (screenId, patch) => {
    onScreensChange(safeArray(screens).map((screen) => (screen.id === screenId ? { ...screen, ...patch } : screen)));
  };

  const removeScreen = (screenId) => {
    const next = safeArray(screens).filter((screen) => screen.id !== screenId);
    onScreensChange(next);
    if (selectedScreenId === screenId) onSelectedScreenIdChange(next[0]?.id || null);
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

  return (
    <div className="studio-panel h-full">
      <div className="studio-panel-header">
        <div>
          <div className="overline mb-1">{isSelectorOnly ? "Base Views" : "Template Views"}</div>
          <h2 className="font-display text-2xl uppercase">{isSelectorOnly ? "Choose View" : "Base Perspective Views"}</h2>
          <p className="text-xs text-zinc-500 mt-2 max-w-sm">
            {isSelectorOnly
              ? "Select the base view you want to draw production print areas on."
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
              const exists = safeArray(screens).some((screen) => (screen.view_key || screen.view) === option.value);
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
        {safeArray(screens).map((screen) => {
          const selected = selectedScreenId === screen.id;
          const viewOption = VIEW_OPTIONS.find((item) => item.value === (screen.view_key || screen.view));

          if (isSelectorOnly) {
            return (
              <button
                key={screen.id}
                type="button"
                className={selected ? "view-card active text-left" : "view-card text-left"}
                onClick={() => onSelectedScreenIdChange(screen.id)}
              >
                <div className="view-card-preview">
                  {screen.image_url ? (
                    <img src={assetUrl(screen.image_url)} alt={screen.name} />
                  ) : (
                    <ImageIcon size={24} className="text-zinc-700" />
                  )}
                </div>
                <div className="view-card-body">
                  <div className="font-bold text-sm">{viewOption?.label || screen.name || "Base View"}</div>
                  <div className="text-xs text-zinc-500 mt-1">{screen.name || "Fallback image"}</div>
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500 mt-2">
                    {screen.image_url ? "Base image ready" : "No base image"}
                  </div>
                </div>
              </button>
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
                    const option = VIEW_OPTIONS.find((item) => item.value === e.target.value);
                    updateScreen(screen.id, {
                      view: e.target.value,
                      view_key: e.target.value,
                      name: screen.name || option?.label || "View",
                    });
                  }}
                >
                  {VIEW_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <div className="flex gap-2">
                  <label className="studio-file-button flex-1">
                    <Upload size={12} /> {uploadingId === screen.id ? "Uploading" : screen.image_url ? "Replace Image" : "Upload Image"}
                    <input type="file" className="hidden" accept="image/*" onChange={(e) => uploadScreen(screen.id, e.target.files?.[0])} />
                  </label>
                  <button type="button" className="studio-danger-button" onClick={() => removeScreen(screen.id)}><Trash2 size={13} /></button>
                </div>
              </div>
            </div>
          );
        })}

        {safeArray(screens).length === 0 && (
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
    </div>
  );
}
