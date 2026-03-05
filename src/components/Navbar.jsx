import React from 'react';
import { useState, useEffect } from "react";
import landscapeLogo from '../../mafdesh-img/landscape-logo-removebg-preview.png';
import { Link, useNavigate } from "react-router-dom";
import { Search, Menu, X, Home, HelpCircle, LogOut, User, BarChart3, ShoppingCart, Package, Settings, Users, CheckCircle, Bell, Wallet } from "lucide-react";
import { cartService } from '../services/cartService';


export default function Navbar({ onLogout }) {
  const [mobileMenu, setMobileMenu] = useState(false);
  const [search, setSearch] = useState("");
  const [userRole, setUserRole] = useState(null);
  const [isVerified, setIsVerified] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const storedUser = localStorage.getItem('mafdesh_user');
    if (storedUser) {
      const userData = JSON.parse(storedUser);
      setUserRole(userData.role);
      setIsVerified(userData.is_verified || false);

      if (userData.role === 'buyer') {
        loadCartCount();
      }
    }
  }, []);

  const loadCartCount = async () => {
    try {
      const response = await cartService.getCart();
      const items = response?.cart || [];
      const count = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
      setCartCount(count);
    } catch (error) {
      console.error('Error loading cart count:', error);
      setCartCount(0);
    }
  };

  const getHomePath = () => {
    if (userRole === 'seller') return '/seller/dashboard';
    if (userRole === 'admin') return '/admin/dashboard';
    return '/marketplace';
  };

  const handleSearch = (e) => {
    e.preventDefault();

    if (!search.trim()) return;

    navigate(`/marketplace?search=${encodeURIComponent(search)}`);
  };

  const homePath = getHomePath();
  const showAnalytics = userRole === 'seller' && isVerified;

  return (
    <nav className="bg-white shadow-lg border-b-2 border-blue-100">
      <div className="max-w-full mx-auto px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <Link to={homePath} className="flex items-center gap-2 group flex-shrink-0">
            <img
              src={landscapeLogo}
              alt="Mafdesh"
              className="w-auto object-contain transition-all duration-200 group-hover:scale-105"
              style={{ height: "40px" }}
            />
            {/* branding badge removed per design — no HALAL badge shown here */}
          </Link>

          {userRole === 'buyer' && (
           <div className="hidden md:flex items-center flex-1 max-w-2xl mx-6">
              <div className="relative w-full">
                <input
                  type="text"
                  placeholder="Search for products, brands, and categories..."
                  className="w-full px-5 py-3 pl-12 pr-4 rounded-lg border-2 border-orange-300 focus:outline-none focus:border-orange-500 transition-all bg-white text-gray-900 placeholder-gray-500 text-sm shadow-sm"
                  value={search}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSearch(value);
                    navigate(`/marketplace?search=${encodeURIComponent(value)}`);
                  }}
                />
                <Search
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-orange-500"
                  size={20}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-1.5 rounded-md text-xs font-semibold transition-colors"
                >
                  Search
                </button>
              </div>
              
            </div>
          )}
          

          <div className="hidden md:flex items-center gap-1">
            {userRole === 'buyer' && (
              
              <>
              <Link
  to="/orders"
  className="flex items-center gap-2 text-blue-700 hover:text-blue-900 transition-colors font-semibold px-4 py-2 rounded-lg hover:bg-blue-50 group"
>
  <Package size={22} className="group-hover:scale-110 transition-transform" />
  <span className="text-sm">Orders</span>
</Link>
                <Link
                  to="/cart"
                  className="relative flex items-center gap-2 text-blue-700 hover:text-blue-900 transition-colors font-semibold px-4 py-2 rounded-lg hover:bg-blue-50 group"
                >
                  <ShoppingCart size={22} className="group-hover:scale-110 transition-transform" />
                  <span className="text-sm">Cart</span>
                  {cartCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-orange-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-md">
                      {cartCount > 9 ? '9+' : cartCount}
                    </span>
                  )}
                </Link>
              </>
            )}

            {userRole === 'seller' && (
              <>
                <Link
                  to="/seller/products"
                  className="flex items-center gap-2 text-blue-700 hover:text-blue-900 transition-colors font-semibold px-3 py-2 rounded-lg hover:bg-blue-50 text-sm"
                >
                  <Package size={18} />
                  <span>Products</span>
                </Link>
                <Link
                  to="/seller/orders"
                  className="flex items-center gap-2 text-blue-700 hover:text-blue-900 transition-colors font-semibold px-3 py-2 rounded-lg hover:bg-blue-50 text-sm"
                >
                  <ShoppingCart size={18} />
                  <span>Orders</span>
                </Link>
                <Link
                  to="/seller/payments"
                  className="flex items-center gap-2 text-blue-700 hover:text-blue-900 transition-colors font-semibold px-3 py-2 rounded-lg hover:bg-blue-50 text-sm"
                >
                  <Wallet size={18} />
                  <span>Payments</span>
                </Link>
                {showAnalytics && (
                  <Link
                    to="/seller/analytics"
                    className="flex items-center gap-2 text-orange-600 hover:text-orange-700 transition-colors font-semibold px-3 py-2 rounded-lg hover:bg-orange-50 text-sm"
                  >
                    <BarChart3 size={18} />
                    <span>Analytics</span>
                  </Link>
                )}
              </>
            )}

            {userRole === 'admin' && (
              <>
                <Link
                  to="/admin/dashboard"
                  className="flex items-center gap-2 text-blue-700 hover:text-blue-900 transition-colors font-semibold px-3 py-2 rounded-lg hover:bg-blue-50 text-sm"
                >
                  <Settings size={18} />
                  <span>Dashboard</span>
                </Link>
                <Link
                  to="/admin/products"
                  className="flex items-center gap-2 text-blue-700 hover:text-blue-900 transition-colors font-semibold px-3 py-2 rounded-lg hover:bg-blue-50 text-sm"
                >
                  <Package size={18} />
                  <span>Products</span>
                </Link>
                <Link
                  to="/admin/users"
                  className="flex items-center gap-2 text-blue-700 hover:text-blue-900 transition-colors font-semibold px-3 py-2 rounded-lg hover:bg-blue-50 text-sm"
                >
                  <Users size={18} />
                  <span>Users</span>
                </Link>
                <Link
                  to="/admin/approvals"
                  className="flex items-center gap-2 text-orange-600 hover:text-orange-700 transition-colors font-semibold px-3 py-2 rounded-lg hover:bg-orange-50 text-sm"
                >
                  <CheckCircle size={18} />
                  <span>Approvals</span>
                </Link>
              </>
            )}

            <Link
              to="/support"
              className="flex items-center gap-2 text-blue-700 hover:text-blue-900 transition-colors font-semibold px-3 py-2 rounded-lg hover:bg-blue-50 text-sm"
            >
              <HelpCircle size={18} />
              <span>Help</span>
            </Link>

            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2 text-white bg-blue-700 hover:bg-blue-800 transition-colors font-semibold px-4 py-2 rounded-lg text-sm shadow-md"
              >
                <User size={18} />
                <span>Account</span>
              </button>

              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border-2 border-blue-100 py-2 z-50">
                  <Link
                    to="/profile"
                    className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-colors text-blue-900 font-medium"
                    onClick={() => setShowProfileMenu(false)}
                  >
                    <User size={18} className="text-blue-600" />
                    <span>My Profile</span>
                  </Link>

