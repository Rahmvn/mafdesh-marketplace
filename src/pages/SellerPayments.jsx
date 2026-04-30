import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  CreditCard,
  Download,
  ExternalLink,
  Info,
  RefreshCw,
  Search,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { getSessionWithRetry } from '../utils/authResilience';
import { showGlobalConfirm, showGlobalError } from '../hooks/modalService';
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
import { getOrderItemsMap } from '../utils/orderItems';
import {
  buildSellerPaymentRows,
  calculateSellerPaymentStats,
} from '../utils/sellerPaymentHistory';

const HOLDING_PERIOD_DAYS = Number(import.meta.env.VITE_SELLER_PAYOUT_HOLD_DAYS || 7);
const STATUS_FILTER_OPTIONS = ['ALL', 'PAID', 'HELD', 'REFUNDED', 'CANCELLED'];
const PAYMENT_PLACEHOLDER_IMAGE = '/placeholder.svg';
const SELLER_PAYMENT_ORDER_BASE_FIELDS = `
  id,
  seller_id,
  order_number,
  status,
  created_at,
  delivered_at,
  completed_at,
  total_amount,
  delivery_fee,
  platform_fee,
  product_id,
  product_price,
  quantity,
  product_snapshot,
  resolution_type,
  resolution_amount
`;
const SELLER_PAYMENT_ORDER_OPTIONAL_FIELDS = ['updated_at'];
const VERIFICATION_PAYMENT_SOURCE = {
  UNKNOWN: 'unknown',
  MODERN: 'seller_verification_payments',
  LEGACY: 'verification_payments',
  NONE: 'none',
};

