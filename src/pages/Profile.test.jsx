import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Profile from './Profile';

const {
  mockGetSessionWithRetry,
  mockUsersSingle,
  mockProfilesMaybeSingle,
  mockSearchUniversities,
  mockUpdateEq,
} = vi.hoisted(() => {
  const mockGetSessionWithRetry = vi.fn();
  const mockUsersSingle = vi.fn();
  const mockProfilesMaybeSingle = vi.fn();
  const mockSearchUniversities = vi.fn();
  const mockUpdateEq = vi.fn();

  return {
    mockGetSessionWithRetry,
    mockUsersSingle,
    mockProfilesMaybeSingle,
    mockSearchUniversities,
    mockUpdateEq,
  };
});

vi.mock('../supabaseClient', () => {
  const mockChannel = {
    on: vi.fn(() => mockChannel),
    subscribe: vi.fn(() => mockChannel),
  };

  return {
    supabase: {
      auth: {},
      from: vi.fn((table) => {
        if (table === 'users') {
          return {
            select: () => ({
              eq: () => ({
                single: mockUsersSingle,
              }),
            }),
            update: () => ({
              eq: mockUpdateEq,
            }),
          };
        }

        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: mockProfilesMaybeSingle,
              }),
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
      channel: vi.fn(() => mockChannel),
      removeChannel: vi.fn(),
    },
  };
});

vi.mock('../utils/authResilience', () => ({
  getSessionWithRetry: mockGetSessionWithRetry,
}));

vi.mock('../services/universityService', () => ({
  searchUniversities: mockSearchUniversities,
}));

vi.mock('../hooks/useModal', () => ({
  default: () => ({
    showConfirm: vi.fn(),
    showError: vi.fn(),
    showSuccess: vi.fn(),
    ModalComponent: () => null,
  }),
}));

vi.mock('../components/Navbar', () => ({
  default: () => <div data-testid="navbar" />,
}));

vi.mock('../components/FooterSlim', () => ({
  default: () => <div data-testid="footer" />,
}));

vi.mock('../components/VerificationBadge', () => ({
  default: () => <div data-testid="verification-badge" />,
}));

vi.mock('../components/PageFeedback', () => ({
  RetryablePageError: () => <div>Retryable error</div>,
}));

vi.mock('../services/savedAddressService', () => ({
  listSavedAddresses: vi.fn(),
}));

vi.mock('../services/authSessionService', () => ({
  signOutAndClearAuthState: vi.fn(),
  updateAuthenticatedPassword: vi.fn(),
  verifyCurrentPassword: vi.fn(),
}));

function renderProfile() {
  return render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>
  );
}

function createSellerProfile(overrides = {}) {
  return {
    id: 'seller-1',
    full_name: 'Jane Seller',
    email: 'seller@example.com',
    username: 'janeseller',
    role: 'seller',
    phone_number: '08012345678',
    date_of_birth: '1999-04-10',
    business_name: 'Jane Store',
    university_id: 'uni-1',
    university_name: 'University of Lagos',
    university_state: 'Lagos',
    university_zone: 'South West',
    university_role: 'student',
    is_verified: false,
    is_verified_seller: false,
    verification_status: 'not_submitted',
    bank_name: '',
    account_number: '',
    account_name: '',
    business_address: '',
    bvn: '',
    tax_id: '',
    bank_details_pending: null,
    ...overrides,
  };
}

describe('Profile', () => {
  beforeEach(() => {
    mockGetSessionWithRetry.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'seller-1',
            email: 'seller@example.com',
          },
        },
      },
    });
    mockUsersSingle.mockResolvedValue({
      data: createSellerProfile(),
      error: null,
    });
    mockProfilesMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    mockSearchUniversities.mockResolvedValue([]);
    mockUpdateEq.mockResolvedValue({ error: null });
  });

  it('unlocks and focuses the university form when edit is clicked', async () => {
    renderProfile();

    expect(await screen.findByText('Jane Seller')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^University$/i }));

    const universityInput = await screen.findByLabelText(/university name/i);
    expect(universityInput).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /edit university details/i }));

    await waitFor(() => {
      expect(universityInput).not.toBeDisabled();
      expect(universityInput).toHaveFocus();
    });

    fireEvent.change(universityInput, {
      target: { value: 'Updated University' },
    });
    expect(universityInput).toHaveValue('Updated University');

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(universityInput).toBeDisabled();
      expect(universityInput).toHaveValue('University of Lagos');
    });
  });

  it('keeps the bank picker search-first and only shows suggestions after typing enough', async () => {
    renderProfile();

    expect(await screen.findByText('Jane Seller')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Payout$/i }));

    const bankInput = await screen.findByLabelText(/bank name/i);
    expect(screen.queryByText('Access Bank')).not.toBeInTheDocument();

    fireEvent.change(bankInput, {
      target: { value: 'A' },
    });
    expect(screen.queryByText('Access Bank')).not.toBeInTheDocument();

    fireEvent.change(bankInput, {
      target: { value: 'Ac' },
    });

    expect(await screen.findByText('Access Bank')).toBeInTheDocument();
  });
});
