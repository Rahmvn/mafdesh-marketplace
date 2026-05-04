import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/FooterSlim";
import {
  Shield,
  Clock,
  RefreshCw,
  Scale,
  AlertTriangle,
  Handshake,
  Truck,
  Package,
  Users,
  Gavel,
  Info,
} from "lucide-react";

export default function Policies() {
  const location = useLocation();
  const navigate = useNavigate();
  const fromSignup = location.state?.fromSignup === true;
  const returnTo = location.state?.returnTo || "/signup";
  const effectiveDate = new Date().toLocaleDateString("en-NG", {
    month: "long",
    year: "numeric",
  });

  const sections = [
    {
      icon: <Shield className="w-8 h-8 text-orange-600" />,
      title: "Escrow Protection",
      content: (
        <ul className="list-disc pl-5 space-y-2 text-gray-700">
          <li>All payments are held securely until you confirm delivery.</li>
          <li>Funds are only released to the seller when you're satisfied.</li>
          <li>If a dispute arises, our admin team steps in to ensure fairness.</li>
          <li>A buyer protection fund is planned for a future platform update.</li>
        </ul>
      ),
    },
    {
      icon: <Clock className="w-8 h-8 text-orange-600" />,
      title: "Inspection Window & Auto-Completion",
      content: (
        <div>
          <p className="mb-2">
            <strong>For delivery orders:</strong> You have{" "}
            <span className="font-bold">5 days</span> after delivery to inspect the item and
            report any issues. If you do not open a dispute within this window, the order will
            automatically complete and funds will be released to the seller.
          </p>
          <p>
            <strong>For pickup orders:</strong> Inspect the item carefully before confirming
            pickup. After confirmation, the sale is final and no disputes can be opened.
          </p>
        </div>
      ),
    },
    {
      icon: <RefreshCw className="w-8 h-8 text-orange-600" />,
      title: "Refund Policy",
      content: (
        <ul className="list-disc pl-5 space-y-2 text-gray-700">
          <li>
            <strong>Full refund:</strong> A full refund is awarded when the seller is clearly at
            fault — wrong item, fake item, item never arrived, or significantly damaged.
          </li>
          <li>
            <strong>Partial refund:</strong> Admin may award a partial refund where fault is shared
            or damage is minor. The amount is determined case by case.
          </li>
          <li>
            Mafdesh admin mediates all refund decisions based on evidence provided. Physical
            returns may be required at admin discretion.
          </li>
          <li>
            Refunds are processed by the Mafdesh team. Processing time is 5 to 7 business days
            after admin approval. You will be notified when your refund is processed.
          </li>
        </ul>
      ),
    },
    {
      icon: <Scale className="w-8 h-8 text-orange-600" />,
      title: "Dispute Resolution",
      content: (
        <ul className="list-disc pl-5 space-y-2 text-gray-700">
          <li>
            Open a dispute within the inspection window if something's wrong. Providing photos or
            videos strengthens your dispute but is not mandatory for submission.
          </li>
          <li>
            Our admins review all evidence and make a fair decision based on our constitution.
          </li>
          <li>
            If you don't open a dispute within 5 days, the order completes automatically and
            funds are released to the seller.
          </li>
          <li>If evidence supports the seller's position, funds are released to the seller and the dispute is closed.</li>
        </ul>
      ),
    },
    {
      icon: <Gavel className="w-8 h-8 text-orange-600" />,
      title: "Account Integrity & Enforcement",
      content: (
        <ul className="list-disc pl-5 space-y-2 text-gray-700">
          <li>Fraudulent activity, fake disputes, or repeated policy violations may result in:</li>
          <ul className="list-circle pl-5 mt-1">
            <li>Warning</li>
            <li>Temporary suspension</li>
            <li>Permanent ban from the platform</li>
          </ul>
          <li>We reserve the right to remove listings or restrict accounts that violate our rules.</li>
          <li>
            Serious offenses (e.g., selling counterfeit goods, scamming) lead to immediate
            permanent ban.
          </li>
        </ul>
      ),
    },
    {
      icon: <AlertTriangle className="w-8 h-8 text-orange-600" />,
      title: "Prohibited Items (Halal Compliance)",
      content: (
        <ul className="list-disc pl-5 space-y-2 text-gray-700">
          <li>Alcohol, pork, and non-halal meat products.</li>
          <li>Gambling-related items and explicit content.</li>
          <li>Tobacco and cigarettes — discouraged on the platform pending policy review.</li>
          <li>Fraudulent, counterfeit, or stolen goods.</li>
          <li>
            We uphold ethical trade: no deception, clear descriptions, and fair treatment for all.
          </li>
        </ul>
      ),
    },
    {
      icon: <Handshake className="w-8 h-8 text-orange-600" />,
      title: "Seller Responsibilities",
      content: (
        <ul className="list-disc pl-5 space-y-2 text-gray-700">
          <li>Ship within 2 business days of order, or arrange pickup promptly.</li>
          <li>Provide accurate product descriptions and clear photos.</li>
          <li>Respond to buyer messages within 24 hours.</li>
          <li>Cooperate with admin investigations and dispute resolution when issues arise.</li>
        </ul>
      ),
    },
    {
      icon: <Truck className="w-8 h-8 text-orange-600" />,
      title: "Shipping & Delivery",
      content: (
        <ul className="list-disc pl-5 space-y-2 text-gray-700">
          <li>Use trackable shipping for proof of delivery.</li>
          <li>Delivery timelines are estimates; contact seller for updates.</li>
          <li>
            If your item has not arrived within 14 days of shipment, Mafdesh will automatically
            initiate a refund review. You do not need to take action — you will be notified of the
            outcome.
          </li>
        </ul>
      ),
    },
    {
      icon: <Package className="w-8 h-8 text-orange-600" />,
      title: "Buyer Responsibilities",
      content: (
        <ul className="list-disc pl-5 space-y-2 text-gray-700">
          <li>Inspect items promptly upon delivery/pickup.</li>
          <li>Communicate any issues before opening a dispute.</li>
          <li>
            Do not abuse the dispute system; fraudulent disputes may lead to account suspension.
          </li>
        </ul>
      ),
    },
    {
      icon: <Scale className="w-8 h-8 text-orange-600" />,
      title: "How Disputes Are Resolved",
      content: (
        <div className="text-gray-700">
          <p className="mb-3">
            When you open a dispute, our admin team reviews all evidence including photos, order
            details, and communication history.
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Award a full refund to the buyer</li>
            <li>Award a partial refund to the buyer</li>
            <li>Release funds to the seller</li>
          </ul>
          <p className="mt-3">All decisions are final. We aim to resolve disputes within 48 hours of submission.</p>
        </div>
      ),
    },
    {
      icon: <Users className="w-8 h-8 text-orange-600" />,
      title: "Privacy & Data",
      content: (
        <ul className="list-disc pl-5 space-y-2 text-gray-700">
          <li>We protect your personal information and never share it without consent.</li>
          <li>Read our full Privacy Policy for details on how we use your data.</li>
        </ul>
      ),
    },
    {
      icon: <Info className="w-8 h-8 text-orange-600" />,
      title: "Policy Updates",
      content: (
        <p className="text-gray-700">
          We may update these policies from time to time. Continued use of the platform means you
          accept the latest version. The effective date of the current version is shown at the
          bottom of this page.
        </p>
      ),
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        {fromSignup && (
          <button
            type="button"
            onClick={() => navigate(returnTo)}
            className="mb-4 rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-50"
          >
            Back to sign up
          </button>
        )}
        <h1 className="text-3xl font-bold text-blue-900 mb-2">Marketplace Policies</h1>
        <p className="text-gray-600 mb-8">Our commitment to safe, fair, and halal commerce.</p>

        <div className="space-y-6">
          {sections.map((section, index) => (
            <div
              key={index}
              className="bg-white rounded-xl border p-6 shadow-sm hover:shadow-md transition"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">{section.icon}</div>
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-blue-900 mb-3">{section.title}</h2>
                  {section.content}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 bg-orange-50 border border-orange-200 rounded-xl p-6 text-center">
          <p className="text-lg text-gray-800">Need help? Our support team is here for you.</p>
          <button
            onClick={() => navigate("/support")}
            className="mt-3 bg-orange-600 text-white px-6 py-2 rounded-lg hover:bg-orange-700"
          >
            Contact Support
          </button>
        </div>

        <p className="text-sm text-gray-500 mt-6 border-t pt-4">
          These policies are effective as of {effectiveDate}. Mafdesh reserves the right to
          modify these policies at any time. Your continued use of the platform constitutes
          acceptance of the latest version.
        </p>
      </main>
      <Footer />
    </div>
  );
}
