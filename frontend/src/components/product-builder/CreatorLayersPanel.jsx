import React, { useEffect, useState } from "react";
import { ChevronDown, Image as ImageIcon, Type } from "lucide-react";
import { asArray } from "./productBuilderUtils";

export default function CreatorLayersPanel({
  groups,
  activeGroupId = "",
  activeSlotId = "",
  onSelectGroup,
  onSelectSlot,
}) {
  const safeGroups = asArray(groups);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  useEffect(() => {
    setInspectorOpen(false);
  }, [activeSlotId]);

  return (
    <div className="creator-studio-layers-panel" data-testid="creator-layers-panel">
      {safeGroups.map((group, groupIndex) => {
        const slots = asArray(group.artworks);
        const groupActive = group.id === activeGroupId || (!activeGroupId && groupIndex === 0);
        return (
          <section key={group.id} className="creator-studio-layer-group">
            <button type="button" className={`creator-studio-layer-group-head ${groupActive ? "is-active" : ""}`} onClick={() => onSelectGroup?.(group.id)}>
              <strong>{group.label || `Artwork ${String.fromCharCode(65 + groupIndex)}`}</strong>
              <span>{slots.length} layer{slots.length === 1 ? "" : "s"}</span>
            </button>
            {groupActive && (
              <div className="creator-studio-layer-list">
                {slots.map((slot, index) => {
                  const active = slot.id === activeSlotId;
                  const label = slot.text_layer ? (slot.text_content || "Text layer") : (slot.file_name || `Image layer ${index + 1}`);
                  const area = slot.screen_view || slot.area_key || "Print area";
                  return (
                    <React.Fragment key={slot.id}>
                      <button type="button" className={`creator-studio-layer-row ${active ? "is-active" : ""}`} onClick={() => onSelectSlot?.(group.id, slot.id)}>
                        <span className="creator-studio-layer-icon">{slot.text_layer ? <Type size={14} /> : <ImageIcon size={14} />}</span>
                        <span className="creator-studio-layer-copy"><strong>{label}</strong><small>{area}</small></span>
                      </button>
                      {active && (
                        <div className={`creator-studio-layer-inspector ${inspectorOpen ? "is-open" : ""}`}>
                          <button type="button" className="creator-studio-layer-inspector-toggle" onClick={() => setInspectorOpen((value) => !value)} aria-expanded={inspectorOpen}>
                            <span>Inspector</span>
                            <ChevronDown size={14} />
                          </button>
                          <div className="creator-studio-layer-inspector-body">
                            <div id="creator-layer-inspector-slot" />
                          </div>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
                {!slots.length && <div className="creator-studio-note">No layers yet. Add an image or text from the design toolbar.</div>}
              </div>
            )}
          </section>
        );
      })}
      {!safeGroups.length && <div className="creator-studio-note">Create an artwork scope first, then add image or text layers.</div>}
    </div>
  );
}
