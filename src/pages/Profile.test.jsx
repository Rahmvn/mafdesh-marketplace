import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Profile from './Profile';

const {
  mockGetSessionWithRetry,
  mockUsersSingle,
  mockProfilesMaybeSingle,
  mockProfilesUpsert,
  mockSearchUniversities,
  mockUpdateEq,
  mockAuthUpdateUser,
} = vi.hoisted(() => {
  const mockGetSessionWithRetry = vi.fn();
  const mockUsersSingle = vi.fn();
  const mockProfilesMaybeSingle = vi.fn();
  const mockProfilesUpsert = vi.fn();
  const mockSearchUniversities = vi.fn();
  const mockUpdateEq = vi.fn();
  const mockAuthUpdateUser = vi.fn();

  return {
    mockGetSessionWithRetry,
    mockUsersSingle,
    mockProfilesMaybeSingle,
    mockProfilesUpsert,
    mockSearchUniversities,
    mockUpdateEq,
    mockAuthUpdateUser,
  };
});

vi.mock('../supabaseClient', () => {
  const mockChannel = {
    on: vi.fn(() => mockChannel),
    subscribe: vi.fn(() => mockChannel),
  };

  return {
    supabase: {
      auth: {
        updateUser: mockAuthUpdateUser,
      },
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
            upsert: mockProfilesUpsert,
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
    mockGetSessionWithRetry.mockReset();
    mockUsersSingle.mockReset();
    mockProfilesMaybeSingle.mockReset();
    mockProfilesUpsert.mockReset();
    mockSearchUniversities.mockReset();
    mockUpdateEq.mockReset();
    mockAuthUpdateUser.mockReset();

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
    mockProfilesUpsert.mockResolvedValue({
      error: null,
    });
    mockSearchUniversities.mockResolvedValue([]);
    mockUpdateEq.mockResolvedValue({ error: null });
    mockAuthUpdateUser.mockResolvedValue({ error: null });
  });

  it('allows not-submitted sellers to edit and save university details', async () => {
    mockUsersSingle
      .mockResolvedValueOnce({
        data: createSellerProfile(),
        error: null,
      })
      .mockResolvedValueOnce({
        data: createSellerProfile({
          university_id: '',
          university_name: 'Updated University',
          university_state: 'Lagos',
          university_zone: 'South West',
        }),
        error: null,
      });

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

    fireEvent.click(screen.getByRole('button', { name: /save university details/i }));

    await waitFor(() => {
      expect(mockUpdateEq).toHaveBeenCalledWith('id', 'seller-1');
      expect(screen.getByText('University details saved successfully.')).toBeInTheDocument();
    });
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

  it('keeps pending sellers locked and rejects direct university submits', async () => {
    mockUsersSingle.mockResolvedValueOnce({
      data: createSellerProfile({
        verification_status: 'pending',
      }),
      error: null,
    });

    renderProfile();

    expect(await screen.findByText('Jane Seller')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^University$/i }));

    const universityInput = await screen.findByLabelText(/university name/i);
    expect(universityInput).toBeDisabled();
    expect(screen.queryByRole('button', { name: /edit university details/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /contact support/i })).toBeInTheDocument();

    fireEvent.submit(universityInput.closest('form'));

    await waitFor(() => {
      expect(screen.getAllByText(/campus identity is locked after verification starts/i)[0]).toBeInTheDocument();
    });

    expect(mockUpdateEq).not.toHaveBeenCalled();
  });

  it('keeps approved sellers locked and shows support guidance', async () => {
    mockUsersSingle.mockResolvedValueOnce({
      data: createSellerProfile({
        is_verified_seller: true,
        verification_status: 'approved',
      }),
      error: null,
    });

    renderProfile();

    expect(await screen.findByText('Jane Seller')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^University$/i }));

    const universityInput = await screen.findByLabelText(/university name/i);
    expect(universityInput).toBeDisabled();
    expect(screen.queryByRole('button', { name: /edit university details/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /contact support/i })).toBeInTheDocument();
  });

  it('allows rejected sellers to edit university details again', async () => {
    mockUsersSingle.mockResolvedValueOnce({
      data: createSellerProfile({
        verification_status: 'rejected',
      }),
      error: null,
    });

    renderProfile();

    expect(await screen.findByText('Jane Seller')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^University$/i }));

    const universityInput = await screen.findByLabelText(/university name/i);
    expect(universityInput).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /edit university details/i }));

    await waitFor(() => {
      expect(universityInput).not.toBeDisabled();
    });

    expect(
      screen.getByText(/correct your campus identity before resubmitting verification/i)
    ).toBeInTheDocument();
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

  it('saves missing core profile details to the correct tables', async () => {
    mockUsersSingle.mockResolvedValueOnce({
      data: createSellerProfile({
        full_name: '',
        phone_number: '',
        date_of_birth: '',
      }),
      error: null,
    });

    renderProfile();

    expect(await screen.findByText('Complete your profile')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: 'Jane Seller' },
    });
    fireEvent.change(screen.getByLabelText(/phone number/i), {
      target: { value: '08012345678' },
    });
    fireEvent.change(screen.getByLabelText(/date of birth/i), {
      target: { value: '1999-04-10' },
    });

    fireEvent.click(screen.getByRole('button', { name: /save details/i }));

    await waitFor(() => {
      expect(mockUpdateEq).toHaveBeenCalledWith('id', 'seller-1');
      expect(mockProfilesUpsert).toHaveBeenCalledWith(
        {
          id: 'seller-1',
          full_name: 'Jane Seller',
        },
        { onConflict: 'id' }
      );
      expect(mockAuthUpdateUser).toHaveBeenCalledWith({
        data: {
          full_name: 'Jane Seller',
          phone_number: '08012345678',
          date_of_birth: '1999-04-10',
        },
      });
    });
  });

  it('uses legacy saved name fields before falling back to the user id', async () => {
    mockGetSessionWithRetry.mockResolvedValueOnce({
      data: {
        session: {
          user: {
            id: 'seller-1',
            email: 'seller@example.com',
            user_metadata: {
              name: 'Legacy Jane Seller',
            },
          },
        },
      },
    });
    mockUsersSingle.mockResolvedValueOnce({
      data: createSellerProfile({
        full_name: '',
        phone_number: '08012345678',
        date_of_birth: '1999-04-10',
      }),
      error: null,
    });

    renderProfile();

    expect(await screen.findByText('Legacy Jane Seller')).toBeInTheDocument();
    expect(screen.queryByText('Complete your profile')).not.toBeInTheDocument();
    expect(screen.queryByText('seller-1')).not.toBeInTheDocument();
  });
});
