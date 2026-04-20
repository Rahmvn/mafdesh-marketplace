import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ChevronDown,
  Clock,
  FileWarning,
  HelpCircle,
  LifeBuoy,
  Mail,
  Package,
  Paperclip,
  Search,
  Send,
  Shield,
  ShoppingCart,
  CheckCircle,
  User,
  Upload,
  Wallet,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/FooterSlim';
import { supabase } from '../supabaseClient';

const SUPPORT_EMAIL = 'support@mafdesh.com';
const SUPPORT_ATTACHMENTS_BUCKET = 'support-attachments';

const FAQS = [
  {
    id: 'order-issue',
    audience: 'all',
    category: 'Orders',
    question: 'How do I report a problem with an order?',
    answer:
      'Open the order details page and use the dispute or issue action when it is available. If the order flow does not show the action you need, contact support with the order number and a short description of the problem.',
  },
  {
    id: 'buyer-protection',
    audience: 'buyer',
    category: 'Buyer',
    question: 'What happens after I pay for an item?',
    answer:
      'Payment is held while the order is being fulfilled. You then get a confirmation or dispute window depending on the order status and delivery flow.',
  },
  {
    id: 'no-chat',
    audience: 'all',
    category: 'Messaging',
    question: 'Can buyers and sellers message each other directly in the app?',
    answer:
      'Not yet. There is no general buyer-seller chat flow in the app right now. The only in-app discussion thread currently implemented is the dispute discussion that appears after an order is marked as disputed.',
  },
  {
    id: 'dispute-thread',
    audience: 'all',
    category: 'Disputes',
    question: 'When does the dispute discussion appear?',
    answer:
      'A dispute discussion becomes available only after the order status changes to DISPUTED. That thread is where evidence and follow-up messages can be shared for the disputed order.',
  },
  {
    id: 'seller-verification',
    audience: 'seller',
    category: 'Seller',
    question: 'How do I become a verified seller?',
    answer:
      'Go to the seller verification page and subscribe to the verification plan. Verified sellers get priority support and additional trust benefits.',
  },
  {
    id: 'priority-support',
    audience: 'seller',
    category: 'Seller',
    question: 'Who gets priority support?',
    answer:
      'Verified sellers are placed in the priority queue. During business hours, those requests are handled faster than standard support requests.',
  },
  {
    id: 'payment-methods',
    audience: 'all',
    category: 'Payments',
    question: 'What payment method is currently supported?',
    answer:
      'Payments are handled through the Paystack checkout flow already built into the app. The options available to the user are shown during payment.',
  },
  {
    id: 'account-help',
    audience: 'all',
    category: 'Account',
    question: 'I cannot access my account. What should I do?',
    answer:
      'Try the password reset flow first. If that does not solve it, email support with the account email and a short note explaining whether the issue is login, verification, or profile-related.',
  },
  {
    id: 'admin-help',
    audience: 'admin',
    category: 'Admin',
    question: 'What is the fastest way for admins to investigate a transaction issue?',
    answer:
      'Start from Admin Orders or Admin Disputes, capture the order number, then review the buyer, seller, status history, and any dispute evidence already attached to the order.',
  },
];

function getQuickActions(userRole) {
  if (userRole === 'buyer') {
    return [
      { label: 'My Orders', to: '/orders', icon: Package },
      { label: 'My Cart', to: '/cart', icon: ShoppingCart },
      { label: 'My Profile', to: '/profile', icon: User },
    ];
  }

  if (userRole === 'seller') {
    return [
      { label: 'Seller Orders', to: '/seller/orders', icon: Package },
      { label: 'Payments', to: '/seller/payments', icon: Wallet },
      { label: 'Products', to: '/seller/products', icon: ShoppingCart },
    ];
  }

  if (userRole === 'admin') {
    return [
      { label: 'Admin Orders', to: '/admin/orders', icon: Package },
      { label: 'Disputes', to: '/admin/disputes', icon: AlertCircle },
      { label: 'Users', to: '/admin/users', icon: User },
    ];
  }

  return [{ label: 'My Profile', to: '/profile', icon: User }];
}

