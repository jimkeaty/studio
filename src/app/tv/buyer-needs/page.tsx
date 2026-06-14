'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Users, Phone, MapPin, DollarSign, Bed, Bath, Droplets, Zap, Building2 } from 'lucide-react';

type BuyerNeed = {
  id: string;
  area: string;
  minPrice?: number | null;
  maxPrice?: number | null;
  beds?: number | null;
  baths?: number | null;
  minAcreage?: number | null;
  maxAcreage?: number | null;
  pool?: boolean;
  generator?: boolean;
  stories?: string | null;
  otherAmenities?: string;
  notes?: string;
  agentName: string;
  agentPhone: string;
  createdAt: string;
};

function fmt$(n?: number | null) {
  if (!n) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export default function BuyerNeedsTvPage() {
  const [items, setItems] = useState<BuyerNeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const scrollRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    const load = () => {
      fetch('/api/community/buyer-needs')
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

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || items.length === 0) return;
    const SPEED = 0.4;
    let paused = false;
    let pos = 0;

    const tick = () => {
      if (!paused && el) {
        pos += SPEED;
        if (pos >= el.scrollHeight - el.clientHeight) pos = 0;
        el.scrollTop = pos;
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
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <Users className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Buyer Needs Board</h1>
            <p className="text-gray-400 text-sm">Active buyers looking for properties — contact agent to match</p>
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
            <Users className="h-16 w-16 text-gray-700" />
            <p className="text-gray-500 text-2xl font-semibold">No Buyer Needs Posted</p>
            <p className="text-gray-600 text-lg">Post a buyer need from the dashboard</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-5">
            {items.map((item) => (
              <div key={item.id} className="bg-gray-900 border border-white/10 rounded-2xl p-5 flex flex-col gap-3">
                {/* Area + price range */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-blue-400 font-bold text-lg">
                      <MapPin className="h-4 w-4" />{item.area}
                    </div>
                    {(item.minPrice || item.maxPrice) && (
                      <div className="text-white text-xl font-bold mt-1">
                        {item.minPrice && item.maxPrice
                          ? `${fmt$(item.minPrice)} – ${fmt$(item.maxPrice)}`
                          : item.maxPrice
                          ? `Up to ${fmt$(item.maxPrice)}`
                          : `From ${fmt$(item.minPrice)}`}
                      </div>
                    )}
                  </div>
                  <div className="flex-shrink-0 bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2 text-center">
                    <div className="text-blue-400 text-xs font-semibold uppercase">Buyer</div>
                    <div className="text-white font-bold text-sm">Active</div>
                  </div>
                </div>

                {/* Details row */}
                <div className="flex flex-wrap items-center gap-3 text-gray-300 text-sm">
                  {item.beds && (
                    <span className="flex items-center gap-1"><Bed className="h-4 w-4 text-gray-500" />{item.beds}+ bd</span>
                  )}
                  {item.baths && (
                    <span className="flex items-center gap-1"><Bath className="h-4 w-4 text-gray-500" />{item.baths}+ ba</span>
                  )}
                  {(item.minAcreage || item.maxAcreage) && (
                    <span className="flex items-center gap-1 text-gray-400">
                      🌿 {item.minAcreage && item.maxAcreage ? `${item.minAcreage}–${item.maxAcreage} ac` : item.maxAcreage ? `Up to ${item.maxAcreage} ac` : `${item.minAcreage}+ ac`}
                    </span>
                  )}
                  {item.stories && (
                    <span className="flex items-center gap-1"><Building2 className="h-4 w-4 text-gray-500" />{item.stories} story</span>
                  )}
                  {item.pool && (
                    <span className="flex items-center gap-1 bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded-full text-xs font-semibold">
                      <Droplets className="h-3 w-3" />Pool
                    </span>
                  )}
                  {item.generator && (
                    <span className="flex items-center gap-1 bg-yellow-500/10 text-yellow-400 px-2 py-0.5 rounded-full text-xs font-semibold">
                      <Zap className="h-3 w-3" />Generator
                    </span>
                  )}
                </div>

                {/* Other amenities / notes */}
                {item.otherAmenities && (
                  <p className="text-gray-400 text-sm">Other: {item.otherAmenities}</p>
                )}
                {item.notes && (
                  <p className="text-gray-400 text-sm leading-relaxed line-clamp-2">{item.notes}</p>
                )}

                {/* Agent */}
                <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-sm">
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
        <span className="text-gray-500 text-xs">{items.length} active buyer need{items.length !== 1 ? 's' : ''}</span>
        <span className="text-gray-600 text-xs">Refreshes every 5 minutes · Auto-removed if not confirmed weekly</span>
      </div>
    </div>
  );
}
