import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type InstallPlatform = "ios" | "browser" | "unavailable";

interface PwaInstallContextValue {
  canInstall: boolean;
  dismissed: boolean;
  installed: boolean;
  platform: InstallPlatform;
  dismiss: () => void;
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
}

const DISMISS_KEY = "rightsly_install_prompt_dismissed_until";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;
const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

function isStandalone() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches
    || navigatorWithStandalone.standalone === true;
}

function detectPlatform(): InstallPlatform {
  const userAgent = navigator.userAgent;
  const isiOS = /iPad|iPhone|iPod/.test(userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return isiOS ? "ios" : "unavailable";
}

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [platform, setPlatform] = useState<InstallPlatform>(() => detectPlatform());
  const [dismissed, setDismissed] = useState(() => {
    const until = Number(localStorage.getItem(DISMISS_KEY) ?? "0");
    return until > Date.now();
  });

  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const handleDisplayMode = () => setInstalled(isStandalone());
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setPlatform("browser");
    };
    const handleInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      localStorage.removeItem(DISMISS_KEY);
    };

    media.addEventListener("change", handleDisplayMode);
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      media.removeEventListener("change", handleDisplayMode);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const value = useMemo<PwaInstallContextValue>(() => ({
    canInstall: !installed && (platform === "ios" || deferredPrompt !== null),
    dismissed,
    installed,
    platform,
    dismiss: () => {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS));
      setDismissed(true);
    },
    promptInstall: async () => {
      if (!deferredPrompt) return "unavailable";
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (choice.outcome === "accepted") setInstalled(true);
      return choice.outcome;
    },
  }), [deferredPrompt, dismissed, installed, platform]);

  return <PwaInstallContext.Provider value={value}>{children}</PwaInstallContext.Provider>;
}

export function usePwaInstall() {
  const context = useContext(PwaInstallContext);
  if (!context) throw new Error("usePwaInstall must be used within PwaInstallProvider");
  return context;
}