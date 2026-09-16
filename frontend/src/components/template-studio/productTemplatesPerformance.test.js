import fs from "fs";
import path from "path";

const source = fs.readFileSync(
  path.join(__dirname, "ProductTemplatesPage.jsx"),
  "utf8"
);

test("template list uses the lightweight summary endpoint", () => {
  expect(source).toContain('http.get(`/admin/product-templates/summary${qs}`)');
  expect(source).not.toContain('http.get(`/admin/product-templates${qs}`)');
});

test("template readiness is memoized once per template", () => {
  expect(source).toContain("const readinessById = useMemo(() => {");
  expect(source).toContain("resolvedReadiness(template, printOptions, readinessById)");
  expect(source).toContain("templateStats(templates, printOptions, readinessById)");
});

test("primary template loading is not blocked by lookup requests", () => {
  const templateResolved = source.indexOf("setTemplates(collectionFromResponse(templateResponse.data));");
  const loadingReleased = source.indexOf("setLoading(false);");
  const lookupsResolved = source.indexOf("const [printOptionResponse, productTypeResponse] = await Promise.all");

  expect(templateResolved).toBeGreaterThan(-1);
  expect(loadingReleased).toBeGreaterThan(templateResolved);
  expect(lookupsResolved).toBeGreaterThan(loadingReleased);
});
