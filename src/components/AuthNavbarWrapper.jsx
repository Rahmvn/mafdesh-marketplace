import React from "react";
import { useEffect, useState } from "react";
import GuestNavbar from "./GuestNavbar";
import Navbar from "./Navbar";
import { supabase } from "../supabaseClient";

export default function AuthNavbarWrapper() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Initial session
    supabase.auth.getSession().then(({ data }) => {
      setUser(data?.session?.user || null);
    });

    // Listen for auth changes
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user || null);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  if (user) return <Navbar />;
  return <GuestNavbar />;
}