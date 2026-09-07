const fs = require("fs");
const path = require("path");

const dashboardPath = path.join(__dirname, "BandDashboard.jsx");

function source() {
  return fs.readFileSync(dashboardPath, "utf8");
}

describe("creator dashboard canonical product flow", () => {
  test("creator product routes use ProductBuilder and no legacy ProductForm remains", () => {
    const text = source();
    expect(text).toContain('<Route path="products/new" element={<ProductBuilder mode="creator" backTo="/creator/products" />} />');
    expect(text).toContain('<Route path="products/:id" element={<ProductBuilder mode="creator" backTo="/creator/products" />} />');
    expect(text).not.toContain("function ProductForm()");
    expect(text).not.toContain("useParams");
    expect(text).not.toContain("AttributeVariationEditor");
  });

  test("creator overview stats use themed cards", () => {
    const text = source();
    expect(text).toContain('className="grid grid-cols-2 lg:grid-cols-5 gap-3"');
    expect(text).toContain('className="ff-admin-stat-card min-w-0"');
  });

  test("store banner preview reflects storefront crop behavior", () => {
    const text = source();
    expect(text).toContain('previewImageClassName = "object-contain p-3"');
    expect(text).toContain('previewImageClassName="object-cover"');
  });
});
