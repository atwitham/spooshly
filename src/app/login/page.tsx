"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Logo from "@/components/Logo";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
      } else {
        setInfo(
          "Account created. Check your email to confirm, then sign in. Ask Alec to add you to the household in Supabase."
        );
      }
    }
    setSubmitting(false);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex justify-center">
          <Logo height={32} />
        </div>
        <p className="mb-6 text-center item-meta">
          Sign in to see what&apos;s in stock at home
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          {info && <p className="text-sm" style={{ color: "#17A45E" }}>{info}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg py-2 font-semibold text-paper disabled:opacity-60"
            style={{ background: "#17A45E" }}
          >
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          className="mt-4 w-full text-center text-sm underline"
          style={{ color: "#17A45E" }}
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
