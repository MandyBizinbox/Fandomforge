from pathlib import Path

route_path = Path('frontend/src/components/admin/fulfilment/AdminFulfilmentRoute.jsx')
card_path = Path('frontend/src/components/production/ProductionJobCard.jsx')

route = route_path.read_text()
card = card_path.read_text()

required_route = [
    'data-testid="admin-fulfilment-workspace" className="space-y-6"',
    'className="btn-primary"',
    'className="input-base py-1 text-xs"',
    'className="card p-4"',
    'className="btn-primary w-full mb-3 text-xs"',
]
for token in required_route:
    if token not in route:
        raise SystemExit(f'missing expected fulfilment route token: {token}')

route = route.replace(
    '<div data-testid="admin-fulfilment-workspace" className="space-y-6">',
    '<div data-testid="admin-fulfilment-workspace" className="ff-admin-page"><div className="ff-admin-page__inner">',
    1,
)
route = route.replace(
    '<div><p className="overline mb-2">Operations</p><h1 className="font-display text-5xl uppercase">Orders & Fulfilment</h1><p className="text-[var(--ff-muted-text)] mt-2 max-w-3xl">Orders, manual creation, production jobs and shipping remain API-backed while each operational view owns a concrete route.</p></div>',
    '<div><p className="overline mb-2">Operations</p><h1 className="ff-admin-page-title">Orders & Fulfilment</h1><p className="ff-admin-page-description">Orders, manual creation, production jobs and shipping remain API-backed while each operational view owns a concrete route.</p></div>',
    1,
)
route = route.replace(
    '!!tabs.length && <nav className="flex flex-wrap gap-2 border-b border-[var(--ff-card-border)] pb-4">{tabs.map(({ to, label }) => <NavLink key={to} to={to} className={({ isActive }) => `px-4 py-3 border text-xs uppercase tracking-widest font-bold ${isActive ? "border-[var(--ff-primary)] bg-[var(--ff-primary)] text-[var(--ff-card-text)]" : "border-[var(--ff-card-border)] text-[var(--ff-muted-text)] hover:text-[var(--ff-card-text)]"}`}>{label}</NavLink>)}</nav>',
    '!!tabs.length && <nav className="ff-admin-section-nav">{tabs.map(({ to, label }) => <NavLink key={to} to={to} className={({ isActive }) => `ff-admin-section-link ${isActive ? "is-active" : ""}`}>{label}</NavLink>)}</nav>',
    1,
)
# Close the added inner wrapper at the end of the workspace.
route = route.replace(
    '      </Routes>\n    </div>\n  );',
    '      </Routes>\n    </div></div>\n  );',
    1,
)

replacements = {
    'className="btn-primary"': 'className="ff-admin-button ff-admin-button--primary"',
    'className="input-base py-1 text-xs"': 'className="ff-admin-control py-1 text-xs"',
    'className="input-base md:w-56"': 'className="ff-admin-control md:w-56"',
    'className="card p-4"': 'className="ff-admin-card p-4"',
    'className="btn-primary w-full mb-3 text-xs"': 'className="ff-admin-button ff-admin-button--primary w-full mb-3 text-xs"',
    'className="input-base text-sm"': 'className="ff-admin-control text-sm"',
    'className="card text-center text-[var(--ff-muted-text)] overline"': 'className="ff-admin-card text-center ff-admin-muted overline"',
    'className="border border-[var(--ff-card-border)] overflow-x-auto"': 'className="ff-admin-card p-0 overflow-x-auto"',
    'className="table-brutal min-w-[900px]"': 'className="table-brutal min-w-[900px] w-full"',
    'text-[var(--ff-muted-text)]': 'ff-admin-muted',
}
for old, new in replacements.items():
    route = route.replace(old, new)

legacy_route = ['btn-primary', 'input-base', 'className="card p-4"', 'text-[var(--ff-muted-text)]']
for token in legacy_route:
    if token in route:
        raise SystemExit(f'legacy fulfilment styling remains: {token}')

for token in ['ff-admin-page', 'ff-admin-page__inner', 'ff-admin-section-nav', 'ff-admin-section-link', 'ff-admin-control', 'ff-admin-button ff-admin-button--primary', 'ff-admin-card']:
    if token not in route:
        raise SystemExit(f'missing canonical fulfilment primitive: {token}')

required_card = [
    'border border-white/15 bg-white/[0.03]',
    'hover:border-[#FF3B30]',
    'bg-black',
    'text-zinc-500',
    'text-white',
    'text-[#34C759]',
    'text-[#FF3B30]',
]
for token in required_card:
    if token not in card:
        raise SystemExit(f'missing expected production card token: {token}')

card = card.replace(
    'className="border border-white/15 bg-white/[0.03] p-4 hover:border-[#FF3B30]"',
    'className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] text-[var(--ff-card-text)] p-4 hover:border-[var(--ff-primary)]"',
    1,
)
card = card.replace('border border-white/10 bg-black', 'border border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)]')
card = card.replace('text-zinc-600', 'text-[var(--ff-muted-text)]')
card = card.replace('text-zinc-500', 'text-[var(--ff-muted-text)]')
card = card.replace('text-zinc-400', 'text-[var(--ff-muted-text)]')
card = card.replace('text-white', 'text-[var(--ff-card-text)]')
card = card.replace('text-[#34C759]', 'text-[var(--ff-primary)]')
card = card.replace('text-[#FF3B30]', 'text-[var(--ff-primary)]')

for token in ['border-white/', 'bg-white/[', 'bg-black', 'text-zinc-', 'text-white', '#FF3B30', '#34C759']:
    if token in card:
        raise SystemExit(f'hard-coded production card styling remains: {token}')

route_path.write_text(route)
card_path.write_text(card)
print('Fulfilment admin shell and shared production card migrated to semantic theme ownership')
