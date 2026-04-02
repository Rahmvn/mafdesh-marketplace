import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Search,
  Menu,
  X,
  Home,
  HelpCircle,
  LogOut,
  User,
  BarChart3,
  ShoppingCart,
  Package,
  Settings,
  Users,
  CheckCircle,
  Bell,
  Wallet,
  AlertCircle,
  BookOpen,
  CreditCard,
  ChevronDown,
  Store,
  LayoutDashboard,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import landscapeLogo from "../../mafdesh-img/landscape-logo-removebg-preview.png";

export default function Navbar({ onLogout }) {
  const [mobileMenu, setMobileMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [userRole, setUserRole] = useState(null);
  const [isVerified, setIsVerified] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [actionRequiredCount, setActionRequiredCount] = useState(0);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Load user data from localStorage and set up listeners
  useEffect(() => {
    const storedUser = localStorage.getItem("mafdesh_user");
    if (storedUser) {
      const userData = JSON.parse(storedUser);
      setUserRole(userData.role);
      setIsVerified(userData.is_verified || false);

      if (userData.role === "buyer") {
        loadCartCount();
        loadBuyerActionCount(userData.id);
      } else if (userData.role === "seller") {
        loadSellerActionCount(userData.id);
      }
    }

    const handleCartUpdate = () => loadCartCount();
    window.addEventListener("cartUpdated", handleCartUpdate);
    return () => window.removeEventListener("cartUpdated", handleCartUpdate);
  }, []);

  const loadCartCount = async () => {
    try {
      const storedUser = JSON.parse(localStorage.getItem("mafdesh_user"));
      if (!storedUser) return;

      const { data: cart } = await supabase
        .from("carts")
        .select("id")
        .eq("user_id", storedUser.id)
        .maybeSingle();

      if (!cart) {
        setCartCount(0);
        return;
      }

      const { data: items } = await supabase
        .from("cart_items")
        .select("quantity")
        .eq("cart_id", cart.id);

      const count = (items || []).reduce((sum, i) => sum + i.quantity, 0);
      setCartCount(count);
    } catch (error) {
      console.error("Cart count error:", error);
      setCartCount(0);
    }
  };

  const loadBuyerActionCount = async (userId) => {
    try {
      const { count, error } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("buyer_id", userId)
        .in("status", ["SHIPPED", "READY_FOR_PICKUP"]);
      if (!error) setActionRequiredCount(count);
    } catch (error) {
      console.error("Buyer action count error:", error);
    }
  };

  const loadSellerActionCount = async (userId) => {
    try {
      const { count, error } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("seller_id", userId)
        .eq("status", "PAID_ESCROW");
      if (!error) setActionRequiredCount(count);
    } catch (error) {
      console.error("Seller action count error:", error);
    }
  };

  const getHomePath = () => {
    if (userRole === "seller") return "/seller/dashboard";
    if (userRole === "admin") return "/admin/dashboard";
    return "/marketplace";
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    navigate(`/marketplace?search=${encodeURIComponent(searchQuery)}`);
    setMobileMenu(false);
  };

  const homePath = getHomePath();
  const showAnalytics = userRole === "seller" && isVerified;

  // Helper to close menus on navigation
  const closeMenus = () => {
    setMobileMenu(false);
    setShowUserMenu(false);
  };

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link
            to={homePath}
            className="flex-shrink-0 flex items-center"
            onClick={closeMenus}
          >
            <img
              src={landscapeLogo}
              alt="Mafdesh"
              className="h-8 w-auto object-contain"
            />
          </Link>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center space-x-1">
            {/* Role-specific quick links */}
            {userRole === "buyer" && (
              <>
                <Link
                  to="/orders"
                  className="relative flex items-center px-3 py-2 text-gray-700 hover:text-orange-600 hover:bg-orange-50 rounded-md text-sm font-medium transition-colors"
                >
                  <Package className="h-4 w-4 mr-1.5" />
                  Orders
                  {actionRequiredCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {actionRequiredCount}
                    </span>
                  )}
                </Link>
                <Link
                  to="/cart"
                  className="relative flex items-center px-3 py-2 text-gray-700 hover:text-orange-600 hover:bg-orange-50 rounded-md text-sm font-medium transition-colors"
                >
                  <ShoppingCart className="h-4 w-4 mr-1.5" />
                  Cart
                  {cartCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {cartCount}
                    </span>
                  )}
                </Link>
              </>
            )}

            {userRole === "seller" && (
              <>
                <Link
                  to="/seller/dashboard"
                  className="flex items-center px-3 py-2 text-gray-700 hover:text-orange-600 hover:bg-orange-50 rounded-md text-sm font-medium transition-colors"
                >
                  <LayoutDashboard className="h-4 w-4 mr-1.5" />
                  Dashboard
                </Link>
                <Link
                  to="/seller/products"
                  className="flex items-center px-3 py-2 text-gray-700 hover:text-orange-600 hover:bg-orange-50 rounded-md text-sm font-medium transition-colors"
                >
                  <Package className="h-4 w-4 mr-1.5" />
                  Products
                </Link>
                <Link
                  to="/seller/orders"
                  className="relative flex items-center px-3 py-2 text-gray-700 hover:text-orange-600 hover:bg-orange-50 rounded-md text-sm font-medium transition-colors"
                >
                  <ShoppingCart className="h-4 w-4 mr-1.5" />
                  Orders
                  {actionRequiredCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {actionRequiredCount}
                    </span>
                  )}
                </Link>
                <Link
                  to="/seller/payments"
                  className="flex items-center px-3 py-2 text-gray-700 hover:text-orange-600 hover:bg-orange-50 rounded-md text-sm font-medium transition-colors"
                >
                  <Wallet className="h-4 w-4 mr-1.5" />
                  Payments
                </Link>
                {showAnalytics && (
                  <Link
                    to="/seller/analytics"
                    className="flex items-center px-3 py-2 text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded-md text-sm font-medium transition-colors"
                  >
                    <BarChart3 className="h-4 w-4 mr-1.5" />
                    Analytics
                  </Link>
                )}
              </>
            )}

            {userRole === "admin" && (
              <>
                <Link
                  to="/admin/dashboard"
                  className="flex items-center px-3 py-2 text-gray-700 hover:text-orange-600 hover:bg-orange-50 rounded-md text-sm font-medium transition-colors"
                >
                  <Settings className="h-4 w-4 mr-1.5" />
                  Dashboard
                </Link>
                <Link
                  to="/admin/orders"
                  className="flex items-center px-3 py-2 text-gray-700 hover:text-orange-600 hover:bg-orange-50 rounded-md text-sm font-medium transition-colors"
                >
                  <ShoppingCart className="h-4 w-4 mr-1.5" />
                  Orders
                </Link>
                <Link
                  to="/admin/disputes"
                  className="flex items-center px-3 py-2 text-gray-700 hover:text-orange-600 hover:bg-orange-50 rounded-md text-sm font-medium transition-colors"
                >
                  <AlertCircle className="h-4 w-4 mr-1.5" />
                  Disputes
                </Link>
                <Link
                  to="/admin/products"
                  className="flex items-center px-3 py-2 text-gray-700 hover:text-orange-600 hover:bg-orange-50 rounded-md text-sm font-medium transition-colors"
                >
                  <Package className="h-4 w-4 mr-1.5" />
                  Products
                </Link>
                <Link
                  to="/admin/users"
                  className="flex items-center px-3 py-2 text-gray-700 hover:text-orange-600 hover:bg-orange-50 rounded-md text-sm font-medium transition-colors"
                >
                  <Users className="h-4 w-4 mr-1.5" />
                  Users
                </Link>
                <Link
                  to="/admin/constitution"
                  className="flex items-center px-3 py-2 text-gray-700 hover:text-orange-600 hover:bg-orange-50 rounded-md text-sm font-medium transition-colors"
                >
                  <BookOpen className="h-4 w-4 mr-1.5" />
                  Constitution
                </Link>
                <Link
                  to="/admin/bank-approvals"
                  className="flex items-center px-3 py-2 text-gray-700 hover:text-orange-600 hover:bg-orange-50 rounded-md text-sm font-medium transition-colors"
                >
                  <CreditCard className="h-4 w-4 mr-1.5" />
                  Bank Approvals
                </Link>
              </>
            )}

            {/* Common links */}
            <Link
              to="/support"
              className="flex items-center px-3 py-2 text-gray-700 hover:text-orange-600 hover:bg-orange-50 rounded-md text-sm font-medium transition-colors"
            >
              <HelpCircle className="h-4 w-4 mr-1.5" />
              Help
            </Link>
          </div>

          {/* Right side: Search + User Menu */}
          <div className="hidden md:flex items-center space-x-4">
            {/* Search form */}
            {userRole === "buyer" && (
              <form onSubmit={handleSearchSubmit} className="relative">
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64 px-4 py-2 pl-10 pr-12 text-sm border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-orange-600 hover:text-orange-700 text-xs font-medium"
                >
                  Go
                </button>
              </form>
            )}

            {/* User dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center space-x-2 text-gray-700 hover:text-orange-600 focus:outline-none"
              >
                <div className="bg-orange-100 rounded-full p-1.5">
                  <User className="h-5 w-5 text-orange-600" />
                </div>
                <ChevronDown className="h-4 w-4" />
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                  <Link
                    to="/profile"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600"
                    onClick={closeMenus}
                  >
                    <User className="inline h-4 w-4 mr-2" />
                    My Profile
                  </Link>

                  {userRole === "buyer" && (
                    <>
                      <Link
                        to="/orders"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600"
                        onClick={closeMenus}
                      >
                        <Package className="inline h-4 w-4 mr-2" />
                        My Orders
                        {actionRequiredCount > 0 && (
                          <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
                            {actionRequiredCount}
                          </span>
                        )}
                      </Link>
                      <Link
                        to="/cart"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600"
                        onClick={closeMenus}
                      >
                        <ShoppingCart className="inline h-4 w-4 mr-2" />
                        My Cart
                        {cartCount > 0 && (
                          <span className="ml-2 bg-orange-500 text-white text-xs rounded-full px-2 py-0.5">
                            {cartCount}
                          </span>
                        )}
                      </Link>
                    </>
                  )}

                  {userRole === "seller" && (
                    <>
                      <Link
                        to="/seller/orders"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600"
                        onClick={closeMenus}
                      >
                        <ShoppingCart className="inline h-4 w-4 mr-2" />
                        Orders
                        {actionRequiredCount > 0 && (
                          <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
                            {actionRequiredCount}
                          </span>
                        )}
                      </Link>
                      <Link
                        to="/seller/dashboard"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600"
                        onClick={closeMenus}
                      >
                        <LayoutDashboard className="inline h-4 w-4 mr-2" />
                        Seller Dashboard
                      </Link>
                    </>
                  )}

                  <div className="border-t border-gray-100 my-1"></div>
                  {onLogout && (
                    <button
                      onClick={() => {
                        closeMenus();
                        onLogout();
                      }}
                      className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <LogOut className="inline h-4 w-4 mr-2" />
                      Logout
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenu(!mobileMenu)}
            className="md:hidden p-2 rounded-md text-gray-600 hover:text-orange-600 hover:bg-orange-50 focus:outline-none"
          >
            {mobileMenu ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu panel */}
      {mobileMenu && (
        <div className="md:hidden bg-white border-t border-gray-200 py-4 px-4">
          {/* Search for mobile */}
          {userRole === "buyer" && (
            <form onSubmit={handleSearchSubmit} className="mb-4">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 pl-10 pr-12 text-sm border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-orange-600 text-xs font-medium"
                >
                  Go
                </button>
              </div>
            </form>
          )}

          <div className="flex flex-col space-y-2">
            {userRole === "buyer" && (
              <>
                <Link
                  to="/orders"
                  className="flex justify-between items-center px-3 py-2 text-gray-700 hover:bg-orange-50 rounded-md"
                  onClick={closeMenus}
                >
                  <span className="flex items-center">
                    <Package className="h-5 w-5 mr-2" />
                    Orders
                  </span>
                  {actionRequiredCount > 0 && (
                    <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
                      {actionRequiredCount}
                    </span>
                  )}
                </Link>
                <Link
                  to="/cart"
                  className="flex justify-between items-center px-3 py-2 text-gray-700 hover:bg-orange-50 rounded-md"
                  onClick={closeMenus}
                >
                  <span className="flex items-center">
                    <ShoppingCart className="h-5 w-5 mr-2" />
                    Cart
                  </span>
                  {cartCount > 0 && (
                    <span className="bg-orange-500 text-white text-xs rounded-full px-2 py-0.5">
                      {cartCount}
                    </span>
                  )}
                </Link>
              </>
            )}

            {userRole === "seller" && (
              <>
                <Link
                  to="/seller/dashboard"
                  className="flex items-center px-3 py-2 text-gray-700 hover:bg-orange-50 rounded-md"
                  onClick={closeMenus}
                >
                  <LayoutDashboard className="h-5 w-5 mr-2" />
                  Dashboard
                </Link>
                <Link
                  to="/seller/products"
                  className="flex items-center px-3 py-2 text-gray-700 hover:bg-orange-50 rounded-md"
                  onClick={closeMenus}
                >
                  <Package className="h-5 w-5 mr-2" />
                  Products
                </Link>
                <Link
                  to="/seller/orders"
                  className="flex justify-between items-center px-3 py-2 text-gray-700 hover:bg-orange-50 rounded-md"
                  onClick={closeMenus}
                >
                  <span className="flex items-center">
                    <ShoppingCart className="h-5 w-5 mr-2" />
                    Orders
                  </span>
                  {actionRequiredCount > 0 && (
                    <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
                      {actionRequiredCount}
                    </span>
                  )}
                </Link>
                <Link
                  to="/seller/payments"
                  className="flex items-center px-3 py-2 text-gray-700 hover:bg-orange-50 rounded-md"
                  onClick={closeMenus}
                >
                  <Wallet className="h-5 w-5 mr-2" />
                  Payments
                </Link>
                {showAnalytics && (
                  <Link
                    to="/seller/analytics"
                    className="flex items-center px-3 py-2 text-orange-600 hover:bg-orange-50 rounded-md"
                    onClick={closeMenus}
                  >
                    <BarChart3 className="h-5 w-5 mr-2" />
                    Analytics
                  </Link>
                )}
              </>
            )}

            {userRole === "admin" && (
              <>
                <Link
                  to="/admin/dashboard"
                  className="flex items-center px-3 py-2 text-gray-700 hover:bg-orange-50 rounded-md"
                  onClick={closeMenus}
                >
                  <Settings className="h-5 w-5 mr-2" />
                  Dashboard
                </Link>
                <Link
                  to="/admin/orders"
                  className="flex items-center px-3 py-2 text-gray-700 hover:bg-orange-50 rounded-md"
                  onClick={closeMenus}
                >
                  <ShoppingCart className="h-5 w-5 mr-2" />
                  Orders
                </Link>
                <Link
                  to="/admin/disputes"
                  className="flex items-center px-3 py-2 text-gray-700 hover:bg-orange-50 rounded-md"
                  onClick={closeMenus}
                >
                  <AlertCircle className="h-5 w-5 mr-2" />
                  Disputes
                </Link>
                <Link
                  to="/admin/products"
                  className="flex items-center px-3 py-2 text-gray-700 hover:bg-orange-50 rounded-md"
                  onClick={closeMenus}
                >
                  <Package className="h-5 w-5 mr-2" />
                  Products
                </Link>
                <Link
                  to="/admin/users"
                  className="flex items-center px-3 py-2 text-gray-700 hover:bg-orange-50 rounded-md"
                  onClick={closeMenus}
                >
                  <Users className="h-5 w-5 mr-2" />
                  Users
                </Link>
                <Link
                  to="/admin/constitution"
                  className="flex items-center px-3 py-2 text-gray-700 hover:bg-orange-50 rounded-md"
                  onClick={closeMenus}
                >
                  <BookOpen className="h-5 w-5 mr-2" />
                  Constitution
                </Link>
                <Link
                  to="/admin/bank-approvals"
                  className="flex items-center px-3 py-2 text-gray-700 hover:bg-orange-50 rounded-md"
                  onClick={closeMenus}
                >
                  <CreditCard className="h-5 w-5 mr-2" />
                  Bank Approvals
                </Link>
              </>
            )}

            <Link
              to="/profile"
              className="flex items-center px-3 py-2 text-gray-700 hover:bg-orange-50 rounded-md"
              onClick={closeMenus}
            >
              <User className="h-5 w-5 mr-2" />
              Profile
            </Link>
            <Link
              to="/support"
              className="flex items-center px-3 py-2 text-gray-700 hover:bg-orange-50 rounded-md"
              onClick={closeMenus}
            >
              <HelpCircle className="h-5 w-5 mr-2" />
              Help
            </Link>
            {onLogout && (
              <button
                onClick={() => {
                  closeMenus();
                  onLogout();
                }}
                className="flex items-center px-3 py-2 text-red-600 hover:bg-red-50 rounded-md w-full text-left"
              >
                <LogOut className="h-5 w-5 mr-2" />
                Logout
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}