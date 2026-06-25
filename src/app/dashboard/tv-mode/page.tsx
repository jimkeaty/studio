'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import {
  Tv, Home, Users, Clock, ExternalLink, Plus, Trash2, CheckCircle,
  AlertCircle, Settings, ChevronDown, ChevronUp, Phone, MapPin,
  Bed, Bath, Square, DollarSign, Calendar, Droplets, Zap, Building2,
  RefreshCw, Pencil, Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ─── Types ────────────────────────────────────────────────────────────────────
type BoardItem = {
  id: string;
  agentName: string;
  agentPhone: string;
  agentProfileId?: string;
  status: 'active' | 'removed';
  createdAt: string;
  lastConfirmedAt?: string;
  // Open house
  address?: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  notes?: string;
  openHouseDate?: string;
  openHouseTime?: string;
  openHouseEndTime?: string;
  // Buyer need
  area?: string;
  minPrice?: number;
  maxPrice?: number;
  minAcreage?: number;
  maxAcreage?: number;
  pool?: boolean;
  generator?: boolean;
  stories?: string;
  otherAmenities?: string;
  // Coming soon
  expectedDate?: string;
  acreage?: number;
  // Identity
  createdByUid?: string;
};

type TvConfig = {
  rotationIntervalSeconds: number;
  communityBoardIntervalSeconds?: number;
  enabledPages: string[];
  communitySections?: string[]; // ordered list of sections shown in the Community Board
  pinnedCompetitionId?: string | null; // competition to show in the Competition section
};

const ALL_COMMUNITY_SECTIONS: { id: string; label: string; emoji: string; desc: string }[] = [
  { id: 'activity',    label: 'Activity Board',  emoji: '📊', desc: 'New listings, under contract & recent sold' },
  { id: 'leaderboard', label: 'Leaderboard',     emoji: '🏆', desc: 'Production rankings with auto-scroll' },
  { id: 'coming-soon', label: 'Coming Soon',     emoji: '🕐', desc: 'Listings hitting the market soon' },
  { id: 'buyer-needs', label: 'Buyer Needs',     emoji: '🔍', desc: 'Active buyer searches' },
  { id: 'open-houses', label: 'Open Houses',     emoji: '🏠', desc: 'Upcoming open house events' },
  { id: 'competition', label: 'Competition',     emoji: '🏎️', desc: 'Live competition scoreboard (NASCAR, Golf, etc.)' },
];

const DEFAULT_COMMUNITY_SECTIONS = ['activity', 'leaderboard', 'coming-soon', 'buyer-needs', 'open-houses'];