function toAmount(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function toTimestamp(value) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatShortDate(value) {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatLongDate(value) {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function addDays(value, days) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function payoutStatusTone(status, darkMode) {
  if (status === 'PAID') {
    return darkMode ? 'bg-emerald-500/15 text-emerald-200' : 'bg-emerald-100 text-emerald-700';
  }

  if (status === 'HELD') {
    return darkMode ? 'bg-amber-500/15 text-amber-200' : 'bg-amber-100 text-amber-700';
  }

  if (status === 'REFUNDED' || status === 'CANCELLED') {
    return darkMode ? 'bg-red-500/15 text-red-200' : 'bg-red-100 text-red-700';
  }

  return darkMode ? 'bg-orange-500/15 text-orange-200' : 'bg-orange-100 text-orange-700';
}

function rowTypeTone(type, darkMode) {
  if (type === 'refund') {
    return darkMode ? 'bg-red-500/15 text-red-200' : 'bg-red-100 text-red-700';
  }

  if (type === 'verification_fee') {
    return darkMode ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-700';
  }

  return darkMode ? 'bg-sky-500/15 text-sky-200' : 'bg-sky-100 text-sky-700';
}

function isMissingRelationError(error, relationNames = []) {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    relationNames.some((name) => message.includes(String(name).toLowerCase()))
  );
}

function isMissingColumnError(error, columnNames = []) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  const hint = String(error?.hint || '').toLowerCase();
  const combinedText = `${message} ${details} ${hint}`;
  const isMissingColumnCode =
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'PGRST205';
  const mentionsMissingColumn =
    combinedText.includes('does not exist') ||
    combinedText.includes('could not find') ||
    combinedText.includes('schema cache') ||
    combinedText.includes('column');

  return (
    isMissingColumnCode &&
    mentionsMissingColumn &&
    (columnNames.length === 0 ||
      columnNames.some((columnName) =>
        combinedText.includes(String(columnName).toLowerCase())
      ))
  );
}

async function fetchSellerPaymentOrders(sellerId) {
  const runQuery = (selectClause) =>
    supabase
      .from('orders')
      .select(selectClause)
      .eq('seller_id', sellerId)
      .neq('status', 'PENDING')
      .order('created_at', { ascending: false });

  const primarySelect = `
    ${SELLER_PAYMENT_ORDER_BASE_FIELDS},
    ${SELLER_PAYMENT_ORDER_OPTIONAL_FIELDS.join(',\n    ')}
  `;
  const primaryResult = await runQuery(primarySelect);

  if (
    !primaryResult.error ||
    !isMissingColumnError(primaryResult.error, SELLER_PAYMENT_ORDER_OPTIONAL_FIELDS)
  ) {
    return primaryResult;
  }

  return runQuery(SELLER_PAYMENT_ORDER_BASE_FIELDS);
}

function maskAccountNumber(user) {
  const explicitLast4 = String(user?.account_number_last4 || '').trim();
  if (explicitLast4) {
    return `****${explicitLast4}`;
  }

  const raw = String(user?.account_number || '').replace(/\D/g, '');
  if (!raw) {
    return null;
  }

  return `****${raw.slice(-4)}`;
}

function buildFeeTooltip(row) {
  const parts = [];

  if (row.grossAmount) {
    parts.push(`Gross amount: ${formatSellerCurrency(row.grossAmount)}`);
  }

  if (row.feeBreakdown?.subtotal) {
    parts.push(`Item subtotal: ${formatSellerCurrency(row.feeBreakdown.subtotal)}`);
  }

  if (row.feeBreakdown?.deliveryFee) {
    parts.push(`Delivery fee: ${formatSellerCurrency(row.feeBreakdown.deliveryFee)}`);
  }

  if (row.feeBreakdown?.platformFee) {
    parts.push(`Platform fee: ${formatSellerCurrency(row.feeBreakdown.platformFee)}`);
  }

  if (row.feeBreakdown?.adjustmentAmount) {
    parts.push(`Adjustment: ${formatSellerCurrency(row.feeBreakdown.adjustmentAmount)}`);
  }

  parts.push(`Net amount: ${formatSellerCurrency(row.netAmount)}`);

  return parts.join('\n');
}

function buildExpectedDate(row) {
  if (row.type !== 'payout' || row.status !== 'PENDING' || !row.expectedBaseDate) {
    return null;
  }

  return addDays(row.expectedBaseDate, HOLDING_PERIOD_DAYS);
}

function buildRowTimingLabel(row) {
  if (row.type === 'verification_fee') {
    return `Charged on ${formatShortDate(row.createdAt)}`;
  }

  if (row.type === 'refund') {
    return `${row.typeLabel} on ${formatShortDate(row.createdAt)}`;
  }

  if (row.status === 'HELD') {
    return 'Held for admin review';
  }

  if (row.status === 'PAID') {
    return `Paid on ${formatShortDate(row.paidAt || row.createdAt)}`;
  }

  if (row.expectedDate) {
    return `Available on ${formatLongDate(row.expectedDate)}`;
  }

  return 'Release date appears after delivery is completed';
}

async function fetchVerificationPayments(sellerId, knownSource = VERIFICATION_PAYMENT_SOURCE.UNKNOWN) {
  // Backend note:
  // this page supports either `seller_verification_payments` or the current
  // `verification_payments` table so the UI keeps working while the schema settles.
  if (knownSource === VERIFICATION_PAYMENT_SOURCE.NONE) {
    return { rows: [], source: VERIFICATION_PAYMENT_SOURCE.NONE };
  }

  if (knownSource === VERIFICATION_PAYMENT_SOURCE.MODERN) {
    const result = await supabase
      .from('seller_verification_payments')
      .select('*')
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false });

    if (result.error) {
      console.warn('Verification fee lookup failed:', result.error);
      return { rows: [], source: VERIFICATION_PAYMENT_SOURCE.NONE };
    }

    return { rows: result.data || [], source: VERIFICATION_PAYMENT_SOURCE.MODERN };
  }

  if (knownSource === VERIFICATION_PAYMENT_SOURCE.LEGACY) {
    const result = await supabase
      .from('verification_payments')
      .select('*')
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false });

    if (result.error) {
      console.warn('Verification fee lookup failed:', result.error);
      return { rows: [], source: VERIFICATION_PAYMENT_SOURCE.NONE };
    }

    return { rows: result.data || [], source: VERIFICATION_PAYMENT_SOURCE.LEGACY };
  }

  const primary = await supabase
    .from('seller_verification_payments')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false });

  if (!primary.error) {
    return { rows: primary.data || [], source: VERIFICATION_PAYMENT_SOURCE.MODERN };
  }

  if (!isMissingRelationError(primary.error, ['seller_verification_payments'])) {
    console.warn('Verification fee lookup failed:', primary.error);
    return { rows: [], source: VERIFICATION_PAYMENT_SOURCE.NONE };
  }

  const fallback = await supabase
    .from('verification_payments')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false });

  if (fallback.error) {
    if (!isMissingRelationError(fallback.error, ['verification_payments'])) {
      console.warn('Verification fee fallback lookup failed:', fallback.error);
    }

    return { rows: [], source: VERIFICATION_PAYMENT_SOURCE.NONE };
  }

  return { rows: fallback.data || [], source: VERIFICATION_PAYMENT_SOURCE.LEGACY };
}

