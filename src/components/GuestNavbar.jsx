import React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, ShoppingBag, User, LogIn } from 'lucide-react';
import landscapeLogo from '../../mafdesh-img/landscape-logo-removebg-preview.png';

export default function GuestNavbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState(
    () => new URLSearchParams(location.search).get('search') || ''
  );
  const browsePath = useMemo(
    () => (location.pathname === '/products' ? '/products' : '/'),
    [location.pathname]
  );

  useEffect(() => {
    setSearchQuery(new URLSearchParams(location.search).get('search') || '');
  }, [location.search]);

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

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between gap-3 h-16">
          {/* Logo */}
          <div className="flex items-center cursor-pointer flex-shrink-0" onClick={() => navigate('/')}>
            <img
              src={landscapeLogo}
              alt="Mafdesh"
              className="h-10 w-auto"
            />
          </div>

          <form onSubmit={handleSearchSubmit} className="hidden flex-1 md:block">
            <div className="relative mx-auto max-w-xl">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                size={20}
              />
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-full rounded-full border border-gray-300 py-2.5 pl-12 pr-4 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          </form>

          {/* Center - Browse Products */}
          <div className="hidden md:flex items-center">
            <button
              onClick={() => navigate(browsePath)}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:text-blue-700 font-medium transition-colors"
            >
              <ShoppingBag size={20} />
              <span>Browse Products</span>
            </button>
          </div>

          {/* Right - Icons Only */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/login')}
              className="p-2 text-gray-700 hover:text-blue-700 transition-colors"
              title="Login"
            >
              <LogIn size={22} />
            </button>
            <button
              onClick={() => navigate('/signup')}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
              title="Sign Up"
            >
              <User size={20} />
              <span className="hidden sm:inline">Sign Up</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
