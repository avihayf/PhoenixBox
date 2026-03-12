import { ChevronRight, ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { requireWebExt } from '../../../lib/browser';

interface OnboardingViewProps {
  onComplete: () => void;
  initialStep?: number;
}

const STEPS = [
  {
    id: 1,
    header: "Your Security Testing Workspace",
    description: "Preconfigured profiles like Attacker, Victim, Admin, and Member are ready to go — each isolated with its own cookies, storage, and proxy.\n\nNeed something custom? Create containers with any name, color, and icon to fit your workflow.",
    image: "/img/onboarding-1.png",
    buttonText: "Get Started"
  },
  {
    id: 2,
    header: "Burp Suite, Built In",
    description: "Route any container through Burp with per-container proxy settings. Every request is color-highlighted by its container — instantly see which role sent it.\n\nNo more guessing which session a request belongs to. Clear visibility, faster hunting.",
    image: "/img/onboarding-4.png",
    buttonText: "Next"
  },
  {
    id: 3,
    header: "Spoof User-Agents on the Fly",
    description: "Switch between desktop and mobile User-Agents per container — live, no restart. Test mobile-only endpoints, check browser-specific behavior, and explore how targets respond to different fingerprints.",
    image: "/img/onboarding-2.png",
    buttonText: "Next"
  },
  {
    id: 4,
    header: "Sync Your Setup Across Machines",
    description: "",
    image: "/img/Sync.svg",
    dualButtons: true,
    notNowText: "Not Now",
    actionText: "",
    isSyncStep: true
  },
  {
    id: 5,
    header: "You're All Set",
    description: "Your containers are isolated and ready.\n\nOpen a target, pick a role, and start testing.",
    image: "/img/moz-vpn-onboarding.svg",
    buttonText: "Launch PhoenixBox"
  }
];

const FIREFOX_SIGNIN_URL = "https://accounts.firefox.com/?service=sync&action=email&context=fx_desktop_v3&entrypoint=phoenix-box&utm_source=addon&utm_medium=panel&utm_campaign=phoenix-box-sync";

export function OnboardingView({ onComplete, initialStep = 0 }: OnboardingViewProps) {
  const clampedInitial = Math.max(0, Math.min(initialStep, STEPS.length - 1));
  const [currentStepIndex, setCurrentStepIndex] = useState(clampedInitial);
  const [busy, setBusy] = useState(false);
  const [syncDetected, setSyncDetected] = useState<boolean | null>(null);
  const step = STEPS[currentStepIndex];
  const isSyncStep = "isSyncStep" in step && step.isSyncStep;
  const syncDescription = syncDetected
    ? "Your Mozilla account is connected. Keep your roles, targets, and container setup consistent across machines."
    : "Sign in with your Mozilla account to sync your containers, site assignments, and proxy configs across devices.";
  const syncActionText = syncDetected ? "Enable Sync" : "Sign In & Enable Sync";

  useEffect(() => {
    if (!isSyncStep) return;

    let cancelled = false;
    async function detectSyncStatus() {
      setSyncDetected(null);
      try {
        const browser = requireWebExt();
        const syncData = await browser.storage.sync.get();
        const syncKeys = Object.keys(syncData || {});
        const hasSyncData = syncKeys.some(
          (key) => key.includes("identity@@_")
            || key.includes("siteContainerMap@@_")
            || key.includes("MACinstance")
        );
        if (!cancelled) {
          setSyncDetected(hasSyncData);
        }
      } catch {
        if (!cancelled) {
          setSyncDetected(false);
        }
      }
    }

    detectSyncStatus();
    return () => {
      cancelled = true;
    };
  }, [isSyncStep]);

  async function goToNextStep(browser: ReturnType<typeof requireWebExt>) {
    if (currentStepIndex < STEPS.length - 1) {
      const nextIndex = currentStepIndex + 1;
      setCurrentStepIndex(nextIndex);
      await browser.storage.local.set({ "onboarding-stage": nextIndex });
      return;
    }
    await browser.storage.local.set({ "onboarding-stage": 9 });
    onComplete();
  }

  async function enableSync(browser: ReturnType<typeof requireWebExt>, openSignIn: boolean) {
    if (openSignIn) {
      await browser.tabs.create({ url: FIREFOX_SIGNIN_URL });
      return false;
    }
    await browser.storage.local.set({ syncEnabled: true });
    await browser.runtime.sendMessage({ method: "resetSync" });
    return true;
  }

  const handleNext = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const browser = requireWebExt();

      if (step.id === 4) {
        const syncEnabled = await enableSync(browser, syncDetected !== true);
        if (!syncEnabled) {
          return;
        }
      }
      await goToNextStep(browser);
    } finally {
      setBusy(false);
    }
  };

  const handleEnableSyncDirect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const browser = requireWebExt();
      await enableSync(browser, false);
      await goToNextStep(browser);
    } finally {
      setBusy(false);
    }
  };

  const handleNotNow = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const browser = requireWebExt();
      if (step.id === 4) {
        await browser.storage.local.set({ syncEnabled: false });
        await browser.runtime.sendMessage({ method: "resetSync" });
      }
      await goToNextStep(browser);
    } finally {
      setBusy(false);
    }
  };

  const handleSkip = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const browser = requireWebExt();
      await browser.storage.local.set({ "onboarding-stage": 9, syncEnabled: false });
      await browser.runtime.sendMessage({ method: "resetSync" });
      onComplete();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center p-6 text-center animate-in fade-in duration-500">
      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-[var(--ext-accent)] to-[var(--ext-purple)] rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
          <img 
            src={step.image} 
            alt="" 
            className="relative w-32 h-32 object-contain"
          />
        </div>

        <div className="space-y-3">
          <h2 className="text-2xl font-bold text-[var(--ext-accent)] leading-tight tracking-tight">
            {step.header}
          </h2>
          <p className="text-base text-[var(--ext-text-muted)] leading-relaxed max-w-[260px] whitespace-pre-line">
            {isSyncStep ? syncDescription : step.description}
          </p>
        </div>
      </div>

      <div className="w-full space-y-4 mt-8">
        {step.dualButtons ? (
          <div className="flex gap-3 w-full">
            <button
              onClick={handleNotNow}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border border-[var(--ext-border)] text-[var(--ext-text)] hover:bg-[var(--ext-bg-secondary)] transition-all"
            >
              {step.notNowText}
            </button>
            <button
              onClick={handleNext}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-[var(--ext-accent)] text-black hover:bg-[var(--ext-accent-light)] shadow-lg shadow-[var(--ext-glow-accent)]/20 transition-all flex items-center justify-center gap-2"
            >
              {isSyncStep ? syncActionText : step.actionText}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={handleNext}
            className="w-full px-6 py-3 rounded-xl text-sm font-bold bg-[var(--ext-accent)] text-black hover:bg-[var(--ext-accent-light)] shadow-lg shadow-[var(--ext-glow-accent)]/20 transition-all flex items-center justify-center gap-2 group"
          >
            {step.buttonText}
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        )}

        <div className="flex items-center justify-center gap-1.5 py-2">
          {STEPS.map((_, i) => (
            <div 
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === currentStepIndex 
                  ? "w-6 bg-[var(--ext-accent)] shadow-[0_0_8px_var(--ext-glow-accent)]" 
                  : "w-1.5 bg-[var(--ext-border)]"
              }`}
            />
          ))}
        </div>

        {isSyncStep && syncDetected === false && (
          <button
            onClick={handleEnableSyncDirect}
            className="w-full text-xs text-[var(--ext-text-muted)] hover:text-[var(--ext-accent)] transition-colors"
          >
            Already signed in? Enable sync directly
          </button>
        )}

        <button 
          onClick={handleSkip}
          className="text-xs text-[var(--ext-text-muted)] hover:text-[var(--ext-accent)] transition-colors uppercase tracking-widest font-semibold"
        >
          Skip Introduction
        </button>
      </div>
    </div>
  );
}
