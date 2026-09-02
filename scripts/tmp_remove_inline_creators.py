from pathlib import Path

path = Path('frontend/src/pages/AdminDashboard.jsx')
text = path.read_text()

# Safety: the extracted workspace must already own the live Creator route.
required_before = [
    'import AdminCreatorsWorkspace from "../components/admin/creators/AdminCreatorsWorkspace";',
    '<Route path="creators/*" element={<AdminCreatorsWorkspace',
    'function BandsAdmin() {',
    'function PrintersAdmin() {',
    'function AssetUploadField(',
]
for token in required_before:
    if token not in text:
        raise SystemExit(f'missing required safety marker: {token}')

if text.count('function BandsAdmin() {') != 1:
    raise SystemExit('BandsAdmin occurrence count is not exactly one')

# Remove Creator-only form constants, preserving printer constants immediately after them.
const_start = text.index('const emptyCreatorForm = {')
printer_constants = text.index('const PRINTER_PRODUCT_CAPABILITIES', const_start)
text = text[:const_start] + text[printer_constants:]

# Remove only the old inline Creator CRUD implementation. Shared AssetUploadField stays above it.
bands_start = text.index('function BandsAdmin() {')
printers_start = text.index('function PrintersAdmin() {', bands_start)
text = text[:bands_start] + text[printers_start:]

# These JSON helpers existed only for the deleted inline Creator form. Verify that before removing them.
for name in ('safeJsonObjectFromText', 'jsonText'):
    if text.count(name) != 1:
        raise SystemExit(f'{name} still has a surviving consumer; refusing deletion (count={text.count(name)})')

helpers_start = text.index('function safeJsonObjectFromText(value) {')
csv_start = text.index('function csvText(value)', helpers_start)
text = text[:helpers_start] + text[csv_start:]

# Postconditions: dead Creator implementation gone; live route + shared Printer pieces remain.
for token in (
    'emptyCreatorForm',
    'CREATOR_VISIBILITY_OPTIONS',
    'function BandsAdmin() {',
    'safeJsonObjectFromText',
    'function jsonText(value)',
):
    if token in text:
        raise SystemExit(f'dead Creator token remains: {token}')

required_after = [
    'import AdminCreatorsWorkspace from "../components/admin/creators/AdminCreatorsWorkspace";',
    '<Route path="creators/*" element={<AdminCreatorsWorkspace',
    'function AssetUploadField(',
    'function PrintersAdmin() {',
    'const PRINTER_PRODUCT_CAPABILITIES',
    'const emptyPrinterForm = {',
]
for token in required_after:
    if token not in text:
        raise SystemExit(f'required non-Creator code was lost: {token}')

path.write_text(text)
print('Removed dead inline Creator CRUD while preserving routed Creator workspace and Printer dependencies')
