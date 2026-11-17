"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Camera, Flashlight, X } from "lucide-react";

// Grocery barcodes only: much faster and more reliable than "any format".
const hints = new Map<DecodeHintType, unknown>([
  [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128]],
  [DecodeHintType.TRY_HARDER, true],
]);

type FocusCaps = MediaTrackCapabilities & { focusMode?: string[]; torch?: boolean; pointsOfInterest?: unknown };

/**
 * Live barcode scanner.
 * - Asks for a high-resolution back camera (the default 640×480 stream is
 *   too blurry up close, which is what made it seem "stuck").
 * - Turns on continuous autofocus where the phone allows it; tap to refocus.
 * - "Take a photo instead" opens the phone's own camera app, which focuses
 *   normally, and reads the barcode from that photo.
 * - Always fully releases the camera on close.
 */
export default function BarcodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const doneRef = useRef(false);
  const [status, setStatus] = useState<"starting" | "scanning" | "no-camera" | "reading-photo">("starting");
  const [slow, setSlow] = useState(false);
  const [torch, setTorch] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const finish = useCallback(
    (code: string) => {
      if (doneRef.current) return;
      doneRef.current = true;
      navigator.vibrate?.(60);
      stopCamera();
      onDetected(code);
    },
    [onDetected, stopCamera]
  );

  useEffect(() => {
    let cancelled = false;
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() ?? {}) as FocusCaps;
        if (caps.focusMode?.includes("continuous")) {
          await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => {});
        }
        if (caps.torch) setTorch(false);
        controlsRef.current = await reader.decodeFromStream(stream, videoRef.current!, (result) => {
          if (result) finish(result.getText());
        });
        if (!cancelled) setStatus("scanning");
      } catch {
        if (!cancelled) setStatus("no-camera");
      }
    })();
    const t = setTimeout(() => setSlow(true), 7000);
    return () => {
      cancelled = true;
      clearTimeout(t);
      stopCamera();
    };
  }, [finish, stopCamera]);

  async function refocus() {
    const track = streamRef.current?.getVideoTracks()[0];
    const caps = (track?.getCapabilities?.() ?? {}) as FocusCaps;
    if (!track || !caps.focusMode) return;
    const mode = caps.focusMode.includes("single-shot") ? "single-shot" : caps.focusMode.includes("continuous") ? "continuous" : null;
    if (mode) await track.applyConstraints({ advanced: [{ focusMode: mode } as MediaTrackConstraintSet] }).catch(() => {});
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] }).catch(() => {});
    setTorch(!torch);
  }

  /** Read a barcode from a photo taken with the phone's own camera app. */
  async function fromPhoto(file: File) {
    setStatus("reading-photo");
    setMsg(null);
    stopCamera();
    try {
      const bitmap = await createImageBitmap(file);
      const reader = new BrowserMultiFormatReader(hints);
      // Try a few sizes: phone photos are huge, and barcodes read best around 1–2k px.
      for (const maxSide of [1600, 2400, 1000]) {
        const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        try {
          finish(reader.decodeFromCanvas(canvas).getText());
          return;
        } catch {
          /* try next size */
        }
      }
      setMsg("Couldn’t read a barcode in that photo. Try again closer, with the whole barcode in frame and in focus.");
    } catch {
      setMsg("Couldn’t open that photo. Try again.");
    }
    setStatus("no-camera");
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Scan a barcode">
      <div className="flex items-center justify-between px-4 pb-3" style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
        <p className="m-0 text-[15px] font-semibold">
          {status === "reading-photo" ? "Reading your photo…" : status === "no-camera" ? "Scan with a photo" : "Point at the barcode"}
        </p>
        <button type="button" onClick={onClose} aria-label="Close scanner" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15">
          <X size={22} aria-hidden />
        </button>
      </div>

      <div className="relative min-h-0 flex-1" onClick={refocus}>
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay />
        {status === "scanning" && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div className="h-36 w-72 rounded-2xl border-[3px] border-[#C7F06B] shadow-[0_0_0_9999px_rgba(0,0,0,.35)]" />
            <p className="m-0 rounded-full bg-black/50 px-3 py-1.5 text-[13px]">Hold steady about 6 inches away · tap to focus</p>
          </div>
        )}
        {status === "starting" && <p className="absolute inset-0 m-0 flex items-center justify-center text-sm text-white/70">Starting camera…</p>}
        {status === "no-camera" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
            <p className="m-0 text-[15px] text-white/85">
              {msg ?? "The live scanner isn’t available here. Take a photo of the barcode with your camera instead."}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2.5 px-4 pt-3" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}>
        {slow && status === "scanning" && <p className="m-0 text-center text-[13px] text-white/75">Having trouble? Use your phone’s camera instead.</p>}
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-[54px] flex-1 items-center justify-center gap-2 rounded-2xl bg-[#C7F06B] text-base font-extrabold text-[#0E2318]"
          >
            <Camera size={20} aria-hidden />
            Take a photo instead
          </button>
          {torch !== null && (
            <button
              type="button"
              aria-label={torch ? "Turn off light" : "Turn on light"}
              aria-pressed={torch}
              onClick={toggleTorch}
              className={`flex h-[54px] w-[54px] items-center justify-center rounded-2xl ${torch ? "bg-white text-black" : "bg-white/15"}`}
            >
              <Flashlight size={22} aria-hidden />
            </button>
          )}
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) fromPhoto(f);
        }}
      />
    </div>
  );
}
