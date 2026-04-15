import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Clock,
  CreditCard,
  Download,
  Lock,
  Shield,
  Star,
  Users,
  Zap,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { supabase } from '../supabaseClient';

const PLANS = {
  monthly: {
    name: 'Monthly',
    priceLabel: 'N3,000',
    priceNum: 3000,
    period: 'per month',
    savings: null,
    badge: null,
  },
  yearly: {
    name: 'Yearly',
    priceLabel: 'N30,000',
    priceNum: 30000,
    period: 'per year',
    savings: 'Save N6,000',
    badge: 'Best Value',
  },
};

const PREMIUM_HIGHLIGHTS = [
  {
    icon: Shield,
    title: 'Visible trust badge',
    body: 'Your verified badge appears on your product surfaces and seller presence across the app.',
    highlight: true,
  },
  {
    icon: Star,
    title: 'Premium seller insights',
    body: 'Open the dedicated premium analytics workspace reserved for verified sellers.',
  },
  {
    icon: Users,
    title: 'Clearer buyer trust signal',
    body: 'Verification helps buyers recognize that your store has verified seller status.',
  },
  {
    icon: Zap,
    title: 'Cleaner premium experience',
    body: 'Keep your seller experience aligned with the verified-only tools already available in the app.',
  },
  {
    icon: Clock,
    title: 'Flexible billing',
    body: 'Choose a monthly or yearly plan depending on how you prefer to manage verification access.',
  },
  {
    icon: CheckCircle,
    title: 'Receipt and plan record',
    body: 'Keep a downloadable record of your payment and verification period for future reference.',
  },
];

const PREMIUM_PILLARS = [
  { stat: 'Badge', label: 'Visible trust signal' },
  { stat: 'Insights', label: 'Premium seller workspace' },
  { stat: 'Flexible', label: 'Monthly or yearly billing' },
];

const PLAN_NOTES = [
  {
    title: 'Trust first',
    subtitle: 'Visible on your product surfaces',
    body: 'The current verification flow is mainly about giving your store a cleaner trust signal and a more intentional seller presence.',
  },
  {
    title: 'Premium tools',
    subtitle: 'Available inside the app today',
    body: 'The biggest unlock right now is the premium seller insights experience designed specifically for verified accounts.',
  },
];

const GUIDELINES = [
  {
    title: 'Accurate product information',
    description: 'Keep product descriptions, images, prices, and stock information current.',
  },
  {
    title: 'Reliable order handling',
    description: 'Use the seller order flow consistently and keep buyers updated on fulfillment progress.',
  },
  {
    title: 'Professional communication',
    description: 'Maintain clear and respectful communication in every supported channel.',
  },
  {
    title: 'Store quality',
    description: 'Present listings clearly and keep your catalog aligned with what you can actually deliver.',
  },
  {
    title: 'Consistent follow-through',
    description: 'Honor delivery or pickup expectations and resolve issues through the supported platform flows.',
  },
  {
    title: 'Seller accountability',
    description: 'Treat verified status as an ongoing standard, not just a one-time purchase.',
  },
];

function formatCardNumber(value) {
  const numbers = value.replace(/\D/g, '');
  const groups = numbers.match(/.{1,4}/g);
  return groups ? groups.join(' ').slice(0, 19) : numbers;
}

function formatExpiryDate(value) {
  const numbers = value.replace(/\D/g, '');

  if (numbers.length >= 2) {
    return `${numbers.slice(0, 2)}/${numbers.slice(2, 4)}`;
  }

  return numbers;
}

