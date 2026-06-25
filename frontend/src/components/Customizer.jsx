import React, { useRef, useState } from "react";
import { Type, Image as ImageIcon, Trash2, Save } from "lucide-react";
import { assetUrl } from "../lib/api";

const FONTS = ["Anton", "Chivo", "Arial", "Georgia", "Impact", "Courier New"];
const COLORS = ["#FFFFFF", "#FF3B30", "#000000", "#FFCC00", "#34C759", "#0A84FF"];

export default function Customizer({ mockupUrl, onSave, onCancel }) {
  const [layers, setLayers] = useState([]); // {id, type, text?, src?, x, y, scale, rotation, color, font, size}
  const [selected, setSelected] = useState(null);
  const canvasRef = useRef(null);

  const addText = () => {
    const id = crypto.randomUUID();
    setLayers((l) => [...l, { id, type: "text", text: "YOUR TEXT", x: 150, y: 150, scale: 1, rotation: 0, color: "#FFFFFF", font: "Anton", size: 36 }]);
    setSelected(id);
  };

  const onUploadImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const id = crypto.randomUUID();
      setLayers((l) => [...l, { id, type: "image", src: reader.result, x: 120, y: 120, scale: 1, rotation: 0 }]);
      setSelected(id);
    };
    reader.readAsDataURL(file);
  };

  const updateLayer = (id, patch) => {
    setLayers((l) => l.map((lyr) => lyr.id === id ? { ...lyr, ...patch } : lyr));
  };

  const removeLayer = (id) => {
    setLayers((l) => l.filter((lyr) => lyr.id !== id));
    if (selected === id) setSelected(null);
  };

  // Drag handling
  const dragRef = useRef(null);
  const startDrag = (e, id) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    dragRef.current = { id, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top, layer: layers.find((l) => l.id === id) };
    setSelected(id);
    window.addEventListener("mousemove", onDrag);
    window.addEventListener("mouseup", endDrag);
  };
  const onDrag = (e) => {
    if (!dragRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const dx = (e.clientX - rect.left) - dragRef.current.offsetX;
    const dy = (e.clientY - rect.top) - dragRef.current.offsetY;
    updateLayer(dragRef.current.id, {
      x: dragRef.current.layer.x + dx,
      y: dragRef.current.layer.y + dy,
    });
  };
  const endDrag = () => {
    dragRef.current = null;
    window.removeEventListener("mousemove", onDrag);
    window.removeEventListener("mouseup", endDrag);
  };

  const handleSave = async () => {
    // Generate a simple preview using canvas (composite mockup + layers)
    const canvas = document.createElement("canvas");
    canvas.width = 600; canvas.height = 600;
    const ctx = canvas.getContext("2d");
    // Draw mockup
    const mockImg = new Image();
    mockImg.crossOrigin = "anonymous";
    await new Promise((res) => {
      mockImg.onload = () => { ctx.drawImage(mockImg, 0, 0, 600, 600); res(); };
      mockImg.onerror = () => res();
      mockImg.src = assetUrl(mockupUrl);
    });
    // Draw layers
    for (const l of layers) {
      ctx.save();
      ctx.translate(l.x + 100, l.y + 100);
      ctx.rotate((l.rotation * Math.PI) / 180);
      ctx.scale(l.scale, l.scale);
      if (l.type === "text") {
        ctx.fillStyle = l.color;
        ctx.font = `${l.size}px ${l.font}`;
        ctx.textAlign = "center";
        ctx.fillText(l.text, 0, 0);
      } else if (l.type === "image") {
        const img = new Image();
        await new Promise((r) => { img.onload = r; img.onerror = r; img.src = l.src; });
        try { ctx.drawImage(img, -60, -60, 120, 120); } catch (e) {}
      }
      ctx.restore();
    }
    const preview = canvas.toDataURL("image/png");
    const text_entries = layers.filter((l) => l.type === "text").map((l) => ({ text: l.text, color: l.color, font: l.font }));
    const uploaded_files = layers.filter((l) => l.type === "image").map((l) => l.src);
    onSave({
      preview_image: preview,
      design_json: { layers },
      text_entries,
      uploaded_files,
      placement: "front",
    });
  };

  const selectedLayer = layers.find((l) => l.id === selected);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6" data-testid="customizer">
      <div>
        <div className="overline mb-2">PREVIEW</div>
        <div
          ref={canvasRef}
          className="relative bg-[#0A0A0A] border border-white/20 aspect-square overflow-hidden select-none"
          data-testid="customizer-canvas"
        >
          {mockupUrl && (
            <img src={assetUrl(mockupUrl)} alt="mockup" className="w-full h-full object-cover pointer-events-none" />
          )}
          {layers.map((l) => (
            <div
              key={l.id}
              className={`canvas-overlay ${selected === l.id ? 'selected' : ''}`}
              style={{
                left: l.x,
                top: l.y,
                transform: `rotate(${l.rotation}deg) scale(${l.scale})`,
              }}
              onMouseDown={(e) => startDrag(e, l.id)}
              data-testid={`layer-${l.id}`}
            >
              {l.type === "text" ? (
                <div style={{ color: l.color, fontFamily: l.font, fontSize: l.size, whiteSpace: "nowrap" }}>{l.text}</div>
              ) : (
                <img src={l.src} alt="" style={{ width: 120, height: 120, objectFit: "contain" }} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <div className="overline mb-2">TOOLS</div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={addText} className="btn-secondary text-xs py-2" data-testid="add-text-btn">
              <Type size={14} /> Add Text
            </button>
            <label className="btn-secondary text-xs py-2 cursor-pointer" data-testid="add-image-btn">
              <ImageIcon size={14} /> Add Image
              <input type="file" accept="image/*" onChange={onUploadImage} className="hidden" />
            </label>
          </div>
        </div>

        {selectedLayer && (
          <div className="card p-4">
            <div className="overline mb-3">EDIT LAYER</div>
            {selectedLayer.type === "text" && (
              <div className="space-y-3">
                <input
                  className="input-base text-sm"
                  value={selectedLayer.text}
                  onChange={(e) => updateLayer(selectedLayer.id, { text: e.target.value })}
                  data-testid="layer-text-input"
                />
                <div>
                  <label className="label">Font</label>
                  <select className="input-base text-sm" value={selectedLayer.font} onChange={(e) => updateLayer(selectedLayer.id, { font: e.target.value })} data-testid="layer-font">
                    {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Colour</label>
                  <div className="flex gap-2 flex-wrap">
                    {COLORS.map((c) => (
                      <button key={c} onClick={() => updateLayer(selectedLayer.id, { color: c })}
                        className="w-7 h-7 border" style={{ background: c, borderColor: selectedLayer.color === c ? '#FF3B30' : 'rgba(255,255,255,0.2)' }}
                        data-testid={`layer-color-${c}`} />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label">Size ({selectedLayer.size}px)</label>
                  <input type="range" min="12" max="80" value={selectedLayer.size} onChange={(e) => updateLayer(selectedLayer.id, { size: Number(e.target.value) })} className="w-full" />
                </div>
              </div>
            )}
            <div className="mt-3">
              <label className="label">Scale ({selectedLayer.scale.toFixed(2)}x)</label>
              <input type="range" min="0.3" max="3" step="0.1" value={selectedLayer.scale} onChange={(e) => updateLayer(selectedLayer.id, { scale: Number(e.target.value) })} className="w-full" data-testid="layer-scale" />
            </div>
            <div className="mt-3">
              <label className="label">Rotation ({selectedLayer.rotation}°)</label>
              <input type="range" min="-180" max="180" value={selectedLayer.rotation} onChange={(e) => updateLayer(selectedLayer.id, { rotation: Number(e.target.value) })} className="w-full" data-testid="layer-rotate" />
            </div>
            <button onClick={() => removeLayer(selectedLayer.id)} className="mt-3 text-[#FF3B30] text-xs uppercase tracking-widest font-bold flex items-center gap-2 hover:text-white" data-testid="remove-layer-btn">
              <Trash2 size={14} /> Delete Layer
            </button>
          </div>
        )}

        <div className="mt-auto flex flex-col gap-2">
          <button onClick={handleSave} className="btn-primary text-sm" data-testid="customizer-save-btn">
            <Save size={14} /> Save Design
          </button>
          <button onClick={onCancel} className="btn-secondary text-sm" data-testid="customizer-cancel-btn">Cancel</button>
        </div>
      </div>
    </div>
  );
}
