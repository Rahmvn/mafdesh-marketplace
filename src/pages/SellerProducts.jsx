import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive,
  CheckCircle2,
  Clock3,
  Edit,
  Package,
  Plus,
  RotateCcw,
  Search,
  Star,
  TrendingUp,
  Trash2,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { signOutAndClearAuthState } from '../services/authSessionService';
import { getSessionWithRetry } from '../utils/authResilience';
import { getProductArchiveActionMessage, productService } from '../services/productService';
import useModal from '../hooks/useModal';
import {
  formatSellerCurrency,
  getSellerThemeClasses,
  SellerEmptyState,
  SellerSection,
  SellerShell,
  SellerStatCard,
  useSellerTheme,
} from '../components/seller/SellerShell';
import { SellerWorkspaceSkeleton } from '../components/MarketplaceLoading';

function createEmptyProductInsight() {
  return {
    successfulUnitsSold: 0,
    completedOrders: 0,
    openOrders: 0,
    successfulRevenue: 0,
    lastCompletedSaleAt: null,
  };
}

function getProductInsight(product) {
  return product?.insight || createEmptyProductInsight();
}

function formatInsightDate(value) {
  if (!value) {
    return 'No completed sale yet';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'No completed sale yet';
  }

  return date.toLocaleDateString();
}

function getLifecycleMeta(product) {
  if (product.deleted_at && (product.deleted_by_admin_id || product.deletion_reason)) {
    return {
      key: 'ARCHIVED',
      label: 'Admin archived',
      className: 'bg-red-100 text-red-700',
      note: product.deletion_reason || 'This listing can only be restored by admin.',
    };
  }

  if (product.deleted_at) {
    return {
      key: 'ARCHIVED',
      label: 'Archived',
      className: 'bg-slate-200 text-slate-600',
      note: '',
    };
  }

  if (!product.is_approved && product.reapproval_reason) {
    return {
      key: 'PENDING_REVIEW',
      label: 'Pending Review',
      className: 'bg-orange-100 text-orange-700',
      note: 'Updated - awaiting re-approval',
    };
  }

  if (product.is_approved) {
    return {
      key: 'ACTIVE_STATUS',
      label: 'Active',
      className: 'bg-emerald-100 text-emerald-700',
      note: '',
    };
  }

  return {
    key: 'PENDING',
    label: 'Pending',
    className: 'bg-amber-100 text-amber-700',
    note: '',
  };
}

