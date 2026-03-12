import React from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { 
  Shield, Scale, Clock, RefreshCw, AlertTriangle, Gavel, 
  Truck, Package, Users, FileText, Info, CreditCard, 
  BookOpen, CheckCircle, XCircle, HelpCircle 
} from "lucide-react";

export default function AdminConstitution() {
  // Table of contents items with section IDs for linking
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
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-blue-900 mb-2">Mafdesh Admin Constitution</h1>
          <p className="text-gray-600">Version 1.0 • Effective March 2026</p>
          <p className="text-sm text-gray-500 mt-2">
            This internal document governs all dispute resolutions, refund decisions, and administrative actions. 
            Every admin must be familiar with its contents.
          </p>
        </div>

        {/* Table of Contents Card */}
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

        {/* Sections */}
        <div className="space-y-8">
          {/* Section 1 */}
          <section id="core-principles" className="bg-white rounded-xl border p-6 scroll-mt-20">
            <h2 className="text-2xl font-bold text-blue-900 mb-4 flex items-center gap-2">
              <Shield className="text-orange-600" size={24} />
              1. Core Principles
            </h2>
            <div className="space-y-4 pl-6">
              <div>
                <h3 className="font-semibold text-lg text-blue-800">Escrow Protection</h3>
                <p className="text-gray-700">All payments are held in escrow until the transaction is successfully completed. Flow: Buyer pays → Escrow holds → Seller fulfills → Buyer confirms → Funds released.</p>
                <p className="text-gray-700 mt-1">Escrow may only be released when: buyer confirms delivery, inspection window expires, or admin resolves a dispute. Never release without justification.</p>
              </div>
              <div>
                <h3 className="font-semibold text-lg text-blue-800">Evidence-Based Judgement</h3>
                <p className="text-gray-700">Base decisions on evidence: transaction records, photos/videos, tracking, message history, user dispute history. When insufficient, choose the most fair outcome.</p>
              </div>
              <div>
                <h3 className="font-semibold text-lg text-blue-800">Inspection Window</h3>
                <p className="text-gray-700">Delivery orders: 72 hours after delivery for buyer to report issues. If no dispute, order auto-completes and funds release. No disputes after completion.</p>
                <p className="text-gray-700 mt-1">Pickup orders: Buyer must inspect before confirming. After confirmation, sale is final – no disputes allowed.</p>
              </div>
            </div>
          </section>

          {/* Section 2 */}
          <section id="refund-rules" className="bg-white rounded-xl border p-6 scroll-mt-20">
            <h2 className="text-2xl font-bold text-blue-900 mb-4 flex items-center gap-2">
              <RefreshCw className="text-orange-600" size={24} />
              2. Refund Rules
            </h2>
            <div className="space-y-4 pl-6">
              <div>
                <h3 className="font-semibold text-lg text-blue-800">Full Refund</h3>
                <p className="text-gray-700">Requires product return unless: product destroyed/unusable, return shipping unreasonable, or safety risk. Process: Admin approves → buyer ships → buyer provides proof → seller confirms receipt → refund.</p>
              </div>
              <div>
                <h3 className="font-semibold text-lg text-blue-800">Partial Refund</h3>
                <p className="text-gray-700">For minor damage, missing accessories, or slight differences. Guideline: ≤30% of order value. Must be reasonable and documented.</p>
              </div>
              <div>
                <h3 className="font-semibold text-lg text-blue-800">Return Shipping Responsibility</h3>
                <ul className="list-disc pl-5 text-gray-700 space-y-1">
                  <li><strong>Seller at fault</strong> (wrong item, damaged, fake): Seller pays return shipping.</li>
                  <li><strong>Buyer at fault</strong> (changed mind, ordered wrong): Buyer pays return shipping; seller may offer partial refund without return.</li>
                  <li><strong>Undetermined fault</strong>: Admin may split cost or use Buyer Protection Fund.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 3 */}
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
                <li>Accounts engaging in fraud face: Warning → Listing removal → Temporary suspension → Permanent ban</li>
              </ul>
            </div>
          </section>

          {/* Section 4 - Dispute Scenarios */}
          <section id="dispute-scenarios" className="bg-white rounded-xl border p-6 scroll-mt-20">
            <h2 className="text-2xl font-bold text-blue-900 mb-4 flex items-center gap-2">
              <Scale className="text-orange-600" size={24} />
              4. Dispute Scenarios
            </h2>
            <p className="text-gray-600 mb-4 italic">Admins must refer to these scenarios and apply consistent decisions.</p>
            <div className="space-y-6 pl-6">
              {/* Scenario 1 */}
              <div className="border-l-4 border-blue-300 pl-4">
                <h3 className="font-semibold text-lg text-blue-800">Scenario 1: Item Never Arrived</h3>
                <p className="text-gray-700"><strong>Evidence:</strong> Tracking, shipping confirmation, delivery proof.</p>
                <p className="text-gray-700"><strong>Decision:</strong> No tracking/shipment proof → Refund buyer. Tracking shows delivered → Release escrow.</p>
              </div>
              {/* Scenario 2 */}
              <div className="border-l-4 border-blue-300 pl-4">
                <h3 className="font-semibold text-lg text-blue-800">Scenario 2: Item Arrived Damaged</h3>
                <p className="text-gray-700"><strong>Evidence:</strong> Photos of product & packaging, delivery timeline.</p>
                <p className="text-gray-700"><strong>Decision:</strong> Severe damage → Refund buyer. Minor damage → Partial refund. Damage caused by buyer → Release escrow.</p>
              </div>
              {/* Scenario 3 */}
              <div className="border-l-4 border-blue-300 pl-4">
                <h3 className="font-semibold text-lg text-blue-800">Scenario 3: Wrong Item Sent</h3>
                <p className="text-gray-700"><strong>Evidence:</strong> Product photos vs listing description.</p>
                <p className="text-gray-700"><strong>Decision:</strong> Buyer returns item → Refund buyer.</p>
              </div>
              {/* Scenario 4 */}
              <div className="border-l-4 border-blue-300 pl-4">
                <h3 className="font-semibold text-lg text-blue-800">Scenario 4: Item Different From Description</h3>
                <p className="text-gray-700"><strong>Example:</strong> Different model, fake brand, incorrect specs.</p>
                <p className="text-gray-700"><strong>Decision:</strong> Buyer returns item → Refund. If minor difference → Partial refund possible.</p>
              </div>
              {/* Scenario 5 */}
              <div className="border-l-4 border-blue-300 pl-4">
                <h3 className="font-semibold text-lg text-blue-800">Scenario 5: Buyer Claims Fake Product</h3>
                <p className="text-gray-700"><strong>Review:</strong> Listing, photos, authenticity indicators.</p>
                <p className="text-gray-700"><strong>Decision:</strong> Fake confirmed → Refund buyer. Authentic → Release escrow.</p>
              </div>
              {/* Scenario 6 */}
              <div className="border-l-4 border-blue-300 pl-4">
                <h3 className="font-semibold text-lg text-blue-800">Scenario 6: Buyer Damaged Item</h3>
                <p className="text-gray-700"><strong>Signs:</strong> Damage inconsistent with shipping, late complaint, no packaging damage.</p>
                <p className="text-gray-700"><strong>Decision:</strong> Release escrow to seller.</p>
              </div>
              {/* Scenario 7 */}
              <div className="border-l-4 border-blue-300 pl-4">
                <h3 className="font-semibold text-lg text-blue-800">Scenario 7: Seller Did Not Ship</h3>
                <p className="text-gray-700"><strong>Rule:</strong> Seller must ship within 72 hours. If fails → Order cancelled, buyer refunded.</p>
              </div>
              {/* Scenario 8 */}
              <div className="border-l-4 border-blue-300 pl-4">
                <h3 className="font-semibold text-lg text-blue-800">Scenario 8: Buyer Never Picks Up Order</h3>
                <p className="text-gray-700"><strong>Rule:</strong> Buyer must collect within 72 hours after pickup ready. If not → Seller may cancel, buyer refunded.</p>
              </div>
              {/* Scenario 9 */}
              <div className="border-l-4 border-blue-300 pl-4">
                <h3 className="font-semibold text-lg text-blue-800">Scenario 9: Buyer Attempts Fraudulent Dispute</h3>
                <p className="text-gray-700"><strong>Indicators:</strong> Repeated disputes, contradictory evidence, manipulated photos.</p>
                <p className="text-gray-700"><strong>Decision:</strong> Release escrow to seller, issue warning/restriction.</p>
              </div>
              {/* Scenario 10 */}
              <div className="border-l-4 border-blue-300 pl-4">
                <h3 className="font-semibold text-lg text-blue-800">Scenario 10: Seller Attempts Fraud</h3>
                <p className="text-gray-700"><strong>Examples:</strong> Fake listing, intentionally wrong item, counterfeit.</p>
                <p className="text-gray-700"><strong>Decision:</strong> Refund buyer, remove listing, consider suspension.</p>
              </div>
              {/* Scenario 11: Split Responsibility */}
              <div className="border-l-4 border-blue-300 pl-4">
                <h3 className="font-semibold text-lg text-blue-800">Scenario 11: Split Responsibility</h3>
                <p className="text-gray-700"><strong>Example:</strong> Item arrived with minor damage, buyer waited 2 weeks to report, seller used inadequate packaging.</p>
                <p className="text-gray-700"><strong>Decision:</strong> Determine fault percentage (e.g., 60% seller, 40% buyer) and refund accordingly. Document reasoning.</p>
              </div>
              {/* Scenario 12: Missing Accessories */}
              <div className="border-l-4 border-blue-300 pl-4">
                <h3 className="font-semibold text-lg text-blue-800">Scenario 12: Missing Accessories</h3>
                <p className="text-gray-700"><strong>Essential missing</strong> (item unusable): Return required → Full refund.</p>
                <p className="text-gray-700"><strong>Non-essential missing</strong>: Partial refund (10-30%) or seller ships missing part within 7 days.</p>
              </div>
            </div>
            <p className="mt-4 text-gray-600 text-sm">All decisions must cite the relevant scenario number in admin notes.</p>
          </section>

          {/* Section 5: Digital Goods & Services */}
          <section id="digital-services" className="bg-white rounded-xl border p-6 scroll-mt-20">
            <h2 className="text-2xl font-bold text-blue-900 mb-4 flex items-center gap-2">
              <Package className="text-orange-600" size={24} />
              5. Digital Goods & Services
            </h2>
            <div className="space-y-4 pl-6">
              <p className="text-gray-700"><strong>Digital products</strong> (ebooks, software): No physical return. Refund only if item is corrupted/doesn't work. Downloads tracked via unique links.</p>
              <p className="text-gray-700"><strong>Services</strong> (repairs, custom work): Milestone-based escrow releases. Progress photos required. Client must report issues within 48 hours of completion.</p>
            </div>
          </section>

          {/* Section 6: Chargebacks */}
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

          {/* Section 7: Admin Accountability */}
          <section id="admin-accountability" className="bg-white rounded-xl border p-6 scroll-mt-20">
            <h2 className="text-2xl font-bold text-blue-900 mb-4 flex items-center gap-2">
              <Users className="text-orange-600" size={24} />
              7. Admin Accountability
            </h2>
            <div className="space-y-4 pl-6">
              <p className="text-gray-700">All admin actions must be recorded in the <code>admin_actions</code> table with:</p>
              <ul className="list-disc pl-5 text-gray-700">
                <li>Admin ID</li>
                <li>Order ID</li>
                <li>Decision made</li>
                <li>Reason (including constitution section citation)</li>
                <li>Timestamp</li>
              </ul>
              <p className="text-gray-700 mt-2">Monthly audits ensure consistency. Any deviation must be justified.</p>
            </div>
          </section>

          {/* Section 8: Halal Commerce */}
          <section id="halal-commerce" className="bg-white rounded-xl border p-6 scroll-mt-20">
            <h2 className="text-2xl font-bold text-blue-900 mb-4 flex items-center gap-2">
              <BookOpen className="text-orange-600" size={24} />
              8. Halal Commerce Principle
            </h2>
            <div className="space-y-4 pl-6">
              <p className="text-gray-700">Mafdesh operates on ethical and halal trade principles:</p>
              <ul className="list-disc pl-5 text-gray-700">
                <li>No fraud, no deception.</li>
                <li>Clear product descriptions.</li>
                <li>Fair treatment of buyers and sellers.</li>
                <li><strong>Prohibited items:</strong> Alcohol, pork, non-halal meat, gambling-related items, explicit content, usury-based products.</li>
              </ul>
            </div>
          </section>

          {/* Section 9: Nigerian Consumer Protection */}
          <section id="nigerian-law" className="bg-white rounded-xl border p-6 scroll-mt-20">
            <h2 className="text-2xl font-bold text-blue-900 mb-4 flex items-center gap-2">
              <Gavel className="text-orange-600" size={24} />
              9. Nigerian Consumer Protection Compliance
            </h2>
            <div className="space-y-4 pl-6">
              <p className="text-gray-700">This constitution operates within the Federal Competition and Consumer Protection Act (FCCPA) 2018:</p>
              <ul className="list-disc pl-5 text-gray-700">
                <li>Returns accepted for defective goods (14 days minimum).</li>
                <li>Full refund within 7 days of return.</li>
                <li>Clear disclosure of refund/replacement policy required.</li>
              </ul>
            </div>
          </section>

          {/* Section 10: Buyer Protection Fund */}
          <section id="buyer-protection-fund" className="bg-white rounded-xl border p-6 scroll-mt-20">
            <h2 className="text-2xl font-bold text-blue-900 mb-4 flex items-center gap-2">
              <CheckCircle className="text-orange-600" size={24} />
              10. Buyer Protection Fund
            </h2>
            <div className="space-y-4 pl-6">
              <p className="text-gray-700">1% of each transaction is set aside into a protection fund. Used for:</p>
              <ul className="list-disc pl-5 text-gray-700">
                <li>Compensating buyers when seller is unresponsive.</li>
                <li>Covering return shipping for genuine cases.</li>
                <li>Goodwill gestures for edge cases.</li>
              </ul>
              <p className="text-gray-700"><strong>Cap:</strong> ₦50,000 per buyer per year. <strong>Approval:</strong> Requires Level 2+ admin.</p>
            </div>
          </section>

          {/* Section 11: Policy Updates */}
          <section id="updates" className="bg-white rounded-xl border p-6 scroll-mt-20">
            <h2 className="text-2xl font-bold text-blue-900 mb-4 flex items-center gap-2">
              <Info className="text-orange-600" size={24} />
              11. Policy Updates
            </h2>
            <p className="text-gray-700 pl-6">
            This constitution may be updated quarterly based on real cases and feedback. All admins will be notified of changes. 
              Continued use of admin tools implies acceptance of the latest version.
            </p>
          </section>
        </div>

        {/* Footer note */}
        <div className="mt-10 text-center text-gray-500 text-sm border-t pt-6">
          <p>For questions or to suggest improvements, contact the Head of Trust & Safety.</p>
          <p className="mt-1">© 2026 Mafdesh. Internal use only.</p>
        </div>
      </main>
      <Footer />
    </div>
  );
}