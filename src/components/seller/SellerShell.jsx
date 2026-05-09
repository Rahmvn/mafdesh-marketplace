import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Shield,
  Sparkles,
} from 'lucide-react';
import Navbar from '../Navbar';
import Footer from '../FooterSlim';
import VerificationBadge from '../VerificationBadge';

export const VERIFIED_SELLER_THEME_KEY = 'verified_seller_theme';

export function formatSellerCurrency(value) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function normalizeTheme(value, isVerified) {
  if (isVerified === false) {
    return 'light';
  }

  return value === 'dark' ? 'dark' : 'light';
}

export function useSellerTheme(isVerified) {
  const [theme, setTheme] = useState(() =>
    normalizeTheme(localStorage.getItem(VERIFIED_SELLER_THEME_KEY), isVerified)
  );

  useEffect(() => {
    const storedTheme = localStorage.getItem(VERIFIED_SELLER_THEME_KEY);
    setTheme(normalizeTheme(storedTheme, isVerified));
  }, [isVerified]);

  useEffect(() => {
    if (isVerified) {
      localStorage.setItem(VERIFIED_SELLER_THEME_KEY, theme);
    }
  }, [isVerified, theme]);

  const toggleTheme = () => {
    if (!isVerified) {
      return;
    }

    setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'));
  };

  return {
    theme,
    darkMode: theme === 'dark',
    canToggleTheme: isVerified === true,
    toggleTheme,
  };
}

export function getSellerThemeClasses(darkMode) {
  if (darkMode) {
    return {
      shell:
        'bg-[linear-gradient(180deg,_#020617_0%,_#0f172a_55%,_#111827_100%)] text-slate-100',
      panel:
        'border border-slate-800/90 bg-slate-900/88 text-slate-100 shadow-[0_18px_40px_rgba(2,6,23,0.35)] backdrop-blur-sm',
      panelSoft:
        'border border-slate-800 bg-slate-950/70 text-slate-100',
      panelMuted:
        'border border-slate-800 bg-slate-900/55 text-slate-100',
      input:
        'border border-slate-700 bg-slate-950/80 text-slate-100 placeholder:text-slate-500 focus:border-orange-400 focus:outline-none focus:ring-4 focus:ring-orange-500/10',
      mutedText: 'text-slate-300',
      softText: 'text-slate-400',
      subtleText: 'text-slate-500',
      action:
        'border border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800',
      actionGhost:
        'text-slate-300 hover:text-orange-300 hover:bg-slate-900/80',
      actionPrimary:
        'bg-orange-500 text-white hover:bg-orange-400 shadow-[0_12px_30px_rgba(249,115,22,0.28)]',
      divider: 'border-slate-800',
      badge:
        'border border-orange-500/30 bg-orange-500/10 text-orange-200',
      tableHeader: 'bg-slate-950/90 text-slate-200',
      rowHover: 'hover:bg-slate-800/45',
      empty:
        'border border-dashed border-slate-700 bg-slate-950/70 text-slate-300',
    };
  }

  return {
    shell:
      'bg-[linear-gradient(180deg,_#f8fbff_0%,_#ffffff_55%,_#fff7ed_100%)] text-slate-900',
    panel:
      'border border-blue-100 bg-white/95 text-slate-900 shadow-sm backdrop-blur-sm',
    panelSoft:
      'border border-blue-100 bg-white text-slate-900',
    panelMuted:
      'border border-slate-100 bg-slate-50/90 text-slate-900',
    input:
      'border border-blue-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-4 focus:ring-orange-100',
    mutedText: 'text-slate-600',
    softText: 'text-slate-500',
    subtleText: 'text-slate-400',
    action:
      'border border-blue-200 bg-white text-blue-950 hover:border-orange-300 hover:text-orange-600',
    actionGhost:
      'text-blue-700 hover:text-orange-600 hover:bg-orange-50',
    actionPrimary:
      'bg-orange-500 text-white hover:bg-orange-600 shadow-[0_12px_30px_rgba(249,115,22,0.18)]',
    divider: 'border-slate-100',
    badge:
      'border border-orange-200 bg-orange-50 text-orange-700',
    tableHeader: 'bg-slate-950 text-white',
    rowHover: 'hover:bg-blue-50/70',
    empty:
      'border border-dashed border-blue-200 bg-blue-50/60 text-blue-900',
  };
}

