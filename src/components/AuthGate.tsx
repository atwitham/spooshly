"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/AuthProvider";
import { KitchenProvider, useKitchen } from "@/lib/KitchenProvider";
import NavBar from "./NavBar";

// Full-screen routes: forms with a pinned action bar, no floating nav.
const FULL_SCREEN = [/^\/add/, /^\/package\//, /^\/settings\/reset/];

function NeedsMigration() {
  return (
    <div className="mx-auto max-w-md px-5 pt-16">
      <h1 className="d text-2xl font-extrabold">One database step first</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        This version of Splooshly needs a small database update before it can open. Your items and history are safe and
        unchanged. In Supabase, open the SQL Editor, paste in <code>supabase/migrations/2026-10-25_redesign.sql</code>{" "}
        from the project, and run it. Then reload this page.
      </p>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { needsMigration, error, ready } = useKitchen();
  const full = FULL_SCREEN.some((r) => r.test(pathname));
  if (needsMigration) return <NeedsMigration />;
  return (
    <div className="min-h-[100dvh]" style={{ paddingBottom: full ? 0 : "calc(env(safe-area-inset-bottom) + 104px)" }}>
      {error && ready && (
        <div role="alert" className="mx-5 mt-4 rounded-2xl bg-danger-tint p-3 text-sm text-danger-ink">
          {error}
        </div>
      )}
      {children}
      {!full && <NavBar />}
    </div>
  );
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, householdId } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";
  const isJoinPage = pathname.startsWith("/join/");

  useEffect(() => {
    if (loading || isJoinPage) return;
    if (!user && !isLoginPage) router.replace("/login");
    if (user && isLoginPage) router.replace("/");
  }, [user, loading, isLoginPage, isJoinPage, router]);

  // Invite pages work whether or not someone is signed in on this phone.
  if (isJoinPage) return <>{children}</>;

  if (loading) {
    return <div className="flex h-[100dvh] items-center justify-center text-primary">Loading…</div>;
  }
  if (!user) return <>{children}</>;

  return (
    <KitchenProvider key={householdId ?? "none"}>
      <Shell>{children}</Shell>
    </KitchenProvider>
  );
}
