"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail, Share2, UserPlus, X } from "lucide-react";
import { useAuth } from "@/lib/AuthProvider";
import { type Invite, type Person, cancelInvite, createInvite, fetchHousehold, inviteLink } from "@/lib/db";
import { fmtDay } from "@/lib/dates";

function inviteMessage(name: string, email: string) {
  const first = name.trim().split(" ")[0];
  const site = window.location.host;
  return [
    `Hi${first ? ` ${first}` : ""}! I added you to our Splooshly kitchen so we can share the same inventory and shopping list.`,
    "",
    `1. Open your invite: ${inviteLink(email)}`,
    "2. Choose a password and tap Create account (your email is already filled in).",
    "3. Tap the confirmation link we email you.",
    `4. Sign in at ${site}, then tap Share › Add to Home Screen so it opens like an app.`,
  ].join("\n");
}

/** Settings › Household: who's in the kitchen, and invite someone by email. */
export default function Household() {
  const { householdId, user } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [ready, setReady] = useState<boolean | null>(null);
  const [form, setForm] = useState(false);
  /** Invite waiting on a second tap before it's cancelled (no fat-thumb removals). */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<{ name: string; email: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!householdId) return;
    try {
      const h = await fetchHousehold(householdId);
      setReady(h.ready);
      if (h.ready) {
        setPeople(h.people);
        setInvites(h.invites);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn’t load your household.");
    }
  }, [householdId]);
  useEffect(() => {
    load();
  }, [load]);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!householdId || !validEmail) return;
    if (email.trim().toLowerCase() === user?.email?.toLowerCase()) {
      setErr("That’s your own email. Use the email of the person you’re inviting.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const clean = await createInvite(householdId, email, name, user?.id ?? null);
      setSent({ name, email: clean });
      setForm(false);
      setName("");
      setEmail("");
      await load();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Couldn’t create the invite.");
    } finally {
      setBusy(false);
    }
  }

  async function share(n: string, em: string) {
    const text = inviteMessage(n, em);
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join our Splooshly kitchen", text });
        return;
      } catch {
        /* cancelled */
      }
    } else {
      await navigator.clipboard?.writeText(text);
      setErr(null);
      alertCopied();
    }
  }
  const [copied, setCopied] = useState(false);
  const alertCopied = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };
  const mailto = (n: string, em: string) =>
    `mailto:${encodeURIComponent(em)}?subject=${encodeURIComponent("Join our Splooshly kitchen")}&body=${encodeURIComponent(inviteMessage(n, em).replace(/\n/g, "\r\n"))}`;

  const row = "flex min-h-[60px] items-center gap-3 border-t border-divider px-4 py-2.5 first:border-t-0";

  return (
    <section aria-labelledby="household-h" className="flex flex-col gap-2">
      <h2 id="household-h" className="eyebrow">
        Household
      </h2>
      <div className="card overflow-hidden">
        {ready === false && (
          <p className="p-4 text-sm text-muted">
            Inviting people needs a quick database update first: run <code>supabase/migrations/2026-10-29_household_invites.sql</code> in Supabase.
          </p>
        )}
        {people.map((p) => (
          <div key={p.user_id} className={row}>
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-primary-tint text-sm font-extrabold text-primary-tint-ink">
              {(p.display_name ?? p.email ?? "?").charAt(0).toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-semibold">
                {p.display_name ?? p.email}
                {p.is_me && <span className="font-normal text-muted"> (you)</span>}
              </span>
              <span className="truncate text-xs text-muted">{p.email}</span>
            </span>
          </div>
        ))}
        {invites.map((inv) =>
          confirming === inv.id ? (
            <div key={inv.id} role="alertdialog" aria-label={`Cancel invite for ${inv.email}?`} className={`${row} !flex-col !items-stretch gap-2.5 bg-danger-tint py-3.5`}>
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-bold text-danger-ink">Cancel {inv.display_name ?? inv.email}’s invite?</span>
                <span className="text-xs text-danger-ink">Their link will stop working. You can invite them again later.</span>
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setConfirming(null)} className="h-11 rounded-xl bg-surface px-3.5 text-sm font-bold" autoFocus>
                  Keep
                </button>
                <button
                  type="button"
                  disabled={removing}
                  onClick={async () => {
                    setRemoving(true);
                    try {
                      await cancelInvite(inv.id);
                      await load();
                    } catch (e) {
                      setErr(e instanceof Error ? e.message : "Couldn’t cancel the invite.");
                    } finally {
                      setRemoving(false);
                      setConfirming(null);
                    }
                  }}
                  className="h-11 rounded-xl bg-danger px-3.5 text-sm font-bold text-white"
                >
                  {removing ? "Cancelling…" : "Cancel invite"}
                </button>
              </div>
            </div>
          ) : (
            <div key={inv.id} className={row}>
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-warn-tint text-warn-ink">
                <Mail size={18} strokeWidth={1.9} aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-semibold">{inv.display_name ?? inv.email}</span>
                <span className="truncate text-xs text-muted">Invited {fmtDay(inv.created_at)} · hasn’t joined yet</span>
              </span>
              <button type="button" aria-label={`Send ${inv.email}'s invite again`} onClick={() => share(inv.display_name ?? "", inv.email)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-chip">
                <Share2 size={18} aria-hidden />
              </button>
              <button
                type="button"
                aria-label={`Cancel invite for ${inv.email}`}
                onClick={() => setConfirming(inv.id)}
                className="flex h-11 w-11 items-center justify-center rounded-xl text-muted"
              >
                <X size={18} aria-hidden />
              </button>
            </div>
          )
        )}

        {ready !== false && !form && (
          <button type="button" onClick={() => (setForm(true), setSent(null), setErr(null))} className={`${row} w-full text-left text-primary`}>
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-primary text-white">
              <UserPlus size={18} strokeWidth={2} aria-hidden />
            </span>
            <span className="flex-1 text-[15px] font-bold">Invite someone to your kitchen</span>
          </button>
        )}

        {form && (
          <form onSubmit={submit} className="flex flex-col gap-2.5 border-t border-divider p-4 first:border-t-0">
            <p className="m-0 text-[13px] text-muted">They get their own login and share your kitchen, list and insights.</p>
            <label className="flex flex-col gap-1">
              <span className="lbl">Their name</span>
              <input className="fld" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" placeholder="e.g. Codi" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="lbl">Their email</span>
              <input
                className="fld"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setForm(false)} className="h-12 rounded-[14px] bg-chip font-bold">
                Cancel
              </button>
              <button type="submit" disabled={busy || !validEmail} className="btn-primary h-12 rounded-[14px]">
                {busy ? "Saving…" : "Create invite"}
              </button>
            </div>
          </form>
        )}

        {sent && (
          <div className="flex flex-col gap-2.5 border-t border-divider bg-primary-tint p-4">
            <p className="m-0 text-[15px] font-bold text-[#0F3D22]">Invite ready for {sent.name.trim() || sent.email}</p>
            <p className="m-0 text-[13px] leading-snug text-[#2E4A3B]">
              Send them the link. Once they sign up with <strong>{sent.email}</strong>, they’re in.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <a href={mailto(sent.name, sent.email)} className="btn-primary h-12 rounded-[14px] text-[15px]">
                <Mail size={18} aria-hidden />
                Email it
              </a>
              <button type="button" onClick={() => share(sent.name, sent.email)} className="flex h-12 items-center justify-center gap-2 rounded-[14px] bg-surface text-[15px] font-bold">
                <Share2 size={18} aria-hidden />
                {copied ? "Copied" : "Text or share"}
              </button>
            </div>
          </div>
        )}
        {err && (
          <p role="alert" className="m-0 border-t border-divider px-4 py-3 text-sm font-semibold text-danger-ink">
            {err}
          </p>
        )}
      </div>
    </section>
  );
}