function fmt$(n?: number | null) {
  if (!n) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function daysSince(dateStr?: string) {
  if (!dateStr) return 999;
  const d = new Date(dateStr);
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TvModePage() {
  const { user } = useUser();
  const router = useRouter();

  const [tab, setTab] = useState<'open-houses' | 'buyer-needs' | 'coming-soon'>('open-houses');
  const [items, setItems] = useState<BoardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [tvConfig, setTvConfig] = useState<TvConfig>({ rotationIntervalSeconds: 30, communityBoardIntervalSeconds: 30, enabledPages: ['activity', 'leaderboard', 'community'], communitySections: DEFAULT_COMMUNITY_SECTIONS, pinnedCompetitionId: null });
  const [activeCompetitions, setActiveCompetitions] = useState<{ id: string; name: string }[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Current user's profile IDs — used for isOwner checks on community board items
  // We collect all possible IDs (Firebase UID, profile doc ID, agentId slug) so that
  // items created under any of these IDs are correctly identified as "owned" by this user.
  const [myProfileIds, setMyProfileIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!user) return;
    const ids = new Set<string>();
    ids.add(user.uid);
    // Fetch the canonical profile doc ID and agentId slug
    user.getIdToken().then((token) => {
      fetch('/api/agent/profile', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((json) => {
          if (json.ok && json.profile) {
            if (json.profile.docId) ids.add(json.profile.docId);
            if (json.profile.agentId) ids.add(json.profile.agentId);
          }
          setMyProfileIds(new Set(ids));
        })
        .catch(() => setMyProfileIds(new Set(ids)));
    });
  }, [user]);

  // Form state
  const [form, setForm] = useState<Record<string, string | boolean | number>>({});
  // Edit state
  const [editingItem, setEditingItem] = useState<BoardItem | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  // Search/filter state
  const [searchQuery, setSearchQuery] = useState('');

  const apiPath = tab === 'open-houses' ? 'open-houses' : tab === 'buyer-needs' ? 'buyer-needs' : 'coming-soon';

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const token = await user!.getIdToken();
      const res = await fetch(`/api/community/${apiPath}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.ok) setItems(json.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [apiPath, user]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const loadTvConfig = useCallback(async () => {
    try {
      const token = await user!.getIdToken();
      const res = await fetch('/api/community/tv-config', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.ok && json.config) {
        setTvConfig({
          rotationIntervalSeconds: json.config.rotationIntervalSeconds ?? 30,
          communityBoardIntervalSeconds: json.config.communityBoardIntervalSeconds ?? 30,
          enabledPages: json.config.enabledPages ?? ['activity', 'leaderboard', 'community'],
          communitySections: json.config.communitySections ?? DEFAULT_COMMUNITY_SECTIONS,
          pinnedCompetitionId: json.config.pinnedCompetitionId ?? null,
        });
      }
      // Load active competitions for the pin selector
      try {
        const compRes = await fetch(`/api/competitions?status=active&year=${new Date().getFullYear()}`, {
          headers: { Authorization: `Bearer ${await user!.getIdToken()}` },
        });
        const compJson = await compRes.json();
        if (compJson.ok) {
          setActiveCompetitions((compJson.competitions || []).map((c: { id: string; config: { name: string } }) => ({ id: c.id, name: c.config.name })));
        }
      } catch {}
    } catch (e) { console.error(e); }
  }, [user]);

  useEffect(() => { loadTvConfig(); }, [loadTvConfig]);

  const handleAdd = async () => {
    setSaving(true);
    try {
      const token = await user!.getIdToken();
      const body: Record<string, unknown> = { ...form };
      // Convert number fields
      ['price', 'minPrice', 'maxPrice', 'beds', 'baths', 'sqft', 'acreage', 'minAcreage', 'maxAcreage'].forEach((k) => {
        if (body[k] !== undefined && body[k] !== '') body[k] = Number(body[k]);
        else if (body[k] === '') delete body[k];
      });
      const res = await fetch(`/api/community/${apiPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.ok) {
        setShowAddDialog(false);
        setForm({});
        loadItems();
      }
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  const handleConfirm = async (id: string) => {
    setConfirmingId(id);
    try {
      const token = await user!.getIdToken();
      await fetch(`/api/community/${apiPath}/${id}/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      loadItems();
    } catch (e) { console.error(e); } finally { setConfirmingId(null); }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const token = await user!.getIdToken();
      await fetch(`/api/community/${apiPath}/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      loadItems();
    } catch (e) { console.error(e); } finally { setDeletingId(null); }
  };

  const openEditDialog = (item: BoardItem) => {
    setEditingItem(item);
    // Pre-fill the edit form with existing values
    const prefill: Record<string, string | boolean | number> = {};
    const fields: (keyof BoardItem)[] = [
      'agentName', 'agentPhone', 'address', 'price', 'beds', 'baths', 'sqft',
      'notes', 'openHouseDate', 'openHouseTime', 'openHouseEndTime',
      'area', 'minPrice', 'maxPrice', 'minAcreage', 'maxAcreage', 'pool',
      'generator', 'stories', 'otherAmenities', 'expectedDate', 'acreage',
    ];
    fields.forEach((k) => {
      const v = item[k];
      if (v !== undefined && v !== null) prefill[k as string] = v as string | boolean | number;
    });
    setForm(prefill);
    setShowEditDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    setEditSaving(true);
    try {
      const token = await user!.getIdToken();
      const body: Record<string, unknown> = { ...form };
      ['price', 'minPrice', 'maxPrice', 'beds', 'baths', 'sqft', 'acreage', 'minAcreage', 'maxAcreage'].forEach((k) => {
        if (body[k] !== undefined && body[k] !== '') body[k] = Number(body[k]);
        else if (body[k] === '') body[k] = null;
      });
      const res = await fetch(`/api/community/${apiPath}/${editingItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.ok) {
        setShowEditDialog(false);
        setEditingItem(null);
        setForm({});
        loadItems();
      }
    } catch (e) { console.error(e); } finally { setEditSaving(false); }
  };

  const saveTvConfig = async () => {
    try {
      const token = await user!.getIdToken();
      await fetch('/api/community/tv-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(tvConfig),
      });
      setShowSettings(false);
    } catch (e) { console.error(e); }
  };

  const togglePage = (page: string) => {
    setTvConfig((prev) => ({
      ...prev,
      enabledPages: prev.enabledPages.includes(page)
        ? prev.enabledPages.filter((p) => p !== page)
        : [...prev.enabledPages, page],
    }));
  };

  const toggleCommunitySection = (sectionId: string) => {
    setTvConfig((prev) => {
      const current = prev.communitySections ?? DEFAULT_COMMUNITY_SECTIONS;
      const next = current.includes(sectionId)
        ? current.filter((s) => s !== sectionId)
        : [...current, sectionId];
      return { ...prev, communitySections: next.length > 0 ? next : current }; // prevent empty list
    });
  };

  const moveCommunitySection = (sectionId: string, dir: 'up' | 'down') => {
    setTvConfig((prev) => {
      const current = [...(prev.communitySections ?? DEFAULT_COMMUNITY_SECTIONS)];
      const idx = current.indexOf(sectionId);
      if (idx < 0) return prev;
      const newIdx = dir === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= current.length) return prev;
      [current[idx], current[newIdx]] = [current[newIdx], current[idx]];
      return { ...prev, communitySections: current };
    });
  };

  const tabConfig = {
    'open-houses': { label: 'Open Houses', icon: Home, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
    'buyer-needs': { label: 'Buyer Needs', icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    'coming-soon': { label: 'Coming Soon', icon: Clock, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  };

  const tc = tabConfig[tab];

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center">
            <Tv className="h-5 w-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">TV Mode</h1>
            <p className="text-gray-400 text-sm">Manage office boards · Open Houses · Buyer Needs · Coming Soon</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="border-gray-700 text-gray-300 hover:bg-gray-800"
            onClick={() => setShowSettings(true)}
          >
            <Settings className="h-4 w-4 mr-2" />TV Settings
          </Button>
          <Button
            size="sm"
            className="bg-orange-500 hover:bg-orange-600 text-white"
            onClick={() => router.push('/tv')}
          >
            <ExternalLink className="h-4 w-4 mr-2" />Open TV Mode
          </Button>
        </div>
      </div>

      {/* TV Mode quick links */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Activity Board', path: '/new-activity', icon: '📊', desc: 'New listings, pendings & sold' },
          { label: 'Leaderboard', path: '/leaderboard', icon: '🏆', desc: 'Production rankings' },
          { label: 'Community Board', path: '/tv/community', icon: '🏡', desc: 'Coming Soon · Buyer Needs · Open Houses' },
        ].map((page) => (
          <button
            key={page.path}
            onClick={() => window.open(page.path, '_blank')}
            className="bg-gray-900 border border-white/10 rounded-xl p-4 text-center hover:bg-gray-800 transition-colors"
          >
            <div className="text-3xl mb-2">{page.icon}</div>
            <div className="text-sm text-white font-semibold">{page.label}</div>
            {'desc' in page && <div className="text-xs text-gray-500 mt-1">{(page as any).desc}</div>}
            <div className="text-xs text-orange-400 mt-2 flex items-center justify-center gap-1">
              <ExternalLink className="h-3 w-3" />Open TV View
            </div>
          </button>
        ))}
      </div>

      {/* Board management tabs */}
      <div className="bg-gray-900 border border-white/10 rounded-2xl overflow-hidden">
        <div className="flex border-b border-white/10">
          {(Object.keys(tabConfig) as Array<keyof typeof tabConfig>).map((t) => {
            const cfg = tabConfig[t];
            const Icon = cfg.icon;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-colors ${
                  tab === t ? `${cfg.color} border-b-2 border-current` : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <Icon className="h-4 w-4" />{cfg.label}
              </button>
            );
          })}
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">{items.length} active listing{items.length !== 1 ? 's' : ''}</span>
              <button onClick={loadItems} className="text-gray-600 hover:text-gray-400">
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <Button
              size="sm"
              className="bg-orange-500 hover:bg-orange-600 text-white"
              onClick={() => { setForm({}); setShowAddDialog(true); }}
            >
              <Plus className="h-4 w-4 mr-1" />Add {tc.label.slice(0, -1)}
            </Button>
          </div>
          {/* Search bar */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
            <Input
              className="bg-gray-800 border-white/10 text-white pl-9 h-8 text-sm"
              placeholder={`Search ${tc.label.toLowerCase()} by address, area, or agent...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="py-12 text-center text-gray-500">Loading...</div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center">
              <tc.icon className="h-10 w-10 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No {tc.label} posted yet</p>
              <p className="text-gray-600 text-sm mt-1">Click "Add" to post one to the office TV board</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items
                .filter((item) => {
                  if (!searchQuery.trim()) return true;
                  const q = searchQuery.toLowerCase();
                  return (
                    (item.address || '').toLowerCase().includes(q) ||
                    (item.area || '').toLowerCase().includes(q) ||
                    (item.agentName || '').toLowerCase().includes(q) ||
                    (item.notes || '').toLowerCase().includes(q) ||
                    (item.otherAmenities || '').toLowerCase().includes(q)
                  );
                })
                .map((item) => {
                const days = daysSince(item.lastConfirmedAt || item.createdAt);
                const needsConfirm = days >= 7;
                const isOwner = !!(myProfileIds.size > 0 && (
                  myProfileIds.has(item.createdByUid ?? '') ||
                  myProfileIds.has(item.agentProfileId ?? '')
                ));
                return (
                  <div key={item.id} className={`bg-gray-800 border rounded-xl p-4 ${needsConfirm ? 'border-yellow-500/40' : 'border-white/10'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Title */}
                        <div className={`font-semibold ${tc.color} truncate`}>
                          {item.address || item.area || 'Listing'}
                        </div>
                        {/* Details */}
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-gray-400 text-xs">
                          {item.price && <span>{fmt$(item.price)}</span>}
                          {item.minPrice && <span>From {fmt$(item.minPrice)}</span>}
                          {item.maxPrice && !item.minPrice && <span>Up to {fmt$(item.maxPrice)}</span>}
                          {item.beds && <span>{item.beds} bd</span>}
                          {item.baths && <span>{item.baths} ba</span>}
                          {item.openHouseDate && <span>📅 {item.openHouseDate}</span>}
                          {item.expectedDate && <span>📅 Expected {item.expectedDate}</span>}
                        </div>
                        {/* Agent */}
                        <div className="flex items-center gap-1 mt-2 text-gray-500 text-xs">
                          <span>{item.agentName}</span>
                          <span>·</span>
                          <Phone className="h-3 w-3" />
                          <span>{item.agentPhone}</span>
                          <span>·</span>
                          <span className={needsConfirm ? 'text-yellow-400' : 'text-gray-600'}>
                            {days === 0 ? 'Confirmed today' : `Last confirmed ${days}d ago`}
                          </span>
                        </div>
                      </div>
                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {needsConfirm && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10 text-xs h-7"
                            onClick={() => handleConfirm(item.id)}
                            disabled={confirmingId === item.id}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            {confirmingId === item.id ? '...' : 'Still Active'}
                          </Button>
                        )}
                        {!needsConfirm && (
                          <span className="text-green-400 text-xs flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" />Active
                          </span>
                        )}
                        {isOwner && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-gray-500 hover:text-blue-400 h-7 w-7 p-0"
                            onClick={() => openEditDialog(item)}
                            title="Edit this post"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {isOwner && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-gray-600 hover:text-red-400 h-7 w-7 p-0"
                            onClick={() => handleDelete(item.id)}
                            disabled={deletingId === item.id}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─── Add Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-gray-900 border-white/10 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className={tc.color}>Add {tab === 'open-houses' ? 'Open House' : tab === 'buyer-needs' ? 'Buyer Need' : 'Coming Soon Listing'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Common: Agent info */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300 text-xs">Agent Name *</Label>
                <Input className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.agentName || '')} onChange={(e) => setForm((f) => ({ ...f, agentName: e.target.value }))} placeholder="Your name" />
              </div>
              <div>
                <Label className="text-gray-300 text-xs">Agent Phone *</Label>
                <Input className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.agentPhone || '')} onChange={(e) => setForm((f) => ({ ...f, agentPhone: e.target.value }))} placeholder="(555) 555-5555" />
              </div>
            </div>

            {/* Open House fields */}
            {tab === 'open-houses' && (
              <>
                <div>
                  <Label className="text-gray-300 text-xs">Property Address *</Label>
                  <Input className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.address || '')} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="123 Main St, Lafayette, LA" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-gray-300 text-xs">List Price</Label>
                    <Input type="number" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.price || '')} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="350000" />
                  </div>
                  <div>
                    <Label className="text-gray-300 text-xs">Beds</Label>
                    <Input type="number" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.beds || '')} onChange={(e) => setForm((f) => ({ ...f, beds: e.target.value }))} placeholder="3" />
                  </div>
                  <div>
                    <Label className="text-gray-300 text-xs">Baths</Label>
                    <Input type="number" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.baths || '')} onChange={(e) => setForm((f) => ({ ...f, baths: e.target.value }))} placeholder="2" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-gray-300 text-xs">Open House Date</Label>
                    <Input type="date" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.openHouseDate || '')} onChange={(e) => setForm((f) => ({ ...f, openHouseDate: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-gray-300 text-xs">Start Time</Label>
                    <Input type="time" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.openHouseTime || '')} onChange={(e) => setForm((f) => ({ ...f, openHouseTime: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-gray-300 text-xs">End Time</Label>
                    <Input type="time" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.openHouseEndTime || '')} onChange={(e) => setForm((f) => ({ ...f, openHouseEndTime: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label className="text-gray-300 text-xs">Notes / Description</Label>
                  <Textarea className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.notes || '')} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Beautiful 3/2 in Youngsville..." rows={3} />
                </div>
              </>
            )}

            {/* Buyer Need fields */}
            {tab === 'buyer-needs' && (
              <>
                <div>
                  <Label className="text-gray-300 text-xs">Area / Neighborhood *</Label>
                  <Input className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.area || '')} onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))} placeholder="Near UL campus, Youngsville, South Lafayette..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-gray-300 text-xs">Min Price</Label>
                    <Input type="number" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.minPrice || '')} onChange={(e) => setForm((f) => ({ ...f, minPrice: e.target.value }))} placeholder="200000" />
                  </div>
                  <div>
                    <Label className="text-gray-300 text-xs">Max Price</Label>
                    <Input type="number" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.maxPrice || '')} onChange={(e) => setForm((f) => ({ ...f, maxPrice: e.target.value }))} placeholder="400000" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-gray-300 text-xs">Min Beds</Label>
                    <Input type="number" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.beds || '')} onChange={(e) => setForm((f) => ({ ...f, beds: e.target.value }))} placeholder="3" />
                  </div>
                  <div>
                    <Label className="text-gray-300 text-xs">Min Baths</Label>
                    <Input type="number" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.baths || '')} onChange={(e) => setForm((f) => ({ ...f, baths: e.target.value }))} placeholder="2" />
                  </div>
                  <div>
                    <Label className="text-gray-300 text-xs">Stories</Label>
                    <Select value={String(form.stories || '')} onValueChange={(v) => setForm((f) => ({ ...f, stories: v }))} >
                      <SelectTrigger className="bg-gray-800 border-white/10 text-white mt-1"><SelectValue placeholder="Any" /></SelectTrigger>
                      <SelectContent className="bg-gray-800 border-white/10 text-white">
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="1">1 Story</SelectItem>
                        <SelectItem value="2">2 Story</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-gray-300 text-xs">Min Acreage</Label>
                    <Input type="number" step="0.1" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.minAcreage || '')} onChange={(e) => setForm((f) => ({ ...f, minAcreage: e.target.value }))} placeholder="0.5" />
                  </div>
                  <div>
                    <Label className="text-gray-300 text-xs">Max Acreage</Label>
                    <Input type="number" step="0.1" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.maxAcreage || '')} onChange={(e) => setForm((f) => ({ ...f, maxAcreage: e.target.value }))} placeholder="5" />
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch checked={Boolean(form.pool)} onCheckedChange={(v) => setForm((f) => ({ ...f, pool: v }))} />
                    <span className="text-gray-300 text-sm">Pool Required</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch checked={Boolean(form.generator)} onCheckedChange={(v) => setForm((f) => ({ ...f, generator: v }))} />
                    <span className="text-gray-300 text-sm">Generator Required</span>
                  </label>
                </div>
                <div>
                  <Label className="text-gray-300 text-xs">Other Amenities / Notes</Label>
                  <Textarea className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.otherAmenities || '')} onChange={(e) => setForm((f) => ({ ...f, otherAmenities: e.target.value }))} placeholder="Garage, fenced yard, open floor plan..." rows={2} />
                </div>
              </>
            )}

            {/* Coming Soon fields */}
            {tab === 'coming-soon' && (
              <>
                <div>
                  <Label className="text-gray-300 text-xs">Area / Neighborhood *</Label>
                  <Input className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.area || '')} onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))} placeholder="Youngsville, South Lafayette, River Ranch..." />
                </div>
                <div>
                  <Label className="text-gray-300 text-xs">Address (optional)</Label>
                  <Input className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.address || '')} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="123 Main St (leave blank to show area only)" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-gray-300 text-xs">Price / Price Range</Label>
                    <Input type="number" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.price || '')} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="350000" />
                  </div>
                  <div>
                    <Label className="text-gray-300 text-xs">Expected List Date</Label>
                    <Input type="date" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.expectedDate || '')} onChange={(e) => setForm((f) => ({ ...f, expectedDate: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-gray-300 text-xs">Beds</Label>
                    <Input type="number" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.beds || '')} onChange={(e) => setForm((f) => ({ ...f, beds: e.target.value }))} placeholder="3" />
                  </div>
                  <div>
                    <Label className="text-gray-300 text-xs">Baths</Label>
                    <Input type="number" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.baths || '')} onChange={(e) => setForm((f) => ({ ...f, baths: e.target.value }))} placeholder="2" />
                  </div>
                  <div>
                    <Label className="text-gray-300 text-xs">Sq Ft</Label>
                    <Input type="number" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.sqft || '')} onChange={(e) => setForm((f) => ({ ...f, sqft: e.target.value }))} placeholder="2200" />
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch checked={Boolean(form.pool)} onCheckedChange={(v) => setForm((f) => ({ ...f, pool: v }))} />
                    <span className="text-gray-300 text-sm">Pool</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch checked={Boolean(form.generator)} onCheckedChange={(v) => setForm((f) => ({ ...f, generator: v }))} />
                    <span className="text-gray-300 text-sm">Generator</span>
                  </label>
                </div>
                <div>
                  <Label className="text-gray-300 text-xs">Details / Notes</Label>
                  <Textarea className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.notes || '')} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Renovated kitchen, large lot, motivated seller..." rows={3} />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" className="text-gray-400" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white" onClick={handleAdd} disabled={saving}>
              {saving ? 'Posting...' : 'Post to Board'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={showEditDialog} onOpenChange={(open) => { if (!open) { setShowEditDialog(false); setEditingItem(null); setForm({}); } }}>
        <DialogContent className="bg-gray-900 border-white/10 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className={tc.color}>
              Edit {tab === 'open-houses' ? 'Open House' : tab === 'buyer-needs' ? 'Buyer Need' : 'Coming Soon Listing'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Common: Agent info */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300 text-xs">Agent Name *</Label>
                <Input className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.agentName || '')} onChange={(e) => setForm((f) => ({ ...f, agentName: e.target.value }))} placeholder="Your name" />
              </div>
              <div>
                <Label className="text-gray-300 text-xs">Agent Phone *</Label>
                <Input className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.agentPhone || '')} onChange={(e) => setForm((f) => ({ ...f, agentPhone: e.target.value }))} placeholder="(555) 555-5555" />
              </div>
            </div>

            {/* Open House fields */}
            {tab === 'open-houses' && (
              <>
                <div>
                  <Label className="text-gray-300 text-xs">Property Address *</Label>
                  <Input className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.address || '')} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="123 Main St, Lafayette, LA" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-gray-300 text-xs">List Price</Label>
                    <Input type="number" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.price || '')} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="350000" />
                  </div>
                  <div>
                    <Label className="text-gray-300 text-xs">Beds</Label>
                    <Input type="number" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.beds || '')} onChange={(e) => setForm((f) => ({ ...f, beds: e.target.value }))} placeholder="3" />
                  </div>
                  <div>
                    <Label className="text-gray-300 text-xs">Baths</Label>
                    <Input type="number" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.baths || '')} onChange={(e) => setForm((f) => ({ ...f, baths: e.target.value }))} placeholder="2" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-gray-300 text-xs">Open House Date</Label>
                    <Input type="date" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.openHouseDate || '')} onChange={(e) => setForm((f) => ({ ...f, openHouseDate: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-gray-300 text-xs">Start Time</Label>
                    <Input type="time" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.openHouseTime || '')} onChange={(e) => setForm((f) => ({ ...f, openHouseTime: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-gray-300 text-xs">End Time</Label>
                    <Input type="time" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.openHouseEndTime || '')} onChange={(e) => setForm((f) => ({ ...f, openHouseEndTime: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label className="text-gray-300 text-xs">Notes / Description</Label>
                  <Textarea className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.notes || '')} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Beautiful 3/2 in Youngsville..." rows={3} />
                </div>
              </>
            )}

            {/* Buyer Need fields */}
            {tab === 'buyer-needs' && (
              <>
                <div>
                  <Label className="text-gray-300 text-xs">Area / Neighborhood *</Label>
                  <Input className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.area || '')} onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))} placeholder="Near UL campus, Youngsville, South Lafayette..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-gray-300 text-xs">Min Price</Label>
                    <Input type="number" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.minPrice || '')} onChange={(e) => setForm((f) => ({ ...f, minPrice: e.target.value }))} placeholder="200000" />
                  </div>
                  <div>
                    <Label className="text-gray-300 text-xs">Max Price</Label>
                    <Input type="number" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.maxPrice || '')} onChange={(e) => setForm((f) => ({ ...f, maxPrice: e.target.value }))} placeholder="400000" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-gray-300 text-xs">Min Beds</Label>
                    <Input type="number" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.beds || '')} onChange={(e) => setForm((f) => ({ ...f, beds: e.target.value }))} placeholder="3" />
                  </div>
                  <div>
                    <Label className="text-gray-300 text-xs">Min Baths</Label>
                    <Input type="number" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.baths || '')} onChange={(e) => setForm((f) => ({ ...f, baths: e.target.value }))} placeholder="2" />
                  </div>
                  <div>
                    <Label className="text-gray-300 text-xs">Stories</Label>
                    <Select value={String(form.stories || '')} onValueChange={(v) => setForm((f) => ({ ...f, stories: v }))} >
                      <SelectTrigger className="bg-gray-800 border-white/10 text-white mt-1"><SelectValue placeholder="Any" /></SelectTrigger>
                      <SelectContent className="bg-gray-800 border-white/10 text-white">
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="1">1 Story</SelectItem>
                        <SelectItem value="2">2 Story</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-gray-300 text-xs">Min Acreage</Label>
                    <Input type="number" step="0.1" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.minAcreage || '')} onChange={(e) => setForm((f) => ({ ...f, minAcreage: e.target.value }))} placeholder="0.5" />
                  </div>
                  <div>
                    <Label className="text-gray-300 text-xs">Max Acreage</Label>
                    <Input type="number" step="0.1" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.maxAcreage || '')} onChange={(e) => setForm((f) => ({ ...f, maxAcreage: e.target.value }))} placeholder="5" />
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch checked={Boolean(form.pool)} onCheckedChange={(v) => setForm((f) => ({ ...f, pool: v }))} />
                    <span className="text-gray-300 text-sm">Pool Required</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch checked={Boolean(form.generator)} onCheckedChange={(v) => setForm((f) => ({ ...f, generator: v }))} />
                    <span className="text-gray-300 text-sm">Generator Required</span>
                  </label>
                </div>
                <div>
                  <Label className="text-gray-300 text-xs">Other Amenities / Notes</Label>
                  <Textarea className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.otherAmenities || '')} onChange={(e) => setForm((f) => ({ ...f, otherAmenities: e.target.value }))} placeholder="Garage, fenced yard, open floor plan..." rows={2} />
                </div>
              </>
            )}

            {/* Coming Soon fields */}
            {tab === 'coming-soon' && (
              <>
                <div>
                  <Label className="text-gray-300 text-xs">Area / Neighborhood *</Label>
                  <Input className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.area || '')} onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))} placeholder="Youngsville, South Lafayette, River Ranch..." />
                </div>
                <div>
                  <Label className="text-gray-300 text-xs">Address (optional)</Label>
                  <Input className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.address || '')} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="123 Main St (leave blank to show area only)" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-gray-300 text-xs">Price / Price Range</Label>
                    <Input type="number" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.price || '')} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="350000" />
                  </div>
                  <div>
                    <Label className="text-gray-300 text-xs">Expected List Date</Label>
                    <Input type="date" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.expectedDate || '')} onChange={(e) => setForm((f) => ({ ...f, expectedDate: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-gray-300 text-xs">Beds</Label>
                    <Input type="number" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.beds || '')} onChange={(e) => setForm((f) => ({ ...f, beds: e.target.value }))} placeholder="3" />
                  </div>
                  <div>
                    <Label className="text-gray-300 text-xs">Baths</Label>
                    <Input type="number" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.baths || '')} onChange={(e) => setForm((f) => ({ ...f, baths: e.target.value }))} placeholder="2" />
                  </div>
                  <div>
                    <Label className="text-gray-300 text-xs">Sq Ft</Label>
                    <Input type="number" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.sqft || '')} onChange={(e) => setForm((f) => ({ ...f, sqft: e.target.value }))} placeholder="2200" />
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch checked={Boolean(form.pool)} onCheckedChange={(v) => setForm((f) => ({ ...f, pool: v }))} />
                    <span className="text-gray-300 text-sm">Pool</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch checked={Boolean(form.generator)} onCheckedChange={(v) => setForm((f) => ({ ...f, generator: v }))} />
                    <span className="text-gray-300 text-sm">Generator</span>
                  </label>
                </div>
                <div>
                  <Label className="text-gray-300 text-xs">Details / Notes</Label>
                  <Textarea className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.notes || '')} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Renovated kitchen, large lot, motivated seller..." rows={3} />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" className="text-gray-400" onClick={() => { setShowEditDialog(false); setEditingItem(null); setForm({}); }}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSaveEdit} disabled={editSaving}>
              {editSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── TV Settings Dialog ──────────────────────────────────────────── */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="bg-gray-900 border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">TV Mode Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div>
              <Label className="text-gray-300 text-sm font-medium">Rotation Timer</Label>
              <p className="text-gray-500 text-xs mb-2">How long each page shows before rotating to the next</p>
              <Select
                value={String(tvConfig.rotationIntervalSeconds)}
                onValueChange={(v) => setTvConfig((c) => ({ ...c, rotationIntervalSeconds: Number(v) }))}
              >
                <SelectTrigger className="bg-gray-800 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-white/10 text-white">
                  <SelectItem value="30">30 seconds</SelectItem>
                  <SelectItem value="45">45 seconds</SelectItem>
                  <SelectItem value="60">60 seconds</SelectItem>
                  <SelectItem value="90">90 seconds</SelectItem>
                  <SelectItem value="120">2 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-gray-300 text-sm font-medium">Community Board — Section Rotation Timer</Label>
              <p className="text-gray-500 text-xs mb-2">How long each section (Coming Soon, Buyer Needs, Open Houses) shows before rotating</p>
              <Select
                value={String(tvConfig.communityBoardIntervalSeconds ?? 30)}
                onValueChange={(v) => setTvConfig((c) => ({ ...c, communityBoardIntervalSeconds: Number(v) }))}
              >
                <SelectTrigger className="bg-gray-800 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-white/10 text-white">
                  <SelectItem value="15">15 seconds</SelectItem>
                  <SelectItem value="20">20 seconds</SelectItem>
                  <SelectItem value="30">30 seconds</SelectItem>
                  <SelectItem value="45">45 seconds</SelectItem>
                  <SelectItem value="60">60 seconds</SelectItem>
                  <SelectItem value="90">90 seconds</SelectItem>
                  <SelectItem value="120">2 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-gray-300 text-sm font-medium">TV Screens to Enable</Label>
              <p className="text-gray-500 text-xs mb-3">Toggle which standalone screens appear in the TV hub</p>
              <div className="space-y-2">
                {[
                  { id: 'activity', label: '📊 Activity Board', desc: 'New listings, pendings & sold' },
                  { id: 'leaderboard', label: '🏆 Leaderboard', desc: 'Production rankings with auto-scroll' },
                  { id: 'community', label: '🏡 Community Board', desc: 'All 5 sections rotating automatically' },
                ].map((page) => (
                  <label key={page.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg cursor-pointer">
                    <div>
                      <div className="text-gray-300 text-sm">{page.label}</div>
                      <div className="text-gray-500 text-xs">{page.desc}</div>
                    </div>
                    <Switch
                      checked={tvConfig.enabledPages.includes(page.id)}
                      onCheckedChange={() => togglePage(page.id)}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-gray-300 text-sm font-medium">Community Board — Sections &amp; Order</Label>
              <p className="text-gray-500 text-xs mb-3">Choose which sections rotate inside the Community Board and drag to reorder. Use the arrows to change order.</p>
              <div className="space-y-2">
                {ALL_COMMUNITY_SECTIONS.map((sec) => {
                  const isActive = (tvConfig.communitySections ?? DEFAULT_COMMUNITY_SECTIONS).includes(sec.id);
                  const activeList = tvConfig.communitySections ?? DEFAULT_COMMUNITY_SECTIONS;
                  const pos = activeList.indexOf(sec.id);
                  return (
                    <div key={sec.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      isActive ? 'bg-gray-800 border-white/10' : 'bg-gray-900 border-white/5 opacity-50'
                    }`}>
                      {/* Order position badge */}
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        isActive ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-500'
                      }`}>
                        {isActive ? pos + 1 : '–'}
                      </div>
                      <span className="text-lg">{sec.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-gray-300 text-sm font-medium">{sec.label}</div>
                        <div className="text-gray-500 text-xs">{sec.desc}</div>
                      </div>
                      {/* Up/down arrows */}
                      {isActive && (
                        <div className="flex flex-col gap-0.5">
                          <button
                            onClick={() => moveCommunitySection(sec.id, 'up')}
                            disabled={pos === 0}
                            className="p-0.5 text-gray-400 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed"
                          >▲</button>
                          <button
                            onClick={() => moveCommunitySection(sec.id, 'down')}
                            disabled={pos === activeList.length - 1}
                            className="p-0.5 text-gray-400 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed"
                          >▼</button>
                        </div>
                      )}
                      <Switch
                        checked={isActive}
                        onCheckedChange={() => toggleCommunitySection(sec.id)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Competition Pin */}
            {(tvConfig.communitySections ?? DEFAULT_COMMUNITY_SECTIONS).includes('competition') && (
              <div>
                <Label className="text-gray-300 text-sm font-medium">🏎️ Pin a Competition to the Community Board</Label>
                <p className="text-gray-500 text-xs mb-2">Select which active competition shows in the Competition rotation slot</p>
                <Select
                  value={tvConfig.pinnedCompetitionId ?? 'none'}
                  onValueChange={(v) => setTvConfig((c) => ({ ...c, pinnedCompetitionId: v === 'none' ? null : v }))}
                >
                  <SelectTrigger className="bg-gray-800 border-white/10 text-white">
                    <SelectValue placeholder="Select a competition..." />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-white/10 text-white">
                    <SelectItem value="none">— None (hide competition slot) —</SelectItem>
                    {activeCompetitions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                    {activeCompetitions.length === 0 && (
                      <SelectItem value="none" disabled>No active competitions found</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {tvConfig.pinnedCompetitionId && (
                  <p className="text-emerald-400 text-xs mt-1.5 flex items-center gap-1">
                    ✓ Competition scoreboard will auto-scroll and refresh every 30 seconds
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" className="text-gray-400" onClick={() => setShowSettings(false)}>Cancel</Button>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white" onClick={saveTvConfig}>Save Settings</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
