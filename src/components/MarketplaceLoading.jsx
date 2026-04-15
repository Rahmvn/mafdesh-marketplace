import React from 'react';
import Footer from './Footer';
import Navbar from './Navbar';
import { getSellerThemeClasses } from './seller/SellerShell';

function skeletonTone(isDarkTheme) {
  return isDarkTheme
    ? 'bg-[linear-gradient(90deg,rgba(15,23,42,0.92),rgba(30,41,59,0.95),rgba(15,23,42,0.92))]'
    : 'bg-[linear-gradient(90deg,#e2e8f0,#f8fafc,#e2e8f0)]';
}

function SkeletonBlock({ className, darkMode = false }) {
  return <div className={`animate-pulse rounded-2xl ${skeletonTone(darkMode)} ${className}`} />;
}

export function MarketplaceRouteLoader({ darkMode = false }) {
  const shellClass = darkMode
    ? 'min-h-screen bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.12),_transparent_30%),linear-gradient(180deg,_#020617_0%,_#0f172a_100%)] text-slate-100'
    : 'min-h-screen bg-[radial-gradient(circle_at_top,_rgba(251,146,60,0.16),_transparent_30%),linear-gradient(180deg,_#f8fbff_0%,_#ffffff_100%)] text-slate-900';
  const cardClass = darkMode
    ? 'border border-slate-800/90 bg-slate-950/75 shadow-[0_18px_40px_rgba(2,6,23,0.45)]'
    : 'border border-slate-200 bg-white/90 shadow-sm';
  const dotClass = darkMode ? 'bg-orange-300' : 'bg-orange-500';

  return (
    <div className={`flex min-h-screen items-center justify-center px-4 ${shellClass}`}>
      <div className={`w-full max-w-sm rounded-[28px] p-6 backdrop-blur-sm ${cardClass}`}>
        <span className="sr-only">Loading page</span>
        <div className="flex items-center gap-3">
          <SkeletonBlock darkMode={darkMode} className="h-12 w-12 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <SkeletonBlock darkMode={darkMode} className="h-4 w-28 rounded-full" />
            <SkeletonBlock darkMode={darkMode} className="h-3 w-40 rounded-full" />
          </div>
        </div>
        <div className="mt-6 flex items-center justify-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full animate-bounce ${dotClass}`} />
          <span className={`h-2.5 w-2.5 rounded-full animate-bounce ${dotClass}`} style={{ animationDelay: '120ms' }} />
          <span className={`h-2.5 w-2.5 rounded-full animate-bounce ${dotClass}`} style={{ animationDelay: '240ms' }} />
        </div>
      </div>
    </div>
  );
}

function SellerHeroSkeleton({ darkMode }) {
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="max-w-3xl">
        <div className="flex flex-wrap items-center gap-3">
          <SkeletonBlock darkMode={darkMode} className="h-9 w-48 rounded-full" />
        </div>
        <SkeletonBlock darkMode={darkMode} className="mt-5 h-10 w-64 sm:w-80" />
        <SkeletonBlock darkMode={darkMode} className="mt-4 h-4 w-full max-w-2xl" />
        <SkeletonBlock darkMode={darkMode} className="mt-2 h-4 w-11/12 max-w-xl" />
        <div className="mt-5 flex flex-wrap gap-3">
          <SkeletonBlock darkMode={darkMode} className="h-10 w-52" />
          <SkeletonBlock darkMode={darkMode} className="h-10 w-44" />
        </div>
      </div>
      <SkeletonBlock darkMode={darkMode} className="h-12 w-40 rounded-xl" />
    </div>
  );
}

function SellerStatsSkeleton({ darkMode, count = 4 }) {
  return (
    <section className={`grid gap-4 ${count === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2 xl:grid-cols-4'}`}>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className={`rounded-lg p-5 ${
            darkMode
              ? 'border border-slate-800/90 bg-slate-900/88'
              : 'border border-blue-100 bg-white/95'
          }`}
        >
          <div className="flex items-center justify-between">
            <SkeletonBlock darkMode={darkMode} className="h-12 w-12 rounded-xl" />
            <SkeletonBlock darkMode={darkMode} className="h-5 w-16 rounded-full" />
          </div>
          <SkeletonBlock darkMode={darkMode} className="mt-5 h-3 w-28 rounded-full" />
          <SkeletonBlock darkMode={darkMode} className="mt-3 h-8 w-16 rounded-xl" />
          <SkeletonBlock darkMode={darkMode} className="mt-4 h-3 w-40 rounded-full" />
          <SkeletonBlock darkMode={darkMode} className="mt-2 h-3 w-32 rounded-full" />
        </div>
      ))}
    </section>
  );
}