function normalizeVerificationRows(payments = []) {
  return (payments || []).map((payment) => {
    const rawStatus = String(payment.payment_status || payment.status || 'pending').toUpperCase();
    const status =
      rawStatus === 'SUCCESSFUL'
        ? 'PAID'
        : rawStatus === 'FAILED'
          ? 'CANCELLED'
          : rawStatus;
    const amount = -Math.abs(toAmount(payment.amount));
    const planType = payment.plan_type ? String(payment.plan_type).replace(/_/g, ' ') : 'subscription';

    return {
      id: `verification-${payment.id || payment.payment_reference || payment.created_at}`,
      type: 'verification_fee',
      typeLabel: 'Verification fee',
      title: `Verification ${planType}`,
      subtitle: payment.payment_reference ? `Ref ${payment.payment_reference}` : 'Subscription charge',
      orderId: null,
      orderNumber: null,
      name: `Verification ${planType}`,
      combinedName: `Verification ${planType}`,
      image: PAYMENT_PLACEHOLDER_IMAGE,
      itemCount: 0,
      amount,
      netAmount: amount,
      grossAmount: 0,
      feeBreakdown: {
        subtotal: 0,
        deliveryFee: 0,
        platformFee: 0,
        grossAmount: 0,
        netAmount: amount,
        adjustmentAmount: Math.abs(amount),
      },
      status,
      createdAt: payment.created_at,
      paidAt: status === 'PAID' ? payment.created_at : null,
      expectedBaseDate: null,
      expectedDate: null,
      orderStatus: null,
      isDerived: false,
      isRefund: false,
      discountInfo: null,
      receiptId: payment.payment_reference || payment.id || null,
    };
  });
}

