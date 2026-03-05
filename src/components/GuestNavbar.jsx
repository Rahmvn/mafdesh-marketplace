import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ShoppingBag, User, LogIn } from 'lucide-react';
import landscapeLogo from '../../mafdesh-img/landscape-logo-removebg-preview.png';

export default function GuestNavbar() {
  const navigate = useNavigate();

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center cursor-pointer" onClick={() => navigate('/')}>
            <img
              src={landscapeLogo}
              alt="Mafdesh"
              className="h-10 w-auto"
            />
          </div>

          {/* Center - Browse Products */}
          <div className="hidden md:flex items-center">
            <button
              // onClick={() => navigate('/products')}
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
