import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import noBgLogo from '../../mafdesh-img/noBackground-logo.png';
import Footer from '../components/FooterSlim';

export default function EmailVerified() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md text-center">
          <div className="mb-8 flex items-center justify-center">
            <img
              src={noBgLogo}
              alt="Mafdesh Logo"
              className="w-auto"
              style={{ height: '120px' }}
            />
          </div>

          <div className="rounded-2xl border border-green-200 bg-white p-10 shadow-xl">
            <div className="mb-6 flex justify-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
                <CheckCircle className="h-12 w-12 text-green-600" />
              </div>
            </div>

            <h1 className="mb-4 text-2xl font-bold text-blue-900">
              Email Confirmed Successfully!
            </h1>

            <p className="mb-8 text-gray-600">
              Your email has been verified. You can now login to Mafdesh.
            </p>

            <Link
              to="/login"
              className="block w-full rounded-xl bg-blue-900 px-6 py-3 font-semibold text-white transition-colors hover:bg-blue-800"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
