import React from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/FooterSlim";
import { ArrowLeft, Clock, RefreshCw, Scale, Shield } from "lucide-react";

export default function RefundPolicy() {
  const effectiveDate = new Date().toLocaleDateString("en-NG", {
    month: "long",
    year: "numeric",
  });

  const sections = [
    {
      icon: <Shield className="w-7 h-7 text-orange-600" />,
      title: "Buyer Protection",
      content: (
        <div className="space-y-3 text-gray-700">
          <p>
            Mafdesh holds payment in escrow while the seller fulfills your order. Funds are only
            released when you confirm delivery or pickup, when the inspection window expires, or
            when admin resolves a dispute.
          </p>
          <p>
            For pickup orders, inspect the item carefully before confirming pickup. Once you
            confirm pickup, the transaction is final and refund or dispute access closes.
          </p>
        </div>
      ),
    },
    {
      icon: <RefreshCw className="w-7 h-7 text-orange-600" />,
      title: "Refund Decisions",
      content: (
        <div className="space-y-3 text-gray-700">
          <p>
            A full refund is awarded when the seller is clearly at fault - for example, the wrong
            item was sent, the item is fake, the item never arrived, or the item arrived
            significantly damaged.
          </p>
          <p>
            Partial refunds are determined by admin based on evidence and fault. The amount is at
            admin discretion up to the full order value.
          </p>
          <p>
            Mafdesh admin mediates all refund decisions based on evidence provided. Physical
            returns may be required at admin discretion.
          </p>
          <p>
            Refunds are processed by the Mafdesh team. Processing time is 5 to 7 business days
            after admin approval. You will be notified when your refund is processed.
          </p>
        </div>
      ),
    },
    {
      icon: <Clock className="w-7 h-7 text-orange-600" />,
      title: "When Refunds Happen Automatically",
      content: (
        <div className="space-y-3 text-gray-700">
          <p>
            If the seller does not ship or prepare your paid order within the allowed fulfillment
            window, the order is automatically refunded.
          </p>
          <p>
            If your item has not arrived within 14 days of shipment, Mafdesh will automatically
            initiate a refund review. You do not need to take action - you will be notified of the
            outcome.
          </p>
          <p>
            If a pickup order is never collected within the allowed pickup window, the order is
            automatically refunded.
          </p>
        </div>
      ),
    },
    {
      icon: <Scale className="w-7 h-7 text-orange-600" />,
      title: "How Disputes Are Resolved",
      content: (
        <div className="space-y-3 text-gray-700">
          <p>
            When you open a dispute, our admin team reviews all evidence including photos, order
            details, and communication history.
          </p>
          <p>Providing photos or videos strengthens your dispute but is not mandatory for submission.</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Award a full refund to the buyer</li>
            <li>Award a partial refund to the buyer</li>
            <li>Release funds to the seller</li>
          </ul>
          <p>
            If evidence supports the seller's position, funds are released to the seller and the
            dispute is closed.
          </p>
          <p>All decisions are final. We aim to resolve disputes within 48 hours of submission.</p>
        </div>
      ),
    },
    {
      icon: <Shield className="w-7 h-7 text-orange-600" />,
      title: "Before Seller Fulfillment",
      content: (
        <div className="space-y-3 text-gray-700">
          <p>
            For paid orders that are still awaiting seller fulfillment, buyers can request a
            refund before the seller marks the order as shipped or ready for pickup.
          </p>
          <p>
            Once a refund request is submitted, fulfillment pauses while admin reviews the case.
          </p>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        <Link
          to="/policies"
          className="inline-flex items-center gap-2 text-blue-600 hover:text-orange-600 mb-5"
        >
          <ArrowLeft size={18} />
          Back to Policies
        </Link>

        <h1 className="text-3xl font-bold text-blue-900 mb-2">Refund Policy</h1>
        <p className="text-gray-600 mb-8">
          How Mafdesh handles refunds, disputes, escrow protection, and order issues.
        </p>

        <div className="space-y-6">
          {sections.map((section) => (
            <section key={section.title} className="bg-white rounded-xl border p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">{section.icon}</div>
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-blue-900 mb-3">{section.title}</h2>
                  {section.content}
                </div>
              </div>
            </section>
          ))}
        </div>

        <p className="text-sm text-gray-500 mt-6 border-t pt-4">
          This refund policy is effective as of {effectiveDate}. Mafdesh may update this page as
          marketplace processes evolve.
        </p>
      </main>
      <Footer />
    </div>
  );
}
