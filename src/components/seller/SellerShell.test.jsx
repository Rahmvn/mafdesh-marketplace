import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  SellerShell,
  useSellerTheme,
  VERIFIED_SELLER_THEME_KEY,
} from './SellerShell';

vi.mock('../Navbar', () => ({
  default: ({ themeToggle }) => (
    <div data-testid="navbar">
      {themeToggle && (
        <button
          type="button"
          aria-label={
            themeToggle.darkMode ? 'Switch to light mode' : 'Switch to dark mode'
          }
          onClick={themeToggle.onToggle}
        >
          Toggle theme
        </button>
      )}
    </div>
  ),
}));

vi.mock('../FooterSlim', () => ({
  default: () => <div data-testid="footer" />,
}));

function TestHarness({ isVerified }) {
  const themeState = useSellerTheme(isVerified);

  return (
    <MemoryRouter>
      <SellerShell
        currentUser={{
          id: 'seller-1',
          email: 'seller@example.com',
          business_name: 'Northwind Store',
          is_verified: isVerified,
        }}
        onLogout={vi.fn()}
        themeState={themeState}
        title="Seller Workspace"
        subtitle="Shared shell test"
        showHeader
      >
        <div>Seller content</div>
      </SellerShell>
    </MemoryRouter>
  );
}

describe('SellerShell', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('restores dark mode for verified sellers from local storage', async () => {
    localStorage.setItem(VERIFIED_SELLER_THEME_KEY, 'dark');

    render(<TestHarness isVerified />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /switch to light mode/i })).toBeInTheDocument();
    });

    expect(screen.getByText(/verified university seller workspace/i)).toBeInTheDocument();
    expect(document.querySelector('[data-theme="dark"]')).not.toBeNull();
  });

  it('keeps unverified sellers on the light theme without a dark mode toggle', async () => {
    localStorage.setItem(VERIFIED_SELLER_THEME_KEY, 'dark');

    render(<TestHarness isVerified={false} />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /seller workspace/i })
      ).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /switch to dark mode/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /switch to light mode/i })).not.toBeInTheDocument();
    expect(document.querySelector('[data-theme="light"]')).not.toBeNull();
  });
});
