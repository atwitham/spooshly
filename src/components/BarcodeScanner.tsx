"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function BarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let stopped = false;
    let controls: { stop: () => void } | undefined;

    reader
      .decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current!,
        (result) => {
          if (result && !stopped) {
            stopped = true;
            controls?.stop();
            onDetected(result.getText());
          }
        }
      )
      .then((c) => {
        controls = c;
      })
      .catch(() => setError("Couldn't access the camera. Check camera permissions for Safari."));

    return () => {
      stopped = true;
      controls?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black">
      <div className="flex items-center justify-between p-4 text-white">
        <p className="text-sm">Point the camera at a barcode</p>
        <button onClick={onClose} className="rounded bg-white/20 px-3 py-1 text-sm">
          Cancel
        </button>
      </div>
      <div className="relative flex-1">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-32 w-64 rounded-lg border-2 border-white/80" />
        </div>
      </div>
      {error && <p className="p-4 text-center text-sm text-red-300">{error}</p>}
    </div>
  );
}
