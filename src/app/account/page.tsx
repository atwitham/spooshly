"use client";

import { useAuth } from "@/lib/AuthProvider";
import { supabase } from "@/lib/supabaseClient";

export default function AccountPage() {
  const { user, displayName, householdId } = useAuth();

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      <h1 className="mb-4 text-xl font-bold tracking-tight text-deep">Account</h1>
      <div className="mb-4 rounded-card border border-line bg-paper p-4">
        <p className="item-meta">Signed in as</p>
        <p className="item-name">{displayName ?? user?.email}</p>
        <p className="item-meta mt-2">Household</p>
        <p className="font-mono text-xs text-muted">{householdId ?? "Not assigned yet"}</p>
      </div>
      <button
        onClick={() => supabase.auth.signOut()}
        className="w-full rounded-lg border border-red-200 py-2.5 font-medium text-red-600"
      >
        Sign out
      </button>
    </div>
  );
}
