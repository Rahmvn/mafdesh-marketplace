import React from 'react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LandingPage from './LandingPage';

export default function Home() {
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuthAndRedirect = () => {
      const storedUser = localStorage.getItem('mafdesh_user');
      
      if (storedUser) {
        try {
          const userData = JSON.parse(storedUser);
          
          if (userData.role === 'seller') {
            navigate('/seller/dashboard', { replace: true });
          } else if (userData.role === 'admin') {
            navigate('/admin/dashboard', { replace: true });
          } else if (userData.role === 'buyer') {
            navigate('/dashboard', { replace: true });
          }
        } catch (error) {
          console.error('Error parsing user data:', error);
        }
      }
    };

    checkAuthAndRedirect();
  }, [navigate]);

  return <LandingPage />;
}
