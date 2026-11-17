import { NextRequest, NextResponse } from "next/server";
import { createClient, type User } from "@supabase/supabase-js";

/**
 * Invite links: /join/<token>.
 *
 * GET  → who invited you and to which kitchen (so the join page can greet you).
 * POST → creates your login with the password you chose (already confirmed,
 *        so there's no "check your email" step), adds you to the household,
 *        and marks the invite used. The browser then signs in normally.
 *
 * Runs on the server with SUPABASE_SERVICE_ROLE_KEY, which never reaches the
 * browser. The invite token (a random UUID only sent to the invitee) is what
 * authorizes this.
 */
export const dynamic = "force-dynamic";

const INVITE_DAYS = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const notConfigured = () =>
  NextResponse.json(
    { error: "Invites aren’t switched on yet. Add SUPABASE_SERVICE_ROLE_KEY in Vercel." },
    { status: 501 }
  );

async function loadInvite(db: NonNullable<ReturnType<typeof admin>>, token: string) {
  if (!UUID.test(token)) return null;
  const { data } = await db
    .from("household_invites")
    .select("id, household_id, email, display_name, invited_by, created_at, accepted_at")
    .eq("token", token)
    .maybeSingle();
  return data;
}

function status(inv: { accepted_at: string | null; created_at: string }) {
  if (inv.accepted_at) return "used";
  if (Date.now() - new Date(inv.created_at).getTime() > INVITE_DAYS * 86400000) return "expired";
  return "pending";
}

async function findUserByEmail(db: NonNullable<ReturnType<typeof admin>>, email: string): Promise<User | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const db = admin();
  if (!db) return notConfigured();
  const inv = await loadInvite(db, params.token);
  if (!inv) return NextResponse.json({ status: "not_found" });

  const [{ data: household }, { data: inviter }] = await Promise.all([
    db.from("households").select("name").eq("id", inv.household_id).maybeSingle(),
    inv.invited_by
      ? db.from("household_members").select("display_name").eq("user_id", inv.invited_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return NextResponse.json({
    status: status(inv),
    email: inv.email,
    name: inv.display_name,
    householdName: household?.name ?? "the kitchen",
    inviterName: inviter?.display_name ?? null,
  });
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const db = admin();
  if (!db) return notConfigured();
  const inv = await loadInvite(db, params.token);
  if (!inv) return NextResponse.json({ error: "This invite link isn’t valid." }, { status: 404 });
  const st = status(inv);
  if (st === "used") return NextResponse.json({ code: "used", error: "This invite has already been used. Sign in instead." }, { status: 409 });
  if (st === "expired") return NextResponse.json({ code: "expired", error: "This invite has expired. Ask for a new one." }, { status: 410 });

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim() || inv.display_name || email.split("@")[0];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Use at least 8 characters for your password." }, { status: 400 });

  try {
    let user = await findUserByEmail(db, email);
    if (user && user.email_confirmed_at) {
      // A real, confirmed account already exists: don't change its password.
      // Signing in with it joins the household (accept_household_invite matches the email).
      if (email !== inv.email.toLowerCase()) {
        return NextResponse.json(
          { code: "has_account", error: `There’s already an account for ${email}. Use the email the invite was sent to, or sign in.` },
          { status: 409 }
        );
      }
      return NextResponse.json({ code: "has_account", error: "You already have an account. Sign in with your password to join." }, { status: 409 });
    }
    if (user) {
      // Started signing up before but never confirmed: finish that account.
      const { data, error } = await db.auth.admin.updateUserById(user.id, { password, email_confirm: true, user_metadata: { name } });
      if (error) throw error;
      user = data.user;
    } else {
      const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
      if (error) throw error;
      user = data.user;
    }

    const { data: existing } = await db.from("household_members").select("household_id").eq("user_id", user.id).maybeSingle();
    if (existing && existing.household_id !== inv.household_id) {
      return NextResponse.json({ error: "This account already belongs to a different kitchen." }, { status: 409 });
    }
    if (!existing) {
      const { error } = await db.from("household_members").insert({ user_id: user.id, household_id: inv.household_id, display_name: name });
      if (error) throw error;
    }
    await db.from("household_invites").update({ accepted_at: new Date().toISOString(), accepted_by: user.id }).eq("id", inv.id);
    return NextResponse.json({ ok: true, email });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Something went wrong.";
    if (/password/i.test(msg)) return NextResponse.json({ error: msg }, { status: 400 });
    return NextResponse.json({ error: "Couldn’t finish joining. Try again in a moment." }, { status: 500 });
  }
}
