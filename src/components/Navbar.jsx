import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  BookOpen,
  ChevronDown,
  CreditCard,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
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
  const [storedUser] = useState(() =>
    JSON.parse(localStorage.getItem('mafdesh_user') || 'null')
  );
  const [mobileMenu, setMobileMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState(
    () => new URLSearchParams(window.location.search).get('search') || ''
  );
  const [cartCount, setCartCount] = useState(0);
  const [actionRequiredCount, setActionRequiredCount] = useState(0);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const debounceTimer = useRef(null);
  const userRole = storedUser?.role || null;
  const isDarkTheme = theme === 'dark';

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

  useEffect(() => {
    let timeoutId;

    if (storedUser) {
      timeoutId = window.setTimeout(() => {
        if (storedUser.role === 'buyer') {
          loadCartCount();
          loadBuyerActionCount(storedUser.id);
        } else if (storedUser.role === 'seller') {
          loadSellerActionCount(storedUser.id);
        }
      }, 0);
    }

    const handleCartUpdate = () => loadCartCount();
    window.addEventListener('cartUpdated', handleCartUpdate);

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      window.removeEventListener('cartUpdated', handleCartUpdate);
    };
  }, [storedUser]);

  const getHomePath = () => {
    if (userRole === 'seller') return '/seller/dashboard';
    if (userRole === 'admin') return '/admin/dashboard';
    return '/marketplace';
  };

  useEffect(() => {
    if (userRole !== 'buyer' || location.pathname !== '/marketplace') {
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
      navigate({ pathname: '/marketplace', search: params.toString() }, { replace: true });
    }, 300);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [location.pathname, location.search, navigate, searchQuery, userRole]);

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

    navigate({ pathname: '/marketplace', search: params.toString() });
    setMobileMenu(false);
  };

  const closeMenus = () => {
    setMobileMenu(false);
    setShowUserMenu(false);
  };

  const homePath = getHomePath();

  const navBase = `flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${navLinkClass}`;
  const highlightedNavBase = `flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${highlightedNavLinkClass}`;
  const mobileNavBase = `flex items-center rounded-md px-3 py-2 ${navLinkClass}`;
  const mobileHighlightedBase = `flex items-center rounded-md px-3 py-2 ${highlightedNavLinkClass}`;

  return (
    <nav className={navShellClass}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-3">
          <Link
            to={homePath}
            className="flex flex-shrink-0 items-center"
            onClick={closeMenus}
          >
            <img src={landscapeLogo} alt="Mafdesh" className="h-8 w-auto object-contain" />
          </Link>

          <div className="hidden flex-1 min-w-0 items-center gap-1 overflow-x-auto px-2 xl:flex">
            {userRole === 'buyer' && (
              <>
                <Link to="/orders" className={`${navBase} relative`}>
                  <Package className="mr-1.5 h-4 w-4" />
                  Orders
                  {actionRequiredCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
                      {actionRequiredCount}
                    </span>
                  )}
                </Link>
                <Link to="/cart" className={`${navBase} relative`}>
                  <ShoppingCart className="mr-1.5 h-4 w-4" />
                  Cart
                  {cartCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">
                      {cartCount}
                    </span>
                  )}
                </Link>
              </>
            )}

            {userRole === 'seller' && (
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
              </>
            )}

            {userRole === 'admin' && (
              <>
                <Link to="/admin/dashboard" className={navBase}>
                  <Settings className="mr-1.5 h-4 w-4" />
                  Dashboard
                </Link>
                <Link to="/admin/orders" className={navBase}>
                  <ShoppingCart className="mr-1.5 h-4 w-4" />
                  Orders
                </Link>
                <Link to="/admin/disputes" className={navBase}>
                  <AlertCircle className="mr-1.5 h-4 w-4" />
                  Disputes
                </Link>
                <Link to="/admin/products" className={navBase}>
                  <Package className="mr-1.5 h-4 w-4" />
                  Products
                </Link>
                <Link to="/admin/users" className={navBase}>
                  <Users className="mr-1.5 h-4 w-4" />
                  Users
                </Link>
                <Link to="/admin/constitution" className={navBase}>
                  <BookOpen className="mr-1.5 h-4 w-4" />
                  Constitution
                </Link>
                <Link to="/admin/bank-approvals" className={navBase}>
                  <CreditCard className="mr-1.5 h-4 w-4" />
                  Bank Approvals
                </Link>
                <Link to="/admin/support" className={navBase}>
                  <HelpCircle className="mr-1.5 h-4 w-4" />
                  Support
                </Link>
                <Link to="/admin/actions" className={navBase}>
                  <Shield className="mr-1.5 h-4 w-4" />
                  Audit Log
                </Link>
              </>
            )}

            <Link to="/support" className={userRole === 'seller' ? highlightedNavBase : navBase}>
              <HelpCircle className="mr-1.5 h-4 w-4" />
              Help
            </Link>
          </div>

          <div className="hidden shrink-0 items-center gap-3 xl:flex">
            {themeToggle && (
              <ThemeToggleButton
                darkMode={themeToggle.darkMode}
                onToggle={themeToggle.onToggle}
                isDarkTheme={isDarkTheme}
              />
            )}

            {userRole === 'buyer' && (
              <form onSubmit={handleSearchSubmit} className="relative">
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className={`w-56 rounded-full px-4 py-2 pl-10 pr-12 text-sm 2xl:w-64 ${searchInputClass}`}
                />
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-orange-600 hover:text-orange-500"
                >
                  Go
                </button>
              </form>
            )}

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowUserMenu((current) => !current)}
                className={`flex items-center space-x-2 transition-colors ${navLinkClass}`}
              >
                <div className={`rounded-full p-1.5 ${iconBadgeClass}`}>
                  <User className="h-5 w-5" />
                </div>
                <ChevronDown className="h-4 w-4" />
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

                  {userRole === 'buyer' && (
                    <>
                      <Link
                        to="/orders"
                        className={`block px-4 py-2 text-sm transition-colors ${menuLinkClass}`}
                        onClick={closeMenus}
                      >
                        <Package className="mr-2 inline h-4 w-4" />
                        My Orders
                        {actionRequiredCount > 0 && (
                          <span className="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
                            {actionRequiredCount}
                          </span>
                        )}
                      </Link>
                      <Link
                        to="/cart"
                        className={`block px-4 py-2 text-sm transition-colors ${menuLinkClass}`}
                        onClick={closeMenus}
                      >
                        <ShoppingCart className="mr-2 inline h-4 w-4" />
                        My Cart
                        {cartCount > 0 && (
                          <span className="ml-2 rounded-full bg-orange-500 px-2 py-0.5 text-xs text-white">
                            {cartCount}
                          </span>
                        )}
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
                    </>
                  )}

                  {userRole === 'admin' && (
                    <>
                      <Link
                        to="/admin/dashboard"
                        className={`block px-4 py-2 text-sm transition-colors ${menuLinkClass}`}
                        onClick={closeMenus}
                      >
                        <Settings className="mr-2 inline h-4 w-4" />
                        Admin Dashboard
                      </Link>
                      <Link
                        to="/admin/support"
                        className={`block px-4 py-2 text-sm transition-colors ${menuLinkClass}`}
                        onClick={closeMenus}
                      >
                        <HelpCircle className="mr-2 inline h-4 w-4" />
                        Support Inbox
                      </Link>
                      <Link
                        to="/admin/actions"
                        className={`block px-4 py-2 text-sm transition-colors ${menuLinkClass}`}
                        onClick={closeMenus}
                      >
                        <Shield className="mr-2 inline h-4 w-4" />
                        Audit Log
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
          </div>

          <div className="flex shrink-0 items-center gap-2 xl:hidden">
            {themeToggle && (
              <ThemeToggleButton
                darkMode={themeToggle.darkMode}
                onToggle={themeToggle.onToggle}
                compact
                isDarkTheme={isDarkTheme}
              />
            )}
            <button
              type="button"
              onClick={() => setMobileMenu((current) => !current)}
              className={`rounded-md p-2 transition-colors ${mobileMenuButtonClass}`}
            >
              {mobileMenu ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {mobileMenu && (
        <div className={`px-4 py-4 xl:hidden ${mobilePanelClass}`}>
          {userRole === 'buyer' && (
            <form onSubmit={handleSearchSubmit} className="mb-4">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className={`w-full rounded-full px-4 py-2 pl-10 pr-12 text-sm ${searchInputClass}`}
                />
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-orange-600"
                >
                  Go
                </button>
              </div>
            </form>
          )}

          <div className="flex flex-col space-y-2">
            {userRole === 'buyer' && (
              <>
                <Link
                  to="/orders"
                  className={`${mobileNavBase} justify-between`}
                  onClick={closeMenus}
                >
                  <span className="flex items-center">
                    <Package className="mr-2 h-5 w-5" />
                    Orders
                  </span>
                  {actionRequiredCount > 0 && (
                    <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
                      {actionRequiredCount}
                    </span>
                  )}
                </Link>
                <Link
                  to="/cart"
                  className={`${mobileNavBase} justify-between`}
                  onClick={closeMenus}
                >
                  <span className="flex items-center">
                    <ShoppingCart className="mr-2 h-5 w-5" />
                    Cart
                  </span>
                  {cartCount > 0 && (
                    <span className="rounded-full bg-orange-500 px-2 py-0.5 text-xs text-white">
                      {cartCount}
                    </span>
                  )}
                </Link>
              </>
            )}

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
              </>
            )}

            {userRole === 'admin' && (
              <>
                <Link to="/admin/dashboard" className={mobileNavBase} onClick={closeMenus}>
                  <Settings className="mr-2 h-5 w-5" />
                  Dashboard
                </Link>
                <Link to="/admin/orders" className={mobileNavBase} onClick={closeMenus}>
                  <ShoppingCart className="mr-2 h-5 w-5" />
                  Orders
                </Link>
                <Link to="/admin/disputes" className={mobileNavBase} onClick={closeMenus}>
                  <AlertCircle className="mr-2 h-5 w-5" />
                  Disputes
                </Link>
                <Link to="/admin/products" className={mobileNavBase} onClick={closeMenus}>
                  <Package className="mr-2 h-5 w-5" />
                  Products
                </Link>
                <Link to="/admin/users" className={mobileNavBase} onClick={closeMenus}>
                  <Users className="mr-2 h-5 w-5" />
                  Users
                </Link>
                <Link to="/admin/constitution" className={mobileNavBase} onClick={closeMenus}>
                  <BookOpen className="mr-2 h-5 w-5" />
                  Constitution
                </Link>
                <Link to="/admin/bank-approvals" className={mobileNavBase} onClick={closeMenus}>
                  <CreditCard className="mr-2 h-5 w-5" />
                  Bank Approvals
                </Link>
                <Link to="/admin/support" className={mobileNavBase} onClick={closeMenus}>
                  <HelpCircle className="mr-2 h-5 w-5" />
                  Support
                </Link>
                <Link to="/admin/actions" className={mobileNavBase} onClick={closeMenus}>
                  <Shield className="mr-2 h-5 w-5" />
                  Audit Log
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
    </nav>
  );
}
