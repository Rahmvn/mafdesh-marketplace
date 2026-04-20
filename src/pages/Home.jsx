import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import LandingPage from './LandingPage';

export default function Home() {
  const navigate = useNavigate();
  const [storedUser] = useState(() =>
    JSON.parse(localStorage.getItem('mafdesh_user') || 'null')
  );

  useEffect(() => {
    if (storedUser?.role === 'seller') {
      navigate('/seller/dashboard', { replace: true });
      return;
    }

    if (storedUser?.role === 'admin') {
      navigate('/admin/dashboard', { replace: true });
      return;
    }

    if (storedUser?.role === 'buyer') {
      navigate('/marketplace', { replace: true });
      return;
    }

    const checkAuth = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        return;
      }

      const userId = data.session.user.id;

      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();

      if (!userData) {
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
  }, [navigate, storedUser]);

  return <LandingPage />;
}
