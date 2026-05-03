import React from "react";
import { useEffect, useState } from "react";
import Navbar from "./Navbar";
import { supabase } from "../supabaseClient";
import { getSessionWithRetry } from "../utils/authResilience";
import { getStoredUser } from "../utils/storage";

export default function AuthNavbarWrapper() {
  const [user, setUser] = useState(() => getStoredUser());

  useEffect(() => {
    const loadSession = async () => {
      try {
        const { data } = await getSessionWithRetry(supabase.auth);
        const nextUser = data?.session?.user || null;

        if (!nextUser) {
          setUser(getStoredUser());
          return;
        }

        setUser(nextUser);
      } catch (error) {
        console.error('Navbar auth session load failed:', error);
        setUser(getStoredUser());
      }
    };

    loadSession();

    // Listen for auth changes
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user || getStoredUser());
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  return <Navbar />;
}
