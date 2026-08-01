"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/AuthProvider";
import NavBar from "./NavBar";
import Header from "./Header";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  useEffect(() => {
    if (loading) return;
    if (!user && !isLoginPage) router.replace("/login");
    if (user && isLoginPage) router.replace("/");
  }, [user, loading, isLoginPage, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-sprout">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <>{children}</>;
  }

  return (
    <div className="pb-20">
      <Header />
      {children}
      <NavBar />
    </div>
  );
}
