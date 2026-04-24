import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, Download, ReceiptText, Search, ShieldCheck, Wallet } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/FooterSlim';
import { RetryablePageError } from '../components/PageFeedback';
import { supabase } from '../supabaseClient';
import { getOrderDisplayDetails, getOrderItemsMap } from '../utils/orderItems';
import { getBuyerOrderTotal } from '../utils/orderAmounts';
import { generateReceipt, openReceiptWindow } from '../utils/receiptGenerator';
import { showGlobalError } from '../hooks/modalService';

const PAYMENT_FILTER_OPTIONS = [
  { value: 'ALL', label: 'All activity' },
  { value: 'IN_ESCROW', label: 'In escrow' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'REFUNDED', label: 'Refunded' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

function formatCurrency(value) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function toAmount(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
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

function getBuyerPaymentState(order) {
  const status = String(order?.status || '').toUpperCase();

  if (!status || status === 'PENDING') {
    return null;
  }

  if (status === 'REFUNDED') {
    return 'REFUNDED';
  }

  if (status === 'CANCELLED') {
    return 'CANCELLED';
  }

  if (status === 'COMPLETED') {
    return 'COMPLETED';
  }

  if (
    ['PAID_ESCROW', 'SHIPPED', 'READY_FOR_PICKUP', 'DELIVERED', 'DISPUTED'].includes(status)
  ) {
    return 'IN_ESCROW';
  }

  return 'COMPLETED';
}

function getRefundAmount(order) {
  const state = getBuyerPaymentState(order);
  const totalAmount = getBuyerOrderTotal(order);

  if (!state || !['REFUNDED', 'CANCELLED'].includes(state)) {
    return 0;
  }

  if (order?.resolution_type === 'partial_refund' && order?.resolution_amount != null) {
    return Math.min(totalAmount, Math.max(toAmount(order.resolution_amount), 0));
  }

  return totalAmount;
}

function paymentStateTone(state) {
  if (state === 'IN_ESCROW') {
    return 'bg-sky-100 text-sky-700';
  }

  if (state === 'COMPLETED') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (state === 'REFUNDED') {
    return 'bg-orange-100 text-orange-700';
  }

  if (state === 'CANCELLED') {
    return 'bg-red-100 text-red-700';
  }

  return 'bg-slate-100 text-slate-700';
}

function paymentStateLabel(state) {
  if (state === 'IN_ESCROW') {
    return 'IN ESCROW';
  }

  return state || 'UNKNOWN';
}

function buildPaymentMessage(entry) {
  if (entry.state === 'IN_ESCROW') {
    if (entry.orderStatus === 'DISPUTED') {
      return 'Your payment is still held while the dispute is being reviewed.';
    }

    if (entry.orderStatus === 'READY_FOR_PICKUP') {
      return 'Your payment is held until you inspect the items and confirm pickup.';
    }

    if (entry.orderStatus === 'DELIVERED') {
      return 'Your payment is still protected until you confirm delivery or report a problem.';
    }

    return 'Your payment is secured in escrow while the seller fulfills this order.';
  }

  if (entry.state === 'COMPLETED') {
    return 'This order was completed and the escrow payment has been released.';
  }

  if (entry.state === 'REFUNDED') {
    return `Refunded ${formatCurrency(entry.refundAmount)} back to you for this order.`;
  }

  if (entry.refundAmount > 0) {
    return `This order was cancelled and ${formatCurrency(entry.refundAmount)} was returned to you.`;
  }

  return 'This order was cancelled.';
}

function BuyerPaymentsSkeleton() {
  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8 animate-pulse">
        <div className="h-10 w-52 rounded bg-blue-100" />
        <div className="mt-2 h-4 w-80 rounded bg-blue-50" />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-28 rounded-[28px] bg-white" />
          ))}
        </div>
        <div className="mt-6 h-28 rounded-[28px] bg-white" />
        <div className="mt-6 space-y-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-[28px] bg-white p-5 shadow-sm">
              <div className="h-5 w-40 rounded bg-gray-200" />
              <div className="mt-3 h-4 w-full rounded bg-gray-100" />
              <div className="mt-2 h-4 w-4/5 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}

export default function BuyerPayments() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [orderItemsMap, setOrderItemsMap] = useState({});
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [downloadingOrderId, setDownloadingOrderId] = useState(null);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setLoadError('');

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        navigate('/login');
        return;
      }

      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, role')
        .eq('id', session.user.id)
        .single();

      if (userError || !user || user.role !== 'buyer') {
        navigate('/marketplace');
        return;
      }

      const { data: orderRows, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .eq('buyer_id', user.id)
        .neq('status', 'PENDING')
        .order('created_at', { ascending: false });

      if (ordersError) {
        throw ordersError;
      }

      let itemsMap = {};
      try {
        itemsMap = await getOrderItemsMap(orderRows || []);
      } catch (itemsError) {
        console.error('Buyer payment order items error:', itemsError);
      }

      setOrders(orderRows || []);
      setOrderItemsMap(itemsMap);
    } catch (error) {
      console.error('Buyer payments load failed:', error);
      setLoadError('Unable to load payment history. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const paymentEntries = useMemo(() => {
    return orders
      .map((order) => {
        const state = getBuyerPaymentState(order);
        if (!state) {
          return null;
        }

        const items = orderItemsMap[order.id] || [];
        const display = getOrderDisplayDetails(items);
        const chargedAmount = getBuyerOrderTotal(order, items);
        const refundAmount = getRefundAmount(order);

        return {
          id: order.id,
          orderId: order.id,
          orderNumber: order.order_number || order.id.slice(0, 8),
          orderStatus: order.status,
          state,
          createdAt: order.created_at,
          chargedAmount,
          refundAmount,
          escrowAmount: state === 'IN_ESCROW' ? chargedAmount : 0,
          displayName: display.displayName,
          image: display.image,
          itemCount: display.itemCount,
          message: buildPaymentMessage({
            state,
            refundAmount,
            orderStatus: order.status,
          }),
        };
      })
      .filter(Boolean);
  }, [orderItemsMap, orders]);

  const paymentStats = useMemo(() => {
    return paymentEntries.reduce(
      (accumulator, entry) => {
        accumulator.charged += entry.chargedAmount;
        accumulator.escrow += entry.escrowAmount;
        accumulator.refunded += entry.refundAmount;
        return accumulator;
      },
      { charged: 0, escrow: 0, refunded: 0 }
    );
  }, [paymentEntries]);

  const filteredEntries = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const fromTimestamp = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTimestamp = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;

    return paymentEntries.filter((entry) => {
      const createdTimestamp = new Date(entry.createdAt).getTime();
      const matchesSearch =
        !normalizedSearch ||
        entry.displayName.toLowerCase().includes(normalizedSearch) ||
        entry.orderNumber.toLowerCase().includes(normalizedSearch);

      if (statusFilter !== 'ALL' && entry.state !== statusFilter) {
        return false;
      }

      if (!matchesSearch) {
        return false;
      }

      if (fromTimestamp && createdTimestamp < fromTimestamp) {
        return false;
      }

      if (toTimestamp && createdTimestamp > toTimestamp) {
        return false;
      }

      return true;
    });
  }, [dateFrom, dateTo, paymentEntries, searchTerm, statusFilter]);

  const handleDownloadReceipt = async (orderId) => {
    const receiptWindow = openReceiptWindow();

    if (!receiptWindow) {
      showGlobalError(
        'Receipt unavailable',
        'Your browser blocked the receipt window. Please allow pop-ups and try again.'
      );
      return;
    }

    setDownloadingOrderId(orderId);

    try {
      await generateReceipt(orderId, receiptWindow);
    } catch (error) {
      console.error('Receipt generation failed:', error);
      if (!String(error?.message || '').toLowerCase().includes('blocked the receipt window')) {
        showGlobalError(
          'Receipt unavailable',
          error.message || 'Unable to generate receipt right now.'
        );
      }
    } finally {
      setDownloadingOrderId(null);
    }
  };

  if (loading) {
    return <BuyerPaymentsSkeleton />;
  }

  if (loadError && orders.length === 0) {
    return (
      <div className="min-h-screen flex flex-col bg-blue-50">
        <Navbar />
        <RetryablePageError
          className="flex-1"
          title="Unable to load payment history"
          message={loadError}
          onRetry={loadPayments}
        />
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        <section className="rounded-[28px] border border-blue-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-500">
                Buyer payments
              </p>
              <h1 className="mt-2 text-3xl font-bold text-blue-950">Your actual payment activity</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                This page only shows money that was successfully charged, held in escrow, completed,
                or refunded. Unpaid orders stay in checkout and do not appear here.
              </p>
            </div>

            <div className="rounded-3xl border border-sky-100 bg-sky-50 px-5 py-4 text-left lg:max-w-xs">
              <div className="flex items-center gap-2 text-sky-700">
                <ShieldCheck className="h-5 w-5" />
                <p className="text-sm font-semibold">Escrow protection</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Money stays protected until the seller fulfills the order and you confirm delivery or pickup.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-[28px] border border-blue-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Successfully charged
            </p>
            <p className="mt-3 text-3xl font-bold text-blue-950">
              {formatCurrency(paymentStats.charged)}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Total amount you have actually paid across successful orders.
            </p>
          </div>

          <div className="rounded-[28px] border border-blue-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Still in escrow
            </p>
            <p className="mt-3 text-3xl font-bold text-sky-700">
              {formatCurrency(paymentStats.escrow)}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Payments currently protected while orders are being fulfilled or reviewed.
            </p>
          </div>

          <div className="rounded-[28px] border border-blue-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Refunded back
            </p>
            <p className="mt-3 text-3xl font-bold text-orange-600">
              {formatCurrency(paymentStats.refunded)}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Money already returned to you through refunds or cancellations.
            </p>
          </div>
        </section>

        <section className="mt-6 rounded-[28px] border border-blue-100 bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))]">
            <div>
              <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                <Search className="h-4 w-4" />
                Search
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Order number or product name"
                  className="w-full rounded-full border border-blue-200 py-3 pl-10 pr-4 text-sm text-slate-900 focus:border-orange-400 focus:outline-none focus:ring-4 focus:ring-orange-100"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                <Wallet className="h-4 w-4" />
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="w-full rounded-full border border-blue-200 px-4 py-3 text-sm text-slate-900 focus:border-orange-400 focus:outline-none focus:ring-4 focus:ring-orange-100"
              >
                {PAYMENT_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                <CalendarDays className="h-4 w-4" />
                From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="w-full rounded-full border border-blue-200 px-4 py-3 text-sm text-slate-900 focus:border-orange-400 focus:outline-none focus:ring-4 focus:ring-orange-100"
              />
            </div>

            <div>
              <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                <CalendarDays className="h-4 w-4" />
                To
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="w-full rounded-full border border-blue-200 px-4 py-3 text-sm text-slate-900 focus:border-orange-400 focus:outline-none focus:ring-4 focus:ring-orange-100"
              />
            </div>
          </div>
        </section>

        {filteredEntries.length === 0 ? (
          <section className="mt-6 rounded-[28px] border border-dashed border-blue-200 bg-white p-12 text-center shadow-sm">
            <ReceiptText className="mx-auto h-14 w-14 text-blue-200" />
            <h2 className="mt-4 text-xl font-bold text-blue-950">No matching payment activity</h2>
            <p className="mt-2 text-sm text-slate-500">
              Try another filter, date range, or search term to find the payment you need.
            </p>
          </section>
        ) : (
          <section className="mt-6 space-y-4">
            {filteredEntries.map((entry) => (
              <article
                key={entry.id}
                className="rounded-[28px] border border-blue-100 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      <img
                        src={entry.image}
                        alt={entry.displayName}
                        onError={(event) => {
                          event.currentTarget.src = '/placeholder.svg';
                        }}
                        className="h-20 w-20 rounded-3xl border border-blue-100 object-cover"
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${paymentStateTone(entry.state)}`}
                          >
                            {paymentStateLabel(entry.state)}
                          </span>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                            {entry.itemCount > 1 ? `${entry.itemCount} items` : 'Single item'}
                          </span>
                        </div>

                        <h2 className="mt-3 text-lg font-bold text-slate-900">
                          {entry.displayName}
                        </h2>
                        <div className="mt-2 flex flex-col gap-1 text-sm text-slate-600 sm:flex-row sm:flex-wrap sm:gap-4">
                          <span>Order #{entry.orderNumber}</span>
                          <span>Payment date: {formatShortDate(entry.createdAt)}</span>
                          <span>
                            Charged:{' '}
                            <strong className="text-slate-900">
                              {formatCurrency(entry.chargedAmount)}
                            </strong>
                          </span>
                          {entry.refundAmount > 0 ? (
                            <span>
                              Refunded:{' '}
                              <strong className="text-orange-600">
                                {formatCurrency(entry.refundAmount)}
                              </strong>
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                          {entry.message}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Link
                      to={`/buyer/orders/${entry.orderId}`}
                      className="rounded-full border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-900 transition hover:border-orange-300 hover:text-orange-600"
                    >
                      View order
                    </Link>

                    <button
                      type="button"
                      onClick={() => handleDownloadReceipt(entry.orderId)}
                      disabled={downloadingOrderId === entry.orderId}
                      className="inline-flex items-center gap-2 rounded-full bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Download className="h-4 w-4" />
                      {downloadingOrderId === entry.orderId ? 'Preparing...' : 'Download receipt'}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
