'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Home, Phone, Calendar, DollarSign, Bed, Bath, Square } from 'lucide-react';

type OpenHouseListing = {
  id: string;
  address: string;
  price?: number | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  notes?: string;
  agentName: string;
  agentPhone: string;
  openHouseDate?: string | null;
  openHouseTime?: string;
  openHouseEndTime?: string;
};

function fmt$(n?: number | null) {
  if (!n) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d?: string | null) {
  if (!d) return null;
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch { return d; }
}

export default function OpenHousesTvPage() {
  const [items, setItems] = useState<OpenHouseListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPosRef = useRef(0);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    const load = () => {
      fetch('/api/community/open-houses')
        .then((r) => r.json())
        .then((json) => { if (json.ok) setItems(json.items || []); })
        .catch(() => {})
        .finally(() => setLoading(false));
    };
    load();
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || items.length === 0) return;
    const SPEED = 0.4; // px per frame
    let paused = false;

    const tick = () => {
      if (!paused && el) {
        scrollPosRef.current += SPEED;
        if (scrollPosRef.current >= el.scrollHeight - el.clientHeight) {
          scrollPosRef.current = 0;
        }
        el.scrollTop = scrollPosRef.current;
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);

    const pause = () => { paused = true; };
    const resume = () => { paused = false; };
    el.addEventListener('mouseenter', pause);
    el.addEventListener('mouseleave', resume);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      el.removeEventListener('mouseenter', pause);
      el.removeEventListener('mouseleave', resume);
    };
  }, [items]);

  return (
    <div className="bg-gray-950 text-white flex flex-col" style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-8 py-4 bg-gray-900 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
            <Home className="h-5 w-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Open House Opportunities</h1>
            <p className="text-gray-400 text-sm">Available for agents to host — contact listing agent to schedule</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-mono font-bold text-white">
            {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="text-gray-400 text-sm">
            {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-hidden px-8 py-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-400 text-xl">Loading...</div>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Home className="h-16 w-16 text-gray-700" />
            <p className="text-gray-500 text-2xl font-semibold">No Open Houses Posted</p>
            <p className="text-gray-600 text-lg">Check back soon or post one from the dashboard</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-5">
            {items.map((item) => (
              <div key={item.id} className="bg-gray-900 border border-white/10 rounded-2xl p-5 flex flex-col gap-3">
                {/* Address + price */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-orange-400 font-bold text-lg leading-tight">{item.address}</div>
                    {item.price && (
                      <div className="text-white text-2xl font-bold mt-1">{fmt$(item.price)}</div>
                    )}
                  </div>
                  {item.openHouseDate && (
                    <div className="flex-shrink-0 bg-orange-500/20 border border-orange-500/30 rounded-xl px-3 py-2 text-center">
                      <div className="text-orange-400 text-xs font-semibold uppercase">Open House</div>
                      <div className="text-white font-bold text-sm">{fmtDate(item.openHouseDate)}</div>
                      {item.openHouseTime && (
                        <div className="text-orange-300 text-xs">
                          {item.openHouseTime}{item.openHouseEndTime ? ` – ${item.openHouseEndTime}` : ''}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Details row */}
                <div className="flex items-center gap-4 text-gray-300 text-sm">
                  {item.beds && (
                    <span className="flex items-center gap-1"><Bed className="h-4 w-4 text-gray-500" />{item.beds} bd</span>
                  )}
                  {item.baths && (
                    <span className="flex items-center gap-1"><Bath className="h-4 w-4 text-gray-500" />{item.baths} ba</span>
                  )}
                  {item.sqft && (
                    <span className="flex items-center gap-1"><Square className="h-4 w-4 text-gray-500" />{item.sqft.toLocaleString()} sqft</span>
                  )}
                </div>

                {/* Notes */}
                {item.notes && (
                  <p className="text-gray-200 text-sm leading-relaxed line-clamp-2 border-l-2 border-orange-500/50 pl-3 bg-orange-500/5 rounded-r py-1">{item.notes}</p>
                )}

                {/* Agent */}
                <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                  <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 font-bold text-sm">
                    {item.agentName.charAt(0)}
                  </div>
                  <div>
                    <div className="text-white text-sm font-semibold">{item.agentName}</div>
                    <div className="text-gray-400 text-xs flex items-center gap-1">
                      <Phone className="h-3 w-3" />{item.agentPhone}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 px-8 py-2 bg-gray-900 border-t border-white/10 flex items-center justify-between">
        <span className="text-gray-500 text-xs">{items.length} open house{items.length !== 1 ? 's' : ''} available</span>
        <span className="text-gray-600 text-xs">Refreshes every 5 minutes · Auto-removed if not confirmed weekly</span>
      </div>
    </div>
  );
}