export function SellerShell({
  currentUser,
  onLogout,
  title,
  subtitle,
  actions,
  themeState,
  showHeader = false,
  footerComponent: FooterComponent = Footer,
  children,
}) {
  const theme = useMemo(
    () => getSellerThemeClasses(themeState?.darkMode),
    [themeState?.darkMode]
  );
  const isVerified = Boolean(currentUser?.is_verified || currentUser?.is_verified_seller);

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-300 ${theme.shell}`}
      data-theme={themeState?.theme || 'light'}
    >
      <Navbar
        onLogout={onLogout}
        theme={themeState?.darkMode ? 'dark' : 'light'}
        themeToggle={
          themeState?.canToggleTheme
            ? {
                darkMode: themeState.darkMode,
                onToggle: themeState.toggleTheme,
              }
            : null
        }
      />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {showHeader && (
          <section className={`rounded-lg p-5 sm:p-6 ${theme.panel}`}>
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${theme.badge}`}>
                    {isVerified ? <Sparkles className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                    {isVerified ? 'Verified seller workspace' : 'Seller workspace'}
                  </span>
                  {isVerified && <VerificationBadge className="!bg-white/10 !text-orange-200" />}
                </div>

                <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
                <p className={`mt-3 max-w-2xl text-sm leading-7 sm:text-base ${theme.mutedText}`}>
                  {subtitle}
                </p>

                {currentUser && (
                  <div className="mt-5 inline-flex flex-wrap items-center gap-3 text-sm">
                    <span className={`inline-flex items-center gap-2 rounded-md px-3 py-2 font-semibold ${theme.panelMuted}`}>
                      <Shield className="h-4 w-4 text-orange-500" />
                      {currentUser.business_name || currentUser.full_name || currentUser.email}
                    </span>
                    {currentUser.university_name && (
                      <span className={`inline-flex items-center gap-2 rounded-md px-3 py-2 ${theme.panelMuted}`}>
                        {currentUser.university_name}
                        {currentUser.university_state ? `, ${currentUser.university_state}` : ''}
                      </span>
                    )}
                    {isVerified && currentUser.verification_expiry && (
                      <span className={`inline-flex items-center gap-2 rounded-md px-3 py-2 ${theme.panelMuted}`}>
                        Verified until {new Date(currentUser.verification_expiry).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {actions}
              </div>
            </div>
          </section>
        )}

        {children}
      </main>

      <FooterComponent />
    </div>
  );
}

export function SellerSection({
  theme,
  eyebrow,
  title,
  description,
  action,
  children,
  className = '',
}) {
  return (
    <section className={`rounded-lg p-5 sm:p-6 ${theme.panel} ${className}`}>
      {(eyebrow || title || action) && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {eyebrow && (
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-500">
                {eyebrow}
              </p>
            )}
            {title && <h2 className="mt-2 text-2xl font-bold">{title}</h2>}
            {description && (
              <p className={`mt-2 text-sm leading-6 ${theme.mutedText}`}>
                {description}
              </p>
            )}
          </div>
          {action}
        </div>
      )}

      <div className={title || eyebrow || action ? 'mt-6' : ''}>{children}</div>
    </section>
  );
}

export function SellerStatCard({
  theme,
  label,
  value,
  note,
  icon: Icon,
  accentClass,
  indicator,
}) {
  return (
    <article className={`rounded-lg p-5 ${theme.panel}`}>
      <div className="flex items-center justify-between">
        <div className={`inline-flex h-12 w-12 items-center justify-center rounded-lg ${accentClass}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        {indicator || (
          <span className={`text-xs font-semibold uppercase tracking-[0.16em] ${theme.softText}`}>
            Seller
          </span>
        )}
      </div>
      <p className={`mt-4 text-sm font-semibold uppercase tracking-[0.16em] ${theme.softText}`}>
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      {note && <p className={`mt-2 text-sm leading-6 ${theme.mutedText}`}>{note}</p>}
    </article>
  );
}

export function SellerEmptyState({
  theme,
  icon: Icon,
  title,
  body,
  action,
}) {
  return (
    <div className={`rounded-lg p-8 text-center ${theme.empty}`}>
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="mt-4 text-lg font-bold">{title}</h3>
      <p className={`mt-2 text-sm leading-6 ${theme.mutedText}`}>{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SellerInlineAction({ theme, hrefText }) {
  return (
    <span className={`inline-flex items-center gap-2 text-sm font-semibold ${theme.actionGhost}`}>
      {hrefText}
      <ArrowRight className="h-4 w-4" />
    </span>
  );
}
