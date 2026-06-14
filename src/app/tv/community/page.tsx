'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Clock, Users, Home, MapPin, Phone, Bed, Bath, Square,
  DollarSign, Droplets, Zap, Building2, Calendar, ChevronLeft, ChevronRight,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ComingSoonListing = {
  id: string; area: string; address?: string; price?: number | null;
  beds?: number | null; baths?: number | null; sqft?: number | null;
  acreage?: number | null; pool?: boolean; generator?: boolean;
  stories?: string | null; otherAmenities?: string; notes?: string;
  expectedDate?: string | null; agentName: string; agentPhone: string;
};

type BuyerNeed = {
  id: string; area: string; minPrice?: number | null; maxPrice?: number | null;
  beds?: number | null; baths?: number | null; minAcreage?: number | null;
  maxAcreage?: number | null; pool?: boolean; generator?: boolean;
  stories?: string | null; otherAmenities?: string; notes?: string;
  agentName: string; agentPhone: string;
};

type OpenHouseListing = {
  id: string; address: string; price?: number | null;
  beds?: number | null; baths?: number | null; sqft?: number | null;
  notes?: string; agentName: string; agentPhone: string;
  openHouseDate?: string | null; openHouseTime?: string; openHouseEndTime?: string;
};

type TvConfig = { rotationIntervalSeconds: number; enabledPages: string[] };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n?: number | null) {
  if (!n) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d?: string | null) {
  if (!d) return null;
  try { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  catch { return d; }
}

// ─── Auto-scroll hook ─────────────────────────────────────────────────────────

function useAutoScroll(items: any[], active: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number | null>(null);
  const posRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    const inner = innerRef.current;
    if (!container || !inner || items.length === 0 || !active) return;

    posRef.current = 0;
    container.scrollTop = 0;

    const SPEED = 28;
    let lastTime: number | null = null;
    let pauseUntil = 0;

    const step = (ts: number) => {
      if (!container || !inner) return;
      if (lastTime === null) lastTime = ts;
      const dt = (ts - lastTime) / 1000;
      lastTime = ts;

      const contentH = inner.scrollHeight / 2;
      const containerH = container.clientHeight;

      if (contentH <= containerH) {
        posRef.current = 0;
        container.scrollTop = 0;
        animRef.current = requestAnimationFrame(step);
        return;
      }

      if (ts < pauseUntil) {
        animRef.current = requestAnimationFrame(step);
        return;
      }

      posRef.current += SPEED * dt;
      if (posRef.current >= contentH) {
        posRef.current = 0;
        pauseUntil = ts + 3000;
      }

      container.scrollTop = posRef.current;
      animRef.current = requestAnimationFrame(step);
    };

    animRef.current = requestAnimationFrame(step);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [items, active]);

  return { containerRef, innerRef };
}

// ─── Section Components ───────────────────────────────────────────────────────