export default function SellerProducts() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [catalogFilter, setCatalogFilter] = useState('ALL');
  const themeState = useSellerTheme(
    currentUser?.is_verified_seller ?? currentUser?.is_verified ?? null
  );
  const theme = getSellerThemeClasses(themeState.darkMode);
  const { showConfirm, showError, showSuccess, ModalComponent } = useModal({
    darkMode: themeState.darkMode,
  });

  const handleLogout = async () => {
    showConfirm('Log Out', 'Are you sure you want to log out of your account?', async () => {
      await signOutAndClearAuthState();
      window.location.href = '/login';
    });
  };

  const loadProducts = useCallback(async (sellerId) => {
    try {
      setLoading(true);
      const [sellerProducts, productInsights] = await Promise.all([
        productService.getSellerProducts(sellerId),
        productService.getSellerProductInsights(sellerId).catch(() => ({})),
      ]);

      setProducts(
        (sellerProducts || []).map((product) => ({
          ...product,
          insight: productInsights?.[product.id] || createEmptyProductInsight(),
        }))
      );
    } catch (error) {
      console.error('Error loading products:', error);
      showError('Load Failed', 'Failed to load products.');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  const init = useCallback(async () => {
    const { data } = await getSessionWithRetry(supabase.auth);

    if (!data.session) {
      navigate('/login');
      return;
    }

    const user = data.session.user;
    const { data: userData, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error || !userData || userData.role !== 'seller') {
      navigate('/login');
      return;
    }

    setCurrentUser(userData);
    localStorage.setItem('mafdesh_user', JSON.stringify(userData));
    await loadProducts(userData.id);
  }, [loadProducts, navigate]);

  useEffect(() => {
    init();
  }, [init]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const quantity = Number(product.stock_quantity || 0);
      const lifecycle = getLifecycleMeta(product);
      const isArchived = lifecycle.key === 'ARCHIVED';
      const matchesStockFilter =
        catalogFilter === 'ALL' ||
        (catalogFilter === 'ACTIVE_STATUS' && lifecycle.key === 'ACTIVE_STATUS') ||
        (catalogFilter === 'PENDING_REVIEW' && lifecycle.key === 'PENDING_REVIEW') ||
        (catalogFilter === 'PENDING' && lifecycle.key === 'PENDING') ||
        (catalogFilter === 'IN_STOCK' && !isArchived && quantity > 0) ||
        (!isArchived && catalogFilter === 'LOW_STOCK' && quantity > 0 && quantity < 10) ||
        (!isArchived && catalogFilter === 'OUT_OF_STOCK' && quantity === 0) ||
        (catalogFilter === 'ARCHIVED' && isArchived);

      if (!matchesStockFilter) {
        return false;
      }

      if (!searchTerm) {
        return true;
      }

      const normalizedSearch = searchTerm.toLowerCase();
      return (
        product.name.toLowerCase().includes(normalizedSearch) ||
        (product.category || '').toLowerCase().includes(normalizedSearch)
      );
    });
  }, [catalogFilter, products, searchTerm]);

  const stats = useMemo(() => {
    const activeStatus = products.filter(
      (product) => getLifecycleMeta(product).key === 'ACTIVE_STATUS'
    ).length;
    const lowStock = products.filter((product) => {
      if (getLifecycleMeta(product).key === 'ARCHIVED') {
        return false;
      }

      const quantity = Number(product.stock_quantity || 0);
      return quantity > 0 && quantity < 10;
    }).length;
    const outOfStock = products.filter(
      (product) => !product.deleted_at && Number(product.stock_quantity || 0) === 0
    ).length;
    const successfulSales = products.reduce(
      (total, product) => total + getProductInsight(product).successfulUnitsSold,
      0
    );

    return {
      total: products.length,
      activeStatus,
      successfulSales,
      lowStock,
      outOfStock,
    };
  }, [products]);

  const handleArchive = async (productId) => {
    const product = products.find((item) => item.id === productId);

    if (product?.deleted_by_admin_id || product?.deletion_reason) {
      showError(
        'Archive Locked',
        'This product was archived by admin and cannot be changed by the seller.'
      );
      return;
    }

    showConfirm(
      'Archive Product',
      'Are you sure you want to archive this product? It will be hidden from buyers but your order history will be preserved.',
      async () => {
        try {
          await productService.archiveProduct(productId);
          await loadProducts(currentUser.id);
          showSuccess('Product Archived', 'This product is now hidden from buyers.');
        } catch (error) {
          console.error('Error archiving product:', error);
          showError('Archive Failed', getProductArchiveActionMessage(error));
        }
      }
    );
  };

  const handleUnarchive = async (productId) => {
    const product = products.find((item) => item.id === productId);

    if (product?.deleted_by_admin_id || product?.deletion_reason) {
      showError(
        'Restore Locked',
        'This product was archived by admin and can only be restored by admin.'
      );
      return;
    }

    try {
      await productService.unarchiveProduct(productId);
      await loadProducts(currentUser.id);
      showSuccess('Product Unarchived', 'This product is visible in your live catalog again.');
    } catch (error) {
      console.error('Error unarchiving product:', error);
      showError('Unarchive Failed', getProductArchiveActionMessage(error));
    }
  };

  const catalogFilters = [
    { value: 'ALL', label: 'All' },
    { value: 'ACTIVE_STATUS', label: 'Active' },
    { value: 'PENDING_REVIEW', label: 'Pending review' },
    { value: 'PENDING', label: 'Pending' },
    { value: 'IN_STOCK', label: 'In stock' },
    { value: 'LOW_STOCK', label: 'Low stock' },
    { value: 'OUT_OF_STOCK', label: 'Out of stock' },
    { value: 'ARCHIVED', label: 'Archived' },
  ];

  const getInventoryLabel = (quantity) => {
    const normalizedQuantity = Number(quantity || 0);

    if (normalizedQuantity === 0) {
      return { label: 'Out of stock', className: 'bg-slate-200 text-slate-700' };
    }

    if (normalizedQuantity < 10) {
      return { label: 'Low stock', className: 'bg-orange-100 text-orange-700' };
    }

    return { label: 'In stock', className: 'bg-emerald-100 text-emerald-700' };
  };

  if (loading) {
    return <SellerWorkspaceSkeleton darkMode={themeState.darkMode} mode="products" />;
  }

  return (
    <SellerShell
      currentUser={currentUser}
      onLogout={handleLogout}
      themeState={themeState}
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SellerStatCard
          theme={theme}
          label="All listings"
          value={stats.total}
          icon={Package}
          accentClass="bg-gradient-to-br from-blue-900 to-slate-700"
        />
        <SellerStatCard
          theme={theme}
          label="Active"
          value={stats.activeStatus}
          icon={CheckCircle2}
          accentClass="bg-gradient-to-br from-orange-500 to-orange-600"
        />
        <SellerStatCard
          theme={theme}
          label="Successful sales"
          value={stats.successfulSales}
          icon={TrendingUp}
          accentClass="bg-gradient-to-br from-emerald-500 to-green-600"
        />
        <SellerStatCard
          theme={theme}
          label="Low stock"
          value={stats.lowStock}
          icon={Clock3}
          accentClass="bg-gradient-to-br from-amber-500 to-orange-500"
        />
        <SellerStatCard
          theme={theme}
          label="Out of stock"
          value={stats.outOfStock}
          icon={Trash2}
          accentClass="bg-gradient-to-br from-slate-600 to-slate-700"
        />
      </section>

      <SellerSection
        theme={theme}
        eyebrow="Catalog"
        title="Your catalog"
        action={
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-80">
              <Search className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${theme.softText}`} />
              <input
                type="text"
                placeholder="Search by product name or category"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className={`w-full rounded-lg py-3 pl-10 pr-4 text-sm ${theme.input}`}
              />
            </div>
            <button
              type="button"
              onClick={() => navigate('/seller/products/new')}
              className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition ${theme.actionPrimary}`}
            >
              <Plus className="h-4 w-4" />
              Add Product
            </button>
          </div>
        }
      >
        <div className="mb-5 flex flex-wrap gap-2">
          {catalogFilters.map((filter) => {
            const active = catalogFilter === filter.value;

            return (
              <button
                key={filter.value}
                type="button"
                onClick={() => setCatalogFilter(filter.value)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  active ? theme.actionPrimary : theme.action
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        {filteredProducts.length === 0 ? (
          <SellerEmptyState
            theme={theme}
            icon={Package}
            title={searchTerm ? 'No matching products' : 'No products yet'}
            body={
              searchTerm
                ? 'Try another search term.'
                : undefined
            }
            action={
              !searchTerm ? (
                <button
                  type="button"
                  onClick={() => navigate('/seller/products/new')}
                  className={`inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition ${theme.actionPrimary}`}
                >
                  <Plus className="h-4 w-4" />
                  Add your first product
                </button>
              ) : null
            }
          />
        ) : (
          <>
            <div className="space-y-4 md:hidden">
              {filteredProducts.map((product) => {
                const lifecycle = getLifecycleMeta(product);
                const insight = getProductInsight(product);
                const adminArchived = Boolean(
                  product.deleted_at && (product.deleted_by_admin_id || product.deletion_reason)
                );

                return (
                  <article key={product.id} className={`rounded-lg p-4 ${theme.panelMuted}`}>
                    <div className="flex gap-4">
                      <img
                        src={
                          product.images?.[0] && !product.images[0].startsWith('blob:')
                            ? product.images[0]
                            : 'https://placehold.co/600x600'
                        }
                        alt={product.name}
                        className="h-20 w-20 rounded-md object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{product.name}</p>
                          <span
                            className={`rounded-md px-2 py-1 text-xs font-semibold ${getInventoryLabel(product.stock_quantity).className}`}
                          >
                            {getInventoryLabel(product.stock_quantity).label}
                          </span>
                          <span
                            className={`rounded-md px-2 py-1 text-xs font-semibold ${lifecycle.className}`}
                          >
                            {lifecycle.label}
                          </span>
                        </div>
                        {lifecycle.note && (
                          <p className={`mt-2 text-xs ${theme.softText}`}>{lifecycle.note}</p>
                        )}
                        <p className={`mt-1 text-sm ${theme.mutedText}`}>
                          {product.category || 'Uncategorized'}
                        </p>
                        <p className="mt-3 text-lg font-bold text-orange-500">
                          {formatSellerCurrency(product.price)}
                        </p>
                        <p className={`mt-1 text-sm ${theme.mutedText}`}>
                          Stock: {product.stock_quantity}
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div className={`rounded-md px-3 py-2 ${theme.panel}`}>
                            <p className={theme.softText}>Sold</p>
                            <p className="mt-1 font-semibold">Sold {insight.successfulUnitsSold} units</p>
                          </div>
                          <div className={`rounded-md px-3 py-2 ${theme.panel}`}>
                            <p className={theme.softText}>Completed orders</p>
                            <p className="mt-1 font-semibold">{insight.completedOrders}</p>
                          </div>
                          <div className={`rounded-md px-3 py-2 ${theme.panel}`}>
                            <p className={theme.softText}>Successful revenue</p>
                            <p className="mt-1 font-semibold">
                              {formatSellerCurrency(insight.successfulRevenue)}
                            </p>
                          </div>
                          <div className={`rounded-md px-3 py-2 ${theme.panel}`}>
                            <p className={theme.softText}>Open orders</p>
                            <p className="mt-1 font-semibold">{insight.openOrders}</p>
                          </div>
                        </div>
                        <p className={`mt-3 text-xs ${theme.softText}`}>
                          Last completed sale: {formatInsightDate(insight.lastCompletedSaleAt)}
                        </p>
                      </div>
                    </div>

                    <div className={`mt-4 flex items-center justify-end gap-2 border-t pt-4 ${theme.divider}`}>
                      <button
                        type="button"
                        onClick={() => navigate(`/seller/products/${product.id}/reviews`)}
                        className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${theme.action}`}
                      >
                        <Star className="mr-2 inline h-4 w-4 text-yellow-500" />
                        Reviews
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(`/seller/products/${product.id}/edit`)}
                        className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${theme.action}`}
                      >
                        <Edit className="mr-2 inline h-4 w-4" />
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={adminArchived}
                        title={
                          adminArchived
                            ? 'This product was archived by admin and can only be restored by admin.'
                            : undefined
                        }
                        onClick={() =>
                          product.deleted_at
                            ? handleUnarchive(product.id)
                            : handleArchive(product.id)
                        }
                        className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${theme.action} disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        {product.deleted_at ? (
                          <RotateCcw className="mr-2 inline h-4 w-4 text-slate-500" />
                        ) : (
                          <Archive className="mr-2 inline h-4 w-4 text-orange-500" />
                        )}
                        {adminArchived ? 'Locked' : product.deleted_at ? 'Unarchive' : 'Archive'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className={`hidden overflow-hidden rounded-lg md:block ${theme.panelMuted}`}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px]">
                  <thead className={theme.tableHeader}>
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Product</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Category</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Price</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Stock</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Performance</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Updated</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((product) => {
                      const lifecycle = getLifecycleMeta(product);
                      const insight = getProductInsight(product);
                      const adminArchived = Boolean(
                        product.deleted_at && (product.deleted_by_admin_id || product.deletion_reason)
                      );

                      return (
                        <tr key={product.id} className={`border-t transition ${theme.divider} ${theme.rowHover}`}>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={
                                product.images?.[0] && !product.images[0].startsWith('blob:')
                                  ? product.images[0]
                                  : 'https://placehold.co/600x600'
                              }
                              alt={product.name}
                              className="h-14 w-14 rounded-md object-cover"
                            />
                            <div>
                              <p className="font-semibold">{product.name}</p>
                              <p className={`text-xs ${theme.softText}`}>ID: {product.id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm">{product.category || 'Uncategorized'}</td>
                        <td className="px-4 py-4 text-sm font-semibold text-orange-500">
                          {formatSellerCurrency(product.price)}
                        </td>
                        <td className="px-4 py-4 text-sm">
                          <div className="flex items-center gap-2">
                            <span>{product.stock_quantity}</span>
                            <span
                              className={`rounded-md px-2 py-1 text-xs font-semibold ${getInventoryLabel(product.stock_quantity).className}`}
                            >
                              {getInventoryLabel(product.stock_quantity).label}
                            </span>
                            <span
                              className={`rounded-md px-2 py-1 text-xs font-semibold ${lifecycle.className}`}
                            >
                              {lifecycle.label}
                            </span>
                          </div>
                          {lifecycle.note && (
                            <p className={`mt-2 text-xs ${theme.softText}`}>{lifecycle.note}</p>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm">
                          <p className="font-semibold">Sold {insight.successfulUnitsSold} units</p>
                          <p className={`mt-1 ${theme.mutedText}`}>
                            Completed orders: {insight.completedOrders}
                          </p>
                          <p className={`mt-1 ${theme.mutedText}`}>
                            Revenue: {formatSellerCurrency(insight.successfulRevenue)}
                          </p>
                          <p className={`mt-1 ${theme.softText}`}>
                            Open orders: {insight.openOrders}
                          </p>
                        </td>
                        <td className={`px-4 py-4 text-sm ${theme.mutedText}`}>
                          <p>
                            {product.updated_at
                              ? new Date(product.updated_at).toLocaleDateString()
                              : 'Recently'}
                          </p>
                          <p className={`mt-1 text-xs ${theme.softText}`}>
                            Last completed sale: {formatInsightDate(insight.lastCompletedSaleAt)}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => navigate(`/seller/products/${product.id}/reviews`)}
                              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${theme.action}`}
                            >
                              <Star className="mr-2 inline h-4 w-4 text-yellow-500" />
                              Reviews
                            </button>
                            <button
                              type="button"
                              onClick={() => navigate(`/seller/products/${product.id}/edit`)}
                              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${theme.action}`}
                            >
                              <Edit className="mr-2 inline h-4 w-4" />
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={adminArchived}
                              title={
                                adminArchived
                                  ? 'This product was archived by admin and can only be restored by admin.'
                                  : undefined
                              }
                              onClick={() =>
                                product.deleted_at
                                  ? handleUnarchive(product.id)
                                  : handleArchive(product.id)
                              }
                              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${theme.action} disabled:cursor-not-allowed disabled:opacity-60`}
                            >
                              {product.deleted_at ? (
                                <RotateCcw className="mr-2 inline h-4 w-4 text-slate-500" />
                              ) : (
                                <Archive className="mr-2 inline h-4 w-4 text-orange-500" />
                              )}
                              {adminArchived ? 'Locked' : product.deleted_at ? 'Unarchive' : 'Archive'}
                            </button>
                          </div>
                        </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <p className={`mt-4 text-sm ${theme.mutedText}`}>
              Showing {filteredProducts.length} of {products.length} product
              {products.length === 1 ? '' : 's'}.
            </p>
          </>
        )}
      </SellerSection>
      <ModalComponent />
    </SellerShell>
  );
}
