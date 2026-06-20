'use client';
// WizardShell — shared layout for all three wizard paths.
// Renders the step progress bar, step title, content area, and nav buttons.

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Check, SkipForward, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type WizardStep = {
  id: string;
  title: string;
  subtitle?: string;
  optional?: boolean;
  icon?: React.ReactNode;
};

type Props = {
  steps: WizardStep[];
  currentStepIndex: number;
  onBack: () => void;
  onNext: () => void;
  onSkipStep?: () => void;
  onSkipAll: () => void;
  onFinish: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  saving?: boolean;
  children: React.ReactNode;
  wizardTitle: string;
  wizardSubtitle?: string;
  headerIcon?: React.ReactNode;
};

export function WizardShell({
  steps,
  currentStepIndex,
  onBack,
  onNext,
  onSkipStep,
  onSkipAll,
  onFinish,
  nextLabel,
  nextDisabled = false,
  saving = false,
  children,
  wizardTitle,
  wizardSubtitle,
  headerIcon,
}: Props) {
  const isFirst = currentStepIndex === 0;
  const isLast = currentStepIndex === steps.length - 1;
  const currentStep = steps[currentStepIndex];
  const progressPct = Math.round(((currentStepIndex) / (steps.length - 1)) * 100);

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b bg-gradient-to-r from-primary/5 to-background">
        <div className="flex items-center gap-3">
          {headerIcon && (
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary shrink-0">
              {headerIcon}
            </div>
          )}
          <div>
            <h2 className="text-lg font-bold leading-tight">{wizardTitle}</h2>
            {wizardSubtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{wizardSubtitle}</p>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSkipAll}
          className="text-muted-foreground hover:text-foreground shrink-0 gap-1"
        >
          <X className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Skip for now</span>
        </Button>
      </div>

      {/* ── Step progress bar ──────────────────────────────────────────── */}
      <div className="px-6 py-3 border-b bg-muted/30">
        {/* Step dots */}
        <div className="flex items-center gap-1.5 mb-2 overflow-x-auto pb-1">
          {steps.map((step, i) => {
            const isDone = i < currentStepIndex;
            const isCurrent = i === currentStepIndex;
            return (
              <React.Fragment key={step.id}>
                <div className={cn(
                  'flex items-center justify-center rounded-full text-[10px] font-bold shrink-0 transition-all',
                  isDone ? 'w-5 h-5 bg-primary text-primary-foreground' :
                  isCurrent ? 'w-5 h-5 bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-1' :
                  'w-5 h-5 bg-muted text-muted-foreground border'
                )}>
                  {isDone ? <Check className="h-2.5 w-2.5" /> : i + 1}
                </div>
                {i < steps.length - 1 && (
                  <div className={cn(
                    'h-0.5 flex-1 min-w-[12px] rounded-full transition-all',
                    i < currentStepIndex ? 'bg-primary' : 'bg-border'
                  )} />
                )}
              </React.Fragment>
            );
          })}
        </div>
        {/* Current step label */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-foreground">{currentStep.title}</span>
            {currentStep.subtitle && (
              <span className="text-xs text-muted-foreground ml-1.5">{currentStep.subtitle}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {currentStep.optional && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Optional</Badge>
            )}
            <span className="text-xs text-muted-foreground">
              Step {currentStepIndex + 1} of {steps.length}
            </span>
          </div>
        </div>
      </div>

      {/* ── Content area ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {children}
      </div>

      {/* ── Footer navigation ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-t bg-background/80 backdrop-blur">
        <div className="flex items-center gap-2">
          {!isFirst && (
            <Button variant="outline" size="sm" onClick={onBack} disabled={saving}>
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />
              Back
            </Button>
          )}
          {onSkipStep && currentStep.optional && (
            <Button variant="ghost" size="sm" onClick={onSkipStep} disabled={saving}
              className="text-muted-foreground">
              <SkipForward className="h-3.5 w-3.5 mr-1" />
              Skip this step
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isLast ? (
            <Button onClick={onFinish} disabled={saving || nextDisabled} size="sm">
              {saving ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-3.5 w-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Saving...
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" />
                  Finish Setup
                </span>
              )}
            </Button>
          ) : (
            <Button onClick={onNext} disabled={saving || nextDisabled} size="sm">
              {nextLabel ?? 'Next'}
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
