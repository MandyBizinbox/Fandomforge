#!/usr/bin/env python3
"""Add configurable full-wrap source and target projection controls."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "frontend" / "src" / "components" / "template-studio" / "TemplateGalleryManager.jsx"


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"ABORT: expected one {label} block, found {count}.")
    return source.replace(old, new, 1)


def main() -> None:
    source = TARGET.read_text(encoding="utf-8")
    if "Full-wrap projection" in source:
        print("Full-wrap projection controls already applied.")
        return

    source = replace_once(
        source,
        '''  const patchRow = (id, patch) => {\n    commit(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));\n  };\n''',
        '''  const patchRow = (id, patch) => {\n    commit(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));\n  };\n\n  const patchCrop = (id, key, value) => {\n    const row = rows.find((item) => item.id === id);\n    if (!row) return;\n    patchRow(id, {\n      crop: {\n        ...(row.crop || {}),\n        [key]: Number(value || 0),\n      },\n    });\n  };\n''',
        "crop patch helper",
    )

    source = replace_once(
        source,
        '''                  <label>\n                    <span className="label">Derived from artwork mode</span>\n                    <select className="input-base" value={row.derived_from_artwork_mode} onChange={(event) => patchRow(row.id, { derived_from_artwork_mode: event.target.value })}>\n                      <option value="">Direct image</option>\n                      {ARTWORK_MODES.map((mode) => (\n                        <option key={mode.value} value={mode.value}>{mode.label}</option>\n                      ))}\n                    </select>\n                  </label>\n''',
        '''                  <label>\n                    <span className="label">Derived from artwork mode</span>\n                    <select className="input-base" value={row.derived_from_artwork_mode} onChange={(event) => patchRow(row.id, { derived_from_artwork_mode: event.target.value })}>\n                      <option value="">Direct image</option>\n                      {ARTWORK_MODES.map((mode) => (\n                        <option key={mode.value} value={mode.value}>{mode.label}</option>\n                      ))}\n                    </select>\n                  </label>\n\n                  {row.derived_from_artwork_mode === "full_wrap" && (\n                    <div className="border border-[#FF7A1A]/30 bg-[#FF7A1A]/5 rounded-lg p-3 space-y-3">\n                      <div>\n                        <div className="overline mb-1 text-[#FFB066]">Full-wrap projection</div>\n                        <p className="text-[11px] text-zinc-500">Choose which section of the panoramic artwork is projected onto this sellable mockup and where it lands on the blank product image.</p>\n                      </div>\n\n                      <div className="grid grid-cols-2 gap-2">\n                        {[\n                          ["source_x_pct", "Source X %", row.role === "back_mockup" ? 50 : row.role === "angled_mockup" ? 15 : 0],\n                          ["source_y_pct", "Source Y %", 0],\n                          ["source_width_pct", "Source width %", row.role === "angled_mockup" ? 70 : 50],\n                          ["source_height_pct", "Source height %", 100],\n                          ["target_x_pct", "Target X %", 25],\n                          ["target_y_pct", "Target Y %", 25],\n                          ["target_width_pct", "Target width %", 50],\n                          ["target_height_pct", "Target height %", 50],\n                          ["rotation_deg", "Rotation °", 0],\n                          ["curve_strength", "Curve 0–1", 0],\n                          ["opacity", "Opacity 0–1", 1],\n                        ].map(([key, label, fallback]) => (\n                          <label key={key}>\n                            <span className="label text-[10px]">{label}</span>\n                            <input\n                              className="input-base"\n                              type="number"\n                              step={key === "curve_strength" || key === "opacity" ? "0.05" : "1"}\n                              value={row.crop?.[key] ?? fallback}\n                              onChange={(event) => patchCrop(row.id, key, event.target.value)}\n                            />\n                          </label>\n                        ))}\n                      </div>\n                    </div>\n                  )}\n''',
        "projection controls",
    )

    TARGET.write_text(source, encoding="utf-8")
    print("Applied full-wrap gallery projection controls.")


if __name__ == "__main__":
    main()
