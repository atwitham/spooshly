"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Logo from "@/components/Logo";

interface InviteInfo {
  status: "pending" | "used" | "expired" | "not_found";
  email?: string;
  name?: string | null;
  householdName?: string;
  inviterName?: string | null;
  error?: string;
}

/** The page an invite link opens: name, email, password → you're in. */
export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hasAccount, setHasAccount] = useState(false);

  useEffect(() => {
    fetch(`/api/invite/${token}`)
      .then((r) => r.json())
      .then((d: InviteInfo) => {
        setInfo(d);
        setName(d.name ?? "");
        setEmail(d.email ?? "");
      })
      .catch(() => setInfo({ status: "not_found" }));
  }, [token]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      // Signed in as someone else on this phone? Start fresh.
      await supabase.auth.signOut();
      if (hasAccount) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error("That password didn’t work. Try again, or use “Forgot password” on the sign-in screen.");
        router.replace("/");
        return;
      }
      const res = await fetch(`/api/invite/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "has_account") setHasAccount(true);
        throw new Error(data.error ?? "Couldn’t join.");
      }
      const { error } = await supabase.auth.signInWithPassword({ email: data.email, password });
      if (error) throw error;
      router.replace("/");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Couldn’t join.");
      setBusy(false);
    }
  }

  const who = info?.inviterName ? `${info.inviterName} invited you` : "You’re invited";

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-bg px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo height={36} />
        </div>

        {!info ? (
          <p className="text-center text-muted">Loading your invite…</p>
        ) : info.error ? (
          <div className="card p-5 text-center text-[15px]">{info.error}</div>
        ) : info.status !== "pending" ? (
          <div className="card flex flex-col gap-3 p-5 text-center">
            <p className="d m-0 text-xl font-extrabold">
              {info.status === "used" ? "This invite was already used" : info.status === "expired" ? "This invite has expired" : "This invite link isn’t valid"}
            </p>
            <p className="m-0 text-[15px] text-muted">
              {info.status === "used" ? "If it was you, just sign in." : "Ask the person who invited you to send a new one from Settings › Household."}
            </p>
            <Link href="/login" className="btn-primary h-12 rounded-[14px]">
              Go to sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-5 rounded-[22px] bg-ink p-5 text-center text-white">
              <p className="m-0 text-sm font-semibold text-on-dark-muted">{who}</p>
              <p className="d m-0 mt-1 text-2xl font-extrabold text-accent">Join {info.householdName}</p>
              <p className="m-0 mt-2 text-sm text-on-dark-muted">Share the same kitchen, shopping list and insights.</p>
            </div>
            <form onSubmit={join} className="flex flex-col gap-3">
              {!hasAccount && (
                <label className="flex flex-col gap-1">
                  <span className="lbl">Your name</span>
                  <input className="fld" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
                </label>
              )}
              <label className="flex flex-col gap-1">
                <span className="lbl">Email</span>
                <input
                  className="fld"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="lbl">{hasAccount ? "Your password" : "Create a password"}</span>
                <span className="relative">
                  <input
                    className="fld pr-12"
                    type={show ? "text" : "password"}
                    autoComplete={hasAccount ? "current-password" : "new-password"}
                    required
                    minLength={hasAccount ? 1 : 8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={hasAccount ? "" : "At least 8 characters"}
                  />
                  <button
                    type="button"
                    aria-label={show ? "Hide password" : "Show password"}
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-muted"
                  >
                    {show ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
                  </button>
                </span>
              </label>
              {err && (
                <p role="alert" className="m-0 text-sm font-semibold text-danger-ink">
                  {err}
                </p>
              )}
              <button type="submit" disabled={busy || !email || (!hasAccount && password.length < 8)} className="btn-primary mt-1 h-[54px] rounded-[18px] text-base shadow-glow">
                {busy ? "Joining…" : hasAccount ? "Sign in and join" : "Join the kitchen"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
