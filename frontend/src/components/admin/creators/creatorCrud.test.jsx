import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { BandsAdmin } from './AdminCreatorsWorkspace';
import { http } from '../../../lib/api';

jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn(), NavLink: () => null, Navigate: () => null, Route: () => null, Routes: () => null, useParams: () => ({}) }));
jest.mock('../../../lib/api', () => ({ http: { get: jest.fn(), post: jest.fn() }, assetUrl: v => v, apiErrorDetailText: (v, f) => typeof v === 'string' ? v : f }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../UserAccessAdmin', () => () => null);
jest.mock('../ArtworkReviewAdmin', () => () => null);
jest.mock('../SubscriptionManagerAdmin', () => () => null);
jest.mock('../PaystackPayoutsAdmin', () => () => null);
let container, root, rows;
beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  rows = [];
  http.get.mockImplementation(async p => ({ data: p === '/admin/creators' ? rows : [] }));
  http.post.mockImplementation(async () => { rows = [{ id: 'new-id', name: 'Saved Creator' }]; return { data: rows[0] }; });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await act(async () => root.render(<BandsAdmin view="new" />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.clearAllMocks(); });
const setName = async value => {
  const input = container.querySelector('input[required]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
test('saving refreshes the creator rows before returning to the reused list view', async () => {
  await setName('Saved Creator');
  await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await act(async () => root.render(<BandsAdmin view="list" />));
  expect(container.textContent).toContain('Saved Creator');
  expect(container.querySelector('form')).toBeNull();
});
test('opening a new creator after editing starts with an empty name', async () => {
  rows = [{ id: 'existing', name: 'Old Creator' }];
  await act(async () => root.render(<BandsAdmin view="list" />));
  await act(async () => root.render(<BandsAdmin view="new" />));
  await setName('Old Creator');
  await act(async () => root.render(<BandsAdmin view="list" />));
  await act(async () => root.render(<BandsAdmin view="new" />));
  expect(container.querySelector('input[required]').value).toBe('');
});
