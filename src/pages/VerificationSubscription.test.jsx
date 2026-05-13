import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../components/Navbar', () => ({
  default: () => <div data-testid="navbar" />,
}));

vi.mock('../components/FooterSlim', () => ({
  default: () => <div data-testid="footer" />,
}));

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        }),
      }),
    })),
  },
}));

vi.mock('../utils/authResilience', () => ({
  getSessionWithRetry: vi.fn().mockResolvedValue({
    data: {
      session: {
        user: {
          id: 'seller-1',
          email: 'seller@example.com',
        },
      },
    },
  }),
}));

vi.mock('../services/verificationService', async () => {
  const actual = await vi.importActual('../services/verificationService');

  return {
    ...actual,
    fetchSellerVerificationSnapshot: vi.fn().mockResolvedValue({
      user: {
        id: 'seller-1',
        role: 'seller',
        email: 'seller@example.com',
        university_id: 'uni-1',
        university_name: 'Mafdesh University',
        university_state: 'Kaduna',
        university_zone: 'North West',
        university_role: 'student',
        verification_status: 'not_submitted',
        is_verified_seller: false,
      },
      latestSubmission: null,
      status: 'not_submitted',
    }),
  };
});

import VerificationSubscription from './VerificationSubscription';

describe('VerificationSubscription', () => {
  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('uses university verification copy without unsupported growth claims', async () => {
    localStorage.setItem(
      'mafdesh_user',
      JSON.stringify({ id: 'seller-1', role: 'seller', email: 'seller@example.com' })
    );

    render(
      <MemoryRouter>
        <VerificationSubscription />
      </MemoryRouter>
    );

    expect(
      await screen.findByText(/submit your university details for verification/i)
    ).toBeInTheDocument();
    expect(screen.getAllByText(/early verification fee/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/73%/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/2-3x/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/featured in "verified sellers" section/i)).not.toBeInTheDocument();
  });
});

