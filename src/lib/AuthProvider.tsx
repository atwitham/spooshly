"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  householdId: string | null;
  displayName: string | null;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  householdId: null,
  displayName: null,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setHouseholdId(null);
      setDisplayName(null);
      return;
    }
    supabase
      .from("household_members")
      .select("household_id, display_name")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        setHouseholdId(data?.household_id ?? null);
        setDisplayName(data?.display_name ?? session.user.email ?? null);
      });
  }, [session]);

  return (
    <AuthContext.Provider
      value={{ user: session?.user ?? null, session, loading, householdId, displayName }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
