import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  HelpCircle,
  Home,
  LogIn,
  Package,
  Search,
  ShoppingCart,
  User,
  Wallet,
} from 'lucide-react';
import landscapeLogo from '../../mafdesh-img/landscape-logo-removebg-preview.png';
import { readCachedCartCount } from '../utils/cartStorage';
import { showGlobalLoginRequired } from '../hooks/modalService';

export default function GuestNavbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState(
    () => new URLSearchParams(location.search).get('search') || ''
  );
  const [cartCount, setCartCount] = useState(() => readCachedCartCount());
  const browsePath = useMemo(
    () => (location.pathname === '/products' ? '/products' : '/'),
    [location.pathname]
  );

  useEffect(() => {
    setSearchQuery(new URLSearchParams(location.search).get('search') || '');
  }, [location.search]);

  useEffect(() => {
    const handleCartUpdate = () => setCartCount(readCachedCartCount());
    const handleStorageSync = () => setCartCount(readCachedCartCount());

    window.addEventListener('cartUpdated', handleCartUpdate);
    window.addEventListener('storage', handleStorageSync);

    return () => {
      window.removeEventListener('cartUpdated', handleCartUpdate);
      window.removeEventListener('storage', handleStorageSync);
    };
  }, []);

  const promptLogin = (path, options = {}) => {
    showGlobalLoginRequired(
      options.message || 'Please log in to continue.',
      () => {
        navigate(`/login?returnUrl=${encodeURIComponent(path)}`);
      },
      options.onCancel,
      {
        confirmLabel: options.confirmLabel,
        cancelLabel: options.cancelLabel,
        title: options.title,
      }
    );
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();

    const params = new URLSearchParams(location.search);
    if (searchQuery.trim()) {
      params.set('search', searchQuery.trim());
    } else {
      params.delete('search');
    }

    navigate({
      pathname: browsePath,
      search: params.toString() ? `?${params.toString()}` : '',
    });
  };

  const topIconClass =
    'relative inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-700 transition-colors hover:bg-orange-50 hover:text-orange-600';
  const bottomTabClass =
    'flex flex-col items-center justify-center gap-1 rounded-2xl px-3 py-2.5 text-[11px] font-semibold text-gray-700 transition-colors hover:bg-orange-50 hover:text-orange-600';

  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-gray-200 bg-white text-slate-900 shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="py-3 xl:py-0">
            <div className="flex min-h-[3.75rem] items-center justify-between gap-3 xl:h-16">
              <Link to={browsePath} className="flex flex-shrink-0 items-center">
                <img
                  src={landscapeLogo}
                  alt="Mafdesh"
                  className="h-8 w-auto max-w-[8.5rem] object-contain sm:h-9"
                />
              </Link>

            <div className="hidden min-w-0 flex-[1.35] items-center justify-center px-4 xl:flex">
              <form onSubmit={handleSearchSubmit} className="relative w-full max-w-2xl">
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="w-full rounded-full border border-gray-300 bg-white px-4 py-2 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </form>
            </div>

            <div className="hidden shrink-0 items-center gap-3 xl:flex">
              <Link to={browsePath} className={topIconClass} aria-label="Home">
                <Home className="h-5 w-5" />
              </Link>
              <button type="button" onClick={() => promptLogin('/orders')} className={topIconClass} aria-label="Orders">
                <Package className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => promptLogin('/buyer/payments')}
                className={topIconClass}
                aria-label="Payments"
              >
                <Wallet className="h-5 w-5" />
              </button>
              <Link to="/cart" className={topIconClass} aria-label="Cart">
                <ShoppingCart className="h-5 w-5" />
                {cartCount > 0 && (
                  <span className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">
                    {cartCount}
                  </span>
                )}
              </Link>
              <button
                type="button"
                onClick={() =>
                  promptLogin('/profile', {
                    message: 'Please log in or create an account to view your profile.',
                    cancelLabel: 'Sign Up',
                    onCancel: () => navigate('/signup'),
                  })
                }
                className={topIconClass}
                aria-label="Profile"
              >
                <User className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => promptLogin('/support')}
                className={topIconClass}
                aria-label="Support"
              >
                <HelpCircle className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-orange-300 hover:text-orange-600"
              >
                <LogIn className="h-4 w-4" />
                <span>Log In</span>
              </button>
            </div>

            <div className="flex shrink-0 items-center gap-2 xl:hidden">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="rounded-full border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-orange-300 hover:text-orange-600"
              >
                Log In
              </button>
            </div>
            </div>
            <div className="pt-3 xl:hidden">
              <form onSubmit={handleSearchSubmit}>
                <div className="relative overflow-hidden rounded-[1.25rem] border border-orange-100 bg-orange-50/80 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-orange-500" />
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="h-12 w-full rounded-[1.25rem] bg-transparent pl-12 pr-4 text-base font-medium text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                </div>
              </form>
            </div>
          </div>
        </div>
      </nav>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white xl:hidden">
        <div className="grid grid-cols-5 gap-1 px-3 py-2">
          <Link to={browsePath} className={bottomTabClass}>
            <Home className="h-5 w-5" />
            <span>Home</span>
          </Link>
          <button type="button" onClick={() => promptLogin('/orders')} className={bottomTabClass}>
            <Package className="h-5 w-5" />
            <span>Orders</span>
          </button>
          <button type="button" onClick={() => promptLogin('/buyer/payments')} className={bottomTabClass}>
            <Wallet className="h-5 w-5" />
            <span>Payments</span>
          </button>
          <button
            type="button"
            onClick={() =>
              promptLogin('/profile', {
                message: 'Please log in or create an account to view your profile.',
                cancelLabel: 'Sign Up',
                onCancel: () => navigate('/signup'),
              })
            }
            className={bottomTabClass}
          >
            <User className="h-5 w-5" />
            <span>Profile</span>
          </button>
          <Link to="/cart" className={bottomTabClass}>
            <ShoppingCart className="h-5 w-5" />
            <span>Cart</span>
          </Link>
        </div>
      </div>
    </>
  );
}
