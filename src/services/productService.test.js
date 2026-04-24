import { describe, expect, it } from 'vitest';
import { getProductArchiveActionMessage } from './productService';

describe('productService archive helpers', () => {
  it('maps admin archive failures to a seller-safe message', () => {
    expect(
      getProductArchiveActionMessage({
        message: 'This product was archived by admin and can only be restored by admin.',
      })
    ).toBe('This product was archived by admin and cannot be changed by the seller.');
  });

  it('maps active order archive failures to a clear message', () => {
    expect(
      getProductArchiveActionMessage({
        message: 'This product cannot be archived while it has active orders.',
      })
    ).toBe('This product cannot be archived while it has active orders.');
  });

  it('maps pending edit review failures to a clear message', () => {
    expect(
      getProductArchiveActionMessage({
        message: 'Resolve the pending product edit review before archiving this product.',
      })
    ).toBe('Resolve the pending product edit review before changing archive status.');
  });
});
