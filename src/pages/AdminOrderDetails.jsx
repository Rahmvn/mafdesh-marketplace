import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { AlertCircle, Clock, User, Package, DollarSign } from "lucide-react";

// Constitution sections (based on your Admin Constitution)
const CONSTITUTION_SECTIONS = [
  { value: "4.1", label: "4.1 - Item Never Arrived" },
  { value: "4.2", label: "4.2 - Item Arrived Damaged" },
  { value: "4.3", label: "4.3 - Wrong Item Sent" },
  { value: "4.4", label: "4.4 - Item Different From Description" },
  { value: "4.5", label: "4.5 - Buyer Claims Fake Product" },
  { value: "4.6", label: "4.6 - Buyer Damaged Item" },
  { value: "4.7", label: "4.7 - Seller Did Not Ship" },
  { value: "4.8", label: "4.8 - Buyer Never Picks Up Order" },
  { value: "4.9", label: "4.9 - Buyer Attempts Fraudulent Dispute" },
  { value: "4.10", label: "4.10 - Seller Attempts Fraud" },
  { value: "4.11", label: "4.11 - Split Responsibility" },
  { value: "4.12", label: "4.12 - Missing Accessories" },
  { value: "5.1", label: "5.1 - Digital Goods Issue" },
  { value: "5.2", label: "5.2 - Service Issue" },
];

