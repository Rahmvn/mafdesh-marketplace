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

function moveToContactStep({ asSeller = false } = {}) {
  if (asSeller) {
    fireEvent.click(screen.getByRole('button', { name: /seller/i }));
  }

  fireEvent.change(screen.getByPlaceholderText('John Doe'), {
    target: { value: 'Jane Doe' },
  });
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
    target: { value: 'jane@example.com' },
  });
  fireEvent.click(screen.getByRole('button', { name: /next: contact & security/i }));
}

function moveToDetailsStep({ asSeller = false } = {}) {
  moveToContactStep({ asSeller });

  fireEvent.change(screen.getByLabelText(/date of birth/i), {
    target: { value: '1999-04-10' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: /location \(state in nigeria\)/i }), {
    target: { value: 'Lagos' },
  });
  fireEvent.change(screen.getByPlaceholderText('08012345678'), {
    target: { value: '08012345678' },
  });
  fireEvent.change(screen.getByPlaceholderText('Enter a password'), {
    target: { value: 'password123' },
  });
  fireEvent.change(screen.getByPlaceholderText('Confirm your password'), {
    target: { value: 'password123' },
  });

  fireEvent.click(screen.getByRole('button', { name: /next: details/i }));
}

function fillSignUpForm({ agreeToTerms = true, asSeller = false } = {}) {
  moveToDetailsStep({ asSeller });

  if (asSeller) {
    fireEvent.change(screen.getByPlaceholderText('Your store name'), {
      target: { value: 'Jane Store' },
    });
    fireEvent.change(screen.getByPlaceholderText('Type if not listed'), {
      target: { value: 'Mafdesh University' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: /university state/i }), {
      target: { value: 'Kaduna' },
    });
  } else {
    fireEvent.change(screen.getByPlaceholderText('Type if not listed'), {
      target: { value: 'Mafdesh University' },
    });
  }

  if (agreeToTerms) {
    fireEvent.click(screen.getByRole('checkbox'));
  }
}

