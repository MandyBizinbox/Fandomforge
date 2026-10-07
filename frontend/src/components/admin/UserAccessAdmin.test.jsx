import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import UserAccessAdmin from './UserAccessAdmin';
import { http } from '../../lib/api';
import { toast } from 'sonner';

jest.mock('../../lib/api', () => ({ http: { get: jest.fn(), post: jest.fn(), patch: jest.fn() }, apiErrorDetailText: (value, fallback) => typeof value === 'string' ? value : fallback }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('./access/UserAccessPanels', () => ({
  DEFAULT_MANAGER_PERMISSIONS: {},
  emptyUserForm: () => ({ name: '', email: '', password: '', role: 'buyer' }),
  MembershipManager: () => null,
  Pill: ({ children }) => <span>{children}</span>,
  SectionHeader: ({ children }) => <header>{children}</header>,
  UserForm: ({ onSubmit, editing }) => <div data-testid="user-form"><span>{editing ? 'editing' : 'creating'}</span><button onClick={onSubmit}>Save test user</button></div>,
  UsersTable: ({ users, onEdit }) => <div>{users.map(u => <button key={u.id} onClick={() => onEdit(u)}>Edit {u.name}</button>)}</div>,
}));

let container, root;
beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  window.scrollTo = jest.fn();
  http.get.mockImplementation(async path => ({ data: path === '/admin/users' ? [{ id: 'u1', name: 'Existing', email: 'x@example.com', role: 'buyer' }] : [] }));
  http.post.mockResolvedValue({ data: {} });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<UserAccessAdmin />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.clearAllMocks(); });
const button = label => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === label);
const click = async label => { await act(async () => button(label).click()); };

test('user list starts without the creation form', () => {
  expect(container.querySelector('[data-testid="user-form"]')).toBeNull();
  expect(button('New User')).toBeTruthy();
});
test('new form closes on cancel and after a successful save', async () => {
  await click('New User');
  expect(container.querySelector('[data-testid="user-form"]')).not.toBeNull();
  await click('Cancel');
  expect(container.querySelector('[data-testid="user-form"]')).toBeNull();
  await click('New User');
  await click('Save test user');
  expect(http.post).toHaveBeenCalledWith('/admin/users', expect.any(Object));
  expect(container.querySelector('[data-testid="user-form"]')).toBeNull();
});
test('edit opens the form and changing tabs dismisses it', async () => {
  await click('Edit Existing');
  expect(container.querySelector('[data-testid="user-form"]').textContent).toContain('editing');
  await click('Managers');
  expect(container.querySelector('[data-testid="user-form"]')).toBeNull();
});

test('a rejected save keeps the editor open and reports the error', async () => {
  http.post.mockRejectedValueOnce({ response: { data: { detail: 'Email already exists' } } });
  await click('New User');
  await click('Save test user');
  expect(container.querySelector('[data-testid="user-form"]')).not.toBeNull();
  expect(toast.error).toHaveBeenCalledWith('Email already exists');
});
