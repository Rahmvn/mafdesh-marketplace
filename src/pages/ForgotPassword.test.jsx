import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ForgotPassword from './ForgotPassword';

const {
  mockBeginPasswordReset,
  mockShowError,
  mockShowWarning,
} = vi.hoisted(() => ({
  mockBeginPasswordReset: vi.fn(),
  mockShowError: vi.fn(),
  mockShowWarning: vi.fn(),
}));

vi.mock('../services/authSessionService', () => ({
  beginPasswordReset: mockBeginPasswordReset,
}));

vi.mock('../hooks/useModal', () => ({
  default: () => ({
    showError: mockShowError,
    showWarning: mockShowWarning,
    ModalComponent: () => null,
  }),
}));

vi.mock('../components/FooterSlim', () => ({
  default: () => <div data-testid="footer" />,
}));

function renderForgotPassword() {
  render(
    <MemoryRouter>
      <ForgotPassword />
    </MemoryRouter>
  );
}

describe('ForgotPassword', () => {
  beforeEach(() => {
    mockBeginPasswordReset.mockResolvedValue({
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows a success state after sending the password reset email', async () => {
    renderForgotPassword();

    fireEvent.change(screen.getByPlaceholderText(/enter your email/i), {
      target: { value: 'buyer@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(screen.getByText(/buyer@example.com/i)).toBeInTheDocument();
  });

  it('requires an email address before sending a reset email', async () => {
    renderForgotPassword();

    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(mockShowWarning).toHaveBeenCalledWith(
        'Email Required',
        'Please enter your email address.'
      );
    });
  });

  it('shows a friendly error when the reset request fails', async () => {
    mockBeginPasswordReset.mockResolvedValue({
      error: new Error('Network failure'),
    });

    renderForgotPassword();

    fireEvent.change(screen.getByPlaceholderText(/enter your email/i), {
      target: { value: 'buyer@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalled();
    });
  });
});
