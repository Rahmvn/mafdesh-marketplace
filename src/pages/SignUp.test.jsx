import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SignUp from './SignUp';

const {
  mockSignUp,
  mockProfilesMaybeSingle,
  mockProfilesUpsert,
  mockUsersMaybeSingle,
  mockUsersInsert,
  mockUsersUpdateEq,
  mockShowError,
  mockShowWarning,
  mockReconcileUserRole,
  mockFrom,
} = vi.hoisted(() => {
  const mockSignUp = vi.fn();
  const mockProfilesMaybeSingle = vi.fn();
  const mockProfilesUpsert = vi.fn();
  const mockUsersMaybeSingle = vi.fn();
  const mockUsersInsert = vi.fn();
  const mockUsersUpdateEq = vi.fn();
  const mockShowError = vi.fn();
  const mockShowWarning = vi.fn();
  const mockReconcileUserRole = vi.fn();
  const mockFrom = vi.fn((table) => {
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: mockProfilesMaybeSingle,
          }),
        }),
        upsert: mockProfilesUpsert,
      };
    }

    if (table === 'users') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: mockUsersMaybeSingle,
          }),
        }),
        insert: mockUsersInsert,
        update: () => ({
          eq: mockUsersUpdateEq,
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    mockSignUp,
    mockProfilesMaybeSingle,
    mockProfilesUpsert,
    mockUsersMaybeSingle,
    mockUsersInsert,
    mockUsersUpdateEq,
    mockShowError,
    mockShowWarning,
    mockReconcileUserRole,
    mockFrom,
  };
});

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      signUp: mockSignUp,
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

vi.mock('../services/accountBootstrapService', () => ({
  reconcileUserRole: mockReconcileUserRole,
}));

vi.mock('../components/FooterSlim', () => ({
  default: () => <div data-testid="footer" />,
}));

function LoginStatePage() {
  const location = useLocation();
  return <div>{location.state?.message || 'Login Page'}</div>;
}

function renderSignUpRoute() {
  return render(
    <MemoryRouter initialEntries={['/signup']}>
      <Routes>
        <Route path="/signup" element={<SignUp />} />
        <Route path="/login" element={<LoginStatePage />} />
      </Routes>
    </MemoryRouter>
  );
}

function fillAndSubmitSignUpForm(container) {
  fireEvent.change(screen.getByPlaceholderText('John Doe'), {
    target: { value: 'Jane Doe' },
  });
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
    target: { value: 'jane@example.com' },
  });
  fireEvent.change(screen.getByPlaceholderText('johndoe123'), {
    target: { value: 'janedoe123' },
  });
  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: 'Lagos' },
  });
  fireEvent.change(screen.getByPlaceholderText('08012345678'), {
    target: { value: '08012345678' },
  });

  const passwordInputs = container.querySelectorAll('input[type="password"]');
  fireEvent.change(passwordInputs[0], {
    target: { value: 'password123' },
  });
  fireEvent.change(passwordInputs[1], {
    target: { value: 'password123' },
  });

  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /create account/i }));
}

describe('SignUp', () => {
  beforeEach(() => {
    mockProfilesMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    mockProfilesUpsert.mockResolvedValue({
      error: null,
    });
    mockUsersMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    mockUsersInsert.mockResolvedValue({
      error: null,
    });
    mockUsersUpdateEq.mockResolvedValue({
      error: null,
    });
    mockReconcileUserRole.mockResolvedValue(null);
    mockSignUp.mockResolvedValue({
      data: {
        user: { id: 'user-1' },
      },
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('retries transient auth lock conflicts during sign up and still navigates to login', async () => {
    mockSignUp
      .mockRejectedValueOnce(new Error('Navigator LockManager lock "lock:sb" could not be acquired'))
      .mockResolvedValueOnce({
        data: {
          user: { id: 'user-1' },
        },
        error: null,
      });

    const { container } = renderSignUpRoute();
    fillAndSubmitSignUpForm(container);

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledTimes(2);
    });

    expect(
      await screen.findByText('Account created successfully! Please check your email to verify before logging in.')
    ).toBeInTheDocument();
    expect(mockShowError).not.toHaveBeenCalled();
  });
});
