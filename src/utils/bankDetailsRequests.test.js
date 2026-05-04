import { describe, expect, it } from 'vitest';
import {
  buildApprovedBankDetailsUpdate,
  buildBankDetailsPendingUpdate,
  sanitizeBankDetailsRequest,
  validateBankDetailsRequest,
} from './bankDetailsRequests';

describe('bankDetailsRequests', () => {
  it('sanitizes payout request fields before submission', () => {
    expect(
      sanitizeBankDetailsRequest({
        bank_name: '  Zenith Bank ',
        account_number: '0123-456-789',
        account_name: ' Jane Store ',
        business_address: ' 12 Marina ',
        bvn: '123-456-789-01',
        tax_id: '  TIN-44 ',
      })
    ).toEqual({
      bank_name: 'Zenith Bank',
      account_number: '0123456789',
      account_name: 'Jane Store',
      business_address: '12 Marina',
      bvn: '12345678901',
      tax_id: 'TIN-44',
    });
  });

  it('builds a pending-only update payload so client writes do not touch approval state', () => {
    expect(
      buildBankDetailsPendingUpdate({
        bank_name: 'Access Bank',
        account_number: '0123456789',
        account_name: 'Jane Store',
      })
    ).toEqual({
      bank_details_pending: {
        bank_name: 'Access Bank',
        account_number: '0123456789',
        account_name: 'Jane Store',
        business_address: '',
        bvn: '',
        tax_id: '',
      },
    });
  });

  it('builds a first-time approved update payload for initial seller setup', () => {
    expect(
      buildApprovedBankDetailsUpdate({
        bank_name: 'Access Bank',
        account_number: '0123456789',
        account_name: 'Jane Store',
        business_address: '12 Marina',
        bvn: '12345678901',
        tax_id: 'TIN-44',
      })
    ).toEqual({
      bank_name: 'Access Bank',
      account_number: '0123456789',
      account_name: 'Jane Store',
      business_address: '12 Marina',
      bvn: '12345678901',
      tax_id: 'TIN-44',
      bank_details_pending: null,
      bank_details_approved: true,
    });
  });

  it('rejects invalid payout request values before the database sees them', () => {
    expect(
      validateBankDetailsRequest({
        bank_name: 'Access Bank',
        account_number: '1234',
        account_name: 'Jane Store',
      })
    ).toEqual(
      expect.objectContaining({
        ok: false,
        message: 'Account number must be exactly 10 digits.',
      })
    );

    expect(
      validateBankDetailsRequest({
        bank_name: 'Access Bank',
        account_number: '0123456789',
        account_name: 'Jane Store',
        bvn: '12345',
      })
    ).toEqual(
      expect.objectContaining({
        ok: false,
        message: 'BVN must be exactly 11 digits when provided.',
      })
    );
  });
});
