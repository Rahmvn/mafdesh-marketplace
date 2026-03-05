import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Users, CheckCircle, AlertCircle, TrendingUp, Shield, DollarSign, ShoppingCart, UserCheck } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { adminAPI } from '../services/api';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [products, setProducts] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    totalProducts: 0,
    pendingProducts: 0,
    approvedProducts: 0,
    totalSellers: 0,
    totalBuyers: 0,
    verifiedSellers: 0,
    totalOrders: 0,
    totalRevenue: 0,
    platformFees: 0
  });

  const handleLogout = () => {
    localStorage.removeItem('mafdesh_user');
    navigate('/login');
  };

  useEffect(() => {
    const checkAuth = () => {
      const storedUser = localStorage.getItem('mafdesh_user');
      
      if (!storedUser) {
        navigate('/login');
        return;
      }

      const userData = JSON.parse(storedUser);

      if (userData.role !== 'admin') {
        navigate('/login');
        return;
      }

      setCurrentUser(userData);
    };

    checkAuth();
  }, [navigate]);

  useEffect(() => {
    let intervalId;
    if (currentUser) {
      loadData();
      // Set up real-time polling every 30 seconds for admin accuracy
      intervalId = setInterval(loadData, 30000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [currentUser]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [statsData, productsData, sellersData] = await Promise.all([
        adminAPI.getStats(),
        adminAPI.getAllProducts(),
        adminAPI.getAllSellers()
      ]);
      
      setStats(statsData.stats);
      setProducts(productsData.products || []);
      setSellers(sellersData.sellers || []);
    } catch (error) {
      console.error('Error loading admin data:', error);
      alert('Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar onLogout={handleLogout} />
      
      <div className="flex-1 px-6 py-6 max-w-7xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-blue-900 mb-2">Admin Dashboard</h1>
          <p className="text-blue-600">Platform Management & Analytics</p>
        </div>

        {stats.pendingProducts > 0 && (
          <div className="mb-6 bg-white rounded-lg border border-orange-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-5 text-white">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 mt-1 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-bold text-lg mb-2">Pending Approvals</h3>
                  <p className="text-orange-50 mb-3">
                    {stats.pendingProducts} product{stats.pendingProducts > 1 ? 's' : ''} waiting for your review
                  </p>
                  <button
                    onClick={() => navigate('/admin/approvals')}
                    className="bg-white text-orange-600 hover:bg-orange-50 font-semibold px-6 py-2 rounded-lg transition-colors"
                  >
                    Review Now →
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12 text-blue-600">Loading dashboard...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-lg border border-blue-200 shadow-sm p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-600 font-semibold">Total Products</p>
                    <p className="text-2xl font-bold text-blue-900 mt-1">{stats.totalProducts}</p>
                    <div className="flex items-center gap-2 text-xs text-blue-500 mt-1">
                      <CheckCircle className="w-3 h-3 text-blue-600" />
                      <span>{stats.approvedProducts} approved</span>
                      <span className="text-orange-600">• {stats.pendingProducts} pending</span>
                    </div>
                  </div>
                  <Package className="w-10 h-10 text-blue-500" />
                </div>
              </div>

              <div className="bg-white rounded-lg border border-blue-200 shadow-sm p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-600 font-semibold">Total Sellers</p>
                    <p className="text-2xl font-bold text-blue-900 mt-1">{stats.totalSellers}</p>
                    <div className="flex items-center gap-1 text-xs text-blue-500 mt-1">
                      <Shield className="w-3 h-3 text-orange-600" />
                      <span>{stats.verifiedSellers} verified</span>
                    </div>
                  </div>
                  <Users className="w-10 h-10 text-orange-500" />
                </div>
              </div>

              <div className="bg-white rounded-lg border border-blue-200 shadow-sm p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-600 font-semibold">Total Buyers</p>
                    <p className="text-2xl font-bold text-blue-900 mt-1">{stats.totalBuyers}</p>
                    <p className="text-xs text-blue-500 mt-1">Registered users</p>
                  </div>
                  <UserCheck className="w-10 h-10 text-blue-500" />
                </div>
              </div>

              <div className="bg-white rounded-lg border border-blue-200 shadow-sm p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-600 font-semibold">Total Orders</p>
                    <p className="text-2xl font-bold text-blue-900 mt-1">{stats.totalOrders}</p>
                    <p className="text-xs text-blue-500 mt-1">All-time orders</p>
                  </div>
                  <ShoppingCart className="w-10 h-10 text-blue-500" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-lg border border-blue-200 shadow-sm p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-600 font-semibold">Platform Revenue</p>
                    <p className="text-2xl font-bold text-blue-900 mt-1">
                      ₦{parseFloat(stats.totalRevenue || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-blue-500 mt-1">Total sales volume</p>
                  </div>
                  <TrendingUp className="w-10 h-10 text-blue-500" />
                </div>
              </div>

              <div className="bg-white rounded-lg border border-blue-200 shadow-sm p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-600 font-semibold">Platform Fees (5%)</p>
                    <p className="text-2xl font-bold text-orange-600 mt-1">
                      ₦{parseFloat(stats.platformFees || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-blue-500 mt-1">Collected from sales</p>
                  </div>
                  <DollarSign className="w-10 h-10 text-orange-500" />
                </div>
              </div>

              <div className="bg-white rounded-lg border border-blue-200 shadow-sm p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-600 font-semibold">Seller Earnings</p>
                    <p className="text-2xl font-bold text-blue-900 mt-1">
                      ₦{parseFloat((stats.totalRevenue || 0) - (stats.platformFees || 0)).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-blue-500 mt-1">After platform fees</p>
                  </div>
                  <TrendingUp className="w-10 h-10 text-blue-500" />
                </div>
              </div>
            </div>
          </>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg border border-blue-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-blue-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-blue-900">Recent Products</h2>
                <button
                  onClick={() => navigate('/admin/products')}
                  className="text-sm text-orange-600 hover:text-orange-700 font-semibold"
                >
                  View All →
                </button>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-blue-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-blue-900 uppercase tracking-wide">Product</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-blue-900 uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-100">
                  {products.length === 0 ? (
                    <tr>
                      <td colSpan="2" className="px-6 py-12 text-center text-blue-600">
                        <Package className="w-12 h-12 text-blue-300 mx-auto mb-3" />
                        <p className="font-medium">No products yet</p>
                      </td>
                    </tr>
                  ) : (
                    products.slice(0, 5).map(product => (
                      <tr key={product.id} className="hover:bg-blue-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            {product.image_url && (
                              <img
                                src={product.image_url}
                                alt={product.name}
                                className="w-14 h-14 object-cover rounded-lg border-2 border-orange-300 shadow-sm"
                              />
                            )}
                            <div>
                              <p className="font-semibold text-blue-900">{product.name}</p>
                              <p className="text-sm text-blue-600">{product.seller?.business_name || product.seller?.full_name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 ${
                            product.is_approved
                              ? 'bg-blue-100 text-blue-800' 
                              : 'bg-orange-100 text-orange-800'
                          }`}>
                            {product.is_approved ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                            {product.is_approved ? 'APPROVED' : 'PENDING'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-blue-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-blue-200">
              <h2 className="text-lg font-bold text-blue-900">Active Sellers</h2>
            </div>
            
            <div className="divide-y divide-blue-100 max-h-96 overflow-y-auto">
              {sellers.length === 0 ? (
                <div className="p-12 text-center">
                  <Users className="w-12 h-12 text-blue-300 mx-auto mb-3" />
                  <p className="text-blue-600 font-medium">No sellers yet</p>
                </div>
              ) : (
                sellers.slice(0, 5).map(seller => (
                  <div key={seller.id} className="p-5 hover:bg-blue-50 transition-colors cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2.5 mb-2">
                          <p className="font-bold text-blue-900">{seller.business_name || seller.full_name}</p>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-blue-600">
                          <span className="flex items-center gap-1">
                            <Package className="w-4 h-4" />
                            {seller.productCount || 0} products
                          </span>
                          <span className="flex items-center gap-1">
                            <TrendingUp className="w-4 h-4" />
                            {seller.totalSales || 0} sales
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
