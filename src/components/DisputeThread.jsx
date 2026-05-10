import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { AlertCircle, Upload } from 'lucide-react';
import useModal from '../hooks/useModal';
import {
  addDisputeMessage,
  resolveDisputeImageUrls,
  uploadDisputeEvidence,
} from '../services/disputeService';

export default function DisputeThread({ orderId, currentUserId, orderStatus }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [newImages, setNewImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const { showError, ModalComponent } = useModal();

  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('dispute_messages')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    if (!error) {
      const senderIds = [...new Set((data || []).map((message) => message.sender_id).filter(Boolean))];
      let profileMap = {};

      if (senderIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, username')
          .in('id', senderIds);

        profileMap = (profiles || []).reduce((map, profile) => {
          map[profile.id] = profile;
          return map;
        }, {});
      }

      const hydratedMessages = await Promise.all(
        (data || []).map(async (message) => ({
          ...message,
          sender: {
            profiles: profileMap[message.sender_id] || null,
          },
          imageUrls: await resolveDisputeImageUrls(message.images || []),
        }))
      );

      setMessages(hydratedMessages);
    }

    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    fetchMessages();
    const subscription = supabase
      .channel(`dispute-${orderId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'dispute_messages',
        filter: `order_id=eq.${orderId}`,
      }, () => {
        fetchMessages();
      })
      .subscribe();
    return () => supabase.removeChannel(subscription);
  }, [orderId, fetchMessages]);

  const uploadImages = async (files) => {
    return uploadDisputeEvidence({
      orderId,
      actorId: currentUserId,
      files,
    });
  };

  const sendMessage = async () => {
    if (!newMessage.trim() && newImages.length === 0) return;
    setUploading(true);
    try {
      let uploadedPaths = [];
      if (newImages.length) {
        uploadedPaths = await uploadImages(newImages);
      }
      await addDisputeMessage(orderId, newMessage.trim() || null, uploadedPaths);
      setNewMessage('');
      setNewImages([]);
    } catch (err) {
      console.error(err);
      showError('Message Failed', 'Failed to send message.');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-4 mb-6 animate-pulse">
        <div className="h-6 w-40 rounded bg-gray-200" />
        <div className="mt-4 space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="border-l-4 border-gray-100 pl-3">
              <div className="flex justify-between items-center">
                <div className="h-4 w-28 rounded bg-gray-200" />
                <div className="h-3 w-24 rounded bg-gray-100" />
              </div>
              <div className="mt-2 h-4 w-full rounded bg-gray-100" />
              <div className="mt-2 h-4 w-10/12 rounded bg-gray-50" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border p-4 mb-6">
      <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
        <AlertCircle size={20} className="text-red-500" />
        Dispute Discussion
      </h3>
      {messages.length === 0 ? (
        <p className="text-gray-500">No messages yet.</p>
      ) : (
        <div className="space-y-4 max-h-96 overflow-y-auto mb-4">
          {messages.map(msg => (
            <div key={msg.id} className="border-l-4 border-gray-200 pl-3">
              <div className="flex justify-between items-center text-sm">
                <span className="font-medium">
                  {msg.sender?.profiles?.full_name || msg.sender_id || 'User'} ({msg.sender_role})
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(msg.created_at).toLocaleString()}
                </span>
              </div>
              {msg.message && <p className="mt-1 text-gray-700">{msg.message}</p>}
              {msg.imageUrls && msg.imageUrls.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {msg.imageUrls.map((img, idx) => (
                    <a key={idx} href={img} target="_blank" rel="noopener noreferrer">
                      <img src={img} alt="evidence" className="w-16 h-16 object-cover rounded border" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {orderStatus === 'DISPUTED' && (
        <div className="mt-4 border-t pt-4">
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your message..."
            rows="3"
            className="w-full border rounded p-2 mb-2"
          />
          <div className="flex items-center gap-2 mb-2">
            <label className="flex items-center gap-1 text-sm text-blue-600 cursor-pointer">
              <Upload size={16} />
              Attach images
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setNewImages(Array.from(e.target.files))}
                className="hidden"
              />
            </label>
            {newImages.length > 0 && (
              <span className="text-xs text-gray-500">{newImages.length} file(s) selected</span>
            )}
          </div>
          <button
            onClick={sendMessage}
            disabled={uploading || (!newMessage.trim() && newImages.length === 0)}
            className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {uploading ? 'Sending...' : 'Send Message'}
          </button>
        </div>
      )}
      <ModalComponent />
    </div>
  );
}
