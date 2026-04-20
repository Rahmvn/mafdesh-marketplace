import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/FooterSlim';
import { CheckCircle } from 'lucide-react';

export default function OrderSuccessMultiple() {
  const location = useLocation();
  const navigate = useNavigate();
  const { orderIds } = location.state || { orderIds: [] };

  useEffect(() => {
    if (!orderIds || orderIds.length === 0) {
      navigate('/marketplace');
    }
  }, [orderIds, navigate]);

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-12">
        <div className="bg-white rounded-xl shadow-sm border border-blue-100 p-8 text-center">
          <div className="flex justify-center mb-4">
            <CheckCircle size={64} className="text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-blue-900 mb-2">Orders Placed Successfully!</h1>
          <p className="text-gray-600 mb-6">
            Your {orderIds.length} order(s) have been confirmed.
          </p>
          <div className="bg-gray-50 p-4 rounded-lg mb-6">
            <p className="text-sm text-gray-500">Order IDs:</p>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {orderIds.map(id => (
                <span key={id} className="font-mono text-xs bg-white px-2 py-1 rounded border">
                  {id.slice(0,8)}
                </span>
              ))}
            </div>
          </div>
          <div className="space-x-4">
            <button
              onClick={() => navigate('/orders')}
              className="bg-orange-600 text-white px-6 py-2 rounded-lg hover:bg-orange-700"
            >
              View My Orders
            </button>
            <button
              onClick={() => navigate('/marketplace')}
              className="border border-orange-600 text-orange-600 px-6 py-2 rounded-lg hover:bg-orange-50"
            >
              Continue Shopping
            </button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

