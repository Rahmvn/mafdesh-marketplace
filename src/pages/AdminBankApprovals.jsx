import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, User, Clock } from 'lucide-react';

export default function AdminBankApprovals() {
  const navigate = useNavigate();
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    checkAuth();
    loadPendingRequests();
  }, []);

  const checkAuth = () => {
    const storedUser = localStorage.getItem('mafdesh_user');
    if (!storedUser) {
      navigate('/login');
      return;
    }
    const user = JSON.parse(storedUser);
    if (user.role !== 'admin') {
      navigate('/login');
    }
  };

  const loadPendingRequests = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('users')
      .select('id, email, business_name, bank_details_pending, bank_details_approved, bank_name, account_number, account_name, business_address, bvn, tax_id')
      .eq('bank_details_approved', false)
      .not('bank_details_pending', 'is', null);
    if (!error) setPendingUsers(data || []);
    setLoading(false);
  };

  const approveRequest = async (userId, pending) => {
    setProcessing(true);
    const { error } = await supabase
      .from('users')
      .update({
        bank_name: pending.bank_name,
        account_number: pending.account_number,
        account_name: pending.account_name,
        business_address: pending.business_address,
        bvn: pending.bvn,
        tax_id: pending.tax_id,
        bank_details_pending: null,
        bank_details_approved: true
      })
      .eq('id', userId);
    if (error) {
      alert('Failed to approve');
    } else {
      alert('Details updated');
      loadPendingRequests();
    }
    setProcessing(false);
  };

  const rejectRequest = async (userId) => {
    setProcessing(true);
    const { error } = await supabase
      .from('users')
      .update({
        bank_details_pending: null,
        bank_details_approved: true
      })
      .eq('id', userId);
    if (error) {
      alert('Failed to reject');
    } else {
      alert('Request rejected');
      loadPendingRequests();
    }
    setProcessing(false);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        <h1 className="text-3xl font-bold text-blue-900 mb-6">Seller Details Change Requests</h1>
        {pendingUsers.length === 0 ? (
          <div className="bg-white p-8 rounded-lg border text-center text-gray-500">
            No pending requests.
          </div>
        ) : (
          <div className="space-y-6">
            {pendingUsers.map((user) => (
              <div key={user.id} className="bg-white rounded-lg border p-6 shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{user.business_name || 'Unnamed Seller'}</h3>
                    <p className="text-sm text-gray-500">{user.email}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => approveRequest(user.id, user.bank_details_pending)}
                      disabled={processing}
                      className="bg-green-100 text-green-700 p-2 rounded hover:bg-green-200"
                      title="Approve"
                    >
                      <CheckCircle size={20} />
                    </button>
                    <button
                      onClick={() => rejectRequest(user.id)}
                      disabled={processing}
                      className="bg-red-100 text-red-700 p-2 rounded hover:bg-red-200"
                      title="Reject"
                    >
                      <XCircle size={20} />
                    </button>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4 mt-4">
                  <div className="border rounded p-3">
                    <h4 className="font-semibold text-gray-700 mb-2">Current Details</h4>
                    <p><span className="font-medium">Bank:</span> {user.bank_name || '—'}</p>
                    <p><span className="font-medium">Account:</span> {user.account_number || '—'}</p>
                    <p><span className="font-medium">Name:</span> {user.account_name || '—'}</p>
                    <p><span className="font-medium">Business Address:</span> {user.business_address || '—'}</p>
                    <p><span className="font-medium">BVN:</span> {user.bvn || '—'}</p>
                    <p><span className="font-medium">Tax ID:</span> {user.tax_id || '—'}</p>
                  </div>
                  <div className="border rounded p-3 bg-yellow-50">
                    <h4 className="font-semibold text-yellow-800 mb-2">Requested Changes</h4>
                    {user.bank_details_pending && (
                      <>
                        <p><span className="font-medium">Bank:</span> {user.bank_details_pending.bank_name}</p>
                        <p><span className="font-medium">Account:</span> {user.bank_details_pending.account_number}</p>
                        <p><span className="font-medium">Name:</span> {user.bank_details_pending.account_name}</p>
                        <p><span className="font-medium">Business Address:</span> {user.bank_details_pending.business_address || '—'}</p>
                        <p><span className="font-medium">BVN:</span> {user.bank_details_pending.bvn || '—'}</p>
                        <p><span className="font-medium">Tax ID:</span> {user.bank_details_pending.tax_id || '—'}</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}