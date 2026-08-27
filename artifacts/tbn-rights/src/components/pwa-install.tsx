import { useState } from "react";
import { Download, MonitorDown, SquareArrowUp, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { cn } from "@/lib/utils";

export function InstallAppButton({ compact = false }: { compact?: boolean }) {
  const { canInstall, installed, platform, promptInstall } = usePwaInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (installed || !canInstall) return null;

  const install = async () => {
    if (platform === "ios") {
      setShowIOSGuide(true);
      return;
    }
    await promptInstall();
  };

  return (
    <>
      <Button
        type="button"
        variant={compact ? "ghost" : "outline"}
        size={compact ? "icon" : "sm"}
        className={cn(
          compact && "h-9 w-9",
          !compact && "w-full justify-start border-sidebar-border bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-foreground",
        )}
        onClick={install}
        aria-label="Install Rightsly"
        data-testid={compact ? "button-install-app-mobile" : "button-install-app"}
      >
        <Download className={cn("h-4 w-4", !compact && "mr-2")} />
        {!compact && "Install Rightsly"}
      </Button>
      <IOSInstallGuide open={showIOSGuide} onOpenChange={setShowIOSGuide} />
    </>
  );
}

export function PwaInstallBanner() {
  const { canInstall, dismissed, installed, platform, dismiss, promptInstall } = usePwaInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (!canInstall || dismissed || installed) return null;

  const install = async () => {
    if (platform === "ios") {
      setShowIOSGuide(true);
      return;
    }
    await promptInstall();
  };

  return (
    <>
      <aside className="safe-bottom fixed inset-x-3 bottom-3 z-40 mx-auto max-w-md rounded-xl border border-emerald-800/20 bg-[#14201c] p-4 text-[#f4f1e9] shadow-2xl md:left-auto md:right-5 md:mx-0" aria-label="Install Rightsly">
        <button
          type="button"
          className="absolute right-2 top-2 rounded-md p-2 text-white/70 hover:bg-white/10 hover:text-white"
          onClick={dismiss}
          aria-label="Dismiss install suggestion"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex gap-3 pr-7">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#1d9e75]">
            <MonitorDown className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium">Install Rightsly</p>
            <p className="mt-1 text-xs leading-5 text-white/70">
              Open Rightsly from your home screen with a focused, app-like view.
            </p>
            <Button type="button" size="sm" className="mt-3 bg-[#1d9e75] text-white hover:bg-[#168461]" onClick={install}>
              {platform === "ios" ? "How to install" : "Install app"}
            </Button>
          </div>
        </div>
      </aside>
      <IOSInstallGuide open={showIOSGuide} onOpenChange={setShowIOSGuide} />
    </>
  );
}

function IOSInstallGuide({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-sm rounded-xl">
        <DialogHeader>
          <DialogTitle>Install Rightsly on iPhone or iPad</DialogTitle>
          <DialogDescription>Use Safari’s Add to Home Screen action.</DialogDescription>
        </DialogHeader>
        <ol className="space-y-4 text-sm text-slate-700">
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-800">1</span>
            <span>Open this page in <strong>Safari</strong>.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-800">2</span>
            <span>Tap the Share button <SquareArrowUp className="mx-1 inline h-4 w-4" /> in Safari.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-800">3</span>
            <span>Choose <SquarePlus className="mx-1 inline h-4 w-4" /><strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</span>
          </li>
        </ol>
      </DialogContent>
    </Dialog>
  );
}