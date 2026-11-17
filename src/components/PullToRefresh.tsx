"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

const TRIGGER = 72; // px of (damped) pull needed to refresh
const MAX = 110;

/**
 * Hold and drag down from the top of the page to refresh.
 * Only starts when the page is already scrolled to the top, so normal
 * scrolling is never hijacked.
 */
export default function PullToRefresh({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const active = useRef(false);
  const pullRef = useRef(0);
  const busyRef = useRef(false);

  useEffect(() => {
    const setP = (v: number) => {
      pullRef.current = v;
      setPull(v);
    };
    const blocked = (t: EventTarget | null) =>
      t instanceof Element && !!t.closest("input,textarea,select,[role=menu],[role=dialog],[data-no-ptr]");

    const onStart = (e: TouchEvent) => {
      if (busyRef.current || e.touches.length !== 1 || window.scrollY > 0 || blocked(e.target)) {
        start.current = null;
        return;
      }
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      active.current = false;
    };
    const onMove = (e: TouchEvent) => {
      if (!start.current) return;
      const dy = e.touches[0].clientY - start.current.y;
      const dx = e.touches[0].clientX - start.current.x;
      if (!active.current) {
        // Only take over for a clear downward drag from the very top.
        if (dy > 8 && Math.abs(dy) > Math.abs(dx) * 1.5 && window.scrollY <= 0) active.current = true;
        else if (dy < 0 || Math.abs(dx) > 12) {
          start.current = null;
          return;
        } else return;
      }
      if (e.cancelable) e.preventDefault();
      setP(Math.min(MAX, Math.max(0, dy * 0.5)));
    };
    const onEnd = async () => {
      if (!start.current) return;
      start.current = null;
      if (!active.current) return;
      active.current = false;
      if (pullRef.current >= TRIGGER) {
        busyRef.current = true;
        setBusy(true);
        setP(56);
        try {
          await Promise.all([onRefresh(), new Promise((r) => setTimeout(r, 450))]);
        } finally {
          busyRef.current = false;
          setBusy(false);
          setP(0);
        }
      } else setP(0);
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [onRefresh]);

  const ready = pull >= TRIGGER || busy;
  const dragging = !!start.current && active.current;
  return (
    <div
      aria-hidden={!busy}
      role={busy ? "status" : undefined}
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center"
      style={{
        top: "env(safe-area-inset-top)",
        transform: `translateY(${pull - 48}px)`,
        opacity: pull === 0 ? 0 : Math.min(1, pull / 40),
        transition: dragging ? "none" : "transform .25s ease, opacity .25s ease",
      }}
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-full bg-surface shadow-menu ${ready ? "text-primary" : "text-muted"}`}>
        <RefreshCw
          size={20}
          strokeWidth={2.2}
          className={busy ? "animate-spin" : ""}
          style={busy ? undefined : { transform: `rotate(${pull * 3}deg)` }}
        />
        {busy && <span className="sr-only">Refreshing</span>}
      </span>
    </div>
  );
}
