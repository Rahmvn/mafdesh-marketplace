import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({
  supabase: {},
}));

import {
  deriveProductEditPolicy,
  getCoreFieldDiff,
  PRODUCT_EDIT_REQUEST_STATUS,
} from './productEditService';

describe('productEditService', () => {
  describe('deriveProductEditPolicy', () => {
    it('allows full direct edits for unapproved products', () => {
      expect(
        deriveProductEditPolicy(
          { is_approved: false },
          { hasTrustHistory: false, pendingRequest: null }
        )
      ).toEqual({
        hasTrustHistory: false,
        canEditCoreFields: true,
        canSubmitCoreEditRequest: false,
        canEditSafeFields: true,
        hasPendingEditRequest: false,
        blockedReason: '',
      });
    });

    it('requires review for approved products without trust history', () => {
      expect(
        deriveProductEditPolicy(
          { is_approved: true },
          {
            hasTrustHistory: false,
            pendingRequest: { status: PRODUCT_EDIT_REQUEST_STATUS.PENDING },
          }
        )
      ).toEqual({
        hasTrustHistory: false,
        canEditCoreFields: false,
        canSubmitCoreEditRequest: true,
        canEditSafeFields: true,
        hasPendingEditRequest: true,
        blockedReason:
          'Core listing changes on approved products must go through admin review before they go live.',
      });
    });

    it('locks core fields for approved products with trust history', () => {
      const policy = deriveProductEditPolicy(
        { is_approved: true },
        { hasTrustHistory: true, pendingRequest: null }
      );

      expect(policy.canEditCoreFields).toBe(false);
      expect(policy.canSubmitCoreEditRequest).toBe(false);
      expect(policy.canEditSafeFields).toBe(true);
      expect(policy.hasTrustHistory).toBe(true);
      expect(policy.blockedReason).toContain('locked');
    });
  });

  describe('getCoreFieldDiff', () => {
    it('returns only changed core fields', () => {
      const currentProduct = {
        id: 'product-1',
        seller_id: 'seller-1',
        name: 'Original Blender',
        price: 15000,
        category: 'Kitchen',
        description: 'Original description',
        images: ['https://example.com/original.jpg'],
      };

      const proposedSnapshot = {
        product_id: 'product-1',
        seller_id: 'seller-1',
        name: 'Original Blender Pro',
        price: 17000,
        category: 'Kitchen',
        description: 'Original description',
        images: ['https://example.com/updated.jpg'],
      };

      expect(getCoreFieldDiff(currentProduct, proposedSnapshot)).toEqual([
        'name',
        'price',
        'images',
      ]);
    });
  });
});
