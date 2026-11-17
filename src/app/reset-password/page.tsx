"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthProvider";
import { supabase } from "@/lib/supabaseClient";
import { Wordmark } from "@/components/ui";

/** Opened from the "reset your password" email. The link signs you in; you pick a new password here. */
export default function ResetPasswordPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [waited, setWaited] = useState(false);

  // The session arrives from the link a moment after the page opens.
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 2500);
    return () => clearTimeout(t);
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError("Those passwords don’t match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    setDone(true);
    setTimeout(() => router.replace("/"), 1200);
  }

  const shell = (body: React.ReactNode) => (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex justify-center">
          <Wordmark size={34} />
        </div>
        {body}
      </div>
    </div>
  );

  if (!user) {
    if (loading || !waited) return shell(<p className="text-center text-sm text-muted">Opening your reset link…</p>);
    return shell(
      <div className="text-center">
        <h1 className="d text-[22px] font-extrabold">This link has expired</h1>
        <p className="mt-2 text-[15px] text-muted">Reset links only work once and for a short time. Request a new one from the sign-in screen.</p>
        <button type="button" onClick={() => router.replace("/login")} className="btn-primary mt-6 h-[54px] w-full rounded-[18px] text-base shadow-glow">
          Back to sign in
        </button>
      </div>
    );
  }

  if (done) return shell(<p className="text-center text-[15px] font-bold text-primary">Password saved. Opening your kitchen…</p>);

  return shell(
    <form onSubmit={save} className="flex flex-col gap-3">
      <h1 className="d text-center text-[22px] font-extrabold">Choose a new password</h1>
      <p className="mb-2 text-center text-sm text-muted break-all">{user.email}</p>
      <input
        type="password"
        required
        minLength={6}
        autoComplete="new-password"
        placeholder="New password (6+ characters)"
        aria-label="New password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="fld"
      />
      <input
        type="password"
        required
        minLength={6}
        autoComplete="new-password"
        placeholder="Type it again"
        aria-label="Confirm new password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className="fld"
      />
      {error && (
        <p role="alert" className="text-sm text-danger-ink">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn-primary h-[54px] rounded-[18px] text-base shadow-glow">
        {busy ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}
