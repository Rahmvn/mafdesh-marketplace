import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, FileText, Shield } from 'lucide-react';
import Navbar from '../../components/Navbar';
import FooterSlim from '../../components/FooterSlim';
import { supabase } from '../../supabaseClient';
import { getSessionWithRetry } from '../../utils/authResilience';
import useModal from '../../hooks/useModal';
import {
  getSellerThemeClasses,
  useSellerTheme,
} from '../../components/seller/SellerShell';
import { getStoredUser, setStoredUser } from '../../utils/storage';

const AGREEMENT_VERSION = '1.0-2026';

const AGREEMENT_SECTIONS = [
{
  title: '1. Marketplace Values and Seller Responsibility',
  paragraphs: [
    'Mafdesh is an ethics-driven marketplace that promotes lawful and honest trade. Sellers are expected to uphold transparency, fairness, and responsible conduct when listing products or interacting with buyers.',
    'As a seller, you are responsible for ensuring that every product or service you list complies with Nigerian law, does not violate platform rules, and aligns with ethical trade standards. Mafdesh reserves the right to reject, remove, restrict, or suspend listings or accounts that violate these principles.',
    'By using Mafdesh as a seller, you agree to maintain honesty in pricing, product quality, communication, and fulfilment. Repeated violations of trust, misleading behaviour, or prohibited listings may result in enforcement action without prior notice.',
  ],
},
  {
    title: '2. Product Listing Standards',
    paragraphs: [
      'You agree to provide accurate, honest, and complete product descriptions. Photos must represent the actual product being sold. You must not use misleading titles, fake specifications, or stock photos that misrepresent the item. Every listing must include at least three clear photos of the actual product.',
    ],
  },
  {
    title: '3. Shipping Obligations',
    paragraphs: [
      'You agree to ship or arrange pickup within 2 business days of receiving a confirmed order. Failure to fulfil an order within this window may result in automatic cancellation and refund to the buyer. You must use trackable shipping methods for delivery orders. You are responsible for proper packaging to prevent damage during transit.',
    ],
  },
  {
    title: '4. Returns and Refunds',
    paragraphs: [
      'You agree to accept returns for items that are damaged, wrong, or significantly different from the listing description. You agree to cover return shipping costs when the fault is yours. Refunds must be processed within 7 days of receiving a returned item. Attempting to avoid legitimate refunds is grounds for suspension.',
    ],
  },
  {
    title: '5. Prohibited Items',
    paragraphs: ['You agree never to list the following on Mafdesh:'],
    bullets: [
      'Alcohol, pork, and non-halal meat or food products',
      'Tobacco and cigarettes',
      'Gambling equipment or lottery tickets',
      'Explicit, adult, or sexually suggestive content',
      'Counterfeit, stolen, or illegally obtained goods',
      'Any item prohibited under Nigerian federal law',
      'Interest-bearing financial products',
    ],
    footer:
      'Listing any prohibited item will result in immediate removal and permanent account suspension.',
  },
  {
    title: '6. Account Conduct',
    paragraphs: [
      'You agree to respond to buyer messages within 24 hours. You agree to treat all buyers with respect and honesty. You agree not to manipulate reviews, create fake orders, or engage in any form of platform abuse. You agree not to attempt to conduct transactions outside of Mafdesh to avoid platform fees.',
    ],
  },
  {
    title: '7. Platform Fee',
    paragraphs: [
      'You acknowledge that Mafdesh charges a 5% platform fee on every completed sale. This fee is deducted from your payout before funds are released to your bank account. The platform fee is non-negotiable and non-refundable.',
    ],
  },
  {
    title: '8. Consequences of Violation',
    paragraphs: [
      'Violations of this agreement may result in: warning and listing removal, temporary account suspension, permanent account ban, and legal action where applicable under Nigerian law. Mafdesh reserves the right to make the final decision on all enforcement actions.',
    ],
  },
];

