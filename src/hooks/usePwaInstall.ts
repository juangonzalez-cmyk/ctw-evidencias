import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Shared across components so the deferred prompt survives navigation. */
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return { deferred: deferredPrompt, installed };
}

function isStandaloneNow() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

let wired = false;
function ensureWired() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  installed = isStandaloneNow();

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferredPrompt = null;
    emit();
  });
}

export function usePwaInstall() {
  ensureWired();
  const snap = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => ({ deferred: null, installed: false })
  );
  const [iosHint, setIosHint] = useState(false);
  const [manualHint, setManualHint] = useState(false);
  const ios = isIosDevice();

  useEffect(() => {
    if (isStandaloneNow() && !installed) {
      installed = true;
      emit();
    }
  }, []);

  const canInstall = !snap.installed;

  const install = useCallback(async () => {
    if (snap.deferred) {
      await snap.deferred.prompt();
      const { outcome } = await snap.deferred.userChoice;
      if (outcome === "accepted") {
        installed = true;
        deferredPrompt = null;
        emit();
      }
      return;
    }
    if (ios) {
      setIosHint(true);
      return;
    }
    setManualHint(true);
  }, [snap.deferred, ios]);

  return {
    canInstall,
    installed: snap.installed,
    install,
    iosHint,
    dismissIosHint: () => setIosHint(false),
    manualHint,
    dismissManualHint: () => setManualHint(false),
    isIos: ios,
    hasNativePrompt: !!snap.deferred,
  };
}
