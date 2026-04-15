import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetUser,
  mockUpload,
  mockGetPublicUrl,
  mockInsert,
  mockSelect,
  mockSingle,
  mockStorageFrom,
  mockFrom,
} = vi.hoisted(() => {
  const mockGetUser = vi.fn();
  const mockUpload = vi.fn();
  const mockGetPublicUrl = vi.fn();
  const mockInsert = vi.fn();
  const mockSelect = vi.fn();
  const mockSingle = vi.fn();
  const mockStorageFrom = vi.fn((bucket) => {
    if (bucket !== 'support-attachments') {
      throw new Error(`Unexpected storage bucket: ${bucket}`);
    }

    return {
      upload: mockUpload,
      getPublicUrl: mockGetPublicUrl,
    };
  });
  const mockFrom = vi.fn((table) => {
    if (table !== 'support_tickets') {
      throw new Error(`Unexpected table: ${table}`);
    }

    return {
      insert: mockInsert,
    };
  });

  return {
    mockGetUser,
    mockUpload,
    mockGetPublicUrl,
    mockInsert,
    mockSelect,
    mockSingle,
    mockStorageFrom,
    mockFrom,
  };
});

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: mockGetUser,
    },
    storage: {
      from: mockStorageFrom,
    },
    from: mockFrom,
  },
}));

import Support from './Support';

vi.mock('../components/Navbar', () => ({
  default: () => <div data-testid="navbar" />,
}));

vi.mock('../components/Footer', () => ({
  default: () => <div data-testid="footer" />,
}));

describe('Support', () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    mockUpload.mockResolvedValue({ error: null });
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://example.com/file.png' },
    });
    mockSingle.mockResolvedValue({
      data: { id: 'ticket-123' },
      error: null,
    });
    mockSelect.mockReturnValue({
      single: mockSingle,
    });
    mockInsert.mockReturnValue({
      select: mockSelect,
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('shows priority support for verified sellers', () => {
    localStorage.setItem(
      'mafdesh_user',
      JSON.stringify({ role: 'seller', is_verified: true })
    );

    render(
      <MemoryRouter>
        <Support />
      </MemoryRouter>
    );

    expect(screen.getByText('Priority Support Active')).toBeInTheDocument();
    expect(screen.getAllByText(/response within 2 hours/i)).not.toHaveLength(0);
  });

  it('does not show priority support for buyers', () => {
    localStorage.setItem(
      'mafdesh_user',
      JSON.stringify({ role: 'buyer', is_verified: false })
    );

    render(
      <MemoryRouter>
        <Support />
      </MemoryRouter>
    );

    expect(screen.queryByText('Priority Support Active')).not.toBeInTheDocument();
  });

  it('submits the support ticket without attachments when the storage bucket is missing', async () => {
    localStorage.setItem(
      'mafdesh_user',
      JSON.stringify({ role: 'buyer', is_verified: false })
    );
    mockUpload.mockResolvedValue({
      error: { message: 'Bucket not found', name: 'StorageApiError' },
    });

    render(
      <MemoryRouter>
        <Support />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'The payment page failed after checkout.' },
    });

    const file = new File(['proof'], 'proof.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Attach files'), {
      target: { files: [file] },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Submit Support Request' }));

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-123',
          attachment_urls: [],
        })
      );
    });

    expect(
      await screen.findByText(
        /your support request was submitted, but attachments could not be uploaded/i
      )
    ).toBeInTheDocument();
  });
});
