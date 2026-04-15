import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import {
  Filter,
  LifeBuoy,
  Mail,
  Paperclip,
  Search,
} from 'lucide-react';

function statusClass(status) {
  switch (status) {
    case 'resolved':
      return 'bg-green-100 text-green-700';
    case 'in_progress':
      return 'bg-blue-100 text-blue-700';
    default:
      return 'bg-orange-100 text-orange-700';
  }
}

export default function AdminSupport() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [savingId, setSavingId] = useState(null);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const userIds = [...new Set((data || []).map((ticket) => ticket.user_id).filter(Boolean))];
      let userMap = {};

      if (userIds.length > 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, email, business_name')
          .in('id', userIds);

        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name, username')
          .in('id', userIds);

        const combined = {};
        usersData?.forEach((user) => {
          combined[user.id] = { ...combined[user.id], ...user };
        });
        profilesData?.forEach((profile) => {
          combined[profile.id] = { ...combined[profile.id], ...profile };
        });

        userMap = Object.fromEntries(
          Object.entries(combined).map(([id, info]) => [
            id,
            {
              label:
                info.business_name ||
                info.full_name ||
                info.username ||
                info.email ||
                id,
              email: info.email || 'Unknown',
            },
          ])
        );
      }

      setTickets(
        (data || []).map((ticket) => ({
          ...ticket,
          requester_name: userMap[ticket.user_id]?.label || 'Unknown user',
          requester_email: userMap[ticket.user_id]?.email || 'Unknown',
        }))
      );
    } catch (error) {
      console.error('Error loading support tickets:', error);
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      if (statusFilter !== 'all' && ticket.status !== statusFilter) {
        return false;
      }

      if (!searchTerm.trim()) {
        return true;
      }

      const term = searchTerm.toLowerCase();
      return (
        ticket.subject?.toLowerCase().includes(term) ||
        ticket.message?.toLowerCase().includes(term) ||
        ticket.requester_name?.toLowerCase().includes(term) ||
        ticket.requester_email?.toLowerCase().includes(term) ||
        ticket.issue_type?.toLowerCase().includes(term)
      );
    });
  }, [searchTerm, statusFilter, tickets]);

  const updateStatus = async (ticketId, nextStatus) => {
    setSavingId(ticketId);
    try {
      const payload = {
        status: nextStatus,
        updated_at: new Date().toISOString(),
      };

      if (nextStatus === 'resolved') {
        payload.resolved_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('support_tickets')
        .update(payload)
        .eq('id', ticketId);

      if (error) throw error;

      setTickets((current) =>
        current.map((ticket) =>
          ticket.id === ticketId
            ? {
                ...ticket,
                ...payload,
              }
            : ticket
        )
      );
    } catch (error) {
      console.error('Failed to update support ticket:', error);
      alert('Could not update ticket status.');
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading support tickets...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Support Inbox</h1>
          <p className="text-gray-600">Review, triage, and resolve in-app support submissions.</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[250px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by subject, issue, requester, or message..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-gray-500" />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="border border-gray-300 rounded-lg p-2 text-sm"
            >
              <option value="all">All Tickets</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
        </div>

        {filteredTickets.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <LifeBuoy className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No support tickets found</p>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredTickets.map((ticket) => (
              <div key={ticket.id} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusClass(ticket.status)}`}>
                        {ticket.status.replaceAll('_', ' ')}
                      </span>
                      <span className="text-xs uppercase tracking-[0.14em] text-gray-500">
                        {ticket.issue_type.replaceAll('_', ' ')}
                      </span>
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{ticket.subject}</h2>
                      <p className="text-sm text-gray-500 mt-1">
                        {ticket.requester_name} · {ticket.requester_email} · {ticket.user_role}
                      </p>
                    </div>
                    <p className="text-sm leading-6 text-gray-700 whitespace-pre-wrap">
                      {ticket.message}
                    </p>

                    {ticket.attachment_urls?.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-gray-900">Attachments</p>
                        <div className="flex flex-wrap gap-2">
                          {ticket.attachment_urls.map((url) => (
                            <a
                              key={url}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-2 text-sm text-blue-700 hover:bg-blue-100"
                            >
                              <Paperclip className="h-4 w-4" />
                              Open attachment
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="w-full max-w-xs space-y-3 rounded-xl bg-gray-50 p-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Created</p>
                      <p className="text-sm font-medium text-gray-900">
                        {new Date(ticket.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Contact</p>
                      <a
                        href={`mailto:${ticket.requester_email}?subject=${encodeURIComponent(`Re: ${ticket.subject}`)}`}
                        className="inline-flex items-center gap-2 text-sm font-medium text-orange-600 hover:text-orange-700"
                      >
                        <Mail className="h-4 w-4" />
                        Reply by email
                      </a>
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-[0.14em] text-gray-500 mb-2">
                        Status
                      </label>
                      <select
                        value={ticket.status}
                        onChange={(event) => updateStatus(ticket.id, event.target.value)}
                        disabled={savingId === ticket.id}
                        className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white"
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </div>
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
