import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Register SW after first paint so it doesn't compete with boot
if (typeof window !== "undefined") {
  const schedule =
    "requestIdleCallback" in window
      ? (cb: () => void) =>
          (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(cb, {
            timeout: 2500,
          })
      : (cb: () => void) => window.setTimeout(cb, 1200);
  schedule(() => {
    void import("virtual:pwa-register").then(({ registerSW }) => {
      registerSW({ immediate: true });
    });
  });
}
