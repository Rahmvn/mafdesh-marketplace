import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminBankApprovals from './AdminBankApprovals';

const samplePendingUsers = [
  {
    id: 'seller-1',
    email: 'seller@example.com',
    business_name: 'Prime Gadgets',
    bank_details_approved: true,
    bank_name: 'Access Bank',
    account_number: '0123456789',
    account_name: 'Prime Gadgets Ltd',
    business_address: '12 Marina',
    bvn: '12345678901',
    tax_id: 'TIN-44',
    bank_details_pending: {
      bank_name: 'Zenith Bank',
      account_number: '9876543210',
      account_name: 'Prime Gadgets Ventures',
      business_address: '14 Marina',
      bvn: '12345678901',
      tax_id: 'TIN-55',
    },
  },
];

const {
  mockFetchPendingBankChanges,
  mockReviewPendingBankChange,
  mockGetCurrentAdminUser,
  mockShowSuccess,
  mockShowError,
  mockShowConfirm,
  mockChannelOn,
  mockChannelFactory,
  mockRemoveChannel,
} = vi.hoisted(() => {
  const mockFetchPendingBankChanges = vi.fn();
  const mockReviewPendingBankChange = vi.fn();
  const mockGetCurrentAdminUser = vi.fn(() => ({ id: 'admin-1', role: 'admin' }));
  const mockShowSuccess = vi.fn();
  const mockShowError = vi.fn();
  const mockShowConfirm = vi.fn();
  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
  };

  channel.on.mockImplementation(() => channel);
  channel.subscribe.mockReturnValue(channel);

  return {
    mockFetchPendingBankChanges,
    mockReviewPendingBankChange,
    mockGetCurrentAdminUser,
    mockShowSuccess,
    mockShowError,
    mockShowConfirm,
    mockChannelOn: channel.on,
    mockChannelFactory: vi.fn(() => channel),
    mockRemoveChannel: vi.fn(),
  };
});

vi.mock('../supabaseClient', () => ({
  supabase: {
    channel: mockChannelFactory,
    removeChannel: mockRemoveChannel,
  },
}));

vi.mock('../components/Navbar', () => ({
  default: () => <div data-testid="navbar" />,
}));

vi.mock('../components/FooterSlim', () => ({
  default: () => <div data-testid="footer" />,
}));

vi.mock('../hooks/useModal', () => ({
  default: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
    showConfirm: mockShowConfirm,
    ModalComponent: () => null,
  }),
}));

vi.mock('../services/adminActionService', () => ({
  fetchPendingBankChanges: mockFetchPendingBankChanges,
  getCurrentAdminUser: mockGetCurrentAdminUser,
  reviewPendingBankChange: mockReviewPendingBankChange,
}));

vi.mock('../services/authSessionService', () => ({
  signOutAndClearAuthState: vi.fn(),
}));

vi.mock('../components/AdminActionModal', () => ({
  default: ({
    isOpen,
    title,
    onClose,
    onConfirm,
  }) =>
    isOpen ? (
      <div>
        <p>{title}</p>
        <button type="button" onClick={() => onConfirm({ reason: 'Looks valid' })}>
          Confirm modal action
        </button>
        <button type="button" onClick={onClose}>
          Close modal
        </button>
      </div>
    ) : null,
}));

describe('AdminBankApprovals', () => {
  beforeEach(() => {
    mockFetchPendingBankChanges.mockResolvedValue(samplePendingUsers);
    mockReviewPendingBankChange.mockResolvedValue({
      success: true,
      decision: 'approve',
      user: samplePendingUsers[0],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders active and requested bank details side by side with changed-field markers', async () => {
    render(<AdminBankApprovals />);

    expect(await screen.findByText('Prime Gadgets')).toBeInTheDocument();
    expect(screen.getByText('Current active details')).toBeInTheDocument();
    expect(screen.getByText('Requested changes')).toBeInTheDocument();
    expect(screen.getAllByText('Changed').length).toBeGreaterThan(0);
  });

  it('approves a pending bank change through the dedicated review service', async () => {
    render(<AdminBankApprovals />);

    expect(await screen.findByText('Prime Gadgets')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm modal action/i }));

    await waitFor(() => {
      expect(mockReviewPendingBankChange).toHaveBeenCalledWith({
        sellerId: 'seller-1',
        decision: 'approve',
        reason: 'Looks valid',
      });
    });

    expect(mockShowSuccess).toHaveBeenCalled();
  });

  it('refreshes pending requests when the realtime users subscription fires', async () => {
    render(<AdminBankApprovals />);

    expect(await screen.findByText('Prime Gadgets')).toBeInTheDocument();
    const realtimeCallback = mockChannelOn.mock.calls[0][2];
    realtimeCallback({});

    await waitFor(() => {
      expect(mockFetchPendingBankChanges).toHaveBeenCalledTimes(2);
    });
  });
});
