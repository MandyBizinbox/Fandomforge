const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const API = process.env.E2E_API_URL || 'http://127.0.0.1:8000/api';
const PASSWORD = 'LaunchTest123!';

async function login(page, email, expectedPath) {
  await page.goto('/login');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(new RegExp(expectedPath.replace('/', '\\/')));
  const token = await page.evaluate(() => localStorage.getItem('fandomforge_token'));
  expect(token).toBeTruthy();
  return token;
}

async function api(page, token, method, endpoint, data) {
  const response = await page.request.fetch(`${API}${endpoint}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    data,
    failOnStatusCode: false,
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
}

function attach(testInfo, name, value) {
  const target = testInfo.outputPath(`${name}.json`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(value, null, 2));
  testInfo.attach(name, { path: target, contentType: 'application/json' });
}

test('Printer free limit, upgrade unlock and downgrade retention', async ({ page }, testInfo) => {
  const ownerToken = await login(page, 'owner@e2e.fandomforge.test', '/admin');

  const blocked = await api(page, ownerToken, 'POST', '/production-jobs/assign', {
    order_id: 'printer-limit-pending-1',
    order_item_id: 'printer-limit-pending-1-item',
    printer_id: 'printer-3-e2e',
    reason: 'E2E direct assignment at free limit',
  });
  expect(blocked.response.status()).toBe(403);
  expect(blocked.body.detail.code).toBe('entitlement_denied');
  expect(blocked.body.detail.feature_key).toBe('printer_job_limit');

  const upgraded = await api(page, ownerToken, 'POST', '/admin/subscriptions/manual-activate', {
    owner_type: 'printer',
    owner_id: 'printer-3-e2e',
    plan_id: 'printer-paid-e2e',
    status: 'active',
    reason: 'E2E controlled Printer upgrade',
  });
  expect(upgraded.response.status(), JSON.stringify(upgraded.body)).toBe(200);

  const assigned = await api(page, ownerToken, 'POST', '/production-jobs/assign', {
    order_id: 'printer-limit-pending-1',
    order_item_id: 'printer-limit-pending-1-item',
    printer_id: 'printer-3-e2e',
    reason: 'E2E assignment after upgrade',
  });
  expect(assigned.response.status(), JSON.stringify(assigned.body)).toBe(200);
  expect(assigned.body.printer_id).toBe('printer-3-e2e');

  const downgraded = await api(page, ownerToken, 'POST', '/admin/subscriptions/manual-activate', {
    owner_type: 'printer',
    owner_id: 'printer-3-e2e',
    plan_id: 'printer-free-e2e',
    status: 'free',
    reason: 'E2E controlled Printer downgrade',
  });
  expect(downgraded.response.status(), JSON.stringify(downgraded.body)).toBe(200);

  const retained = await api(page, ownerToken, 'GET', `/production-jobs/${assigned.body.id}`);
  expect(retained.response.status()).toBe(200);
  expect(retained.body.id).toBe(assigned.body.id);

  const blockedAgain = await api(page, ownerToken, 'POST', '/production-jobs/assign', {
    order_id: 'printer-limit-pending-2',
    order_item_id: 'printer-limit-pending-2-item',
    printer_id: 'printer-3-e2e',
    reason: 'E2E assignment after downgrade',
  });
  expect(blockedAgain.response.status()).toBe(403);
  expect(blockedAgain.body.detail.feature_key).toBe('printer_job_limit');

  attach(testInfo, 'printer-upgrade-downgrade', {
    initialDenial: blocked.body,
    upgradedSubscription: upgraded.body,
    assignedJob: assigned.body,
    downgradedSubscription: downgraded.body,
    retainedJob: retained.body,
    postDowngradeDenial: blockedAgain.body,
  });
});
