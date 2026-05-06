import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  Clock,
  DollarSign,
  Package,
  User,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import Navbar from "../components/Navbar";
import Footer from "../components/FooterSlim";
import useModal from "../hooks/useModal";
import AdminActionModal from "../components/AdminActionModal";
import {
  resolveDisputeImageUrls,
  resolveOrderDispute,
} from "../services/disputeService";
import {
  fetchOrderAdminHolds,
  getActiveOrderAdminHold,
  getOrderAdminHoldDescription,
  getOrderAdminHoldTitle,
  resolveOrderAdminHold,
} from "../services/orderAdminHoldService";
import { getSafeProductImage, snapshotToProduct } from "../utils/productSnapshots";
import {
  formatBusinessDeadline,
  formatRemaining,
  getBusinessUrgencyClass,
  getUrgencyClass,
} from "../utils/timeUtils";
import { useOrderDeadlineAutoProcessing } from "../services/orderDeadlineService";

function AdminPageSkeleton() {
  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-100" />
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, rowIndex) => (
              <div key={rowIndex} className="grid gap-4 md:grid-cols-4">
                {Array.from({ length: 4 }).map((__, columnIndex) => (
                  <div
                    key={`${rowIndex}-${columnIndex}`}
                    className="h-4 animate-pulse rounded bg-gray-100"
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

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

const RESOLUTION_OPTIONS = [
  { value: "full_refund", label: "Full Refund (buyer returns item)" },
  { value: "partial_refund", label: "Partial Refund (buyer keeps item)" },
  { value: "release", label: "Release Escrow to Seller" },
  { value: "cancelled", label: "Cancel Order" },
];

function formatCurrency(value) {
  return `N${Number(value || 0).toLocaleString()}`;
}

function getResolutionLabel(resolutionType) {
  return (
    RESOLUTION_OPTIONS.find((option) => option.value === resolutionType)?.label ||
    resolutionType
  );
}

export default function AdminOrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [buyer, setBuyer] = useState(null);
  const [seller, setSeller] = useState(null);
  const [evidence, setEvidence] = useState([]);
  const [adminHolds, setAdminHolds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [buyerHistory, setBuyerHistory] = useState(null);
  const [sellerHistory, setSellerHistory] = useState(null);
  const [resolutionType, setResolutionType] = useState("");
  const [partialAmount, setPartialAmount] = useState("");
  const [constitutionSection, setConstitutionSection] = useState("");
  const [notes, setNotes] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolutionModalOpen, setResolutionModalOpen] = useState(false);
  const [holdResolutionType, setHoldResolutionType] = useState("continue_order");
  const [holdResolutionNotes, setHoldResolutionNotes] = useState("");
  const [resolvingHold, setResolvingHold] = useState(false);
  const { showSuccess, showError, showWarning, ModalComponent } = useModal();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const loadUserHistory = useCallback(async (userId, role) => {
    try {
      const { data, error } = await supabase
        .from("user_dispute_history")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      if (role === "buyer") {
        setBuyerHistory(data || null);
      } else {
        setSellerHistory(data || null);
      }
    } catch (error) {
      console.error(`Error loading ${role} history:`, error);
    }
  }, []);

  const loadOrder = useCallback(async () => {
    setLoading(true);

    try {
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select("*")
        .eq("id", id)
        .single();

      if (orderError || !orderData) {
        throw orderError || new Error("Order not found.");
      }

      const { data: itemsData, error: itemsError } = await supabase
        .from("order_items")
        .select(`
          quantity,
          price_at_time,
          product_snapshot,
          product:products (
            id,
            name,
            images,
            category,
            description,
            seller_id
          )
        `)
        .eq("order_id", id);

      let finalItems = [];

      if (!itemsError && itemsData?.length) {
        finalItems = itemsData.map((item) => ({
          ...item,
          product: snapshotToProduct(item.product_snapshot, item.product),
        }));
      } else if (orderData.product_id) {
        const { data: productData } = await supabase
          .from("products")
          .select("id, name, images, category, description, seller_id")
          .eq("id", orderData.product_id)
          .maybeSingle();

        const normalizedProduct = snapshotToProduct(orderData.product_snapshot, productData || null);
        finalItems = [
          {
            quantity: orderData.quantity,
            price_at_time: orderData.product_price,
            product: normalizedProduct || {
              id: orderData.product_id,
              name: "Product not found",
              images: [],
            },
          },
        ];
      }

      const [{ data: buyerUser }, { data: buyerProfile }, { data: sellerUser }, { data: sellerProfile }] =
        await Promise.all([
          supabase
            .from("users")
            .select("id, email, phone_number")
            .eq("id", orderData.buyer_id)
            .maybeSingle(),
          supabase
            .from("profiles")
            .select("full_name, username, location")
            .eq("id", orderData.buyer_id)
            .maybeSingle(),
          supabase
            .from("users")
            .select("id, email, phone_number, status, account_status, business_name")
            .eq("id", orderData.seller_id)
            .maybeSingle(),
          supabase
            .from("profiles")
            .select("full_name, username, location")
            .eq("id", orderData.seller_id)
            .maybeSingle(),
        ]);

      let evidenceUrls = [];
      if (orderData.dispute_images?.length) {
        evidenceUrls = await resolveDisputeImageUrls(orderData.dispute_images, 3600);
      }

      setOrder(orderData);
      setItems(finalItems);
      setBuyer({ ...buyerUser, ...buyerProfile });
      setSeller({ ...sellerUser, ...sellerProfile });
      setEvidence(evidenceUrls);
      setAdminHolds(await fetchOrderAdminHolds(id).catch(() => []));

      await Promise.all([
        loadUserHistory(orderData.buyer_id, "buyer"),
        loadUserHistory(orderData.seller_id, "seller"),
      ]);
    } catch (error) {
      console.error("Error loading order:", error);
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [id, loadUserHistory]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  useEffect(() => {
    const channel = supabase
      .channel(`admin-order-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` },
        () => loadOrder()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_admin_holds", filter: `order_id=eq.${id}` },
        () => loadOrder()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, loadOrder]);

  const validateResolution = () => {
    if (!resolutionType || !constitutionSection) {
      showWarning("Resolution Required", "Please select a resolution type and constitution section.");
      return false;
    }

    if (resolutionType === "partial_refund") {
      const amount = Number(partialAmount);
      if (!partialAmount || Number.isNaN(amount) || amount <= 0) {
        showWarning("Invalid Amount", "Please enter a valid partial refund amount.");
        return false;
      }
    }

    return true;
  };

  const openResolutionModal = (event) => {
    event.preventDefault();

    if (!validateResolution()) {
      return;
    }

    setResolutionModalOpen(true);
  };

  const closeResolutionModal = () => {
    if (!resolving) {
      setResolutionModalOpen(false);
    }
  };

  const handleResolveDispute = async ({ reason }) => {
    if (!order) {
      return;
    }

    const resolutionAmount =
      resolutionType === "partial_refund" ? Number.parseFloat(partialAmount) : null;

    setResolving(true);

    try {
      await resolveOrderDispute({
        orderId: order.id,
        resolutionType,
        constitutionSection,
        reason,
        resolutionNotes: notes.trim() || null,
        resolutionAmount,
      });

      setResolutionModalOpen(false);
      showSuccess("Dispute Resolved", "Dispute resolved successfully.");
      navigate("/admin/disputes");
    } catch (error) {
      console.error("Error resolving dispute:", error);
      showError("Resolution Failed", "Failed to resolve dispute.");
    } finally {
      setResolving(false);
    }
  };

  const activeAdminHold = getActiveOrderAdminHold(adminHolds);

  useOrderDeadlineAutoProcessing({
    orders: order
      ? [
          {
            ...order,
            has_active_hold: Boolean(activeAdminHold),
          },
        ]
      : [],
    now,
    enabled: !loading && Boolean(order),
    onProcessed: loadOrder,
    debugLabel: "admin order auto-processing",
  });

  if (loading) {
    return <AdminPageSkeleton />;
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-50">
        Order not found.
      </div>
    );
  }

  const deliverySnapshot = order.delivery_zone_snapshot || null;
  const pickupSnapshot = order.pickup_location_snapshot || null;
  const sellerAccountActive =
    String(seller?.account_status || seller?.status || "active").toLowerCase() === "active";

  const handleResolveHeldOrder = async () => {
    if (!activeAdminHold) {
      return;
    }

    if (!holdResolutionType) {
      showWarning("Resolution Required", "Select how this held order should be resolved.");
      return;
    }

    setResolvingHold(true);
    try {
      await resolveOrderAdminHold(
        activeAdminHold.id,
        holdResolutionType,
        holdResolutionNotes.trim()
      );
      setHoldResolutionType("continue_order");
      setHoldResolutionNotes("");
      showSuccess("Hold Resolved", "Moderation hold updated successfully.");
      await loadOrder();
    } catch (error) {
      console.error("Resolve hold error:", error);
      showError("Resolution Failed", error.message || "Failed to resolve this moderation hold.");
    } finally {
      setResolvingHold(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <h1 className="text-3xl font-bold text-blue-900">Admin Order Details</h1>
          <button
            onClick={() => navigate("/admin/disputes")}
            className="text-blue-600 hover:underline"
          >
            Back to Disputes
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {activeAdminHold ? (
            <section className="bg-amber-50 border border-amber-200 p-6 rounded-lg md:col-span-2">
              <h2 className="font-semibold mb-3 text-amber-900 flex items-center gap-2">
                <AlertCircle size={20} />
                {getOrderAdminHoldTitle(activeAdminHold)}
              </h2>
              <p className="text-sm text-amber-800">
                {getOrderAdminHoldDescription(activeAdminHold)}
              </p>
              <p className="mt-3 text-sm text-amber-900">
                <strong>Reason:</strong> {activeAdminHold.reason}
              </p>
              <p className="mt-1 text-sm text-amber-900">
                <strong>Triggered by:</strong> {activeAdminHold.trigger_action.replaceAll("_", " ")}
              </p>
              <p className="mt-1 text-sm text-amber-900">
                <strong>Created:</strong> {new Date(activeAdminHold.created_at).toLocaleString()}
              </p>

              <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <select
                  value={holdResolutionType}
                  onChange={(event) => setHoldResolutionType(event.target.value)}
                  className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="continue_order">Continue order</option>
                  <option value="refund_order">Refund order</option>
                  <option value="cancel_order">Cancel order</option>
                </select>
                <input
                  type="text"
                  value={holdResolutionNotes}
                  onChange={(event) => setHoldResolutionNotes(event.target.value)}
                  placeholder="Resolution notes"
                  className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={handleResolveHeldOrder}
                  disabled={
                    resolvingHold ||
                    (holdResolutionType === "continue_order" &&
                      activeAdminHold.trigger_action === "SUSPEND_USER" &&
                      !sellerAccountActive)
                  }
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {resolvingHold ? "Saving..." : "Resolve Hold"}
                </button>
              </div>

              {holdResolutionType === "continue_order" &&
              activeAdminHold.trigger_action === "SUSPEND_USER" &&
              !sellerAccountActive ? (
                <p className="mt-3 text-sm text-red-700">
                  Reactivate the seller account before continuing this held order.
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="bg-white p-6 rounded-lg border">
            <h2 className="font-semibold mb-4 text-blue-900 flex items-center gap-2">
              <DollarSign size={20} className="text-orange-600" />
              Order Info
            </h2>
            <p>
              <strong>Order Number:</strong> {order.order_number || order.id.slice(0, 8)}
            </p>
            <p>
              <strong>Order ID:</strong> {order.id}
            </p>
            <p>
              <strong>Status:</strong> {order.status}
            </p>
            <p>
              <strong>Amount:</strong> {formatCurrency(order.total_amount)}
            </p>
            <p>
              <strong>Platform Fee:</strong> {formatCurrency(order.platform_fee)}
            </p>
            <p>
              <strong>Delivery Type:</strong> {order.delivery_type || "N/A"}
            </p>
            <p>
              <strong>Date:</strong> {new Date(order.created_at).toLocaleDateString()}
            </p>
          </section>

          <section className="bg-white p-6 rounded-lg border">
            <h2 className="font-semibold mb-4 text-blue-900 flex items-center gap-2">
              <User size={20} className="text-orange-600" />
              Buyer
            </h2>
            <p>
              <strong>Name:</strong> {buyer?.full_name || buyer?.username || "Unknown"}
            </p>
            <p>
              <strong>Email:</strong> {buyer?.email || "Unknown"}
            </p>
            <p>
              <strong>Phone:</strong> {buyer?.phone_number || "Unknown"}
            </p>
            <p>
              <strong>ID:</strong> {buyer?.id || "Unknown"}
            </p>
          </section>

          <section className="bg-white p-6 rounded-lg border">
            <h2 className="font-semibold mb-4 text-blue-900 flex items-center gap-2">
              <User size={20} className="text-orange-600" />
              Seller
            </h2>
            <p>
              <strong>Name:</strong> {seller?.full_name || seller?.username || "Unknown"}
            </p>
            <p>
              <strong>Email:</strong> {seller?.email || "Unknown"}
            </p>
            <p>
              <strong>Phone:</strong> {seller?.phone_number || "Unknown"}
            </p>
            <p>
              <strong>ID:</strong> {seller?.id || "Unknown"}
            </p>
          </section>

          <section className="bg-white p-6 rounded-lg border md:col-span-2">
            <h2 className="font-semibold mb-4 text-blue-900 flex items-center gap-2">
              <Package size={20} className="text-orange-600" />
              Items
            </h2>

            {items.length === 0 ? (
              <p className="text-gray-500">No items found for this order.</p>
            ) : (
              <div className="space-y-4">
                {items.map((item, index) => {
                  const imageUrl = getSafeProductImage(item.product);

                  return (
                    <div
                      key={`${item.product?.id || "item"}-${index}`}
                      className="flex gap-4 items-start border-b pb-4 last:border-b-0 last:pb-0"
                    >
                      <img
                        src={imageUrl}
                        alt={item.product?.name || "Product"}
                        className="w-16 h-16 object-contain border rounded"
                      />
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {item.product?.name || "Unnamed Product"}
                        </h3>
                        <p className="text-xs text-gray-500">
                          Product ID: {item.product?.id || "Unknown"}
                        </p>
                        <p className="text-sm text-gray-600">Quantity: {item.quantity}</p>
                        <p className="text-orange-600 font-medium">
                          {formatCurrency(item.price_at_time)} each
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {order.delivery_type === "delivery" && (
            <section className="bg-white p-6 rounded-lg border md:col-span-2">
              <h2 className="font-semibold mb-4 text-blue-900">Delivery Info</h2>
              <p>
                <strong>State:</strong> {order.delivery_state || "N/A"}
              </p>
              <p>
                <strong>Address:</strong> {order.delivery_address || "N/A"}
              </p>
              {deliverySnapshot && (
                <p>
                  <strong>Delivery Fee Snapshot:</strong> {formatCurrency(deliverySnapshot.flat_fee)}
                </p>
              )}
            </section>
          )}

          {order.delivery_type === "pickup" && (
            <section className="bg-white p-6 rounded-lg border md:col-span-2">
              <h2 className="font-semibold mb-4 text-blue-900">Pickup Info</h2>
              <p>
                <strong>Location:</strong> {pickupSnapshot?.label || order.selected_pickup_location || "N/A"}
              </p>
              <p>
                <strong>Address:</strong> {pickupSnapshot?.address_text || "N/A"}
              </p>
              <p>
                <strong>LGA:</strong> {pickupSnapshot?.lga_name || pickupSnapshot?.lga || "N/A"}
              </p>
              <p>
                <strong>City:</strong> {pickupSnapshot?.city_name || pickupSnapshot?.city || "N/A"}
              </p>
              <p>
                <strong>Area:</strong> {pickupSnapshot?.area_name || pickupSnapshot?.area || "N/A"}
              </p>
              <p>
                <strong>Landmark:</strong> {pickupSnapshot?.landmark_text || pickupSnapshot?.landmark || "N/A"}
              </p>
              <p>
                <strong>Pickup Instructions:</strong> {pickupSnapshot?.pickup_instructions || "N/A"}
              </p>
              <p>
                <strong>State:</strong> {pickupSnapshot?.state_name || "N/A"}
              </p>
            </section>
          )}

          {order.status === "DISPUTED" && (
            <section className="bg-white p-6 rounded-lg border md:col-span-2">
              <h2 className="font-semibold mb-4 text-red-600 flex items-center gap-2">
                <AlertCircle size={20} />
                Dispute Details
              </h2>
              <p className="mb-4">
                <strong>Reason:</strong> {order.dispute_reason || "No reason recorded"}
              </p>

              {evidence.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {evidence.map((imageUrl, index) => (
                    <img
                      key={imageUrl || index}
                      src={imageUrl}
                      alt={`dispute evidence ${index + 1}`}
                      className="rounded border"
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No dispute evidence uploaded.</p>
              )}
            </section>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <section className="bg-white rounded-lg border p-6">
            <h2 className="font-semibold text-lg mb-3 flex items-center gap-2">
              <Clock size={20} className="text-orange-600" />
              Buyer Dispute History
            </h2>
            {buyerHistory ? (
              <div>
                <p className="text-sm">
                  <strong>Total disputes as buyer:</strong>{" "}
                  {buyerHistory.total_disputes_as_buyer}
                </p>
                {buyerHistory.buyer_disputes?.length > 0 ? (
                  <div className="mt-2 max-h-40 overflow-y-auto text-xs">
                    {buyerHistory.buyer_disputes.map((dispute, index) => (
                      <div key={index} className="border-b py-1">
                        <span className="font-medium">
                          Order {dispute.order_id?.slice(0, 8)}:
                        </span>{" "}
                        {dispute.resolution_type} ({dispute.constitution_section})
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
          </section>

          <section className="bg-white rounded-lg border p-6">
            <h2 className="font-semibold text-lg mb-3 flex items-center gap-2">
              <Clock size={20} className="text-orange-600" />
              Seller Dispute History
            </h2>
            {sellerHistory ? (
              <div>
                <p className="text-sm">
                  <strong>Total disputes as seller:</strong>{" "}
                  {sellerHistory.total_disputes_as_seller}
                </p>
                {sellerHistory.seller_disputes?.length > 0 ? (
                  <div className="mt-2 max-h-40 overflow-y-auto text-xs">
                    {sellerHistory.seller_disputes.map((dispute, index) => (
                      <div key={index} className="border-b py-1">
                        <span className="font-medium">
                          Order {dispute.order_id?.slice(0, 8)}:
                        </span>{" "}
                        {dispute.resolution_type} ({dispute.constitution_section})
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
          </section>
        </div>

        <section className="bg-white p-6 rounded-lg border mt-6">
          <h2 className="font-semibold mb-4">Timers</h2>
          {order.ship_deadline && (
            <p className={`text-sm ${getBusinessUrgencyClass(order.ship_deadline, now)}`}>
              Ship by: {formatBusinessDeadline(order.ship_deadline, now)}
            </p>
          )}
          {order.auto_complete_at && (
            <p className={`text-sm ${getUrgencyClass(order.auto_complete_at, now)}`}>
              Auto-complete: {formatRemaining(order.auto_complete_at, now)}
            </p>
          )}
          {order.auto_cancel_at && (
            <p className={`text-sm ${getBusinessUrgencyClass(order.auto_cancel_at, now)}`}>
              Auto-cancel: {formatBusinessDeadline(order.auto_cancel_at, now)}
            </p>
          )}
        </section>

        {order.status === "DISPUTED" && (
          <section className="bg-white rounded-lg border p-6 mt-6">
            <h2 className="text-xl font-semibold mb-4">Resolve Dispute</h2>
            <form onSubmit={openResolutionModal} className="space-y-4">
              <div>
                <label className="block font-medium mb-1">Resolution Type</label>
                <select
                  value={resolutionType}
                  onChange={(event) => setResolutionType(event.target.value)}
                  className="w-full p-2 border rounded"
                  required
                >
                  <option value="">Select type</option>
                  {RESOLUTION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {resolutionType === "partial_refund" && (
                <div>
                  <label className="block font-medium mb-1">
                    Partial Refund Amount (N)
                  </label>
                  <input
                    type="number"
                    value={partialAmount}
                    onChange={(event) => setPartialAmount(event.target.value)}
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
                  onChange={(event) => setConstitutionSection(event.target.value)}
                  className="w-full p-2 border rounded"
                  required
                >
                  <option value="">Select applicable section</option>
                  {CONSTITUTION_SECTIONS.map((section) => (
                    <option key={section.value} value={section.value}>
                      {section.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium mb-1">
                  Additional Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows="3"
                  className="w-full p-2 border rounded"
                  placeholder="Add context that should stay on the order record."
                />
              </div>

              <button
                type="submit"
                disabled={resolving}
                className="bg-orange-600 text-white px-6 py-2 rounded-lg hover:bg-orange-700 disabled:opacity-50"
              >
                {resolving ? "Processing..." : "Review Resolution"}
              </button>
            </form>
          </section>
        )}
      </main>

      <AdminActionModal
        isOpen={resolutionModalOpen}
        title="Confirm Dispute Resolution"
        description="This decision will update the order and create an immutable admin audit entry."
        actionLabel="Resolve Dispute"
        reasonLabel="Required accountability reason"
        reasonPlaceholder="Explain why this resolution is justified."
        confirmTone="warning"
        loading={resolving}
        onClose={closeResolutionModal}
        onConfirm={handleResolveDispute}
      >
        <div className="rounded-lg border border-orange-100 bg-orange-50 p-3 text-sm text-gray-700">
          <p>
            <strong>Resolution:</strong> {getResolutionLabel(resolutionType)}
          </p>
          <p>
            <strong>Constitution Section:</strong> {constitutionSection}
          </p>
          {resolutionType === "partial_refund" && (
            <p>
              <strong>Partial Amount:</strong> {formatCurrency(partialAmount)}
            </p>
          )}
          {notes.trim() && (
            <p className="whitespace-pre-wrap">
              <strong>Additional Notes:</strong> {notes.trim()}
            </p>
          )}
        </div>
      </AdminActionModal>

      <Footer />
      <ModalComponent />
    </div>
  );
}

