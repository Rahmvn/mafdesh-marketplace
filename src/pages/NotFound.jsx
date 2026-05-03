import React from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import FooterSlim from '../components/FooterSlim';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <p className="text-8xl font-bold text-orange-500">404</p>
          <h1 className="mt-4 text-2xl font-bold text-blue-900">
            Page not found
          </h1>
          <p className="mt-3 text-slate-500">
            The page you are looking for does not exist or has been moved.
          </p>
          <button
            onClick={() => navigate('/marketplace')}
            className="mt-6 rounded-xl bg-orange-600 px-6 py-3 font-semibold text-white hover:bg-orange-700"
          >
            Go to Marketplace
          </button>
        </div>
      </main>
      <FooterSlim />
    </div>
  );
}
