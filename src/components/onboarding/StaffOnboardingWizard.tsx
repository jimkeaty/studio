'use client';
// StaffOnboardingWizard
// Used for: staff / TC role
// Steps: Welcome → Profile Setup → Done

import React, { useState } from 'react';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { WizardShell, WizardStep } from './WizardShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Zap, User, CheckCircle2, Bell, ClipboardList, FileText, Users } from 'lucide-react';

const STEPS: WizardStep[] = [
  { id: 'welcome', title: 'Welcome', subtitle: 'Get started' },
  { id: 'profile', title: 'Your Profile', subtitle: 'Name & contact info' },
  { id: 'done', title: 'All Done!', subtitle: 'Setup complete' },
];

function Field({
  label, value, onChange, type = 'text', hint, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; hint?: string; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

type Props = {
  onComplete: () => Promise<void>;
  onSkip: () => Promise<void>;
};

export function StaffOnboardingWizard({ onComplete, onSkip }: Props) {
  const { user } = useUser();
  const { toast } = useToast();
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  // Profile fields
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [phone, setPhone] = useState('');
  const [notifyNewTransaction, setNotifyNewTransaction] = useState(true);
  const [notifyDocRequest, setNotifyDocRequest] = useState(true);

  const saveAll = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      // Save display name / phone to staff profile if provided
      if (displayName.trim() || phone.trim()) {
        await fetch('/api/staff/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            displayName: displayName.trim() || null,
            phone: phone.trim() || null,
            notificationPrefs: {
              newTransaction: notifyNewTransaction,
              docRequest: notifyDocRequest,
            },
          }),
        }).catch(() => {
          // Non-fatal — staff profile endpoint may not exist yet
        });
      }
      toast({ title: 'Setup complete!', description: 'Welcome to Smart Broker.' });
      await onComplete();
    } catch (err) {
      console.error('[StaffWizard] save error', err);
      toast({ title: 'Save failed', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const renderStep = () => {
    const stepId = STEPS[stepIndex].id;

    if (stepId === 'welcome') {
      return (
        <div className="space-y-6">
          <div className="text-center py-4">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary mx-auto mb-4">
              <Zap className="h-8 w-8" />
            </div>
            <h3 className="text-2xl font-bold mb-2">Welcome to Smart Broker!</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              You&apos;re logged in as a staff member. Let&apos;s quickly set up your profile.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {[
              { icon: ClipboardList, label: 'Transaction Queue', desc: 'Review and process agent transactions' },
              { icon: FileText, label: 'Document Management', desc: 'Upload and manage transaction documents' },
              { icon: Users, label: 'Agent Roster', desc: 'View agent profiles and contact info' },
            ].map(item => (
              <div key={item.label} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                <item.icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (stepId === 'profile') {
      return (
        <div className="space-y-5">
          <div className="flex items-start gap-3 mb-2">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
              <User className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Your Profile</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Confirm your name and contact info.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Display Name" value={displayName} onChange={setDisplayName}
              placeholder="Jane Smith" hint="How your name appears to agents" />
            <Field label="Phone Number" value={phone} onChange={setPhone}
              type="tel" placeholder="(555) 123-4567" hint="For internal contact only" />
          </div>
          <div className="space-y-3 pt-2">
            <div className="flex items-start gap-3">
              <Bell className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <h4 className="text-sm font-semibold">Notification Preferences</h4>
            </div>
            <div className="space-y-3 pl-7">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">New Transaction Submitted</p>
                  <p className="text-xs text-muted-foreground">Notify me when an agent submits a new transaction</p>
                </div>
                <Switch checked={notifyNewTransaction} onCheckedChange={setNotifyNewTransaction} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Document Request</p>
                  <p className="text-xs text-muted-foreground">Notify me when a document is requested or uploaded</p>
                </div>
                <Switch checked={notifyDocRequest} onCheckedChange={setNotifyDocRequest} />
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (stepId === 'done') {
      return (
        <div className="space-y-6 text-center py-4">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-green-100 text-green-600 mx-auto">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <div>
            <h3 className="text-2xl font-bold mb-2">You&apos;re all set!</h3>
            <p className="text-muted-foreground max-w-sm mx-auto">
              Your profile is saved. Here&apos;s where to get started:
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
            {[
              { label: 'Transaction Queue', desc: 'Review pending agent transactions', href: '/dashboard/staff/queue' },
              { label: 'Agent Roster', desc: 'View all agents and their profiles', href: '/dashboard/admin/agents' },
            ].map(link => (
              <a key={link.label} href={link.href}
                className="flex flex-col gap-0.5 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                <span className="text-sm font-semibold text-primary">{link.label} →</span>
                <span className="text-xs text-muted-foreground">{link.desc}</span>
              </a>
            ))}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <WizardShell
      steps={STEPS}
      currentStepIndex={stepIndex}
      onBack={() => setStepIndex(i => Math.max(0, i - 1))}
      onNext={() => setStepIndex(i => Math.min(STEPS.length - 1, i + 1))}
      onSkipAll={onSkip}
      onFinish={saveAll}
      saving={saving}
      wizardTitle="Staff Setup"
      wizardSubtitle="Quick profile setup"
      headerIcon={<User className="h-5 w-5" />}
    >
      {renderStep()}
    </WizardShell>
  );
}
