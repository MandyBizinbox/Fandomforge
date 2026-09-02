from pathlib import Path

root = Path(__file__).resolve().parents[1]
files = [
    root / 'frontend/src/pages/admin/AdminManufacturingRulesUnified.jsx',
    root / 'frontend/src/pages/admin/ManufacturingProfilesPanel.jsx',
    root / 'frontend/src/pages/admin/manufacturingRulesShared.jsx',
]

replacements = {
    'btn-primary': 'ff-admin-button ff-admin-button--primary',
    'btn-secondary': 'ff-admin-button ff-admin-button--secondary',
    'input-base': 'ff-admin-control',
    'text-[var(--ff-muted-text)]': 'ff-admin-muted',
    'border border-black/40': 'ff-admin-swatch',
    'border-[var(--ff-primary)]': 'ff-admin-primary-border',
}

for path in files:
    text = path.read_text()
    for old, new in replacements.items():
        text = text.replace(old, new)
    path.write_text(text)

shared = root / 'frontend/src/styles/platform-foundation.css'
css = shared.read_text()
marker = '\n.ff-admin-danger-text {\n'
if marker not in css:
    raise SystemExit('foundation insertion marker missing')
block = r'''
.ff-admin-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 2.75rem;
  padding: 0.7rem 1rem;
  border: 1px solid transparent;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}

.ff-admin-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ff-admin-button--primary {
  background: var(--ff-button-primary-bg);
  color: var(--ff-button-primary-text);
  border-color: var(--ff-button-primary-border);
}

.ff-admin-button--primary:hover:not(:disabled) {
  background: var(--ff-button-alternate-bg);
  color: var(--ff-button-alternate-text);
  border-color: var(--ff-button-alternate-border);
}

.ff-admin-button--secondary {
  background: var(--ff-button-alternate-bg);
  color: var(--ff-button-alternate-text);
  border-color: var(--ff-button-secondary-idle-border);
}

.ff-admin-button--secondary:hover:not(:disabled) {
  border-color: var(--ff-primary);
}

.ff-admin-control {
  width: 100%;
  padding: 0.75rem 1rem;
  background: var(--ff-input-bg);
  color: var(--ff-input-text);
  border: 1px solid var(--ff-input-border);
  font: inherit;
  outline: none;
}

.ff-admin-control:focus {
  border-color: var(--ff-primary);
  outline: 1px solid var(--ff-primary);
  outline-offset: 0;
}

.ff-admin-control::placeholder {
  color: var(--ff-muted-text);
  opacity: 0.75;
}

.ff-admin-primary-border {
  border-color: var(--ff-primary) !important;
}

.ff-admin-swatch {
  border: 1px solid var(--ff-card-border);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ff-card-text) 12%, transparent);
}
'''
css = css.replace(marker, '\n' + block + marker, 1)
shared.write_text(css)

for path in files:
    text = path.read_text()
    if 'btn-primary' in text or 'btn-secondary' in text or 'input-base' in text or 'border-black/40' in text:
        raise SystemExit(f'legacy manufacturing styling remains in {path}')

print('Manufacturing Rules migrated to scoped admin theme primitives')
