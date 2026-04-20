import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle,
  Clock,
  Eye,
  Filter,
  RefreshCcw,
  RotateCcw,
  Search,
  Trash2,
  XCircle,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/FooterSlim';
import useModal from '../hooks/useModal';
import { supabase } from '../supabaseClient';
import AdminActionModal from '../components/AdminActionModal';
import {
  ADMIN_ACTION_TYPES,
  executeGuardedAdminAction,
  getCurrentAdminUser,
} from '../services/adminActionService';
import {
  getAdminProductEditRequests,
  PRODUCT_CORE_FIELDS,
  PRODUCT_EDIT_REQUEST_STATUS,
} from '../services/productEditService';

const PRODUCT_FIELD_LABELS = {
  name: 'Name',
  price: 'Price',
  category: 'Category',
  description: 'Description',
  images: 'Images',
};

function AdminPageSkeleton() {
  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full p-6">
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

function formatCurrency(amount) {
  return `N${Number(amount || 0).toLocaleString()}`;
}

function getSellerDisplay(product) {
  return (
    product.users?.business_name ||
    product.users?.profiles?.full_name ||
    product.seller?.business_name ||
    product.seller?.full_name ||
    'Unknown'
  );
}

function getProductLifecycle(product) {
  if (product.deleted_at) {
    return {
      label: 'ARCHIVED',
      className: 'bg-gray-200 text-gray-700',
      Icon: Trash2,
    };
  }

  if (!product.is_approved && product.reapproval_reason) {
    return {
      label: 'PENDING REVIEW',
      className: 'bg-orange-100 text-orange-700',
      Icon: RefreshCcw,
    };
  }

  if (product.is_approved) {
    return {
      label: 'ACTIVE',
      className: 'bg-green-100 text-green-700',
      Icon: CheckCircle,
    };
  }

  return {
    label: 'PENDING',
    className: 'bg-amber-100 text-amber-700',
    Icon: Clock,
  };
}

function getPendingFieldDiff(request) {
  if (!request) {
    return [];
  }

  const currentSnapshot =
    request.current_snapshot && typeof request.current_snapshot === 'object'
      ? request.current_snapshot
      : {};
  const proposedSnapshot =
    request.proposed_snapshot && typeof request.proposed_snapshot === 'object'
      ? request.proposed_snapshot
      : {};

  return PRODUCT_CORE_FIELDS.filter((field) => {
    if (field === 'images') {
      return JSON.stringify(currentSnapshot.images || []) !== JSON.stringify(proposedSnapshot.images || []);
    }

    if (field === 'price') {
      return Number(currentSnapshot.price || 0) !== Number(proposedSnapshot.price || 0);
    }

    return String(currentSnapshot[field] || '').trim() !== String(proposedSnapshot[field] || '').trim();
  }).map((field) => ({
    field,
    label: PRODUCT_FIELD_LABELS[field] || field,
    currentValue: currentSnapshot[field],
    proposedValue: proposedSnapshot[field],
  }));
}

function formatDiffValue(field, value) {
  if (field === 'price') {
    return formatCurrency(value);
  }

  if (field === 'images') {
    const images = Array.isArray(value) ? value.filter(Boolean) : [];
    if (images.length === 0) {
      return 'No images';
    }

    return `${images.length} image${images.length === 1 ? '' : 's'}\n${images.join('\n')}`;
  }

  const normalizedValue = String(value || '').trim();
  return normalizedValue || 'Not set';
}

function PendingRequestDiff({ request }) {
  const changedFields = getPendingFieldDiff(request);

  if (changedFields.length === 0) {
    return (
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        No core-field diff was detected on this request, but it is still marked pending.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        Submitted on {new Date(request.submitted_at).toLocaleString()}.
        Review applies only the proposed core-field values below.
      </div>

      <div className="space-y-3">
        {changedFields.map((diff) => (
          <div key={diff.field} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-900">{diff.label}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Current Live Value
                </p>
                <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-gray-700">
                  {formatDiffValue(diff.field, diff.currentValue)}
                </pre>
              </div>
              <div className="rounded-lg border border-blue-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                  Proposed Update
                </p>
                <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-gray-900">
                  {formatDiffValue(diff.field, diff.proposedValue)}
                </pre>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminProducts() {
  const navigate = useNavigate();
  useMemo(() => getCurrentAdminUser(), []);

  const [products, setProducts] = useState([]);
  const [pendingEditRequestsByProduct, setPendingEditRequestsByProduct] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [updating, setUpdating] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const { showSuccess, showError, showConfirm, ModalComponent } = useModal();

  const handleLogout = async () => {
    showConfirm('Log Out', 'Are you sure you want to log out of your account?', async () => {
      await supabase.auth.signOut();
      localStorage.clear();
      window.location.href = '/login';
    });
  };

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const [productsResponse, editRequests] = await Promise.all([
        supabase
          .from('products')
          .select(`
            *,
            seller:users!products_seller_id_fkey(
              id,
              email,
              business_name,
              profiles(full_name, username)
            )
          `)
          .order('created_at', { ascending: false }),
        getAdminProductEditRequests(PRODUCT_EDIT_REQUEST_STATUS.PENDING).catch(() => []),
      ]);

      if (productsResponse.error) {
        throw productsResponse.error;
      }

      const transformedProducts = (productsResponse.data || []).map((product) => ({
        ...product,
        users: {
          business_name: product.seller?.business_name,
          profiles: {
            full_name: Array.isArray(product.seller?.profiles)
              ? product.seller.profiles[0]?.full_name
              : product.seller?.profiles?.full_name,
            username: Array.isArray(product.seller?.profiles)
              ? product.seller.profiles[0]?.username
              : product.seller?.profiles?.username,
          },
        },
      }));

      const requestMap = (editRequests || []).reduce((accumulator, request) => {
        accumulator[request.product_id] = request;
        return accumulator;
      }, {});

      setProducts(transformedProducts);
      setPendingEditRequestsByProduct(requestMap);
    } catch (error) {
      console.error(error);
      showError('Load Failed', 'Failed to load products.');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return products.filter((product) => {
      const hasPendingUpdate = Boolean(pendingEditRequestsByProduct[product.id]);

      if (filter === 'approved' && (!product.is_approved || product.deleted_at)) {
        return false;
      }

      if (filter === 'pending' && (product.is_approved || product.deleted_at)) {
        return false;
      }

      if (filter === 'archived' && !product.deleted_at) {
        return false;
      }

      if (filter === 'pending_changes' && (!hasPendingUpdate || product.deleted_at)) {
        return false;
      }

      if (!term) {
        return true;
      }

      return [
        product.name,
        product.category,
        getSellerDisplay(product),
        product.users?.profiles?.username,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [filter, pendingEditRequestsByProduct, products, searchTerm]);

  const counts = useMemo(() => ({
    total: products.length,
    pendingApproval: products.filter(
      (product) => !product.is_approved && !product.deleted_at && !product.reapproval_reason
    ).length,
    pendingReview: products.filter(
      (product) => !product.is_approved && !product.deleted_at && product.reapproval_reason
    ).length,
    pendingChanges: Object.keys(pendingEditRequestsByProduct).length,
  }), [pendingEditRequestsByProduct, products]);

  const openToggleModal = (product) => {
    setPendingAction({
      kind: 'toggle',
      product,
      title: product.is_approved ? 'Unapprove Product' : 'Approve Product',
      description: `This will ${product.is_approved ? 'remove' : 'grant'} marketplace approval for "${product.name}".`,
      actionLabel: product.is_approved ? 'Unapprove Product' : 'Approve Product',
      confirmTone: product.is_approved ? 'warning' : 'success',
    });
  };

  const openDeleteModal = (product) => {
    setPendingAction({
      kind: 'archive',
      product,
      title: 'Archive Product',
      description: `This will remove "${product.name}" from storefronts while preserving the record for audit and recovery.`,
      actionLabel: 'Archive Product',
      confirmTone: 'danger',
      confirmationKeyword: 'ARCHIVE',
      riskNotice:
        'Product removal is now a soft-delete action. The listing is hidden from buyers and sellers, but the record stays recoverable for accountability.',
    });
  };

  const openRestoreModal = (product) => {
    setPendingAction({
      kind: 'restore',
      product,
      title: 'Restore Product',
      description: `This will restore "${product.name}" and make the record active again.`,
      actionLabel: 'Restore Product',
      confirmTone: 'success',
    });
  };

  const openReviewModal = (product, request, decision) => {
    const isApprove = decision === 'approve';

    setPendingAction({
      kind: 'review',
      product,
      request,
      decision,
      title: isApprove ? 'Approve Pending Product Changes' : 'Reject Pending Product Changes',
      description: isApprove
        ? `Approve the pending trust-sensitive update for "${product.name}". The current live listing will be replaced with the reviewed values.`
        : `Reject the pending trust-sensitive update for "${product.name}". The current live listing will stay unchanged.`,
      actionLabel: isApprove ? 'Approve Changes' : 'Reject Changes',
      confirmTone: isApprove ? 'success' : 'warning',
      reasonPlaceholder: isApprove
        ? 'Explain why these changes are safe to publish...'
        : 'Explain what the seller must fix before resubmitting...',
    });
  };

  const closeModal = () => {
    if (!updating) {
      setPendingAction(null);
    }
  };

  const handleConfirmedAction = async ({ reason }) => {
    if (!pendingAction?.product) {
      return;
    }

    const { product } = pendingAction;
    setUpdating(true);

    try {
      if (pendingAction.kind === 'toggle') {
        await executeGuardedAdminAction({
          actionType: product.is_approved
            ? ADMIN_ACTION_TYPES.UNAPPROVE_PRODUCT
            : ADMIN_ACTION_TYPES.APPROVE_PRODUCT,
          targetId: product.id,
          reason,
        });
        showSuccess(
          'Product Updated',
          `Product ${product.is_approved ? 'unapproved' : 'approved'} successfully.`
        );
      } else if (pendingAction.kind === 'archive') {
        await executeGuardedAdminAction({
          actionType: ADMIN_ACTION_TYPES.ARCHIVE_PRODUCT,
          targetId: product.id,
          reason,
        });
        showSuccess('Product Archived', 'Product archived successfully.');
      } else if (pendingAction.kind === 'restore') {
        await executeGuardedAdminAction({
          actionType: ADMIN_ACTION_TYPES.RESTORE_PRODUCT,
          targetId: product.id,
          reason,
        });
        showSuccess('Product Restored', 'Product restored successfully.');
      } else if (pendingAction.kind === 'review') {
        await executeGuardedAdminAction({
          actionType:
            pendingAction.decision === 'approve'
              ? ADMIN_ACTION_TYPES.APPROVE_PRODUCT_EDIT
              : ADMIN_ACTION_TYPES.REJECT_PRODUCT_EDIT,
          targetId: product.id,
          reason,
          context: {
            requestId: pendingAction.request.id,
          },
        });
        showSuccess(
          pendingAction.decision === 'approve' ? 'Changes Approved' : 'Changes Rejected',
          pendingAction.decision === 'approve'
            ? 'The live product now reflects the approved changes.'
            : 'The pending change request was rejected and the live product was left untouched.'
        );
      }

      setPendingAction(null);
      await loadProducts();
    } catch (error) {
      console.error(error);
      showError('Action Failed', error.message || 'Failed to complete admin action.');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return <AdminPageSkeleton />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar onLogout={handleLogout} />

      <main className="flex-1 max-w-7xl mx-auto p-6 w-full">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-blue-900">
              Product Management
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Review live listings, fresh approvals, and pending trust-sensitive change requests.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-gray-600">
            <span>Total: {counts.total}</span>
            <span>Pending approval: {counts.pendingApproval}</span>
            <span>Pending review: {counts.pendingReview}</span>
            <span>Pending changes: {counts.pendingChanges}</span>
          </div>
        </div>

        <div className="bg-white rounded-lg border p-4 mb-6 flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-gray-500" />
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="border rounded p-2 text-sm"
            >
              <option value="all">All Products</option>
              <option value="approved">Approved Only</option>
              <option value="pending">Pending Approval</option>
              <option value="pending_changes">Pending Changes</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div className="flex-1 flex items-center gap-2 min-w-[220px]">
            <Search size={18} className="text-gray-500" />
            <input
              type="text"
              placeholder="Search by product name, category, or seller..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="border rounded p-2 flex-1 text-sm"
            />
          </div>

          <button
            type="button"
            onClick={loadProducts}
            className="inline-flex items-center gap-2 rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
          >
            <RefreshCcw size={16} />
            Refresh
          </button>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
            No products found for the current filter.
          </div>
        ) : (
          <div className="overflow-x-auto bg-white rounded-lg shadow border border-blue-200">
            <table className="w-full min-w-[1120px]">
              <thead className="bg-blue-100 text-blue-900 text-sm uppercase">
                <tr>
                  <th className="p-3 text-left">Image</th>
                  <th className="p-3 text-left">Product</th>
                  <th className="p-3 text-left">Price</th>
                  <th className="p-3 text-left">Seller</th>
                  <th className="p-3 text-left">Last Updated</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Pending Review</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => {
                  const pendingRequest = pendingEditRequestsByProduct[product.id] || null;
                  const changedFields = getPendingFieldDiff(pendingRequest);
                  const lifecycle = getProductLifecycle(product);
                  const StatusIcon = lifecycle.Icon;

                  return (
                    <tr key={product.id} className="border-t border-blue-100 hover:bg-gray-50">
                      <td className="p-3">
                        {product.images?.[0] ? (
                          <img
                            src={
                              product.images[0].startsWith('blob:')
                                ? 'https://placehold.co/600x600'
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
                        <div className="text-xs text-gray-500">
                          {product.category || 'Uncategorized'}
                        </div>
                        <div className="text-xs text-gray-500">ID: {product.id.slice(0, 8)}...</div>
                      </td>
                      <td className="p-3 text-blue-700 font-medium">
                        {formatCurrency(product.price)}
                      </td>
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/users/${product.seller_id}`)}
                          className="text-blue-600 hover:underline text-left"
                        >
                          <div className="font-semibold">{getSellerDisplay(product)}</div>
                          <div className="text-xs text-blue-500">
                            @{product.users?.profiles?.username || ''}
                          </div>
                        </button>
                      </td>
                      <td className="p-3 text-xs text-gray-500">
                        {product.updated_at
                          ? new Date(product.updated_at).toLocaleDateString()
                          : '-'}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${lifecycle.className}`}
                          >
                            <StatusIcon size={12} />
                            {lifecycle.label}
                          </span>

                          {pendingRequest && !product.deleted_at && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-700">
                              <RefreshCcw size={12} />
                              PENDING UPDATE
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-xs text-gray-600">
                        {product.reapproval_reason ? (
                          <div className="space-y-1">
                            <p className="font-semibold text-orange-700">
                              Re-approval reason: {product.reapproval_reason}
                            </p>
                            <p className="text-gray-500">
                              Review this seller update before sending the product live again.
                            </p>
                          </div>
                        ) : pendingRequest ? (
                          <div className="space-y-1">
                            <p className="font-semibold text-blue-700">
                              {changedFields.length} field
                              {changedFields.length === 1 ? '' : 's'} changed
                            </p>
                            <p>{new Date(pendingRequest.submitted_at).toLocaleString()}</p>
                            <p className="text-gray-500">
                              {changedFields.map((field) => field.label).join(', ')}
                            </p>
                          </div>
                        ) : (
                          <span className="text-gray-400">No pending changes</span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          {pendingRequest && !product.deleted_at && (
                            <>
                              <button
                                type="button"
                                onClick={() => openReviewModal(product, pendingRequest, 'approve')}
                                disabled={updating}
                                className="px-3 py-1 rounded text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200"
                              >
                                <span className="inline-flex items-center gap-1">
                                  <CheckCircle size={14} />
                                  Approve Changes
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openReviewModal(product, pendingRequest, 'reject')}
                                disabled={updating}
                                className="px-3 py-1 rounded text-xs font-medium bg-orange-100 text-orange-700 hover:bg-orange-200"
                              >
                                <span className="inline-flex items-center gap-1">
                                  <XCircle size={14} />
                                  Reject Changes
                                </span>
                              </button>
                            </>
                          )}

                          {product.deleted_at ? (
                            <button
                              type="button"
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
                                type="button"
                                onClick={() => openToggleModal(product)}
                                disabled={updating || Boolean(pendingRequest)}
                                className={`px-3 py-1 rounded text-xs font-medium ${
                                  product.is_approved
                                    ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                                } disabled:opacity-50`}
                                title={
                                  pendingRequest
                                    ? 'Review the pending product update before changing approval status.'
                                    : undefined
                                }
                              >
                                {product.is_approved ? 'Unapprove' : 'Approve'}
                              </button>

                              <button
                                type="button"
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
                            type="button"
                            onClick={() => navigate(`/product/${product.id}`)}
                            className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200"
                          >
                            <Eye size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
        reasonPlaceholder={pendingAction?.reasonPlaceholder}
        loading={updating}
        onClose={closeModal}
        onConfirm={handleConfirmedAction}
      >
        {pendingAction?.kind === 'review' ? (
          <PendingRequestDiff request={pendingAction.request} />
        ) : null}
      </AdminActionModal>

      <Footer />
      <ModalComponent />
    </div>
  );
}
