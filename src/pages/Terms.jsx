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
        <p className="text-gray-600 mb-6">Last updated: March 2026</p>

        <div className="bg-white rounded-xl border p-6 space-y-6">
          <section>
            <h2 className="text-xl font-semibold text-blue-900 mb-3">1. Acceptance of Terms</h2>
            <p className="text-gray-700">By accessing or using Mafdesh, you agree to be bound by these Terms. If you do not agree, please do not use our platform.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blue-900 mb-3">2. Account Registration</h2>
            <ul className="list-disc pl-5 space-y-1 text-gray-700">
              <li>You must be at least 16 years old to be a Mafdesh buyer.</li>
              <li>You must be atleast 18 years old to be  a Mafdesh seller</li>
              <li>You are responsible for maintaining the confidentiality of your account.</li>
              <li>You agree to provide accurate and complete information.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blue-900 mb-3">3. User Conduct</h2>
            <p className="text-gray-700 mb-2">You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1 text-gray-700">
              <li>Violate any laws or regulations.</li>
              <li>Impersonate any person or entity.</li>
              <li>Post false, misleading, or fraudulent content.</li>
              <li>Interfere with the proper functioning of the platform.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blue-900 mb-3">4. Marketplace Policies</h2>
            <p className="text-gray-700">Our <button onClick={() => navigate("/policies")} className="text-orange-600 hover:underline">Marketplace Policies</button> are incorporated into these Terms. They cover escrow, refunds, disputes, and prohibited items.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blue-900 mb-3">5. Limitation of Liability</h2>
            <p className="text-gray-700">To the fullest extent permitted by law, Mafdesh shall not be liable for any indirect, incidental, or consequential damages arising from your use of the platform.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blue-900 mb-3">6. Termination</h2>
            <p className="text-gray-700">We may suspend or terminate your account for violations of these Terms, without prior notice.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blue-900 mb-3">7. Changes to Terms</h2>
            <p className="text-gray-700">We may update these Terms from time to time. Continued use after changes constitutes acceptance.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blue-900 mb-3">8. Contact</h2>
            <p className="text-gray-700">For questions, please <button onClick={() => navigate("/support")} className="text-orange-600 hover:underline">contact support</button>.</p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
