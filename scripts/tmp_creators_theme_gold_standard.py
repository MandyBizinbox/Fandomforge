from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / 'frontend/src/components/admin/creators/AdminCreatorsWorkspace.jsx'
text = path.read_text()

replacements = {
    'btn-primary': 'ff-admin-button ff-admin-button--primary',
    'btn-secondary': 'ff-admin-button ff-admin-button--secondary',
    'input-base': 'ff-admin-control',
    'text-[var(--ff-muted-text)]': 'ff-admin-muted',
    'className="label"': 'className="ff-admin-label"',
    'className="card ': 'className="ff-admin-card ',
    'className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] rounded-xl p-3"': 'className="ff-admin-subpanel p-3"',
    'className="aspect-[4/3] bg-[var(--ff-card-bg)] border border-[var(--ff-card-border)] rounded-lg overflow-hidden flex items-center justify-center mb-3"': 'className="aspect-[4/3] ff-admin-subpanel overflow-hidden flex items-center justify-center mb-3"',
    'className="lg:col-span-3 border border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)] p-4 space-y-4"': 'className="lg:col-span-3 ff-admin-subpanel p-4 space-y-4"',
    'className="flex items-start gap-3 border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-3 cursor-pointer"': 'className="ff-admin-subpanel flex items-start gap-3 p-3 cursor-pointer"',
    'className="border border-[var(--ff-card-border)] overflow-x-auto"': 'className="ff-admin-card p-0 overflow-x-auto"',
}

for old, new in replacements.items():
    text = text.replace(old, new)

# Give the routed workspace the same canonical page ownership as Manufacturing.
text = text.replace(
    '    <div data-testid="admin-creators-page" className="space-y-8">',
    '    <div data-testid="admin-creators-page" className="ff-admin-page"><div className="ff-admin-page__inner">',
    1,
)
text = text.replace(
    '    </div>\n  );\n}\n\nfunction CreatorAccountEditRoute',
    '    </div></div>\n  );\n}\n\nfunction CreatorAccountEditRoute',
    1,
)

# Promote page-level title/description classes without changing hierarchy or copy.
text = text.replace('className="font-display text-5xl uppercase"', 'className="ff-admin-page-title"')
text = text.replace('className="ff-admin-muted mt-2 max-w-3xl"', 'className="ff-admin-page-description"')

# Keep table semantics but move wrapper/surfaces to canonical ownership.
text = text.replace('className="table-brutal min-w-[1100px]"', 'className="table-brutal min-w-[1100px] w-full"')

path.write_text(text)

legacy = ['btn-primary', 'btn-secondary', 'input-base', 'className="label"', 'className="card ']
for token in legacy:
    if token in text:
        raise SystemExit(f'legacy creator styling remains: {token}')

required = [
    'ff-admin-page',
    'ff-admin-page__inner',
    'ff-admin-button ff-admin-button--primary',
    'ff-admin-button ff-admin-button--secondary',
    'ff-admin-control',
    'ff-admin-card',
    'ff-admin-subpanel',
    'ff-admin-label',
]
for token in required:
    if token not in text:
        raise SystemExit(f'missing creator admin primitive: {token}')

print('Creator workspace migrated to canonical admin theme primitives')
