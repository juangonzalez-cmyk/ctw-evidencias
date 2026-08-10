/** Helpers para forzar datos frescos + nuevo bundle PWA tras un deploy. */

type UpdateSW = (reloadPage?: boolean) => Promise<void>;

let updateSWFn: UpdateSW | null = null;

export function setPwaUpdateHandler(fn: UpdateSW) {
  updateSWFn = fn;
}

/**
 * Limpia caches del service worker, pide la SW nueva y recarga la app.
 * Útil cuando hay un deploy y el PWA sigue sirviendo JS viejo.
 */
export async function refreshAppHard(): Promise<void> {
  try {
    if (updateSWFn) {
      await updateSWFn(true);
      return;
    }
  } catch (e) {
    console.warn("PWA updateSW failed, falling back to hard reload", e);
  }

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* ignore */
  }

  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        regs.map(async (reg) => {
          await reg.update();
          if (reg.waiting) {
            reg.waiting.postMessage({ type: "SKIP_WAITING" });
          }
        })
      );
    }
  } catch {
    /* ignore */
  }

  const url = new URL(window.location.href);
  url.searchParams.set("_refresh", String(Date.now()));
  window.location.replace(url.toString());
}
