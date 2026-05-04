import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Login from './Login';

const {
  mockGetSession,
  mockSignInWithPassword,
  mockMergeGuestCart,
  mockShowError,
  mockShowWarning,
  mockEnsureCurrentUserContext,
  mockLoadAuthenticatedUserContext,
  mockRouteAuthenticatedUser,
  mockStoreAuthenticatedUser,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockSignInWithPassword: vi.fn(),
  mockMergeGuestCart: vi.fn(),
  mockShowError: vi.fn(),
  mockShowWarning: vi.fn(),
  mockEnsureCurrentUserContext: vi.fn(),
  mockLoadAuthenticatedUserContext: vi.fn(),
  mockRouteAuthenticatedUser: vi.fn(),
  mockStoreAuthenticatedUser: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      signInWithPassword: mockSignInWithPassword,
    },
  },
}));

vi.mock('../hooks/useModal', () => ({
  default: () => ({
    showError: mockShowError,
    showWarning: mockShowWarning,
    ModalComponent: () => null,
  }),
}));

vi.mock('../services/cartService', () => ({
  cartService: {
    mergeGuestCart: mockMergeGuestCart,
  },
}));

vi.mock('../services/authSessionService', () => ({
  ensureCurrentUserContext: mockEnsureCurrentUserContext,
  loadAuthenticatedUserContext: mockLoadAuthenticatedUserContext,
  routeAuthenticatedUser: mockRouteAuthenticatedUser,
  storeAuthenticatedUser: mockStoreAuthenticatedUser,
}));

vi.mock('../components/FooterSlim', () => ({
  default: () => <div data-testid="footer" />,
}));

function renderLoginRoute(initialEntry = '/login') {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/marketplace" element={<div>Marketplace</div>} />
        <Route path="/seller/dashboard" element={<div>Seller Dashboard</div>} />
        <Route path="/admin/dashboard" element={<div>Admin Dashboard</div>} />
        <Route path="/support" element={<div>Support Inbox</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function fillAndSubmitLoginForm({ email = 'buyer@example.com', password = 'password123' } = {}) {
  fireEvent.change(screen.getByLabelText(/email address/i), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText(/password/i), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole('button', { name: /login to mafdesh/i }));
}

function selectLoginType(role) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(role, 'i') }));
}