export default function AdminOrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const admin = JSON.parse(localStorage.getItem("mafdesh_user"));

  const [order, setOrder] = useState(null);
  const [product, setProduct] = useState(null);
  const [buyer, setBuyer] = useState(null);
  const [seller, setSeller] = useState(null);
  const [evidence, setEvidence] = useState([]);
  const [loading, setLoading] = useState(true);

  // Dispute history
  const [buyerHistory, setBuyerHistory] = useState(null);
  const [sellerHistory, setSellerHistory] = useState(null);

  // Resolution form
  const [resolutionType, setResolutionType] = useState("");
  const [partialAmount, setPartialAmount] = useState("");
  const [constitutionSection, setConstitutionSection] = useState("");
  const [notes, setNotes] = useState("");
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    checkAuth();
    loadOrder();
  }, [id]);

  const checkAuth = () => {
    const storedUser = localStorage.getItem("mafdesh_user");
    if (!storedUser) {
      navigate("/login");
      return;
    }
    const user = JSON.parse(storedUser);
    if (user.role !== "admin") {
      navigate("/login");
    }
  };

  const loadOrder = async () => {
    setLoading(true);
    try {
      // 1. Fetch order
      const { data: orderData, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !orderData) {
        console.error(error);
        setLoading(false);
        return;
      }

      // 2. Fetch product
      const { data: productData } = await supabase
        .from("products")
        .select("name,images")
        .eq("id", orderData.product_id)
        .single();

      // 3. Fetch buyer
      const { data: buyerUser } = await supabase
        .from("users")
        .select("id,email,phone_number")
        .eq("id", orderData.buyer_id)
        .maybeSingle();

      const { data: buyerProfile } = await supabase
        .from("profiles")
        .select("full_name,username,location")
        .eq("id", orderData.buyer_id)
        .maybeSingle();

      // 4. Fetch seller
      const { data: sellerUser } = await supabase
        .from("users")
        .select("id,email,phone_number")
        .eq("id", orderData.seller_id)
        .maybeSingle();

      const { data: sellerProfile } = await supabase
        .from("profiles")
        .select("full_name,username,location")
        .eq("id", orderData.seller_id)
        .maybeSingle();

      setOrder(orderData);
      setProduct(productData || {});
      setBuyer({ ...buyerUser, ...buyerProfile });
      setSeller({ ...sellerUser, ...sellerProfile });

      // 5. Load dispute images
      if (orderData.dispute_images?.length) {
        const urls = [];
        for (const path of orderData.dispute_images) {
          const { data } = await supabase.storage
            .from("dispute-evidence")
            .createSignedUrl(path, 3600);
          if (data?.signedUrl) {
            urls.push(data.signedUrl);
          }
        }
        setEvidence(urls);
      }

      // 6. Load user dispute history
      await Promise.all([
        loadUserHistory(orderData.buyer_id, "buyer"),
        loadUserHistory(orderData.seller_id, "seller"),
      ]);
    } catch (err) {
      console.error("Error loading order:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadUserHistory = async (userId, role) => {
    try {
      const { data, error } = await supabase
        .from("user_dispute_history")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      if (role === "buyer") setBuyerHistory(data || null);
      else setSellerHistory(data || null);
    } catch (err) {
      console.error(`Error loading ${role} history:`, err);
    }
  };

  const handleResolve = async (e) => {
    e.preventDefault();

    if (!resolutionType || !constitutionSection) {
      alert("Please select resolution type and constitution section.");
      return;
    }
    if (resolutionType === "partial_refund" && !partialAmount) {
      alert("Please enter partial refund amount.");
      return;
    }

    setResolving(true);

    try {
      // Insert into admin_actions (immutable log)
      const { error: actionError } = await supabase
        .from("admin_actions")
        .insert({
          admin_id: admin.id,
          order_id: order.id,
          action_type: resolutionType,
          amount: resolutionType === "partial_refund" ? parseFloat(partialAmount) : null,
          reason: notes,
          constitution_section: constitutionSection,
          metadata: { dispute_reason: order.dispute_reason },
        });

      if (actionError) throw actionError;

      // Update order
      const updateData = {
        dispute_status: "resolved",
        resolved_by: admin.id,
        resolution_type: resolutionType,
        constitution_section: constitutionSection,
        resolution_notes: notes,
        resolved_at: new Date().toISOString(),
      };

      if (resolutionType === "full_refund" || resolutionType === "partial_refund") {
        updateData.status = "REFUNDED";
      } else if (resolutionType === "release") {
        updateData.status = "COMPLETED";
      } else if (resolutionType === "cancelled") {
        updateData.status = "CANCELLED";
      }

      if (resolutionType === "partial_refund") {
        updateData.resolution_amount = parseFloat(partialAmount);
      }

      const { error: orderError } = await supabase
        .from("orders")
        .update(updateData)
        .eq("id", order.id);

      if (orderError) throw orderError;

      alert("Dispute resolved successfully!");
      navigate("/admin/disputes");
    } catch (err) {
      console.error("Error resolving dispute:", err);
      alert("Failed to resolve dispute. Check console.");
    } finally {
      setResolving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading order...
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Order not found
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-blue-900">Admin Order Details</h1>
          <button
            onClick={() => navigate("/admin/disputes")}
            className="text-blue-600 hover:underline"
          >
            ← Back to Disputes
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* PRODUCT */}
          <div className="bg-white p-6 rounded-lg border">
            <h2 className="font-semibold mb-4 text-blue-900 flex items-center gap-2">
              <Package size={20} className="text-orange-600" />
              Product
            </h2>
            <img
              src={product?.images?.[0]}
              alt={product?.name}
              className="w-40 h-40 object-contain mb-4"
            />
            <p className="font-semibold text-lg">{product?.name}</p>
          </div>

          {/* ORDER INFO */}
          <div className="bg-white p-6 rounded-lg border">
            <h2 className="font-semibold mb-4 text-blue-900 flex items-center gap-2">
              <DollarSign size={20} className="text-orange-600" />
              Order Info
            </h2>
            <p><strong>Order ID:</strong> {order.id}</p>
            <p><strong>Status:</strong> {order.status}</p>
            <p><strong>Amount:</strong> ₦{Number(order.total_amount).toLocaleString()}</p>
            <p><strong>Platform Fee:</strong> ₦{Number(order.platform_fee).toLocaleString()}</p>
            <p><strong>Delivery Type:</strong> {order.delivery_type}</p>
            <p><strong>Date:</strong> {new Date(order.created_at).toLocaleDateString()}</p>
          </div>

          {/* BUYER */}
          <div className="bg-white p-6 rounded-lg border">
            <h2 className="font-semibold mb-4 text-blue-900 flex items-center gap-2">
              <User size={20} className="text-orange-600" />
              Buyer
            </h2>
            <p><strong>Name:</strong> {buyer?.full_name || buyer?.username || "Unknown"}</p>
            <p><strong>Email:</strong> {buyer?.email ?? "Unknown"}</p>
            <p><strong>Phone:</strong> {buyer?.phone_number ?? "Unknown"}</p>
            <p><strong>ID:</strong> {buyer?.id ?? "Unknown"}</p>
          </div>

          {/* SELLER */}
          <div className="bg-white p-6 rounded-lg border">
            <h2 className="font-semibold mb-4 text-blue-900 flex items-center gap-2">
              <User size={20} className="text-orange-600" />
              Seller
            </h2>
            <p><strong>Name:</strong> {seller?.full_name ?? "Unknown"}</p>
            <p><strong>Email:</strong> {seller?.email ?? "Unknown"}</p>
            <p><strong>Phone:</strong> {seller?.phone_number ?? "Unknown"}</p>
            <p><strong>ID:</strong> {seller?.id ?? "Unknown"}</p>
          </div>

          {/* DELIVERY INFO */}
          {order.delivery_type === "delivery" && (
            <div className="bg-white p-6 rounded-lg border md:col-span-2">
              <h2 className="font-semibold mb-4 text-blue-900">Delivery Info</h2>
              <p><strong>State:</strong> {order.delivery_state}</p>
              <p><strong>Address:</strong> {order.delivery_address}</p>
            </div>
          )}

          {/* DISPUTE SECTION */}
          {order.status === "DISPUTED" && (
            <div className="bg-white p-6 rounded-lg border md:col-span-2">
              <h2 className="font-semibold mb-4 text-red-600 flex items-center gap-2">
                <AlertCircle size={20} />
                Dispute Details
              </h2>
              <p className="mb-4"><strong>Reason:</strong> {order.dispute_reason}</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {evidence.map((img, i) => (
                  <img key={i} src={img} alt="evidence" className="rounded border" />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* USER DISPUTE HISTORY */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <div className="bg-white rounded-lg border p-6">
            <h2 className="font-semibold text-lg mb-3 flex items-center gap-2">
              <Clock size={20} className="text-orange-600" />
              Buyer Dispute History
            </h2>
            {buyerHistory ? (
              <div>
                <p className="text-sm">
                  <strong>Total disputes as buyer:</strong> {buyerHistory.total_disputes_as_buyer}
                </p>
                {buyerHistory.buyer_disputes?.length > 0 ? (
                  <div className="mt-2 max-h-40 overflow-y-auto text-xs">
                    {buyerHistory.buyer_disputes.map((d, i) => (
                      <div key={i} className="border-b py-1">
                        <span className="font-medium">Order {d.order_id?.slice(0,8)}:</span> {d.resolution_type} ({d.constitution_section})
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No previous disputes.</p>
                )}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No dispute history found.</p>
            )}
          </div>

          <div className="bg-white rounded-lg border p-6">
            <h2 className="font-semibold text-lg mb-3 flex items-center gap-2">
              <Clock size={20} className="text-orange-600" />
              Seller Dispute History
            </h2>
            {sellerHistory ? (
              <div>
                <p className="text-sm">
                  <strong>Total disputes as seller:</strong> {sellerHistory.total_disputes_as_seller}
                </p>
                {sellerHistory.seller_disputes?.length > 0 ? (
                  <div className="mt-2 max-h-40 overflow-y-auto text-xs">
                    {sellerHistory.seller_disputes.map((d, i) => (
                      <div key={i} className="border-b py-1">
                        <span className="font-medium">Order {d.order_id?.slice(0,8)}:</span> {d.resolution_type} ({d.constitution_section})
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No previous disputes.</p>
                )}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No dispute history found.</p>
            )}
          </div>
        </div>
{/* Deadlines */}
<div className="bg-white p-6 rounded-lg border">
  <h2 className="font-semibold mb-4">Timers</h2>
  {order.ship_deadline && <p>Ship by: {new Date(order.ship_deadline).toLocaleString()}</p>}
  {order.auto_complete_at && <p>Auto‑complete: {new Date(order.auto_complete_at).toLocaleString()}</p>}
  {order.auto_cancel_at && <p>Auto‑cancel: {new Date(order.auto_cancel_at).toLocaleString()}</p>}
</div>
        {/* RESOLUTION FORM (only for disputed orders) */}
        {order.status === "DISPUTED" && (
          <div className="bg-white rounded-lg border p-6 mt-6">
            <h2 className="text-xl font-semibold mb-4">Resolve Dispute</h2>
            <form onSubmit={handleResolve} className="space-y-4">
              <div>
                <label className="block font-medium mb-1">Resolution Type</label>
                <select
                  value={resolutionType}
                  onChange={(e) => setResolutionType(e.target.value)}
                  className="w-full p-2 border rounded"
                  required
                >
                  <option value="">Select type</option>
                  <option value="full_refund">Full Refund (buyer returns item)</option>
                  <option value="partial_refund">Partial Refund (buyer keeps item)</option>
                  <option value="release">Release Escrow to Seller</option>
                  <option value="cancelled">Cancel Order</option>
                </select>
              </div>

              {resolutionType === "partial_refund" && (
                <div>
                  <label className="block font-medium mb-1">Partial Refund Amount (₦)</label>
                  <input
                    type="number"
                    value={partialAmount}
                    onChange={(e) => setPartialAmount(e.target.value)}
                    className="w-full p-2 border rounded"
                    min="1"
                    step="0.01"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block font-medium mb-1">Constitution Section</label>
                <select
                  value={constitutionSection}
                  onChange={(e) => setConstitutionSection(e.target.value)}
                  className="w-full p-2 border rounded"
                  required
                >
                  <option value="">Select applicable section</option>
                  {CONSTITUTION_SECTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium mb-1">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows="3"
                  className="w-full p-2 border rounded"
                  placeholder="Add any reasoning or context..."
                />
              </div>

              <button
                type="submit"
                disabled={resolving}
                className="bg-orange-600 text-white px-6 py-2 rounded-lg hover:bg-orange-700 disabled:opacity-50"
              >
                {resolving ? "Processing..." : "Resolve Dispute & Log"}
              </button>
            </form>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}