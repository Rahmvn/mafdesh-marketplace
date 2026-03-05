import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export default function SellerOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    const storedUser = JSON.parse(localStorage.getItem('mafdesh_user'));
    if (!storedUser) return;

const { data, error } = await supabase
  .from('orders')
  .select(`
    *,
    products (
      name,
      images
    )
  `)
  .eq('seller_id', storedUser.id)
  .order('created_at', { ascending: false });

    if (!error) setOrders(data);
    setLoading(false);
  };

  const handleMarkShipped = async (orderId) => {
    await supabase
      .from('orders')
      .update({
        status: 'SHIPPED',
        shipped_at: new Date()
      })
      .eq('id', orderId);

    loadOrders();
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'PENDING_PAYMENT':
        return 'bg-gray-100 text-gray-700';
      case 'PAYMENT_RECEIVED':
        return 'bg-orange-100 text-orange-700';
      case 'SHIPPED':
        return 'bg-blue-100 text-blue-700';
      case 'COMPLETED':
        return 'bg-green-100 text-green-700';
      case 'DISPUTED':
        return 'bg-red-100 text-red-700';
      case 'CANCELLED':
        return 'bg-gray-200 text-gray-800';
      case 'REFUNDED':
        return 'bg-blue-50 text-blue-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        <h1 className="text-2xl font-bold text-blue-900 mb-6">Seller Orders</h1>

        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : orders.length === 0 ? (
          <div className="bg-white p-8 rounded-xl border border-blue-100 text-center">
            <p className="text-blue-700">No orders yet.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {orders.map(order => (
              <div
                key={order.id}
                className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm"
              >
                <div className="flex flex-col md:flex-row justify-between gap-4">

                  {/* LEFT SIDE */}
                  <div className="flex gap-4">
                    <img
                      src={order.products?.images?.[0]}
                      alt={order.products?.name}
                      className="w-20 h-20 object-contain border rounded-lg"
                    />

                    <div>
                      <p className="font-semibold text-blue-900">
                        {order.products?.name}
                      </p>

                      <p className="text-sm text-blue-600 mt-1">
                        Buyer: {order.users?.full_name}
                      </p>
                      <p className="text-sm text-gray-500">
Delivery Type: {order.delivery_type}
</p>

<p className="text-sm text-gray-500">
State: {order.delivery_state}
</p>

{order.delivery_address && (
  <p className="text-sm text-gray-500">
    Address: {order.delivery_address}
  </p>
)}

                      <p className="text-sm text-gray-500 mt-1">
                        ₦{Number(order.total_amount).toLocaleString()}
                      </p>

                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(order.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>


                  {/* RIGHT SIDE */}
                  <div className="flex flex-col items-start md:items-end gap-3">

                    <span className={`px-3 py-1 text-xs font-semibold rounded-full ${getStatusStyle(order.status)}`}>
                      {order.status.replaceAll('_', ' ')}
                    </span>

                    {order.status === 'PAYMENT_RECEIVED' && (
                      <button
                        onClick={() => handleMarkShipped(order.id)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
                      >
                        Mark as Shipped
                      </button>
                    )}

                  </div>

                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}