function ContactCard({ icon, title, body, actionLabel, actionHref }) {
  const Icon = icon;

  return (
    <div className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100">
        <Icon className="h-6 w-6 text-orange-600" />
      </div>
      <h3 className="mt-4 text-lg font-bold text-blue-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
      <a
        href={actionHref}
        className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-orange-600 hover:text-orange-700"
      >
        {actionLabel}
      </a>
    </div>
  );
}

function PathCard({ title, body, steps }) {
  return (
    <div className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-blue-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
      <div className="mt-5 space-y-3">
        {steps.map((step, index) => (
          <div key={step} className="flex gap-3 text-sm text-slate-700">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-950 text-xs font-bold text-white">
              {index + 1}
            </span>
            <span>{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Support() {
  const navigate = useNavigate();
  const [user] = useState(() => JSON.parse(localStorage.getItem('mafdesh_user') || '{}'));
  const [faqSearch, setFaqSearch] = useState('');
  const [issueType, setIssueType] = useState('general');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [openFaqId, setOpenFaqId] = useState('order-issue');
  const [attachments, setAttachments] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState({ type: '', message: '' });
  const [submittedTicketId, setSubmittedTicketId] = useState('');

  const userRole = user?.role || 'user';
  const isVerifiedSeller = userRole === 'seller' && user?.is_verified;
  const quickActions = useMemo(() => getQuickActions(userRole), [userRole]);

  const filteredFaqs = useMemo(() => {
    const term = faqSearch.trim().toLowerCase();

    return FAQS.filter((faq) => {
      const visibleToUser = faq.audience === 'all' || faq.audience === userRole;
      if (!visibleToUser) {
        return false;
      }

      if (!term) {
        return true;
      }

      return (
        faq.question.toLowerCase().includes(term) ||
        faq.answer.toLowerCase().includes(term) ||
        faq.category.toLowerCase().includes(term)
      );
    });
  }, [faqSearch, userRole]);

  const supportSubject =
    subject.trim() || `Mafdesh ${issueType.replaceAll('-', ' ')} support request`;
  const supportBody = encodeURIComponent(
    [
      `Role: ${userRole}`,
      `Issue type: ${issueType}`,
      user?.email ? `Account email: ${user.email}` : null,
      '',
      message.trim() || 'Please describe your issue here.',
    ]
      .filter(Boolean)
      .join('\n')
  );

  const mailtoHref = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
    supportSubject
  )}&body=${supportBody}`;

  const handleAttachmentChange = (event) => {
    const files = Array.from(event.target.files || []);
    setAttachments(files);
    setSubmitStatus({ type: '', message: '' });
  };

  const isMissingSupportBucketError = (error) => {
    const message = `${error?.message || ''}`.toLowerCase();

    return message.includes('bucket not found');
  };

  const getAuthenticatedUserId = async () => {
    const {
      data: { user: authUser },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      throw error;
    }

    return authUser?.id || null;
  };

  const uploadAttachments = async (files, ownerId) => {
    const uploadedLinks = [];

    for (const file of files) {
      const extension = file.name.split('.').pop();
      const fileName = `support_${ownerId}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}${extension ? `.${extension}` : ''}`;
      const storagePath = `${ownerId}/${fileName}`;

      const { error } = await supabase.storage
        .from(SUPPORT_ATTACHMENTS_BUCKET)
        .upload(storagePath, file);

      if (error) {
        throw error;
      }

      const { data: urlData } = supabase.storage
        .from(SUPPORT_ATTACHMENTS_BUCKET)
        .getPublicUrl(storagePath);

      uploadedLinks.push(urlData.publicUrl);
    }

    return uploadedLinks;
  };

  const handleSupportSubmit = async (event) => {
    event.preventDefault();

    if (!message.trim()) {
      setSubmitStatus({
        type: 'error',
        message: 'Please describe the issue before submitting.',
      });
      return;
    }

    setSubmitting(true);
    setSubmitStatus({ type: '', message: '' });

    try {
      const authenticatedUserId = await getAuthenticatedUserId();

      if (!authenticatedUserId) {
        throw new Error('You need to be signed in before submitting a support request.');
      }

      let attachmentLinks = [];
      let attachmentWarning = '';

      if (attachments.length > 0) {
        try {
          attachmentLinks = await uploadAttachments(attachments, authenticatedUserId);
        } catch (error) {
          if (isMissingSupportBucketError(error)) {
            console.warn('Support attachments bucket is missing. Submitting ticket without attachments.');
            attachmentWarning =
              'Your support request was submitted, but attachments could not be uploaded because file storage is not configured yet. You can email support directly if those files are important.';
          } else {
            throw error;
          }
        }
      }

      const { data: insertedTicket, error } = await supabase
        .from('support_tickets')
        .insert({
          user_id: authenticatedUserId,
          user_role: userRole,
          issue_type: issueType,
          subject: supportSubject,
          message: message.trim(),
          attachment_urls: attachmentLinks,
        })
        .select('id')
        .single();

      if (error) {
        throw error;
      }

      setSubmitStatus({
        type: 'success',
        message: attachmentWarning
          || (attachmentLinks.length > 0
            ? 'Your support request was submitted and the attachments were saved with it.'
            : 'Your support request was submitted successfully.'),
      });
      setSubmittedTicketId(insertedTicket?.id || '');
      setSubject('');
      setMessage('');
      setAttachments([]);
    } catch (error) {
      console.error('Support request error:', error);
      setSubmitStatus({
        type: 'error',
        message:
          'We could not submit your support request right now. You can still email support directly while we fix this.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,_rgba(30,64,175,0.12),_transparent_34%),linear-gradient(180deg,_#eff6ff_0%,_#ffffff_44%,_#fff7ed_100%)]">
      <Navbar />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-[32px] border border-blue-100 bg-white/90 px-6 py-8 shadow-sm sm:px-8">
          <div className="absolute -right-24 top-0 h-52 w-52 rounded-full bg-orange-100 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-40 w-40 rounded-full bg-blue-100 blur-3xl" />

          <div className="relative z-10 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                <LifeBuoy className="h-4 w-4" />
                Help and support
              </span>

              <h1 className="mt-5 max-w-3xl text-3xl font-bold tracking-tight text-blue-950 sm:text-4xl">
                Support that matches what the app actually does today
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
                Use this page to find the right route for order problems, account access,
                verification, disputes, and admin investigations. When self-serve actions run
                out, send support a request with the order number and the exact issue.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.to}
                      onClick={() => navigate(action.to)}
                      className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-5 py-3 text-sm font-semibold text-blue-900 transition hover:border-orange-300 hover:text-orange-600"
                    >
                      <Icon className="h-4 w-4" />
                      {action.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-500">
                  Standard Response
                </p>
                <p className="mt-2 text-2xl font-bold text-blue-950">Within 24 hrs</p>
                <p className="mt-1 text-sm text-slate-600">
                  Most support emails are handled within one business day.
                </p>
              </div>

              <div className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-500">
                  Priority Queue
                </p>
                <p className="mt-2 text-2xl font-bold text-blue-950">
                  {isVerifiedSeller ? 'Active' : 'Verified Sellers'}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Verified sellers receive faster handling during support hours.
                </p>
              </div>

              <div className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-500">
                  Current Messaging
                </p>
                <p className="mt-2 text-2xl font-bold text-blue-950">Disputes Only</p>
                <p className="mt-1 text-sm text-slate-600">
                  There is no direct buyer-seller chat yet outside disputed orders.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <div className="flex gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-amber-100">
              <FileWarning className="h-6 w-6 text-amber-700" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-amber-900">No direct buyer-seller messaging yet</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-900/80">
                The app currently does not include a general chat flow between buyers and sellers.
                The only in-app discussion thread available today is the dispute thread that appears
                after an order enters the <strong>DISPUTED</strong> state.
              </p>
            </div>
          </div>
        </section>

        {isVerifiedSeller && (
          <section className="rounded-[28px] bg-gradient-to-r from-orange-500 to-orange-600 p-6 text-white shadow-lg">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <Shield className="h-6 w-6" />
                  <h2 className="text-xl font-bold">Priority Support Active</h2>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-orange-50">
                  As a verified seller, you get priority support with guaranteed 2-hour
                  response times during business hours.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-2xl bg-white/20 px-4 py-3 text-sm font-semibold">
                <Clock className="h-4 w-4" />
                Response within 2 hours
              </div>
            </div>
          </section>
        )}

        <section className="grid gap-6 lg:grid-cols-3">
          <ContactCard
            icon={Mail}
            title="Email Support"
            body="Use email when the page does not give you the action you need. Include the order number, screenshots, and what result you expected."
            actionLabel={SUPPORT_EMAIL}
            actionHref={`mailto:${SUPPORT_EMAIL}`}
          />
          <ContactCard
            icon={AlertCircle}
            title="Order Disputes"
            body="Order-related issues should start from the order details flow first. If the order reaches disputed status, the dispute discussion becomes the supported in-app thread."
            actionLabel="Go to my orders"
            actionHref={userRole === 'seller' ? '/seller/orders' : userRole === 'admin' ? '/admin/orders' : '/orders'}
          />
          <ContactCard
            icon={HelpCircle}
            title="Self-Serve Help"
            body="Use the FAQ section below for real platform behavior: disputes, escrow, verification, account help, and the current messaging limitation."
            actionLabel="Browse help below"
            actionHref="#faq"
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <PathCard
            title="If your problem is about an order"
            body="Use the order flow first so the issue stays tied to the right transaction."
            steps={[
              'Open the relevant order details page.',
              'Use confirm, pickup, or report issue actions when available.',
              'If the order becomes disputed, continue in the dispute discussion thread.',
            ]}
          />
          <PathCard
            title="If your problem is about account access"
            body="Handle account issues through the recovery flow before escalating."
            steps={[
              'Try the password reset flow.',
              'Confirm the email tied to the account.',
              'If recovery still fails, email support with the account email and symptoms.',
            ]}
          />
          <PathCard
            title="If your problem is operational"
            body="Use the right page first so support only handles the part the UI cannot resolve."
            steps={[
              'Sellers should check Products, Orders, Payments, or Verification.',
              'Admins should check Orders, Disputes, Users, or Bank Approvals.',
              'Escalate with IDs, screenshots, and timestamps when needed.',
            ]}
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div id="faq" className="rounded-[28px] border border-blue-100 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-blue-950">Frequently Asked Questions</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Answers filtered to what is actually available in the current app.
                </p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={faqSearch}
                  onChange={(event) => setFaqSearch(event.target.value)}
                  placeholder="Search support topics..."
                  className="w-full rounded-full border border-blue-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
                />
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {filteredFaqs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 p-6 text-center">
                  <p className="text-sm font-semibold text-blue-900">No matching answers</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Try a different keyword like order, dispute, verification, account, or messaging.
                  </p>
                </div>
              ) : (
                filteredFaqs.map((faq) => {
                  const isOpen = openFaqId === faq.id;

                  return (
                    <div key={faq.id} className="overflow-hidden rounded-2xl border border-blue-100">
                      <button
                        type="button"
                        onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                        className="flex w-full items-center justify-between gap-4 bg-white px-5 py-4 text-left transition hover:bg-blue-50"
                      >
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">
                            {faq.category}
                          </p>
                          <h3 className="mt-1 text-base font-semibold text-blue-950">
                            {faq.question}
                          </h3>
                        </div>
                        <ChevronDown
                          className={`h-5 w-5 text-blue-700 transition-transform ${
                            isOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                      {isOpen && (
                        <div className="border-t border-blue-100 bg-slate-50 px-5 py-4 text-sm leading-6 text-slate-700">
                          {faq.answer}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-6">
            <section className="rounded-[28px] border border-blue-100 bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-bold text-blue-950">Contact Support</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Submit your issue here. Attachments are uploaded and saved directly with the support ticket.
              </p>

              <form onSubmit={handleSupportSubmit} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="support-issue-type" className="mb-2 block text-sm font-semibold text-blue-950">
                    Issue type
                  </label>
                  <select
                    id="support-issue-type"
                    value={issueType}
                    onChange={(event) => setIssueType(event.target.value)}
                    className="w-full rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
                  >
                    <option value="general">General help</option>
                    <option value="order-issue">Order issue</option>
                    <option value="payment-issue">Payment issue</option>
                    <option value="account-access">Account access</option>
                    <option value="verification">Verification support</option>
                    <option value="technical-problem">Technical problem</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="support-subject" className="mb-2 block text-sm font-semibold text-blue-950">
                    Subject
                  </label>
                  <input
                    id="support-subject"
                    type="text"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    placeholder="Short summary of the issue"
                    className="w-full rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
                  />
                </div>

                <div>
                  <label htmlFor="support-message" className="mb-2 block text-sm font-semibold text-blue-950">
                    Message
                  </label>
                  <textarea
                    id="support-message"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    rows={6}
                    placeholder="Explain what happened, which order or page was involved, and what outcome you expected."
                    className="w-full rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
                  />
                </div>

                <div>
                  <label htmlFor="support-attachments" className="mb-2 block text-sm font-semibold text-blue-950">
                    Attach files
                  </label>
                  <label htmlFor="support-attachments" className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-blue-200 bg-blue-50/50 px-4 py-4 text-sm font-medium text-blue-800 transition hover:border-orange-300 hover:text-orange-600">
                    <Upload className="h-4 w-4" />
                    <span>Add screenshots or evidence</span>
                    <input
                      id="support-attachments"
                      type="file"
                      accept="image/*,.pdf"
                      multiple
                      onChange={handleAttachmentChange}
                      className="hidden"
                    />
                  </label>
                  {attachments.length > 0 && (
                    <div className="mt-3 space-y-2 rounded-2xl bg-slate-50 p-3">
                      {attachments.map((file) => (
                        <div
                          key={`${file.name}-${file.size}`}
                          className="flex items-center gap-2 text-sm text-slate-700"
                        >
                          <Paperclip className="h-4 w-4 text-slate-400" />
                          <span className="truncate">{file.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {submitStatus.message && (
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm ${
                      submitStatus.type === 'error'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-green-50 text-green-700'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {submitStatus.type === 'success' && <CheckCircle className="h-4 w-4 mt-0.5" />}
                      <div>
                        <p>{submitStatus.message}</p>
                        {submittedTicketId && submitStatus.type === 'success' && (
                          <p className="mt-1 text-xs font-semibold">
                            Ticket ID: {submittedTicketId}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-blue-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                  {submitting ? 'Preparing request...' : 'Submit Support Request'}
                </button>
              </form>

              <div className="mt-4 rounded-2xl bg-blue-50/70 p-4 text-sm text-slate-600">
                Support tickets are now saved in-app. You can still use email for direct follow-up if a file upload fails or you need to continue outside the platform.
                <a
                  href={mailtoHref}
                  className="ml-1 font-semibold text-orange-600 hover:text-orange-700"
                >
                  Email support directly
                </a>
                .
              </div>
            </section>

            <section className="rounded-[28px] border border-blue-100 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-blue-950">What to include</h2>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
                <li className="flex gap-3">
                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-orange-500" />
                  Add the order number if your issue is tied to a transaction.
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-orange-500" />
                  Mention your role so support knows whether you are a buyer, seller, or admin.
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-orange-500" />
                  Add screenshots, PDFs, timestamps, and the exact page where the problem happened.
                </li>
              </ul>
            </section>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

