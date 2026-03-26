import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { AlertCircle, Upload } from 'lucide-react';

export default function DisputeThread({ orderId, currentUserId, currentUserRole, orderStatus }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [newImages, setNewImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMessages();
    const subscription = supabase
      .channel(`dispute-${orderId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'dispute_messages',
        filter: `order_id=eq.${orderId}`,
      }, (payload) => {
        setMessages(prev => [payload.new, ...prev]);
      })
      .subscribe();
    return () => supabase.removeChannel(subscription);
  }, [orderId]);

  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from('dispute_messages')
      .select(`
        *,
        sender:users!sender_id (
          role,
          profiles (full_name, username)
        )
      `)
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });
    if (!error) setMessages(data || []);
    setLoading(false);
  };

  const uploadImages = async (files) => {
    const urls = [];
    for (const file of files) {
      const fileExt = file.name.split('.').pop();
      const fileName = `dispute_${orderId}_${Date.now()}_${Math.random()}.${fileExt}`;
      const { data, error } = await supabase.storage
        .from('dispute-evidence')
        .upload(fileName, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage
        .from('dispute-evidence')
        .getPublicUrl(fileName);
      urls.push(urlData.publicUrl);
    }
    return urls;
  };

  const sendMessage = async () => {
    if (!newMessage.trim() && newImages.length === 0) return;
    setUploading(true);
    try {
      let uploadedUrls = [];
      if (newImages.length) {
        uploadedUrls = await uploadImages(newImages);
      }
      const { error } = await supabase
        .from('dispute_messages')
        .insert({
          order_id: orderId,
          sender_id: currentUserId,
          sender_role: currentUserRole,
          message: newMessage.trim() || null,
          images: uploadedUrls,
        });
      if (error) throw error;
      setNewMessage('');
      setNewImages([]);
    } catch (err) {
      console.error(err);
      alert('Failed to send message');
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div>Loading messages...</div>;

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
                  {msg.sender?.profiles?.full_name || msg.sender?.profiles?.username || 'User'} ({msg.sender_role})
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(msg.created_at).toLocaleString()}
                </span>
              </div>
              {msg.message && <p className="mt-1 text-gray-700">{msg.message}</p>}
              {msg.images && msg.images.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {msg.images.map((img, idx) => (
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
    </div>
  );
}