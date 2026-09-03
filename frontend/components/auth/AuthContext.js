"use client";
// components/auth/AuthContext.js
// Provides useAuth() hook to any component in the app
// Usage: const { user, session, loading, signOut } = useAuth();

import { createContext, useContext, useEffect, useState } from "react";
import { supabase, onAuthChange, signOut as _signOut } from "../../lib/supabase";

const AuthContext = createContext({
  user:    null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load initial session
    if (supabase) {
      supabase.auth.getSession().then(({ data }) => {
        setSession(data?.session || null);
        setUser(data?.session?.user || null);
        setLoading(false);
      });
    } else {
      // No Supabase configured — auth disabled, work as guest
      setLoading(false);
    }

    // Listen for auth state changes (login, logout, token refresh)
    const unsub = onAuthChange((event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user || null);
      setLoading(false);
    });
    return unsub;
  }, []);

  const signOut = async () => {
    try {
      await _signOut();
    } finally {
      setUser(null);
      setSession(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
