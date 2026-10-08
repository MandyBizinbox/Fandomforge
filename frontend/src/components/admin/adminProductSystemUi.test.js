const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, relativePath), 'utf8');
}

describe('admin product system UI contract', () => {
  test('product system routes render child pages in embedded mode', () => {
    const source = read('../../routes/AdminProductSystemRoute.jsx');
    expect(source).toContain('<ProductTemplatesPage embedded />');
    expect(source).toContain('<ProductTypesPage embedded />');
    expect(source).toContain('<SellableProductsPage embedded />');
    expect(source).toContain('<CategoriesAdmin embedded />');
    expect(source).toContain('<AttributesAdmin embedded />');
  });

  test.each([
    ['../../components/template-studio/ProductTemplatesPage.jsx', 'Product Templates'],
    ['../../components/template-studio/ProductTypesPage.jsx', 'Product Types'],
    ['../../components/product-system/SellableProductsPage.jsx', 'Products'],
    ['../../pages/admin/CategoriesAdmin.jsx', 'Categories'],
    ['../../pages/admin/AttributesAdmin.jsx', 'Attributes'],
  ])('%s supports embedded section hierarchy', (relativePath, label) => {
    const source = read(relativePath);
    expect(source).toContain('embedded = false');
    expect(source).toContain('embedded ? "h2" : "h1"');
    expect(source).toContain(label);
  });

  test('template controls are split into filter and action groups', () => {
    const source = read('../../components/template-studio/ProductTemplatesPage.jsx');
    expect(source).toContain('data-testid="template-filter-controls"');
    expect(source).toContain('data-testid="template-action-controls"');
  });

  test('SuperAdmin and creator routes share the improved product studio', () => {
    const wrapper = read('../../components/product-builder/ProductBuilder.jsx');
    const studio = read('../../components/product-builder/CreatorProductStudio.jsx');

    expect(wrapper).toContain('return <CreatorProductStudio {...props} />');
    expect(wrapper).not.toContain('ProductBuilderV4');
    expect(studio).toContain('mode = "creator"');
    expect(studio).toContain('http.get(isAdmin ? "/admin/product-templates" : "/product-templates")');
    expect(studio).toContain('await http.post("/admin/products", payload)');
    expect(studio).toContain('await http.put(`/admin/products/${routeId}`, payload)');
    expect(studio).toContain('isAdmin={isAdmin}');
    expect(studio).toMatch(/isAdmin=\{isAdmin\}\s+creatorMode\s/);
    const artwork = read('../../components/product-builder/ProductArtworkStudioBase.jsx');
    expect(artwork).toContain('(!creatorMode || isAdmin)');
  });

  test('admin new-product save stays on one route instance when new becomes a real id', () => {
    const dashboard = read('../../pages/AdminDashboard.jsx');
    const route = read('../../routes/AdminDashboardRoute.jsx');

    expect(dashboard).toContain('<Route path="products/:id" element={<ProductBuilder mode="admin" backTo="/admin/products" />} />');
    expect(dashboard).not.toContain('path="products/new"');
    expect(route).not.toContain('adminDashboardKey');
    expect(route).not.toContain('<AdminDashboard key=');
    expect(route).toContain('return <AdminDashboard />');
  });

  test('structured API failures are converted to render-safe text before UI toasts consume them', () => {
    const api = read('../../lib/api.js');
    expect(api).toContain('export function apiErrorDetailText');
    expect(api).toContain('error.response.data.detail = apiErrorDetailText(detail)');
  });

  test('sellable products snapshot and storefront-render the new template detail fields', () => {
    const studio = read('../../components/product-builder/CreatorProductStudio.jsx');
    const storefront = read('../../pages/ProductDetail.jsx');

    expect(studio).toContain('material_composition: form.material_composition');
    expect(studio).toContain('care_instructions: form.care_instructions');
    expect(studio).toContain('fit_notes: form.fit_notes');
    expect(storefront).toContain('data-testid="product-template-details"');
    expect(storefront).toContain('Material & composition');
    expect(storefront).toContain('Care instructions');
    expect(storefront).toContain('Fit & sizing');
  });

  test('template production studio uses editor-first chrome, composed views and a cm size matrix', () => {
    const route = read('../../routes/AdminTemplateStudioRoute.jsx');
    const layout = read('../../components/DashboardLayout.jsx');
    const page = read('../../components/template-studio/ProductTemplateStudioV3Page.jsx');
    const attributeEditor = read('../../components/template-studio/AttributeProductionProfileEditor.jsx');
    const productionEditor = read('../../components/template-studio/ProductionConfigurationEditor.jsx');
    const views = read('../../components/template-studio/TemplateViewManager.jsx');
    const canvas = read('../../components/template-studio/PrintAreaCanvas.jsx');
    const matrix = read('../../components/template-studio/PrintSizeMatrix.jsx');

    expect(route).toContain('workspaceMode="studio"');
    expect(layout).toContain('workspaceMode = "default"');
    expect(layout).toContain('studio-workspace-shell');
    expect(page).toContain('v3-production-page');
    expect(page).toContain('v3-production-mode-picker');
    expect(attributeEditor).toContain('mode="composed"');
    expect(attributeEditor).toContain('headerContent={(');
    expect(attributeEditor).toContain('label: "Size matrix"');
    expect(attributeEditor).toContain('v3-command-select');
    expect(attributeEditor).toContain('v3-command-status');
    expect(productionEditor).toContain('compactWorkspace = mode === "composed"');
    expect(productionEditor).toContain('v3-production-editor-bar');
    expect(views).toContain('v3-view-card-compact');
    expect(canvas).toContain('v3-compact-canvas-bar');
    expect(matrix).toContain('Physical output dimensions');
    expect(matrix).toContain('parsed * 10');
    expect(matrix).toContain('width_mm');
    expect(matrix).toContain('height_mm');
  });

  test('overview stat cells use themed card surfaces', () => {
    const source = read('./dashboard/AdminOverview.jsx');
    expect(source).toContain('bg-[var(--ff-card-bg)]');
    expect(source).toContain('rounded-xl');
  });
});
