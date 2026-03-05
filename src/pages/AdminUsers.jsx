import React from 'react';
import { Users } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export default function AdminUsers() {
  const handleLogout = () => {
    localStorage.removeItem('mafdesh_user');
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-50 via-white to-orange-50">
      <Navbar onLogout={handleLogout} />
      
      <div className="container mx-auto px-4 py-12 flex-1">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl border-2 border-blue-100 p-12 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full mb-6">
              <Users size={40} className="text-white" />
            </div>
            
            <h1 className="text-4xl font-extrabold text-blue-900 mb-4">
              User Management
            </h1>
            
            <p className="text-blue-700 text-lg mb-8">
              Manage all platform users - buyers, sellers, and administrators.
            </p>
            
            <div className="bg-gradient-to-r from-blue-50 to-orange-50 rounded-xl p-8 border-2 border-dashed border-blue-300">
              <p className="text-blue-800 font-semibold text-xl mb-2">
                🚀 Coming Soon!
              </p>
              <p className="text-blue-600">
                This feature is currently under development. You'll be able to view, moderate, and manage all platform users here.
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <Footer />
    </div>
  );
}
