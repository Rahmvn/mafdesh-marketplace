import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Package,
  Plus,
  Shield,
  Sparkles,
  Store,
  Truck,
  Wallet,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { signOutAndClearAuthState } from '../services/authSessionService';
import { getSessionWithRetry } from '../utils/authResilience';
import { productService } from '../services/productService';
import { getOrderDisplayDetails, getOrderItemsMap } from '../utils/orderItems';
import { showGlobalConfirm } from '../hooks/modalService';
import {
  getSellerThemeClasses,
  SellerEmptyState,
  SellerSection,
  SellerShell,
  SellerStatCard,
  useSellerTheme,
} from '../components/seller/SellerShell';
import { SellerWorkspaceSkeleton } from '../components/MarketplaceLoading';
import Footer from '../components/Footer';

function statusTone(status, darkMode) {
  switch (status) {
    case 'PAID_ESCROW':
      return darkMode
        ? 'bg-orange-500/15 text-orange-200'
        : 'bg-orange-100 text-orange-700';
    case 'SHIPPED':
    case 'READY_FOR_PICKUP':
    case 'DELIVERED':
      return darkMode
        ? 'bg-sky-500/15 text-sky-200'
        : 'bg-sky-100 text-sky-700';
    case 'COMPLETED':
      return darkMode
        ? 'bg-emerald-500/15 text-emerald-200'
        : 'bg-emerald-100 text-emerald-700';
    default:
      return darkMode
        ? 'bg-slate-800 text-slate-300'
        : 'bg-slate-100 text-slate-600';
  }
}

function getPriorityVisuals(tone, darkMode) {
  if (tone === 'alert') {
    return darkMode
      ? {
          panel: 'border border-orange-500/25 bg-orange-500/10',
          rail: 'bg-orange-400',
          iconWrap: 'bg-orange-500/15 text-orange-200',
          badge: 'border border-orange-500/30 bg-orange-500/15 text-orange-200',
          dot: 'bg-orange-300',
        }
      : {
          panel: 'border border-orange-200 bg-orange-50/80',
          rail: 'bg-orange-500',
          iconWrap: 'bg-orange-100 text-orange-700',
          badge: 'border border-orange-200 bg-white text-orange-700',
          dot: 'bg-orange-500',
        };
  }

  if (tone === 'warning') {
    return darkMode
      ? {
          panel: 'border border-amber-500/20 bg-amber-500/10',
          rail: 'bg-amber-400',
          iconWrap: 'bg-amber-500/15 text-amber-200',
          badge: 'border border-amber-500/30 bg-amber-500/10 text-amber-200',
          dot: 'bg-amber-300',
        }
      : {
          panel: 'border border-amber-200 bg-amber-50/80',
          rail: 'bg-amber-500',
          iconWrap: 'bg-amber-100 text-amber-700',
          badge: 'border border-amber-200 bg-white text-amber-700',
          dot: 'bg-amber-500',
        };
  }

  if (tone === 'setup') {
    return darkMode
      ? {
          panel: 'border border-sky-500/20 bg-sky-500/10',
          rail: 'bg-sky-400',
          iconWrap: 'bg-sky-500/15 text-sky-200',
          badge: 'border border-sky-500/30 bg-sky-500/10 text-sky-200',
          dot: 'bg-sky-300',
        }
      : {
          panel: 'border border-sky-200 bg-sky-50/80',
          rail: 'bg-sky-500',
          iconWrap: 'bg-sky-100 text-sky-700',
          badge: 'border border-sky-200 bg-white text-sky-700',
          dot: 'bg-sky-500',
        };
  }

  return darkMode
    ? {
        panel: 'border border-emerald-500/20 bg-emerald-500/10',
        rail: 'bg-emerald-400',
        iconWrap: 'bg-emerald-500/15 text-emerald-200',
        badge: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
        dot: 'bg-emerald-300',
      }
    : {
        panel: 'border border-emerald-200 bg-emerald-50/80',
        rail: 'bg-emerald-500',
        iconWrap: 'bg-emerald-100 text-emerald-700',
        badge: 'border border-emerald-200 bg-white text-emerald-700',
        dot: 'bg-emerald-500',
      };
}

