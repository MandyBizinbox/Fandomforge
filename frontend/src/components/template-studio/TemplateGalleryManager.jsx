import React, { useMemo, useState } from "react";
import { ImagePlus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { assetUrl, http } from "../../lib/api";
import { newId, safeArray } from "./templateStudioUtils";

export const TEMPLATE_GALLERY_ROLES = [
  { value: "catalogue_thumbnail", label: "Catalogue thumbnail" },
  { value: "creator_selection", label: "Creator selection image" },
  { value: "editor_background", label: "Artwork editor background" },
  { value: "front_mockup", label: "Front mockup" },
  { value: "back_mockup", label: "Back mockup" },
  { value: "side_mockup", label: "Side mockup" },
  { value: "angled_mockup", label: "Angled mockup" },
  { value: "full_wrap_editor", label: "Full-wrap editor image" },
  { value: "size_guide", label: "Size guide" },
  { value: "gallery", label: "Additional gallery image" },
];

const ARTWORK_MODES = [
  {
    value: "single_area",
    label: "Single artwork area",
    description: "One artwork file is positioned on one printable area.",
  },
  {
    value: "front_back",
    label: "Front and back",
    description: "Creators can use separate front/back artwork or repeat one design.",
  },
  {
    value: "full_wrap",
    label: "Full wrap",
    description: "One panoramic artwork is authored once and rendered into sellable views.",
  },
];

function normaliseGalleryRows(rows = []) {
  return safeArray(rows)
    .filter(Boolean)
    .map((row, index) => ({
      id: row.id || newId("gallery"),
      name: row.name || "",
      image_url: row.image_url || row.url || "",
      role: row.role || "gallery",
      view_key: row.view_key || "",
      source_print_area_id: row.source_print_area_id || "",
      derived_from_artwork_mode: row.derived_from_artwork_mode || "",
      crop: row.crop || {},
      sort_order: Number(row.sort_order ?? index),
      is_primary: Boolean(row.is_primary),
      status: row.status || "active",
    }));
}

export default function TemplateGalleryManager({
  gallery = [],
  artworkModes = [],
  printAreas = [],
  onGalleryChange,
  onArtworkModesChange,
}) {
  const rows = useMemo(() => normaliseGalleryRows(gallery), [gallery]);
  const [uploadRole, setUploadRole] = useState("gallery");
  const [uploading, setUploading] = useState(false);

  const commit = (nextRows) => {
    onGalleryChange(normaliseGalleryRows(nextRows));
  };

  const patchRow = (id, patch) => {
    commit(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeRow = (id) => {
    commit(rows.filter((row) => row.id !== id));
  };

  const setPrimary = (id) => {
    commit(rows.map((row) => ({ ...row, is_primary: row.id === id })));
  };

  const upload = async (file) => {
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("subdir", "product-template-gallery");

      const response = await http.post("/files/image", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const next = {
        id: newId("gallery"),
        name: file.name.replace(/\.[^.]+$/, ""),
        image_url: response.data.url,
        role: uploadRole,
        view_key: "",
        source_print_area_id: "",
        derived_from_artwork_mode:
          uploadRole === "front_mockup"
          || uploadRole === "back_mockup"
          || uploadRole === "angled_mockup"
            ? "full_wrap"
            : "",
        crop: {},
        sort_order: rows.length,
        is_primary: rows.length === 0 || uploadRole === "catalogue_thumbnail",
        status: "active",
      };

      commit([...rows, next]);
      toast.success("Template gallery image uploaded");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Gallery image upload failed");
    } finally {
      setUploading(false);
    }
  };

  const toggleArtworkMode = (value) => {
    const current = safeArray(artworkModes);
    onArtworkModesChange(
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    );
  };

  return (
    <div className="space-y-5">
      <div className="studio-panel">
        <div className="studio-panel-header">
          <div>
            <div className="overline mb-1">Artwork configuration</div>
            <h2 className="font-display text-2xl uppercase">Creator Artwork Modes</h2>
            <p className="text-sm text-zinc-400 mt-2 max-w-3xl">
              Select how creators may supply artwork. Full-wrap artwork remains one source file even when front, back and angled storefront mockups are generated from it.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          {ARTWORK_MODES.map((mode) => {
            const selected = safeArray(artworkModes).includes(mode.value);
            return (
              <button
                key={mode.value}
                type="button"
                className={selected ? "print-rule-card active" : "print-rule-card"}
                onClick={() => toggleArtworkMode(mode.value)}
              >
                <div className="font-bold text-sm text-left">{mode.label}</div>
                <div className="text-xs text-zinc-500 text-left mt-2">{mode.description}</div>
                <span className={selected ? "studio-pill active mt-3" : "studio-pill mt-3"}>
                  {selected ? "Enabled" : "Enable"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="studio-panel">
        <div className="studio-panel-header">
          <div>
            <div className="overline mb-1">Template image library</div>
            <h2 className="font-display text-2xl uppercase">Gallery & Mockup Roles</h2>
            <p className="text-sm text-zinc-400 mt-2 max-w-3xl">
              Every image has an explicit purpose. The artwork editor background, creator selection image and storefront mockups no longer compete for one generic image field.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <label>
              <span className="label">New image role</span>
              <select className="input-base min-w-[220px]" value={uploadRole} onChange={(event) => setUploadRole(event.target.value)}>
                {TEMPLATE_GALLERY_ROLES.map((role) => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
              </select>
            </label>
            <label className="studio-file-button">
              <ImagePlus size={14} /> {uploading ? "Uploading" : "Upload image"}
              <input
                type="file"
                className="hidden"
                accept="image/*"
                disabled={uploading}
                onChange={(event) => {
                  upload(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
        </div>

        {!rows.length ? (
          <div className="dropzone min-h-[220px] flex items-center justify-center text-center text-zinc-500">
            Upload the catalogue image, artwork-editor background and sellable mockup views for this template.
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 2xl:grid-cols-3 gap-4">
            {rows.map((row) => (
              <div key={row.id} className="border border-white/10 rounded-xl overflow-hidden bg-black/20">
                <div className="aspect-square bg-black flex items-center justify-center overflow-hidden">
                  {row.image_url ? (
                    <img src={assetUrl(row.image_url)} alt={row.name || row.role} className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-zinc-600 text-xs">Missing image</span>
                  )}
                </div>

                <div className="p-4 space-y-3">
                  <div className="flex justify-between gap-3">
                    <button
                      type="button"
                      className={row.is_primary ? "text-[#FFB020]" : "text-zinc-500 hover:text-white"}
                      title="Use as primary template image"
                      onClick={() => setPrimary(row.id)}
                    >
                      <Star size={18} fill={row.is_primary ? "currentColor" : "none"} />
                    </button>
                    <button type="button" className="text-zinc-500 hover:text-[#FFB4B0]" onClick={() => removeRow(row.id)}>
                      <Trash2 size={17} />
                    </button>
                  </div>

                  <label>
                    <span className="label">Image name</span>
                    <input className="input-base" value={row.name} onChange={(event) => patchRow(row.id, { name: event.target.value })} />
                  </label>

                  <label>
                    <span className="label">Role</span>
                    <select className="input-base" value={row.role} onChange={(event) => patchRow(row.id, { role: event.target.value })}>
                      {TEMPLATE_GALLERY_ROLES.map((role) => (
                        <option key={role.value} value={role.value}>{role.label}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span className="label">View key</span>
                    <input className="input-base" value={row.view_key} onChange={(event) => patchRow(row.id, { view_key: event.target.value })} placeholder="front, back, angled, mug_wrap" />
                  </label>

                  <label>
                    <span className="label">Source print area</span>
                    <select className="input-base" value={row.source_print_area_id} onChange={(event) => patchRow(row.id, { source_print_area_id: event.target.value })}>
                      <option value="">Not linked</option>
                      {safeArray(printAreas).map((area) => (
                        <option key={area.id} value={area.id}>{area.name || area.area_key || area.id}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span className="label">Derived from artwork mode</span>
                    <select className="input-base" value={row.derived_from_artwork_mode} onChange={(event) => patchRow(row.id, { derived_from_artwork_mode: event.target.value })}>
                      <option value="">Direct image</option>
                      {ARTWORK_MODES.map((mode) => (
                        <option key={mode.value} value={mode.value}>{mode.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