export default function VerificationSubscription() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState('monthly');
  const [showCheckout, setShowCheckout] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [paymentData, setPaymentData] = useState({
    cardNumber: '',
    cardName: '',
    expiryDate: '',
    cvv: '',
  });

  useEffect(() => {
    const storedUser = localStorage.getItem('mafdesh_user');

    if (!storedUser) {
      alert('Please log in to access this page.');
      navigate('/login');
      return;
    }

    const userData = JSON.parse(storedUser);

    if (userData.role !== 'seller') {
      alert('Access denied. Only sellers can subscribe for verification.');
      navigate('/login');
      return;
    }

    setCurrentUser(userData);
  }, [navigate]);

  const handleInputChange = (field, value) => {
    if (field === 'cardNumber') {
      setPaymentData((current) => ({ ...current, [field]: formatCardNumber(value) }));
      return;
    }

    if (field === 'expiryDate') {
      setPaymentData((current) => ({ ...current, [field]: formatExpiryDate(value) }));
      return;
    }

    if (field === 'cvv') {
      setPaymentData((current) => ({ ...current, [field]: value.replace(/\D/g, '').slice(0, 3) }));
      return;
    }

    setPaymentData((current) => ({ ...current, [field]: value }));
  };

  const isFormValid = () => {
    return (
      paymentData.cardNumber.replace(/\s/g, '').length === 16 &&
      paymentData.cardName.trim().length > 0 &&
      paymentData.expiryDate.length === 5 &&
      paymentData.cvv.length === 3
    );
  };

  const downloadReceipt = (receiptData) => {
    const receiptText = `
=======================================
          MAFDESH MARKETPLACE
      VERIFICATION PAYMENT RECEIPT
=======================================

Payment ID: ${receiptData.paymentId}
Reference: ${receiptData.reference}

SELLER INFORMATION
Name: ${receiptData.sellerName}
Business: ${receiptData.businessName}
Email: ${receiptData.email}

SUBSCRIPTION DETAILS
Plan: ${receiptData.planType === 'monthly' ? 'Monthly' : 'Yearly'} Verification
Amount Paid: N${receiptData.amount.toLocaleString()}
Payment Date: ${new Date(receiptData.date).toLocaleString()}
Valid Until: ${new Date(receiptData.expiresAt).toLocaleDateString()}

STATUS: PAID

This receipt confirms your payment for Mafdesh Verified Seller status.
Current benefits include:
- Orange verification badge on your products
- Premium seller insights dashboard
- Cleaner verified seller presentation across the app
- Receipt and subscription record for this plan

Thank you for choosing Mafdesh!

=======================================
For support: support@mafdesh.com
Website: www.mafdesh.com
=======================================
    `;

    const blob = new Blob([receiptText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Mafdesh-Receipt-${receiptData.reference}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const handlePayment = async () => {
    if (!isFormValid()) {
      alert('Please fill in all payment details correctly.');
      return;
    }

    if (!currentUser) {
      alert('Error: User information not found. Please try again.');
      return;
    }

    setProcessing(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const reference = `MAFDESH_VER_${Date.now()}`;
      const expiresAt = new Date();

      if (selectedPlan === 'yearly') {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      } else {
        expiresAt.setMonth(expiresAt.getMonth() + 1);
      }

      const { error: updateError } = await supabase
        .from('users')
        .update({
          is_verified: true,
          verification_expiry: expiresAt.toISOString(),
        })
        .eq('id', currentUser.id);

      if (updateError) {
        throw updateError;
      }

      const { error: paymentRecordError } = await supabase.from('verification_payments').insert({
        seller_id: currentUser.id,
        plan_type: selectedPlan,
        amount: PLANS[selectedPlan].priceNum,
        payment_reference: reference,
        payment_status: 'successful',
        expires_at: expiresAt.toISOString(),
      });

      if (paymentRecordError) {
        console.warn('Could not record verification payment:', paymentRecordError);
      }

      const updatedUser = { ...currentUser, is_verified: true };
      localStorage.setItem('mafdesh_user', JSON.stringify(updatedUser));
      setCurrentUser(updatedUser);

      const receiptData = {
        paymentId: `PAY-${Math.random().toString(36).slice(2, 11).toUpperCase()}`,
        reference,
        sellerName: currentUser.full_name || currentUser.business_name || 'Seller',
        businessName: currentUser.business_name || 'N/A',
        email: currentUser.email,
        planType: selectedPlan,
        amount: PLANS[selectedPlan].priceNum,
        date: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
      };

      setReceipt(receiptData);
      downloadReceipt(receiptData);
      setShowSuccess(true);
    } catch (error) {
      console.error('Payment error:', error);
      alert('Payment simulation failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleSuccessClose = () => {
    navigate('/seller/dashboard');
  };

  if (showSuccess) {
    return (
      <div className="min-h-screen flex flex-col bg-[radial-gradient(circle_at_top,_rgba(30,64,175,0.12),_transparent_30%),linear-gradient(180deg,_#eff6ff_0%,_#ffffff_50%,_#fff7ed_100%)]">
        <Navbar />

        <div className="flex-1 px-4 py-12 flex items-center justify-center">
          <div className="max-w-2xl w-full">
            <div className="bg-white rounded-[32px] p-10 border border-orange-200 shadow-xl text-center">
              <div className="w-24 h-24 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-16 h-16 text-orange-500" />
              </div>

              <h1 className="text-4xl font-extrabold text-blue-900 mb-4">Payment Successful</h1>

              <p className="text-xl text-blue-700 mb-8">
                Your {PLANS[selectedPlan].name} premium seller subscription is now active
              </p>

              <div className="bg-orange-50 border border-orange-200 rounded-3xl p-6 mb-8">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <Shield className="w-8 h-8 text-orange-500" />
                  <span className="text-2xl font-bold text-orange-600">Verified Seller</span>
                </div>
                <p className="text-blue-700">
                  Your verification badge and premium seller access are now active on your account.
                </p>
              </div>

              <div className="space-y-3 mb-8 text-left bg-blue-50 p-6 rounded-3xl">
                <h2 className="font-bold text-blue-900 mb-3">What happens next</h2>
                {[
                  'Your verification badge appears on your product surfaces',
                  'Your account can now open the premium seller insights workspace',
                  'Your plan receipt is ready to download whenever you need it',
                  'You can return to your seller dashboard and keep managing your store',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
                    <p className="text-blue-900">{item}</p>
                  </div>
                ))}
              </div>

              {receipt && (
                <button
                  onClick={() => downloadReceipt(receipt)}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded-2xl transition-all shadow-md text-lg mb-4 flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  Download Receipt
                </button>
              )}

              <button
                onClick={handleSuccessClose}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-4 px-8 rounded-2xl transition-all shadow-md text-lg"
              >
                Go to Dashboard
              </button>

              <p className="text-sm text-blue-600 mt-4">
                Next billing date:{' '}
                {new Date(
                  Date.now() + (selectedPlan === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000
                ).toLocaleDateString()}
              </p>
              <p className="text-xs text-blue-500 mt-2">
                Receipt downloaded automatically and saved in your downloads folder
              </p>
            </div>
          </div>
        </div>

        <Footer />
      </div>
    );
  }

  if (showCheckout) {
    return (
      <div className="min-h-screen flex flex-col bg-[radial-gradient(circle_at_top,_rgba(30,64,175,0.12),_transparent_30%),linear-gradient(180deg,_#eff6ff_0%,_#ffffff_50%,_#fff7ed_100%)]">
        <Navbar />

        <div className="flex-1 px-4 py-6 max-w-5xl mx-auto w-full">
          <button
            onClick={() => setShowCheckout(false)}
            className="flex items-center gap-2 text-blue-700 hover:text-blue-900 mb-6 font-semibold transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Plans
          </button>

          <div className="bg-orange-50 border border-orange-300 rounded-3xl p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-orange-900">
                <span className="font-bold">MVP payment flow:</span> This checkout mirrors the current
                verification experience while full processor integration is still being refined. Use test
                card `4242 4242 4242 4242`, any future date, and any CVV.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3">
              <div className="bg-white rounded-[32px] p-8 border border-blue-200 shadow-lg">
                <div className="flex items-center gap-2 mb-6">
                  <CreditCard className="w-6 h-6 text-orange-500" />
                  <h2 className="text-2xl font-bold text-blue-900">Payment Details</h2>
                </div>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="verification-card-number" className="block text-sm font-semibold text-blue-900 mb-2">
                      Card Number
                    </label>
                    <input
                      id="verification-card-number"
                      type="text"
                      placeholder="1234 5678 9012 3456"
                      value={paymentData.cardNumber}
                      onChange={(event) => handleInputChange('cardNumber', event.target.value)}
                      className="w-full px-4 py-3 border border-blue-200 rounded-2xl focus:border-orange-500 focus:outline-none text-blue-900"
                      maxLength="19"
                    />
                  </div>

                  <div>
                    <label htmlFor="verification-card-name" className="block text-sm font-semibold text-blue-900 mb-2">
                      Cardholder Name
                    </label>
                    <input
                      id="verification-card-name"
                      type="text"
                      placeholder="JOHN DOE"
                      value={paymentData.cardName}
                      onChange={(event) => handleInputChange('cardName', event.target.value.toUpperCase())}
                      className="w-full px-4 py-3 border border-blue-200 rounded-2xl focus:border-orange-500 focus:outline-none text-blue-900"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="verification-expiry-date" className="block text-sm font-semibold text-blue-900 mb-2">
                        Expiry Date
                      </label>
                      <input
                        id="verification-expiry-date"
                        type="text"
                        placeholder="MM/YY"
                        value={paymentData.expiryDate}
                        onChange={(event) => handleInputChange('expiryDate', event.target.value)}
                        className="w-full px-4 py-3 border border-blue-200 rounded-2xl focus:border-orange-500 focus:outline-none text-blue-900"
                        maxLength="5"
                      />
                    </div>
                    <div>
                      <label htmlFor="verification-cvv" className="block text-sm font-semibold text-blue-900 mb-2">
                        CVV
                      </label>
                      <input
                        id="verification-cvv"
                        type="text"
                        placeholder="123"
                        value={paymentData.cvv}
                        onChange={(event) => handleInputChange('cvv', event.target.value)}
                        className="w-full px-4 py-3 border border-blue-200 rounded-2xl focus:border-orange-500 focus:outline-none text-blue-900"
                        maxLength="3"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-4 text-sm text-blue-700">
                    <Lock className="w-4 h-4" />
                    <span>Secure checkout experience for the current MVP flow</span>
                  </div>
                </div>

                <button
                  onClick={handlePayment}
                  disabled={processing || !isFormValid()}
                  className="w-full mt-6 bg-orange-500 hover:bg-orange-600 text-white font-bold py-4 rounded-2xl transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Processing Payment...
                    </span>
                  ) : (
                    `Pay ${PLANS[selectedPlan].priceLabel}`
                  )}
                </button>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="bg-white rounded-[32px] p-6 border border-blue-200 shadow-lg sticky top-6">
                <h3 className="text-lg font-bold text-blue-900 mb-4">Order Summary</h3>

                <div className="space-y-3 mb-4 pb-4 border-b border-blue-100">
                  <div className="flex items-center justify-between">
                    <span className="text-blue-700">Plan</span>
                    <span className="font-semibold text-blue-900">{PLANS[selectedPlan].name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-blue-700">Billing</span>
                    <span className="font-semibold text-blue-900">{PLANS[selectedPlan].period}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xl font-bold mb-6">
                  <span className="text-blue-900">Total</span>
                  <span className="text-orange-500">{PLANS[selectedPlan].priceLabel}</span>
                </div>

                <div className="bg-blue-50 p-4 rounded-3xl">
                  <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-orange-500" />
                    Included today
                  </h4>
                  <ul className="space-y-2">
                    {PREMIUM_HIGHLIGHTS.slice(0, 4).map((item) => (
                      <li key={item.title} className="text-sm text-blue-700 flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                        <span>{item.title}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-blue-600 mt-3">
                    Premium seller tools will keep expanding as the product matures.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[radial-gradient(circle_at_top,_rgba(30,64,175,0.12),_transparent_30%),linear-gradient(180deg,_#eff6ff_0%,_#ffffff_50%,_#fff7ed_100%)]">
      <Navbar />

      <div className="flex-1 px-4 py-6 max-w-6xl mx-auto w-full">
        <button
          onClick={() => navigate('/seller/dashboard')}
          className="flex items-center gap-2 text-blue-700 hover:text-blue-900 mb-6 font-semibold transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Dashboard
        </button>

        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white px-6 py-2 rounded-full mb-4 shadow-lg">
            <Zap className="w-5 h-5" />
            <span className="font-bold">Premium seller access starts at {PLANS.monthly.priceLabel}</span>
          </div>
          <h1 className="text-5xl font-extrabold text-blue-900 mb-3">
            Verification with a cleaner premium seller experience
          </h1>
          <p className="text-2xl text-blue-700 mb-2">
            Add a visible trust badge and unlock the premium seller workspace.
          </p>
          <p className="text-lg text-orange-600 font-semibold">
            Built for the current MVP: verification, receipts, and premium seller tools.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10 max-w-4xl mx-auto">
          {PREMIUM_PILLARS.map((item) => (
            <div key={item.stat} className="bg-white rounded-3xl p-6 border border-orange-200 shadow-sm text-center">
              <p className="text-3xl font-extrabold text-orange-500 mb-1">{item.stat}</p>
              <p className="text-sm text-blue-700 font-semibold">{item.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
          <div className="bg-white rounded-[32px] p-8 border border-orange-300 shadow-xl">
            <h2 className="text-2xl font-bold text-blue-900 mb-6 flex items-center gap-2">
              <Shield className="w-7 h-7 text-orange-500" />
              Choose Your Plan
            </h2>

            <div className="space-y-4 mb-6">
              {Object.entries(PLANS).map(([key, plan]) => (
                <div
                  key={key}
                  onClick={() => setSelectedPlan(key)}
                  className={`p-5 rounded-3xl border cursor-pointer transition-all relative ${
                    selectedPlan === key
                      ? 'border-orange-500 bg-orange-50 shadow-lg scale-[1.02]'
                      : 'border-blue-200 hover:border-blue-300 bg-white'
                  }`}
                >
                  {plan.badge && (
                    <div className="absolute -top-3 right-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow-md">
                      {plan.badge}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-blue-900 text-xl">{plan.name}</h3>
                      <p className="text-sm text-blue-600">{plan.period}</p>
                      {plan.savings && (
                        <p className="text-sm text-orange-600 font-bold mt-1 flex items-center gap-1">
                          <Zap className="w-4 h-4" />
                          {plan.savings}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-4xl font-extrabold text-orange-500">{plan.priceLabel}</p>
                      <p className="text-xs text-blue-600">Flexible verification billing</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowCheckout(true)}
              className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold py-5 rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2 text-lg"
            >
              <CreditCard className="w-6 h-6" />
              Get Verified Now - {PLANS[selectedPlan].priceLabel}
            </button>

            <div className="mt-4 flex items-center justify-center gap-4 text-xs text-blue-600">
              <div className="flex items-center gap-1">
                <Lock className="w-3 h-3" />
                <span>Secure payment flow</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>Manage monthly or yearly access</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[32px] p-8 border border-blue-200 shadow-lg">
            <h2 className="text-2xl font-bold text-blue-900 mb-6">What premium seller access includes</h2>

            <div className="space-y-4 mb-6">
              {PREMIUM_HIGHLIGHTS.map((item) => {
                const Icon = item.icon;

                return (
                  <div
                    key={item.title}
                    className={`flex items-start gap-3 p-4 rounded-2xl ${
                      item.highlight ? 'bg-orange-50 border-l-4 border-orange-500' : 'bg-slate-50'
                    }`}
                  >
                    <Icon className="w-6 h-6 text-orange-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className={`font-semibold ${item.highlight ? 'text-blue-900' : 'text-blue-800'}`}>
                        {item.title}
                      </p>
                      <p className="text-sm text-blue-700 mt-1">{item.body}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-gradient-to-r from-blue-900 to-blue-800 p-6 rounded-3xl text-white">
              <div className="flex items-start gap-3">
                <Star className="w-6 h-6 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-bold text-lg mb-2">What the plan focuses on right now</h3>
                  <p className="text-sm text-blue-100 mb-3">
                    The current verification experience is centered on a clear trust badge, a polished premium seller workspace, and a straightforward billing flow that fits the MVP.
                  </p>
                  <p className="text-xs text-blue-200 italic">
                    Use this page as the seller-facing home for verification and premium access.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-10 bg-white rounded-[32px] p-8 border border-blue-200 shadow-lg">
          <h2 className="text-2xl font-bold text-blue-900 mb-6 text-center">What this plan unlocks today</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {PLAN_NOTES.map((note) => (
              <div key={note.title} className="bg-blue-50 p-6 rounded-3xl border-l-4 border-orange-500">
                <p className="text-blue-900 mb-3 italic">"{note.body}"</p>
                <div>
                  <p className="font-bold text-blue-900">{note.title}</p>
                  <p className="text-sm text-blue-600">{note.subtitle}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-[32px] p-8 border border-blue-200 shadow-lg mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-6 h-6 text-orange-500" />
            <h2 className="text-2xl font-bold text-blue-900">Verification Guidelines</h2>
          </div>
          <p className="text-sm text-blue-700 mb-6">
            To maintain your verification badge, keep your seller account aligned with these standards:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {GUIDELINES.map((guideline) => (
              <div key={guideline.title} className="border-l-4 border-orange-500 pl-4 py-2">
                <h3 className="font-semibold text-blue-900">{guideline.title}</h3>
                <p className="text-sm text-blue-700">{guideline.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center bg-gradient-to-r from-orange-500 to-orange-600 rounded-[32px] p-8 text-white shadow-xl">
          <h2 className="text-3xl font-extrabold mb-3">Step into the premium seller experience</h2>
          <p className="text-xl mb-6">
            Verification keeps your seller presence polished and gives you access to the premium tools already available in the app.
          </p>
          <button
            onClick={() => setShowCheckout(true)}
            className="bg-white text-orange-600 font-bold py-4 px-8 rounded-2xl hover:bg-blue-50 transition-all shadow-lg text-lg"
          >
            Get Your Verification Badge Now - {PLANS.monthly.priceLabel}
          </button>
          <p className="text-sm mt-4 text-orange-100">
            Monthly and yearly plans are available from this page
          </p>
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-blue-600">
            Questions?{' '}
            <a href="/support" className="text-orange-500 hover:text-orange-600 font-semibold">
              Contact Support
            </a>
          </p>
        </div>
      </div>

      <Footer />
    </div>
  );
}