function AgreementLoading({ theme, themeState }) {
  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-300 ${theme.shell}`}>
      <Navbar
        theme={themeState.darkMode ? 'dark' : 'light'}
        themeToggle={
          themeState.canToggleTheme
            ? {
                darkMode: themeState.darkMode,
                onToggle: themeState.toggleTheme,
              }
            : null
        }
      />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 sm:px-6 lg:px-8">
        <div className={`rounded-2xl p-6 sm:p-8 ${theme.panel}`}>
          <div className="h-6 w-40 animate-pulse rounded bg-slate-200/70" />
          <div className="mt-3 h-4 w-72 animate-pulse rounded bg-slate-200/60" />
          <div className="mt-6 space-y-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <div className="h-5 w-48 animate-pulse rounded bg-slate-200/70" />
                <div className="h-4 w-full animate-pulse rounded bg-slate-200/50" />
                <div className="h-4 w-11/12 animate-pulse rounded bg-slate-200/50" />
              </div>
            ))}
          </div>
        </div>
      </main>
      <FooterSlim />
    </div>
  );
}

export default function SellerAgreement() {
  const navigate = useNavigate();
  const location = useLocation();
  const scrollContainerRef = useRef(null);
  const sentinelRef = useRef(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasReachedBottom, setHasReachedBottom] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  const themeState = useSellerTheme(
    currentUser?.is_verified_seller ?? currentUser?.is_verified ?? null
  );
  const theme = getSellerThemeClasses(themeState.darkMode);
  const { showError, showSuccess, ModalComponent } = useModal({
    darkMode: themeState.darkMode,
  });

  const redirectTo = useMemo(() => {
    const from = location.state?.from;
    return typeof from === 'string' && from !== '/seller/agreement'
      ? from
      : '/seller/dashboard';
  }, [location.state]);

  useEffect(() => {
    let isMounted = true;

    const loadUser = async () => {
      try {
        const { data, error: sessionError } = await getSessionWithRetry(supabase.auth);

        if (sessionError) {
          throw sessionError;
        }

        if (!data.session) {
          navigate('/login', { replace: true });
          return;
        }

        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('id', data.session.user.id)
          .single();

        if (userError || !userData) {
          throw userError || new Error('User record not found.');
        }

        if (userData.role !== 'seller') {
          navigate('/marketplace', { replace: true });
          return;
        }

        if (userData.seller_agreement_accepted) {
          navigate(redirectTo, { replace: true });
          return;
        }

        if (!isMounted) {
          return;
        }

        setCurrentUser(userData);
      } catch (error) {
        console.error('Seller agreement load failed:', error);
        showError(
          'Load Failed',
          error?.message || 'We could not load your seller agreement right now.'
        );
        navigate('/marketplace', { replace: true });
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadUser();

    return () => {
      isMounted = false;
    };
  }, [navigate, redirectTo, showError]);

  useEffect(() => {
    if (loading || !scrollContainerRef.current || !sentinelRef.current) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setHasReachedBottom(entry.isIntersecting);
      },
      {
        root: scrollContainerRef.current,
        threshold: 1,
      }
    );

    observer.observe(sentinelRef.current);

    return () => {
      observer.disconnect();
    };
  }, [loading]);

  const canSubmit = isChecked && hasReachedBottom && !isSubmitting;

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!currentUser?.id || !canSubmit) {
      return;
    }

    try {
      setIsSubmitting(true);

      const { data: updatedUser, error } = await supabase
        .from('users')
        .update({ seller_agreement_accepted: true })
        .eq('id', currentUser.id)
        .select(
          'seller_agreement_accepted, seller_agreement_accepted_at, seller_agreement_version'
        )
        .single();

      if (error) {
        throw error;
      }

      const storedUser = getStoredUser() || {};
      const nextUser = {
        ...storedUser,
        seller_agreement_accepted: true,
        seller_agreement_accepted_at:
          updatedUser?.seller_agreement_accepted_at || storedUser.seller_agreement_accepted_at,
        seller_agreement_version:
          updatedUser?.seller_agreement_version || storedUser.seller_agreement_version,
      };

      setStoredUser(nextUser);
      setCurrentUser((previousUser) => ({
        ...(previousUser || {}),
        ...nextUser,
      }));

      showSuccess(
        'Agreement Accepted',
        'You have accepted the Seller Agreement and can now continue.'
      );

      window.setTimeout(() => {
        navigate(redirectTo, { replace: true });
      }, 700);
    } catch (error) {
      console.error('Seller agreement acceptance failed:', error);
      showError(
        'Acceptance Failed',
        error?.message || 'We could not record your agreement right now. Please try again.'
      );
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <AgreementLoading theme={theme} themeState={themeState} />;
  }

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-300 ${theme.shell}`}>
      <Navbar
        theme={themeState.darkMode ? 'dark' : 'light'}
        themeToggle={
          themeState.canToggleTheme
            ? {
                darkMode: themeState.darkMode,
                onToggle: themeState.toggleTheme,
              }
            : null
        }
      />

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 sm:px-6 lg:px-8">
        <div className={`rounded-2xl p-6 sm:p-8 ${theme.panel}`}>
          <button
            type="button"
            onClick={() => navigate('/seller/dashboard')}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${theme.action}`}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </button>

          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-3xl">
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${theme.badge}`}>
                <Shield className="h-4 w-4" />
                Seller agreement
              </span>
              <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                Accept the Seller Agreement
              </h1>
              <p className={`mt-3 text-sm leading-7 sm:text-base ${theme.mutedText}`}>
                You must read and accept this agreement before you can add or edit products on
                Mafdesh.
              </p>
            </div>

            <div className={`rounded-xl px-4 py-3 text-sm ${theme.panelMuted}`}>
              <p className="font-semibold">Agreement version</p>
              <p className={`mt-1 ${theme.mutedText}`}>{AGREEMENT_VERSION}</p>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="relative">
              <div
                ref={scrollContainerRef}
                className={`max-h-[540px] overflow-y-auto rounded-2xl border p-5 sm:p-6 ${theme.panelMuted}`}
              >
                <div className="space-y-6">
                  {AGREEMENT_SECTIONS.map((section) => (
                    <section key={section.title}>
                      <div className="flex items-start gap-3">
                        <div className="mt-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-orange-500 text-white">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-lg font-semibold">{section.title}</h2>
                          <div className={`mt-3 space-y-3 text-sm leading-7 sm:text-[15px] ${theme.mutedText}`}>
                            {section.paragraphs?.map((paragraph) => (
                              <p key={paragraph}>{paragraph}</p>
                            ))}

                            {section.bullets?.length ? (
                              <ul className="list-disc space-y-2 pl-5">
                                {section.bullets.map((bullet) => (
                                  <li key={bullet}>{bullet}</li>
                                ))}
                              </ul>
                            ) : null}

                            {section.footer ? <p>{section.footer}</p> : null}
                          </div>
                        </div>
                      </div>
                    </section>
                  ))}

                  <div ref={sentinelRef} className="h-1 w-full" aria-hidden="true" />
                </div>
              </div>

              {!hasReachedBottom && (
                <div
                  className={`pointer-events-none absolute inset-x-0 bottom-0 h-20 rounded-b-2xl ${
                    themeState.darkMode
                      ? 'bg-gradient-to-t from-slate-900 via-slate-900/90 to-transparent'
                      : 'bg-gradient-to-t from-white via-white/95 to-transparent'
                  }`}
                />
              )}
            </div>

            <form onSubmit={handleSubmit} className={`rounded-2xl p-5 sm:p-6 ${theme.panelMuted}`}>
              <h2 className="text-xl font-semibold">Before you continue</h2>
              <p className={`mt-2 text-sm leading-6 ${theme.mutedText}`}>
                Scroll through the full agreement, confirm you understand it, then accept to
                continue to your seller tools.
              </p>

              <div className="mt-6 space-y-4">
                <div className={`rounded-xl border p-4 ${hasReachedBottom ? 'border-emerald-300 bg-emerald-50/80 text-emerald-800' : themeState.darkMode ? 'border-slate-700 bg-slate-900/70 text-slate-200' : 'border-slate-200 bg-white text-slate-700'}`}>
                  <div className="flex items-start gap-3">
                    <CheckCircle2
                      className={`mt-0.5 h-5 w-5 flex-shrink-0 ${
                        hasReachedBottom ? 'text-emerald-600' : 'text-orange-500'
                      }`}
                    />
                    <div>
                      <p className="font-semibold">
                        {hasReachedBottom
                          ? 'Agreement fully reviewed'
                          : 'Scroll to the bottom to unlock acceptance'}
                      </p>
                      <p className="mt-1 text-sm">
                        {hasReachedBottom
                          ? 'You have reached the end of the agreement text.'
                          : 'The accept button will stay disabled until you reach the bottom of the agreement.'}
                      </p>
                    </div>
                  </div>
                </div>

                <label className="flex items-start gap-3 rounded-xl border border-orange-200 bg-orange-50/80 p-4">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(event) => setIsChecked(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-orange-300 text-orange-600 focus:ring-orange-500"
                  />
                  <span className="text-sm leading-6 text-orange-900">
                    I have read the Seller Agreement in full and I agree to follow all of its
                    terms on Mafdesh.
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className={`mt-6 inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition ${
                  canSubmit
                    ? theme.actionPrimary
                    : themeState.darkMode
                      ? 'cursor-not-allowed bg-slate-800 text-slate-500'
                      : 'cursor-not-allowed bg-slate-200 text-slate-500'
                }`}
              >
                {isSubmitting ? 'Saving acceptance...' : 'Accept and Continue'}
              </button>
            </form>
          </div>
        </div>
      </main>

      <FooterSlim />
      <ModalComponent />
    </div>
  );
}
