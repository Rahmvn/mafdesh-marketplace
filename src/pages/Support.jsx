import { useState, useEffect } from 'react';
import { Mail, MessageCircle, HelpCircle, Shield, Clock } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export default function Support() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem('mafdesh_user') || '{}');
    setUser(userData);
  }, []);

  const isVerifiedSeller = user?.role === 'seller' && user?.is_verified;

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-blue-50 via-white to-orange-50">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-blue-900 mb-4">Support Center</h1>
          <p className="text-blue-700 mb-8">
            We're here to help! Get in touch with our support team.
          </p>

          {isVerifiedSeller && (
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl p-6 mb-8 text-white shadow-lg">
              <div className="flex items-center gap-3 mb-2">
                <Shield className="w-6 h-6" />
                <h2 className="text-xl font-bold">Priority Support Active</h2>
              </div>
              <p className="text-orange-100 mb-3">
                As a verified seller, you get priority support with guaranteed 2-hour response times during business hours.
              </p>
              <div className="flex items-center gap-2 bg-white bg-opacity-20 rounded-lg px-3 py-2 inline-flex">
                <Clock className="w-4 h-4" />
                <span className="text-sm font-semibold">Response within 2 hours</span>
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <div className="bg-white rounded-xl p-6 shadow-md border-2 border-orange-200 hover:border-orange-400 transition">
              <div className="bg-orange-100 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                <Mail className="text-orange-600" size={24} />
              </div>
              <h3 className="text-lg font-bold text-blue-900 mb-2">Email Support</h3>
              <p className="text-blue-700 text-sm mb-4">
                {isVerifiedSeller ? 'Priority response within 2 hours' : 'Get help via email within 24 hours'}
              </p>
              <a
                href="mailto:support@mafdesh.com"
                className="text-orange-600 font-medium hover:text-orange-700"
              >
                support@mafdesh.com
              </a>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-md border-2 border-orange-200 hover:border-orange-400 transition">
              <div className="bg-orange-100 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                <MessageCircle className="text-orange-600" size={24} />
              </div>
              <h3 className="text-lg font-bold text-blue-900 mb-2">Live Chat</h3>
              <p className="text-blue-700 text-sm mb-4">
                {isVerifiedSeller ? 'Priority queue - Skip the line' : 'Chat with our team in real-time'}
              </p>
              <button className="text-orange-600 font-medium hover:text-orange-700">
                Start Chat
              </button>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-md border-2 border-orange-200 hover:border-orange-400 transition">
              <div className="bg-orange-100 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                <HelpCircle className="text-orange-600" size={24} />
              </div>
              <h3 className="text-lg font-bold text-blue-900 mb-2">FAQ</h3>
              <p className="text-blue-700 text-sm mb-4">
                Find answers to common questions
              </p>
              <button className="text-orange-600 font-medium hover:text-orange-700">
                View FAQ
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-8 border-2 border-blue-100">
            <h2 className="text-2xl font-bold text-blue-900 mb-6">Frequently Asked Questions</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-blue-900 mb-2">How do I become a verified seller?</h3>
                <p className="text-blue-700">
                  Subscribe to our verification plan (₦3,000/month or ₦30,000/year) to get verified status, priority support, premium analytics, and 2-3x more visibility.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-blue-900 mb-2">Is messaging sellers safe?</h3>
                <p className="text-blue-700">
                  Yes! We use smart keyword filtering to ensure safe communication between buyers and sellers. 
                  This protects both parties from scams and inappropriate content.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-blue-900 mb-2">What payment methods do you accept?</h3>
                <p className="text-blue-700">
                  We support Paystack for secure payments. Details will be provided during checkout 
                  to ensure a safe transaction.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-blue-900 mb-2">How can I report a problem?</h3>
                <p className="text-blue-700">
                  You can report issues via email at support@mafdesh.com or use our live chat feature. 
                  {isVerifiedSeller && ' As a verified seller, you get priority responses within 2 hours.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
