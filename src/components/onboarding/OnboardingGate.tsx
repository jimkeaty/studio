'use client';
// OnboardingGate — wraps the dashboard layout.
// On first render after login, fetches /api/onboarding.
// If complete === false AND skipped === false → auto-launches the wizard modal.
// The "Get Started" button in the sidebar also opens it.

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useUser } from '@/firebase';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { BrokerOnboardingWizard } from './BrokerOnboardingWizard';
import { AgentOnboardingWizard } from './AgentOnboardingWizard';
import { StaffOnboardingWizard } from './StaffOnboardingWizard';

export type WizardRole = 'broker' | 'solo_agent' | 'agent' | 'team_leader' | 'staff';

type OnboardingCtx = {
  open: boolean;
  openWizard: () => void;
  closeWizard: () => void;
  markComplete: () => Promise<void>;
  markSkipped: () => Promise<void>;
  wizardRole: WizardRole | null;
  isComplete: boolean;
};

const OnboardingContext = createContext<OnboardingCtx>({
  open: false,
  openWizard: () => {},
  closeWizard: () => {},
  markComplete: async () => {},
  markSkipped: async () => {},
  wizardRole: null,
  isComplete: false,
});

export function useOnboarding() {
  return useContext(OnboardingContext);
}

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [wizardRole, setWizardRole] = useState<WizardRole | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [checked, setChecked] = useState(false);

  // Fetch onboarding state on mount / user change
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const check = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/onboarding', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (cancelled) return;
        setWizardRole(data.wizardRole ?? null);
        setIsComplete(data.complete === true);
        // Auto-launch if not complete and not skipped
        if (!data.complete && !data.skipped) {
          // Small delay so the dashboard renders first
          setTimeout(() => {
            if (!cancelled) setOpen(true);
          }, 800);
        }
      } catch {
        // Non-fatal — don't block the dashboard
      } finally {
        if (!cancelled) setChecked(true);
      }
    };
    check();
    return () => { cancelled = true; };
  }, [user]);

  const postAction = useCallback(async (action: 'complete' | 'skip' | 'reset') => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action }),
      });
    } catch {
      // ignore
    }
  }, [user]);

  const markComplete = useCallback(async () => {
    await postAction('complete');
    setIsComplete(true);
    setOpen(false);
  }, [postAction]);

  const markSkipped = useCallback(async () => {
    await postAction('skip');
    setOpen(false);
  }, [postAction]);

  const openWizard = useCallback(() => setOpen(true), []);
  const closeWizard = useCallback(() => setOpen(false), []);

  // Listen for the sidebar "Setup Wizard" button event
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('smart-broker:relaunch-onboarding', handler);
    return () => window.removeEventListener('smart-broker:relaunch-onboarding', handler);
  }, []);

  const ctx: OnboardingCtx = {
    open, openWizard, closeWizard, markComplete, markSkipped, wizardRole, isComplete,
  };

  return (
    <OnboardingContext.Provider value={ctx}>
      {children}
      {/* Wizard modal — only renders when open and role is known */}
      {open && wizardRole && (
        <Dialog open={open} onOpenChange={v => { if (!v) markSkipped(); }}>
          <DialogContent
            className="max-w-4xl w-full max-h-[92vh] overflow-y-auto p-0 gap-0"
            // Prevent closing by clicking outside — user must use Skip or Finish
            onInteractOutside={e => e.preventDefault()}
          >
            {(wizardRole === 'broker' || wizardRole === 'solo_agent' || wizardRole === 'team_leader') && (
              <BrokerOnboardingWizard
                wizardRole={wizardRole}
                onComplete={markComplete}
                onSkip={markSkipped}
              />
            )}
            {wizardRole === 'agent' && (
              <AgentOnboardingWizard
                onComplete={markComplete}
                onSkip={markSkipped}
              />
            )}
            {wizardRole === 'staff' && (
              <StaffOnboardingWizard
                onComplete={markComplete}
                onSkip={markSkipped}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </OnboardingContext.Provider>
  );
}
