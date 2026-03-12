import React from 'react';
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function AdminRoute({ children }) {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    // Check role from your users table
    const { data, error } = await supabase
      .from("users")
      .select("role")
      .eq("id", session.user.id)
      .single();

    if (error || !data || data.role !== "admin") {
      setIsAdmin(false);
    } else {
      setIsAdmin(true);
    }
    setLoading(false);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Checking access...</div>;
  }

  return isAdmin ? children : <Navigate to="/login" replace />;
}