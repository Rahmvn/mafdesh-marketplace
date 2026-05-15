import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BuyerOrderDetails from './BuyerOrderDetails';

const {
  mockData,
  mockNavigate,
  mockPickRecommendations,
  mockScoreRecommendationProducts,
} = vi.hoisted(() => ({
  mockData: {
    order: null,
    items: [],
    reviews: [],
    recommendationProducts: [],
    refundRequests: [],
    adminHolds: [],
  },
  mockNavigate: vi.fn(),
  mockPickRecommendations: vi.fn(() => []),
  mockScoreRecommendationProducts: vi.fn((products) => products),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');

  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../supabaseClient', () => {
  const createProductsQuery = () => {
    const result = { data: mockData.recommendationProducts, error: null };
    const builder = {
      select: vi.fn(() => builder),
      in: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      gt: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      is: vi.fn(() => builder),
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    };

    return builder;
  };

  const mockChannel = {
    on: vi.fn(function on() {
      return this;
    }),
    subscribe: vi.fn(function subscribe() {
      return this;
    }),
  };

  return {
    supabase: {
      auth: {},
      from: vi.fn((table) => {
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: mockData.order, error: null }),
              }),
            }),
          };
        }

        if (table === 'order_items') {
          return {
            select: () => ({
              eq: async () => ({ data: mockData.items, error: null }),
            }),
          };
        }

        if (table === 'reviews') {
          return {
            select: () => ({
              eq: () => ({
                in: async () => ({ data: mockData.reviews, error: null }),
              }),
            }),
            insert: async () => ({ error: null }),
          };
        }

        if (table === 'products') {
          return createProductsQuery();
        }

        if (table === 'users') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: 'buyer-1',
                    university_id: 'uni-1',
                    university_name: 'Mafdesh University',
                    university_state: 'Lagos',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
      channel: vi.fn(() => mockChannel),
      removeChannel: vi.fn(),
    },
  };
});

vi.mock('../components/Navbar', () => ({
  default: () => <div data-testid="navbar" />,
}));

vi.mock('../components/FooterSlim', () => ({
  default: () => <div data-testid="footer" />,
}));

vi.mock('../components/MarketplaceLoading', () => ({
  MarketplaceDetailSkeleton: () => <div>Loading order...</div>,
}));

vi.mock('../components/DisputeThread', () => ({
  default: () => <div data-testid="dispute-thread" />,
}));

vi.mock('../components/AdminActionModal', () => ({
  default: () => null,
}));

vi.mock('../hooks/modalService', () => ({
  showGlobalConfirm: vi.fn(),
  showGlobalError: vi.fn(),
  showGlobalSuccess: vi.fn(),
  showGlobalWarning: vi.fn(),
}));

vi.mock('../hooks/useModal', () => ({
  default: () => ({
    showConfirm: vi.fn(),
    showError: vi.fn(),
    showSuccess: vi.fn(),
    showWarning: vi.fn(),
    ModalComponent: () => null,
  }),
}));

vi.mock('../utils/productSnapshots', () => ({
  getSafeProductImage: vi.fn(() => '/placeholder.png'),
  snapshotToProduct: vi.fn((snapshot, product) => product || snapshot || null),
}));

vi.mock('../services/refundRequestService', () => ({
  cancelRefundRequest: vi.fn(),
  createRefundRequest: vi.fn(),
  fetchOrderRefundRequests: vi.fn(async () => mockData.refundRequests),
  formatTimeUntil: vi.fn(() => '2 days left'),
  getLatestRefundRequest: vi.fn(() => null),
  getPendingRefundRequest: vi.fn(() => null),
  getRefundEligibility: vi.fn(() => ({ eligible: false })),
  getRefundReviewDeadline: vi.fn(() => null),
  REFUND_REQUEST_STATUS: {
    REJECTED: 'rejected',
  },
}));

