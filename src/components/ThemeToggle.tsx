import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const KEY = "ctw-evidencias-theme";

export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem(KEY);
    if (stored) return stored === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(KEY, dark ? "dark" : "light");
  }, [dark]);

  return (
    <button
      type="button"
      onClick={() => setDark((d) => !d)}
      className={cn(
        "inline-flex items-center justify-center rounded-xl p-2 border border-border bg-card text-foreground hover:bg-muted transition-colors",
        className
      )}
      aria-label={dark ? "Modo claro" : "Modo oscuro"}
    >
      {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}

export function initTheme() {
  const stored = localStorage.getItem(KEY);
  const dark =
    stored === "dark" ||
    (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}