function createDeferred() {
  let resolve;
  let reject;

  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

describe('Login', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mockSignInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'buyer-1', email: 'buyer@example.com' },
        session: { user: { id: 'buyer-1', email: 'buyer@example.com' } },
      },
      error: null,
    });
    mockEnsureCurrentUserContext.mockResolvedValue({
      id: 'buyer-1',
      role: 'buyer',
    });
    mockLoadAuthenticatedUserContext.mockResolvedValue({
      session: { user: { id: 'buyer-1' } },
      user: { id: 'buyer-1', role: 'buyer' },
    });
    mockStoreAuthenticatedUser.mockImplementation(() => {});
    mockRouteAuthenticatedUser.mockImplementation((navigate, profile, options = {}) => {
      if (options.returnUrl) {
        navigate(options.returnUrl, { replace: true });
        return;
      }

      if (profile.role === 'seller') {
        navigate('/seller/dashboard', { replace: true });
        return;
      }

      if (profile.role === 'admin') {
        navigate('/admin/dashboard', { replace: true });
        return;
      }

      navigate('/marketplace', { replace: true });
    });
    mockMergeGuestCart.mockResolvedValue([]);
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('waits for the startup session check before attempting a new sign-in', async () => {
    const pendingSessionCheck = createDeferred();
    mockGetSession.mockReturnValue(pendingSessionCheck.promise);

    renderLoginRoute();
    fillAndSubmitLoginForm();

    expect(mockSignInWithPassword).not.toHaveBeenCalled();

    pendingSessionCheck.resolve({
      data: { session: null },
      error: null,
    });

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'buyer@example.com',
        password: 'password123',
      });
    });

    expect(await screen.findByText('Marketplace')).toBeInTheDocument();
  });

  it('retries transient auth lock conflicts instead of failing the login immediately', async () => {
    mockSignInWithPassword
      .mockRejectedValueOnce(new Error('Navigator LockManager lock "lock:sb" could not be acquired'))
      .mockResolvedValueOnce({
        data: {
          user: { id: 'buyer-1' },
          session: { user: { id: 'buyer-1' } },
        },
        error: null,
      });

    renderLoginRoute();
    fillAndSubmitLoginForm();

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByText('Marketplace')).toBeInTheDocument();
    expect(mockShowError).not.toHaveBeenCalled();
  });

  it('retries transient auth fetch failures instead of failing the login immediately', async () => {
    mockSignInWithPassword
      .mockRejectedValueOnce(new Error('AuthRetryableFetchError: Failed to fetch'))
      .mockResolvedValueOnce({
        data: {
          user: { id: 'buyer-1' },
          session: { user: { id: 'buyer-1' } },
        },
        error: null,
      });

    renderLoginRoute();
    fillAndSubmitLoginForm();

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByText('Marketplace')).toBeInTheDocument();
    expect(mockShowError).not.toHaveBeenCalled();
  });

  it('recovers the public user context through the shared bootstrap service during login', async () => {
    mockEnsureCurrentUserContext.mockResolvedValue({
      id: 'buyer-1',
      role: 'buyer',
      account_status: 'active',
    });

    renderLoginRoute();
    fillAndSubmitLoginForm();

    expect(await screen.findByText('Marketplace')).toBeInTheDocument();
    expect(mockEnsureCurrentUserContext).toHaveBeenCalledWith({
      authUser: expect.objectContaining({ id: 'buyer-1' }),
    });
    expect(mockStoreAuthenticatedUser).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'buyer' })
    );
    expect(mockMergeGuestCart).toHaveBeenCalledWith('buyer-1');
  });

  it('auto-routes even when the user picked the wrong login type first', async () => {
    mockEnsureCurrentUserContext.mockResolvedValue({
      id: 'seller-1',
      role: 'seller',
      account_status: 'active',
    });
    mockSignInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'seller-1', email: 'seller@example.com' },
        session: { user: { id: 'seller-1', email: 'seller@example.com' } },
      },
      error: null,
    });

    renderLoginRoute();
    selectLoginType('buyer');
    fillAndSubmitLoginForm();

    expect(await screen.findByText('Seller Dashboard')).toBeInTheDocument();
    expect(mockShowError).not.toHaveBeenCalled();
    expect(mockEnsureCurrentUserContext).toHaveBeenCalledWith({
      authUser: expect.objectContaining({ id: 'seller-1' }),
    });
  });

  it('routes admin sign-ins to the admin dashboard', async () => {
    mockEnsureCurrentUserContext.mockResolvedValue({
      id: 'admin-1',
      role: 'admin',
      account_status: 'active',
    });
    mockSignInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'admin-1', email: 'admin@example.com' },
        session: { user: { id: 'admin-1', email: 'admin@example.com' } },
      },
      error: null,
    });

    renderLoginRoute();
    selectLoginType('admin');
    fillAndSubmitLoginForm({
      email: 'admin@example.com',
      password: 'password123',
    });

    expect(await screen.findByText('Admin Dashboard')).toBeInTheDocument();
    expect(mockEnsureCurrentUserContext).toHaveBeenCalledWith({
      authUser: expect.objectContaining({ id: 'admin-1' }),
    });
  });

  it('does not let the selected login tab rewrite a seller account into buyer routing', async () => {
    mockEnsureCurrentUserContext.mockResolvedValue({
      id: 'seller-1',
      role: 'seller',
      account_status: 'active',
    });
    mockSignInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'seller-1', email: 'seller@example.com' },
        session: { user: { id: 'seller-1', email: 'seller@example.com' } },
      },
      error: null,
    });

    renderLoginRoute();
    selectLoginType('buyer');
    expect(
      screen.getByText(/we always sign you into the role already saved on this account/i)
    ).toBeInTheDocument();
    fillAndSubmitLoginForm({
      email: 'seller@example.com',
      password: 'password123',
    });

    expect(await screen.findByText('Seller Dashboard')).toBeInTheDocument();
    expect(mockEnsureCurrentUserContext).toHaveBeenCalledWith({
      authUser: expect.objectContaining({ id: 'seller-1' }),
    });
  });

  it('restores an existing authenticated session through the shared auth context loader', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'seller-1' },
        },
      },
      error: null,
    });
    mockLoadAuthenticatedUserContext.mockResolvedValue({
      session: {
        user: { id: 'seller-1' },
      },
      user: {
        id: 'seller-1',
        role: 'seller',
        account_status: 'active',
      },
    });

    renderLoginRoute();

    expect(await screen.findByText('Seller Dashboard')).toBeInTheDocument();
    expect(mockLoadAuthenticatedUserContext).toHaveBeenCalledTimes(1);
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it('honors protected-route return URLs through the shared login success path', async () => {
    renderLoginRoute('/login?returnUrl=%2Fsupport');
    fillAndSubmitLoginForm();

    expect(await screen.findByText('Support Inbox')).toBeInTheDocument();
    expect(mockRouteAuthenticatedUser).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ role: 'buyer' }),
      { returnUrl: '/support' }
    );
  });
});
