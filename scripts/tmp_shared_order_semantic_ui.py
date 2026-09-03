from pathlib import Path

paths = [
    Path('frontend/src/components/orders/ManualOrderBuilder.jsx'),
    Path('frontend/src/components/orders/RoleOrderDetail.jsx'),
]

for path in paths:
    text = path.read_text()
    if not text:
        raise SystemExit(f'empty source: {path}')

manual = paths[0].read_text()
detail = paths[1].read_text()

# Guard expected legacy styling before touching anything.
for token in ['btn-secondary', 'input-base', 'text-zinc-400', 'border-white/10', 'bg-black/30', '#FF3B30', '#34C759']:
    if token not in manual:
        raise SystemExit(f'missing expected ManualOrderBuilder legacy token: {token}')
for token in ['btn-secondary', 'input-base', 'text-zinc-400', 'border-white/10', 'bg-black/20', '#FF3B30', 'text-emerald-400']:
    if token not in detail:
        raise SystemExit(f'missing expected RoleOrderDetail legacy token: {token}')

# Shared role-neutral primitives. These deliberately do not use ff-admin-* because
# both components render for creator/printer/customer contexts too.
manual_replacements = {
    'className="card text-zinc-400"': 'className="ff-ui-card ff-ui-muted"',
    'className="text-zinc-400 text-sm mt-3 max-w-3xl"': 'className="ff-ui-muted text-sm mt-3 max-w-3xl"',
    'className="btn-secondary"': 'className="ff-ui-button ff-ui-button--secondary"',
    'className="btn-secondary text-xs"': 'className="ff-ui-button ff-ui-button--secondary text-xs"',
    'className="card"': 'className="ff-ui-card"',
    'className="label"': 'className="ff-ui-label"',
    'className="input-base"': 'className="ff-ui-control"',
    'className="text-xs text-zinc-500 mt-2"': 'className="text-xs ff-ui-muted mt-2"',
    'className="border border-white/10 bg-black/30 p-4"': 'className="ff-ui-subpanel p-4"',
    'className="text-xs uppercase tracking-widest text-[#FF3B30] font-bold"': 'className="ff-ui-danger-text text-xs uppercase tracking-widest font-bold"',
    'gap-3 text-xs text-zinc-400': 'gap-3 text-xs ff-ui-muted',
    'border border-white/10 bg-black flex items-center': 'border border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)] flex items-center',
    'className="text-zinc-600"': 'className="ff-ui-muted"',
    'className="text-zinc-500"': 'className="ff-ui-muted"',
    'className="text-white"': 'className="text-[var(--ff-card-text)]"',
    'className="card h-fit sticky top-24"': 'className="ff-ui-card h-fit sticky top-24"',
    'className="text-zinc-400"': 'className="ff-ui-muted"',
    'border-t border-white/15': 'border-t border-[var(--ff-card-border)]',
    'className="text-[#34C759]"': 'className="ff-ui-success-text"',
    'text-sm text-zinc-300': 'text-sm text-[var(--ff-card-text)]',
    'block text-xs text-zinc-500': 'block text-xs ff-ui-muted',
    'className="btn-primary w-full mt-6"': 'className="ff-ui-button ff-ui-button--primary w-full mt-6"',
}
for old, new in manual_replacements.items():
    manual = manual.replace(old, new)

# Role detail: preserve the standalone print invoice CSS because it intentionally
# targets a white printable document, not the application theme.
detail_replacements = {
    'rounded-xl border border-white/10 bg-black/20 px-4 py-3': 'ff-ui-stat-card px-4 py-3',
    'text-[10px] uppercase tracking-widest text-zinc-500': 'text-[10px] uppercase tracking-widest ff-ui-muted',
    'mt-1 text-white': 'mt-1 text-[var(--ff-card-text)]',
    'return <section className={`card ${className}`}>': 'return <section className={`ff-ui-card ${className}`}>',
    'border-[#FF3B30] text-white bg-white/[0.03]': 'ff-ui-tab--active',
    'border-transparent text-zinc-500 hover:text-white': 'border-transparent ff-ui-muted hover:text-[var(--ff-card-text)]',
    'w-24 h-24 border border-white/10 bg-black/20': 'w-24 h-24 border border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)]',
    'text-[10px] text-zinc-600': 'text-[10px] ff-ui-muted',
    'text-xs text-zinc-400': 'text-xs ff-ui-muted',
    'text-emerald-400': 'ff-ui-success-text',
    'className="btn-secondary inline-flex mt-3 text-xs"': 'className="ff-ui-button ff-ui-button--secondary inline-flex mt-3 text-xs"',
    'border-t border-white/10': 'border-t border-[var(--ff-card-border)]',
    'className="label"': 'className="ff-ui-label"',
    'className="input-base"': 'className="ff-ui-control"',
    'bg-[#FF3B30] border-[#FF3B30] text-white': 'ff-ui-choice--active',
    'border-white/15 text-zinc-400 hover:text-white': 'ff-ui-choice--idle',
    'text-xs uppercase tracking-widest text-zinc-400 hover:text-white': 'text-xs uppercase tracking-widest ff-ui-muted hover:text-[var(--ff-card-text)]',
    'className="btn-secondary"': 'className="ff-ui-button ff-ui-button--secondary"',
    'className="text-xs text-zinc-500"': 'className="text-xs ff-ui-muted"',
    'border border-white/10 bg-black/20 overflow-x-auto': 'ff-ui-tabs overflow-x-auto',
    'className="font-bold text-white"': 'className="font-bold text-[var(--ff-card-text)]"',
    'className="text-sm text-zinc-400': 'className="text-sm ff-ui-muted',
    'className="text-zinc-400': 'className="ff-ui-muted',
    'className="input-base flex-1"': 'className="ff-ui-control flex-1"',
    'className="btn-primary md:self-end"': 'className="ff-ui-button ff-ui-button--primary md:self-end"',
    'className="btn-secondary w-full mt-3"': 'className="ff-ui-button ff-ui-button--secondary w-full mt-3"',
    'className="mt-4 text-xs text-zinc-500"': 'className="mt-4 text-xs ff-ui-muted"',
    'bg-[#FF3B30] border-[#FF3B30]': 'ff-ui-choice--active',
    'border-white/15 text-zinc-400': 'ff-ui-choice--idle',
}
for old, new in detail_replacements.items():
    detail = detail.replace(old, new)

