import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SignUp from './SignUp';
import Terms from './Terms';
import Policies from './policies';

const {
  mockSignUp,
  mockProfilesMaybeSingle,
  mockUniversitiesLimit,
  mockShowError,
  mockShowWarning,
  mockEnsureCurrentUserContext,
  mockGetAuthCallbackUrl,
  mockFrom,
} = vi.hoisted(() => {
  const mockSignUp = vi.fn();
  const mockProfilesMaybeSingle = vi.fn();
  const mockUniversitiesLimit = vi.fn();
  const mockShowError = vi.fn();
  const mockShowWarning = vi.fn();
  const mockEnsureCurrentUserContext = vi.fn();
  const mockGetAuthCallbackUrl = vi.fn();
  const mockFrom = vi.fn((table) => {
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: mockProfilesMaybeSingle,
          }),
        }),
      };
    }

    if (table === 'universities') {
      const activeChain = {
        eq: vi.fn(() => activeChain),
        ilike: vi.fn(() => activeChain),
        order: vi.fn(() => ({
          limit: mockUniversitiesLimit,
        })),
      };

      return {
        select: () => ({
          eq: vi.fn((column) => {
            if (column === 'is_active') {
              return activeChain;
            }

            throw new Error(`Unexpected universities eq column: ${column}`);
          }),
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    mockSignUp,
    mockProfilesMaybeSingle,
    mockUniversitiesLimit,
    mockShowError,
    mockShowWarning,
    mockEnsureCurrentUserContext,
    mockGetAuthCallbackUrl,
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

vi.mock('../services/authSessionService', () => ({
  ensureCurrentUserContext: mockEnsureCurrentUserContext,
  getAuthCallbackUrl: mockGetAuthCallbackUrl,
}));

vi.mock('../components/FooterSlim', () => ({
  default: () => <div data-testid="footer" />,
}));

vi.mock('../components/Navbar', () => ({
  default: () => <div data-testid="navbar" />,
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
        <Route path="/terms" element={<Terms />} />
        <Route path="/policies" element={<Policies />} />
      </Routes>
    </MemoryRouter>
  );
}

function fillSignUpForm(container, { agreeToTerms = true, asSeller = false } = {}) {
  if (asSeller) {
    fireEvent.click(screen.getByRole('button', { name: /seller/i }));
  }

  fireEvent.change(screen.getByPlaceholderText('John Doe'), {
    target: { value: 'Jane Doe' },
  });
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
    target: { value: 'jane@example.com' },
  });
  fireEvent.change(screen.getByPlaceholderText('johndoe123'), {
    target: { value: 'janedoe123' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: /location \(state in nigeria\)/i }), {
    target: { value: 'Lagos' },
  });
  fireEvent.change(screen.getByPlaceholderText('08012345678'), {
    target: { value: '08012345678' },
  });

  if (asSeller) {
    fireEvent.change(screen.getByPlaceholderText('Your store name'), {
      target: { value: 'Jane Store' },
    });
    fireEvent.change(screen.getByPlaceholderText('Search your university'), {
      target: { value: 'Mafdesh University' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: /university state/i }), {
      target: { value: 'Kaduna' },
    });
  }

  const passwordInputs = container.querySelectorAll('input[type="password"]');
  fireEvent.change(passwordInputs[0], {
    target: { value: 'password123' },
  });
  fireEvent.change(passwordInputs[1], {
    target: { value: 'password123' },
  });

  if (agreeToTerms) {
    fireEvent.click(screen.getByRole('checkbox'));
  }
}

function fillAndSubmitSignUpForm(container, options) {
  fillSignUpForm(container, options);
  fireEvent.click(screen.getByRole('button', { name: /create account/i }));
}

describe('SignUp', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    mockProfilesMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    mockUniversitiesLimit.mockResolvedValue({
      data: [],
      error: null,
    });
    mockEnsureCurrentUserContext.mockResolvedValue({
      id: 'user-1',
      role: 'buyer',
    });
    mockGetAuthCallbackUrl.mockReturnValue('http://localhost:5173/auth/callback?flow=signup');
    mockSignUp.mockResolvedValue({
      data: {
        user: { id: 'user-1' },
      },
      error: null,
    });
  });

  afterEach(() => {
    window.sessionStorage.clear();
    vi.clearAllMocks();
  });

  it('restores the signup draft after viewing terms and returning to signup', async () => {
    const { container } = renderSignUpRoute();

    fillSignUpForm(container, { asSeller: true });
    fireEvent.click(screen.getByRole('button', { name: /terms & conditions/i }));

    expect(await screen.findByText('Terms & Conditions')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /back to sign up/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('John Doe')).toHaveValue('Jane Doe');
    });

    expect(screen.getByPlaceholderText('you@example.com')).toHaveValue('jane@example.com');
    expect(screen.getByPlaceholderText('johndoe123')).toHaveValue('janedoe123');
    expect(screen.getByRole('combobox', { name: /location \(state in nigeria\)/i })).toHaveValue('Lagos');
    expect(screen.getByPlaceholderText('08012345678')).toHaveValue('08012345678');
    expect(screen.getByPlaceholderText('Your store name')).toHaveValue('Jane Store');
    expect(screen.getByPlaceholderText('Search your university')).toHaveValue('Mafdesh University');
    expect(screen.getByRole('combobox', { name: /university state/i })).toHaveValue('Kaduna');
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('restores the signup draft after viewing policies and returning to signup', async () => {
    const { container } = renderSignUpRoute();

    fillSignUpForm(container);
    fireEvent.click(screen.getByRole('button', { name: /privacy policy/i }));

    expect(await screen.findByText('Marketplace Policies')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /back to sign up/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('John Doe')).toHaveValue('Jane Doe');
    });

    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('redirects to login with the normal success message after a successful signup', async () => {
    const { container } = renderSignUpRoute();
    fillAndSubmitSignUpForm(container);

    expect(
      await screen.findByText('Account created successfully! Please check your email to verify before logging in.')
    ).toBeInTheDocument();
    expect(mockEnsureCurrentUserContext).not.toHaveBeenCalled();
    expect(mockShowError).not.toHaveBeenCalled();
  });

  it('finishes backend bootstrap immediately when auth signup returns a live session', async () => {
    mockSignUp.mockResolvedValue({
      data: {
        user: { id: 'user-1' },
        session: {
          user: { id: 'user-1', email: 'jane@example.com' },
        },
      },
      error: null,
    });

    const { container } = renderSignUpRoute();
    fillAndSubmitSignUpForm(container);

    expect(
      await screen.findByText('Account created successfully! Please check your email to verify before logging in.')
    ).toBeInTheDocument();
    expect(mockEnsureCurrentUserContext).toHaveBeenCalledWith({
      authUser: expect.objectContaining({ id: 'user-1' }),
      desiredRole: 'buyer',
    });
  });

  it('redirects to login with a recovery message when bootstrap fails after auth signup succeeds', async () => {
    mockSignUp.mockResolvedValue({
      data: {
        user: { id: 'user-1' },
        session: {
          user: { id: 'user-1', email: 'jane@example.com' },
        },
      },
      error: null,
    });
    mockEnsureCurrentUserContext.mockRejectedValue(new Error('Profile sync timed out'));

    const { container } = renderSignUpRoute();
    fillAndSubmitSignUpForm(container);

    expect(
      await screen.findByText(/Your account was created successfully\. Please check your email to verify it, then log in\./i)
    ).toBeInTheDocument();
    expect(mockShowError).not.toHaveBeenCalled();
  });

  it('uses the same recovery path for other backend bootstrap failures', async () => {
    mockSignUp.mockResolvedValue({
      data: {
        user: { id: 'user-1' },
        session: {
          user: { id: 'user-1', email: 'jane@example.com' },
        },
      },
      error: null,
    });
    mockEnsureCurrentUserContext.mockRejectedValue(new Error('Users table write failed'));

    const { container } = renderSignUpRoute();
    fillAndSubmitSignUpForm(container);

    expect(
      await screen.findByText(/Your account was created successfully\. Please check your email to verify it, then log in\./i)
    ).toBeInTheDocument();
    expect(mockShowError).not.toHaveBeenCalled();
  });

  it('shows an error and stays on signup when auth signup truly fails', async () => {
    mockSignUp.mockResolvedValue({
      data: {
        user: null,
      },
      error: new Error('Account already exists'),
    });

    const { container } = renderSignUpRoute();
    fillAndSubmitSignUpForm(container);

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalled();
    });

    expect(screen.getByText('Create your account')).toBeInTheDocument();
    expect(screen.queryByText(/Account created successfully!/i)).not.toBeInTheDocument();
  });

  it('surfaces a username-specific message when signup fails after the username is claimed', async () => {
    mockProfilesMaybeSingle
      .mockResolvedValueOnce({
        data: null,
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: 'other-user' },
        error: null,
      });
    mockSignUp.mockRejectedValue(new Error('Unexpected failure, please check server logs for more information'));

    const { container } = renderSignUpRoute();
    fillAndSubmitSignUpForm(container);

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith(
        'Username Already Taken',
        'That username was claimed before we could finish creating your account. Please choose another one and try again.'
      );
    });
  });

  it('shows a friendlier message for generic server-side signup failures', async () => {
    mockSignUp.mockRejectedValue(new Error('Unexpected failure, please check server logs for more information'));

    const { container } = renderSignUpRoute();
    fillAndSubmitSignUpForm(container);

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith(
        'Signup Temporarily Unavailable',
        'We could not create your account because secure signup hit a server-side problem. Please try again in a moment. If it keeps happening, try a different username or contact support.'
      );
    });
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
