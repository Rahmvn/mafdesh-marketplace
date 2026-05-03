import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/FooterSlim";
import {
  Shield,
  Scale,
  RefreshCw,
  AlertTriangle,
  Gavel,
  Package,
  Users,
  Info,
  CreditCard,
  BookOpen,
  CheckCircle,
  ArrowLeft,
} from "lucide-react";
import { getStoredUser } from "../utils/storage";

export default function AdminConstitution() {
  const navigate = useNavigate();
  const effectiveDate = new Date().toLocaleDateString("en-NG", {
    month: "long",
    year: "numeric",
  });

  useEffect(() => {
    const role = getStoredUser()?.role || null;

    if (role !== "admin") {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  const toc = [
    { id: "core-principles", title: "1. Core Principles", icon: Shield },
    { id: "refund-rules", title: "2. Refund Rules", icon: RefreshCw },
    { id: "fraud-prevention", title: "3. Fraud Prevention", icon: AlertTriangle },
    { id: "dispute-scenarios", title: "4. Dispute Scenarios", icon: Scale },
    { id: "digital-services", title: "5. Digital Goods & Services", icon: Package },
    { id: "chargebacks", title: "6. Chargebacks & Platform Protection", icon: CreditCard },
    { id: "admin-accountability", title: "7. Admin Accountability", icon: Users },
    { id: "halal-commerce", title: "8. Halal Commerce Principle", icon: BookOpen },
    { id: "nigerian-law", title: "9. Nigerian Consumer Protection", icon: Gavel },
    { id: "buyer-protection-fund", title: "10. Buyer Protection Fund", icon: CheckCircle },
    { id: "updates", title: "11. Policy Updates", icon: Info },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        <Link
          to="/admin/dashboard"
          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 mb-4"
        >
          <ArrowLeft size={18} />
          Back
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-blue-900 mb-2">Mafdesh Admin Constitution</h1>
          <p className="text-gray-600">Version 1.0 • Effective {effectiveDate}</p>
          <p className="text-sm text-gray-500 mt-2">
            This internal document governs all dispute resolutions, refund decisions, and
            administrative actions. Every admin must be familiar with its contents.
          </p>
        </div>

        <div className="bg-white rounded-xl border shadow-sm p-6 mb-8">
          <h2 className="text-xl font-semibold text-blue-900 mb-4 flex items-center gap-2">
            <BookOpen size={20} className="text-orange-600" />
            Table of Contents
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {toc.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="flex items-center gap-2 text-blue-700 hover:text-orange-600 transition-colors p-2 rounded hover:bg-blue-50"
              >
                <item.icon size={18} />
                <span>{item.title}</span>
              </a>
            ))}
          </div>
        </div>

        <div className="space-y-8">
          <section id="core-principles" className="bg-white rounded-xl border p-6 scroll-mt-20">
            <h2 className="text-2xl font-bold text-blue-900 mb-4 flex items-center gap-2">
              <Shield className="text-orange-600" size={24} />
              1. Core Principles
            </h2>
            <div className="space-y-4 pl-6">
              <div>
                <h3 className="font-semibold text-lg text-blue-800">Escrow Protection</h3>
                <p className="text-gray-700">
                  All payments are held in escrow until the transaction is successfully
                  completed. Flow: Buyer pays → Escrow holds → Seller fulfills → Buyer confirms
                  → Funds released.
                </p>
                <p className="text-gray-700 mt-1">
                  Escrow may only be released when: buyer confirms delivery, inspection window
                  expires, or admin resolves a dispute. Never release without justification.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-lg text-blue-800">
                  Evidence-Based Judgement
                </h3>
                <p className="text-gray-700">
                  Base decisions on evidence: transaction records, photos/videos, tracking,
                  message history, user dispute history. When insufficient, choose the most fair
                  outcome.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-lg text-blue-800">Inspection Window</h3>
                <p className="text-gray-700">
                  Delivery orders: 5 days after delivery for buyer to report issues. If no
                  dispute, order auto-completes and funds release. No disputes after completion.
                </p>
                <p className="text-gray-700 mt-1">
                  Pickup orders: Buyer must inspect before confirming. After confirmation, sale
                  is final – no disputes allowed.
                </p>
              </div>
            </div>
          </section>

          <section id="refund-rules" className="bg-white rounded-xl border p-6 scroll-mt-20">
            <h2 className="text-2xl font-bold text-blue-900 mb-4 flex items-center gap-2">
              <RefreshCw className="text-orange-600" size={24} />
              2. Refund Rules
            </h2>
            <div className="space-y-4 pl-6">
              <div>
                <h3 className="font-semibold text-lg text-blue-800">Full Refund</h3>
                <p className="text-gray-700">
                  A full refund is awarded when the seller is clearly at fault — wrong item, fake
                  item, item never arrived, or significantly damaged.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-lg text-blue-800">Partial Refund</h3>
                <p className="text-gray-700">
                  Partial refunds are determined by admin based on evidence and fault. The amount
                  is at admin discretion up to the full order value.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-lg text-blue-800">Refund Mediation</h3>
                <p className="text-gray-700">
                  Mafdesh admin mediates all refund decisions based on evidence provided. Physical
                  returns may be required at admin discretion.
                </p>
                <p className="text-gray-700 mt-1">
                  Refunds are processed by the Mafdesh team. Processing time is 5 to 7 business
                  days after admin approval. Users are notified when the refund is processed.
                </p>
              </div>
            </div>
          </section>

          <section id="fraud-prevention" className="bg-white rounded-xl border p-6 scroll-mt-20">
            <h2 className="text-2xl font-bold text-blue-900 mb-4 flex items-center gap-2">
              <AlertTriangle className="text-orange-600" size={24} />
              3. Fraud Prevention
            </h2>
            <div className="space-y-4 pl-6">
              <p className="text-gray-700">Watch for suspicious behavior:</p>
              <ul className="list-disc pl-5 text-gray-700">
                <li>Repeated disputes from same buyer</li>
                <li>Frequent complaints about a seller</li>
                <li>Evidence manipulation (doctored photos)</li>
                <li>Fake or counterfeit listings</li>
                <li>
                  Accounts engaging in fraud face: Warning → Listing removal → Temporary
                  suspension → Permanent ban
                </li>
              </ul>
            </div>
          </section>

          <section id="dispute-scenarios" className="bg-white rounded-xl border p-6 scroll-mt-20">
            <h2 className="text-2xl font-bold text-blue-900 mb-4 flex items-center gap-2">
              <Scale className="text-orange-600" size={24} />
              4. Dispute Scenarios
            </h2>
            <p className="text-gray-600 mb-4 italic">
              Admins must refer to these scenarios and apply consistent decisions.
            </p>
            <div className="space-y-6 pl-6">
              <div className="border-l-4 border-blue-300 pl-4">
                <h3 className="font-semibold text-lg text-blue-800">
                  Scenario 1: Item Never Arrived
                </h3>
                <p className="text-gray-700">
                  <strong>Evidence:</strong> Tracking, shipping confirmation, delivery proof.
                </p>
                <p className="text-gray-700">
                  <strong>Decision:</strong> No tracking/shipment proof → Refund buyer. Tracking
                  shows delivered → Release escrow.
                </p>
              </div>
              <div className="border-l-4 border-blue-300 pl-4">
                <h3 className="font-semibold text-lg text-blue-800">
                  Scenario 2: Item Arrived Damaged
                </h3>
                <p className="text-gray-700">
                  <strong>Evidence:</strong> Photos of product & packaging, delivery timeline.
                </p>
                <p className="text-gray-700">
                  <strong>Decision:</strong> Severe damage → Refund buyer. Minor damage → Partial
                  refund. Damage caused by buyer → Release escrow.
                </p>
              </div>
              <div className="border-l-4 border-blue-300 pl-4">
                <h3 className="font-semibold text-lg text-blue-800">
                  Scenario 3: Wrong Item Sent
                </h3>
                <p className="text-gray-700">
                  <strong>Evidence:</strong> Product photos vs listing description.
                </p>
                <p className="text-gray-700">
                  <strong>Decision:</strong> Refund buyer when evidence clearly supports the buyer.
                </p>
              </div>
              <div className="border-l-4 border-blue-300 pl-4">
                <h3 className="font-semibold text-lg text-blue-800">
                  Scenario 4: Item Different From Description
                </h3>
                <p className="text-gray-700">
                  <strong>Example:</strong> Different model, fake brand, incorrect specs.
                </p>
                <p className="text-gray-700">
                  <strong>Decision:</strong> Full refund if seller fault is clear. Partial refund
                  may be awarded where the issue is minor or fault is shared.
                </p>
              </div>
              <div className="border-l-4 border-blue-300 pl-4">
                <h3 className="font-semibold text-lg text-blue-800">
                  Scenario 5: Buyer Claims Fake Product
                </h3>
                <p className="text-gray-700">
                  <strong>Review:</strong> Listing, photos, authenticity indicators.
                </p>
                <p className="text-gray-700">
                  <strong>Decision:</strong> Fake confirmed → Refund buyer. Authentic → Release
                  escrow.
                </p>
              </div>
              <div className="border-l-4 border-blue-300 pl-4">
                <h3 className="font-semibold text-lg text-blue-800">
                  Scenario 6: Buyer Damaged Item
                </h3>
                <p className="text-gray-700">
                  <strong>Signs:</strong> Damage inconsistent with shipping, late complaint, no
                  packaging damage.
                </p>
                <p className="text-gray-700">
                  <strong>Decision:</strong> Release escrow to seller.
                </p>
              </div>
              <div className="border-l-4 border-blue-300 pl-4">
                <h3 className="font-semibold text-lg text-blue-800">
                  Scenario 7: Seller Did Not Ship
                </h3>
                <p className="text-gray-700">
                  <strong>Rule:</strong> Seller must ship within 2 business days. If fails → Order
                  cancelled, buyer refunded.
                </p>
              </div>
              <div className="border-l-4 border-blue-300 pl-4">
                <h3 className="font-semibold text-lg text-blue-800">
                  Scenario 8: Buyer Never Picks Up Order
                </h3>
                <p className="text-gray-700">
                  <strong>Rule:</strong> Buyer must collect within 2 business days after pickup ready. If
                  not → Seller may cancel, buyer refunded.
                </p>
              </div>
              <div className="border-l-4 border-blue-300 pl-4">
                <h3 className="font-semibold text-lg text-blue-800">
                  Scenario 9: Buyer Attempts Fraudulent Dispute
                </h3>
                <p className="text-gray-700">
                  <strong>Indicators:</strong> Repeated disputes, contradictory evidence,
                  manipulated photos.
                </p>
                <p className="text-gray-700">
                  <strong>Decision:</strong> Release escrow to seller, issue warning/restriction.
                </p>
              </div>
              <div className="border-l-4 border-blue-300 pl-4">
                <h3 className="font-semibold text-lg text-blue-800">
                  Scenario 10: Seller Attempts Fraud
                </h3>
                <p className="text-gray-700">
                  <strong>Examples:</strong> Fake listing, intentionally wrong item, counterfeit.
                </p>
                <p className="text-gray-700">
                  <strong>Decision:</strong> Refund buyer, remove listing, consider suspension.
                </p>
              </div>
              <div className="border-l-4 border-blue-300 pl-4">
                <h3 className="font-semibold text-lg text-blue-800">
                  Scenario 11: Split Responsibility
                </h3>
                <p className="text-gray-700">
                  <strong>Example:</strong> Item arrived with minor damage, buyer waited 2 weeks
                  to report, seller used inadequate packaging.
                </p>
                <p className="text-gray-700">
                  <strong>Decision:</strong> Determine fault based on the evidence and award a
                  partial refund where appropriate. Document reasoning.
                </p>
              </div>
              <div className="border-l-4 border-blue-300 pl-4">
                <h3 className="font-semibold text-lg text-blue-800">
                  Scenario 12: Missing Accessories
                </h3>
                <p className="text-gray-700">
                  <strong>Essential missing</strong> (item unusable): Full refund where the
                  evidence shows seller fault.
                </p>
                <p className="text-gray-700">
                  <strong>Non-essential missing</strong>: Partial refunds are determined by admin
                  based on evidence and fault. The amount is at admin discretion up to the full
                  order value.
                </p>
              </div>
            </div>
            <p className="mt-4 text-gray-600 text-sm">
              All decisions must cite the relevant scenario number in admin notes.
            </p>
          </section>

          <section id="digital-services" className="bg-white rounded-xl border p-6 scroll-mt-20">
            <h2 className="text-2xl font-bold text-blue-900 mb-4 flex items-center gap-2">
              <Package className="text-orange-600" size={24} />
              5. Digital Goods & Services
            </h2>
            <div className="space-y-4 pl-6">
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-yellow-800">
                Note: Digital goods and services are not currently supported on Mafdesh. This
                section is reserved for future use.
              </div>
              <p className="text-gray-700">
                <strong>Digital products</strong> (ebooks, software): Refund only if the item is
                corrupted or does not work. Access and delivery records should be reviewed as part
                of the evidence.
              </p>
              <p className="text-gray-700">
                <strong>Services</strong> (repairs, custom work): Milestone-based escrow releases.
                Progress photos required. Client must report issues within 48 hours of completion.
              </p>
            </div>
          </section>

          <section id="chargebacks" className="bg-white rounded-xl border p-6 scroll-mt-20">
            <h2 className="text-2xl font-bold text-blue-900 mb-4 flex items-center gap-2">
              <CreditCard className="text-orange-600" size={24} />
              6. Chargebacks & Platform Protection
            </h2>
            <div className="space-y-4 pl-6">
              <p className="text-gray-700">If buyer initiates credit card chargeback:</p>
              <ul className="list-disc pl-5 text-gray-700">
                <li>Platform disputes with evidence from our records.</li>
                <li>Buyer's account suspended during investigation.</li>
                <li>If buyer wins chargeback, they are banned.</li>
                <li>If seller at fault, amount deducted from seller balance.</li>
              </ul>
            </div>
          </section>

          <section
            id="admin-accountability"
            className="bg-white rounded-xl border p-6 scroll-mt-20"
          >
            <h2 className="text-2xl font-bold text-blue-900 mb-4 flex items-center gap-2">
              <Users className="text-orange-600" size={24} />
              7. Admin Accountability
            </h2>
            <div className="space-y-4 pl-6">
              <p className="text-gray-700">
                All admin actions must be recorded in the <code>admin_actions</code> table with:
              </p>
              <ul className="list-disc pl-5 text-gray-700">
                <li>Admin ID</li>
                <li>Order ID</li>
                <li>Decision made</li>
                <li>Reason (including constitution section citation)</li>
                <li>Timestamp</li>
              </ul>
              <p className="text-gray-700 mt-2">
                Monthly audits ensure consistency. Any deviation must be justified.
              </p>
            </div>
          </section>

          <section id="halal-commerce" className="bg-white rounded-xl border p-6 scroll-mt-20">
            <h2 className="text-2xl font-bold text-blue-900 mb-4 flex items-center gap-2">
              <BookOpen className="text-orange-600" size={24} />
              8. Halal Commerce Principle
            </h2>
            <div className="space-y-4 pl-6">
              <p className="text-gray-700">
                Mafdesh operates on ethical and halal trade principles:
              </p>
              <ul className="list-disc pl-5 text-gray-700">
                <li>No fraud, no deception.</li>
                <li>Clear product descriptions.</li>
                <li>Fair treatment of buyers and sellers.</li>
                <li>
                  <strong>Prohibited items:</strong> Alcohol, pork, non-halal meat,
                  gambling-related items, explicit content, usury-based products.
                </li>
              </ul>
            </div>
          </section>

          <section id="nigerian-law" className="bg-white rounded-xl border p-6 scroll-mt-20">
            <h2 className="text-2xl font-bold text-blue-900 mb-4 flex items-center gap-2">
              <Gavel className="text-orange-600" size={24} />
              9. Nigerian Consumer Protection Compliance
            </h2>
            <div className="space-y-4 pl-6">
              <p className="text-gray-700">
                This constitution operates within the Federal Competition and Consumer Protection
                Act (FCCPA) 2018:
              </p>
              <ul className="list-disc pl-5 text-gray-700">
                <li>Clear disclosure of refund and dispute processes is required.</li>
                <li>Admin decisions must be evidence-based, fair, and well documented.</li>
                <li>Clear disclosure of refund/replacement policy required.</li>
              </ul>
            </div>
          </section>

          <section
            id="buyer-protection-fund"
            className="bg-white rounded-xl border p-6 scroll-mt-20"
          >
            <h2 className="text-2xl font-bold text-blue-900 mb-4 flex items-center gap-2">
              <CheckCircle className="text-orange-600" size={24} />
              10. Buyer Protection Fund
            </h2>
            <div className="space-y-4 pl-6">
              <p className="text-gray-700">
                A buyer protection fund is planned for a future platform update.
              </p>
            </div>
          </section>

          <section id="updates" className="bg-white rounded-xl border p-6 scroll-mt-20">
            <h2 className="text-2xl font-bold text-blue-900 mb-4 flex items-center gap-2">
              <Info className="text-orange-600" size={24} />
              11. Policy Updates
            </h2>
            <p className="text-gray-700 pl-6">
              This constitution may be updated quarterly based on real cases and feedback. All
              admins will be notified of changes. Continued use of admin tools implies acceptance
              of the latest version.
            </p>
          </section>
        </div>

        <div className="mt-10 text-center text-gray-500 text-sm border-t pt-6">
          <p>For questions or to suggest improvements, contact the Head of Trust & Safety.</p>
          <p className="mt-1">© 2026 Mafdesh. Internal use only.</p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
