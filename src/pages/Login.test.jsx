import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Login from './Login';

const {
  mockGetSession,
  mockSignInWithPassword,
  mockSignOut,
  mockUsersMaybeSingle,
  mockUsersUpsert,
  mockProfilesUpsert,
  mockFunctionsInvoke,
  mockMergeGuestCart,
  mockShowError,
  mockShowWarning,
  mockFrom,
} = vi.hoisted(() => {
  const mockGetSession = vi.fn();
  const mockSignInWithPassword = vi.fn();
  const mockSignOut = vi.fn();
  const mockUsersMaybeSingle = vi.fn();
  const mockUsersUpsert = vi.fn();
  const mockProfilesUpsert = vi.fn();
  const mockFunctionsInvoke = vi.fn();
  const mockMergeGuestCart = vi.fn();
  const mockShowError = vi.fn();
  const mockShowWarning = vi.fn();
  const mockFrom = vi.fn((table) => {
    if (table === 'users') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: mockUsersMaybeSingle,
          }),
        }),
        upsert: mockUsersUpsert,
      };
    }

    if (table === 'profiles') {
      return {
        upsert: mockProfilesUpsert,
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    mockGetSession,
    mockSignInWithPassword,
    mockSignOut,
    mockUsersMaybeSingle,
    mockUsersUpsert,
    mockProfilesUpsert,
    mockFunctionsInvoke,
    mockMergeGuestCart,
    mockShowError,
    mockShowWarning,
    mockFrom,
  };
});

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
    },
    functions: {
      invoke: mockFunctionsInvoke,
    },
    from: mockFrom,
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

vi.mock('../components/FooterSlim', () => ({
  default: () => <div data-testid="footer" />,
}));

function renderLoginRoute() {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/marketplace" element={<div>Marketplace</div>} />
        <Route path="/seller/dashboard" element={<div>Seller Dashboard</div>} />
        <Route path="/admin/dashboard" element={<div>Admin Dashboard</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function fillAndSubmitLoginForm() {
  fireEvent.change(screen.getByLabelText(/email address/i), {
    target: { value: 'buyer@example.com' },
  });
  fireEvent.change(screen.getByLabelText(/password/i), {
    target: { value: 'password123' },
  });
  fireEvent.click(screen.getByRole('button', { name: /login to mafdesh/i }));
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
    mockUsersMaybeSingle.mockResolvedValue({
      data: {
        id: 'buyer-1',
        role: 'buyer',
      },
      error: null,
    });
    mockUsersUpsert.mockResolvedValue({
      error: null,
    });
    mockProfilesUpsert.mockResolvedValue({
      error: null,
    });
    mockFunctionsInvoke.mockResolvedValue({
      data: {
        success: true,
        user: {
          id: 'buyer-1',
          role: 'buyer',
        },
      },
      error: null,
    });
    mockSignInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'buyer-1' },
        session: { user: { id: 'buyer-1' } },
      },
      error: null,
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
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });
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

  it('auto-routes even when the user picked the wrong login type first', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });
    mockUsersMaybeSingle.mockResolvedValue({
      data: {
        id: 'seller-1',
        role: 'seller',
      },
      error: null,
    });
    mockSignInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'seller-1', email: 'seller@example.com', user_metadata: { role: 'seller' } },
        session: { user: { id: 'seller-1', email: 'seller@example.com', user_metadata: { role: 'seller' } } },
      },
      error: null,
    });

    renderLoginRoute();
    fillAndSubmitLoginForm();

    expect(await screen.findByText('Seller Dashboard')).toBeInTheDocument();
    expect(mockShowError).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('rebuilds the public user record from auth metadata when it is missing', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });
    mockUsersMaybeSingle
      .mockResolvedValueOnce({
        data: null,
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: 'buyer-1',
          role: 'buyer',
        },
        error: null,
      });
    mockSignInWithPassword.mockResolvedValue({
      data: {
        user: {
          id: 'buyer-1',
          email: 'buyer@example.com',
          user_metadata: {
            role: 'buyer',
            full_name: 'Buyer Demo',
            username: 'buyerdemo',
            location: 'Lagos',
            phone_number: '08012345678',
          },
        },
        session: {
          user: {
            id: 'buyer-1',
            email: 'buyer@example.com',
            user_metadata: {
              role: 'buyer',
              full_name: 'Buyer Demo',
              username: 'buyerdemo',
              location: 'Lagos',
              phone_number: '08012345678',
            },
          },
        },
      },
      error: null,
    });

    renderLoginRoute();
    fillAndSubmitLoginForm();

    expect(await screen.findByText('Marketplace')).toBeInTheDocument();
    expect(mockProfilesUpsert).toHaveBeenCalled();
    expect(mockUsersUpsert).toHaveBeenCalled();
    expect(mockShowError).not.toHaveBeenCalled();
  });

  it('reconciles a mismatched buyer placeholder into a seller account during login', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });
    mockUsersMaybeSingle.mockResolvedValue({
      data: {
        id: 'seller-1',
        role: 'buyer',
        phone_number: null,
        business_name: null,
      },
      error: null,
    });
    mockFunctionsInvoke.mockResolvedValue({
      data: {
        success: true,
        user: {
          id: 'seller-1',
          role: 'seller',
        },
      },
      error: null,
    });
    mockSignInWithPassword.mockResolvedValue({
      data: {
        user: {
          id: 'seller-1',
          email: 'seller@example.com',
          user_metadata: {
            role: 'seller',
            business_name: 'Demo Store',
          },
        },
        session: {
          user: {
            id: 'seller-1',
            email: 'seller@example.com',
            user_metadata: {
              role: 'seller',
              business_name: 'Demo Store',
            },
          },
        },
      },
      error: null,
    });

    renderLoginRoute();
    fillAndSubmitLoginForm();

    expect(await screen.findByText('Seller Dashboard')).toBeInTheDocument();
    expect(mockFunctionsInvoke).toHaveBeenCalled();
    expect(mockShowError).not.toHaveBeenCalled();
  });
});
