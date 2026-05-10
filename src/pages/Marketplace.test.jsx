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

function seedDefaultProducts() {
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
}

function seedDefaultUniversities() {
  mockSearchUniversities.mockResolvedValue([
    { id: 'uni-3', name: 'Ahmadu Bello University', state: 'Kaduna', zone: 'North West' },
    { id: 'uni-2', name: 'Lagos State University', state: 'Lagos', zone: 'South West' },
    { id: 'uni-1', name: 'University of Lagos', state: 'Lagos', zone: 'South West' },
  ]);
}

async function openCampusDialog() {
  fireEvent.click(screen.getByRole('button', { name: /all campuses/i }));
  return screen.findByRole('dialog', { name: 'Campus filter' });
}

async function selectCampus(campusName, searchValue = '') {
  const campusDialog = await openCampusDialog();

  if (searchValue) {
    fireEvent.change(within(campusDialog).getByLabelText('Search campuses'), {
      target: { value: searchValue },
    });
  }

  fireEvent.click(within(campusDialog).getByRole('button', { name: new RegExp(campusName, 'i') }));
}

describe('Marketplace quick campus filters', () => {
  beforeEach(() => {
    seedDefaultProducts();
    seedDefaultUniversities();
    mockFetchNearbyUniversitiesByState.mockResolvedValue([
      { id: 'uni-2', name: 'Lagos State University', state: 'Lagos', zone: 'South West' },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('supports compact campus, nearby campuses, and clear filtering', async () => {
    renderMarketplace();

    await screen.findByText('UNILAG Hoodie');
    expect(screen.getByRole('button', { name: 'Nearby campuses' })).toBeDisabled();
    expect(screen.getByText('LASU Notebook')).toBeInTheDocument();
    expect(screen.getByText('ABU Lab Coat')).toBeInTheDocument();

    await selectCampus('University of Lagos', 'lagos');

    await waitFor(() => {
      expect(screen.getByText('UNILAG Hoodie')).toBeInTheDocument();
      expect(screen.queryByText('LASU Notebook')).not.toBeInTheDocument();
      expect(screen.queryByText('ABU Lab Coat')).not.toBeInTheDocument();
    });

    const nearbyButton = screen.getByRole('button', { name: 'Nearby campuses' });
    expect(nearbyButton).not.toBeDisabled();

    fireEvent.click(nearbyButton);

    await waitFor(() => {
      expect(mockFetchNearbyUniversitiesByState).toHaveBeenCalledWith('Lagos', {
        excludeId: 'uni-1',
      });
      expect(screen.getByText('LASU Notebook')).toBeInTheDocument();
      expect(screen.queryByText('ABU Lab Coat')).not.toBeInTheDocument();
      expect(screen.getByText('Showing 1 nearby campus with University of Lagos.')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    await waitFor(() => {
      expect(screen.getByText('UNILAG Hoodie')).toBeInTheDocument();
      expect(screen.getByText('LASU Notebook')).toBeInTheDocument();
      expect(screen.getByText('ABU Lab Coat')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /all campuses/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nearby campuses' })).toBeDisabled();
  });

  it('matches the selected campus by university name when seller university id is missing', async () => {
    mockProductRows.push({
      id: 'product-custom-unilag',
      name: 'Custom UNILAG Tee',
      description: 'Handmade campus tee',
      category: 'Fashion',
      stock_quantity: 4,
      price: 7000,
      original_price: 7000,
      images: [],
      seller: {
        display_name: 'Other Seller',
        university_id: '',
        university_name: 'University of Lagos',
        university_state: 'Lagos',
        is_verified: false,
      },
    });

    renderMarketplace();

    await screen.findByText('Custom UNILAG Tee');
    await selectCampus('University of Lagos', 'lagos');

    await waitFor(() => {
      expect(screen.getByText('UNILAG Hoodie')).toBeInTheDocument();
      expect(screen.getByText('Custom UNILAG Tee')).toBeInTheDocument();
      expect(screen.queryByText('LASU Notebook')).not.toBeInTheDocument();
      expect(screen.queryByText('ABU Lab Coat')).not.toBeInTheDocument();
    });
  });

  it('does not include same-state sellers without matching nearby campus ids when nearby campuses is active', async () => {
    mockProductRows.push({
      id: 'product-same-state-custom',
      name: 'Lagoon Drafting Set',
      description: 'Same-state custom seller with no catalog id',
      category: 'Books',
      stock_quantity: 3,
      price: 5100,
      original_price: 5100,
      images: [],
      seller: {
        display_name: 'Independent Seller',
        university_id: '',
        university_name: 'Made Up Lagos Campus',
        university_state: 'Lagos',
        is_verified: false,
      },
    });

    renderMarketplace();

    await screen.findByText('Lagoon Drafting Set');
    await selectCampus('University of Lagos', 'lagos');

    fireEvent.click(screen.getByRole('button', { name: 'Nearby campuses' }));

    await waitFor(() => {
      expect(screen.getByText('UNILAG Hoodie')).toBeInTheDocument();
      expect(screen.getByText('LASU Notebook')).toBeInTheDocument();
      expect(screen.queryByText('Lagoon Drafting Set')).not.toBeInTheDocument();
    });
  });

  it('falls back to the selected campus when nearby campuses fail to load', async () => {
    mockFetchNearbyUniversitiesByState.mockRejectedValueOnce(new Error('network down'));

    renderMarketplace();

    await screen.findByText('UNILAG Hoodie');
    await selectCampus('University of Lagos', 'lagos');

    fireEvent.click(screen.getByRole('button', { name: 'Nearby campuses' }));

    await waitFor(() => {
      expect(screen.getByText('UNILAG Hoodie')).toBeInTheDocument();
      expect(screen.queryByText('LASU Notebook')).not.toBeInTheDocument();
      expect(
        screen.getByText('Could not load nearby campuses. Showing only the selected campus.')
      ).toBeInTheDocument();
    });
  });

  it('shows a fallback message when no nearby campuses are available', async () => {
    mockFetchNearbyUniversitiesByState.mockResolvedValueOnce([]);

    renderMarketplace();

    await screen.findByText('UNILAG Hoodie');
    await selectCampus('University of Lagos', 'lagos');

    fireEvent.click(screen.getByRole('button', { name: 'Nearby campuses' }));

    await waitFor(() => {
      expect(screen.getByText('UNILAG Hoodie')).toBeInTheDocument();
      expect(screen.queryByText('LASU Notebook')).not.toBeInTheDocument();
      expect(
        screen.getByText('No nearby campuses found for this state. Showing only the selected campus.')
      ).toBeInTheDocument();
    });
  });

  it('disables nearby campuses when the selected campus has no state data', async () => {
    mockProductRows.push({
      id: 'product-mystery-campus',
      name: 'Mystery Campus Shirt',
      description: 'Campus shirt from a school without state data',
      category: 'Fashion',
      stock_quantity: 5,
      price: 6500,
      original_price: 6500,
      images: [],
      seller: {
        display_name: 'Mystery Seller',
        university_id: 'uni-4',
        university_name: 'Mystery Campus',
        university_state: '',
        is_verified: false,
      },
    });

    mockSearchUniversities.mockResolvedValueOnce([
      { id: 'uni-4', name: 'Mystery Campus', state: '', zone: '' },
      { id: 'uni-3', name: 'Ahmadu Bello University', state: 'Kaduna', zone: 'North West' },
      { id: 'uni-2', name: 'Lagos State University', state: 'Lagos', zone: 'South West' },
      { id: 'uni-1', name: 'University of Lagos', state: 'Lagos', zone: 'South West' },
    ]);

    renderMarketplace();

    await screen.findByText('Mystery Campus Shirt');
    await selectCampus('Mystery Campus', 'mystery');

    await waitFor(() => {
      expect(screen.getByText('Mystery Campus Shirt')).toBeInTheDocument();
      expect(screen.queryByText('UNILAG Hoodie')).not.toBeInTheDocument();
      expect(
        screen.getByText('Nearby campuses need a campus with state data.')
      ).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Nearby campuses' })).toBeDisabled();
    expect(mockFetchNearbyUniversitiesByState).not.toHaveBeenCalled();
  });

  it('disables campus selection when the university catalog is unavailable', async () => {
    mockSearchUniversities.mockRejectedValueOnce(new Error('catalog unavailable'));

    renderMarketplace();

    await screen.findByText('UNILAG Hoodie');

    await waitFor(() => {
      expect(
        screen.getByText('Campus filters are temporarily unavailable.')
      ).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /all campuses/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Nearby campuses' })).toBeDisabled();
  });
});
