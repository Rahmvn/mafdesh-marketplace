import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';


export default function BuyerOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrders();
  }, []);
const loadOrders = async () => {

  const { data: { user } } = await supabase.auth.getUser();

  console.log("Logged in user:", user);

  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
     products:products!orders_product_id_fkey (
  name,
  images
)
    `)
    .eq('buyer_id', user.id)
    .order('created_at', { ascending: false });

  console.log("Orders returned:", data);
  console.log("Error:", error);

  if (!error) setOrders(data || []);

  setLoading(false);
};

// const handleConfirmDelivery = async (orderId) => {
//   const confirmAction = window.confirm(
//     "Confirm that you have received this item? This will release payment to the seller."
//   );

//   if (!confirmAction) return;

//   const { error } = await supabase
//     .from('orders')
//     .update({
//       status: 'COMPLETED',
//       completed_at: new Date()
//     })
//     .eq('id', orderId);

//   if (!error) {
//     loadOrders();
//   } else {
//     console.error(error);
//     alert("Failed to confirm delivery");
//   }
// };
//   const handleSimulatePayment = async (orderId) => {
//   const { error } = await supabase
//     .from('orders')
//     .update({
//       status: 'PAID_ESCROW',
//       paid_at: new Date()
//     })
//     .eq('id', orderId);

//   if (!error) {
//     loadOrders(); // reload list
//   } else {
//     console.error(error);
//     alert('Failed to simulate payment');
//   }
// };

//   const handleReportIssue = async (orderId) => {
//     await supabase
//       .from('orders')
//       .update({
//         status: 'DISPUTED'
//       })
//       .eq('id', orderId);

//     loadOrders();
//   };

//   const handleCancel = async (orderId) => {
//     await supabase
//       .from('orders')
//       .update({
//         status: 'CANCELLED'
//       })
//       .eq('id', orderId);

//     loadOrders();
//   };

//   if (loading) {
//     return <div className="min-h-screen flex items-center justify-center">Loading orders...</div>;
//   }

const handleConfirmDelivery = async (orderId) => {

  const confirmAction = window.confirm(
    "Confirm that you received the item. You have inspected it and it matches the description."
  );

  if (!confirmAction) return;

  const { error } = await supabase
    .from("orders")
    .update({
      status: "DELIVERED",
      delivered_at: new Date()
    })
    .eq("id", orderId);

  if (error) {
    console.error(error);
    alert("Failed to confirm delivery");
    return;
  }

  loadOrders();
};
const handleReportIssue = async (orderId) => {

  const reason = prompt("Describe the issue with this order:");

  if (!reason) return;

  const { error } = await supabase
    .from("orders")
    .update({
      status: "DISPUTED",
      dispute_reason: reason,
      disputed_at: new Date()
    })
    .eq("id", orderId);

  if (error) {
    console.error(error);
    alert("Failed to report issue");
    return;
  }

  loadOrders();
};
  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        <h1 className="text-2xl font-bold text-blue-900 mb-6">My Orders</h1>

        {orders.length === 0 ? (
          <div className="bg-white p-8 rounded-xl border border-blue-100 text-center">
            <p className="text-blue-700">You have no orders yet.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {orders.map(order => (
              <div
                key={order.id}
                className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm"
              >
                <div className="flex flex-col md:flex-row gap-4 justify-between">

                  {/* LEFT */}
                  <div className="flex gap-4">
                    <img
                      src={order.products?.images?.[0] || "/placeholder.png"}
                      alt={order.products?.name}
                      className="w-20 h-20 object-contain border rounded-lg"
                    />

                    <div>
                      <p className="font-semibold text-blue-900">
                        {order.products?.name}
                      </p>
                      <p className="text-sm text-blue-600 mt-1">
                        ₦{Number(order.total_amount).toLocaleString()}
                      </p>
                      <p className="text-xs mt-2 text-gray-500">
                        Ordered on {new Date(order.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
               
<button
  onClick={() => navigate(`/buyer/orders/${order.id}`)}
  className="text-blue-600 text-sm underline"
>
  View Order
</button>

                  {/* RIGHT */}
                  <div className="flex flex-col items-start md:items-end gap-3">

                    <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                      order.status === 'COMPLETED'

                        ? 'bg-green-100 text-green-700'
                        : order.status === 'DELIVERED'
? 'bg-purple-100 text-purple-700'
                        : order.status === 'SHIPPED'
                        ? 'bg-blue-100 text-blue-700'
                        : order.status === 'PAID_ESCROW'
                        ? 'bg-orange-100 text-orange-700'
                        : order.status === 'DISPUTED'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {order.status === "SHIPPED" && (
  <button
    onClick={() => handleConfirmDelivery(order.id)}
    className="bg-green-600 text-white px-4 py-2 rounded text-sm"
  >
    Confirm Delivery
  </button>
)}

{order.status === "DELIVERED" && (
  <button
    onClick={() => handleReportIssue(order.id)}
    className="bg-red-600 text-white px-4 py-2 rounded text-sm"
  >
    Report Problem
  </button>
)}
                      {order.status.replaceAll('_', ' ')}
                    </span>

                  

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