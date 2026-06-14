'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Settings, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';

// Page definitions — each has a URL to embed and a display label
const ALL_PAGES = [
  { id: 'activity',    label: 'Activity Board',    url: '/new-activity' },
  { id: 'leaderboard', label: 'Leaderboard',        url: '/leaderboard' },
  { id: 'open-houses', label: 'Open Houses',        url: '/tv/open-houses' },
  { id: 'buyer-needs', label: 'Buyer Needs',        url: '/tv/buyer-needs' },
  { id: 'coming-soon', label: 'Coming Soon',        url: '/tv/coming-soon' },
];

type TvConfig = {
  rotationIntervalSeconds: number;
  enabledPages: string[];
};

export default function TvHubPage() {
  const [config, setConfig] = useState<TvConfig>({
    rotationIntervalSeconds: 30,
    enabledPages: ALL_PAGES.map((p) => p.id),
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef(0);
  const startTimeRef = useRef(Date.now());
  const animRef = useRef<number | null>(null);

  // Load TV config
  useEffect(() => {
    fetch('/api/community/tv-config')
      .then((r) => r.json())
      .then((json) => {
        if (json.ok && json.config) setConfig(json.config);
      })
      .catch(() => {});
  }, []);

  const enabledPages = ALL_PAGES.filter((p) => config.enabledPages.includes(p.id));
  const intervalMs = config.rotationIntervalSeconds * 1000;

  const goNext = useCallback(() => {
    setCurrentIndex((i) => (i + 1) % Math.max(enabledPages.length, 1));
    startTimeRef.current = Date.now();
    progressRef.current = 0;
    setProgress(0);
  }, [enabledPages.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => (i - 1 + Math.max(enabledPages.length, 1)) % Math.max(enabledPages.length, 1));
    startTimeRef.current = Date.now();
    progressRef.current = 0;
    setProgress(0);
  }, [enabledPages.length]);

  // Progress bar animation + auto-advance
  useEffect(() => {
    if (paused || enabledPages.length <= 1) return;
    startTimeRef.current = Date.now();

    const tick = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min((elapsed / intervalMs) * 100, 100);
      setProgress(pct);
      if (elapsed >= intervalMs) {
        goNext();
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [paused, enabledPages.length, intervalMs, goNext, currentIndex]);

  // Show controls on mouse move, hide after 3s
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  };

  const currentPage = enabledPages[currentIndex % Math.max(enabledPages.length, 1)];

  return (
    <div
      className="relative bg-black"
      style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}
      onMouseMove={handleMouseMove}
    >
      {/* Full-screen iframe for current page */}
      {currentPage && (
        <iframe
          key={currentPage.id}
          src={currentPage.url}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          title={currentPage.label}
        />
      )}

      {/* Progress bar at top */}
      {enabledPages.length > 1 && !paused && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-white/10 z-50">
          <div
            className="h-full bg-primary transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Page indicator dots */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-50">
        {enabledPages.map((p, i) => (
          <button
            key={p.id}
            onClick={() => { setCurrentIndex(i); startTimeRef.current = Date.now(); setProgress(0); }}
            className={`w-2.5 h-2.5 rounded-full transition-all ${i === currentIndex ? 'bg-white scale-125' : 'bg-white/30 hover:bg-white/60'}`}
            title={p.label}
          />
        ))}
      </div>

      {/* Controls overlay — shows on hover */}
      <div
        className={`absolute inset-0 z-40 pointer-events-none transition-opacity duration-300 ${showControls || showSettings ? 'opacity-100' : 'opacity-0'}`}
      >
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-3 bg-gradient-to-b from-black/70 to-transparent pointer-events-auto">
          <div className="flex items-center gap-3">
            <span className="text-white font-bold text-lg">{currentPage?.label}</span>
            <span className="text-white/50 text-sm">
              {currentIndex + 1} / {enabledPages.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPaused((p) => !p)}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              title={paused ? 'Resume rotation' : 'Pause rotation'}
            >
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setShowSettings((s) => !s)}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Settings"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Left/right nav arrows */}
        {enabledPages.length > 1 && (
          <>
            <button
              onClick={goPrev}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors pointer-events-auto"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              onClick={goNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors pointer-events-auto"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="absolute top-16 right-4 z-50 bg-gray-900 border border-white/20 rounded-xl p-5 w-80 shadow-2xl">
          <h3 className="text-white font-bold text-base mb-4 flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            TV Rotation Settings
          </h3>

          <div className="mb-4">
            <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 block">
              Rotation Interval
            </label>
            <div className="flex gap-2">
              {[30, 45, 60].map((sec) => (
                <button
                  key={sec}
                  onClick={() => {
                    const newConfig = { ...config, rotationIntervalSeconds: sec };
                    setConfig(newConfig);
                    fetch('/api/community/tv-config', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ rotationIntervalSeconds: sec }),
                    }).catch(() => {});
                  }}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    config.rotationIntervalSeconds === sec
                      ? 'bg-primary text-white'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 block">
              Enabled Pages
            </label>
            <div className="space-y-2">
              {ALL_PAGES.map((page) => {
                const enabled = config.enabledPages.includes(page.id);
                return (
                  <label key={page.id} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => {
                        const newEnabled = enabled
                          ? config.enabledPages.filter((id) => id !== page.id)
                          : [...config.enabledPages, page.id];
                        const newConfig = { ...config, enabledPages: newEnabled };
                        setConfig(newConfig);
                        fetch('/api/community/tv-config', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ enabledPages: newEnabled }),
                        }).catch(() => {});
                      }}
                      className="w-4 h-4 accent-primary"
                    />
                    <span className="text-white text-sm">{page.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <button
            onClick={() => setShowSettings(false)}
            className="mt-4 w-full py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
