import React from "react";
import { useEffect, useState } from "react";
import Navbar from "./Navbar";
import { supabase } from "../supabaseClient";
import { getSessionWithRetry } from "../utils/authResilience";

export default function AuthNavbarWrapper() {
  const [user, setUser] = useState(() =>
    JSON.parse(localStorage.getItem('mafdesh_user') || 'null')
  );

  useEffect(() => {
    const loadSession = async () => {
      try {
        const { data } = await getSessionWithRetry(supabase.auth);
        const nextUser = data?.session?.user || null;

        if (!nextUser) {
          setUser(JSON.parse(localStorage.getItem('mafdesh_user') || 'null'));
          return;
        }

        setUser(nextUser);
      } catch (error) {
        console.error('Navbar auth session load failed:', error);
        setUser(JSON.parse(localStorage.getItem('mafdesh_user') || 'null'));
      }
    };

    loadSession();

    // Listen for auth changes
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user || JSON.parse(localStorage.getItem('mafdesh_user') || 'null'));
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  return <Navbar />;
}
