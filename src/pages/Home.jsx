import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import LandingPage from './LandingPage';

export default function Home() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        setChecking(false);
        return;
      }

      const userId = data.session.user.id;

      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();

      if (!userData) {
        setChecking(false);
        return;
      }

      if (userData.role === 'seller') {
        navigate('/seller/dashboard', { replace: true });
      } else if (userData.role === 'admin') {
        navigate('/admin/dashboard', { replace: true });
      } else if (userData.role === 'buyer') {
        navigate('/marketplace', { replace: true });
      }
    };

    checkAuth();
  }, [navigate]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-blue-600 font-semibold">Loading...</p>
      </div>
    );
  }

  return <LandingPage />;
}