# Remaining app-view legacy colors/classes are forbidden. Ignore print HTML literal.
app_detail = detail.split('const printDispatchInvoice = () => {', 1)[0] + detail.split('  const renderItems =', 1)[1]
for token in ['btn-secondary', 'btn-primary', 'input-base', 'text-zinc-', 'text-emerald-', 'border-white/', 'bg-black/', 'bg-[#FF3B30]', 'border-[#FF3B30]']:
    if token in app_detail:
        raise SystemExit(f'legacy RoleOrderDetail app styling remains: {token}')
for token in ['btn-secondary', 'btn-primary', 'input-base', 'text-zinc-', 'border-white/', 'bg-black', '#FF3B30', '#34C759']:
    if token in manual:
        raise SystemExit(f'legacy ManualOrderBuilder styling remains: {token}')

paths[0].write_text(manual)
paths[1].write_text(detail)

css_path = Path('frontend/src/styles/platform-foundation.css')
css = css_path.read_text()
marker = '\n/* Shared role-neutral semantic UI primitives */\n'
if marker in css:
    raise SystemExit('shared semantic UI primitives already exist')
css += marker + r'''
.ff-ui-card,
.ff-ui-stat-card,
.ff-ui-subpanel,
.ff-ui-tabs {
  background: var(--ff-card-bg);
  color: var(--ff-card-text);
  border: 1px solid var(--ff-card-border);
  border-radius: var(--ff-card-radius, 0.5rem);
  box-shadow: var(--ff-card-shadow, none);
}

.ff-ui-card { padding: 1.25rem; }
.ff-ui-subpanel { background: var(--ff-surface-bg); color: var(--ff-surface-text); }
.ff-ui-stat-card { background: var(--ff-surface-bg); color: var(--ff-surface-text); }
.ff-ui-muted { color: var(--ff-muted-text); }
.ff-ui-label {
  color: var(--ff-muted-text);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.ff-ui-control {
  width: 100%;
  padding: 0.75rem 1rem;
  background: var(--ff-input-bg);
  color: var(--ff-input-text);
  border: 1px solid var(--ff-input-border);
  font: inherit;
  outline: none;
}
.ff-ui-control:focus { border-color: var(--ff-primary); outline: 1px solid var(--ff-primary); }
.ff-ui-button {
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
}
.ff-ui-button:disabled { opacity: 0.5; cursor: not-allowed; }
.ff-ui-button--primary { background: var(--ff-button-primary-bg); color: var(--ff-button-primary-text); border-color: var(--ff-button-primary-border); }
.ff-ui-button--secondary { background: var(--ff-button-alternate-bg); color: var(--ff-button-alternate-text); border-color: var(--ff-button-alternate-border, var(--ff-card-border)); }
.ff-ui-tabs { background: var(--ff-surface-bg); }
.ff-ui-tab--active { border-color: var(--ff-primary); color: var(--ff-card-text); background: color-mix(in srgb, var(--ff-primary) 12%, var(--ff-card-bg)); }
.ff-ui-choice--active { background: var(--ff-primary); border-color: var(--ff-primary); color: var(--ff-button-primary-text); }
.ff-ui-choice--idle { border-color: var(--ff-card-border); color: var(--ff-muted-text); }
.ff-ui-choice--idle:hover { border-color: var(--ff-primary); color: var(--ff-card-text); }
.ff-ui-danger-text { color: var(--ff-danger, #dc2626); }
.ff-ui-success-text { color: var(--ff-success, #16a34a); }
'''
css_path.write_text(css)
print('Shared order surfaces migrated to role-neutral semantic UI primitives')
