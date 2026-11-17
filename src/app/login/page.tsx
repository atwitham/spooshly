"use client";

import { useEffect, useState } from "react";
import { MailCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Wordmark } from "@/components/ui";

type Mode = "signin" | "signup" | "forgot";
/** After a form is sent, the form is replaced by a "check your email" screen. */
type Sent = { kind: "confirm" | "reset"; email: string } | null;

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("signin");
  const [error, setError] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [invited, setInvited] = useState(false);
  const [sent, setSent] = useState<Sent>(null);
  const [resent, setResent] = useState(false);

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

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setExists(false);
    setUnconfirmed(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setExists(false);
    setUnconfirmed(false);
    setSubmitting(true);
    const em = email.trim();
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: em, password });
        if (error) {
          if (/confirm/i.test(error.message)) {
            setUnconfirmed(true);
            setError("This email hasn’t been confirmed yet. Tap the link in your confirmation email, or send a new one.");
          } else if (/invalid/i.test(error.message)) {
            setError("That email and password don’t match. Check the password, or reset it below.");
          } else setError(error.message);
        }
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: em, password, options: { emailRedirectTo: window.location.origin } });
        if (error) {
          if (/already|registered|exists/i.test(error.message)) setExists(true);
          else setError(error.message);
        } else if (data.user && (data.user.identities?.length ?? 0) === 0) {
          // Supabase's quiet "this email already has an account" (no email is sent).
          setExists(true);
        } else if (!data.session) {
          setPassword("");
          setSent({ kind: "confirm", email: em });
        }
        // With a session, email confirmation is off and they're signed in already.
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(em, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) setError(error.message);
        else setSent({ kind: "reset", email: em });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function resend(to = sent?.email ?? email.trim()) {
    setError(null);
    const { error } = await supabase.auth.resend({ type: "signup", email: to, options: { emailRedirectTo: window.location.origin } });
    if (error) setError(error.message);
    else {
      setResent(true);
      if (!sent) setSent({ kind: "confirm", email: to });
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="mb-6 flex justify-center">
            <Wordmark size={34} />
          </div>
          <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-tint text-primary">
            <MailCheck size={30} strokeWidth={2} aria-hidden />
          </span>
          <h1 className="d text-[24px] font-extrabold">Check your email</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            We sent a link to <strong className="break-all text-ink">{sent.email}</strong>.{" "}
            {sent.kind === "confirm"
              ? invited
                ? "Tap it to confirm your account, then sign in here. You’ll land right in the shared kitchen."
                : "Tap it to confirm your account, then sign in here."
              : "Tap it to choose a new password."}
          </p>
          <p className="mt-3 text-[13px] text-muted">It can take a minute. Check spam if you don’t see it.</p>
          {error && <p className="mt-3 text-sm text-danger-ink">{error}</p>}
          <button
            type="button"
            onClick={() => {
              setSent(null);
              setResent(false);
              switchMode("signin");
            }}
            className="btn-primary mt-6 h-[54px] w-full rounded-[18px] text-base shadow-glow"
          >
            Back to sign in
          </button>
          {sent.kind === "confirm" && (
            <button type="button" onClick={() => resend()} disabled={resent} className="mt-3 h-11 w-full text-sm font-bold text-primary disabled:text-muted">
              {resent ? "Sent again" : "Didn’t get it? Send again"}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setSent(null);
              setResent(false);
            }}
            className="h-11 w-full text-sm font-semibold text-muted"
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  const heading =
    mode === "forgot"
      ? "Enter your email and we’ll send a link to set a new password."
      : invited
        ? null
        : mode === "signup"
          ? "Create your account"
          : "Sign in to see what’s in stock at home";

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-3 flex justify-center">
          <Wordmark size={34} />
        </div>
        {invited && mode !== "forgot" ? (
          <div className="mb-6 rounded-2xl bg-primary-tint px-4 py-3 text-center text-[15px] text-[#0F3D22]">
            <strong>You’ve been invited to a shared kitchen.</strong>
            <br />
            {mode === "signup" ? "Create your account with the email the invite was sent to." : "Sign in with the email the invite was sent to."}
          </div>
        ) : (
          <p className="mb-6 text-center text-[15px] text-muted">{heading}</p>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input type="email" required autoComplete="email" placeholder="Email" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="fld" />
          {mode !== "forgot" && (
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              placeholder={mode === "signup" ? "Choose a password (6+ characters)" : "Password"}
              aria-label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="fld"
            />
          )}
          {exists && (
            <div role="alert" className="rounded-2xl bg-warn-tint px-4 py-3 text-sm leading-snug text-warn-ink">
              <strong>This email already has an account.</strong> Sign in with the password you set before
              {invited ? " and you’ll join the shared kitchen." : "."}
              <div className="mt-2 flex gap-4">
                <button type="button" className="font-bold underline" onClick={() => switchMode("signin")}>
                  Sign in
                </button>
                <button type="button" className="font-bold underline" onClick={() => switchMode("forgot")}>
                  Forgot password?
                </button>
              </div>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger-ink">
              {error}
              {unconfirmed && (
                <button type="button" className="ml-1 font-bold underline" onClick={() => resend(email.trim())}>
                  Send a new link
                </button>
              )}
            </p>
          )}
          <button type="submit" disabled={submitting} className="btn-primary h-[54px] rounded-[18px] text-base shadow-glow">
            {submitting ? "One moment…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
          </button>
        </form>
        {mode === "signin" && (
          <button type="button" className="mt-2 h-11 w-full text-center text-sm font-semibold text-muted" onClick={() => switchMode("forgot")}>
            Forgot password?
          </button>
        )}
        <button
          type="button"
          className="mt-1 h-11 w-full text-center text-sm font-bold text-primary"
          onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "New here? Create an account" : mode === "signup" ? "Already have an account? Sign in" : "Back to sign in"}
        </button>
      </div>
    </div>
  );
}
