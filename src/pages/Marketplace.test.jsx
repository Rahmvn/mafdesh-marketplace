import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Marketplace from './Marketplace';

const { mockProductRows, mockFrom, mockEnrichProducts } = vi.hoisted(() => {
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
    mockEnrichProducts: vi.fn(async (products) => products),
  };
});

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: mockFrom,
  },
}));

vi.mock('../components/AuthNavbarWrapper', () => ({
  default: ({ marketplaceLocationAction }) => (
    <div data-testid="navbar">
      {marketplaceLocationAction ? (
        <button
          type="button"
          aria-label={marketplaceLocationAction.label}
          disabled={marketplaceLocationAction.disabled}
          onClick={marketplaceLocationAction.onClick}
        >
          Campus filter
        </button>
      ) : null}
    </div>
  ),
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

vi.mock('../services/publicSellerService', () => ({
  enrichProductsWithPublicSellerData: mockEnrichProducts,
  isSellerMarketplaceActive: vi.fn(() => true),
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

function buildProduct({
  id,
  name,
  description,
  category = 'Fashion',
  universityId = '',
  universityName = '',
  universityState = '',
}) {
  return {
    id,
    name,
    description,
    category,
    stock_quantity: 8,
    price: 12000,
    original_price: 12000,
    images: [],
    seller: {
      display_name: `${name} Seller`,
      university_id: universityId,
      university_name: universityName,
      university_state: universityState,
    },
  };
}

function seedProducts(products) {
  mockProductRows.splice(0, mockProductRows.length, ...products);
}

async function openCampusDialog() {
  fireEvent.click(screen.getByRole('button', { name: /campus filter/i }));
  return screen.findByRole('dialog', { name: 'Campus filter' });
}

function selectCampusState(dialog, state) {
  fireEvent.change(within(dialog).getByLabelText(/state/i), {
    target: { value: state },
  });
}

function findCampusButtons(dialog, pattern) {
  return within(dialog)
    .getAllByRole('button')
    .filter((button) => pattern.test(button.textContent || ''));
}

describe('Marketplace seller-derived campus filters', () => {
  beforeEach(() => {
    seedProducts([
      buildProduct({
        id: 'product-unilag',
        name: 'UNILAG Hoodie',
        description: 'University of Lagos hoodie',
        universityId: 'uni-1',
        universityName: 'University of Lagos',
        universityState: 'Lagos',
      }),
      buildProduct({
        id: 'product-lasu',
        name: 'LASU Notebook',
        description: 'Lagos State University notebook',
        category: 'Books',
        universityId: 'uni-2',
        universityName: 'Lagos State University',
        universityState: 'Lagos',
      }),
      buildProduct({
        id: 'product-abu',
        name: 'ABU Lab Coat',
        description: 'Ahmadu Bello University lab coat',
        universityId: 'uni-3',
        universityName: 'Ahmadu Bello University',
        universityState: 'Kaduna',
      }),
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('defaults to All campuses and removes the nearby control', async () => {
    renderMarketplace();

    await screen.findByText('UNILAG Hoodie');

    expect(screen.getByRole('button', { name: /campus filter/i })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /nearby campuses/i })).not.toBeInTheDocument();
    expect(screen.getByText('LASU Notebook')).toBeInTheDocument();
    expect(screen.getByText('ABU Lab Coat')).toBeInTheDocument();

    const dialog = await openCampusDialog();
    expect(within(dialog).getByRole('button', { name: /university of lagos/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /lagos state university/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /ahmadu bello university/i })).toBeInTheDocument();
  });

  it('merges obvious seller campus variants into one option and filters all matching sellers', async () => {
    seedProducts([
      buildProduct({
        id: 'product-alhikma-1',
        name: 'Alhikma Backpack',
        description: 'Campus backpack',
        universityId: 'uni-a',
        universityName: 'Alhikma University',
        universityState: 'Kwara',
      }),
      buildProduct({
        id: 'product-alhikma-2',
        name: 'Alhikma Notebook',
        description: 'Campus notebook',
        category: 'Books',
        universityName: 'ALHIKMA',
        universityState: 'Kwara',
      }),
      buildProduct({
        id: 'product-alhikma-3',
        name: 'Alhikma Tee',
        description: 'Campus tee',
        universityId: 'uni-b',
        universityName: 'Alhikma University Kwara',
        universityState: 'Kwara',
      }),
      buildProduct({
        id: 'product-abu',
        name: 'ABU Lab Coat',
        description: 'Ahmadu Bello University lab coat',
        universityId: 'uni-3',
        universityName: 'Ahmadu Bello University',
        universityState: 'Kaduna',
      }),
    ]);

    renderMarketplace();

    await screen.findByText('Alhikma Backpack');
    const dialog = await openCampusDialog();

    fireEvent.change(within(dialog).getByLabelText('Search campuses'), {
      target: { value: 'alhikma' },
    });

    const alhikmaButtons = findCampusButtons(dialog, /alhikma/i);
    expect(alhikmaButtons).toHaveLength(1);

    fireEvent.click(alhikmaButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Alhikma Backpack')).toBeInTheDocument();
      expect(screen.getByText('Alhikma Notebook')).toBeInTheDocument();
      expect(screen.getByText('Alhikma Tee')).toBeInTheDocument();
      expect(screen.queryByText('ABU Lab Coat')).not.toBeInTheDocument();
    });
  });

  it('keeps same-name campuses in different states separate', async () => {
    seedProducts([
      buildProduct({
        id: 'product-alhikma-kwara',
        name: 'Alhikma Kwara Bag',
        description: 'Kwara campus bag',
        universityId: 'uni-a',
        universityName: 'Alhikma University',
        universityState: 'Kwara',
      }),
      buildProduct({
        id: 'product-alhikma-lagos',
        name: 'Alhikma Lagos Tee',
        description: 'Lagos campus tee',
        universityName: 'ALHIKMA',
        universityState: 'Lagos',
      }),
    ]);

    renderMarketplace();

    await screen.findByText('Alhikma Kwara Bag');
    const dialog = await openCampusDialog();

    fireEvent.change(within(dialog).getByLabelText('Search campuses'), {
      target: { value: 'alhikma' },
    });

    const alhikmaButtons = findCampusButtons(dialog, /alhikma/i);
    expect(alhikmaButtons).toHaveLength(2);

    fireEvent.click(alhikmaButtons.find((button) => /kwara/i.test(button.textContent || '')));

    await waitFor(() => {
      expect(screen.getByText('Alhikma Kwara Bag')).toBeInTheDocument();
      expect(screen.queryByText('Alhikma Lagos Tee')).not.toBeInTheDocument();
    });
  });

  it('merges missing-state sellers by cleaned campus name', async () => {
    seedProducts([
      buildProduct({
        id: 'product-alhikma-1',
        name: 'Alhikma Apron',
        description: 'Campus apron',
        universityName: 'Alhikma University',
      }),
      buildProduct({
        id: 'product-alhikma-2',
        name: 'Alhikma Folder',
        description: 'Campus folder',
        category: 'Books',
        universityName: 'ALHIKMA',
      }),
      buildProduct({
        id: 'product-abu',
        name: 'ABU Lab Coat',
        description: 'Ahmadu Bello University lab coat',
        universityId: 'uni-3',
        universityName: 'Ahmadu Bello University',
        universityState: 'Kaduna',
      }),
    ]);

    renderMarketplace();

    await screen.findByText('Alhikma Apron');
    const dialog = await openCampusDialog();

    fireEvent.change(within(dialog).getByLabelText('Search campuses'), {
      target: { value: 'alhikma' },
    });

    const alhikmaButtons = findCampusButtons(dialog, /alhikma/i);
    expect(alhikmaButtons).toHaveLength(1);

    fireEvent.click(alhikmaButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Alhikma Apron')).toBeInTheDocument();
      expect(screen.getByText('Alhikma Folder')).toBeInTheDocument();
      expect(screen.queryByText('ABU Lab Coat')).not.toBeInTheDocument();
    });
  });

  it('does not create campus options for sellers without a university name', async () => {
    seedProducts([
      buildProduct({
        id: 'product-plain-1',
        name: 'Campus Flask',
        description: 'Seller without campus name',
      }),
      buildProduct({
        id: 'product-plain-2',
        name: 'Campus Socks',
        description: 'Another seller without campus name',
        category: 'Books',
      }),
    ]);

    renderMarketplace();

    await screen.findByText('Campus Flask');

    expect(screen.getByText('Campus Socks')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /campus filter/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /nearby campuses/i })).not.toBeInTheDocument();
  });

  it('selecting a state narrows campus options but does not filter products until a campus is chosen', async () => {
    renderMarketplace();

    await screen.findByText('UNILAG Hoodie');
    const dialog = await openCampusDialog();

    selectCampusState(dialog, 'Lagos');

    expect(within(dialog).getByRole('button', { name: /university of lagos/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /lagos state university/i })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /ahmadu bello university/i })).not.toBeInTheDocument();

    expect(screen.getByText('UNILAG Hoodie')).toBeInTheDocument();
    expect(screen.getByText('LASU Notebook')).toBeInTheDocument();
    expect(screen.getByText('ABU Lab Coat')).toBeInTheDocument();
  });

  it('filters by campus after state narrowing and clears back to All campuses', async () => {
    renderMarketplace();

    await screen.findByText('UNILAG Hoodie');
    const dialog = await openCampusDialog();

    selectCampusState(dialog, 'Lagos');

    fireEvent.click(within(dialog).getByRole('button', { name: /university of lagos/i }));

    await waitFor(() => {
      expect(screen.getByText('UNILAG Hoodie')).toBeInTheDocument();
      expect(screen.queryByText('LASU Notebook')).not.toBeInTheDocument();
      expect(screen.queryByText('ABU Lab Coat')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /clear/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /campus filter/i })).toBeInTheDocument();
      expect(screen.getByText('UNILAG Hoodie')).toBeInTheDocument();
      expect(screen.getByText('LASU Notebook')).toBeInTheDocument();
      expect(screen.getByText('ABU Lab Coat')).toBeInTheDocument();
    });
  });

  it('closes the campus dialog without changing products when no campus is selected', async () => {
    renderMarketplace();

    await screen.findByText('UNILAG Hoodie');
    const dialog = await openCampusDialog();

    selectCampusState(dialog, 'Kaduna');
    fireEvent.change(within(dialog).getByLabelText('Search campuses'), {
      target: { value: 'ahmadu' },
    });

    fireEvent.click(within(dialog).getByRole('button', { name: /close campus filter/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Campus filter' })).not.toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /campus filter/i })).toBeInTheDocument();
    expect(screen.getByText('UNILAG Hoodie')).toBeInTheDocument();
    expect(screen.getByText('LASU Notebook')).toBeInTheDocument();
    expect(screen.getByText('ABU Lab Coat')).toBeInTheDocument();
  });
});
