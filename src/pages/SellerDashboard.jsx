import React from 'react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, TrendingUp, AlertCircle, Plus, Edit, Shield } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import VerificationBadge from '../components/VerificationBadge';
import { productService } from '../services/productService';
import { supabase } from '../supabaseClient';

export default function SellerDashboard() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    totalProducts: 0,
    draftProducts: 0,
    pendingProducts: 0,
    approvedProducts: 0,
    rejectedProducts: 0
  });
  const [showBankModal, setShowBankModal] = useState(false);
  const [bankData, setBankData] = useState({
    bank_name: '',
    account_number: '',
    account_name: ''
  });

  const nigerianBanks = [
    "Access Bank", "Citibank", "Ecobank", "Fidelity Bank", "First Bank", "First City Monument Bank (FCMB)",
    "Globus Bank", "Guaranty Trust Bank (GTBank)", "Heritage Bank", "Keystone Bank", "Lotus Bank",
    "Moniepoint MFB", "OPay", "PalmPay", "Parallex Bank", "Polaris Bank", "Providus Bank", "Stanbic IBTC Bank",
    "Standard Chartered Bank", "Sterling Bank", "SunTrust Bank", "Titan Trust Bank", "Union Bank",
    "United Bank for Africa (UBA)", "Unity Bank", "Wema Bank", "Zenith Bank", "Kuda Bank", "VFD Microfinance Bank"
  ].sort();

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
        alert('Access denied. Only sellers can access this dashboard.');
        navigate('/login');
        return;
      }

      setCurrentUser(userData);
    };

    checkAuth();
  }, [navigate]);

  useEffect(() => {
    if (currentUser) {
      loadDashboardData();
      if (!currentUser.bank_name || !currentUser.account_number) {
        setShowBankModal(true);
      }
    }
  }, [currentUser]);

  const handleBankSubmit = async (e) => {
    e.preventDefault();
    if (!bankData.bank_name || !bankData.account_number || !bankData.account_name) {
      alert('Please fill in all bank details');
      return;
    }
    if (!/^\d{10}$/.test(bankData.account_number)) {
      alert('Account number must be 10 digits');
      return;
    }

    try {
      const handleBankSubmit = async (e) => {
  e.preventDefault();

  if (!bankData.bank_name || !bankData.account_number || !bankData.account_name) {
    alert('Please fill in all bank details');
    return;
  }

  try {
    const { error } = await supabase
      .from('users')
      .update(bankData)
      .eq('id', currentUser.id);

    if (error) throw error;

    const updatedUser = { ...currentUser, ...bankData };
    localStorage.setItem('mafdesh_user', JSON.stringify(updatedUser));
    setCurrentUser(updatedUser);

    setShowBankModal(false);
  } catch (err) {
    console.error(err);
    alert('Failed to save bank details');
  }
};
      const updatedUser = { ...currentUser, ...bankData };
      localStorage.setItem('mafdesh_user', JSON.stringify(updatedUser));
      setCurrentUser(updatedUser);
      setShowBankModal(false);
      alert('Bank details updated successfully!');
    } catch (error) {
      alert('Failed to update bank details');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('mafdesh_user');
    navigate('/login');
  };

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      const sellerProducts = await productService.getSellerProducts();
      setProducts(sellerProducts);
      
      setStats({
        totalProducts: sellerProducts.length,
        draftProducts: sellerProducts.filter(p => {
          const status = p.status || (p.is_approved ? 'approved' : 'pending_approval');
          return status === 'draft';
        }).length,
        pendingProducts: sellerProducts.filter(p => {
          const status = p.status || (p.is_approved ? 'approved' : 'pending_approval');
          return status === 'pending_approval';
        }).length,
        approvedProducts: sellerProducts.filter(p => {
          const status = p.status || (p.is_approved ? 'approved' : 'pending_approval');
          return status === 'approved';
        }).length,
        rejectedProducts: sellerProducts.filter(p => {
          const status = p.status || (p.is_approved ? 'approved' : 'pending_approval');
          return status === 'rejected';
        }).length
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (product) => {
    const status = product.status || (product.is_approved ? 'approved' : 'pending_approval');
    
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-700 border-gray-300';
      case 'pending_approval':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'approved':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const getStatusLabel = (product) => {
    const status = product.status || (product.is_approved ? 'approved' : 'pending_approval');
    
    switch (status) {
      case 'draft':
        return 'Draft';
      case 'pending_approval':
        return 'Pending Approval';
      case 'approved':
        return 'Approved';
      case 'rejected':
        return 'Rejected';
      default:
        return 'Unknown';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-blue-50 flex items-center justify-center">
        <div className="text-blue-600 font-semibold text-lg">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar onLogout={handleLogout} />
      
      <div className="flex-1 px-4 py-6 max-w-7xl mx-auto w-full">
        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold text-blue-900">
                {currentUser?.business_name || currentUser?.full_name}
              </h1>
              {currentUser?.is_verified && <VerificationBadge />}
            </div>
            <p className="text-blue-700 text-sm">Seller Dashboard</p>
          </div>
          <div className="flex items-center gap-3">
            {!currentUser?.is_verified && (
              <button
                onClick={() => navigate('/seller/verification')}
                className="flex items-center gap-2 bg-orange-100 hover:bg-orange-200 text-orange-700 px-4 py-2 rounded-lg font-semibold transition-colors border-2 border-orange-300"
              >
                <Shield className="w-5 h-5" />
                Get Verified
              </button>
            )}
            <button
              onClick={() => navigate('/seller/products/new')}
              className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors shadow-md"
            >
              <Plus className="w-5 h-5" />
              Add Product
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 border border-blue-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-5 h-5 text-orange-500" />
              <h3 className="text-sm font-semibold text-blue-700">Total Products</h3>
            </div>
            <p className="text-3xl font-bold text-blue-900">{stats.totalProducts}</p>
            <p className="text-xs text-blue-600 mt-1">{stats.approvedProducts} live, {stats.rejectedProducts} rejected</p>
          </div>

          <div className="bg-white rounded-lg p-4 border border-blue-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Edit className="w-5 h-5 text-gray-500" />
              <h3 className="text-sm font-semibold text-blue-700">Drafts</h3>
            </div>
            <p className="text-3xl font-bold text-blue-900">{stats.draftProducts}</p>
            <p className="text-xs text-blue-600 mt-1">saved but not submitted</p>
          </div>

          <div className="bg-white rounded-lg p-4 border border-blue-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-5 h-5 text-orange-500" />
              <h3 className="text-sm font-semibold text-blue-700">Pending Approval</h3>
            </div>
            <p className="text-3xl font-bold text-blue-900">{stats.pendingProducts}</p>
            <p className="text-xs text-blue-600 mt-1">awaiting admin review</p>
          </div>

          <div className="bg-white rounded-lg p-4 border border-blue-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              <h3 className="text-sm font-semibold text-blue-700">Live Products</h3>
            </div>
            <p className="text-3xl font-bold text-blue-900">{stats.approvedProducts}</p>
            <p className="text-xs text-blue-600 mt-1">visible to buyers</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-lg border border-blue-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-blue-900 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Product Inventory</h2>
              <button
                onClick={() => navigate('/seller/products')}
                className="text-orange-400 hover:text-orange-300 text-sm font-semibold transition-colors"
              >
                Manage All →
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-blue-50 border-b border-blue-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-blue-900 uppercase">Product</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-blue-900 uppercase">Price</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-blue-900 uppercase">Stock</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-blue-900 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-blue-900 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-100">
                  {products.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-4 py-8 text-center text-blue-600">
                        No products yet. Click "Add Product" to create your first listing.
                      </td>
                    </tr>
                  ) : (
                    products.slice(0, 5).map(product => (
                      <tr key={product.id} className="hover:bg-blue-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <img
                              src={product.image}
                              alt={product.name}
                              className="w-12 h-12 object-cover rounded border-2 border-orange-300"
                            />
                            <span className="font-semibold text-blue-900">{product.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-orange-600">{product.price}</td>
                        <td className="px-4 py-3 text-sm text-blue-900">{product.stock}</td>
                        <td className="px-4 py-3">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusBadge(product)}`}>
                            {getStatusLabel(product)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => navigate(`/seller/products/${product.id}/edit`)}
                            className="p-2 hover:bg-blue-100 rounded transition-colors"
                            title="Edit Product"
                          >
                            <Edit className="w-4 h-4 text-blue-700" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-blue-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-blue-900">
              <h2 className="text-lg font-bold text-white">Quick Actions</h2>
            </div>
            <div className="p-4 space-y-3">
              <button
                onClick={() => navigate('/seller/products/new')}
                className="w-full flex items-center gap-3 p-3 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors border border-orange-200"
              >
                <Plus className="w-5 h-5 text-orange-600" />
                <span className="font-semibold text-orange-700">Add New Product</span>
              </button>
              <button
                onClick={() => navigate('/seller/products')}
                className="w-full flex items-center gap-3 p-3 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200"
              >
                <Package className="w-5 h-5 text-blue-600" />
                <span className="font-semibold text-blue-700">Manage Products</span>
              </button>
              {!currentUser?.is_verified && (
                <button
                  onClick={() => navigate('/seller/verification')}
                  className="w-full flex items-center gap-3 p-3 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors border-2 border-orange-300"
                >
                  <Shield className="w-5 h-5 text-orange-600" />
                  <span className="font-semibold text-orange-700">Get Verified Badge</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 bg-blue-100 border-l-4 border-blue-500 p-4 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="font-bold text-blue-900 mb-1">Getting Started</h3>
              <p className="text-sm text-blue-800">Add your first product to start selling on Mafdesh. Your products will be reviewed by our team before going live.</p>
            </div>
          </div>
        </div>
      </div>

      <Footer />

      {/* Bank Details Modal */}
      {showBankModal && (
        <div className="fixed inset-0 bg-blue-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="bg-gradient-to-r from-blue-900 to-blue-700 p-6 text-white text-center">
              <h2 className="text-xl font-bold">Seller Bank Details</h2>
              <p className="text-blue-100 text-sm mt-1">Required to receive your earnings</p>
            </div>
            <form onSubmit={handleBankSubmit} className="p-8 space-y-6">
              <div>
                <label className="block text-blue-900 text-sm font-bold mb-2">BANK NAME</label>
                <select
                  value={bankData.bank_name}
                  onChange={(e) => setBankData({ ...bankData, bank_name: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-blue-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all appearance-none bg-blue-50/30"
                  style={{
                    backgroundImage: "url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%231e40af%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C/polyline%3E%3C/svg%3E')",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 16px center",
                    backgroundSize: "16px"
                  }}
                >
                  <option value="">Select your bank</option>
                  {nigerianBanks.map(bank => (
                    <option key={bank} value={bank}>{bank}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-blue-900 text-sm font-bold mb-2">ACCOUNT NUMBER</label>
                <input
                  type="text"
                  placeholder="10-digit number"
                  value={bankData.account_number}
                  onChange={(e) => setBankData({ ...bankData, account_number: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-blue-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-blue-50/30"
                />
              </div>
              <div>
                <label className="block text-blue-900 text-sm font-bold mb-2">ACCOUNT NAME</label>
                <input
                  type="text"
                  placeholder="Full name on account"
                  value={bankData.account_name}
                  onChange={(e) => setBankData({ ...bankData, account_name: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-blue-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-blue-50/30"
                />
              </div>
              <button
                type="submit"
                className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
              >
                Save Bank Details
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
