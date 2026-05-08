import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  mockVerificationOrder,
  mockCreateSignedUrl,
  mockRpc,
  mockStorageFrom,
  mockFrom,
} = vi.hoisted(() => {
  const mockVerificationOrder = vi.fn();
  const mockCreateSignedUrl = vi.fn();
  const mockRpc = vi.fn();

  const mockStorageFrom = vi.fn(() => ({
    createSignedUrl: mockCreateSignedUrl,
  }));

  const mockFrom = vi.fn((table) => {
    if (table === 'seller_verifications') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: mockVerificationOrder,
          })),
        })),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    mockVerificationOrder,
    mockCreateSignedUrl,
    mockRpc,
    mockStorageFrom,
    mockFrom,
  };
});

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: mockFrom,
    rpc: mockRpc,
    storage: {
      from: mockStorageFrom,
    },
  },
}));

import {
  fetchPendingVerificationRequests,
  isImageProof,
  reviewSellerVerification,
} from './adminVerificationService';

describe('adminVerificationService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads pending requests and signs proof URLs', async () => {
    mockVerificationOrder.mockResolvedValueOnce({
      data: [
        {
          id: 'verification-1',
          proof_url: 'seller-1/proof.png',
          seller: {
            id: 'seller-1',
            email: 'seller@example.com',
          },
        },
      ],
      error: null,
    });
    mockCreateSignedUrl.mockResolvedValueOnce({
      data: {
        signedUrl: 'https://example.com/proof.png',
      },
      error: null,
    });

    const requests = await fetchPendingVerificationRequests();

    expect(mockFrom).toHaveBeenCalledWith('seller_verifications');
    expect(mockStorageFrom).toHaveBeenCalledWith('seller-verification-proofs');
    expect(requests[0]).toMatchObject({
      id: 'verification-1',
      signedProofUrl: 'https://example.com/proof.png',
      isImageProof: true,
    });
  });

  it('sends review decisions through the protected rpc', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { decision: 'approve' },
      error: null,
    });

    await reviewSellerVerification({
      verificationId: 'verification-1',
      decision: 'approve',
      adminNotes: '',
    });

    expect(mockRpc).toHaveBeenCalledWith('review_seller_verification', {
      p_verification_id: 'verification-1',
      p_decision: 'approve',
      p_admin_notes: null,
    });
  });

  it('detects image-based proofs correctly', () => {
    expect(isImageProof('seller/proof.webp')).toBe(true);
    expect(isImageProof('seller/proof.pdf')).toBe(false);
  });
});
