import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ResetPassword from './ResetPassword';

const {
  mockGetActiveSession,
  mockUpdateAuthenticatedPassword,
  mockShowSuccess,
  mockShowError,
  mockShowWarning,
} = vi.hoisted(() => ({
  mockGetActiveSession: vi.fn(),
  mockUpdateAuthenticatedPassword: vi.fn(),
  mockShowSuccess: vi.fn(),
  mockShowError: vi.fn(),
  mockShowWarning: vi.fn(),
}));

vi.mock('../services/authSessionService', () => ({
  getActiveSession: mockGetActiveSession,
  updateAuthenticatedPassword: mockUpdateAuthenticatedPassword,
}));

vi.mock('../hooks/useModal', () => ({
  default: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
    showWarning: mockShowWarning,
    ModalComponent: () => null,
  }),
}));

vi.mock('../components/FooterSlim', () => ({
  default: () => <div data-testid="footer" />,
}));

function LoginStatePage() {
  const location = useLocation();
  return <div>{location.state?.message || 'Login page'}</div>;
}

function renderResetPassword(initialEntry = '/reset-password') {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/login" element={<LoginStatePage />} />
      </Routes>
    </MemoryRouter>
  );
}

function fillResetForm({ password = 'newpassword', confirmPassword = 'newpassword' } = {}) {
  fireEvent.change(screen.getByPlaceholderText(/enter new password/i), {
    target: { value: password },
  });
  fireEvent.change(screen.getByPlaceholderText(/confirm new password/i), {
    target: { value: confirmPassword },
  });
}

async function waitForRecoveryCheck() {
  await waitFor(() => {
    expect(mockGetActiveSession).toHaveBeenCalled();
  });
}

describe('ResetPassword', () => {
  beforeEach(() => {
    mockGetActiveSession.mockResolvedValue({
      user: { id: 'user-1' },
    });
    mockUpdateAuthenticatedPassword.mockResolvedValue({
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('updates the password and redirects to login when a recovery session is active', async () => {
    renderResetPassword();
    await waitForRecoveryCheck();
    fillResetForm();
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => {
      expect(mockUpdateAuthenticatedPassword).toHaveBeenCalledWith('newpassword');
    });
    expect(mockShowSuccess).toHaveBeenCalledWith(
      'Password Updated',
      'Password updated successfully. You can now login with your new password.'
    );
    expect(
      await screen.findByText('Password updated successfully. Please log in with your new password.')
    ).toBeInTheDocument();
  });

  it('blocks direct access when no recovery session exists', async () => {
    mockGetActiveSession.mockResolvedValue(null);

    renderResetPassword();

    expect(
      await screen.findByText(/Open the reset link from your email first/i)
    ).toBeInTheDocument();

    fillResetForm();
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith(
        'Reset Link Required',
        'Open the password reset link from your email before setting a new password.'
      );
    });
  });

  it('shows a warning when the passwords do not match', async () => {
    renderResetPassword();
    await waitForRecoveryCheck();
    fillResetForm({ password: 'newpassword', confirmPassword: 'different' });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => {
      expect(mockShowWarning).toHaveBeenCalledWith(
        'Password Mismatch',
        'Passwords do not match.'
      );
    });
  });

  it('shows a friendly error when the password update fails', async () => {
    mockUpdateAuthenticatedPassword.mockResolvedValue({
      error: new Error('Update failed'),
    });

    renderResetPassword();
    await waitForRecoveryCheck();
    fillResetForm();
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalled();
    });
  });
});