function renderStatIndicator(label, tone, pulse, darkMode) {
  const toneClassMap = {
    alert: darkMode
      ? 'border border-orange-500/30 bg-orange-500/10 text-orange-200'
      : 'border border-orange-200 bg-orange-50 text-orange-700',
    warning: darkMode
      ? 'border border-amber-500/30 bg-amber-500/10 text-amber-200'
      : 'border border-amber-200 bg-amber-50 text-amber-700',
    active: darkMode
      ? 'border border-sky-500/30 bg-sky-500/10 text-sky-200'
      : 'border border-sky-200 bg-sky-50 text-sky-700',
    good: darkMode
      ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      : 'border border-emerald-200 bg-emerald-50 text-emerald-700',
  };

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${toneClassMap[tone]}`}
    >
      <span className={`h-2 w-2 rounded-full ${pulse ? 'animate-pulse' : ''} ${tone === 'alert' ? 'bg-orange-500' : tone === 'warning' ? 'bg-amber-500' : tone === 'active' ? 'bg-sky-500' : 'bg-emerald-500'}`} />
      {label}
    </span>
  );
}

export default function SellerDashboard() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const themeState = useSellerTheme(
    currentUser?.is_verified_seller ?? currentUser?.is_verified ?? null
  );
  const theme = getSellerThemeClasses(themeState.darkMode);

  const handleLogout = async () => {
    showGlobalConfirm('Log Out', 'Are you sure you want to log out of your account?', async () => {
      await signOutAndClearAuthState();
      window.location.href = '/login';
    });
  };

  const loadDashboardData = useCallback(async (sellerId) => {
    try {
      setLoading(true);
      const sellerProducts = await productService.getSellerProducts(sellerId);
      setProducts(sellerProducts);

      const { data: sellerOrders, error: ordersError } = await supabase
        .from('orders')
        .select(
          'id, status, created_at, product_id, quantity, product_price, order_number, total_amount, delivery_type'
        )
        .eq('seller_id', sellerId)
        .order('created_at', { ascending: false });

      if (ordersError) {
        throw ordersError;
      }

      const orderItemsMap = await getOrderItemsMap(sellerOrders || []);
      const enrichedOrders = (sellerOrders || []).map((order) => {
        const orderItems = orderItemsMap[order.id] || [];
        const { displayName, image, itemCount, itemNames } =
          getOrderDisplayDetails(orderItems);

        return {
          ...order,
          displayName,
          image,
          itemCount,
          itemNames,
        };
      });

      setOrders(enrichedOrders);
    } catch (error) {
      console.error('Dashboard error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

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
    await loadDashboardData(userData.id);
  }, [loadDashboardData, navigate]);

  useEffect(() => {
    init();
  }, [init]);

  const stats = useMemo(() => {
    const activeListings = products.filter(
      (product) => Number(product.stock_quantity || 0) > 0
    ).length;
    const lowStock = products.filter((product) => {
      const quantity = Number(product.stock_quantity || 0);
      return quantity > 0 && quantity < 10;
    }).length;
    const needsAttention = orders.filter(
      (order) => order.status === 'PAID_ESCROW'
    ).length;
    const inTransit = orders.filter((order) =>
      ['SHIPPED', 'READY_FOR_PICKUP', 'DELIVERED'].includes(order.status)
    ).length;
    const completed = orders.filter(
      (order) => order.status === 'COMPLETED'
    ).length;

    return {
      activeListings,
      lowStock,
      needsAttention,
      inTransit,
      completed,
    };
  }, [orders, products]);

  const priorities = useMemo(() => {
    const items = [];

    if (stats.needsAttention > 0) {
      items.push({
        title: 'Orders to handle',
        detail: `${stats.needsAttention} order${stats.needsAttention === 1 ? '' : 's'} need your next step now.`,
        actionLabel: 'Open orders',
        href: '/seller/orders',
        icon: AlertCircle,
        tone: 'alert',
        tag: 'Action now',
        pulse: true,
      });
    }

    if (stats.lowStock > 0) {
      items.push({
        title: 'Low-stock listings',
        detail: `${stats.lowStock} listing${stats.lowStock === 1 ? '' : 's'} should be restocked soon.`,
        actionLabel: 'Check products',
        href: '/seller/products',
        icon: Package,
        tone: 'warning',
        tag: 'Restock soon',
      });
    }

    if (stats.activeListings === 0) {
      items.push({
        title: 'No live products',
        detail: 'Add a product so buyers can start ordering from your catalog.',
        actionLabel: 'Add product',
        href: '/seller/products/new',
        icon: Store,
        tone: 'setup',
        tag: 'Catalog gap',
      });
    }

    if (items.length === 0) {
      items.push({
        title: 'Everything looks steady',
        detail: 'No urgent actions are waiting right now.',
        actionLabel: 'View orders',
        href: '/seller/orders',
        icon: CheckCircle2,
        tone: 'calm',
        tag: 'All clear',
      });
    }

    return items.slice(0, 3);
  }, [currentUser?.is_verified, stats.activeListings, stats.lowStock, stats.needsAttention]);

  const quickActions = [
    {
      label: 'Add product',
      href: '/seller/products/new',
      icon: Plus,
    },
    {
      label: 'Review orders',
      href: '/seller/orders',
      icon: Truck,
    },
    {
      label: 'Check payouts',
      href: '/seller/payments',
      icon: Wallet,
    },
  ];

  if (loading) {
    return <SellerWorkspaceSkeleton darkMode={themeState.darkMode} mode="dashboard" />;
  }

  return (
    <SellerShell
      currentUser={currentUser}
      onLogout={handleLogout}
      footerComponent={Footer}
      themeState={themeState}
      showHeader
      title="Seller Dashboard"
      subtitle="Orders, products, and payouts."
      actions={
        <button
          type="button"
          onClick={() => navigate('/seller/products/new')}
          className={`inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition ${theme.actionPrimary}`}
        >
          <Plus className="h-4 w-4" />
          Add Product
        </button>
      }
    >
      {!currentUser?.seller_agreement_accepted && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-orange-800">
              You must accept the Seller Agreement before listing products
            </p>
            <p className="mt-1 text-sm text-orange-700">
              Read and accept our seller agreement to start listing products on Mafdesh.
            </p>
            <button
              onClick={() => navigate('/seller/agreement')}
              className="mt-3 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
            >
              Read and Accept Agreement →
            </button>
          </div>
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SellerStatCard
          theme={theme}
          label="Active listings"
          value={stats.activeListings}
          icon={Store}
          accentClass="bg-gradient-to-br from-orange-500 to-orange-600"
          indicator={renderStatIndicator(
            stats.activeListings > 0 ? 'Live' : 'Empty',
            stats.activeListings > 0 ? 'good' : 'warning',
            stats.activeListings === 0,
            themeState.darkMode
          )}
        />
        <SellerStatCard
          theme={theme}
          label="Need attention"
          value={stats.needsAttention}
          icon={Clock3}
          accentClass="bg-gradient-to-br from-amber-500 to-orange-500"
          indicator={renderStatIndicator(
            stats.needsAttention > 0 ? 'Urgent' : 'Clear',
            stats.needsAttention > 0 ? 'alert' : 'good',
            stats.needsAttention > 0,
            themeState.darkMode
          )}
        />
        <SellerStatCard
          theme={theme}
          label="In transit"
          value={stats.inTransit}
          icon={Truck}
          accentClass="bg-gradient-to-br from-sky-500 to-blue-600"
          indicator={renderStatIndicator(
            stats.inTransit > 0 ? 'Moving' : 'Idle',
            'active',
            stats.inTransit > 0,
            themeState.darkMode
          )}
        />
        <SellerStatCard
          theme={theme}
          label="Completed"
          value={stats.completed}
          icon={CheckCircle2}
          accentClass="bg-gradient-to-br from-emerald-500 to-green-600"
          indicator={renderStatIndicator(
            stats.completed > 0 ? 'Healthy' : 'Quiet',
            'good',
            false,
            themeState.darkMode
          )}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SellerSection
          theme={theme}
          eyebrow="Today"
          title="What needs your attention"
        >
          <div className="grid gap-3">
            {priorities.map((item) => {
              const Icon = item.icon;
              const visuals = getPriorityVisuals(item.tone, themeState.darkMode);

              return (
                <div
                  key={item.title}
                  className={`relative overflow-hidden rounded-xl p-4 ${visuals.panel} sm:p-5`}
                >
                  <span className={`absolute inset-y-4 left-0 w-1 rounded-full ${visuals.rail}`} />
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                      <div className={`relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl ${visuals.iconWrap}`}>
                        {item.pulse && (
                          <span className={`absolute inset-0 rounded-2xl ${visuals.rail} opacity-30 animate-ping`} />
                        )}
                        <Icon className="relative h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${visuals.badge}`}>
                            <span className={`h-2 w-2 rounded-full ${visuals.dot} ${item.pulse ? 'animate-pulse' : ''}`} />
                            {item.tag}
                          </span>
                          <p className="font-semibold">{item.title}</p>
                        </div>
                        <p className={`mt-2 text-sm leading-6 ${theme.mutedText}`}>
                          {item.detail}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(item.href)}
                      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${theme.action}`}
                    >
                      {item.actionLabel}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </SellerSection>

        <SellerSection
          theme={theme}
          eyebrow="Quick actions"
          title="Get back to work"
        >
          <div className="grid gap-3">
            {!currentUser?.is_verified_seller && !currentUser?.is_verified && (
              <div
                className={`relative overflow-hidden rounded-[28px] border p-5 ${
                  themeState.darkMode
                    ? 'border-orange-500/25 bg-[radial-gradient(circle_at_top_right,_rgba(249,115,22,0.16),_transparent_42%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(30,41,59,0.92))]'
                    : 'border-orange-200 bg-[radial-gradient(circle_at_top_right,_rgba(251,146,60,0.18),_transparent_42%),linear-gradient(135deg,#fffaf5,#ffffff)]'
                }`}
              >
                <div className="flex flex-col gap-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                          themeState.darkMode
                            ? 'border border-orange-500/30 bg-orange-500/10 text-orange-200'
                            : 'border border-orange-200 bg-white text-orange-700'
                        }`}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Grow trust
                      </span>
                      <h3 className="mt-4 text-xl font-bold">Become a verified seller</h3>
                      <p className={`mt-2 max-w-md text-sm leading-6 ${theme.mutedText}`}>
                        Add the campus trust badge and stronger recommendation visibility.
                      </p>
                    </div>
                    <div
                      className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl ${
                        themeState.darkMode
                          ? 'bg-orange-500/15 text-orange-200'
                          : 'bg-orange-100 text-orange-700'
                      }`}
                    >
                      <Shield className="h-5 w-5" />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {['Verified Seller badge', 'Buyer confidence', 'Recommendation boost'].map((benefit) => (
                      <span
                        key={benefit}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          themeState.darkMode
                            ? 'bg-slate-800/80 text-slate-200'
                            : 'bg-white text-slate-700 shadow-sm'
                        }`}
                      >
                        {benefit}
                      </span>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => navigate('/seller/verification')}
                      className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition ${
                        themeState.darkMode
                          ? 'border border-orange-400/40 bg-orange-500/10 text-orange-200 hover:bg-orange-500/20'
                          : 'border border-orange-200 bg-white text-orange-700 hover:border-orange-300 hover:bg-orange-50'
                      }`}
                    >
                      Apply for verification
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {quickActions.map((action) => {
              const Icon = action.icon;

              return (
                <button
                  key={action.href}
                  type="button"
                  onClick={() => navigate(action.href)}
                  className={`flex items-start gap-4 rounded-lg p-4 text-left transition ${theme.panelMuted} ${theme.rowHover}`}
                >
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-orange-500 text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{action.label}</p>
                  </div>
                  <ArrowRight className={`mt-1 h-4 w-4 flex-shrink-0 ${theme.softText}`} />
                </button>
              );
            })}
          </div>
        </SellerSection>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SellerSection
          theme={theme}
          eyebrow="Recent orders"
          title="Latest order activity"
          action={
            <button
              type="button"
              onClick={() => navigate('/seller/orders')}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${theme.action}`}
            >
              Open orders
              <ArrowRight className="h-4 w-4" />
            </button>
          }
        >
          {orders.length === 0 ? (
            <SellerEmptyState
              theme={theme}
              icon={Package}
              title="No recent orders yet"
            />
          ) : (
            <div className="space-y-3">
              {orders.slice(0, 5).map((order) => (
                <article
                  key={order.id}
                  className={`flex flex-col gap-4 rounded-lg p-4 transition sm:flex-row sm:items-center sm:justify-between ${theme.panelMuted} ${theme.rowHover}`}
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <img
                      src={order.image || 'https://placehold.co/100'}
                      alt={order.displayName}
                      className="h-14 w-14 rounded-md object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{order.displayName}</p>
                      <p className={`mt-1 text-sm ${theme.mutedText}`}>
                        {order.order_number || order.id}
                      </p>
                      <p className={`mt-1 text-xs ${theme.softText}`}>
                        {new Date(order.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center gap-2 rounded-md px-3 py-1 text-xs font-semibold ${statusTone(order.status, themeState.darkMode)}`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${
                          order.status === 'PAID_ESCROW'
                            ? 'animate-pulse bg-current'
                            : 'bg-current/70'
                        }`}
                      />
                      {order.status.replaceAll('_', ' ')}
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate(`/seller/orders/${order.id}`)}
                      className={`text-sm font-semibold transition ${theme.actionGhost}`}
                    >
                      View
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </SellerSection>

        <SellerSection
          theme={theme}
          eyebrow="Catalog"
          title="Listings to keep an eye on"
          action={
            <button
              type="button"
              onClick={() => navigate('/seller/products')}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${theme.action}`}
            >
              Manage products
              <ArrowRight className="h-4 w-4" />
            </button>
          }
        >
          {products.length === 0 ? (
            <SellerEmptyState
              theme={theme}
              icon={Store}
              title="No products listed yet"
              action={
                <button
                  type="button"
                  onClick={() => navigate('/seller/products/new')}
                  className={`inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition ${theme.actionPrimary}`}
                >
                  Add your first product
                </button>
              }
            />
          ) : (
            <div className="space-y-3">
              {products.slice(0, 5).map((product) => (
                <article
                  key={product.id}
                  className={`flex items-center justify-between gap-4 rounded-lg p-4 transition ${theme.panelMuted} ${theme.rowHover}`}
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <img
                      src={product.images?.[0] || 'https://placehold.co/120x120'}
                      alt={product.name}
                      className="h-14 w-14 rounded-md object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{product.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <p className={`text-sm ${theme.mutedText}`}>
                          {Number(product.stock_quantity || 0) > 0
                            ? `${product.stock_quantity} in stock`
                            : 'Out of stock'}
                        </p>
                        {Number(product.stock_quantity || 0) === 0 && (
                          <span
                            className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              themeState.darkMode
                                ? 'bg-red-500/10 text-red-200'
                                : 'bg-red-50 text-red-700'
                            }`}
                          >
                            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                            Empty
                          </span>
                        )}
                        {Number(product.stock_quantity || 0) > 0 &&
                          Number(product.stock_quantity || 0) < 10 && (
                            <span
                              className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                themeState.darkMode
                                  ? 'bg-amber-500/10 text-amber-200'
                                  : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                              Low stock
                            </span>
                          )}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/seller/products/${product.id}/edit`)}
                    className={`text-sm font-semibold transition ${theme.actionGhost}`}
                  >
                    Edit
                  </button>
                </article>
              ))}
            </div>
          )}
        </SellerSection>
      </section>
    </SellerShell>
  );
}
