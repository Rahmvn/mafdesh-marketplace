import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Navbar from '../components/Navbar';
import Footer from '../components/FooterSlim';
import { MarketplaceDetailSkeleton } from '../components/MarketplaceLoading';
import { CheckCircle } from 'lucide-react';
import { snapshotToProduct } from '../utils/productSnapshots';
import { getBuyerOrderAmounts } from '../utils/orderAmounts';

export default function OrderSuccess() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState(null);

  const loadOrder = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*, products!orders_product_id_fkey(name)')
      .eq('id', id)
      .maybeSingle();

    if (!error && data) {
      setOrder(data);
    } else {
      setOrder(null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const loadInitialOrder = async () => {
      await loadOrder();
    };

    loadInitialOrder();
  }, [loadOrder]);
  if (loading) return <MarketplaceDetailSkeleton />;
  if (!order) return <div className="min-h-screen flex items-center justify-center">Order not found</div>;
  const orderProduct = snapshotToProduct(order.product_snapshot, order.products || null);
  const orderAmounts = getBuyerOrderAmounts(order);

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        <div className="bg-white rounded-xl border border-green-200 p-8 text-center">
          <CheckCircle size={64} className="mx-auto text-green-600 mb-4" />
          <h1 className="text-2xl font-bold text-blue-900 mb-2">Order Confirmed!</h1>
          <p className="text-gray-600 mb-6">Your order has been placed successfully.</p>

          <div className="bg-blue-50 p-4 rounded-lg text-left mb-6">
            <p><strong>Order ID:</strong> {order.id}</p>
            <p><strong>Product:</strong> {orderProduct?.name || 'Product'}</p>
            <p><strong>Subtotal:</strong> ₦{orderAmounts.subtotal.toLocaleString()}</p>
            <p><strong>Delivery:</strong> ₦{orderAmounts.deliveryFee.toLocaleString()}</p>
            <p><strong>Total:</strong> ₦{orderAmounts.total.toLocaleString()}</p>
            <p><strong>Status:</strong> {order.status}</p>
          </div>

          <div className="flex gap-4 justify-center">
            <Link to="/orders" className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">
              View My Orders
            </Link>
            <Link to="/marketplace" className="border border-blue-600 text-blue-600 px-6 py-2 rounded-lg hover:bg-blue-50">
              Continue Shopping
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

