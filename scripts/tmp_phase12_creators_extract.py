from pathlib import Path
import re

DASHBOARD = Path("frontend/src/pages/AdminDashboard.jsx")
COMPONENT = Path("frontend/src/components/admin/creators/AdminCreatorsWorkspace.jsx")
TEST = Path("frontend/src/components/admin/creators/AdminCreatorsWorkspace.test.jsx")

text = DASHBOARD.read_text()


def section(start: str, end: str) -> str:
    s = text.find(start)
    if s < 0:
        raise SystemExit(f"Missing start marker: {start}")
    e = text.find(end, s)
    if e < 0:
        raise SystemExit(f"Missing end marker: {end}")
    return text[s:e].rstrip() + "\n\n"

creator_constants = section("const emptyCreatorForm", "const PRINTER_PRODUCT_CAPABILITIES")
json_helpers = section("function safeJsonObjectFromText", "function csvText")
asset_upload = section("function AssetUploadField", "function BandsAdmin()")
bands_admin = section("function BandsAdmin()", "function PrintersAdmin()")

component = '''import React, { useEffect, useState } from "react";\nimport { Plus, Save } from "lucide-react";\nimport { toast } from "sonner";\nimport { http, assetUrl } from "../../../lib/api";\nimport StatusBadge from "../../StatusBadge";\n\n'''
component += creator_constants + json_helpers + asset_upload + bands_admin
component += '''export default function AdminCreatorsWorkspace() {\n  return <BandsAdmin />;\n}\n'''

COMPONENT.parent.mkdir(parents=True, exist_ok=True)
COMPONENT.write_text(component)

import_anchor = 'import AdminPrintersWorkspace from "../components/admin/printers/AdminPrintersWorkspace";\n'
creator_import = 'import AdminCreatorsWorkspace from "../components/admin/creators/AdminCreatorsWorkspace";\n'
if text.count(import_anchor) != 1:
    raise SystemExit("Expected one printers workspace import anchor")
if creator_import not in text:
    text = text.replace(import_anchor, import_anchor + creator_import, 1)

pattern = r'<Route path="creators" element=\{<BandsAdmin />\} />'
replacement = '<Route path="creators/*" element={<AdminCreatorsWorkspace />} />'
text, count = re.subn(pattern, replacement, text, count=1)
if count != 1:
    raise SystemExit(f"Expected exactly one creators route, replaced {count}")
DASHBOARD.write_text(text)

TEST.write_text(r'''import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import AdminCreatorsWorkspace from "./AdminCreatorsWorkspace";
import { http } from "../../../lib/api";

jest.mock("../../../lib/api", () => ({
  http: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
  assetUrl: (value) => value,
}));

beforeEach(() => {
  http.get.mockImplementation((url) => {
    if (url === "/admin/creators" || url === "/admin/users") return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
});

afterEach(() => jest.clearAllMocks());

test("loads creators and users through the extracted creator workspace", async () => {
  render(<AdminCreatorsWorkspace />);

  expect(await screen.findByTestId("admin-creators-page")).toBeInTheDocument();
  await waitFor(() => {
    expect(http.get).toHaveBeenCalledWith("/admin/creators");
    expect(http.get).toHaveBeenCalledWith("/admin/users");
  });
});
''')
