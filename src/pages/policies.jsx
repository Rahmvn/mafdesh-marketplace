import React from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { 
  Shield, Clock, RefreshCw, Scale, AlertTriangle, 
  Handshake, Truck, Package, Users, FileText, 
  Gavel, Info 
} from "lucide-react";

export default function Policies() {
  const navigate = useNavigate();

  const sections = [
    {
      icon: <Shield className="w-8 h-8 text-orange-600" />,
      title: "Escrow Protection",
      content: (
        <ul className="list-disc pl-5 space-y-2 text-gray-700">
          <li>All payments are held securely until you confirm delivery.</li>
          <li>Funds are only released to the seller when you're satisfied.</li>
          <li>If a dispute arises, our admin team steps in to ensure fairness.</li>
        </ul>
      ),
    },
    {
      icon: <Clock className="w-8 h-8 text-orange-600" />,
      title: "Inspection Window & Auto‑Completion",
      content: (
        <div>
          <p className="mb-2"><strong>For delivery orders:</strong> You have <span className="font-bold">72 hours</span> after delivery to inspect the item and report any issues. If you do not open a dispute within this window, the order will automatically complete and funds will be released to the seller.</p>
          <p><strong>For pickup orders:</strong> Inspect the item carefully before confirming pickup. After confirmation, the sale is final and no disputes can be opened.</p>
        </div>
      ),
    },
    {
      icon: <RefreshCw className="w-8 h-8 text-orange-600" />,
      title: "Refund Policy",
      content: (
        <ul className="list-disc pl-5 space-y-2 text-gray-700">
          <li><strong>Full refund:</strong> If the item never arrived, is damaged, wrong, or fake – we'll help you return it for a full refund. The seller pays return shipping if they are at fault.</li>
          <li><strong>Partial refund:</strong> For minor issues (e.g., missing accessories, slight damage), you may receive up to 30% of the item value.</li>
          <li>If you change your mind or ordered the wrong item, you may still return it, but you will be responsible for return shipping costs.</li>
        </ul>
      ),
    },
    {
      icon: <Scale className="w-8 h-8 text-orange-600" />,
      title: "Dispute Resolution",
      content: (
        <ul className="list-disc pl-5 space-y-2 text-gray-700">
          <li>Open a dispute within the inspection window if something's wrong. Provide clear evidence (photos, videos, tracking numbers, message history).</li>
          <li>Our admins review all evidence and make a fair decision based on our constitution.</li>
          <li>If you don't open a dispute within 72 hours, the order completes automatically and funds are released to the seller.</li>
          <li>You may appeal a decision within 7 days if you have new, compelling evidence.</li>
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
          <li>Serious offenses (e.g., selling counterfeit goods, scamming) lead to immediate permanent ban.</li>
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
          <li>Fraudulent, counterfeit, or stolen goods.</li>
          <li>We uphold ethical trade: no deception, clear descriptions, and fair treatment for all.</li>
        </ul>
      ),
    },
    {
      icon: <Handshake className="w-8 h-8 text-orange-600" />,
      title: "Seller Responsibilities",
      content: (
        <ul className="list-disc pl-5 space-y-2 text-gray-700">
          <li>Ship within 72 hours of order, or arrange pickup promptly.</li>
          <li>Provide accurate product descriptions and clear photos.</li>
          <li>Respond to buyer messages within 24 hours.</li>
          <li>Accept returns for valid issues and issue refunds promptly.</li>
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
          <li>If an item hasn't arrived after 7 days past the estimated delivery date, open a dispute.</li>
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
          <li>Do not abuse the dispute system; fraudulent disputes may lead to account suspension.</li>
        </ul>
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
    // {
    //   icon: <FileText className="w-8 h-8 text-orange-600" />,
    //   title: "Constitution for Admins",
    //   content: (
    //     <p className="text-gray-700">
    //       Our internal constitution guides admins in resolving disputes fairly and consistently. 
    //       It covers detailed scenarios (damaged items, fraud, etc.) and ensures accountability. 
    //       <button 
    //         onClick={() => navigate("/admin-constitution")} 
    //         className="text-orange-600 hover:underline ml-1 font-medium"
    //       >
    //         View admin version →
    //       </button>
    //     </p>
    //   ),
    // },
    {
      icon: <Info className="w-8 h-8 text-orange-600" />,
      title: "Policy Updates",
      content: (
        <p className="text-gray-700">
          We may update these policies from time to time. Continued use of the platform means you accept the latest version. 
          The effective date of the current version is shown at the bottom of this page.
        </p>
      ),
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        <h1 className="text-3xl font-bold text-blue-900 mb-2">Marketplace Policies</h1>
        <p className="text-gray-600 mb-8">Our commitment to safe, fair, and halal commerce.</p>

        <div className="space-y-6">
          {sections.map((section, index) => (
            <div key={index} className="bg-white rounded-xl border p-6 shadow-sm hover:shadow-md transition">
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
          <p className="text-lg text-gray-800">
            Need help? Our support team is here for you.
          </p>
          <button
            onClick={() => navigate("/support")}
            className="mt-3 bg-orange-600 text-white px-6 py-2 rounded-lg hover:bg-orange-700"
          >
            Contact Support
          </button>
        </div>

        <p className="text-sm text-gray-500 mt-6 border-t pt-4">
          These policies are effective as of March 2026. Mafdesh reserves the right to modify these policies at any time. 
          Your continued use of the platform constitutes acceptance of the latest version.
        </p>
      </main>
      <Footer />
    </div>
  );
}