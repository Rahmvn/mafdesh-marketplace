import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  BookOpen,
  ChevronDown,
  CreditCard,
  HelpCircle,
  Home,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Moon,
  Package,
  RotateCcw,
  Search,
  Settings,
  Shield,
  ShoppingCart,
  Sun,
  User,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import landscapeLogo from '../../mafdesh-img/landscape-logo-removebg-preview.png';
import { readCachedCartCount } from '../utils/cartStorage';
import { fetchPendingRefundRequestCount } from '../services/refundRequestService';
import { showGlobalLoginRequired } from '../hooks/modalService';
import NotificationBell from './NotificationBell';

function ThemeToggleButton({ darkMode, onToggle, compact, isDarkTheme }) {
  const buttonClass = isDarkTheme
    ? 'border border-slate-700 bg-slate-900 text-slate-100 hover:border-orange-400 hover:text-orange-300'
    : 'border border-gray-200 bg-white text-slate-700 hover:border-orange-300 hover:text-orange-600';

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`inline-flex items-center justify-center rounded-full text-sm font-semibold transition-colors ${buttonClass} ${
        compact ? 'h-10 w-10' : 'gap-2 px-4 py-2'
      }`}
    >
      {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {!compact && <span>{darkMode ? 'Light mode' : 'Dark mode'}</span>}
    </button>
  );
}

