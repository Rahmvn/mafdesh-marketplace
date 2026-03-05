import React from 'react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DollarSign, Calendar, FileText, Download, TrendingUp, TrendingDown, Wallet, X, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import {supabase} from '../supabaseClient';

export default function SellerPayments() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState({});
  const [overview, setOverview] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

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
        alert('Access denied. Only sellers can access payment history.');
        navigate('/login');
        return;
      }

      setCurrentUser(userData);
    };

    checkAuth();
  }, [navigate]);

  useEffect(() => {
    if (currentUser) {
      loadData();
    }
  }, [currentUser, statusFilter, typeFilter, fromDate, toDate]);

  const loadData = async () => {
  try {
    setIsLoading(true);

    const storedUser = localStorage.getItem('mafdesh_user');
    const user = JSON.parse(storedUser);

    const { data: payments, error } = await supabase
      .from('payments')
      .select('*')
      .eq('seller_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    setTransactions(payments || []);
  } catch (err) {
    console.error('Error loading transaction data:', err);
  } finally {
    setIsLoading(false);
  }
};


  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'successful':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'pending':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'failed':
        return 'bg-orange-200 text-orange-900 border-orange-400';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-300';
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar onLogout={handleLogout} />
      
      <div className="flex-1 px-6 py-6 max-w-7xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-blue-900 mb-2">Transaction History & Financial Overview</h1>
          <p className="text-blue-600">Track all money in (sales) and money out (expenses) with complete transparency</p>
        </div>

        {overview && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg border border-blue-200 shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-600 font-semibold">Total Revenue (Sales)</p>
                  <p className="text-2xl font-bold text-blue-900 mt-1">
                    ₦{parseFloat(overview.revenue.total || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-blue-500 mt-1">{overview.revenue.orders_count} orders</p>
                </div>
                <TrendingUp className="w-10 h-10 text-blue-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg border border-blue-200 shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-600 font-semibold">Total Expenses (Payments)</p>
                  <p className="text-2xl font-bold text-orange-600 mt-1">
                    ₦{parseFloat(overview.expenses.total || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-blue-500 mt-1">{overview.expenses.payments_count} payments</p>
                </div>
                <TrendingDown className="w-10 h-10 text-orange-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg border border-blue-200 shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-600 font-semibold">Net Balance</p>
                  <p className={`text-2xl font-bold mt-1 ${overview.net_balance >= 0 ? 'text-blue-900' : 'text-orange-600'}`}>
                    ₦{parseFloat(overview.net_balance || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-blue-500 mt-1">Revenue - Expenses</p>
                </div>
                <Wallet className="w-10 h-10 text-blue-500" />
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-blue-200 shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-semibold">Total Income</p>
                <p className="text-2xl font-bold text-blue-900 mt-1">
                  ₦{parseFloat(summary.total_income || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-blue-500 mt-1">{summary.income_transactions || 0} sales</p>
              </div>
              <ArrowUpCircle className="w-10 h-10 text-blue-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-blue-200 shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-semibold">Platform Fees</p>
                <p className="text-2xl font-bold text-orange-600 mt-1">
                  ₦{parseFloat(summary.total_platform_fees || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-blue-500 mt-1">5% of sales</p>
              </div>
              <DollarSign className="w-10 h-10 text-orange-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-blue-200 shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-semibold">Total Expenses</p>
                <p className="text-2xl font-bold text-orange-600 mt-1">
                  ₦{parseFloat(summary.total_expenses || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-blue-500 mt-1">{summary.expense_transactions || 0} payments</p>
              </div>
              <ArrowDownCircle className="w-10 h-10 text-orange-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-blue-200 shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-semibold">Net Balance</p>
                <p className={`text-2xl font-bold mt-1 ${summary.net_balance >= 0 ? 'text-blue-900' : 'text-orange-600'}`}>
                  ₦{parseFloat(summary.net_balance || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-blue-500 mt-1">Income - Expenses</p>
              </div>
              <Wallet className="w-10 h-10 text-blue-500" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-blue-200 shadow-sm mb-6 p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="flex flex-col">
              <label className="text-sm font-semibold text-blue-900 mb-2">Transaction Type:</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-4 py-2 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-blue-900"
              >
                <option value="all">All Transactions</option>
                <option value="income">Money In (Sales)</option>
                <option value="expense">Money Out (Expenses)</option>
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-sm font-semibold text-blue-900 mb-2">Filter by Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-blue-900"
              >
                <option value="all">All Status</option>
                <option value="successful">Successful</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-sm font-semibold text-blue-900 mb-2">From Date:</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="px-4 py-2 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-blue-900"
              />
            </div>

            <div className="flex flex-col">
              <label className="text-sm font-semibold text-blue-900 mb-2">To Date:</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="px-4 py-2 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-blue-900"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-blue-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-blue-600">Loading transaction history...</div>
          ) : transactions.length === 0 ? (
            <div className="p-12 text-center text-blue-600">
              No transactions found. Transactions will appear here when you make sales or pay for subscriptions.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-blue-900 text-white">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Type</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Reference</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Description</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Amount</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Platform Fee</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Net Amount</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Buyer ID</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Status</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-100">
                  {transactions.map(transaction => (
                    <tr key={`${transaction.type}-${transaction.id}`} className="hover:bg-blue-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {transaction.type === 'INCOME' ? (
                            <>
                              <ArrowUpCircle className="w-5 h-5 text-blue-500" />
                              <span className="text-sm font-semibold text-blue-700">IN</span>
                            </>
                          ) : (
                            <>
                              <ArrowDownCircle className="w-5 h-5 text-orange-500" />
                              <span className="text-sm font-semibold text-orange-700">OUT</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-blue-900">{transaction.reference}</td>
                      <td className="px-4 py-3 text-sm text-blue-700">{transaction.description}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-blue-900">
                        ₦{parseFloat(transaction.amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-orange-600">
                        {transaction.platform_fee > 0 ? (
                          `-₦${parseFloat(transaction.platform_fee).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        ) : (
                          <span className="text-blue-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-blue-900">
                        ₦{parseFloat(transaction.net_amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-blue-700">
                        {transaction.metadata?.buyer_id ? (
                          transaction.metadata.buyer_id.substring(0, 8) + '...'
                        ) : (
                          <span className="text-blue-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold border capitalize ${getStatusBadgeClass(transaction.status)}`}>
                          {transaction.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-blue-700">
                        {new Date(transaction.created_at).toLocaleDateString('en-NG')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}
