import React from "react";
import { useEffect, useState } from "react";
import Navbar from "./Navbar";
import {
  getActiveSession,
  isMissingAuthSessionError,
  subscribeToAuthStateChanges,
} from "../services/authSessionService";
import { getStoredUser } from "../utils/storage";

export default function AuthNavbarWrapper() {
  const [, setUser] = useState(() => getStoredUser());

  useEffect(() => {
    const loadSession = async () => {
      try {
        const nextSession = await getActiveSession();
        const nextUser = nextSession?.user || null;

        if (!nextUser) {
          setUser(getStoredUser());
          return;
        }

        setUser(nextUser);
      } catch (error) {
        if (!isMissingAuthSessionError(error)) {
          console.error('Navbar auth session load failed:', error);
        }
        setUser(getStoredUser());
      }
    };

    loadSession();

    const unsubscribe = subscribeToAuthStateChanges(({ session }) => {
      setUser(session?.user || getStoredUser());
    });

    return () => unsubscribe();
  }, []);

  return <Navbar />;
}