vi.mock('../services/buyerOrderTransitionService', () => ({
  confirmBuyerOrderDelivery: vi.fn(),
  confirmBuyerOrderPickup: vi.fn(),
}));

vi.mock('../services/disputeService', () => ({
  openBuyerDispute: vi.fn(),
  uploadDisputeEvidence: vi.fn(async () => []),
  validateDisputeEvidenceFiles: vi.fn(() => ''),
}));

vi.mock('../services/orderAdminHoldService', () => ({
  fetchOrderAdminHolds: vi.fn(async () => mockData.adminHolds),
  getActiveOrderAdminHold: vi.fn(() => null),
  getOrderAdminHoldDescription: vi.fn(() => ''),
  getOrderAdminHoldTitle: vi.fn(() => ''),
}));

vi.mock('../utils/orderAmounts', () => ({
  getBuyerOrderAmounts: vi.fn(() => ({
    subtotal: 10000,
    deliveryFee: 2000,
    total: 12000,
  })),
}));

vi.mock('../utils/flashSale', () => ({
  getProductPricing: vi.fn((product) => ({
    displayPrice: Number(product?.price || 0),
    originalPrice: Number(product?.original_price || product?.price || 0),
  })),
}));

vi.mock('../services/publicSellerService', () => ({
  enrichProductsWithPublicSellerData: vi.fn(async (products) => products),
  fetchPublicSellerDirectory: vi.fn(async () => ({
    'seller-1': {
      id: 'seller-1',
      university_id: 'uni-1',
      university_name: 'Mafdesh University',
      university_state: 'Lagos',
    },
  })),
  isSellerMarketplaceActive: vi.fn(() => true),
}));

vi.mock('../services/orderDeadlineService', () => ({
  useOrderDeadlineAutoProcessing: vi.fn(),
}));

vi.mock('../utils/cartRecommendations', () => ({
  pickCartRecommendationProducts: mockPickRecommendations,
}));

vi.mock('../utils/recommendationScoring', () => ({
  scoreRecommendationProducts: mockScoreRecommendationProducts,
}));

vi.mock('../utils/timeUtils', () => ({
  formatBusinessDeadline: vi.fn(() => '1 day left'),
  formatLagosDeadline: vi.fn(() => 'Tomorrow'),
  formatRemaining: vi.fn(() => '3 days left'),
  getBusinessUrgencyClass: vi.fn(() => 'text-orange-600'),
  getUrgencyClass: vi.fn(() => 'text-orange-600'),
}));

vi.mock('../utils/accountValidation', () => ({
  DISPUTE_MESSAGE_MAX_LENGTH: 500,
  REVIEW_COMMENT_MAX_LENGTH: 500,
  normalizeMultilineText: vi.fn((value) => value),
  validateDisputeMessage: vi.fn(() => ''),
  validateReviewComment: vi.fn(() => ''),
}));

function buildOrder(overrides = {}) {
  return {
    id: 'order-1',
    order_number: 'ORD-1001',
    status: 'PAID_ESCROW',
    buyer_id: 'buyer-1',
    seller_id: 'seller-1',
    product_id: 'product-1',
    quantity: 1,
    product_price: 10000,
    delivery_type: 'delivery',
    delivery_state: 'Lagos',
    delivery_address: '12 Campus Road',
    delivery_address_snapshot: { flat_fee: 2000 },
    pickup_location_snapshot: null,
    selected_pickup_location: '',
    ship_deadline: '2099-01-02T00:00:00.000Z',
    auto_cancel_at: '2099-01-03T00:00:00.000Z',
    dispute_deadline: '2099-01-05T00:00:00.000Z',
    auto_complete_at: '2099-01-06T00:00:00.000Z',
    ...overrides,
  };
}

function buildItem(overrides = {}) {
  return {
    quantity: 1,
    price_at_time: 10000,
    product_snapshot: null,
    product: {
      id: 'product-1',
      name: 'Campus Desk Lamp',
      images: [],
      category: 'Electronics',
      description: 'Bright study lamp',
      seller_id: 'seller-1',
      price: 10000,
      original_price: 12000,
      ...overrides,
    },
  };
}

