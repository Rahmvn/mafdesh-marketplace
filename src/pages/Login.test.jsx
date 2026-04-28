import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Login from './Login';

const {
  mockGetSession,
  mockSignInWithPassword,
  mockSignOut,
  mockUsersSingle,
  mockMergeGuestCart,
  mockShowError,
  mockShowWarning,
  mockFrom,
} = vi.hoisted(() => {
  const mockGetSession = vi.fn();
  const mockSignInWithPassword = vi.fn();
  const mockSignOut = vi.fn();
  const mockUsersSingle = vi.fn();
  const mockMergeGuestCart = vi.fn();
  const mockShowError = vi.fn();
  const mockShowWarning = vi.fn();
  const mockFrom = vi.fn((table) => {
    if (table === 'users') {
      return {
        select: () => ({
          eq: () => ({
            single: mockUsersSingle,
          }),
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    mockGetSession,
    mockSignInWithPassword,
    mockSignOut,
    mockUsersSingle,
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
    mockUsersSingle.mockResolvedValue({
      data: {
        id: 'buyer-1',
        role: 'buyer',
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
});
