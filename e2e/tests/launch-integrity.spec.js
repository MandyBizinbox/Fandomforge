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

async function api(page, token, method, endpoint, data, options = {}) {
  const response = await page.request.fetch(`${API}${endpoint}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    data,
    multipart: options.multipart,
    failOnStatusCode: false,
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
}

async function createCreatorProduct(page, token, title) {
  const payload = {
    title,
    description: 'Launch integrity browser product',
    specs: 'E2E only',
    category: 'Apparel',
    template_id: 'template-tee-e2e',
    selling_price: 250,
    print_cost: 0,
    variations: [],
    attribute_ids: [],
    spec_attributes: {},
    customization_enabled: false,
    published: false,
    publish_on_approval: true,
    selected_template_variation_ids: ['template-var-m-black-e2e'],
    selected_print_area_id: 'front-e2e',
    selected_print_option_id: 'print-dtf-e2e',
    artworks: [],
    artwork_groups: [],
    product_mode: 'template_printed',
    production_mode: 'printed_from_template',
  };
  const result = await api(page, token, 'POST', '/products', payload);
  expect(result.response.status(), JSON.stringify(result.body)).toBe(200);
  return result.body;
}

async function uploadSvg(page, token, productId, filename, label) {
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#111"/><text x="300" y="400" fill="#fff" font-size="72" text-anchor="middle">${label}</text></svg>`);
  const response = await page.request.post(`${API}/artworks/upload`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart: {
      product_id: productId,
      placement: 'front',
      notes: `E2E ${label}`,
      dimensions: '600x800',
      dpi: '300',
      file: { name: filename, mimeType: 'image/svg+xml', buffer: svg },
    },
    failOnStatusCode: false,
  });
  const body = await response.json();
  expect(response.status(), JSON.stringify(body)).toBe(200);
  expect(body.content_sha256).toMatch(/^[a-f0-9]{64}$/);
  return body;
}

async function checkoutProduct(page, product, quantity = 1) {
  const variation = product.variations?.[0];
  expect(variation?.id).toBeTruthy();
  const response = await page.request.post(`${API}/orders/checkout`, {
    data: {
      items: [{
        id: `cart-${Date.now()}`,
        product_id: product.id,
        product_title: product.title,
        band_id: product.band_id,
        variation_id: variation.id,
        size: variation.size || 'M',
        color: variation.color || 'Black',
        mockup_url: product.primary_mockup_image_url || product.mockup_image_url || null,
        unit_price: product.selling_price,
        quantity,
        customization: null,
      }],
      shipping_address: {
        full_name: 'E2E Buyer',
        email: 'buyer@e2e.fandomforge.test',
        phone: '0820000000',
        line1: '1 Test Road',
        line2: '',
        city: 'Cape Town',
        state: 'Western Cape',
        postal_code: '8000',
        country: 'ZA',
      },
      payment_provider: 'mock',
      shipping_method_key: 'e2e_flat',
    },
    failOnStatusCode: false,
  });
  const body = await response.json();
  expect(response.status(), JSON.stringify(body)).toBe(200);
  expect(body.order_id).toBeTruthy();
  return body.order_id;
}

async function ownerEvidence(page, ownerToken, orderId) {
  const result = await api(page, ownerToken, 'GET', `/e2e/orders/${orderId}/evidence`);
  expect(result.response.status(), JSON.stringify(result.body)).toBe(200);
  return result.body;
}

function saveEvidence(testInfo, name, value) {
  const target = testInfo.outputPath(`${name}.json`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(value, null, 2));
  testInfo.attach(name, { path: target, contentType: 'application/json' });
}

