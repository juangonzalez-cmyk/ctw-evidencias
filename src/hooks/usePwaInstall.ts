import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Listener = () => void;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedFlag = false;
let wired = false;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
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

function ensureWired() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  installedFlag = isStandaloneNow();

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener("appinstalled", () => {
    installedFlag = true;
    deferredPrompt = null;
    notify();
  });
}

/**
 * Simple subscription hook — avoids useSyncExternalStore snapshot identity bugs
 * that caused React minified error #185 (infinite update loop).
 */
export function usePwaInstall() {
  const [, bump] = useState(0);
  const [iosHint, setIosHint] = useState(false);
  const [manualHint, setManualHint] = useState(false);
  const ios = isIosDevice();

  useEffect(() => {
    ensureWired();
    installedFlag = isStandaloneNow();
    const onChange = () => bump((n) => n + 1);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  const canInstall = !installedFlag;

  const install = useCallback(async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        installedFlag = true;
        deferredPrompt = null;
        notify();
      }
      return;
    }
    if (ios) {
      setIosHint(true);
      return;
    }
    setManualHint(true);
  }, [ios]);

  return {
    canInstall,
    installed: installedFlag,
    install,
    iosHint,
    dismissIosHint: () => setIosHint(false),
    manualHint,
    dismissManualHint: () => setManualHint(false),
    isIos: ios,
    hasNativePrompt: !!deferredPrompt,
  };
}
