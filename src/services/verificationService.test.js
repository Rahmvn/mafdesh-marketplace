import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  mockUsersSingle,
  mockSellerVerificationsLimit,
  mockSellerVerificationsSingle,
  mockUsersUpdateSingle,
  mockUpload,
  mockRemove,
  mockStorageFrom,
  mockFrom,
} = vi.hoisted(() => {
  const mockUsersSingle = vi.fn();
  const mockSellerVerificationsLimit = vi.fn();
  const mockSellerVerificationsSingle = vi.fn();
  const mockUsersUpdateSingle = vi.fn();
  const mockUpload = vi.fn();
  const mockRemove = vi.fn();

  const mockStorageFrom = vi.fn(() => ({
    upload: mockUpload,
    remove: mockRemove,
  }));

  const mockFrom = vi.fn((table) => {
    if (table === 'users') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: mockUsersSingle,
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: mockUsersUpdateSingle,
            })),
          })),
        })),
      };
    }

    if (table === 'seller_verifications') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: mockSellerVerificationsLimit,
            })),
          })),
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: mockSellerVerificationsSingle,
          })),
        })),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    mockUsersSingle,
    mockSellerVerificationsLimit,
    mockSellerVerificationsSingle,
    mockUsersUpdateSingle,
    mockUpload,
    mockRemove,
    mockStorageFrom,
    mockFrom,
  };
});

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: mockFrom,
    storage: {
      from: mockStorageFrom,
    },
  },
}));

import {
  fetchSellerVerificationSnapshot,
  SELLER_VERIFICATION_PAYMENT_STATUSES,
  SELLER_VERIFICATION_STATUSES,
  submitSellerVerificationApplication,
} from './verificationService';

describe('verificationService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('treats the latest pending submission as the active seller verification status', async () => {
    mockUsersSingle.mockResolvedValueOnce({
      data: {
        id: 'seller-1',
        role: 'seller',
        verification_status: 'not_submitted',
        is_verified_seller: false,
      },
      error: null,
    });
    mockSellerVerificationsLimit.mockResolvedValueOnce({
      data: [
        {
          id: 'verification-1',
          seller_id: 'seller-1',
          verification_status: 'pending',
        },
      ],
      error: null,
    });

    const snapshot = await fetchSellerVerificationSnapshot('seller-1');

    expect(snapshot.status).toBe(SELLER_VERIFICATION_STATUSES.PENDING);
    expect(snapshot.latestSubmission?.id).toBe('verification-1');
  });

  it('uploads proof, inserts the verification row, and syncs the user status to pending', async () => {
    mockUpload.mockResolvedValueOnce({ data: {}, error: null });
    mockSellerVerificationsSingle.mockResolvedValueOnce({
      data: {
        id: 'verification-1',
        seller_id: 'seller-1',
        payment_status: SELLER_VERIFICATION_PAYMENT_STATUSES.MANUAL_PENDING,
        verification_status: 'pending',
      },
      error: null,
    });
    mockUsersUpdateSingle.mockResolvedValueOnce({
      data: {
        id: 'seller-1',
        role: 'seller',
        verification_status: 'pending',
      },
      error: null,
    });

    const result = await submitSellerVerificationApplication({
      sellerId: 'seller-1',
      universityName: 'Mafdesh University',
      universityState: 'Lagos',
      universityZone: 'South West',
      universityRole: 'student',
      matricOrStaffId: 'MU/001',
      proofFile: new File(['proof'], 'proof.pdf', { type: 'application/pdf' }),
    });

    expect(mockStorageFrom).toHaveBeenCalledWith('seller-verification-proofs');
    expect(mockUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^seller-1\//),
      expect.any(File),
      expect.objectContaining({ upsert: false })
    );
    expect(mockFrom).toHaveBeenCalledWith('seller_verifications');
    expect(mockFrom).toHaveBeenCalledWith('users');
    expect(result.status).toBe(SELLER_VERIFICATION_STATUSES.PENDING);
    expect(result.submission.payment_status).toBe(SELLER_VERIFICATION_PAYMENT_STATUSES.MANUAL_PENDING);
  });

  it('removes the uploaded proof if the verification row insert fails', async () => {
    mockUpload.mockResolvedValueOnce({ data: {}, error: null });
    mockSellerVerificationsSingle.mockResolvedValueOnce({
      data: null,
      error: new Error('insert failed'),
    });
    mockRemove.mockResolvedValueOnce({ data: [], error: null });

    await expect(
      submitSellerVerificationApplication({
        sellerId: 'seller-1',
        universityName: 'Mafdesh University',
        universityState: 'Lagos',
        universityZone: 'South West',
        universityRole: 'student',
        matricOrStaffId: 'MU/001',
        proofFile: new File(['proof'], 'proof.pdf', { type: 'application/pdf' }),
      })
    ).rejects.toThrow('insert failed');

    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(mockRemove).toHaveBeenCalledWith([
      expect.stringMatching(/^seller-1\//),
    ]);
  });
});
