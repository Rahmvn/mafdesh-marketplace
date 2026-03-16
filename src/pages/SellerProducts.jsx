import React from 'react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Edit, Trash2 } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { productService } from '../services/productService';
import { supabase } from "../supabaseClient";

export default function SellerProducts() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
    console.log('Product images:', products.map(p => p.images));
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

const handleLogout = async () => {

    if (window.confirm('Are you sure you want to logout?')) {

      await supabase.auth.signOut();   // kill Supabase session

      localStorage.clear();            // clear your local data

      window.location.href = '/login'; // hard redirect (no React tricks)

    };

  };


  useEffect(() => {
    const checkAuth = () => {
      const storedUser = localStorage.getItem('mafdesh_user');

      if (!storedUser) {
        alert('Please log in to access this page.');
        navigate('/login');
        return;
      }

      const userData = JSON.parse(storedUser);

      if (userData.role !== 'seller') {
        alert('Access denied. Only sellers can access product management.');
        navigate('/login');
        return;
      }

      setCurrentUser(userData);
    };

    checkAuth();
  }, [navigate]);

  useEffect(() => {
    if (currentUser) {
      loadProducts();
    }
  }, [currentUser]);

  useEffect(() => {
    filterProducts();
  }, [searchTerm, products]);

  const loadProducts = async () => {
    try {
      setIsLoading(true);
      const storedUser = JSON.parse(localStorage.getItem('mafdesh_user'))
      const sellerProducts = await productService.getSellerProducts(storedUser.id);
      setProducts(sellerProducts);
    } catch (error) {
      console.error('Error loading products:', error);
      alert('Failed to load products');
    } finally {
      setIsLoading(false);
    }
  };

  const filterProducts = () => {
    let filtered = [...products];

    if (searchTerm) {
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.category.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredProducts(filtered);
  };

  const handleDelete = async (productId, productName) => {
    if (window.confirm(`Are you sure you want to delete "${productName}"? This action cannot be undone.`)) {
      try {
        await productService.deleteProduct(productId);
        alert('Product deleted successfully');
        loadProducts();
      } catch (error) {
        console.error('Error deleting product:', error);
        alert('Failed to delete product');
      }
    }
  };



  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar onLogout={handleLogout} />

      <div className="flex-1 px-4 py-6 max-w-7xl mx-auto w-full">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-blue-900">Product Management</h1>
            <p className="text-blue-700 text-sm mt-1">Manage your product inventory</p>
          </div>
          <button
            onClick={() => navigate('/seller/products/new')}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors shadow-md"
          >
            <Plus className="w-5 h-5" />
            Add Product
          </button>
        </div>

        <div className="bg-white rounded-lg border border-blue-200 shadow-sm mb-6 p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-blue-400" />
                <input
                  type="text"
                  placeholder="Search products by name or category..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-blue-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-blue-900 text-white">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Product</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Category</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Price</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Stock</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Last Updated</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-100">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-4 py-12 text-center text-blue-600">
                      {searchTerm
                        ? 'No products match your search criteria.'
                        : 'No products yet. Click "Add Product" to create your first listing.'}
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map(product => (
                    <tr key={product.id} className="hover:bg-blue-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img
                           src={
  product.images?.[0] && !product.images[0].startsWith('blob:')
    ? product.images[0]
    : 'https://placehold.co/600x600'
}
                            alt={product.name}
                            className="w-16 h-16 object-cover rounded border-2 border-orange-300"
                          />
                          <div>
                            <p className="font-semibold text-blue-900">{product.name}</p>
                            <p className="text-xs text-blue-600">ID: {product.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-blue-900">{product.category}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-orange-600">{product.price}</td>
                      <td className="px-4 py-3 text-sm text-blue-900">
                        {product.stock_quantity}
                        {product.stock_quantity < 10 && (
                          <span className="ml-2 text-xs text-orange-600">Low</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-blue-600">
                        {new Date(product.updated_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => navigate(`/seller/products/${product.id}/edit`)}
                            className="p-2 hover:bg-blue-100 rounded transition-colors"
                            title="Edit Product"
                          >
                            <Edit className="w-4 h-4 text-blue-700" />
                          </button>
                          <button
                            onClick={() => handleDelete(product.id, product.name)}
                            className="p-2 hover:bg-orange-100 rounded transition-colors"
                            title="Delete Product"
                          >
                            <Trash2 className="w-4 h-4 text-orange-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 text-sm text-blue-700">
          Showing {filteredProducts.length} of {products.length} product{products.length !== 1 ? 's' : ''}
        </div>
      </div>

      <Footer />
    </div>
  );
}
