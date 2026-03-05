import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Search, Filter, Eye, FileText, TrendingUp, Clock, CheckCircle, DollarSign, X, Download } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { orderService } from '../services/orderService';

export default function SellerOrders() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receipt, setReceipt] = useState(null);

  const handleLogout = () => {
    localStorage.removeItem('mafdesh_user');
    navigate('/login');
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
        alert('Access denied. Only sellers can access order management.');
        navigate('/login');
        return;
      }

      setCurrentUser(userData);
    };

    checkAuth();
  }, [navigate]);

  useEffect(() => {
    if (currentUser) {
      loadOrders();
    }
  }, [currentUser, statusFilter, searchTerm]);

  const loadOrders = async () => {
    try {
      setIsLoading(true);
      const filters = {};
      if (statusFilter !== 'all') filters.status = statusFilter;
      if (searchTerm) filters.search = searchTerm;

      const data = await orderService.getSellerOrders(filters);
      setOrders(data.orders || []);
      setSummary(data.summary || {});
    } catch (error) {
      console.error('Error loading orders:', error);
      alert('Failed to load orders');
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewDetails = async (order) => {
    try {
      const response = await orderService.getOrderDetails(order.id);
      setSelectedOrder(response.order);
      setShowOrderDetails(true);
    } catch (error) {
      console.error('Error loading order details:', error);
      alert('Failed to load order details');
    }
  };

  const handleViewReceipt = async (orderId) => {
    try {
      const response = await orderService.getOrderReceipt(orderId);
      setReceipt(response.receipt);
      setShowReceipt(true);
    } catch (error) {
      console.error('Error loading receipt:', error);
      alert('Failed to load receipt');
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'payment_pending':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'payment_received':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'processing':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'shipped':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'delivered':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'cancelled':
        return 'bg-orange-200 text-orange-900 border-orange-400';
      case 'refunded':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      default:
        return 'bg-blue-50 text-blue-700 border-blue-200';
    }
  };

  const getStatusLabel = (status) => {
    return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const handleDownloadSalesReceipt = () => {
    if (!receipt) return;

    const receiptContent = `
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ███╗   ███╗ █████╗ ███████╗██████╗ ███████╗███████╗██╗ ║
║   ████╗ ████║██╔══██╗██╔════╝██╔══██╗██╔════╝██╔════╝██║ ║
║   ██╔████╔██║███████║█████╗  ██║  ██║█████╗  ███████╗██║ ║
║   ██║╚██╔╝██║██╔══██║██╔══╝  ██║  ██║██╔══╝  ╚════██║██║ ║
║   ██║ ╚═╝ ██║██║  ██║██║     ██████╔╝███████╗███████║██║ ║
║   ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝     ╚═════╝ ╚══════╝╚══════╝╚═╝ ║
║                                                           ║
║          Nigeria's Most Trusted Marketplace              ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

┌───────────────────────────────────────────────────────────┐
│                     SALES RECEIPT                         │
└───────────────────────────────────────────────────────────┘

Order Number:       ${receipt.order_number}
Issue Date:         ${new Date(receipt.created_at).toLocaleString('en-NG')}
Order Status:       ${receipt.status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELLER INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Business Name:      ${receipt.seller?.business_name || receipt.seller?.full_name}
Email:              ${receipt.seller?.email}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUYER INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Customer Name:      ${receipt.buyer?.full_name}
Email:              ${receipt.buyer?.email}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ORDER DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Order Placed:       ${new Date(receipt.placed_at).toLocaleString('en-NG')}

ITEMS ORDERED:
${receipt.items?.map((item, index) => `
${(index + 1).toString().padStart(2, '0')}. ${item.product_name}
    Quantity:       ${item.quantity} units
    Unit Price:     ₦${parseFloat(item.unit_price).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    Subtotal:       ₦${parseFloat(item.subtotal).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
`).join('')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PAYMENT SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Items Subtotal:     ₦${parseFloat(receipt.subtotal).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Delivery Fee:       ₦${parseFloat(receipt.delivery_fee).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL AMOUNT:       ₦${parseFloat(receipt.total).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
${receipt.paystack_reference ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nPAYMENT INFORMATION\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nPayment Reference:  ${receipt.paystack_reference}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Thank you for selling on Mafdesh!

For support, contact us at: support@mafdesh.com
Visit us at: www.mafdesh.com

This is a system-generated receipt. No signature required.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `.trim();

    const blob = new Blob([receiptContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Mafdesh-Sales-Receipt-${receipt.order_number}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar onLogout={handleLogout} />
      
      <div className="flex-1 px-6 py-6 max-w-7xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-blue-900 mb-2">Order Management</h1>
          <p className="text-blue-600">Track and manage all your customer orders</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-blue-200 shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-semibold">Total Revenue</p>
                <p className="text-2xl font-bold text-blue-900 mt-1">
                  ₦{parseFloat(summary.total_revenue || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <DollarSign className="w-10 h-10 text-orange-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-blue-200 shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-semibold">Total Orders</p>
                <p className="text-2xl font-bold text-blue-900 mt-1">{summary.total_orders || 0}</p>
              </div>
              <Package className="w-10 h-10 text-blue-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-blue-200 shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-semibold">Processing</p>
                <p className="text-2xl font-bold text-blue-900 mt-1">{summary.processing_orders || 0}</p>
              </div>
              <Clock className="w-10 h-10 text-orange-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-blue-200 shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-semibold">Completed</p>
                <p className="text-2xl font-bold text-blue-900 mt-1">{summary.completed_orders || 0}</p>
              </div>
              <CheckCircle className="w-10 h-10 text-blue-500" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-blue-200 shadow-sm mb-6 p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-blue-400" />
                <input
                  type="text"
                  placeholder="Search orders by order number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-blue-600" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-blue-900"
              >
                <option value="all">All Orders</option>
                <option value="payment_pending">Payment Pending</option>
                <option value="payment_received">Payment Received</option>
                <option value="processing">Processing</option>
                <option value="shipped">Shipped</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-blue-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-blue-600">Loading orders...</div>
          ) : orders.length === 0 ? (
            <div className="p-12 text-center text-blue-600">
              {searchTerm || statusFilter !== 'all' 
                ? 'No orders match your search criteria.' 
                : 'No orders yet. Orders will appear here when customers make purchases.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-blue-900 text-white">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Order Number</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Date</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Buyer</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Items</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Total</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Status</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-100">
                  {orders.map(order => (
                    <tr key={order.id} className="hover:bg-blue-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-semibold text-blue-900">{order.order_number}</td>
                      <td className="px-4 py-3 text-sm text-blue-700">
                        {new Date(order.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-blue-900">
                        {order.buyer?.full_name || 'Unknown'}
                      </td>
                      <td className="px-4 py-3 text-sm text-blue-700">
                        {order.items?.length || 0} item(s)
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-orange-600">
                        ₦{parseFloat(order.total_amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusBadgeClass(order.status)}`}>
                          {getStatusLabel(order.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleViewDetails(order)}
                            className="p-2 hover:bg-blue-100 rounded transition-colors"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4 text-blue-700" />
                          </button>
                          <button
                            onClick={() => handleViewReceipt(order.id)}
                            className="p-2 hover:bg-orange-100 rounded transition-colors"
                            title="View Receipt"
                          >
                            <FileText className="w-4 h-4 text-orange-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {showOrderDetails && selectedOrder && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-blue-200 p-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-blue-900">Order Details - {selectedOrder.order_number}</h2>
                <button
                  onClick={() => setShowOrderDetails(false)}
                  className="p-2 hover:bg-blue-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-blue-700" />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-blue-600 font-semibold mb-1">Order Status</p>
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${getStatusBadgeClass(selectedOrder.status)}`}>
                      {getStatusLabel(selectedOrder.status)}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-blue-600 font-semibold mb-1">Payment Verified</p>
                    <p className="text-blue-900">{selectedOrder.payment_verified ? 'Yes' : 'No'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-blue-600 font-semibold mb-1">Delivery Method</p>
                    <p className="text-blue-900 capitalize">{selectedOrder.delivery_method}</p>
                  </div>
                  <div>
                    <p className="text-sm text-blue-600 font-semibold mb-1">Delivery Phone</p>
                    <p className="text-blue-900">{selectedOrder.delivery_phone || 'N/A'}</p>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-blue-600 font-semibold mb-1">Buyer Information</p>
                  <p className="text-blue-900">{selectedOrder.buyer?.full_name}</p>
                  <p className="text-blue-700 text-sm">{selectedOrder.buyer?.email}</p>
                </div>

                <div>
                  <p className="text-sm text-blue-600 font-semibold mb-1">Delivery Address</p>
                  <p className="text-blue-900">{selectedOrder.delivery_address || 'N/A'}</p>
                </div>

                <div>
                  <p className="text-sm text-blue-600 font-semibold mb-2">Order Items</p>
                  <div className="bg-blue-50 rounded-lg p-4 space-y-2">
                    {selectedOrder.items?.map((item, index) => (
                      <div key={index} className="flex justify-between items-center">
                        <div>
                          <p className="font-semibold text-blue-900">{item.product_name}</p>
                          <p className="text-sm text-blue-600">Qty: {item.quantity} × ₦{parseFloat(item.unit_price).toLocaleString('en-NG')}</p>
                        </div>
                        <p className="font-semibold text-orange-600">
                          ₦{parseFloat(item.subtotal).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-blue-200 pt-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-blue-900">
                      <span>Subtotal:</span>
                      <span>₦{parseFloat(selectedOrder.subtotal).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-blue-900">
                      <span>Delivery Fee:</span>
                      <span>₦{parseFloat(selectedOrder.delivery_fee).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold text-blue-900 border-t border-blue-200 pt-2">
                      <span>Total:</span>
                      <span className="text-orange-600">₦{parseFloat(selectedOrder.total_amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {showReceipt && receipt && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-blue-200 p-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-blue-900">Receipt - {receipt.order_number}</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadSalesReceipt}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-semibold"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                  <button
                    onClick={() => setShowReceipt(false)}
                    className="p-2 hover:bg-blue-100 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5 text-blue-700" />
                  </button>
                </div>
              </div>
              
              <div className="p-6 space-y-4">
                <div className="text-center border-b border-blue-200 pb-4">
                  <h3 className="text-2xl font-bold text-blue-900">Mafdesh Receipt</h3>
                  <p className="text-sm text-blue-600 mt-1">Order #{receipt.order_number}</p>
                  <p className="text-sm text-blue-600">
                    Date: {new Date(receipt.placed_at).toLocaleString()}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="font-semibold text-blue-900 mb-1">Seller:</p>
                    <p className="text-blue-700">{receipt.seller?.business_name || receipt.seller?.full_name}</p>
                    <p className="text-blue-600">{receipt.seller?.email}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-blue-900 mb-1">Buyer:</p>
                    <p className="text-blue-700">{receipt.buyer?.full_name}</p>
                    <p className="text-blue-600">{receipt.buyer?.email}</p>
                  </div>
                </div>

                <div>
                  <p className="font-semibold text-blue-900 mb-2">Items:</p>
                  <div className="bg-blue-50 rounded-lg p-4 space-y-2">
                    {receipt.items?.map((item, index) => (
                      <div key={index} className="flex justify-between text-sm">
                        <div>
                          <p className="text-blue-900">{item.product_name}</p>
                          <p className="text-blue-600">Qty: {item.quantity} × ₦{parseFloat(item.unit_price).toLocaleString('en-NG')}</p>
                        </div>
                        <p className="text-blue-900 font-semibold">
                          ₦{parseFloat(item.subtotal).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-blue-200 pt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-blue-700">Subtotal:</span>
                    <span className="text-blue-900">₦{parseFloat(receipt.subtotal).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-700">Delivery Fee:</span>
                    <span className="text-blue-900">₦{parseFloat(receipt.delivery_fee).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t border-blue-200 pt-2">
                    <span className="text-blue-900">Total:</span>
                    <span className="text-orange-600">₦{parseFloat(receipt.total).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {receipt.paystack_reference && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-800">
                      <span className="font-semibold">Payment Reference:</span> {receipt.paystack_reference}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
