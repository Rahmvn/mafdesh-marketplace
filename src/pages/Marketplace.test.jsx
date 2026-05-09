import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Marketplace from './Marketplace';

const {
  mockProductRows,
  mockFrom,
  mockSearchUniversities,
  mockFetchNearbyUniversitiesByState,
  mockEnrichProducts,
} = vi.hoisted(() => {
  const mockProductRows = [];
  const queryBuilder = {
    select: vi.fn(() => queryBuilder),
    eq: vi.fn(() => queryBuilder),
    gt: vi.fn(() => queryBuilder),
    is: vi.fn(() => queryBuilder),
    order: vi.fn(async () => ({ data: mockProductRows, error: null })),
  };

  return {
    mockProductRows,
    mockFrom: vi.fn(() => queryBuilder),
    mockSearchUniversities: vi.fn(),
    mockFetchNearbyUniversitiesByState: vi.fn(),
    mockEnrichProducts: vi.fn(async (products) => products),
  };
});

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: mockFrom,
  },
}));

vi.mock('../components/AuthNavbarWrapper', () => ({
  default: () => <div data-testid="navbar" />,
}));

vi.mock('../components/Footer', () => ({
  default: () => <div data-testid="footer" />,
}));

vi.mock('../components/FlashSaleStrip', () => ({
  default: () => null,
}));

vi.mock('../components/SafeImage', () => ({
  default: () => <div data-testid="safe-image" />,
}));

vi.mock('../components/VerificationBadge', () => ({
  default: () => <div data-testid="verification-badge" />,
}));

vi.mock('../services/publicSellerService', () => ({
  enrichProductsWithPublicSellerData: mockEnrichProducts,
  getPublicSellerCampusLabel: vi.fn((seller) =>
    [seller?.university_name, seller?.university_state].filter(Boolean).join(', ')
  ),
  getPublicSellerDisplayName: vi.fn((seller) => seller?.display_name || 'Seller'),
  isSellerMarketplaceActive: vi.fn(() => true),
}));

vi.mock('../services/universityService', () => ({
  searchUniversities: mockSearchUniversities,
  fetchNearbyUniversitiesByState: mockFetchNearbyUniversitiesByState,
}));

vi.mock('../utils/flashSale', () => ({
  excludeActiveFlashSaleProducts: vi.fn((products) => products),
  getActiveFlashSaleProducts: vi.fn(() => []),
  getNearestFlashSaleExpiry: vi.fn(() => null),
}));

function renderMarketplace() {
  return render(
    <MemoryRouter>
      <Marketplace />
    </MemoryRouter>
  );
}

describe('Marketplace quick campus filters', () => {
  beforeEach(() => {
    mockProductRows.splice(
      0,
      mockProductRows.length,
      {
        id: 'product-unilag',
        name: 'UNILAG Hoodie',
        description: 'University of Lagos hoodie',
        category: 'Fashion',
        stock_quantity: 8,
        price: 12000,
        original_price: 12000,
        images: [],
        seller: {
          display_name: 'Campus Hub',
          university_id: 'uni-1',
          university_name: 'University of Lagos',
          university_state: 'Lagos',
          is_verified: true,
        },
      },
      {
        id: 'product-lasu',
        name: 'LASU Notebook',
        description: 'Lagos State University notebook',
        category: 'Books',
        stock_quantity: 10,
        price: 4500,
        original_price: 4500,
        images: [],
        seller: {
          display_name: 'Study Spot',
          university_id: 'uni-2',
          university_name: 'Lagos State University',
          university_state: 'Lagos',
          is_verified: false,
        },
      },
      {
        id: 'product-abu',
        name: 'ABU Lab Coat',
        description: 'Ahmadu Bello University lab coat',
        category: 'Fashion',
        stock_quantity: 6,
        price: 9000,
        original_price: 9000,
        images: [],
        seller: {
          display_name: 'North Campus',
          university_id: 'uni-3',
          university_name: 'Ahmadu Bello University',
          university_state: 'Kaduna',
          is_verified: false,
        },
      }
    );

    mockSearchUniversities.mockResolvedValue([
      { id: 'uni-3', name: 'Ahmadu Bello University', state: 'Kaduna', zone: 'North West' },
      { id: 'uni-2', name: 'Lagos State University', state: 'Lagos', zone: 'South West' },
      { id: 'uni-1', name: 'University of Lagos', state: 'Lagos', zone: 'South West' },
    ]);

    mockFetchNearbyUniversitiesByState.mockResolvedValue([
      { id: 'uni-2', name: 'Lagos State University', state: 'Lagos', zone: 'South West' },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('supports compact campus, nearby, and clear filtering', async () => {
    renderMarketplace();

    await screen.findByText('UNILAG Hoodie');
    expect(screen.getByRole('button', { name: 'Nearby' })).toBeDisabled();
    expect(screen.getByText('LASU Notebook')).toBeInTheDocument();
    expect(screen.getByText('ABU Lab Coat')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /all campuses/i }));

    const campusDialog = await screen.findByRole('dialog', { name: 'Campus filter' });
    const campusSearch = within(campusDialog).getByLabelText('Search campuses');
    fireEvent.change(campusSearch, { target: { value: 'lagos' } });

    fireEvent.click(within(campusDialog).getByRole('button', { name: /university of lagos/i }));

    await waitFor(() => {
      expect(screen.getByText('UNILAG Hoodie')).toBeInTheDocument();
      expect(screen.queryByText('LASU Notebook')).not.toBeInTheDocument();
      expect(screen.queryByText('ABU Lab Coat')).not.toBeInTheDocument();
    });

    const nearbyButton = screen.getByRole('button', { name: 'Nearby' });
    expect(nearbyButton).not.toBeDisabled();

    fireEvent.click(nearbyButton);

    await waitFor(() => {
      expect(mockFetchNearbyUniversitiesByState).toHaveBeenCalledWith('Lagos', {
        excludeId: 'uni-1',
      });
      expect(screen.getByText('LASU Notebook')).toBeInTheDocument();
      expect(screen.queryByText('ABU Lab Coat')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    await waitFor(() => {
      expect(screen.getByText('UNILAG Hoodie')).toBeInTheDocument();
      expect(screen.getByText('LASU Notebook')).toBeInTheDocument();
      expect(screen.getByText('ABU Lab Coat')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /all campuses/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nearby' })).toBeDisabled();
  });
});
