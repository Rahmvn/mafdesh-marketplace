import React from "react";
import { useEffect, useState } from "react";
import GuestNavbar from "./GuestNavbar";
import Navbar from "./Navbar";
import { supabase } from "../supabaseClient";

export default function AuthNavbarWrapper() {
  const [user, setUser] = useState(() =>
    JSON.parse(localStorage.getItem('mafdesh_user') || 'null')
  );

  useEffect(() => {
    // Initial session
    supabase.auth.getSession().then(({ data }) => {
      const nextUser = data?.session?.user || null;
      if (!nextUser) {
        setUser(JSON.parse(localStorage.getItem('mafdesh_user') || 'null'));
        return;
      }

      setUser(nextUser);
    });

    // Listen for auth changes
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user || JSON.parse(localStorage.getItem('mafdesh_user') || 'null'));
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  if (user) return <Navbar />;
  return <GuestNavbar />;
}
