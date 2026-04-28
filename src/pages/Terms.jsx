import React from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/FooterSlim";

export default function Terms() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        <h1 className="text-3xl font-bold text-blue-900 mb-2">Terms & Conditions</h1>
        <p className="text-gray-600 mb-1">Last updated: March 2026</p>
        <p className="text-gray-700 mb-6">
          Mafdesh is a trusted marketplace that connects buyers and sellers using secure payments, escrow protection, and clear dispute resolution. These Terms form a binding legal agreement between you and Mafdesh.
        </p>

        <div className="bg-white rounded-xl border p-6 space-y-6">
          <section>
            <h2 className="text-xl font-semibold text-blue-900 mb-3">1. Acceptance of Terms</h2>
            <p className="text-gray-700">
              By accessing or using Mafdesh, you agree to comply with these Terms and Conditions, our{" "}
              <button onClick={() => navigate("/policies")} className="text-orange-600 hover:underline">
                Marketplace Policies
              </button>
              , and any additional rules posted on the platform. If you do not agree, you should not use Mafdesh.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blue-900 mb-3">2. Account Registration</h2>
            <ul className="list-disc pl-5 space-y-1 text-gray-700">
              <li>You must be at least 16 years old to be a Mafdesh buyer.</li>
              <li>You must be at least 18 years old to be a Mafdesh seller.</li>
              <li>You are responsible for maintaining the confidentiality of your account.</li>
              <li>You agree to provide accurate and complete information.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blue-900 mb-3">3. Payments and Escrow</h2>
            <p className="text-gray-700">
              Mafdesh may use escrow or protected payment systems to hold funds during transactions.
              Buyers and sellers agree that payouts, refunds, disputes, and order completion follow platform
              rules designed to protect both parties. Any attempt to bypass Mafdesh’s payment system is a
              violation of these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blue-900 mb-3">4. Prohibited Activities</h2>
            <p className="text-gray-700 mb-2">Users must not:</p>
            <ul className="list-disc pl-5 space-y-1 text-gray-700">
              <li>Sell prohibited or illegal items (see our Marketplace Policies for the full list).</li>
              <li>Manipulate transactions, reviews, or ratings.</li>
              <li>Attempt to bypass platform fees or transact outside Mafdesh.</li>
              <li>Use Mafdesh for fraudulent activity, money laundering, or any deceptive practice.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blue-900 mb-3">5. User Conduct</h2>
            <p className="text-gray-700 mb-2">You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1 text-gray-700">
              <li>Violate any laws or regulations.</li>
              <li>Impersonate any person or entity.</li>
              <li>Post false, misleading, or fraudulent content.</li>
              <li>Interfere with the proper functioning of the platform.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blue-900 mb-3">6. Disputes and Liability</h2>
            <p className="text-gray-700">
              Mafdesh facilitates transactions but is not a party to the final sale. We provide escrow and
              dispute resolution tools. To the fullest extent permitted by Nigerian law, Mafdesh shall not be
              liable for any indirect, incidental, or consequential damages arising from your use of the
              platform. All disputes between users should first be raised through our official dispute process.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blue-900 mb-3">7. Termination and Suspension</h2>
            <p className="text-gray-700">
              Mafdesh may suspend, restrict, or permanently terminate accounts that violate these Terms,
              create risk for users, or abuse platform systems (including chargeback fraud, fake disputes, or
              coordinated manipulation). We may take action without prior notice when necessary to protect
              the marketplace.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blue-900 mb-3">8. Changes to Terms</h2>
            <p className="text-gray-700">
              We may update these Terms from time to time. Continued use after changes constitutes acceptance.
              Major changes will be notified via email or platform notice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blue-900 mb-3">9. Governing Law</h2>
            <p className="text-gray-700">
              These Terms are governed by the laws of the Federal Republic of Nigeria. Any legal action
              arising from your use of Mafdesh shall be filed exclusively in the courts of Nigeria.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blue-900 mb-3">10. Contact</h2>
            <p className="text-gray-700">
              For questions or concerns, please{" "}
              <button onClick={() => navigate("/support")} className="text-orange-600 hover:underline">
                contact support
              </button>
              .
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