function SellerSectionSkeleton({ darkMode, rows = 3, compact = false }) {
  const theme = getSellerThemeClasses(darkMode);

  return (
    <section className={`rounded-lg p-5 sm:p-6 ${theme.panel}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <SkeletonBlock darkMode={darkMode} className="h-3 w-20 rounded-full" />
          <SkeletonBlock darkMode={darkMode} className="mt-3 h-8 w-52 rounded-xl" />
          <SkeletonBlock darkMode={darkMode} className="mt-3 h-3 w-full max-w-xl rounded-full" />
        </div>
        <SkeletonBlock darkMode={darkMode} className="h-10 w-32 rounded-full" />
      </div>
      <div className="mt-6 space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className={`rounded-xl p-4 ${
              darkMode
                ? 'border border-slate-800 bg-slate-900/55'
                : 'border border-slate-100 bg-slate-50/90'
            }`}
          >
            <div className={`flex ${compact ? 'items-center' : 'items-start'} gap-4`}>
              <SkeletonBlock darkMode={darkMode} className="h-12 w-12 flex-shrink-0 rounded-2xl" />
              <div className="min-w-0 flex-1">
                <SkeletonBlock darkMode={darkMode} className="h-4 w-40 rounded-full" />
                <SkeletonBlock darkMode={darkMode} className="mt-3 h-3 w-full max-w-lg rounded-full" />
                {!compact && (
                  <SkeletonBlock darkMode={darkMode} className="mt-2 h-3 w-10/12 max-w-md rounded-full" />
                )}
              </div>
              <SkeletonBlock darkMode={darkMode} className="h-10 w-24 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function SellerWorkspaceSkeleton({ darkMode = false, mode = 'dashboard' }) {
  const theme = getSellerThemeClasses(darkMode);

  const renderContent = () => {
    if (mode === 'payments') {
      return (
        <>
          <SellerStatsSkeleton darkMode={darkMode} count={3} />
          <SellerSectionSkeleton darkMode={darkMode} rows={4} compact />
        </>
      );
    }

    if (mode === 'products') {
      return (
        <>
          <SellerStatsSkeleton darkMode={darkMode} count={4} />
          <SellerSectionSkeleton darkMode={darkMode} rows={1} compact />
          <SellerSectionSkeleton darkMode={darkMode} rows={5} compact />
        </>
      );
    }

    if (mode === 'orders') {
      return (
        <>
          <SellerSectionSkeleton darkMode={darkMode} rows={1} compact />
          <SellerSectionSkeleton darkMode={darkMode} rows={4} />
        </>
      );
    }

    return (
      <>
        <SellerStatsSkeleton darkMode={darkMode} count={4} />
        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <SellerSectionSkeleton darkMode={darkMode} rows={3} />
          <SellerSectionSkeleton darkMode={darkMode} rows={4} compact />
        </section>
        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <SellerSectionSkeleton darkMode={darkMode} rows={4} compact />
          <SellerSectionSkeleton darkMode={darkMode} rows={4} compact />
        </section>
      </>
    );
  };

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-300 ${theme.shell}`}>
      <Navbar theme={darkMode ? 'dark' : 'light'} />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <section className={`rounded-lg p-5 sm:p-6 ${theme.panel}`}>
          <SellerHeroSkeleton darkMode={darkMode} />
        </section>
        {renderContent()}
      </main>
      <Footer />
    </div>
  );
}

export function MarketplaceDetailSkeleton({ darkMode = false }) {
  const shellClass = darkMode
    ? 'min-h-screen flex flex-col bg-[linear-gradient(180deg,_#020617_0%,_#111827_100%)] text-slate-100'
    : 'min-h-screen flex flex-col bg-slate-50 text-slate-900';
  const panelClass = darkMode
    ? 'border border-slate-800 bg-slate-900/88'
    : 'border border-slate-200 bg-white';

  return (
    <div className={shellClass}>
      <Navbar theme={darkMode ? 'dark' : 'light'} />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8">
        <SkeletonBlock darkMode={darkMode} className="h-10 w-56" />
        <div className={`rounded-xl p-6 shadow-sm ${panelClass}`}>
          <div className="flex items-center justify-between">
            <SkeletonBlock darkMode={darkMode} className="h-4 w-32 rounded-full" />
            <SkeletonBlock darkMode={darkMode} className="h-8 w-28 rounded-full" />
          </div>
          <div className="mt-6 space-y-4">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="flex gap-4">
                <SkeletonBlock darkMode={darkMode} className="h-16 w-16 rounded-xl" />
                <div className="flex-1 space-y-3">
                  <SkeletonBlock darkMode={darkMode} className="h-4 w-44 rounded-full" />
                  <SkeletonBlock darkMode={darkMode} className="h-3 w-28 rounded-full" />
                  <SkeletonBlock darkMode={darkMode} className="h-3 w-24 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className={`rounded-xl p-6 shadow-sm ${panelClass}`}>
            <SkeletonBlock darkMode={darkMode} className="h-5 w-40 rounded-full" />
            <SkeletonBlock darkMode={darkMode} className="mt-4 h-4 w-full rounded-full" />
            <SkeletonBlock darkMode={darkMode} className="mt-3 h-4 w-10/12 rounded-full" />
            <SkeletonBlock darkMode={darkMode} className="mt-3 h-4 w-7/12 rounded-full" />
          </div>
        ))}
      </main>
      <Footer />
    </div>
  );
}
