import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

export default function SellerPayments() {

  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [totalEarned, setTotalEarned] = useState(0);
  const [pendingPayout, setPendingPayout] = useState(0);
  const [paidPayout, setPaidPayout] = useState(0);

  useEffect(() => {
    loadPayouts();
  }, []);

  const loadPayouts = async () => {

    const { data: session } = await supabase.auth.getSession();

    if (!session.session) return;

    const sellerId = session.session.user.id;

    const { data, error } = await supabase
      .from("seller_payouts")
      .select(`
        *,
        orders (
          id,
          product_price,
          created_at,
          products (
            name,
            images
          )
        )
      `)
      .eq("seller_id", sellerId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    setPayouts(data);

    /* calculate stats */

    let earned = 0;
    let pending = 0;
    let paid = 0;

    data.forEach(p => {

      earned += Number(p.amount);

      if (p.status === "PENDING") {
        pending += Number(p.amount);
      }

      if (p.status === "PAID") {
        paid += Number(p.amount);
      }

    });

    setTotalEarned(earned);
    setPendingPayout(pending);
    setPaidPayout(paid);

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading payments...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">

      <Navbar />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">

        <h1 className="text-2xl font-bold text-blue-900 mb-8">
          Seller Earnings
        </h1>

        {/* STATS */}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">

          <div className="bg-white p-6 rounded-xl border">
            <p className="text-gray-500 text-sm">Total Earned</p>
            <p className="text-2xl font-bold text-blue-900">
              ₦{totalEarned.toLocaleString()}
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl border">
            <p className="text-gray-500 text-sm">Pending Payout</p>
            <p className="text-2xl font-bold text-orange-600">
              ₦{pendingPayout.toLocaleString()}
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl border">
            <p className="text-gray-500 text-sm">Paid Out</p>
            <p className="text-2xl font-bold text-green-600">
              ₦{paidPayout.toLocaleString()}
            </p>
          </div>

        </div>

        {/* PAYOUT TABLE */}

        <div className="bg-white rounded-xl border overflow-hidden">

          <table className="w-full">

            <thead className="bg-blue-900 text-white text-sm">

              <tr>
                <th className="px-4 py-3 text-left">Product</th>
                <th className="px-4 py-3 text-left">Order</th>
                <th className="px-4 py-3 text-left">Amount</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Date</th>
              </tr>

            </thead>

            <tbody>

              {payouts.length === 0 && (
                <tr>
                  <td colSpan="5" className="p-6 text-center text-gray-500">
                    No earnings yet.
                  </td>
                </tr>
              )}

              {payouts.map(p => (

                <tr key={p.id} className="border-t">

                  <td className="px-4 py-3 flex items-center gap-3">

                    <img
                      src={p.orders?.products?.images?.[0]}
                      alt=""
                      className="w-10 h-10 object-contain border rounded"
                    />

                    <span className="text-sm font-semibold text-blue-900">
                      {p.orders?.products?.name}
                    </span>

                  </td>

                  <td className="px-4 py-3 text-sm text-gray-600">
                    #{p.order_id?.slice(0,8)}
                  </td>

                  <td className="px-4 py-3 font-semibold">
                    ₦{Number(p.amount).toLocaleString()}
                  </td>

                  <td className="px-4 py-3">

                    <span
                      className={`px-3 py-1 text-xs rounded-full ${
                        p.status === "PAID"
                          ? "bg-green-100 text-green-700"
                          : "bg-orange-100 text-orange-700"
                      }`}
                    >
                      {p.status}
                    </span>

                  </td>

                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(p.created_at).toLocaleDateString()}
                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      </main>

      <Footer />

    </div>
  );
}