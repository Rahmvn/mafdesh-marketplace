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
    from: vi.fn(),
  },
}));

import VerificationSubscription from './VerificationSubscription';

describe('VerificationSubscription', () => {
  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('uses premium-seller copy without unsupported growth claims', () => {
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
      screen.getByText(/verification with a cleaner premium seller experience/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/premium seller access starts at/i)).toBeInTheDocument();
    expect(screen.queryByText(/73%/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/2-3x/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/featured in "verified sellers" section/i)).not.toBeInTheDocument();
  });
});