export default function SellerPayments() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [verificationPaymentSource, setVerificationPaymentSource] = useState(
    VERIFICATION_PAYMENT_SOURCE.UNKNOWN
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const themeState = useSellerTheme(currentUser?.is_verified ?? null);
  const theme = getSellerThemeClasses(themeState.darkMode);

  const handleLogout = async () => {
    showGlobalConfirm('Log Out', 'Are you sure you want to log out of your account?', async () => {
      await supabase.auth.signOut();
      localStorage.clear();
      window.location.href = '/login';
    });
  };

  const loadPayouts = useCallback(async (sellerId, options = {}) => {
    const { showLoader = true, sellerAccountStatus = null } = options;

    if (!sellerId) {
      return false;
    }

    if (showLoader) {
      setLoading(true);
    }

    const [payoutResult, ordersResult, verificationResult] = await Promise.all([
      supabase
        .from('seller_payouts')
        .select('*')
        .eq('seller_id', sellerId)
        .order('created_at', { ascending: false }),
      fetchSellerPaymentOrders(sellerId),
      fetchVerificationPayments(sellerId, verificationPaymentSource),
    ]);

    if (ordersResult.error) {
      console.error('Failed to load seller payout orders:', ordersResult.error);
      setLoadError('Unable to load payout history. Please try again.');
      if (showLoader) {
        setLoading(false);
      }
      return false;
    }

    let orderItemsMap = {};

    try {
      orderItemsMap = await getOrderItemsMap(ordersResult.data || []);
    } catch (orderItemsError) {
      console.error('Failed to load payout order items:', orderItemsError);
    }

    const orderIds = (ordersResult.data || []).map((order) => order.id).filter(Boolean);
    let activeHoldByOrderId = {};

    if (orderIds.length > 0) {
      const { data: holdRows, error: holdError } = await supabase
        .from('order_admin_holds')
        .select('id, order_id, source_type, trigger_action, reason, status, created_at')
        .in('order_id', orderIds)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (holdError) {
        console.error('Failed to load payout moderation holds:', holdError);
      } else {
        activeHoldByOrderId = (holdRows || []).reduce((map, hold) => {
          if (!map[hold.order_id]) {
            map[hold.order_id] = hold;
          }
          return map;
        }, {});
      }
    }

    if (payoutResult.error) {
      console.warn('Falling back to order-derived payout history:', payoutResult.error);
    }

    const payoutRows = buildSellerPaymentRows({
      orders: ordersResult.data || [],
      orderItemsMap,
      recordedPayouts: payoutResult.error ? [] : payoutResult.data || [],
      activeHoldByOrderId,
      sellerPayoutsHeld:
        String(sellerAccountStatus || currentUser?.account_status || currentUser?.status || 'active').toLowerCase() !==
        'active',
    }).map((row) => ({
      ...row,
      expectedDate: buildExpectedDate(row),
    }));

    const verificationRows = normalizeVerificationRows(verificationResult.rows);
    const nextRows = [...payoutRows, ...verificationRows].sort(
      (left, right) => toTimestamp(right.createdAt) - toTimestamp(left.createdAt)
    );

    setHistoryRows(nextRows);
    setVerificationPaymentSource(verificationResult.source);
    setLoadError('');

    if (showLoader) {
      setLoading(false);
    }

    return true;
  }, [currentUser?.account_status, currentUser?.status, verificationPaymentSource]);

  const init = useCallback(async () => {
    const { data: session } = await getSessionWithRetry(supabase.auth);

    if (!session.session) {
      navigate('/login');
      return;
    }

    const userId = session.session.user.id;
    const { data: userData, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !userData || userData.role !== 'seller') {
      navigate('/login');
      return;
    }

    setCurrentUser(userData);
    localStorage.setItem('mafdesh_user', JSON.stringify(userData));
    await loadPayouts(userId, {
      showLoader: true,
      sellerAccountStatus: userData.account_status || userData.status,
    });
  }, [loadPayouts, navigate]);

  useEffect(() => {
    const initTimer = window.setTimeout(() => {
      init();
    }, 0);

    return () => {
      window.clearTimeout(initTimer);
    };
  }, [init]);

  useEffect(() => {
    if (!currentUser?.id) {
      return undefined;
    }

    const channel = supabase.channel(`seller-payments-${currentUser.id}`);

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders', filter: `seller_id=eq.${currentUser.id}` },
      () => loadPayouts(currentUser.id, { showLoader: false })
    );

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'seller_payouts', filter: `seller_id=eq.${currentUser.id}` },
      () => loadPayouts(currentUser.id, { showLoader: false })
    );

    if (verificationPaymentSource === VERIFICATION_PAYMENT_SOURCE.MODERN) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'seller_verification_payments', filter: `seller_id=eq.${currentUser.id}` },
        () => loadPayouts(currentUser.id, { showLoader: false })
      );
    } else if (verificationPaymentSource === VERIFICATION_PAYMENT_SOURCE.LEGACY) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'verification_payments', filter: `seller_id=eq.${currentUser.id}` },
        () => loadPayouts(currentUser.id, { showLoader: false })
      );
    }

    const subscription = channel.subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [currentUser?.id, loadPayouts, verificationPaymentSource]);

  const handleRefresh = async () => {
    if (!currentUser?.id || refreshing) {
      return;
    }

    setRefreshing(true);
    const success = await loadPayouts(currentUser.id, { showLoader: false });
    setRefreshing(false);

    if (!success) {
      showGlobalError('Refresh Failed', 'Unable to reload payout history right now.');
    }
  };

  const displayHistoryRows = useMemo(
    () => historyRows.filter((row) => row.status !== 'PENDING'),
    [historyRows]
  );

  const payoutRows = useMemo(
    () => displayHistoryRows.filter((row) => row.type === 'payout'),
    [displayHistoryRows]
  );

  const usingDerivedPayouts = useMemo(
    () => payoutRows.length > 0 && payoutRows.every((row) => row.isDerived),
    [payoutRows]
  );

  const payoutStats = useMemo(() => {
    return calculateSellerPaymentStats(historyRows);
  }, [historyRows]);

  const bankSummary = useMemo(() => {
    const maskedAccount = maskAccountNumber(currentUser);
    return {
      hasBankDetails: Boolean(currentUser?.bank_name && maskedAccount),
      bankName: currentUser?.bank_name || '',
      maskedAccount,
    };
  }, [currentUser]);

  const filteredRows = useMemo(() => {
    const searchValue = searchTerm.trim().toLowerCase();
    const fromTimestamp = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTimestampValue = dateTo
      ? new Date(`${dateTo}T23:59:59.999`).getTime()
      : null;

    return displayHistoryRows.filter((row) => {
      if (statusFilter !== 'ALL' && row.status !== statusFilter) {
        return false;
      }

      if (searchValue) {
        const haystack = String(row.orderNumber || '').toLowerCase();
        if (!haystack.includes(searchValue)) {
          return false;
        }
      }

      const rowTimestamp = toTimestamp(row.createdAt);
      if (fromTimestamp && rowTimestamp < fromTimestamp) {
        return false;
      }

      if (toTimestampValue && rowTimestamp > toTimestampValue) {
        return false;
      }

      return true;
    });
  }, [dateFrom, dateTo, displayHistoryRows, searchTerm, statusFilter]);

  const hasFilters = Boolean(statusFilter !== 'ALL' || searchTerm || dateFrom || dateTo);

  const generateReceipt = useCallback((row) => {
    if (!row) {
      return;
    }

    const receiptId =
      row.receiptId ||
      `MFD-${(row.orderNumber || 'PAYOUT').replace(/[^A-Z0-9-]/gi, '').toUpperCase()}-${new Date(
        row.createdAt || Date.now()
      )
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, '')}`;

    const sellerName =
      currentUser?.business_name || currentUser?.full_name || currentUser?.email || 'Seller';

    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');

    if (!printWindow) {
      showGlobalError(
        'Receipt Blocked',
        'Your browser blocked the receipt window. Please allow pop-ups and try again.'
      );
      return;
    }

    const receiptHtml = `
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>Mafdesh Receipt ${receiptId}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 32px;
              background: #f8fafc;
              color: #0f172a;
            }
            .receipt {
              max-width: 760px;
              margin: 0 auto;
              background: white;
              border: 1px solid #e2e8f0;
              border-radius: 24px;
              overflow: hidden;
              box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
            }
            .header {
              padding: 28px 32px;
              background: linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #f97316 100%);
              color: white;
            }
            .header h1 {
              margin: 0 0 8px;
              font-size: 28px;
            }
            .header p {
              margin: 0;
              color: rgba(255, 255, 255, 0.85);
            }
            .body {
              padding: 32px;
            }
            .grid {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 16px;
              margin-bottom: 24px;
            }
            .card {
              border: 1px solid #e2e8f0;
              border-radius: 18px;
              padding: 16px;
              background: #f8fafc;
            }
            .label {
              display: block;
              font-size: 12px;
              text-transform: uppercase;
              letter-spacing: 0.12em;
              color: #64748b;
              margin-bottom: 8px;
            }
            .value {
              font-size: 18px;
              font-weight: 700;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 8px;
            }
            td {
              padding: 12px 0;
              border-bottom: 1px solid #e2e8f0;
              vertical-align: top;
            }
            td:last-child {
              text-align: right;
              font-weight: 700;
            }
            .total {
              color: #ea580c;
            }
            .footer {
              padding: 24px 32px 32px;
              color: #64748b;
              font-size: 13px;
            }
            @media print {
              body {
                background: white;
                padding: 0;
              }
              .receipt {
                box-shadow: none;
                border: none;
                max-width: none;
              }
            }
          </style>
        </head>
        <body>
          <section class="receipt">
            <header class="header">
              <h1>Mafdesh payout receipt</h1>
              <p>Receipt ID: ${receiptId}</p>
            </header>
            <div class="body">
              <div class="grid">
                <div class="card">
                  <span class="label">Seller</span>
                  <div class="value">${sellerName}</div>
                </div>
                <div class="card">
                  <span class="label">Order</span>
                  <div class="value">${row.orderNumber || 'N/A'}</div>
                </div>
                <div class="card">
                  <span class="label">Receipt date</span>
                  <div class="value">${formatLongDate(row.createdAt)}</div>
                </div>
                <div class="card">
                  <span class="label">Status</span>
                  <div class="value">${row.status}</div>
                </div>
              </div>

              <table>
                <tr>
                  <td>Gross amount</td>
                  <td>${formatSellerCurrency(row.grossAmount)}</td>
                </tr>
                <tr>
                  <td>Platform fee</td>
                  <td>${formatSellerCurrency(row.feeBreakdown?.platformFee || 0)}</td>
                </tr>
                <tr>
                  <td>Delivery fee</td>
                  <td>${formatSellerCurrency(row.feeBreakdown?.deliveryFee || 0)}</td>
                </tr>
                <tr>
                  <td class="total">Net amount</td>
                  <td class="total">${formatSellerCurrency(row.netAmount)}</td>
                </tr>
              </table>
            </div>
            <div class="footer">
              Generated by Mafdesh. This receipt is a printable summary and can be replaced later with a full PDF document.
            </div>
          </section>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => {
      printWindow.print();
    }, 250);
  }, [currentUser]);

  const renderViewOrderButton = (row, compact = false) => {
    if (!row.orderId) {
      return null;
    }

    return (
      <button
        type="button"
        onClick={() => navigate(`/seller/orders/${row.orderId}`)}
        className={`inline-flex items-center gap-2 rounded-full ${
          compact ? 'px-3 py-2 text-xs' : 'px-3 py-2 text-sm'
        } font-semibold transition ${theme.action}`}
      >
        View order
        <ExternalLink className="h-4 w-4" />
      </button>
    );
  };

  const renderReceiptButton = (row, compact = false) => {
    if (row.type !== 'payout' || row.status !== 'PAID') {
      return null;
    }

    return (
      <button
        type="button"
        onClick={() => generateReceipt(row)}
        className={`inline-flex items-center gap-2 rounded-full ${
          compact ? 'px-3 py-2 text-xs' : 'px-3 py-2 text-sm'
        } font-semibold transition ${theme.action}`}
      >
        Download receipt
        <Download className="h-4 w-4" />
      </button>
    );
  };

  if (loading) {
    return <SellerWorkspaceSkeleton darkMode={themeState.darkMode} mode="payments" />;
  }

  return (
    <SellerShell currentUser={currentUser} onLogout={handleLogout} themeState={themeState}>
      <section className="grid gap-4 md:grid-cols-2">
        <SellerStatCard
          theme={theme}
          label="Net settled"
          value={formatSellerCurrency(payoutStats.settledNet)}
          icon={Wallet}
          accentClass="bg-gradient-to-br from-blue-900 to-slate-700"
        />
        <SellerStatCard
          theme={theme}
          label="Paid payouts"
          value={formatSellerCurrency(payoutStats.paidOut)}
          icon={CreditCard}
          accentClass="bg-gradient-to-br from-emerald-500 to-green-600"
        />
      </section>

      <section className={`rounded-lg p-5 sm:p-6 ${theme.panel}`}>
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" />
          <div>
            <h2 className="text-base font-bold">How payout totals are counted</h2>
            <p className={`mt-2 text-sm ${theme.mutedText}`}>
              Only settled entries appear here. Pending releases stay in Orders.
            </p>
          </div>
        </div>
      </section>

      <section className={`rounded-lg p-5 sm:p-6 ${theme.panel}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-500">
              Bank summary
            </p>
            {bankSummary.hasBankDetails ? (
              <>
                <h2 className="mt-2 text-xl font-bold">
                  Payouts will be sent to: {bankSummary.bankName} {bankSummary.maskedAccount}
                </h2>
                <p className={`mt-2 text-sm ${theme.mutedText}`}>
                  Default holding period: {HOLDING_PERIOD_DAYS} days.
                </p>
              </>
            ) : (
              <>
                <h2 className="mt-2 flex items-center gap-2 text-xl font-bold text-red-500">
                  <TriangleAlert className="h-5 w-5" />
                  No bank account is connected yet
                </h2>
                <p className={`mt-2 text-sm ${theme.mutedText}`}>
                  Add bank details in Profile to receive payouts.
                </p>
              </>
            )}
          </div>

          {!bankSummary.hasBankDetails ? (
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${theme.actionPrimary}`}
            >
              Add bank details
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </section>

      <SellerSection
        theme={theme}
        eyebrow="Payout history"
        title="Track each seller payout"
        action={
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${theme.action}`}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => navigate('/seller/orders')}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${theme.action}`}
            >
              Open orders
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        }
      >
        {usingDerivedPayouts ? (
          <div className={`mb-5 rounded-[24px] border px-4 py-3 text-sm ${theme.panelSoft}`}>
            Estimated from order milestones until payout rows sync.
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[220px_1fr_180px_180px]">
          <div>
            <label className={`mb-2 block text-xs font-semibold uppercase tracking-[0.16em] ${theme.softText}`}>
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={`w-full rounded-full px-4 py-3 text-sm ${theme.input}`}
            >
              {STATUS_FILTER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === 'ALL' ? 'All statuses' : option}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={`mb-2 block text-xs font-semibold uppercase tracking-[0.16em] ${theme.softText}`}>
              Search order number
            </label>
            <div className="relative">
              <Search className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${theme.softText}`} />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by order number"
                className={`w-full rounded-full py-3 pl-10 pr-4 text-sm ${theme.input}`}
              />
            </div>
          </div>

          <div>
            <label className={`mb-2 block text-xs font-semibold uppercase tracking-[0.16em] ${theme.softText}`}>
              From
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className={`w-full rounded-full px-4 py-3 text-sm ${theme.input}`}
            />
          </div>

          <div>
            <label className={`mb-2 block text-xs font-semibold uppercase tracking-[0.16em] ${theme.softText}`}>
              To
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className={`w-full rounded-full px-4 py-3 text-sm ${theme.input}`}
            />
          </div>
        </div>

        {hasFilters ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className={`text-sm ${theme.mutedText}`}>
              Showing {filteredRows.length} matching row{filteredRows.length === 1 ? '' : 's'}.
            </p>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('ALL');
                setSearchTerm('');
                setDateFrom('');
                setDateTo('');
              }}
              className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition ${theme.actionGhost}`}
            >
              Clear filters
            </button>
          </div>
        ) : null}

        {loadError && displayHistoryRows.length === 0 ? (
          <div className="mt-6">
            <SellerEmptyState
              theme={theme}
              icon={TriangleAlert}
              title="Unable to load payout history"
              body={loadError}
              action={
                <button
                  type="button"
                  onClick={() => loadPayouts(currentUser?.id, { showLoader: true })}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${theme.actionPrimary}`}
                >
                  Retry
                  <RefreshCw className="h-4 w-4" />
                </button>
              }
            />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="mt-6">
            <SellerEmptyState
              theme={theme}
              icon={Wallet}
              title={displayHistoryRows.length === 0 ? 'No payout history yet' : 'No matching payout rows'}
              body={
                displayHistoryRows.length === 0
                  ? 'Released payouts and held payout reviews appear here. Pending releases stay in Orders.'
                  : 'Try another filter.'
              }
            />
          </div>
        ) : (
          <>
            <div className="mt-6 space-y-4 md:hidden">
              {filteredRows.map((row) => (
                <article key={row.id} className={`rounded-[24px] p-4 ${theme.panelMuted}`}>
                  <div className="flex items-start gap-4">
                    <img
                      src={row.image || PAYMENT_PLACEHOLDER_IMAGE}
                      alt={row.title || 'Payout row'}
                      className="h-16 w-16 rounded-2xl object-cover"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${rowTypeTone(row.type, themeState.darkMode)}`}>
                          {row.typeLabel}
                        </span>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${payoutStatusTone(row.status, themeState.darkMode)}`}>
                          {row.status}
                        </span>
                      </div>

                      <div className="mt-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {row.orderId ? (
                            <button
                              type="button"
                              onClick={() => navigate(`/seller/orders/${row.orderId}`)}
                              className="truncate text-left font-semibold hover:text-orange-500"
                            >
                              {row.title}
                            </button>
                          ) : (
                            <p className="font-semibold">{row.title}</p>
                          )}
                          {row.subtitle ? (
                            <p className={`mt-1 text-sm ${theme.mutedText}`}>{row.subtitle}</p>
                          ) : null}
                        </div>
                        <div className="text-right">
                          <p className={`text-xl font-bold ${row.netAmount < 0 ? 'text-red-500' : 'text-orange-500'}`}>
                            {formatSellerCurrency(row.netAmount)}
                          </p>
                          <p className={`mt-1 text-xs ${theme.softText}`}>Net amount</p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {row.itemCount > 0 ? (
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${theme.panelSoft}`}>
                            {row.itemCount} item{row.itemCount === 1 ? '' : 's'}
                          </span>
                        ) : null}
                        {row.discountInfo ? (
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${theme.badge}`}>
                            {row.discountInfo.label}
                          </span>
                        ) : null}
                      </div>

                      <div className={`mt-4 space-y-2 text-sm ${theme.mutedText}`}>
                        <p className="flex items-center gap-2">
                          <span>Gross: {formatSellerCurrency(row.grossAmount)}</span>
                          <span title={buildFeeTooltip(row)}>
                            <Info className="h-4 w-4" />
                          </span>
                        </p>
                        <p>Order: {row.orderNumber || '—'}</p>
                        <p className="flex items-center gap-2">
                          <CalendarDays className="h-4 w-4" />
                          {buildRowTimingLabel(row)}
                        </p>
                        {row.adminHoldReason ? (
                          <p className="text-amber-600">{row.adminHoldReason}</p>
                        ) : null}
                        <p>Recorded on {formatShortDate(row.createdAt)}</p>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {renderViewOrderButton(row, true)}
                        {renderReceiptButton(row, true)}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className={`mt-6 hidden overflow-hidden rounded-[24px] md:block ${theme.panelMuted}`}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1220px]">
                  <thead className={theme.tableHeader}>
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Product / entry</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Order</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Gross & fees</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Net amount</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Release / date</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr
                        key={row.id}
                        className={`border-t align-top transition ${theme.divider} ${theme.rowHover}`}
                      >
                        <td className="px-4 py-4">
                          <div className="flex items-start gap-3">
                            <img
                              src={row.image || PAYMENT_PLACEHOLDER_IMAGE}
                              alt={row.title || 'Payout row'}
                              className="h-12 w-12 rounded-2xl object-cover"
                            />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${rowTypeTone(row.type, themeState.darkMode)}`}>
                                  {row.typeLabel}
                                </span>
                                {row.itemCount > 0 ? (
                                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${theme.panelSoft}`}>
                                    {row.itemCount} item{row.itemCount === 1 ? '' : 's'}
                                  </span>
                                ) : null}
                                {row.discountInfo ? (
                                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${theme.badge}`}>
                                    {row.discountInfo.label}
                                  </span>
                                ) : null}
                              </div>

                              {row.orderId ? (
                                <button
                                  type="button"
                                  onClick={() => navigate(`/seller/orders/${row.orderId}`)}
                                  className="mt-2 text-left font-semibold hover:text-orange-500"
                                >
                                  {row.title}
                                </button>
                              ) : (
                                <p className="mt-2 font-semibold">{row.title}</p>
                              )}

                              {row.subtitle ? (
                                <p className={`mt-1 text-sm ${theme.mutedText}`}>{row.subtitle}</p>
                              ) : null}
                            </div>
                          </div>
                        </td>

                        <td className={`px-4 py-4 text-sm ${theme.mutedText}`}>
                          {row.orderId ? (
                            <div className="space-y-2">
                              <p className="font-semibold text-inherit">{row.orderNumber}</p>
                              <button
                                type="button"
                                onClick={() => navigate(`/seller/orders/${row.orderId}`)}
                                className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition ${theme.action}`}
                              >
                                View order
                                <ExternalLink className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>

                        <td className="px-4 py-4">
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{formatSellerCurrency(row.grossAmount)}</span>
                              <span title={buildFeeTooltip(row)} className={theme.softText}>
                                <Info className="h-4 w-4" />
                              </span>
                            </div>
                            <p className={theme.mutedText}>
                              Platform fee: {formatSellerCurrency(row.feeBreakdown?.platformFee || 0)}
                            </p>
                            {toAmount(row.feeBreakdown?.deliveryFee) > 0 ? (
                              <p className={theme.mutedText}>
                                Delivery fee: {formatSellerCurrency(row.feeBreakdown?.deliveryFee || 0)}
                              </p>
                            ) : null}
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <p className={`text-lg font-bold ${row.netAmount < 0 ? 'text-red-500' : 'text-orange-500'}`}>
                            {formatSellerCurrency(row.netAmount)}
                          </p>
                          <p className={`mt-1 text-xs ${theme.softText}`}>What you actually keep</p>
                        </td>

                        <td className="px-4 py-4">
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${payoutStatusTone(row.status, themeState.darkMode)}`}>
                            {row.status}
                          </span>
                        </td>

                        <td className={`px-4 py-4 text-sm ${theme.mutedText}`}>
                          <div className="space-y-2">
                            <p>{buildRowTimingLabel(row)}</p>
                            {row.adminHoldReason ? (
                              <p className="text-amber-600">{row.adminHoldReason}</p>
                            ) : null}
                            <p>Recorded on {formatShortDate(row.createdAt)}</p>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            {renderReceiptButton(row)}
                            {renderViewOrderButton(row)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </SellerSection>
    </SellerShell>
  );
}

