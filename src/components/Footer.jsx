import React from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin, Shield, Lock, CreditCard, Facebook, Twitter, Instagram, Linkedin } from 'lucide-react';
import landscapeLogo from '../../mafdesh-img/landscape-logo-removebg-preview.png';

export default function Footer() {
  return (
    <footer className="bg-gradient-to-br from-blue-950 via-blue-900 to-blue-950 text-white mt-auto">
      <div className="max-w-full mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-10">
          <div>
            <div className="mb-6">
              <img
                src={landscapeLogo}
                alt="Mafdesh"
                className="w-auto object-contain brightness-0 invert"
                style={{ height: '70px', backgroundColor: 'transparent' }}
              />
              <div className="mt-4">
                <span className="text-[11px] font-bold text-orange-400 tracking-wider">HALAL-COMPLIANT PLATFORM</span>
              </div>
            </div>
            <p className="text-blue-200 text-sm leading-relaxed mb-6">
              Nigeria's most trusted marketplace connecting buyers with verified sellers. Shop with confidence, protected by our secure payment system.
            </p>
            <div className="flex gap-3">
              <a href="https://facebook.com/mafdesh" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-blue-800 hover:bg-orange-600 transition-all flex items-center justify-center group">
                <Facebook size={18} className="group-hover:scale-110 transition-transform" />
              </a>
              <a href="https://twitter.com/mafdesh" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-blue-800 hover:bg-orange-600 transition-all flex items-center justify-center group">
                <Twitter size={18} className="group-hover:scale-110 transition-transform" />
              </a>
              <a href="https://instagram.com/mafdesh" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-blue-800 hover:bg-orange-600 transition-all flex items-center justify-center group">
                <Instagram size={18} className="group-hover:scale-110 transition-transform" />
              </a>
              <a href="https://linkedin.com/company/mafdesh" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-blue-800 hover:bg-orange-600 transition-all flex items-center justify-center group">
                <Linkedin size={18} className="group-hover:scale-110 transition-transform" />
              </a>
            </div>
          </div>

          <div>
            <h3 className="font-bold mb-5 text-orange-400 text-base uppercase tracking-wide">Quick Links</h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link to="/dashboard" className="text-blue-200 hover:text-orange-400 transition-colors inline-flex items-center gap-2 group">
                  <span className="w-0 group-hover:w-2 h-0.5 bg-orange-400 transition-all"></span>
                  Shop Now
                </Link>
              </li>
              <li>
                <Link to="/support" className="text-blue-200 hover:text-orange-400 transition-colors inline-flex items-center gap-2 group">
                  <span className="w-0 group-hover:w-2 h-0.5 bg-orange-400 transition-all"></span>
                  Help Center
                </Link>
              </li>
              <li>
                <a href="#" className="text-blue-200 hover:text-orange-400 transition-colors inline-flex items-center gap-2 group">
                  <span className="w-0 group-hover:w-2 h-0.5 bg-orange-400 transition-all"></span>
                  Become a Seller
                </a>
              </li>
              <li>
                <a href="#" className="text-blue-200 hover:text-orange-400 transition-colors inline-flex items-center gap-2 group">
                  <span className="w-0 group-hover:w-2 h-0.5 bg-orange-400 transition-all"></span>
                  Track Order
                </a>
              </li>
              <li>
                <a href="#" className="text-blue-200 hover:text-orange-400 transition-colors inline-flex items-center gap-2 group">
                  <span className="w-0 group-hover:w-2 h-0.5 bg-orange-400 transition-all"></span>
                  FAQs
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-bold mb-5 text-orange-400 text-base uppercase tracking-wide">Customer Care</h3>
            <ul className="space-y-4 text-sm">
              <li className="flex items-start gap-3 text-blue-200">
                <Mail size={18} className="text-orange-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-white mb-1">Email Us</p>
                  <a href="mailto:support@mafdesh.com" className="hover:text-orange-400 transition-colors">
                    support@mafdesh.com
                  </a>
                </div>
              </li>
              <li className="flex items-start gap-3 text-blue-200">
                <Phone size={18} className="text-orange-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-white mb-1">Call Us</p>
                  <a href="tel:+2348000000000" className="hover:text-orange-400 transition-colors">
                    +234 800 000 0000
                  </a>
                </div>
              </li>
              <li className="flex items-start gap-3 text-blue-200">
                <MapPin size={18} className="text-orange-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-white mb-1">Office</p>
                  <p>Lagos, Nigeria</p>
                </div>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-bold mb-5 text-orange-400 text-base uppercase tracking-wide">Trust & Safety</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3 bg-blue-900/50 p-3 rounded-lg border border-blue-800">
                <Shield size={20} className="text-orange-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-white text-sm mb-1">Verified Sellers</p>
                  <p className="text-blue-200 text-xs">Only trusted sellers allowed</p>
                </div>
              </div>
              <div className="flex items-start gap-3 bg-blue-900/50 p-3 rounded-lg border border-blue-800">
                <Lock size={20} className="text-orange-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-white text-sm mb-1">Secure Payments</p>
                  <p className="text-blue-200 text-xs">Protected by Paystack</p>
                </div>
              </div>
              <div className="flex items-start gap-3 bg-blue-900/50 p-3 rounded-lg border border-blue-800">
                <CreditCard size={20} className="text-orange-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-white text-sm mb-1">Buyer Protection</p>
                  <p className="text-blue-200 text-xs">Escrow system included</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t-2 border-blue-800 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-center md:text-left">
              <p className="text-blue-300 text-sm font-medium">
                &copy; 2025 Mafdesh. All rights reserved.
              </p>
              <p className="text-blue-400 text-xs mt-1">
                Built with ❤️ in Nigeria 🇳🇬
              </p>
            </div>
           {/* // In the legal section at the bottom: */}
<div className="flex flex-wrap justify-center gap-4 text-xs">
  <Link to="/privacy" className="text-blue-300 hover:text-orange-400 transition-colors">Privacy Policy</Link>
  <span className="text-blue-700">•</span>
  <Link to="/terms" className="text-blue-300 hover:text-orange-400 transition-colors">Terms of Service</Link>
  <span className="text-blue-700">•</span>
  <Link to="/policies" className="text-blue-300 hover:text-orange-400 transition-colors">Policies</Link>
  {/* Keep Cookie and Return as placeholders for now, or link to policies if covered */}
</div>
          </div>
        </div>
      </div>
    </footer>
  );
}
