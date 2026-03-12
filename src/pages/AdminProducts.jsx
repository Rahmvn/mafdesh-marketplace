import React from 'react';
import { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { productService } from '../services/productService';
import { supabase } from '../supabaseClient';

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, approved, blocked

const handleLogout = async () => {

    if (window.confirm('Are you sure you want to logout?')) {

      await supabase.auth.signOut();   // kill Supabase session

      localStorage.clear();            // clear your local data

      window.location.href = '/login'; // hard redirect (no React tricks)

    };

  };


  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await productService.getAllProductsAdmin();
      setProducts(data);
    } catch (error) {
      console.error(error);
      alert('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (id, currentStatus) => {
    try {
      await productService.toggleApproval(id, !currentStatus);
      loadProducts();
    } catch (error) {
      alert('Failed to update product');
    }
  };

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm('Delete this product permanently?');
    if (!confirmDelete) return;

    try {
      await productService.deleteProduct(id);
      loadProducts();
    } catch (error) {
      alert('Delete failed');
    }
  };
  const filteredProducts = products.filter(p => {
  if (filter === 'approved') return p.is_approved;
  if (filter === 'blocked') return !p.is_approved;
  return true;
});

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar onLogout={handleLogout} />

      <div className="flex-1 max-w-6xl mx-auto p-6 w-full">
        <h1 className="text-3xl font-bold text-blue-900 mb-6">
          Admin – Product Management
        </h1>
        <div className="flex gap-3 mb-6">
  <button
    onClick={() => setFilter('all')}
    className="px-4 py-2 bg-blue-600 text-white rounded text-sm"
  >
    All
  </button>

  <button
    onClick={() => setFilter('approved')}
    className="px-4 py-2 bg-green-600 text-white rounded text-sm"
  >
    Approved
  </button>

  <button
    onClick={() => setFilter('blocked')}
    className="px-4 py-2 bg-orange-600 text-white rounded text-sm"
  >
    Blocked
  </button>
</div>

        {loading ? (
          <p className="text-blue-600">Loading...</p>
        ) : products.length === 0 ? (
          <p className="text-blue-600">No products available.</p>
        ) : (
          <div className="overflow-x-auto bg-white rounded-lg shadow border border-blue-200">
            <table className="w-full">
              <thead className="bg-blue-100 text-blue-900 text-sm uppercase">
                <tr>
                  <th className="p-3 text-left">Image</th>
                  <th className="p-3 text-left">Name</th>
                  <th className="p-3 text-left">Price</th>
                  <th className="p-3 text-left">Seller</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredProducts.map(product => (
                  <tr key={product.id} className="border-t border-blue-100">
                    <td className="p-3">
                      {product.images?.[0] && (
                        <img
                          src={product.images?.[0] && !product.images[0].startsWith('blob:') ? product.images[0] : 'https://placehold.co/600x600'}
                          alt={product.name}
                          className="w-12 h-12 object-cover rounded"
                        />
                      )}
                    </td>

                    <td className="p-3 font-semibold text-blue-900">
                      {product.name}
                    </td>

                    <td className="p-3 text-blue-700">
                      ₦{Number(product.price).toLocaleString()}
                    </td>
<td className="p-3 text-blue-700">
  <div className="flex flex-col">
    <span className="font-semibold">
      {product.users?.business_name ||
       product.users?.profiles?.full_name ||
       'Unknown'}
    </span>
    <span className="text-xs text-blue-500">
      @{product.users?.profiles?.username || ''}
    </span>
  </div>
</td>

                    <td className="p-3 text-center">
                      <span
                        className={`px-3 py-1 rounded text-xs font-bold ${
                          product.is_approved
                            ? 'bg-green-100 text-green-700'
                            : 'bg-orange-100 text-orange-700'
                        }`}
                      >
                        {product.is_approved ? 'APPROVED' : 'BLOCKED'}
                      </span>
                    </td>

                    <td className="p-3 text-center space-x-2">
                      <button
                        onClick={() =>
                          handleToggle(product.id, product.is_approved)
                        }
                        className="px-3 py-1 bg-blue-600 text-white rounded text-xs"
                      >
                        {product.is_approved ? 'Unapprove' : 'Approve'}
                      </button>

                      <button
                        onClick={() => handleDelete(product.id)}
                        className="px-3 py-1 bg-red-600 text-white rounded text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}