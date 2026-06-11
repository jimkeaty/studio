'use client';

import { useState } from 'react';
import { Loader2, ExternalLink, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SMART_PLANNER_URL = 'https://smartplaner-deurais3.manus.space';

export default function SmartPlannerPage() {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background shrink-0">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-base font-semibold leading-tight">Smart Planner</h1>
            <p className="text-xs text-muted-foreground leading-tight">
              AI-powered business planning &amp; production tracking
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => window.open(SMART_PLANNER_URL, '_blank')}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open in New Tab
        </Button>
      </div>

      {/* Loading overlay */}
      {!loaded && (
        <div className="flex flex-1 items-center justify-center bg-muted/30">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Loading Smart Planner…</p>
          </div>
        </div>
      )}

      {/* Embedded iframe */}
      <iframe
        src={SMART_PLANNER_URL}
        title="Smart Planner"
        className={`flex-1 w-full border-0 ${loaded ? 'block' : 'hidden'}`}
        onLoad={() => setLoaded(true)}
        allow="clipboard-read; clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
      />
    </div>
  );
}
