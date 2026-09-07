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

  test('overview stat cells use themed card surfaces', () => {
    const source = read('./dashboard/AdminOverview.jsx');
    expect(source).toContain('bg-[var(--ff-card-bg)]');
    expect(source).toContain('rounded-xl');
  });
});