function ComingSoonSection({ items, loading, active }: { items: ComingSoonListing[]; loading: boolean; active: boolean }) {
  const { containerRef, innerRef } = useAutoScroll(items, active);
  const cards = [...items, ...items]; // duplicate for seamless loop

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 flex items-center gap-3 px-8 py-5 bg-gray-900 border-b border-white/10">
        <div className="w-12 h-12 rounded-2xl bg-purple-500/20 flex items-center justify-center">
          <Clock className="h-6 w-6 text-purple-400" />
        </div>
        <div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">Coming Soon</h2>
          <p className="text-gray-400 text-sm">Properties hitting the market soon — contact agent for details</p>
        </div>
        <div className="ml-auto bg-purple-500/20 text-purple-300 text-sm font-bold px-3 py-1 rounded-full">
          {items.length} listing{items.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-hidden px-8 py-6" style={{ scrollBehavior: 'auto' }}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-400 text-2xl animate-pulse">Loading…</div>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Clock className="h-20 w-20 text-gray-700" />
            <p className="text-gray-500 text-3xl font-semibold">No Coming Soon Listings</p>
            <p className="text-gray-600 text-lg">Post a coming soon listing from the dashboard</p>
          </div>
        ) : (
          <div ref={innerRef}>
            <div className="grid grid-cols-2 gap-5">
              {cards.map((item, i) => (
                <div key={`${item.id}-${i}`} className="bg-gray-900 border border-white/10 rounded-2xl p-5 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-purple-400 font-bold text-xl">
                        <MapPin className="h-5 w-5" />{item.address || item.area}
                      </div>
                      {item.address && item.address !== item.area && (
                        <div className="text-gray-400 text-sm mt-0.5">{item.area}</div>
                      )}
                      {item.price && <div className="text-white text-3xl font-bold mt-1">{fmt$(item.price)}</div>}
                    </div>
                    <div className="flex-shrink-0 bg-purple-500/10 border border-purple-500/20 rounded-xl px-4 py-2 text-center">
                      <div className="text-purple-400 text-xs font-semibold uppercase">Coming Soon</div>
                      {item.expectedDate
                        ? <div className="text-white font-bold text-sm">{fmtDate(item.expectedDate)}</div>
                        : <div className="text-gray-400 text-sm">TBD</div>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-gray-300 text-sm">
                    {item.beds && <span className="flex items-center gap-1"><Bed className="h-4 w-4 text-gray-500" />{item.beds} bd</span>}
                    {item.baths && <span className="flex items-center gap-1"><Bath className="h-4 w-4 text-gray-500" />{item.baths} ba</span>}
                    {item.sqft && <span className="flex items-center gap-1"><Square className="h-4 w-4 text-gray-500" />{item.sqft.toLocaleString()} sqft</span>}
                    {item.acreage && <span className="text-gray-400">🌿 {item.acreage} ac</span>}
                    {item.stories && <span className="flex items-center gap-1"><Building2 className="h-4 w-4 text-gray-500" />{item.stories} story</span>}
                    {item.pool && <span className="flex items-center gap-1 bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded-full text-xs font-semibold"><Droplets className="h-3 w-3" />Pool</span>}
                    {item.generator && <span className="flex items-center gap-1 bg-yellow-500/10 text-yellow-400 px-2 py-0.5 rounded-full text-xs font-semibold"><Zap className="h-3 w-3" />Generator</span>}
                  </div>
                  {item.otherAmenities && <p className="text-gray-400 text-sm">Amenities: {item.otherAmenities}</p>}
                  {item.notes && <p className="text-gray-400 text-sm leading-relaxed line-clamp-2">{item.notes}</p>}
                  <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                    <div className="w-9 h-9 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-bold text-base">{item.agentName.charAt(0)}</div>
                    <div>
                      <div className="text-white text-sm font-semibold">{item.agentName}</div>
                      <div className="text-gray-400 text-xs flex items-center gap-1"><Phone className="h-3 w-3" />{item.agentPhone}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BuyerNeedsSection({ items, loading, active }: { items: BuyerNeed[]; loading: boolean; active: boolean }) {
  const { containerRef, innerRef } = useAutoScroll(items, active);
  const cards = [...items, ...items];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 flex items-center gap-3 px-8 py-5 bg-gray-900 border-b border-white/10">
        <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center">
          <Users className="h-6 w-6 text-blue-400" />
        </div>
        <div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">Buyer Needs</h2>
          <p className="text-gray-400 text-sm">Active buyers looking for properties — contact agent to match</p>
        </div>
        <div className="ml-auto bg-blue-500/20 text-blue-300 text-sm font-bold px-3 py-1 rounded-full">
          {items.length} active buyer{items.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-hidden px-8 py-6" style={{ scrollBehavior: 'auto' }}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-400 text-2xl animate-pulse">Loading…</div>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Users className="h-20 w-20 text-gray-700" />
            <p className="text-gray-500 text-3xl font-semibold">No Buyer Needs Posted</p>
            <p className="text-gray-600 text-lg">Post a buyer need from the dashboard</p>
          </div>
        ) : (
          <div ref={innerRef}>
            <div className="grid grid-cols-2 gap-5">
              {cards.map((item, i) => (
                <div key={`${item.id}-${i}`} className="bg-gray-900 border border-white/10 rounded-2xl p-5 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-blue-400 font-bold text-xl"><MapPin className="h-5 w-5" />{item.area}</div>
                      {(item.minPrice || item.maxPrice) && (
                        <div className="text-white text-2xl font-bold mt-1">
                          {item.minPrice && item.maxPrice
                            ? `${fmt$(item.minPrice)} – ${fmt$(item.maxPrice)}`
                            : item.maxPrice ? `Up to ${fmt$(item.maxPrice)}` : `From ${fmt$(item.minPrice)}`}
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-2 text-center">
                      <div className="text-blue-400 text-xs font-semibold uppercase">Buyer</div>
                      <div className="text-white font-bold text-sm">Active</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-gray-300 text-sm">
                    {item.beds && <span className="flex items-center gap-1"><Bed className="h-4 w-4 text-gray-500" />{item.beds}+ bd</span>}
                    {item.baths && <span className="flex items-center gap-1"><Bath className="h-4 w-4 text-gray-500" />{item.baths}+ ba</span>}
                    {(item.minAcreage || item.maxAcreage) && (
                      <span className="text-gray-400">🌿 {item.minAcreage && item.maxAcreage ? `${item.minAcreage}–${item.maxAcreage} ac` : item.maxAcreage ? `Up to ${item.maxAcreage} ac` : `${item.minAcreage}+ ac`}</span>
                    )}
                    {item.stories && <span className="flex items-center gap-1"><Building2 className="h-4 w-4 text-gray-500" />{item.stories} story</span>}
                    {item.pool && <span className="flex items-center gap-1 bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded-full text-xs font-semibold"><Droplets className="h-3 w-3" />Pool</span>}
                    {item.generator && <span className="flex items-center gap-1 bg-yellow-500/10 text-yellow-400 px-2 py-0.5 rounded-full text-xs font-semibold"><Zap className="h-3 w-3" />Generator</span>}
                  </div>
                  {item.otherAmenities && <p className="text-gray-400 text-sm">Other: {item.otherAmenities}</p>}
                  {item.notes && <p className="text-gray-400 text-sm leading-relaxed line-clamp-2">{item.notes}</p>}
                  <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                    <div className="w-9 h-9 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-base">{item.agentName.charAt(0)}</div>
                    <div>
                      <div className="text-white text-sm font-semibold">{item.agentName}</div>
                      <div className="text-gray-400 text-xs flex items-center gap-1"><Phone className="h-3 w-3" />{item.agentPhone}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OpenHousesSection({ items, loading, active }: { items: OpenHouseListing[]; loading: boolean; active: boolean }) {
  const { containerRef, innerRef } = useAutoScroll(items, active);
  const cards = [...items, ...items];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 flex items-center gap-3 px-8 py-5 bg-gray-900 border-b border-white/10">
        <div className="w-12 h-12 rounded-2xl bg-orange-500/20 flex items-center justify-center">
          <Home className="h-6 w-6 text-orange-400" />
        </div>
        <div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">Open House Opportunities</h2>
          <p className="text-gray-400 text-sm">Available for agents to host — contact listing agent to schedule</p>
        </div>
        <div className="ml-auto bg-orange-500/20 text-orange-300 text-sm font-bold px-3 py-1 rounded-full">
          {items.length} open house{items.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-hidden px-8 py-6" style={{ scrollBehavior: 'auto' }}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-400 text-2xl animate-pulse">Loading…</div>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Home className="h-20 w-20 text-gray-700" />
            <p className="text-gray-500 text-3xl font-semibold">No Open Houses Posted</p>
            <p className="text-gray-600 text-lg">Check back soon or post one from the dashboard</p>
          </div>
        ) : (
          <div ref={innerRef}>
            <div className="grid grid-cols-2 gap-5">
              {cards.map((item, i) => (
                <div key={`${item.id}-${i}`} className="bg-gray-900 border border-white/10 rounded-2xl p-5 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-orange-400 font-bold text-xl leading-tight">{item.address}</div>
                      {item.price && <div className="text-white text-3xl font-bold mt-1">{fmt$(item.price)}</div>}
                    </div>
                    {item.openHouseDate && (
                      <div className="flex-shrink-0 bg-orange-500/20 border border-orange-500/30 rounded-xl px-4 py-2 text-center">
                        <div className="text-orange-400 text-xs font-semibold uppercase">Open House</div>
                        <div className="text-white font-bold text-sm">{fmtDate(item.openHouseDate)}</div>
                        {item.openHouseTime && (
                          <div className="text-orange-300 text-xs">{item.openHouseTime}{item.openHouseEndTime ? ` – ${item.openHouseEndTime}` : ''}</div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-gray-300 text-sm">
                    {item.beds && <span className="flex items-center gap-1"><Bed className="h-4 w-4 text-gray-500" />{item.beds} bd</span>}
                    {item.baths && <span className="flex items-center gap-1"><Bath className="h-4 w-4 text-gray-500" />{item.baths} ba</span>}
                    {item.sqft && <span className="flex items-center gap-1"><Square className="h-4 w-4 text-gray-500" />{item.sqft.toLocaleString()} sqft</span>}
                  </div>
                  {item.notes && <p className="text-gray-400 text-sm leading-relaxed line-clamp-2">{item.notes}</p>}
                  <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                    <div className="w-9 h-9 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 font-bold text-base">{item.agentName.charAt(0)}</div>
                    <div>
                      <div className="text-white text-sm font-semibold">{item.agentName}</div>
                      <div className="text-gray-400 text-xs flex items-center gap-1"><Phone className="h-3 w-3" />{item.agentPhone}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Community Board ─────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'coming-soon', label: 'Coming Soon', color: 'bg-purple-500', dot: 'bg-purple-400' },
  { id: 'buyer-needs', label: 'Buyer Needs', color: 'bg-blue-500', dot: 'bg-blue-400' },
  { id: 'open-houses', label: 'Open Houses', color: 'bg-orange-500', dot: 'bg-orange-400' },
];

export default function CommunityBoardPage() {
  const [comingSoon, setComingSoon] = useState<ComingSoonListing[]>([]);
  const [buyerNeeds, setBuyerNeeds] = useState<BuyerNeed[]>([]);
  const [openHouses, setOpenHouses] = useState<OpenHouseListing[]>([]);
  const [loadingCS, setLoadingCS] = useState(true);
  const [loadingBN, setLoadingBN] = useState(true);
  const [loadingOH, setLoadingOH] = useState(true);

  const [currentSection, setCurrentSection] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [intervalSec, setIntervalSec] = useState(30);
  const [now, setNow] = useState(new Date());
  const [showControls, setShowControls] = useState(false);

  const progressRef = useRef(0);
  const startTimeRef = useRef(Date.now());
  const animRef = useRef<number | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load TV config for interval
  useEffect(() => {
    fetch('/api/community/tv-config')
      .then((r) => r.json())
      .then((json) => {
        if (json.ok && json.config?.communityBoardIntervalSeconds) {
          setIntervalSec(json.config.communityBoardIntervalSeconds);
        } else if (json.ok && json.config?.rotationIntervalSeconds) {
          setIntervalSec(json.config.rotationIntervalSeconds);
        }
      })
      .catch(() => {});
  }, []);

  // Load data
  useEffect(() => {
    const loadAll = () => {
      fetch('/api/community/coming-soon').then(r => r.json()).then(d => { if (d.ok) setComingSoon(d.items || []); }).catch(() => {}).finally(() => setLoadingCS(false));
      fetch('/api/community/buyer-needs').then(r => r.json()).then(d => { if (d.ok) setBuyerNeeds(d.items || []); }).catch(() => {}).finally(() => setLoadingBN(false));
      fetch('/api/community/open-houses').then(r => r.json()).then(d => { if (d.ok) setOpenHouses(d.items || []); }).catch(() => {}).finally(() => setLoadingOH(false));
    };
    loadAll();
    const interval = setInterval(loadAll, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Progress bar + auto-advance
  const intervalMs = intervalSec * 1000;

  const goNext = useCallback(() => {
    setCurrentSection(i => (i + 1) % SECTIONS.length);
    startTimeRef.current = Date.now();
    progressRef.current = 0;
    setProgress(0);
  }, []);

  const goPrev = useCallback(() => {
    setCurrentSection(i => (i - 1 + SECTIONS.length) % SECTIONS.length);
    startTimeRef.current = Date.now();
    progressRef.current = 0;
    setProgress(0);
  }, []);

  useEffect(() => {
    if (paused) return;
    startTimeRef.current = Date.now();

    const tick = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min((elapsed / intervalMs) * 100, 100);
      setProgress(pct);
      if (elapsed >= intervalMs) goNext();
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [paused, intervalMs, goNext, currentSection]);

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  };

  return (
    <div
      className="relative bg-gray-950 text-white"
      style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}
      onMouseMove={handleMouseMove}
    >
      {/* Progress bar */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-white/10 z-50">
        <div
          className={`h-full transition-none ${SECTIONS[currentSection].color}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Section content — fade transition */}
      <div className="w-full h-full">
        {currentSection === 0 && <ComingSoonSection items={comingSoon} loading={loadingCS} active={currentSection === 0} />}
        {currentSection === 1 && <BuyerNeedsSection items={buyerNeeds} loading={loadingBN} active={currentSection === 1} />}
        {currentSection === 2 && <OpenHousesSection items={openHouses} loading={loadingOH} active={currentSection === 2} />}
      </div>

      {/* Bottom: section dots + clock */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-8 py-3 bg-gray-900/80 backdrop-blur-sm border-t border-white/10 z-40">
        {/* Section dots */}
        <div className="flex items-center gap-4">
          {SECTIONS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => { setCurrentSection(i); startTimeRef.current = Date.now(); setProgress(0); }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold transition-all ${
                i === currentSection
                  ? `${s.color} text-white shadow-lg`
                  : 'bg-white/10 text-white/50 hover:bg-white/20 hover:text-white'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${i === currentSection ? 'bg-white' : s.dot}`} />
              {s.label}
            </button>
          ))}
        </div>

        {/* Clock */}
        <div className="text-right">
          <div className="text-xl font-mono font-bold text-white">
            {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="text-gray-400 text-xs">
            {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        </div>
      </div>

      {/* Controls overlay */}
      <div className={`absolute inset-0 z-40 pointer-events-none transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
        {/* Left/right arrows */}
        <button
          onClick={goPrev}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors pointer-events-auto"
        >
          <ChevronLeft className="h-7 w-7" />
        </button>
        <button
          onClick={goNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors pointer-events-auto"
        >
          <ChevronRight className="h-7 w-7" />
        </button>

        {/* Pause/resume */}
        <button
          onClick={() => setPaused(p => !p)}
          className="absolute top-4 right-4 px-4 py-2 rounded-full bg-black/50 hover:bg-black/70 text-white text-sm font-semibold transition-colors pointer-events-auto flex items-center gap-2"
        >
          {paused ? '▶ Resume' : '⏸ Pause'}
        </button>
      </div>
    </div>
  );
}
