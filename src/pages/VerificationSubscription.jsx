import React from 'react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Shield, TrendingUp, Star, ArrowLeft, CreditCard, Lock, AlertCircle, Zap, Users, Award, Clock, Download } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { supabase } from '../supabaseClient';


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
    cvv: ''
  });

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
        alert('Access denied. Only sellers can subscribe for verification.');
        navigate('/login');
        return;
      }

      setCurrentUser(userData);
    };

    checkAuth();
  }, [navigate]);

  const plans = {
    monthly: {
      name: 'Monthly',
      price: '₦3,000',
      priceNum: 3000,
      period: 'per month',
      savings: null,
      badge: null
    },
    yearly: {
      name: 'Yearly',
      price: '₦30,000',
      priceNum: 30000,
      period: 'per year',
      savings: 'Save ₦6,000',
      badge: 'Best Value'
    }
  };

  const benefits = [
    { icon: Shield, text: 'Orange verification badge on all your products', highlight: true },
    { icon: TrendingUp, text: '2-3x higher visibility in search results' },
    { icon: Users, text: 'Build instant trust with buyers - 85% prefer verified sellers' },
    { icon: Zap, text: 'Priority customer support - responses within 2 hours' },
    { icon: Award, text: 'Featured in "Verified Sellers" section' },
    { icon: Star, text: 'Access to premium seller analytics dashboard' }
  ];

  const socialProof = [
    { stat: '2,847', label: 'Verified Sellers' },
    { stat: '73%', label: 'More Sales' },
    { stat: '4.8★', label: 'Average Rating' }
  ];

  const testimonials = [
    {
      name: 'Chinedu O.',
      role: 'Fashion Seller',
      text: 'Got verified 2 weeks ago. Already tripled my sales! The orange badge makes all the difference.',
      rating: 5
    },
    {
      name: 'Amina K.',
      role: 'Gadget Seller',
      text: 'Best ₦3,000 I ever spent. Buyers trust me instantly now. Worth every kobo!',
      rating: 5
    }
  ];

  const guidelines = [
    { title: 'Accurate Product Information', description: 'All product descriptions, images, and prices must be accurate and up-to-date' },
    { title: 'Timely Responses', description: 'Respond to buyer messages within 24 hours' },
    { title: 'Quality Products', description: 'Maintain high product quality standards' },
    { title: 'Honest Communication', description: 'No misleading claims or false advertising' },
    { title: 'Professional Conduct', description: 'Maintain professional and courteous communication' },
    { title: 'Delivery Commitments', description: 'Honor delivery timelines and pickup arrangements' }
  ];

  const formatCardNumber = (value) => {
    const numbers = value.replace(/\D/g, '');
    const groups = numbers.match(/.{1,4}/g);
    return groups ? groups.join(' ').substr(0, 19) : numbers;
  };

  const formatExpiryDate = (value) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length >= 2) {
      return numbers.substr(0, 2) + '/' + numbers.substr(2, 2);
    }
    return numbers;
  };

  const handleInputChange = (field, value) => {
    if (field === 'cardNumber') {
      setPaymentData({ ...paymentData, [field]: formatCardNumber(value) });
    } else if (field === 'expiryDate') {
      setPaymentData({ ...paymentData, [field]: formatExpiryDate(value) });
    } else if (field === 'cvv') {
      setPaymentData({ ...paymentData, [field]: value.replace(/\D/g, '').substr(0, 3) });
    } else {
      setPaymentData({ ...paymentData, [field]: value });
    }
  };

  const isFormValid = () => {
    return (
      paymentData.cardNumber.replace(/\s/g, '').length === 16 &&
      paymentData.cardName.length > 0 &&
      paymentData.expiryDate.length === 5 &&
      paymentData.cvv.length === 3
    );
  };

  const downloadReceipt = (receiptData) => {
    const receiptText = `
═══════════════════════════════════════
          MAFDESH MARKETPLACE
        VERIFICATION PAYMENT RECEIPT
═══════════════════════════════════════

Payment ID: ${receiptData.paymentId}
Reference: ${receiptData.reference}

SELLER INFORMATION
Name: ${receiptData.sellerName}
Business: ${receiptData.businessName}
Email: ${receiptData.email}

SUBSCRIPTION DETAILS
Plan: ${receiptData.planType === 'monthly' ? 'Monthly' : 'Yearly'} Verification
Amount Paid: ₦${receiptData.amount.toLocaleString()}
Payment Date: ${new Date(receiptData.date).toLocaleString()}
Valid Until: ${new Date(receiptData.expiresAt).toLocaleDateString()}

STATUS: PAID ✓

This receipt confirms your payment for Mafdesh 
Verified Seller status. You now have access to:
• Orange verification badge on all products
• 2-3x higher visibility in search results
• Featured in "Verified Sellers" section
• Priority customer support (2-hour response)
• Premium seller analytics dashboard

Thank you for choosing Mafdesh!

═══════════════════════════════════════
For support: support@mafdesh.com
Website: www.mafdesh.com
═══════════════════════════════════════
    `;

    const blob = new Blob([receiptText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Mafdesh-Receipt-${receiptData.reference}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
    // Simulate payment processing delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Generate a fake reference and receipt data
    const reference = `MAFDESH_VER_${Date.now()}`;
    const expiresAt = new Date();
    if (selectedPlan === 'yearly') {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    } else {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    }

    // Update the users table to mark as verified
    const { error: updateError } = await supabase
      .from('users')
      .update({
        is_verified: true,
        verification_expiry: expiresAt.toISOString()
      })
      .eq('id', currentUser.id);

    if (updateError) throw updateError;

    // Optionally record the payment in verification_payments table
    await supabase.from('verification_payments').insert({
      seller_id: currentUser.id,
      plan_type: selectedPlan,
      amount: plans[selectedPlan].priceNum,
      payment_reference: reference,
      payment_status: 'successful',
      expires_at: expiresAt.toISOString()
    });

    // Update local storage
    const updatedUser = { ...currentUser, is_verified: true };
    localStorage.setItem('mafdesh_user', JSON.stringify(updatedUser));
    setCurrentUser(updatedUser);

    // Prepare receipt data
    const receiptData = {
      paymentId: 'PAY-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      reference: reference,
      sellerName: currentUser.full_name || currentUser.business_name || 'Seller',
      businessName: currentUser.business_name || 'N/A',
      email: currentUser.email,
      planType: selectedPlan,
      amount: plans[selectedPlan].priceNum,
      date: new Date().toISOString(),
      expiresAt: expiresAt.toISOString()
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
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-50 to-white">
        <Navbar />
        
        <div className="flex-1 px-4 py-12 flex items-center justify-center">
          <div className="max-w-2xl w-full">
            <div className="bg-white rounded-2xl p-12 border-2 border-orange-200 shadow-2xl text-center">
              <div className="w-24 h-24 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-16 h-16 text-orange-500" />
              </div>
              
              <h1 className="text-4xl font-extrabold text-blue-900 mb-4">
                🎉 Payment Successful!
              </h1>
              
              <p className="text-xl text-blue-700 mb-8">
                Your {plans[selectedPlan].name} verification subscription is now active
              </p>
              
              <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-6 mb-8">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <Shield className="w-8 h-8 text-orange-500" />
                  <span className="text-2xl font-bold text-orange-600">Verified Seller ✓</span>
                </div>
                <p className="text-blue-700">
                  Your orange verification badge is now live on all your products!
                </p>
              </div>
              
              <div className="space-y-3 mb-8 text-left bg-blue-50 p-6 rounded-lg">
                <h3 className="font-bold text-blue-900 mb-3">What happens next:</h3>
                {[
                  '✓ Your verification badge appears immediately on all products',
                  '✓ Buyers will see you as a trusted verified seller',
                  '✓ Your products get 2-3x higher visibility in search results',
                  '✓ You now have access to priority support and analytics'
                ].map((item, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
                    <p className="text-blue-900">{item}</p>
                  </div>
                ))}
              </div>
              
              {receipt && (
                <button
                  onClick={() => downloadReceipt(receipt)}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded-lg transition-all shadow-md text-lg mb-4 flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  Download Receipt
                </button>
              )}
              
              <button
                onClick={handleSuccessClose}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-4 px-8 rounded-lg transition-all shadow-md text-lg"
              >
                Go to Dashboard
              </button>
              
              <p className="text-sm text-blue-600 mt-4">
                Next billing date: {new Date(Date.now() + (selectedPlan === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000).toLocaleDateString()}
              </p>
              <p className="text-xs text-blue-500 mt-2">
                ✓ Receipt downloaded automatically • Saved in your downloads folder
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
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-50 to-white">
        <Navbar />
        
        <div className="flex-1 px-4 py-6 max-w-4xl mx-auto w-full">
          <button
            onClick={() => setShowCheckout(false)}
            className="flex items-center gap-2 text-blue-700 hover:text-blue-900 mb-6 font-semibold transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Plans
          </button>

          <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-orange-900">
                <span className="font-bold">Demo Mode:</span> This is a demonstration payment interface. 
                For production use, we recommend integrating with <span className="font-bold">Paystack</span> (Nigeria's leading payment processor) for seamless Naira payments.
                Use test card: 4242 4242 4242 4242, any future date, any CVV.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3">
              <div className="bg-white rounded-xl p-8 border-2 border-blue-200 shadow-lg">
                <div className="flex items-center gap-2 mb-6">
                  <CreditCard className="w-6 h-6 text-orange-500" />
                  <h2 className="text-2xl font-bold text-blue-900">Payment Details</h2>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-blue-900 mb-2">
                      Card Number
                    </label>
                    <input
                      type="text"
                      placeholder="1234 5678 9012 3456"
                      value={paymentData.cardNumber}
                      onChange={(e) => handleInputChange('cardNumber', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-blue-200 rounded-lg focus:border-orange-500 focus:outline-none text-blue-900"
                      maxLength="19"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-blue-900 mb-2">
                      Cardholder Name
                    </label>
                    <input
                      type="text"
                      placeholder="JOHN DOE"
                      value={paymentData.cardName}
                      onChange={(e) => handleInputChange('cardName', e.target.value.toUpperCase())}
                      className="w-full px-4 py-3 border-2 border-blue-200 rounded-lg focus:border-orange-500 focus:outline-none text-blue-900"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-blue-900 mb-2">
                        Expiry Date
                      </label>
                      <input
                        type="text"
                        placeholder="MM/YY"
                        value={paymentData.expiryDate}
                        onChange={(e) => handleInputChange('expiryDate', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-blue-200 rounded-lg focus:border-orange-500 focus:outline-none text-blue-900"
                        maxLength="5"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-blue-900 mb-2">
                        CVV
                      </label>
                      <input
                        type="text"
                        placeholder="123"
                        value={paymentData.cvv}
                        onChange={(e) => handleInputChange('cvv', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-blue-200 rounded-lg focus:border-orange-500 focus:outline-none text-blue-900"
                        maxLength="3"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-4 text-sm text-blue-700">
                    <Lock className="w-4 h-4" />
                    <span>Secured by Paystack • SSL Encrypted</span>
                  </div>
                </div>

                <button
                  onClick={handlePayment}
                  disabled={processing || !isFormValid()}
                  className="w-full mt-6 bg-orange-500 hover:bg-orange-600 text-white font-bold py-4 rounded-lg transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Processing Payment...
                    </span>
                  ) : (
                    `Pay ${plans[selectedPlan].price}`
                  )}
                </button>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl p-6 border-2 border-blue-200 shadow-lg sticky top-6">
                <h3 className="text-lg font-bold text-blue-900 mb-4">Order Summary</h3>
                
                <div className="space-y-3 mb-4 pb-4 border-b-2 border-blue-100">
                  <div className="flex items-center justify-between">
                    <span className="text-blue-700">Plan</span>
                    <span className="font-semibold text-blue-900">{plans[selectedPlan].name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-blue-700">Billing</span>
                    <span className="font-semibold text-blue-900">{plans[selectedPlan].period}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xl font-bold mb-6">
                  <span className="text-blue-900">Total</span>
                  <span className="text-orange-500">{plans[selectedPlan].price}</span>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-orange-500" />
                    Included Benefits
                  </h4>
                  <ul className="space-y-2">
                    {benefits.slice(0, 4).map((benefit, index) => (
                      <li key={index} className="text-sm text-blue-700 flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                        <span>{benefit.text}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-blue-600 mt-3">
                    +{benefits.length - 4} more benefits
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
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-50 to-white">
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
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white px-6 py-2 rounded-full mb-4 shadow-lg animate-pulse">
            <Zap className="w-5 h-5" />
            <span className="font-bold">Limited Time: Just ₦3,000/month!</span>
          </div>
          <h1 className="text-5xl font-extrabold text-blue-900 mb-3">
            Join 2,800+ Verified Sellers
          </h1>
          <p className="text-2xl text-blue-700 mb-2">
            Stand out. Sell more. Build trust instantly.
          </p>
          <p className="text-lg text-orange-600 font-semibold">
            Verified sellers earn 73% more sales on average 📈
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-10 max-w-3xl mx-auto">
          {socialProof.map((item, index) => (
            <div key={index} className="bg-white rounded-xl p-6 border-2 border-orange-200 shadow-lg text-center">
              <p className="text-4xl font-extrabold text-orange-500 mb-1">{item.stat}</p>
              <p className="text-sm text-blue-700 font-semibold">{item.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
          <div className="bg-white rounded-xl p-8 border-2 border-orange-300 shadow-xl">
            <h2 className="text-2xl font-bold text-blue-900 mb-6 flex items-center gap-2">
              <Shield className="w-7 h-7 text-orange-500" />
              Choose Your Plan
            </h2>
            
            <div className="space-y-4 mb-6">
              {Object.entries(plans).map(([key, plan]) => (
                <div
                  key={key}
                  onClick={() => setSelectedPlan(key)}
                  className={`p-5 rounded-lg border-2 cursor-pointer transition-all relative ${
                    selectedPlan === key
                      ? 'border-orange-500 bg-orange-50 shadow-lg scale-105'
                      : 'border-blue-200 hover:border-blue-300'
                  }`}
                >
                  {plan.badge && (
                    <div className="absolute -top-3 right-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow-md">
                      {plan.badge}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
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
                      <p className="text-4xl font-extrabold text-orange-500">{plan.price}</p>
                      <p className="text-xs text-blue-600">Less than ₦100/day!</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowCheckout(true)}
              className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold py-5 rounded-lg transition-all shadow-lg flex items-center justify-center gap-2 text-lg"
            >
              <CreditCard className="w-6 h-6" />
              Get Verified Now - Only {plans[selectedPlan].price}
            </button>

            <div className="mt-4 flex items-center justify-center gap-4 text-xs text-blue-600">
              <div className="flex items-center gap-1">
                <Lock className="w-3 h-3" />
                <span>Secure Payment</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>Cancel Anytime</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-8 border-2 border-blue-200 shadow-lg">
            <h2 className="text-2xl font-bold text-blue-900 mb-6">Why Get Verified?</h2>
            
            <div className="space-y-4 mb-6">
              {benefits.map((benefit, index) => (
                <div key={index} className={`flex items-start gap-3 p-3 rounded-lg ${benefit.highlight ? 'bg-orange-50 border-l-4 border-orange-500' : ''}`}>
                  <benefit.icon className="w-6 h-6 text-orange-500 mt-0.5 flex-shrink-0" />
                  <p className={`${benefit.highlight ? 'font-bold text-blue-900' : 'text-blue-800'}`}>{benefit.text}</p>
                </div>
              ))}
            </div>

            <div className="bg-gradient-to-r from-blue-900 to-blue-800 p-6 rounded-lg text-white">
              <div className="flex items-start gap-3">
                <TrendingUp className="w-6 h-6 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-bold text-lg mb-2">Real Results From Real Sellers</h3>
                  <p className="text-sm text-blue-100 mb-3">
                    Verified sellers see <span className="font-bold text-orange-300">73% more sales</span>, 
                    <span className="font-bold text-orange-300"> 3x more buyer engagement</span>, and 
                    <span className="font-bold text-orange-300"> 2-3x higher search visibility</span>.
                  </p>
                  <p className="text-xs text-blue-200 italic">
                    "The orange badge paid for itself in the first week!" - Verified Seller
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-10 bg-white rounded-xl p-8 border-2 border-blue-200 shadow-lg">
          <h2 className="text-2xl font-bold text-blue-900 mb-6 text-center">What Other Sellers Are Saying</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {testimonials.map((testimonial, index) => (
              <div key={index} className="bg-blue-50 p-6 rounded-lg border-l-4 border-orange-500">
                <div className="flex items-center gap-1 mb-3">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 text-orange-500 fill-orange-500" />
                  ))}
                </div>
                <p className="text-blue-900 mb-3 italic">"{testimonial.text}"</p>
                <div>
                  <p className="font-bold text-blue-900">{testimonial.name}</p>
                  <p className="text-sm text-blue-600">{testimonial.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl p-8 border-2 border-blue-200 shadow-lg mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-6 h-6 text-orange-500" />
            <h2 className="text-2xl font-bold text-blue-900">Verification Guidelines</h2>
          </div>
          <p className="text-sm text-blue-700 mb-6">
            To maintain your verification badge, please adhere to these standards:
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {guidelines.map((guideline, index) => (
              <div key={index} className="border-l-4 border-orange-500 pl-4 py-2">
                <h3 className="font-semibold text-blue-900">{guideline.title}</h3>
                <p className="text-sm text-blue-700">{guideline.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl p-8 text-white shadow-xl">
          <h2 className="text-3xl font-extrabold mb-3">Don't Let Competitors Win</h2>
          <p className="text-xl mb-6">
            Every day without verification is a day your competitors are selling more than you.
          </p>
          <button
            onClick={() => setShowCheckout(true)}
            className="bg-white text-orange-600 font-bold py-4 px-8 rounded-lg hover:bg-blue-50 transition-all shadow-lg text-lg"
          >
            Get Your Verification Badge Now - ₦3,000
          </button>
          <p className="text-sm mt-4 text-orange-100">
            Join 2,800+ successful verified sellers today
          </p>
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-blue-600">
            Questions? <a href="/support" className="text-orange-500 hover:text-orange-600 font-semibold">Contact Support</a>
          </p>
        </div>
      </div>

      <Footer />
    </div>
  );
}