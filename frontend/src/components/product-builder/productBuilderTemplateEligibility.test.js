import fs from "fs";
import path from "path";

const builderPath = path.join(__dirname, "ProductBuilderV4.jsx");

function source() {
  return fs.readFileSync(builderPath, "utf8");
}

describe("Product Builder template eligibility", () => {
  test("new template choices use canonical readiness and require active status", () => {
    const text = source();
    expect(text).toContain('import { templateReadiness } from "../../lib/templateReadiness";');
    expect(text).toContain('normalise(template?.status) === "active"');
    expect(text).toContain("templateReadiness(template, globalPrintOptions).isLaunchReady");
    expect(text).toContain("loadedTemplates.filter((template) => isBuilderSelectableTemplate(template, loadedPrintOptions))");
  });

  test("existing products retain their already-linked template for editing", () => {
    const text = source();
    expect(text).toContain("const existingTemplate = loadedTemplates.find");
    expect(text).toContain("templatesForBuilder = [...selectableTemplates, existingTemplate]");
    expect(text).toContain("setTemplates(templatesForBuilder)");
  });

  test("business behavior owners remain unchanged", () => {
    const text = source();
    expect(text).toContain("const validateStep = (key) =>");
    expect(text).toContain("const buildPayload = () =>");
    expect(text).toContain("const save = async ({ publish = false } = {}) =>");
    expect(text).toContain("const publishCreator = async (target) =>");
  });
});
