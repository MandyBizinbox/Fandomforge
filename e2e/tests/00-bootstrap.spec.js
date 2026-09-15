const { test, expect } = require('@playwright/test');
const { execFileSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');

test('bootstrap isolated Printer entitlement fixture', async () => {
  expect(process.env.DB_NAME || '').toMatch(/^fandomforge_e2e_/);
  const output = execFileSync('python', ['seed_printer_upgrade.py'], {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
  });
  expect(output).toContain('Seeded independent Printer upgrade fixture');
});
