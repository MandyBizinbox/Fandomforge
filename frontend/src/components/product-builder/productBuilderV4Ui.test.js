const fs = require('fs');
const path = require('path');

const builderPath = path.join(__dirname, 'ProductBuilderV4.jsx');
const cssPath = path.join(__dirname, 'productBuilderV4.css');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

describe('Product Builder V4 UI contract', () => {
  test('builder owns a dedicated semantic theme stylesheet', () => {
    const source = read(builderPath);
    expect(source).toContain('import "./productBuilderV4.css";');
    expect(source).toContain('pb4-step-tab');
    expect(source).toContain('pb4-step-summary');
    expect(source).toContain('pb4-footer');
  });

  test('builder chrome no longer depends on former instance colour utilities', () => {
    const source = read(builderPath);
    expect(source).not.toContain('border-[#FF3B30] bg-[#FF3B30]/15');
    expect(source).not.toContain('bg-black/90 backdrop-blur-xl');
  });

  test('semantic builder styles consume Platform Settings tokens', () => {
    const css = read(cssPath);
    expect(css).toContain('var(--ff-primary)');
    expect(css).toContain('var(--ff-card-bg)');
    expect(css).toContain('var(--ff-card-border)');
    expect(css).toContain('var(--ff-muted-text)');
    expect(css).toContain('@media (min-width: 640px)');
    expect(css).toContain('grid-template-columns: 1fr 1fr');
  });

  test('business behavior owners remain in the builder', () => {
    const source = read(builderPath);
    expect(source).toContain('const validateStep = (key) =>');
    expect(source).toContain('const buildPayload = () =>');
    expect(source).toContain('const save = async ({ publish = false } = {}) =>');
    expect(source).toContain('const publishCreator = async (target) =>');
    expect(source).toContain('pricing.canPublishWithOverride');
  });
});
