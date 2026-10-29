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
  /** True once we've looked up (and if needed, accepted) the household. */
  membershipChecked: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  householdId: null,
  displayName: null,
  membershipChecked: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [membershipChecked, setMembershipChecked] = useState(false);

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
      setMembershipChecked(false);
      return;
    }
    const user = session.user;
    let cancelled = false;
    (async () => {
      const lookup = () =>
        supabase.from("household_members").select("household_id, display_name").eq("user_id", user.id).maybeSingle();
      let { data } = await lookup();
      if (!data) {
        // Invited? Join the household that invited this email.
        const { data: joined } = await supabase.rpc("accept_household_invite");
        if (joined) ({ data } = await lookup());
      }
      if (cancelled) return;
      setHouseholdId(data?.household_id ?? null);
      setDisplayName(data?.display_name ?? user.email ?? null);
      setMembershipChecked(true);
    })();
    return () => {
      cancelled = true;
    };
    // Only re-check when the signed-in person changes, not on token refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  return (
    <AuthContext.Provider
      value={{ user: session?.user ?? null, session, loading, householdId, displayName, membershipChecked }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