function fillAndSubmitSignUpForm(options) {
  fillSignUpForm(options);
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
    renderSignUpRoute();

    fillSignUpForm({ asSeller: true });
    fireEvent.click(screen.getByRole('button', { name: /terms & conditions/i }));

    expect(await screen.findByText('Terms & Conditions')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /back to sign up/i }));

    expect(await screen.findByText(/step 3 of 3/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Your store name')).toHaveValue('Jane Store');
    expect(screen.getByPlaceholderText('Type if not listed')).toHaveValue('Mafdesh University');
    expect(screen.getByRole('combobox', { name: /university state/i })).toHaveValue('Kaduna');
    expect(screen.getByRole('checkbox')).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByLabelText(/date of birth/i)).toHaveValue('1999-04-10');
    expect(screen.getByRole('combobox', { name: /location \(state in nigeria\)/i })).toHaveValue('Lagos');
    expect(screen.getByPlaceholderText('08012345678')).toHaveValue('08012345678');

    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByPlaceholderText('John Doe')).toHaveValue('Jane Doe');
    expect(screen.getByPlaceholderText('you@example.com')).toHaveValue('jane@example.com');
  });

  it('restores the signup draft after viewing policies and returning to signup', async () => {
    renderSignUpRoute();

    fillSignUpForm();
    fireEvent.click(screen.getByRole('button', { name: /privacy policy/i }));

    expect(await screen.findByText('Marketplace Policies')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /back to sign up/i }));

    expect(await screen.findByText(/step 3 of 3/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    fireEvent.click(screen.getByRole('button', { name: /back/i }));

    expect(screen.getByPlaceholderText('John Doe')).toHaveValue('Jane Doe');
    expect(screen.getByPlaceholderText('you@example.com')).toHaveValue('jane@example.com');
  });

  it('redirects to login with the normal success message after a successful signup', async () => {
    renderSignUpRoute();
    fillAndSubmitSignUpForm();

    expect(
      await screen.findByText('Account created successfully! Please check your email to verify before logging in.')
    ).toBeInTheDocument();
    expect(mockEnsureCurrentUserContext).not.toHaveBeenCalled();
    expect(mockShowError).not.toHaveBeenCalled();
  });

  it('passes date of birth and optional buyer university data into auth signup metadata', async () => {
    renderSignUpRoute();

    fillSignUpForm();
    fireEvent.change(screen.getByPlaceholderText('Type if not listed'), {
      target: { value: 'Mafdesh University' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalled();
    });

    expect(mockSignUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          data: expect.objectContaining({
            role: 'buyer',
            date_of_birth: '1999-04-10',
            university_name: 'Mafdesh University',
            username: expect.any(String),
          }),
        }),
      })
    );
  });

  it('preserves values when moving back through steps', async () => {
    renderSignUpRoute();

    fillSignUpForm({ asSeller: true, agreeToTerms: false });

    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByLabelText(/date of birth/i)).toHaveValue('1999-04-10');
    expect(screen.getByRole('combobox', { name: /location \(state in nigeria\)/i })).toHaveValue('Lagos');

    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByPlaceholderText('John Doe')).toHaveValue('Jane Doe');

    fireEvent.click(screen.getByRole('button', { name: /next: contact & security/i }));
    fireEvent.click(screen.getByRole('button', { name: /next: details/i }));
    expect(screen.getByPlaceholderText('Your store name')).toHaveValue('Jane Store');
    expect(screen.getByPlaceholderText('Type if not listed')).toHaveValue('Mafdesh University');
  });

  it('treats step two next as navigation instead of signup submission', async () => {
    renderSignUpRoute();

    moveToDetailsStep();

    expect(screen.getByText(/step 3 of 3/i)).toBeInTheDocument();
    expect(mockSignUp).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('does not submit signup early when enter is pressed on step two', async () => {
    renderSignUpRoute();

    fireEvent.change(screen.getByPlaceholderText('John Doe'), {
      target: { value: 'Jane Doe' },
    });
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'jane@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /next: contact & security/i }));

    fireEvent.change(screen.getByLabelText(/date of birth/i), {
      target: { value: '1999-04-10' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: /location \(state in nigeria\)/i }), {
      target: { value: 'Lagos' },
    });
    fireEvent.change(screen.getByPlaceholderText('08012345678'), {
      target: { value: '08012345678' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter a password'), {
      target: { value: 'password123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Confirm your password'), {
      target: { value: 'password123' },
    });

    fireEvent.keyDown(screen.getByPlaceholderText('Confirm your password'), {
      key: 'Enter',
      code: 'Enter',
      charCode: 13,
    });

    expect(screen.getByText(/step 3 of 3/i)).toBeInTheDocument();
    expect(mockSignUp).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
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

    renderSignUpRoute();
    fillAndSubmitSignUpForm();

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

    renderSignUpRoute();
    fillAndSubmitSignUpForm();

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

    renderSignUpRoute();
    fillAndSubmitSignUpForm();

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

    renderSignUpRoute();
    fillAndSubmitSignUpForm();

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalled();
    });

    expect(screen.getByText('Create your account')).toBeInTheDocument();
    expect(screen.queryByText(/Account created successfully!/i)).not.toBeInTheDocument();
  });

  it('shows the generic signup message when secure signup fails server-side', async () => {
    mockSignUp.mockRejectedValue(new Error('Unexpected failure, please check server logs for more information'));

    renderSignUpRoute();
    fillAndSubmitSignUpForm();

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith(
        'Signup Temporarily Unavailable',
        'We could not create your account because secure signup hit a server-side problem. Please try again in a moment or contact support.'
      );
    });
  });

  it('shows a friendlier message for generic server-side signup failures', async () => {
    mockSignUp.mockRejectedValue(new Error('Unexpected failure, please check server logs for more information'));

    renderSignUpRoute();
    fillAndSubmitSignUpForm();

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith(
        'Signup Temporarily Unavailable',
        'We could not create your account because secure signup hit a server-side problem. Please try again in a moment or contact support.'
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

    renderSignUpRoute();
    fillAndSubmitSignUpForm();

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledTimes(2);
    });

    expect(
      await screen.findByText('Account created successfully! Please check your email to verify before logging in.')
    ).toBeInTheDocument();
    expect(mockShowError).not.toHaveBeenCalled();
  });
});
