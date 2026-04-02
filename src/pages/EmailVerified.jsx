import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import noBgLogo from '../../mafdesh-img/noBackground-logo.png'; // moved to top

export default function EmailVerified() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mb-8 flex items-center justify-center">
          <img
            src={noBgLogo}
            alt="Mafdesh Logo"
            className="w-auto"
            style={{ height: '120px' }}
          />
        </div>

        <div className="bg-white border border-green-200 rounded-2xl shadow-xl p-10">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-12 h-12 text-green-600" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-blue-900 mb-4">
            Email Confirmed Successfully!
          </h1>

          <p className="text-gray-600 mb-8">
            Your email has been verified. You can now login to Mafdesh.
          </p>

          <Link
            to="/login"
            className="block w-full bg-blue-900 text-white py-3 px-6 rounded-xl font-semibold hover:bg-blue-800 transition-colors"
          >
            Go to Login
          </Link>
        </div>
      </div>
    </div>
  );
}