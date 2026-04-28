import React from 'react';
import { Link } from 'react-router-dom';
import landscapeLogo from '../../mafdesh-img/landscape-logo-removebg-preview.png';

export default function FooterSlim() {
  const [storedUser] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem('mafdesh_user') || 'null');
    } catch {
      return null;
    }
  });
  const year = new Date().getFullYear();
  const isBuyer = storedUser?.role === 'buyer';

  return (
    <footer
      className={`mt-auto bg-blue-950 px-4 py-4 text-white ${
        isBuyer ? 'pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-4' : ''
      }`}
    >
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex w-full flex-wrap items-center justify-center gap-3 sm:w-auto sm:flex-nowrap sm:justify-start">
          <img
            src={landscapeLogo}
            alt="Mafdesh"
            className="h-6 w-auto object-contain brightness-0 invert"
          />
          <div className="text-center text-xs text-blue-300 sm:hidden">
            © {year} Mafdesh · Built with ❤️ in Nigeria 🇳🇬
          </div>
        </div>

        <div className="hidden text-center text-xs text-blue-300 sm:block sm:flex-1">
          © {year} Mafdesh · Built with ❤️ in Nigeria 🇳🇬
        </div>

        <div className="flex w-full items-center justify-center gap-4 text-xs text-blue-300 sm:w-auto sm:justify-end">
          <Link to="/privacy" className="transition-colors hover:text-orange-400">
            Privacy Policy
          </Link>
          <Link to="/terms" className="transition-colors hover:text-orange-400">
            Terms
          </Link>
          <Link to="/policies" className="transition-colors hover:text-orange-400">
            Policies
          </Link>
        </div>
      </div>
    </footer>
  );
}
