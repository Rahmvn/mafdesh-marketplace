import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Clock3, CreditCard, Wallet } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { getSessionWithRetry } from '../utils/authResilience';
import { showGlobalConfirm } from '../hooks/modalService';
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

function payoutStatusTone(status, darkMode) {
  if (status === 'PAID') {
    return darkMode ? 'bg-emerald-500/15 text-emerald-200' : 'bg-emerald-100 text-emerald-700';
  }

  return darkMode ? 'bg-orange-500/15 text-orange-200' : 'bg-orange-100 text-orange-700';
}

export default function SellerPayments() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const themeState = useSellerTheme(currentUser?.is_verified ?? null);
  const theme = getSellerThemeClasses(themeState.darkMode);

  const handleLogout = async () => {
    showGlobalConfirm('Log Out', 'Are you sure you want to log out of your account?', async () => {
      await supabase.auth.signOut();
      localStorage.clear();
      window.location.href = '/login';
    });
  };

  const loadPayouts = useCallback(async (sellerId) => {
    setLoading(true);

    const { data, error } = await supabase
      .from('seller_payouts')
      .select(
        `
          *,
          orders (
            id,
            order_number,
            created_at,
            product:products!orders_product_id_fkey (
              name,
              images
            )
          )
        `
      )
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    setPayouts(data || []);
    setLoading(false);
  }, []);

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
    await loadPayouts(userId);
  }, [loadPayouts, navigate]);

  useEffect(() => {
    init();
  }, [init]);

  const payoutStats = useMemo(() => {
    let earned = 0;
    let pending = 0;
    let paid = 0;

    payouts.forEach((payout) => {
      const amount = Number(payout.amount || 0);
      earned += amount;

      if (payout.status === 'PENDING') {
        pending += amount;
      }

      if (payout.status === 'PAID') {
        paid += amount;
      }
    });

    return {
      earned,
      pending,
      paid,
    };
  }, [payouts]);

  if (loading) {
    return <SellerWorkspaceSkeleton darkMode={themeState.darkMode} mode="payments" />;
  }

  return (
    <SellerShell
      currentUser={currentUser}
      onLogout={handleLogout}
      themeState={themeState}
    >
      <section className="grid gap-4 md:grid-cols-3">
        <SellerStatCard
          theme={theme}
          label="Total earned"
          value={formatSellerCurrency(payoutStats.earned)}
          icon={Wallet}
          accentClass="bg-gradient-to-br from-blue-900 to-slate-700"
        />
        <SellerStatCard
          theme={theme}
          label="Pending payout"
          value={formatSellerCurrency(payoutStats.pending)}
          icon={Clock3}
          accentClass="bg-gradient-to-br from-orange-500 to-amber-500"
        />
        <SellerStatCard
          theme={theme}
          label="Paid out"
          value={formatSellerCurrency(payoutStats.paid)}
          icon={CreditCard}
          accentClass="bg-gradient-to-br from-emerald-500 to-green-600"
        />
      </section>

      <SellerSection
        theme={theme}
        eyebrow="Payout history"
        title="Track each seller payout"
        action={
          <button
            type="button"
            onClick={() => navigate('/seller/orders')}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${theme.action}`}
          >
            Open orders
            <ArrowRight className="h-4 w-4" />
          </button>
        }
      >
        {payouts.length === 0 ? (
          <SellerEmptyState
            theme={theme}
            icon={Wallet}
            title="No earnings yet"
          />
        ) : (
          <>
            <div className="space-y-4 md:hidden">
              {payouts.map((payout) => {
                const product = payout.orders?.product;

                return (
                  <article
                    key={payout.id}
                    className={`rounded-[24px] p-4 ${theme.panelMuted}`}
                  >
                    <div className="flex items-start gap-4">
                      <img
                        src={product?.images?.[0] || 'https://placehold.co/120x120'}
                        alt={product?.name || 'Order payout'}
                        className="h-16 w-16 rounded-2xl object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">
                            {product?.name || 'Multi-item order payout'}
                          </p>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${payoutStatusTone(payout.status, themeState.darkMode)}`}
                          >
                            {payout.status}
                          </span>
                        </div>
                        <p className={`mt-1 text-sm ${theme.mutedText}`}>
                          Order #{payout.order_id?.slice(0, 8)}
                        </p>
                        <p className="mt-3 text-lg font-bold text-orange-500">
                          {formatSellerCurrency(payout.amount)}
                        </p>
                        <p className={`mt-1 text-sm ${theme.mutedText}`}>
                          {new Date(payout.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className={`hidden overflow-hidden rounded-[24px] md:block ${theme.panelMuted}`}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px]">
                  <thead className={theme.tableHeader}>
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Product</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Order</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Amount</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.map((payout) => {
                      const product = payout.orders?.product;

                      return (
                        <tr
                          key={payout.id}
                          className={`border-t transition ${theme.divider} ${theme.rowHover}`}
                        >
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <img
                                src={product?.images?.[0] || 'https://placehold.co/120x120'}
                                alt={product?.name || 'Order payout'}
                                className="h-12 w-12 rounded-2xl object-cover"
                              />
                              <span className="font-semibold">
                                {product?.name || 'Multi-item order payout'}
                              </span>
                            </div>
                          </td>
                          <td className={`px-4 py-4 text-sm ${theme.mutedText}`}>
                            #{payout.order_id?.slice(0, 8)}
                          </td>
                          <td className="px-4 py-4 font-semibold text-orange-500">
                            {formatSellerCurrency(payout.amount)}
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${payoutStatusTone(payout.status, themeState.darkMode)}`}
                            >
                              {payout.status}
                            </span>
                          </td>
                          <td className={`px-4 py-4 text-sm ${theme.mutedText}`}>
                            {new Date(payout.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })}
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

