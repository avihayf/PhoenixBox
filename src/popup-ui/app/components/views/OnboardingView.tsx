import { ArrowRight, ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { requireWebExt } from '../../../lib/browser';

interface OnboardingViewProps {
  onComplete: () => void;
  initialStep?: number;
}

// Titles are split into three parts so a single keyword can be accent-colored
// (titleHi) while the rest stays in the primary text color.
const STEPS = [
  {
    id: 1,
    titlePre: "Your ",
    titleHi: "Security Testing",
    titlePost: " Workspace",
    description: "Attacker, Victim, Admin & Member profiles come ready — each fully isolated with its own cookies, storage, and proxy. Spin up your own with any name, color, or icon.",
    image: "/img/onboarding-1.png",
    buttonText: "Get Started"
  },
  {
    id: 2,
    titlePre: "",
    titleHi: "Burp Suite",
    titlePost: ", Built In",
    description: "Route any container through Burp with per-container proxy settings. Every request is color-highlighted by its container — so you always know which role sent it.",
    image: "/img/onboarding-4.png",
    buttonText: "Next"
  },
  {
    id: 3,
    titlePre: "Spoof ",
    titleHi: "User-Agents",
    titlePost: " on the Fly",
    description: "Switch desktop and mobile User-Agents per container — live, no restart. Test mobile-only endpoints and browser-specific behavior instantly.",
    image: "/img/onboarding-2.png",
    buttonText: "Next"
  },
  {
    id: 4,
    titlePre: "",
    titleHi: "Sync",
    titlePost: " Across Machines",
    description: "",
    image: "/img/Sync.svg",
    dualButtons: true,
    notNowText: "Not Now",
    actionText: "",
    isSyncStep: true
  },
  {
    id: 5,
    titlePre: "You're ",
    titleHi: "All Set",
    titlePost: "",
    description: "Your containers are isolated and ready. Open a target, pick a role, and start testing.",
    image: "/img/onboarding-3.png",
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
  const isLastStep = currentStepIndex === STEPS.length - 1;
  const syncDescription = syncDetected
    ? "Your Mozilla account is connected. Keep your roles, targets, and container setup consistent across machines."
    : "Sign in with your Mozilla account to sync your containers, site assignments, and proxy configs across every device.";
  const syncActionText = syncDetected ? "Enable Sync" : "Sign In & Sync";

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

  const handleBack = async () => {
    if (busy || currentStepIndex === 0) return;
    const prevIndex = currentStepIndex - 1;
    setCurrentStepIndex(prevIndex);
    try {
      const browser = requireWebExt();
      await browser.storage.local.set({ "onboarding-stage": prevIndex });
    } catch {
      // Navigation shouldn't fail if storage is briefly unavailable.
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
        try {
          await browser.runtime.sendMessage({ method: "resetSync" });
        } catch {
          // Don't block onboarding completion if sync reset fails.
        }
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
      try {
        await browser.runtime.sendMessage({ method: "resetSync" });
      } catch {
        // Don't block finishing onboarding if sync reset fails.
      }
      onComplete();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col animate-in fade-in duration-500">
      {/* Header: back + step counter (fixed) */}
      <div className="flex-none flex items-center justify-between h-[52px] px-5 pt-3">
        <button
          onClick={handleBack}
          aria-label="Back"
          className={`w-9 h-9 flex items-center justify-center rounded-lg text-[var(--ext-text-muted)] hover:bg-[var(--ext-bg-secondary)] hover:text-[var(--ext-text)] transition-colors ${currentStepIndex === 0 ? "invisible" : "visible"}`}
        >
          <ArrowLeft className="w-[18px] h-[18px]" />
        </button>
        <span className="text-sm font-semibold tracking-wider text-[var(--ext-text-muted)] tabular-nums">
          {currentStepIndex + 1} / {STEPS.length}
        </span>
      </div>

      {/* Body */}
      <div key={step.id} className="flex-1 min-h-0 flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-500">
        {/* Media zone (fixed height keeps art from jumping between steps) */}
        <div className="flex-none h-[186px] flex items-center justify-center relative">
          <div
            className="absolute w-[180px] h-[180px] rounded-full"
            style={{ background: "radial-gradient(closest-side, var(--ext-glow-accent), rgba(168,85,247,0.14) 55%, transparent 75%)", filter: "blur(10px)" }}
          />
          <img src={step.image} alt="" className="relative w-32 h-32 object-contain" />
        </div>

        {/* Copy zone */}
        <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-2 text-center flex flex-col">
          <div className="min-h-[60px] flex items-end justify-center">
            <h2 className="text-[22px] font-extrabold leading-tight tracking-tight text-[var(--ext-text)]">
              {step.titlePre}
              <span className="text-[var(--ext-accent)]">{step.titleHi}</span>
              {step.titlePost}
            </h2>
          </div>
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--ext-text-muted)]">
            {isSyncStep ? syncDescription : step.description}
          </p>
        </div>
      </div>

      {/* Footer: dots + CTA + skip (anchored, always visible) */}
      <div className="flex-none px-6 pt-3 pb-5">
        <div className="flex items-center justify-center gap-1.5 pb-4">
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

        {step.dualButtons ? (
          <div className="flex gap-3 w-full">
            <button
              onClick={handleNotNow}
              className="flex-1 h-11 rounded-xl text-sm font-semibold border border-[var(--ext-border)] text-[var(--ext-text)] hover:bg-[var(--ext-bg-secondary)] transition-all flex items-center justify-center"
            >
              {step.notNowText}
            </button>
            <button
              onClick={handleNext}
              className="flex-[1.4] h-11 rounded-xl text-sm font-bold bg-[var(--ext-accent)] text-black hover:bg-[var(--ext-accent-light)] shadow-lg shadow-[var(--ext-glow-accent)]/20 transition-all flex items-center justify-center gap-2"
            >
              {isSyncStep ? syncActionText : step.actionText}
            </button>
          </div>
        ) : (
          <button
            onClick={handleNext}
            className="w-full h-12 rounded-xl text-[15px] font-bold bg-[var(--ext-accent)] text-black hover:bg-[var(--ext-accent-light)] shadow-lg shadow-[var(--ext-glow-accent)]/20 transition-all flex items-center justify-center gap-2 group"
          >
            {step.buttonText}
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        )}

        {isSyncStep && syncDetected === false && (
          <button
            onClick={handleEnableSyncDirect}
            className="w-full mt-3 text-xs text-[var(--ext-text-muted)] hover:text-[var(--ext-accent)] transition-colors"
          >
            Already signed in? Enable sync directly
          </button>
        )}

        {/* Skip is hidden on the final step where it has no meaning */}
        <div className="h-9 flex items-center justify-center mt-1.5">
          {!isLastStep && (
            <button
              onClick={handleSkip}
              className="text-xs text-[var(--ext-text-muted)] hover:text-[var(--ext-accent)] transition-colors uppercase tracking-widest font-semibold"
            >
              Skip Introduction
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
