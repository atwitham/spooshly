"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Wordmark } from "@/components/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [invited, setInvited] = useState(false);

  // Invite links look like /login?invite=1&email=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("invite")) {
      setInvited(true);
      setMode("signup");
      const em = params.get("email");
      if (em) setEmail(em);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
      if (error) setError(error.message);
      else if (data.session) setInfo(null); // email confirmation is off: they're signed in already
      else
        setInfo(
          invited
            ? "Account created. Check your email for a confirmation link, then come back and sign in. You’ll land right in the shared kitchen."
            : "Account created. Check your email to confirm, then sign in. Ask someone in your household to invite this email from Settings."
        );
    }
    setSubmitting(false);
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-3 flex justify-center">
          <Wordmark size={34} />
        </div>
        {invited ? (
          <div className="mb-6 rounded-2xl bg-primary-tint px-4 py-3 text-center text-[15px] text-[#0F3D22]">
            <strong>You’ve been invited to a shared kitchen.</strong>
            <br />
            {mode === "signup" ? "Create your account with the email the invite was sent to." : "Sign in with the email the invite was sent to."}
          </div>
        ) : (
          <p className="mb-6 text-center text-[15px] text-muted">Sign in to see what’s in stock at home</p>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input type="email" required autoComplete="email" placeholder="Email" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="fld" />
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            placeholder="Password"
            aria-label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="fld"
          />
          {error && <p className="text-sm text-danger-ink">{error}</p>}
          {info && <p className="text-sm text-primary">{info}</p>}
          <button type="submit" disabled={submitting} className="btn-primary h-[54px] rounded-[18px] text-base shadow-glow">
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
        <button className="mt-4 h-11 w-full text-center text-sm font-bold text-primary" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