{userRole === 'buyer' && (
  <>
    <Link
      to="/orders"
      className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-colors text-blue-900 font-medium"
      onClick={() => setShowProfileMenu(false)}
    >
      <Package size={18} className="text-blue-600" />
      <span>My Orders</span>
    </Link>
    <Link
      to="/cart"
      className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-colors text-blue-900 font-medium"
      onClick={() => setShowProfileMenu(false)}
    >
      <ShoppingCart size={18} className="text-blue-600" />
      <span>My Cart</span>
    </Link>
  </>
)}
                  <div className="border-t border-blue-100 my-2"></div>
                  {onLogout && (
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        onLogout();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-orange-50 transition-colors text-orange-600 font-semibold"
                    >
                      <LogOut size={18} />
                      <span>Logout</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          

          <button
            className="md:hidden text-blue-700 hover:text-blue-900 transition-all p-2 hover:bg-blue-50 rounded-lg"
            onClick={() => setMobileMenu(!mobileMenu)}
          >
            {mobileMenu ? <X size={26} /> : <Menu size={26} />}
          </button>
        </div>

        {mobileMenu && (
          
          <div className="md:hidden mt-4 pb-4 border-t-2 border-blue-100 pt-4">
            {userRole === 'buyer' && (
  <div className="mb-4">
    <input
      type="text"
      placeholder="Search products..."
      className="w-full px-4 py-3 rounded-lg border border-orange-300 focus:outline-none focus:border-orange-500 text-sm"
      value={search}
      onChange={(e) => {
        const value = e.target.value;
        setSearch(value);
        navigate(`/marketplace?search=${encodeURIComponent(value)}`);
      }}
    />
  </div>
)}
<div className="flex flex-col gap-2">
  {userRole === 'buyer' && (
    <>
      <Link
        to="/orders"
        className="flex items-center gap-3 text-blue-700 hover:text-blue-900 transition-all font-semibold px-4 py-3 rounded-lg hover:bg-blue-50"
        onClick={() => setMobileMenu(false)}
      >
        <Package size={20} />
        <span>Orders</span>
      </Link>
                  <Link
                    to="/cart"
                    className="flex items-center justify-between text-orange-600 hover:text-orange-700 transition-all font-semibold px-4 py-3 rounded-lg hover:bg-orange-50"
                    onClick={() => setMobileMenu(false)}
                  >
                    <div className="flex items-center gap-3">
                      <ShoppingCart size={20} />
                      <span>Cart</span>
                    </div>
                    {cartCount > 0 && (
                      <span className="bg-orange-600 text-white text-xs font-bold rounded-full px-2 py-0.5">
                        {cartCount}
                      </span>
                    )}
                  </Link>
                </>
              )}

              {userRole === 'seller' && (
                <>
                  <Link
                    to="/seller/dashboard"
                    className="flex items-center gap-3 text-blue-700 hover:text-blue-900 transition-all font-semibold px-4 py-3 rounded-lg hover:bg-blue-50"
                    onClick={() => setMobileMenu(false)}
                  >
                    <Package size={20} />
                    <span>Products</span>
                  </Link>
                  <Link
                    to="/seller/orders"
                    className="flex items-center gap-3 text-blue-700 hover:text-blue-900 transition-all font-semibold px-4 py-3 rounded-lg hover:bg-blue-50"
                    onClick={() => setMobileMenu(false)}
                  >
                    <ShoppingCart size={20} />
                    <span>Orders</span>
                  </Link>
                  <Link
                    to="/seller/payments"
                    className="flex items-center gap-3 text-blue-700 hover:text-blue-900 transition-all font-semibold px-4 py-3 rounded-lg hover:bg-blue-50"
                    onClick={() => setMobileMenu(false)}
                  >
                    <Wallet size={20} />
                    <span>Payments</span>
                  </Link>
                  {showAnalytics && (
                    <Link
                      to="/seller/analytics"
                      className="flex items-center gap-3 text-orange-600 hover:text-orange-700 transition-all font-semibold px-4 py-3 rounded-lg hover:bg-orange-50"
                      onClick={() => setMobileMenu(false)}
                    >
                      <BarChart3 size={20} />
                      <span>Analytics</span>
                    </Link>
                  )}
                </>
              )}

              {userRole === 'admin' && (
                <>
                  <Link
                    to="/admin/dashboard"
                    className="flex items-center gap-3 text-blue-700 hover:text-blue-900 transition-all font-semibold px-4 py-3 rounded-lg hover:bg-blue-50"
                    onClick={() => setMobileMenu(false)}
                  >
                    <Settings size={20} />
                    <span>Dashboard</span>
                  </Link>
                  <Link
                    to="/admin/products"
                    className="flex items-center gap-3 text-blue-700 hover:text-blue-900 transition-all font-semibold px-4 py-3 rounded-lg hover:bg-blue-50"
                    onClick={() => setMobileMenu(false)}
                  >
                    <Package size={20} />
                    <span>Products</span>
                  </Link>
                  <Link
                    to="/admin/users"
                    className="flex items-center gap-3 text-blue-700 hover:text-blue-900 transition-all font-semibold px-4 py-3 rounded-lg hover:bg-blue-50"
                    onClick={() => setMobileMenu(false)}
                  >
                    <Users size={20} />
                    <span>Users</span>
                  </Link>
                  <Link
                    to="/admin/approvals"
                    className="flex items-center gap-3 text-orange-600 hover:text-orange-700 transition-all font-semibold px-4 py-3 rounded-lg hover:bg-orange-50"
                    onClick={() => setMobileMenu(false)}
                  >
                    <CheckCircle size={20} />
                    <span>Approvals</span>
                  </Link>
                </>
              )}

              <Link
                to="/profile"
                className="flex items-center gap-3 text-blue-700 hover:text-blue-900 transition-all font-semibold px-4 py-3 rounded-lg hover:bg-blue-50"
                onClick={() => setMobileMenu(false)}
              >
                <User size={20} />
                <span>Profile</span>
              </Link>
              <Link
                to="/support"
                className="flex items-center gap-3 text-blue-700 hover:text-blue-900 transition-all font-semibold px-4 py-3 rounded-lg hover:bg-blue-50"
                onClick={() => setMobileMenu(false)}
              >
                <HelpCircle size={20} />
                <span>Help</span>
              </Link>
              {onLogout && (
                <button
                  onClick={() => {
                    setMobileMenu(false);
                    onLogout();
                  }}
                  className="flex items-center gap-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white px-4 py-3 rounded-xl hover:from-orange-600 hover:to-orange-700 transition-all font-semibold w-full shadow-lg"
                >
                  <LogOut size={20} />
                  <span>Logout</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