function renderBuyerOrderDetails() {
  return render(
    <MemoryRouter initialEntries={['/buyer/orders/order-1']}>
      <Routes>
        <Route path="/buyer/orders/:id" element={<BuyerOrderDetails />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('BuyerOrderDetails', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockPickRecommendations.mockReset();
    mockScoreRecommendationProducts.mockReset();
    mockData.order = buildOrder();
    mockData.items = [buildItem()];
    mockData.reviews = [];
    mockData.recommendationProducts = [];
    mockData.refundRequests = [];
    mockData.adminHolds = [];
    mockPickRecommendations.mockImplementation(() => []);
    mockScoreRecommendationProducts.mockImplementation((products) => products);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('hides the seller card and removes repeated seller deadline copy for buyers', async () => {
    renderBuyerOrderDetails();

    await screen.findByText('Campus Desk Lamp');

    expect(screen.queryByRole('heading', { name: 'Seller' })).not.toBeInTheDocument();
    expect(screen.queryByText(/seller has 2 business days to ship/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/seller has until/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/seller is preparing your order\./i).length).toBeGreaterThan(0);
  });

  it('keeps pickup guidance but removes duplicate pickup deadline boxes from the buyer view', async () => {
    mockData.order = buildOrder({
      status: 'READY_FOR_PICKUP',
      delivery_type: 'pickup',
      delivery_address_snapshot: null,
      pickup_location_snapshot: {
        label: 'Main Gate',
        address_text: '1 University Way',
      },
      selected_pickup_location: 'Main Gate',
    });

    renderBuyerOrderDetails();

    await screen.findByText('Campus Desk Lamp');

    expect(screen.getByText(/campus meet-up point/i)).toBeInTheDocument();
    expect(screen.getByText(/meet your seller at:/i)).toBeInTheDocument();
    expect(screen.getByText('Mafdesh University - Main Gate')).toBeInTheDocument();
    expect(screen.getByText('Pickup spot: Main Gate')).toBeInTheDocument();
    expect(screen.getByText(/inspect before confirming/i)).toBeInTheDocument();
    expect(screen.queryByText(/pickup deadline:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/contact them for arrangement/i)).not.toBeInTheDocument();
  });

  it('shows campus delivery wording when buyer and seller share the same university', async () => {
    renderBuyerOrderDetails();

    expect(await screen.findByText('Campus delivery (doorstep)')).toBeInTheDocument();
  });

  it('renders similar products after the buyer action area', async () => {
    mockData.order = buildOrder({
      status: 'DELIVERED',
    });

    renderBuyerOrderDetails();

    const confirmButton = await screen.findByRole('button', { name: /confirm delivery/i });
    const similarHeading = screen.getByRole('heading', { name: /similar products you may like/i });

    expect(screen.queryByText(/within the dispute window/i)).not.toBeInTheDocument();
    expect(confirmButton.compareDocumentPosition(similarHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders standardized recommendation cards with rating details', async () => {
    mockData.recommendationProducts = [
      {
        id: 'product-2',
        name: 'Wireless Keyboard',
        images: [],
        category: 'Electronics',
        description: 'Quiet typing',
        seller_id: 'seller-2',
        price: 14000,
        original_price: 16000,
        stock_quantity: 3,
        seller: {
          average_rating: 4.2,
          is_verified: true,
        },
      },
    ];
    mockPickRecommendations.mockImplementation((products) => products);

    renderBuyerOrderDetails();

    expect(await screen.findByText('Wireless Keyboard')).toBeInTheDocument();
    expect(screen.getByLabelText('Seller rating 4.2 out of 5')).toBeInTheDocument();
    expect(screen.getByText('Only 3 left')).toBeInTheDocument();
  });
});