export default function Navbar({ onLogout, theme = 'light', themeToggle = null }) {
  const [storedUser, setStoredUser] = useState(() =>
    JSON.parse(localStorage.getItem('mafdesh_user') || 'null')
  );
  const [authUserId, setAuthUserId] = useState(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [adminNavOpen, setAdminNavOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(
    () => new URLSearchParams(window.location.search).get('search') || ''
  );
  const [cartCount, setCartCount] = useState(() => readCachedCartCount());
  const [actionRequiredCount, setActionRequiredCount] = useState(0);
  const [adminCounts, setAdminCounts] = useState({ refunds: 0 });
  const [showUserMenu, setShowUserMenu] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const debounceTimer = useRef(null);
  const userRole = storedUser?.role || null;
  const isDarkTheme = theme === 'dark';
  const isBuyer = userRole === 'buyer';
  const isSeller = userRole === 'seller';
  const isGuest = !userRole;
  const isBuyerLike = isBuyer || isGuest;

  const navShellClass = isDarkTheme
    ? 'sticky top-0 z-50 border-b border-slate-800 bg-slate-950/95 text-slate-100 shadow-[0_14px_40px_rgba(2,6,23,0.45)] backdrop-blur'
    : 'sticky top-0 z-50 border-b border-gray-200 bg-white text-slate-900 shadow-sm';
  const navLinkClass = isDarkTheme
    ? 'text-slate-200 hover:text-orange-300 hover:bg-slate-900'
    : 'text-gray-700 hover:text-orange-600 hover:bg-orange-50';
  const highlightedNavLinkClass = isDarkTheme
    ? 'text-orange-300 hover:text-orange-200 hover:bg-slate-900'
    : 'text-orange-600 hover:text-orange-700 hover:bg-orange-50';
  const searchInputClass = isDarkTheme
    ? 'border border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/10'
    : 'border border-gray-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-orange-500';
  const iconBadgeClass = isDarkTheme
    ? 'bg-slate-800 text-orange-300'
    : 'bg-orange-100 text-orange-600';
  const menuPanelClass = isDarkTheme
    ? 'border border-slate-800 bg-slate-950 text-slate-100'
    : 'border border-gray-200 bg-white text-slate-900';
  const menuLinkClass = isDarkTheme
    ? 'text-slate-200 hover:bg-slate-900 hover:text-orange-300'
    : 'text-gray-700 hover:bg-orange-50 hover:text-orange-600';
  const mobilePanelClass = isDarkTheme
    ? 'border-t border-slate-800 bg-slate-950'
    : 'border-t border-gray-200 bg-white';
  const mobileMenuButtonClass = isDarkTheme
    ? 'text-slate-300 hover:text-orange-300 hover:bg-slate-900'
    : 'text-gray-600 hover:text-orange-600 hover:bg-orange-50';
  const adminDrawerClass = isDarkTheme
    ? 'border-l border-slate-800 bg-slate-950 text-slate-100 shadow-[0_18px_45px_rgba(2,6,23,0.55)]'
    : 'border-l border-gray-200 bg-white text-slate-900 shadow-2xl';
  const adminDrawerLinkClass = isDarkTheme
    ? 'text-slate-200 hover:bg-slate-900 hover:text-orange-300'
    : 'text-gray-700 hover:bg-orange-50 hover:text-orange-600';
  const adminDrawerActiveClass = isDarkTheme
    ? 'bg-slate-900 text-orange-300'
    : 'bg-orange-50 text-orange-600';
  const adminDrawerOverlayClass = isDarkTheme ? 'bg-slate-950/70' : 'bg-slate-900/30';
  const isAdmin = userRole === 'admin';
  const notificationUser = storedUser?.id ? storedUser : storedUser ? { ...storedUser, id: authUserId } : null;

  const adminLinks = [
    { to: '/admin/dashboard', label: 'Dashboard', icon: Settings },
    { to: '/admin/orders', label: 'Orders', icon: ShoppingCart },
    { to: '/admin/disputes', label: 'Disputes', icon: AlertCircle },
    { to: '/admin/refund-requests', label: 'Refund Requests', icon: RotateCcw, badgeKey: 'refunds' },
    { to: '/admin/products', label: 'Products', icon: Package },
    { to: '/admin/users', label: 'Users', icon: Users },
    { to: '/admin/constitution', label: 'Constitution', icon: BookOpen },
    { to: '/admin/bank-approvals', label: 'Bank Approvals', icon: CreditCard },
    { to: '/admin/support', label: 'Support Inbox', icon: HelpCircle },
    { to: '/admin/actions', label: 'Audit Log', icon: Shield },
  ];

  async function loadCartCount() {
    try {
      const user = JSON.parse(localStorage.getItem('mafdesh_user'));
      if (!user) {
        return;
      }

      const { data: carts, error: cartError } = await supabase
        .from('carts')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);

      if (cartError) {
        throw cartError;
      }

      const cart = carts?.[0];

      if (!cart) {
        setCartCount(0);
        return;
      }

      const { data: items } = await supabase
        .from('cart_items')
        .select('quantity')
        .eq('cart_id', cart.id);

      const count = (items || []).reduce((sum, item) => sum + item.quantity, 0);
      setCartCount(count);
    } catch (error) {
      console.error('Cart count error:', error);
      setCartCount(0);
    }
  }

  async function loadBuyerActionCount(userId) {
    try {
      const { count, error } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('buyer_id', userId)
        .in('status', ['SHIPPED', 'READY_FOR_PICKUP']);

      if (!error) {
        setActionRequiredCount(count);
      }
    } catch (error) {
      console.error('Buyer action count error:', error);
    }
  }

  async function loadSellerActionCount(userId) {
    try {
      const { count, error } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('seller_id', userId)
        .eq('status', 'PAID_ESCROW');

      if (!error) {
        setActionRequiredCount(count);
      }
    } catch (error) {
      console.error('Seller action count error:', error);
    }
  }

  async function loadAdminCounts() {
    try {
      const refundCount = await fetchPendingRefundRequestCount();
      setAdminCounts({ refunds: refundCount });
    } catch (error) {
      console.error('Admin counts error:', error);
      setAdminCounts({ refunds: 0 });
    }
  }

  useEffect(() => {
    let timeoutId;

    if (storedUser) {
      timeoutId = window.setTimeout(() => {
        if (storedUser.role === 'buyer') {
          loadCartCount();
          loadBuyerActionCount(storedUser.id);
        } else if (storedUser.role === 'seller') {
          loadSellerActionCount(storedUser.id);
        } else if (storedUser.role === 'admin') {
          loadAdminCounts();
        }
      }, 0);
    }

    const handleCartUpdate = () => {
      setCartCount(readCachedCartCount());
      if (storedUser?.role === 'buyer') {
        loadCartCount();
      }
    };
    const handleStorageSync = () => {
      setStoredUser(JSON.parse(localStorage.getItem('mafdesh_user') || 'null'));
      setCartCount(readCachedCartCount());
    };
    window.addEventListener('cartUpdated', handleCartUpdate);
    window.addEventListener('storage', handleStorageSync);

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      window.removeEventListener('cartUpdated', handleCartUpdate);
      window.removeEventListener('storage', handleStorageSync);
    };
  }, [storedUser]);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (isMounted) {
        setAuthUserId(data.user?.id || null);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUserId(session?.user?.id || null);
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const getHomePath = () => {
    if (userRole === 'seller') return '/seller/dashboard';
    if (userRole === 'admin') return '/admin/dashboard';
    return '/';
  };
  const homePath = getHomePath();

  useEffect(() => {
    if (
      !isBuyerLike ||
      !['/', '/marketplace'].includes(location.pathname)
    ) {
      return;
    }

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      const params = new URLSearchParams(location.search);
      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      } else {
        params.delete('search');
      }
      navigate({ pathname: homePath, search: params.toString() }, { replace: true });
    }, 300);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [homePath, isBuyerLike, location.pathname, location.search, navigate, searchQuery]);

  useEffect(() => {
    setMobileMenu(false);
    setAdminNavOpen(false);
    setShowUserMenu(false);
  }, [location.pathname]);

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    const params = new URLSearchParams(location.search);
    if (searchQuery.trim()) {
      params.set('search', searchQuery.trim());
    } else {
      params.delete('search');
    }

    navigate({ pathname: homePath, search: params.toString() });
    setMobileMenu(false);
  };

  const closeMenus = () => {
    setMobileMenu(false);
    setAdminNavOpen(false);
    setShowUserMenu(false);
  };

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

  const navBase = `flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${navLinkClass}`;
  const highlightedNavBase = `flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${highlightedNavLinkClass}`;
  const mobileNavBase = `flex items-center rounded-md px-3 py-2 ${navLinkClass}`;
  const mobileHighlightedBase = `flex items-center rounded-md px-3 py-2 ${highlightedNavLinkClass}`;
  const buyerIconButtonClass = `relative inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors ${navLinkClass}`;
  const buyerBottomTabClass = `flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[11px] font-medium transition-colors ${navLinkClass}`;
  const adminTriggerClass = `inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
    isDarkTheme
      ? 'border-slate-700 bg-slate-900 text-slate-100 hover:border-orange-400 hover:text-orange-300'
      : 'border-gray-200 bg-white text-slate-700 hover:border-orange-300 hover:text-orange-600'
  }`;

  const isAdminPathActive = (path) => {
    if (path === '/admin/dashboard') {
      return location.pathname === path;
    }

    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  return (
    <>
      <nav className={navShellClass}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-3">
            <Link
              to={homePath}
              className={
                isBuyerLike
                  ? 'hidden lg:flex flex-shrink-0 items-center'
                  : 'flex flex-shrink-0 items-center'
              }
              onClick={closeMenus}
            >
              <img
                src={landscapeLogo}
                alt="Mafdesh"
                className={
                  isBuyerLike
                    ? 'h-6 w-6 object-contain sm:h-8 sm:w-auto'
                    : 'h-8 w-auto object-contain'
                }
              />
            </Link>

            {isBuyerLike && (
              <div className="min-w-0 flex-1 lg:hidden">
                <form onSubmit={handleSearchSubmit} className="min-w-0 flex-1">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search products..."
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      className={`w-full rounded-full px-4 py-1.5 pl-10 text-sm ${searchInputClass}`}
                    />
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </form>
              </div>
            )}

            {isSeller && (
              <div className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto px-2">
                <>
                  <Link to="/seller/dashboard" className={navBase}>
                    <LayoutDashboard className="mr-1.5 h-4 w-4" />
                    Dashboard
                  </Link>
                  <Link to="/seller/products" className={navBase}>
                    <Package className="mr-1.5 h-4 w-4" />
                    Products
                  </Link>
                  <Link to="/seller/orders" className={`${navBase} relative`}>
                    <ShoppingCart className="mr-1.5 h-4 w-4" />
                    Orders
                    {actionRequiredCount > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
                        {actionRequiredCount}
                      </span>
                    )}
                  </Link>
                  <Link to="/seller/payments" className={navBase}>
                    <Wallet className="mr-1.5 h-4 w-4" />
                    Payments
                  </Link>
                  <Link to="/seller/delivery" className={navBase}>
                    <MapPin className="mr-1.5 h-4 w-4" />
                    Delivery
                  </Link>
                </>

                <Link to="/support" className={userRole === 'seller' ? highlightedNavBase : navBase}>
                  <HelpCircle className="mr-1.5 h-4 w-4" />
                  Help
                </Link>
              </div>
            )}

            {isBuyerLike && (
              <div className="hidden min-w-0 flex-[1.35] items-center justify-center px-4 lg:flex">
                <form onSubmit={handleSearchSubmit} className="relative w-full max-w-2xl">
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className={`w-full rounded-full px-4 py-2 pl-10 text-sm ${searchInputClass}`}
                  />
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </form>
              </div>
            )}

            <div
              className={
                isBuyerLike
                  ? "hidden shrink-0 items-center gap-3 lg:flex"
                  : isSeller
                    ? "hidden"
                    : "hidden shrink-0 items-center gap-3 xl:flex"
              }
            >
              {themeToggle && !isBuyerLike && (
                <ThemeToggleButton
                  darkMode={themeToggle.darkMode}
                  onToggle={themeToggle.onToggle}
                  isDarkTheme={isDarkTheme}
                />
              )}

              {isAdmin && (
                <>
                  <NotificationBell user={notificationUser} theme={theme} />
                  <button
                    type="button"
                    onClick={() => {
                      setAdminNavOpen((current) => !current);
                      setShowUserMenu(false);
                    }}
                    className={adminTriggerClass}
                    aria-expanded={adminNavOpen}
                    aria-controls="admin-side-nav"
                  >
                    {adminNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                    <span>Admin Menu</span>
                  </button>
                </>
              )}

              {isBuyerLike && (
                <>
                  <Link to={homePath} className={buyerIconButtonClass} aria-label="Home">
                    <Home className="h-5 w-5" />
                  </Link>
                  {isBuyer ? (
                    <Link to="/orders" className={buyerIconButtonClass} aria-label="Orders">
                      <Package className="h-5 w-5" />
                      {actionRequiredCount > 0 && (
                        <span className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
                          {actionRequiredCount}
                        </span>
                      )}
                    </Link>
                  ) : (
                    <button type="button" onClick={() => promptLogin('/orders')} className={buyerIconButtonClass} aria-label="Orders">
                      <Package className="h-5 w-5" />
                    </button>
                  )}
                  {isBuyer ? (
                    <Link to="/buyer/payments" className={buyerIconButtonClass} aria-label="Payments">
                      <Wallet className="h-5 w-5" />
                    </Link>
                  ) : (
                    <button type="button" onClick={() => promptLogin('/buyer/payments')} className={buyerIconButtonClass} aria-label="Payments">
                      <Wallet className="h-5 w-5" />
                    </button>
                  )}
                  {isBuyer ? <NotificationBell user={storedUser} theme={theme} /> : null}
                  <Link to="/cart" className={buyerIconButtonClass} aria-label="Cart">
                    <ShoppingCart className="h-5 w-5" />
                    {cartCount > 0 && (
                      <span className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">
                        {cartCount}
                      </span>
                    )}
                  </Link>
                  {isBuyer ? (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          setShowUserMenu((current) => !current);
                          setAdminNavOpen(false);
                        }}
                        className={buyerIconButtonClass}
                        aria-label="Profile menu"
                      >
                        <User className="h-5 w-5" />
                      </button>

                      {showUserMenu && (
                        <div className={`absolute right-0 z-50 mt-2 w-56 rounded-lg py-1 shadow-lg ${menuPanelClass}`}>
                          <Link
                            to="/profile"
                            className={`block px-4 py-2 text-sm transition-colors ${menuLinkClass}`}
                            onClick={closeMenus}
                          >
                            <User className="mr-2 inline h-4 w-4" />
                            My Profile
                          </Link>
                          <Link
                            to="/account/addresses"
                            className={`block px-4 py-2 text-sm transition-colors ${menuLinkClass}`}
                            onClick={closeMenus}
                          >
                            <MapPin className="mr-2 inline h-4 w-4" />
                            My Addresses
                          </Link>
                          <Link
                            to="/support"
                            className={`block px-4 py-2 text-sm transition-colors ${menuLinkClass}`}
                            onClick={closeMenus}
                          >
                            <HelpCircle className="mr-2 inline h-4 w-4" />
                            Help
                          </Link>
                          {onLogout ? (
                            <>
                              <div className={isDarkTheme ? 'my-1 border-t border-slate-800' : 'my-1 border-t border-gray-100'} />
                              <button
                                type="button"
                                onClick={() => {
                                  closeMenus();
                                  onLogout();
                                }}
                                className="block w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-red-500/10"
                              >
                                <LogOut className="mr-2 inline h-4 w-4" />
                                Logout
                              </button>
                            </>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        promptLogin('/profile', {
                          message: 'Please log in or create an account to view your profile.',
                          cancelLabel: 'Sign Up',
                          onCancel: () => navigate('/signup'),
                        })
                      }
                      className={buyerIconButtonClass}
                      aria-label="Profile"
                    >
                      <User className="h-5 w-5" />
                    </button>
                  )}
                </>
              )}

              {!isAdmin && !isBuyerLike && !isSeller && (
                <div className="relative">
                  <div className="flex items-center gap-3">
                    <NotificationBell user={notificationUser} theme={theme} />
                    <button
                      type="button"
                      onClick={() => {
                        setShowUserMenu((current) => !current);
                        setAdminNavOpen(false);
                      }}
                      className={isBuyer
                        ? `inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors ${navLinkClass}`
                        : `flex items-center space-x-2 transition-colors ${navLinkClass}`}
                    >
                      <div className={`rounded-full p-1.5 ${iconBadgeClass}`}>
                        <User className="h-5 w-5" />
                      </div>
                      {!isBuyer && <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>

                  {showUserMenu && (
                    <div className={`absolute right-0 z-50 mt-2 w-56 rounded-lg py-1 shadow-lg ${menuPanelClass}`}>
                      <Link
                        to="/profile"
                        className={`block px-4 py-2 text-sm transition-colors ${menuLinkClass}`}
                        onClick={closeMenus}
                      >
                        <User className="mr-2 inline h-4 w-4" />
                        My Profile
                      </Link>

                      {userRole === 'buyer' && (
                        <>
                          <Link
                            to="/support"
                            className={`block px-4 py-2 text-sm transition-colors ${menuLinkClass}`}
                            onClick={closeMenus}
                          >
                            <HelpCircle className="mr-2 inline h-4 w-4" />
                            Help
                          </Link>
                        </>
                      )}

                      {userRole === 'seller' && (
                        <>
                          <Link
                            to="/seller/orders"
                            className={`block px-4 py-2 text-sm transition-colors ${menuLinkClass}`}
                            onClick={closeMenus}
                          >
                            <ShoppingCart className="mr-2 inline h-4 w-4" />
                            Orders
                            {actionRequiredCount > 0 && (
                              <span className="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
                                {actionRequiredCount}
                              </span>
                            )}
                          </Link>
                          <Link
                            to="/seller/dashboard"
                            className={`block px-4 py-2 text-sm transition-colors ${menuLinkClass}`}
                            onClick={closeMenus}
                          >
                            <LayoutDashboard className="mr-2 inline h-4 w-4" />
                            Seller Dashboard
                          </Link>
                          <Link
                            to="/seller/delivery"
                            className={`block px-4 py-2 text-sm transition-colors ${menuLinkClass}`}
                            onClick={closeMenus}
                          >
                            <MapPin className="mr-2 inline h-4 w-4" />
                            Delivery Settings
                          </Link>
                        </>
                      )}

                      <div className={isDarkTheme ? 'my-1 border-t border-slate-800' : 'my-1 border-t border-gray-100'} />
                      {onLogout && (
                        <button
                          type="button"
                          onClick={() => {
                            closeMenus();
                            onLogout();
                          }}
                          className="block w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-red-500/10"
                        >
                          <LogOut className="mr-2 inline h-4 w-4" />
                          Logout
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

          <div className={`${isBuyerLike ? "flex lg:hidden" : isSeller ? "flex" : "flex xl:hidden"} shrink-0 items-center gap-2`}>
            {isBuyerLike ? (
              <>
                {isBuyer ? <NotificationBell user={notificationUser} theme={theme} /> : null}
                <Link
                  to="/cart"
                  className={buyerIconButtonClass}
                  aria-label="Cart"
                >
                  <ShoppingCart className="h-5 w-5" />
                  {cartCount > 0 && (
                    <span className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">
                      {cartCount}
                    </span>
                  )}
                </Link>
              </>
            ) : isSeller ? (
              <>
                <NotificationBell user={notificationUser} theme={theme} />
                <button
                  type="button"
                  onClick={() => setMobileMenu((current) => !current)}
                  className={`rounded-md p-2 transition-colors ${mobileMenuButtonClass}`}
                  aria-expanded={mobileMenu}
                  aria-controls="mobile-nav-menu"
                  aria-label={mobileMenu ? 'Close navigation menu' : 'Open navigation menu'}
                >
                  {mobileMenu ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                </button>
              </>
            ) : (
              <>
                {themeToggle && (
                  <div>
                    <ThemeToggleButton
                      darkMode={themeToggle.darkMode}
                      onToggle={themeToggle.onToggle}
                      compact
                      isDarkTheme={isDarkTheme}
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (isAdmin) {
                      setAdminNavOpen((current) => !current);
                      setShowUserMenu(false);
                      return;
                    }

                    setMobileMenu((current) => !current);
                  }}
                  className={`rounded-md p-2 transition-colors ${mobileMenuButtonClass}`}
                  aria-expanded={isAdmin ? adminNavOpen : mobileMenu}
                  aria-controls={isAdmin ? 'admin-side-nav' : 'mobile-nav-menu'}
                  aria-label={isAdmin
                    ? adminNavOpen
                      ? 'Close admin navigation'
                      : 'Open admin navigation'
                    : mobileMenu
                      ? 'Close navigation menu'
                      : 'Open navigation menu'}
                >
                  {isAdmin
                    ? adminNavOpen
                      ? <X className="h-6 w-6" />
                      : <Menu className="h-6 w-6" />
                    : mobileMenu
                      ? <X className="h-6 w-6" />
                      : <Menu className="h-6 w-6" />}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      </nav>

      {mobileMenu && !isAdmin && !isBuyer && (
        <div id="mobile-nav-menu" className={`px-4 py-4 ${isSeller ? '' : 'xl:hidden'} ${mobilePanelClass}`}>
          <div className="flex flex-col space-y-2">
            {userRole === 'seller' && (
              <>
                <Link to="/seller/dashboard" className={mobileNavBase} onClick={closeMenus}>
                  <LayoutDashboard className="mr-2 h-5 w-5" />
                  Dashboard
                </Link>
                <Link to="/seller/products" className={mobileNavBase} onClick={closeMenus}>
                  <Package className="mr-2 h-5 w-5" />
                  Products
                </Link>
                <Link
                  to="/seller/orders"
                  className={`${mobileNavBase} justify-between`}
                  onClick={closeMenus}
                >
                  <span className="flex items-center">
                    <ShoppingCart className="mr-2 h-5 w-5" />
                    Orders
                  </span>
                  {actionRequiredCount > 0 && (
                    <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
                      {actionRequiredCount}
                    </span>
                  )}
                </Link>
                <Link to="/seller/payments" className={mobileNavBase} onClick={closeMenus}>
                  <Wallet className="mr-2 h-5 w-5" />
                  Payments
                </Link>
                <Link to="/seller/delivery" className={mobileNavBase} onClick={closeMenus}>
                  <MapPin className="mr-2 h-5 w-5" />
                  Delivery
                </Link>
              </>
            )}

            <Link to="/profile" className={mobileNavBase} onClick={closeMenus}>
              <User className="mr-2 h-5 w-5" />
              Profile
            </Link>
            <Link
              to="/support"
              className={userRole === 'seller' ? mobileHighlightedBase : mobileNavBase}
              onClick={closeMenus}
            >
              <HelpCircle className="mr-2 h-5 w-5" />
              Help
            </Link>
            {onLogout && (
              <button
                type="button"
                onClick={() => {
                  closeMenus();
                  onLogout();
                }}
                className="flex w-full items-center rounded-md px-3 py-2 text-left text-red-500 hover:bg-red-500/10"
              >
                <LogOut className="mr-2 h-5 w-5" />
                Logout
              </button>
            )}
          </div>
        </div>
      )}
      {isBuyerLike && (
        <div className={`fixed inset-x-0 bottom-0 z-40 border-t lg:hidden ${mobilePanelClass}`}>
          <div className="grid grid-cols-5 gap-1 px-3 py-2">
            <Link to={homePath} className={buyerBottomTabClass}>
              <Home className="h-5 w-5" />
              <span>Home</span>
            </Link>
            {isBuyer ? (
              <Link to="/orders" className={buyerBottomTabClass}>
                <div className="relative">
                  <Package className="h-5 w-5" />
                  {actionRequiredCount > 0 && (
                    <span className="absolute -right-2 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      {actionRequiredCount}
                    </span>
                  )}
                </div>
                <span>Orders</span>
              </Link>
            ) : (
              <button type="button" onClick={() => promptLogin('/orders')} className={buyerBottomTabClass}>
                <Package className="h-5 w-5" />
                <span>Orders</span>
              </button>
            )}
            {isBuyer ? (
              <Link to="/buyer/payments" className={buyerBottomTabClass}>
                <Wallet className="h-5 w-5" />
                <span>Payments</span>
              </Link>
            ) : (
              <button type="button" onClick={() => promptLogin('/buyer/payments')} className={buyerBottomTabClass}>
                <Wallet className="h-5 w-5" />
                <span>Payments</span>
              </button>
            )}
            {isBuyer ? (
              <Link to="/profile" className={buyerBottomTabClass}>
                <User className="h-5 w-5" />
                <span>Profile</span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={() =>
                  promptLogin('/profile', {
                    message: 'Please log in or create an account to view your profile.',
                    cancelLabel: 'Sign Up',
                    onCancel: () => navigate('/signup'),
                  })
                }
                className={buyerBottomTabClass}
              >
                <User className="h-5 w-5" />
                <span>Profile</span>
              </button>
            )}
            {isBuyer ? (
              <Link to="/support" className={buyerBottomTabClass}>
                <HelpCircle className="h-5 w-5" />
                <span>Help</span>
              </Link>
            ) : (
              <button type="button" onClick={() => promptLogin('/support')} className={buyerBottomTabClass}>
                <HelpCircle className="h-5 w-5" />
                <span>Help</span>
              </button>
            )}
          </div>
        </div>
      )}
      {isAdmin && adminNavOpen && (
        <div className="fixed inset-0 z-[60]">
          <button
            type="button"
            className={`absolute inset-0 ${adminDrawerOverlayClass}`}
            onClick={closeMenus}
            aria-label="Close admin navigation"
          />
          <aside
            id="admin-side-nav"
            className={`absolute inset-y-0 right-0 flex w-full max-w-sm flex-col ${adminDrawerClass}`}
          >
            <div className={isDarkTheme ? 'border-b border-slate-800 px-5 py-5' : 'border-b border-gray-200 px-5 py-5'}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-500">Admin Panel</p>
                  <h2 className="mt-2 text-xl font-bold">Navigation</h2>
                  <p className={isDarkTheme ? 'mt-1 text-sm text-slate-400' : 'mt-1 text-sm text-gray-500'}>
                    Open any admin page from one place.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeMenus}
                  className={`rounded-full p-2 transition-colors ${mobileMenuButtonClass}`}
                  aria-label="Close admin navigation"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-4">
              <nav className="space-y-1">
                {adminLinks.map((item) => {
                  const Icon = item.icon;
                  const isActive = isAdminPathActive(item.to);
                  const badgeCount = item.badgeKey ? adminCounts[item.badgeKey] || 0 : 0;

                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`flex items-center rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                        isActive ? adminDrawerActiveClass : adminDrawerLinkClass
                      }`}
                      onClick={closeMenus}
                    >
                      <Icon className="mr-3 h-5 w-5" />
                      <span>{item.label}</span>
                      {badgeCount > 0 && (
                        <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                          {badgeCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className={isDarkTheme ? 'border-t border-slate-800 px-3 py-4' : 'border-t border-gray-200 px-3 py-4'}>
              <div className="space-y-1">
                <Link
                  to="/profile"
                  className={`flex items-center rounded-xl px-4 py-3 text-sm font-medium transition-colors ${adminDrawerLinkClass}`}
                  onClick={closeMenus}
                >
                  <User className="mr-3 h-5 w-5" />
                  Profile
                </Link>
                <Link
                  to="/support"
                  className={`flex items-center rounded-xl px-4 py-3 text-sm font-medium transition-colors ${adminDrawerLinkClass}`}
                  onClick={closeMenus}
                >
                  <HelpCircle className="mr-3 h-5 w-5" />
                  Help Center
                </Link>
                {onLogout && (
                  <button
                    type="button"
                    onClick={() => {
                      closeMenus();
                      onLogout();
                    }}
                    className="flex w-full items-center rounded-xl px-4 py-3 text-left text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10"
                  >
                    <LogOut className="mr-3 h-5 w-5" />
                    Logout
                  </button>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
