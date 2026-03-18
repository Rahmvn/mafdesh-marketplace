import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { productService } from '../services/productService';
import { supabase } from '../supabaseClient';
import { Search, Filter, Eye, Trash2, CheckCircle, XCircle, Clock } from 'lucide-react';

export default function AdminProducts() {
  const navigate = useNavigate();
  const admin = JSON.parse(localStorage.getItem("mafdesh_user"));

  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, approved, pending
  const [searchTerm, setSearchTerm] = useState('');
  const [updating, setUpdating] = useState(false);

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to logout?')) {
      await supabase.auth.signOut();
      localStorage.clear();
      window.location.href = '/login';
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const data = await productService.getAllProductsAdmin();
      setProducts(data);
      applyFilters(data, filter, searchTerm);
    } catch (error) {
      console.error(error);
      alert('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = (productList, statusFilter, search) => {
    let filtered = productList;
    if (statusFilter === 'approved') {
      filtered = filtered.filter(p => p.is_approved);
    } else if (statusFilter === 'pending') {
      filtered = filtered.filter(p => !p.is_approved);
    }
    if (search) {
      const lowerSearch = search.toLowerCase();
      filtered = filtered.filter(p =>
        p.name?.toLowerCase().includes(lowerSearch) ||
        p.seller_name?.toLowerCase().includes(lowerSearch) ||
        p.users?.business_name?.toLowerCase().includes(lowerSearch)
      );
    }
    setFilteredProducts(filtered);
  };

  const handleFilterChange = (newFilter) => {
    setFilter(newFilter);
    applyFilters(products, newFilter, searchTerm);
  };

  const handleSearch = (e) => {
    const term = e.target.value;
    setSearchTerm(term);
    applyFilters(products, filter, term);
  };

  const handleToggle = async (id, currentStatus) => {
    const action = currentStatus ? 'Unapprove' : 'Approve';
    if (!window.confirm(`${action} this product? This action will be logged.`)) return;

    setUpdating(true);
    try {
      await productService.toggleApproval(id, !currentStatus);

      await supabase.from('admin_actions').insert({
        admin_id: admin.id,
        order_id: null,
        action_type: action.toUpperCase() + '_PRODUCT',
        reason: `Product ${action.toLowerCase()}d`,
        metadata: { product_id: id, new_status: !currentStatus },
      });

      await loadProducts();
    } catch (error) {
      console.error(error);
      alert(`Failed to ${action.toLowerCase()} product`);
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this product permanently? This action cannot be undone.')) return;

    setUpdating(true);
    try {
      await productService.deleteProduct(id);

      await supabase.from('admin_actions').insert({
        admin_id: admin.id,
        order_id: null,
        action_type: 'DELETE_PRODUCT',
        reason: 'Product deleted permanently',
        metadata: { product_id: id },
      });

      await loadProducts();
    } catch (error) {
      console.error(error);
      alert('Failed to delete product');
    } finally {
      setUpdating(false);
    }
  };

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
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-blue-900">
            Product Management
          </h1>
          <div className="text-sm text-gray-600">
            Total: {products.length} | Pending: {products.filter(p => !p.is_approved).length}
          </div>
        </div>

        {/* Filters and Search */}
        <div className="bg-white rounded-lg border p-4 mb-6 flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-gray-500" />
            <select
              value={filter}
              onChange={(e) => handleFilterChange(e.target.value)}
              className="border rounded p-2 text-sm"
            >
              <option value="all">All Products</option>
              <option value="approved">Approved Only</option>
              <option value="pending">Pending Approval</option>
            </select>
          </div>

          <div className="flex-1 flex items-center gap-2">
            <Search size={18} className="text-gray-500" />
            <input
              type="text"
              placeholder="Search by product name or seller..."
              value={searchTerm}
              onChange={handleSearch}
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
            <table className="w-full">
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
                {filteredProducts.map(product => (
                  <tr key={product.id} className="border-t border-blue-100 hover:bg-gray-50">
                    <td className="p-3">
                      {product.images?.[0] ? (
                        <img
                          src={product.images[0].startsWith('blob:') 
                            ? 'https://placehold.co/600x600' 
                            : product.images[0]}
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
                      <div className="text-xs text-gray-500">ID: {product.id.slice(0,8)}...</div>
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
                           'Unknown'}
                        </div>
                        <div className="text-xs text-blue-500">
                          @{product.users?.profiles?.username || ''}
                        </div>
                      </button>
                    </td>

                    <td className="p-3 text-xs text-gray-500">
                      {product.updated_at ? new Date(product.updated_at).toLocaleDateString() : '-'}
                    </td>

                    <td className="p-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${
                          product.is_approved
                            ? 'bg-green-100 text-green-700'
                            : 'bg-orange-100 text-orange-700'
                        }`}
                      >
                        {product.is_approved ? (
                          <CheckCircle size={12} />
                        ) : (
                          <Clock size={12} />
                        )}
                        {product.is_approved ? 'APPROVED' : 'PENDING'}
                      </span>
                    </td>

                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleToggle(product.id, product.is_approved)}
                          disabled={updating}
                          className={`px-3 py-1 rounded text-xs font-medium ${
                            product.is_approved
                              ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                              : 'bg-green-100 text-green-700 hover:bg-green-200'
                          }`}
                        >
                          {product.is_approved ? 'Unapprove' : 'Approve'}
                        </button>

                        <button
                          onClick={() => handleDelete(product.id)}
                          disabled={updating}
                          className="px-3 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200"
                        >
                          <Trash2 size={14} />
                        </button>

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
      <Footer />
    </div>
  );
}