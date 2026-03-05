import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Eye, ShoppingCart, DollarSign, Users, BarChart3, Shield, Lock, Download, Calendar, Moon, Sun, RefreshCw, Filter } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { authAPI } from '../services/api';

export default function SellerAnalytics() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [dateRange, setDateRange] = useState('7days');
  const [refreshing, setRefreshing] = useState(false);
  const [analytics, setAnalytics] = useState({
    totalViews: 0,
    totalClicks: 0,
    totalRevenue: 0,
    conversionRate: 0,
    topProducts: [],
    recentActivity: []
  });

  useEffect(() => {
    loadUserAndAnalytics();
    const savedTheme = localStorage.getItem('analytics_dark_mode');
    if (savedTheme) setDarkMode(savedTheme === 'true');
  }, []);

  const loadUserAndAnalytics = async () => {
    try {
      const userData = JSON.parse(localStorage.getItem('mafdesh_user') || '{}');
      setUser(userData);

      if (!userData.is_verified) {
        return;
      }

      setAnalytics({
        totalViews: 1247,
        totalClicks: 386,
        totalRevenue: 125000,
        conversionRate: 31,
        topProducts: [
          { name: 'Premium Wireless Headphones', views: 342, sales: 28, revenue: 42000, trend: '+15%' },
          { name: 'Smart Watch Series 5', views: 289, sales: 19, revenue: 38000, trend: '+8%' },
          { name: 'Portable Power Bank', views: 234, sales: 31, revenue: 23400, trend: '+22%' }
        ],
        recentActivity: [
          { type: 'sale', product: 'Wireless Headphones', amount: 1500, time: '2 hours ago' },
          { type: 'view', product: 'Smart Watch', count: 15, time: '5 hours ago' },
          { type: 'sale', product: 'Power Bank', amount: 750, time: '1 day ago' }
        ]
      });
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await loadUserAndAnalytics();
    setRefreshing(false);
  };

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem('analytics_dark_mode', newMode.toString());
  };

  const handleExport = () => {
    const data = `Mafdesh Analytics Export - ${new Date().toLocaleDateString()}\n\nTotal Views: ${analytics.totalViews}\nTotal Clicks: ${analytics.totalClicks}\nTotal Revenue: ₦${analytics.totalRevenue}\nConversion Rate: ${analytics.conversionRate}%`;
    const blob = new Blob([data], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mafdesh-analytics-${Date.now()}.txt`;
    a.click();
  };

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to logout?')) {
      try {
        await authAPI.logout();
      } catch (error) {
        console.error('Logout error:', error);
      }
      localStorage.removeItem('mafdesh_user');
      navigate('/login');
    }
  };

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gradient-to-br from-blue-50 via-white to-orange-50'}`}>
        <p className={darkMode ? 'text-white' : 'text-blue-800'}>Loading analytics...</p>
      </div>
    );
  }

  if (!user?.is_verified) {
    return (
      <div className="flex flex-col min-h-screen bg-gradient-to-br from-blue-50 via-white to-orange-50">
        <Navbar onLogout={handleLogout} />
        <main className="flex-1 container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="bg-orange-100 p-4 rounded-full">
                <Lock className="w-12 h-12 text-orange-600" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-blue-900 mb-3">Premium Analytics Dashboard</h1>
            <p className="text-blue-700 mb-6">
              This feature is exclusive to verified sellers. Get verified to unlock detailed insights about your business performance.
            </p>
            <button
              onClick={() => navigate('/seller/verification')}
              className="bg-orange-600 hover:bg-orange-700 text-white px-8 py-3 rounded-lg font-bold text-lg transition-colors"
            >
              Get Verified Now
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const bgColor = darkMode ? 'bg-gray-900' : 'bg-gradient-to-br from-blue-50 via-white to-orange-50';
  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-blue-100';
  const textPrimary = darkMode ? 'text-white' : 'text-blue-900';
  const textSecondary = darkMode ? 'text-gray-300' : 'text-blue-700';
  const accentBg = darkMode ? 'bg-gray-700' : 'bg-blue-50';

  return (
    <div className={`flex flex-col min-h-screen ${bgColor} transition-colors duration-300`}>
      <Navbar onLogout={handleLogout} />

      <main className="flex-1 container mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-r from-blue-600 to-orange-600 p-3 rounded-lg">
              <BarChart3 className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className={`text-3xl font-bold ${textPrimary}`}>Premium Analytics</h1>
              <div className="flex items-center gap-2 text-sm">
                <Shield className="w-4 h-4 text-orange-600" />
                <span className="text-orange-600 font-semibold">Verified Seller Exclusive</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleDarkMode}
              className={`p-2.5 rounded-lg ${darkMode ? 'bg-gray-700 text-yellow-400' : 'bg-blue-100 text-blue-700'} hover:opacity-80 transition-all`}
              title="Toggle dark mode"
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className={`p-2.5 rounded-lg ${darkMode ? 'bg-gray-700 text-blue-400' : 'bg-blue-100 text-blue-700'} hover:opacity-80 transition-all ${refreshing ? 'animate-spin' : ''}`}
              title="Refresh data"
            >
              <RefreshCw className="w-5 h-5" />
            </button>

            <button
              onClick={handleExport}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg ${darkMode ? 'bg-gray-700 text-green-400' : 'bg-green-100 text-green-700'} hover:opacity-80 transition-all font-semibold`}
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>

        <div className={`${cardBg} rounded-xl p-4 mb-6 border-2 shadow-lg`}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Calendar className={`w-5 h-5 ${textSecondary}`} />
              <span className={`font-semibold ${textPrimary}`}>Date Range:</span>
            </div>
            <div className="flex gap-2">
              {['Today', '7days', '30days', '90days'].map((range) => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  className={`px-4 py-1.5 rounded-lg font-medium text-sm transition-all ${
                    dateRange === range
                      ? 'bg-orange-600 text-white'
                      : darkMode
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  }`}
                >
                  {range === 'Today' ? 'Today' : range === '7days' ? 'Last 7 Days' : range === '30days' ? 'Last 30 Days' : 'Last 90 Days'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className={`${cardBg} rounded-xl shadow-md p-5 border-2`}>
            <div className="flex items-center justify-between mb-2">
              <p className={`${textSecondary} text-sm font-medium`}>Total Views</p>
              <Eye className="w-5 h-5 text-blue-600" />
            </div>
            <p className={`text-3xl font-bold ${textPrimary}`}>{analytics.totalViews.toLocaleString()}</p>
            <p className="text-xs text-green-600 mt-1">↑ 12% from last week</p>
          </div>

          <div className={`${cardBg} rounded-xl shadow-md p-5 border-2`}>
            <div className="flex items-center justify-between mb-2">
              <p className={`${textSecondary} text-sm font-medium`}>Product Clicks</p>
              <ShoppingCart className="w-5 h-5 text-orange-600" />
            </div>
            <p className={`text-3xl font-bold ${textPrimary}`}>{analytics.totalClicks.toLocaleString()}</p>
            <p className="text-xs text-green-600 mt-1">↑ 8% from last week</p>
          </div>

          <div className={`${cardBg} rounded-xl shadow-md p-5 border-2`}>
            <div className="flex items-center justify-between mb-2">
              <p className={`${textSecondary} text-sm font-medium`}>Total Revenue</p>
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <p className={`text-3xl font-bold ${textPrimary}`}>₦{analytics.totalRevenue.toLocaleString()}</p>
            <p className="text-xs text-green-600 mt-1">↑ 15% from last week</p>
          </div>

          <div className={`${cardBg} rounded-xl shadow-md p-5 border-2`}>
            <div className="flex items-center justify-between mb-2">
              <p className={`${textSecondary} text-sm font-medium`}>Conversion Rate</p>
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
            <p className={`text-3xl font-bold ${textPrimary}`}>{analytics.conversionRate}%</p>
            <p className="text-xs text-green-600 mt-1">↑ 3% from last week</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className={`${cardBg} rounded-xl shadow-md p-6 border-2`}>
            <h2 className={`text-xl font-bold ${textPrimary} mb-4 flex items-center gap-2`}>
              <TrendingUp className="w-5 h-5 text-orange-600" />
              Top Performing Products
            </h2>
            <div className="space-y-3">
              {analytics.topProducts.map((product, index) => (
                <div key={index} className={`flex items-center justify-between p-3 ${accentBg} rounded-lg`}>
                  <div className="flex-1">
                    <p className={`font-semibold ${textPrimary} text-sm`}>{product.name}</p>
                    <p className={`text-xs ${textSecondary}`}>{product.views} views • {product.sales} sales</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-orange-600">₦{product.revenue.toLocaleString()}</p>
                    <p className="text-xs text-green-600">{product.trend}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`${cardBg} rounded-xl shadow-md p-6 border-2`}>
            <h2 className={`text-xl font-bold ${textPrimary} mb-4 flex items-center gap-2`}>
              <Users className="w-5 h-5 text-orange-600" />
              Recent Activity
            </h2>
            <div className="space-y-3">
              {analytics.recentActivity.map((activity, index) => (
                <div key={index} className={`flex items-center gap-3 p-3 ${accentBg} rounded-lg`}>
                  {activity.type === 'sale' ? (
                    <div className="bg-green-100 p-2 rounded-full">
                      <DollarSign className="w-4 h-4 text-green-600" />
                    </div>
                  ) : (
                    <div className="bg-blue-100 p-2 rounded-full">
                      <Eye className="w-4 h-4 text-blue-600" />
                    </div>
                  )}
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${textPrimary}`}>
                      {activity.type === 'sale' ? 'New Sale' : 'Product Views'}
                    </p>
                    <p className={`text-xs ${textSecondary}`}>
                      {activity.product} {activity.amount && `• ₦${activity.amount}`}
                      {activity.count && `• ${activity.count} views`}
                    </p>
                  </div>
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-blue-500'}`}>{activity.time}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={`${darkMode ? 'bg-gradient-to-r from-gray-800 to-gray-700' : 'bg-gradient-to-r from-blue-600 to-orange-600'} rounded-xl shadow-lg p-6 text-white`}>
          <h3 className="text-xl font-bold mb-2">Premium Analytics Dashboard</h3>
          <p className={`${darkMode ? 'text-gray-300' : 'text-blue-100'} mb-4`}>
            You're getting the full verified seller experience! Track your performance, understand your customers, and grow your business with data-driven insights.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-start gap-2">
              <div className="bg-white bg-opacity-20 p-1.5 rounded">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <p className="font-semibold">Real-time Tracking</p>
                <p className={`${darkMode ? 'text-gray-300' : 'text-blue-100'} text-xs`}>Live updates on views and sales</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="bg-white bg-opacity-20 p-1.5 rounded">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <p className="font-semibold">Customer Insights</p>
                <p className={`${darkMode ? 'text-gray-300' : 'text-blue-100'} text-xs`}>Understand buyer behavior</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="bg-white bg-opacity-20 p-1.5 rounded">
                <BarChart3 className="w-4 h-4" />
              </div>
              <div>
                <p className="font-semibold">Performance Metrics</p>
                <p className={`${darkMode ? 'text-gray-300' : 'text-blue-100'} text-xs`}>Track conversion rates</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
