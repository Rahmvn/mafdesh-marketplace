import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AuthCallback from './AuthCallback';

const {
  mockEnsureCurrentUserContext,
  mockResolveAuthCallbackSession,
} = vi.hoisted(() => ({
  mockEnsureCurrentUserContext: vi.fn(),
  mockResolveAuthCallbackSession: vi.fn(),
}));

vi.mock('../services/authSessionService', () => ({
  ensureCurrentUserContext: mockEnsureCurrentUserContext,
  resolveAuthCallbackSession: mockResolveAuthCallbackSession,
}));

vi.mock('../components/FooterSlim', () => ({
  default: () => <div data-testid="footer" />,
}));

function LoginStatePage() {
  const location = useLocation();
  return <div>{location.state?.message || 'Login page'}</div>;
}

function ResetStatePage() {
  const location = useLocation();
  return <div>{location.state?.recoveryReady ? 'Recovery ready' : 'Recovery missing'}</div>;
}

function renderCallbackRoute() {
  render(
    <MemoryRouter initialEntries={['/auth/callback']}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/login" element={<LoginStatePage />} />
        <Route path="/reset-password" element={<ResetStatePage />} />
        <Route path="/email-verified" element={<div>Email verified</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AuthCallback', () => {
  beforeEach(() => {
    mockEnsureCurrentUserContext.mockResolvedValue({
      id: 'user-1',
      role: 'buyer',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('routes password recovery callbacks into reset-password with recovery state', async () => {
    mockResolveAuthCallbackSession.mockResolvedValue({
      status: 'authenticated',
      flow: 'recovery',
      session: {
        user: { id: 'user-1' },
      },
    });

    renderCallbackRoute();

    expect(await screen.findByText('Recovery ready')).toBeInTheDocument();
  });

  it('routes verified sessions to the email verified screen after bootstrap recovery', async () => {
    mockResolveAuthCallbackSession.mockResolvedValue({
      status: 'authenticated',
      flow: 'signup',
      session: {
        user: { id: 'user-1', email: 'buyer@example.com' },
      },
    });

    renderCallbackRoute();

    expect(await screen.findByText('Email verified')).toBeInTheDocument();
    expect(mockEnsureCurrentUserContext).toHaveBeenCalledWith({
      authUser: expect.objectContaining({ id: 'user-1' }),
    });
  });

  it('sends expired recovery links back to login with a clear message', async () => {
    mockResolveAuthCallbackSession.mockResolvedValue({
      status: 'error',
      flow: 'recovery',
      message: 'expired',
      session: null,
    });

    renderCallbackRoute();

    expect(
      await screen.findByText('This password reset link is invalid or has expired. Please request a new one.')
    ).toBeInTheDocument();
  });

  it('sends expired verification links back to login with a clear message', async () => {
    mockResolveAuthCallbackSession.mockResolvedValue({
      status: 'error',
      flow: 'signup',
      message: 'expired',
      session: null,
    });

    renderCallbackRoute();

    expect(
      await screen.findByText('This verification link is invalid or has expired. Please request a new one.')
    ).toBeInTheDocument();
  });

  it('handles anonymous non-recovery callbacks by routing to login with a success message', async () => {
    mockResolveAuthCallbackSession.mockResolvedValue({
      status: 'anonymous',
      flow: 'signup',
      session: null,
    });

    renderCallbackRoute();

    expect(
      await screen.findByText('Your email has been verified. Please log in to continue.')
    ).toBeInTheDocument();
  });
});