test.describe.serial('FandomForge launch integrity', () => {
  let ownerToken;
  let creatorToken;
  let printer1Token;
  let printer2Token;
  let creatorProduct;
  let creatorOrderId;
  let ownerProduct;
  let ownerOrderId;
  let firstJob;

  test('Owner routing and manager API denial', async ({ page }, testInfo) => {
    ownerToken = await login(page, 'owner@e2e.fandomforge.test', '/admin');
    await expect(page.getByText(/Platform Owner|Admin/i).first()).toBeVisible();
    const review = await api(page, ownerToken, 'GET', '/admin/review/creators/creator-e2e');
    expect(review.response.status(), JSON.stringify(review.body)).toBe(200);
    expect(review.body.review_mode).toBe(true);
    expect(review.body.payout_profile?.account_number || '').not.toContain('123456789');

    const managerToken = await login(page, 'manager@e2e.fandomforge.test', '/manager');
    const denied = await api(page, managerToken, 'GET', '/admin/finance/reconciliation');
    expect(denied.response.status()).toBe(403);
    saveEvidence(testInfo, 'owner-and-manager-access', { review: review.body.summary, managerDenial: denied.body });
  });

  test('Creator-created product keeps artwork, text and immutable order ownership', async ({ page }, testInfo) => {
    creatorToken = await login(page, 'creator@e2e.fandomforge.test', '/creator');
    creatorProduct = await createCreatorProduct(page, creatorToken, 'Creator Integrity Tee');
    expect(creatorProduct.band_id).toBe('creator-e2e');
    expect(creatorProduct.created_by_role).toBe('creator');

    await uploadSvg(page, creatorToken, creatorProduct.id, 'creator-art.svg', 'ART');
    const textAsset = await uploadSvg(page, creatorToken, creatorProduct.id, 'creator-text.svg', 'FORGE');
    let refreshed = (await api(page, creatorToken, 'GET', `/products/${creatorProduct.id}`)).body;
    const artworks = refreshed.artworks || [];
    const groups = refreshed.artwork_groups || [];
    const decorate = (slot) => slot.original_url === textAsset.immutable_asset_url
      ? { ...slot, text_layer: true, text_content: 'FORGE', text_font_family: 'Arial', text_font_identifier: 'Arial', text_font_source: 'platform_approved', text_font_licence: 'approved_internal_reference', text_font_size: 72, text_color: '#ffffff', text_alignment: 'center', sort_order: 2 }
      : slot;
    const updatedGroups = groups.map((group) => ({ ...group, artworks: (group.artworks || []).map(decorate) }));
    const patched = await api(page, creatorToken, 'PATCH', `/products/${creatorProduct.id}`, { artworks: artworks.map(decorate), artwork_groups: updatedGroups, published: false });
    expect(patched.response.status(), JSON.stringify(patched.body)).toBe(200);
    expect(patched.body.canonical_design_spec.text_layers[0].text).toBe('FORGE');

    ownerToken = await login(page, 'owner@e2e.fandomforge.test', '/admin');
    const approved = await api(page, ownerToken, 'PATCH', `/admin/artwork-review/${creatorProduct.id}/approve-all?notes=E2E%20approved`);
    expect(approved.response.status(), JSON.stringify(approved.body)).toBe(200);

    creatorToken = await login(page, 'creator@e2e.fandomforge.test', '/creator');
    const published = await api(page, creatorToken, 'PATCH', `/products/${creatorProduct.id}`, { published: true });
    expect(published.response.status(), JSON.stringify(published.body)).toBe(200);
    creatorProduct = published.body;
    expect(creatorProduct.published).toBe(true);
    await page.goto('/creators/creator-integrity-store');
    await expect(page.getByText('Creator Integrity Tee', { exact: false }).first()).toBeVisible();

    creatorOrderId = await checkoutProduct(page, creatorProduct, 2);
    ownerToken = await login(page, 'owner@e2e.fandomforge.test', '/admin');
    const paid = await api(page, ownerToken, 'POST', `/e2e/orders/${creatorOrderId}/confirm-mock-payment`, {});
    expect(paid.response.status(), JSON.stringify(paid.body)).toBe(200);
    const beforeEdit = await ownerEvidence(page, ownerToken, creatorOrderId);
    const orderItem = beforeEdit.order.items[0];
    expect(orderItem.production_snapshot.creator_id).toBe('creator-e2e');
    expect(orderItem.production_snapshot.product_version).toBeTruthy();
    expect(orderItem.production_snapshot.artwork_asset_versions.length).toBeGreaterThanOrEqual(2);
    expect(orderItem.production_snapshot.text_layers[0].text).toBe('FORGE');
    expect(orderItem.financial_snapshot.creator_earnings).toBeGreaterThan(0);
    expect(orderItem.financial_snapshot.printer_liability).toBeGreaterThan(0);
    expect(beforeEdit.production_jobs.length).toBe(1);
    expect(beforeEdit.wallet_transactions.some((row) => row.event_type === 'creator_earning')).toBe(true);
    expect(beforeEdit.wallet_transactions.some((row) => row.event_type === 'printer_liability')).toBe(true);

    creatorToken = await login(page, 'creator@e2e.fandomforge.test', '/creator');
    const edit = await api(page, creatorToken, 'PATCH', `/products/${creatorProduct.id}`, { title: 'Creator Integrity Tee Updated', selling_price: 320 });
    expect(edit.response.status(), JSON.stringify(edit.body)).toBe(200);
    ownerToken = await login(page, 'owner@e2e.fandomforge.test', '/admin');
    const afterEdit = await ownerEvidence(page, ownerToken, creatorOrderId);
    expect(afterEdit.order.items[0].product_title).toBe(orderItem.product_title);
    expect(afterEdit.order.items[0].financial_snapshot.allocation_sha256).toBe(orderItem.financial_snapshot.allocation_sha256);
    firstJob = afterEdit.production_jobs[0];
    saveEvidence(testInfo, 'creator-product-order-integrity', afterEdit);
  });

  test('Owner-created Creator product attributes earnings and survives product edits', async ({ page }, testInfo) => {
    ownerToken = await login(page, 'owner@e2e.fandomforge.test', '/admin');
    const quick = await api(page, ownerToken, 'POST', '/admin/quick-products', {
      creator_id: 'creator-e2e',
      name: 'Owner Built Creator Tee',
      price: 275,
      description: 'Created by Platform Owner for Creator',
      image_url: '/api/uploads/e2e/owner-product-placeholder.svg',
      sizes: 'M,L',
      colour: 'Black',
      category: 'Apparel',
      published: true,
      platform_cost: 80,
      creator_cost: 130,
      stock_status: 'made_to_order',
      stock_quantity: 999,
    });
    expect(quick.response.status(), JSON.stringify(quick.body)).toBe(200);
    ownerProduct = quick.body;
    expect(ownerProduct.band_id).toBe('creator-e2e');
    expect(ownerProduct.created_by_role).toBe('owner');
    await uploadSvg(page, ownerToken, ownerProduct.id, 'owner-art.svg', 'OWNER');
    ownerProduct = (await api(page, ownerToken, 'GET', `/admin/products/${ownerProduct.id}`)).body;
    await page.goto('/creators/creator-integrity-store');
    await expect(page.getByText('Owner Built Creator Tee', { exact: false }).first()).toBeVisible();

    ownerOrderId = await checkoutProduct(page, ownerProduct, 1);
    const paid = await api(page, ownerToken, 'POST', `/e2e/orders/${ownerOrderId}/confirm-mock-payment`, {});
    expect(paid.response.status(), JSON.stringify(paid.body)).toBe(200);
    const evidence = await ownerEvidence(page, ownerToken, ownerOrderId);
    expect(evidence.order.items[0].band_id).toBe('creator-e2e');
    expect(evidence.wallet_transactions.some((row) => row.owner_type === 'creator' && row.owner_id === 'creator-e2e')).toBe(true);
    expect(evidence.audit_events.length).toBeGreaterThan(0);
    saveEvidence(testInfo, 'owner-created-product', evidence);
  });

  test('Creator and Printer plan limits upgrade and downgrade safely', async ({ page }, testInfo) => {
    let upgradeToken = await login(page, 'upgrade@e2e.fandomforge.test', '/creator');
    await page.goto('/account/plans');
    await expect(page.getByText('Creator Free E2E', { exact: false }).first()).toBeVisible();
    const first = await createCreatorProduct(page, upgradeToken, 'Upgrade Store Product One');
    expect(first.band_id).toBe('creator-upgrade-e2e');
    const blocked = await api(page, upgradeToken, 'POST', '/products', {
      title: 'Upgrade Store Product Two', description: '', specs: '', category: 'Apparel', template_id: 'template-tee-e2e', selling_price: 250, print_cost: 0, variations: [], published: false,
    });
    expect(blocked.response.status()).toBe(403);
    expect(blocked.body.detail.code).toBe('entitlement_denied');

    ownerToken = await login(page, 'owner@e2e.fandomforge.test', '/admin');
    const upgraded = await api(page, ownerToken, 'POST', '/admin/subscriptions/manual-activate', { owner_type: 'creator', owner_id: 'creator-upgrade-e2e', plan_id: 'creator-paid-e2e', status: 'active', reason: 'E2E controlled upgrade' });
    expect(upgraded.response.status(), JSON.stringify(upgraded.body)).toBe(200);
    upgradeToken = await login(page, 'upgrade@e2e.fandomforge.test', '/creator');
    const second = await createCreatorProduct(page, upgradeToken, 'Upgrade Store Product Two');
    expect(second.id).toBeTruthy();

    ownerToken = await login(page, 'owner@e2e.fandomforge.test', '/admin');
    const downgraded = await api(page, ownerToken, 'POST', '/admin/subscriptions/manual-activate', { owner_type: 'creator', owner_id: 'creator-upgrade-e2e', plan_id: 'creator-free-e2e', status: 'free', reason: 'E2E downgrade' });
    expect(downgraded.response.status(), JSON.stringify(downgraded.body)).toBe(200);
    upgradeToken = await login(page, 'upgrade@e2e.fandomforge.test', '/creator');
    const blockedAfterDowngrade = await api(page, upgradeToken, 'POST', '/products', { title: 'Blocked Product Three', description: '', specs: '', category: 'Apparel', template_id: 'template-tee-e2e', selling_price: 250, print_cost: 0, variations: [], published: false });
    expect(blockedAfterDowngrade.response.status()).toBe(403);
    const retained = await api(page, upgradeToken, 'GET', `/products/${second.id}`);
    expect(retained.response.status()).toBe(200);

    const printerUpgrade = await api(page, ownerToken, 'POST', '/admin/subscriptions/manual-activate', { owner_type: 'printer', owner_id: 'printer-1-e2e', plan_id: 'printer-paid-e2e', status: 'active', reason: 'E2E Printer upgrade' });
    expect(printerUpgrade.response.status(), JSON.stringify(printerUpgrade.body)).toBe(200);
    saveEvidence(testInfo, 'subscription-upgrades', { creatorBlocked: blocked.body, creatorBlockedAfterDowngrade: blockedAfterDowngrade.body, retainedProductId: second.id, printerPlan: printerUpgrade.body });
  });

  test('Costing, partial refund, chargeback and Printer exception remain linked', async ({ page }, testInfo) => {
    ownerToken = await login(page, 'owner@e2e.fandomforge.test', '/admin');
    const partial = await api(page, ownerToken, 'POST', `/admin/orders/${creatorOrderId}/refunds`, {
      idempotency_key: 'e2e-partial-refund-creator-order',
      lines: [{ order_item_id: firstJob.order_item_id, quantity: 1 }],
      reason: 'E2E partial item refund',
      provider: 'mock',
    });
    expect(partial.response.status(), JSON.stringify(partial.body)).toBe(200);
    const replay = await api(page, ownerToken, 'POST', `/admin/orders/${creatorOrderId}/refunds`, {
      idempotency_key: 'e2e-partial-refund-creator-order',
      lines: [{ order_item_id: firstJob.order_item_id, quantity: 1 }],
      reason: 'E2E replay', provider: 'mock',
    });
    expect(replay.body.already_exists).toBe(true);
    const chargeback = await api(page, ownerToken, 'POST', `/admin/orders/${creatorOrderId}/chargebacks`, {
      idempotency_key: 'e2e-chargeback-creator-order-rest',
      lines: [{ order_item_id: firstJob.order_item_id, quantity: 1 }],
      reason: 'E2E provider dispute remainder', provider: 'mock',
    });
    expect(chargeback.response.status(), JSON.stringify(chargeback.body)).toBe(200);

    printer1Token = await login(page, 'printer1@e2e.fandomforge.test', '/printer');
    const rejected = await api(page, printer1Token, 'POST', `/production-jobs/${firstJob.id}/reject`, { reason: 'E2E equipment unavailable' });
    expect(rejected.response.status(), JSON.stringify(rejected.body)).toBe(200);
    ownerToken = await login(page, 'owner@e2e.fandomforge.test', '/admin');
    const reassigned = await api(page, ownerToken, 'POST', `/production-jobs/${firstJob.id}/reassign`, { printer_id: 'printer-2-e2e', reason: 'E2E reassignment after rejection' });
    expect(reassigned.response.status(), JSON.stringify(reassigned.body)).toBe(200);
    printer2Token = await login(page, 'printer2@e2e.fandomforge.test', '/printer');
    expect((await api(page, printer2Token, 'POST', `/production-jobs/${firstJob.id}/accept`, {})).response.status()).toBe(200);
    expect((await api(page, printer2Token, 'POST', `/production-jobs/${firstJob.id}/status`, { status: 'in_production', notes: 'E2E production started' })).response.status()).toBe(200);
    expect((await api(page, printer2Token, 'POST', `/production-jobs/${firstJob.id}/qc`, { result: 'failed', checklist: { print: false, garment: true }, notes: 'E2E print damage', damage_or_failure: true })).response.status()).toBe(200);
    expect((await api(page, printer2Token, 'POST', `/production-jobs/${firstJob.id}/reprint-request`, { reason: 'E2E QC failure', quantity: 1 })).response.status()).toBe(200);
    ownerToken = await login(page, 'owner@e2e.fandomforge.test', '/admin');
    const reprint = await api(page, ownerToken, 'POST', `/production-jobs/${firstJob.id}/reprint-approval`, { approved: true, reason: 'E2E approved reprint', printer_id: 'printer-2-e2e' });
    expect(reprint.response.status(), JSON.stringify(reprint.body)).toBe(200);
    expect(reprint.body.reprint_job.reprint_of_job_id).toBe(firstJob.id);
    printer2Token = await login(page, 'printer2@e2e.fandomforge.test', '/printer');
    const dispatch = await api(page, printer2Token, 'POST', `/production-jobs/${reprint.body.reprint_job.id}/dispatch`, { courier_name: 'E2E Courier', tracking_number: 'E2E-TRACK-001', tracking_url: 'https://example.test/track/E2E-TRACK-001', waybill_number: 'E2E-WAYBILL-001', notes: 'E2E dispatched' });
    expect(dispatch.response.status(), JSON.stringify(dispatch.body)).toBe(200);

    ownerToken = await login(page, 'owner@e2e.fandomforge.test', '/admin');
    const evidence = await ownerEvidence(page, ownerToken, creatorOrderId);
    expect(evidence.order.payment_status).toBe('refunded');
    expect(evidence.financial_adjustments.length).toBe(2);
    expect(evidence.production_jobs.some((job) => job.reprint_of_job_id === firstJob.id)).toBe(true);
    expect(evidence.audit_events.some((event) => event.action === 'reprint.approve')).toBe(true);
    expect(evidence.reconciliation.duplicate_idempotency_keys).toHaveLength(0);
    saveEvidence(testInfo, 'finance-printer-exception', evidence);
  });

  test('Database evidence summary contains no real-provider operations', async ({ page }, testInfo) => {
    ownerToken = await login(page, 'owner@e2e.fandomforge.test', '/admin');
    const summary = await api(page, ownerToken, 'GET', '/e2e/database-summary');
    expect(summary.response.status(), JSON.stringify(summary.body)).toBe(200);
    expect(summary.body.orders).toBeGreaterThanOrEqual(2);
    expect(summary.body.audit_events).toBeGreaterThan(0);
    saveEvidence(testInfo, 'database-summary', summary.body);
  });
});
