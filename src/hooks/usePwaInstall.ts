import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Shared across components so the deferred prompt survives navigation. */
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedFlag = false;
let cachedSnap = { deferred: null as BeforeInstallPromptEvent | null, installed: false };
const listeners = new Set<() => void>();

function refreshSnap() {
  if (
    cachedSnap.deferred === deferredPrompt &&
    cachedSnap.installed === installedFlag
  ) {
    return;
  }
  cachedSnap = { deferred: deferredPrompt, installed: installedFlag };
}

function emit() {
  refreshSnap();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return cachedSnap;
}

function getServerSnapshot() {
  return cachedSnap;
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
  installedFlag = isStandaloneNow();
  refreshSnap();

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installedFlag = true;
    deferredPrompt = null;
    emit();
  });

  const mq = window.matchMedia("(display-mode: standalone)");
  const onMode = () => {
    const next = isStandaloneNow();
    if (next !== installedFlag) {
      installedFlag = next;
      emit();
    }
  };
  mq.addEventListener?.("change", onMode);
}

export function usePwaInstall() {
  ensureWired();
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [iosHint, setIosHint] = useState(false);
  const [manualHint, setManualHint] = useState(false);
  const ios = isIosDevice();

  useEffect(() => {
    const next = isStandaloneNow();
    if (next !== installedFlag) {
      installedFlag = next;
      emit();
    }
  }, []);

  // Show install CTA unless the app is already running as installed PWA
  const canInstall = !snap.installed;

  const install = useCallback(async () => {
    if (snap.deferred) {
      await snap.deferred.prompt();
      const { outcome } = await snap.deferred.userChoice;
      if (outcome === "accepted") {
        installedFlag = true;
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
