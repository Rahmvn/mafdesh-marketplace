import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Filter,
  Eye,
  Trash2,
  CheckCircle,
  Clock,
  RotateCcw,
} from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { supabase } from "../supabaseClient";
import AdminActionModal from "../components/AdminActionModal";
import {
  ADMIN_ACTION_TYPES,
  executeGuardedAdminAction,
  getCurrentAdminUser,
} from "../services/adminActionService";

export default function AdminProducts() {
  const navigate = useNavigate();
  useMemo(() => getCurrentAdminUser(), []);

  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [updating, setUpdating] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const handleLogout = async () => {
    if (window.confirm("Are you sure you want to logout?")) {
      const { supabase } = await import("../supabaseClient");
      await supabase.auth.signOut();
      localStorage.clear();
      window.location.href = "/login";
    }
  };

  const applyFilters = useCallback((productList, statusFilter, search) => {
    let nextProducts = productList;

    if (statusFilter === "approved") {
      nextProducts = nextProducts.filter(
        (product) => product.is_approved && !product.deleted_at
      );
    } else if (statusFilter === "pending") {
      nextProducts = nextProducts.filter(
        (product) => !product.is_approved && !product.deleted_at
      );
    } else if (statusFilter === "archived") {
      nextProducts = nextProducts.filter((product) => Boolean(product.deleted_at));
    }

    if (search) {
      const term = search.toLowerCase();
      nextProducts = nextProducts.filter(
        (product) =>
          product.name?.toLowerCase().includes(term) ||
          product.seller?.business_name?.toLowerCase().includes(term) ||
          product.seller?.full_name?.toLowerCase().includes(term)
      );
    }

    setFilteredProducts(nextProducts);
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      // Direct query with explicit foreign key for seller
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          seller:users!products_seller_id_fkey(
            id,
            email,
            business_name,
            profiles!inner(full_name, username)
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Transform to match expected shape (seller info flattened)
      const transformed = (data || []).map(product => ({
        ...product,
        users: {
          business_name: product.seller?.business_name,
          profiles: {
            full_name: product.seller?.profiles?.[0]?.full_name,
            username: product.seller?.profiles?.[0]?.username,
          }
        }
      }));

      setProducts(transformed);
      applyFilters(transformed, filter, searchTerm);
    } catch (error) {
      console.error(error);
      alert("Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [applyFilters, filter, searchTerm]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // ... rest of component (openToggleModal, openDeleteModal, etc.) unchanged ...

  const openToggleModal = (product) => {
    setPendingAction({
      kind: "toggle",
      product,
      title: product.is_approved ? "Unapprove Product" : "Approve Product",
      description: `This will ${product.is_approved ? "remove" : "grant"} marketplace approval for "${product.name}".`,
      actionLabel: product.is_approved ? "Unapprove Product" : "Approve Product",
      confirmTone: product.is_approved ? "warning" : "success",
    });
  };

  const openDeleteModal = (product) => {
    setPendingAction({
      kind: "archive",
      product,
      title: "Archive Product",
      description: `This will remove "${product.name}" from storefronts while preserving the record for audit and recovery.`,
      actionLabel: "Archive Product",
      confirmTone: "danger",
      confirmationKeyword: "ARCHIVE",
      riskNotice:
        "Product removal is now a soft-delete action. The listing is hidden from buyers and sellers, but the record stays recoverable for accountability.",
    });
  };

  const openRestoreModal = (product) => {
    setPendingAction({
      kind: "restore",
      product,
      title: "Restore Product",
      description: `This will restore "${product.name}" and make the record active again.`,
      actionLabel: "Restore Product",
      confirmTone: "success",
    });
  };

  const closeModal = () => {
    if (!updating) {
      setPendingAction(null);
    }
  };

  const handleConfirmedAction = async ({ reason }) => {
    if (!pendingAction?.product) return;

    const product = pendingAction.product;
    setUpdating(true);

    try {
      if (pendingAction.kind === "toggle") {
        await executeGuardedAdminAction({
          actionType: product.is_approved
            ? ADMIN_ACTION_TYPES.UNAPPROVE_PRODUCT
            : ADMIN_ACTION_TYPES.APPROVE_PRODUCT,
          targetId: product.id,
          reason,
        });
        alert(`Product ${product.is_approved ? "unapproved" : "approved"} successfully.`);
      } else if (pendingAction.kind === "archive") {
        await executeGuardedAdminAction({
          actionType: ADMIN_ACTION_TYPES.ARCHIVE_PRODUCT,
          targetId: product.id,
          reason,
        });
        alert("Product archived successfully.");
      } else if (pendingAction.kind === "restore") {
        await executeGuardedAdminAction({
          actionType: ADMIN_ACTION_TYPES.RESTORE_PRODUCT,
          targetId: product.id,
          reason,
        });
        alert("Product restored successfully.");
      }

      setPendingAction(null);
      await loadProducts();
    } catch (error) {
      console.error(error);
      alert(error.message || "Failed to complete admin action.");
    } finally {
      setUpdating(false);
    }
  };

  // ... render method (unchanged, but references product.users... etc. will work due to transformation)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading products...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar onLogout={handleLogout} />

      <main className="flex-1 max-w-7xl mx-auto p-6 w-full">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-blue-900">
            Product Management
          </h1>
          <div className="text-sm text-gray-600">
            Total: {products.length} | Pending: {products.filter((product) => !product.is_approved && !product.deleted_at).length}
          </div>
        </div>

        <div className="bg-white rounded-lg border p-4 mb-6 flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-gray-500" />
            <select
              value={filter}
              onChange={(event) => {
                const nextFilter = event.target.value;
                setFilter(nextFilter);
                applyFilters(products, nextFilter, searchTerm);
              }}
              className="border rounded p-2 text-sm"
            >
              <option value="all">All Products</option>
              <option value="approved">Approved Only</option>
              <option value="pending">Pending Approval</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div className="flex-1 flex items-center gap-2 min-w-[220px]">
            <Search size={18} className="text-gray-500" />
            <input
              type="text"
              placeholder="Search by product name or seller..."
              value={searchTerm}
              onChange={(event) => {
                const term = event.target.value;
                setSearchTerm(term);
                applyFilters(products, filter, term);
              }}
              className="border rounded p-2 flex-1 text-sm"
            />
          </div>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
            No products found.
          </div>
        ) : (
          <div className="overflow-x-auto bg-white rounded-lg shadow border border-blue-200">
            <table className="w-full min-w-[900px]">
              <thead className="bg-blue-100 text-blue-900 text-sm uppercase">
                <tr>
                  <th className="p-3 text-left">Image</th>
                  <th className="p-3 text-left">Product</th>
                  <th className="p-3 text-left">Price</th>
                  <th className="p-3 text-left">Seller</th>
                  <th className="p-3 text-left">Last Updated</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="border-t border-blue-100 hover:bg-gray-50">
                    <td className="p-3">
                      {product.images?.[0] ? (
                        <img
                          src={
                            product.images[0].startsWith("blob:")
                              ? "https://placehold.co/600x600"
                              : product.images[0]
                          }
                          alt={product.name}
                          className="w-12 h-12 object-cover rounded"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center text-gray-400">
                          No img
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-blue-900">{product.name}</div>
                      <div className="text-xs text-gray-500">ID: {product.id.slice(0, 8)}...</div>
                    </td>
                    <td className="p-3 text-blue-700 font-medium">
                      ₦{Number(product.price).toLocaleString()}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => navigate(`/admin/users/${product.seller_id}`)}
                        className="text-blue-600 hover:underline text-left"
                      >
                        <div className="font-semibold">
                          {product.users?.business_name ||
                            product.users?.profiles?.full_name ||
                            "Unknown"}
                        </div>
                        <div className="text-xs text-blue-500">
                          @{product.users?.profiles?.username || ""}
                        </div>
                      </button>
                    </td>
                    <td className="p-3 text-xs text-gray-500">
                      {product.updated_at
                        ? new Date(product.updated_at).toLocaleDateString()
                        : "-"}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${
                          product.deleted_at
                            ? "bg-gray-200 text-gray-700"
                            : product.is_approved
                              ? "bg-green-100 text-green-700"
                              : "bg-orange-100 text-orange-700"
                        }`}
                      >
                        {product.deleted_at ? (
                          <Trash2 size={12} />
                        ) : product.is_approved ? (
                          <CheckCircle size={12} />
                        ) : (
                          <Clock size={12} />
                        )}
                        {product.deleted_at
                          ? "ARCHIVED"
                          : product.is_approved
                            ? "APPROVED"
                            : "PENDING"}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {product.deleted_at ? (
                          <button
                            onClick={() => openRestoreModal(product)}
                            disabled={updating}
                            className="px-3 py-1 rounded text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200"
                          >
                            <span className="inline-flex items-center gap-1">
                              <RotateCcw size={14} />
                              Restore
                            </span>
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => openToggleModal(product)}
                              disabled={updating}
                              className={`px-3 py-1 rounded text-xs font-medium ${
                                product.is_approved
                                  ? "bg-orange-100 text-orange-700 hover:bg-orange-200"
                                  : "bg-green-100 text-green-700 hover:bg-green-200"
                              }`}
                            >
                              {product.is_approved ? "Unapprove" : "Approve"}
                            </button>

                            <button
                              onClick={() => openDeleteModal(product)}
                              disabled={updating}
                              className="px-3 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200"
                              title="Archive Product"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}

                        <button
                          onClick={() => navigate(`/product/${product.id}`)}
                          className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200"
                        >
                          <Eye size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <AdminActionModal
        isOpen={Boolean(pendingAction)}
        title={pendingAction?.title}
        description={pendingAction?.description}
        actionLabel={pendingAction?.actionLabel}
        confirmTone={pendingAction?.confirmTone}
        riskNotice={pendingAction?.riskNotice}
        confirmationKeyword={pendingAction?.confirmationKeyword}
        loading={updating}
        onClose={closeModal}
        onConfirm={handleConfirmedAction}
      />

      <Footer />
    </div>
  );
}
