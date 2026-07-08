'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useUser } from '@/firebase';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Tv, Home, Users, Clock, ExternalLink, Plus, Trash2, CheckCircle,
  AlertCircle, Settings, ChevronDown, ChevronUp, Phone, MapPin,
  Bed, Bath, Square, DollarSign, Calendar, Droplets, Zap, Building2,
  RefreshCw, Pencil, Search, Handshake
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
import { PostComments } from '@/components/community/PostComments';

// ─── Time helpers ────────────────────────────────────────────────────────────
const TIME_OPTIONS: string[] = [];
for (let h = 7; h <= 20; h++) {
  for (const m of [0, 30]) {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    TIME_OPTIONS.push(`${h12}:${String(m).padStart(2, '0')} ${ampm}`);
  }
}

function toMinutes(t: string): number {
  if (!t) return -1;
  const upper = t.toUpperCase().trim();
  const isPM = upper.includes('PM');
  const isAM = upper.includes('AM');
  const clean = upper.replace(/AM|PM/g, '').trim();
  const [hStr, mStr] = clean.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr || '0', 10);
  if (isPM && h !== 12) h += 12;
  if (isAM && h === 12) h = 0;
  return h * 60 + m;
}

function fmtDate(d: string): string {
  if (!d) return '';
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch { return d; }
}

// ─── Types ────────────────────────────────────────────────────────────────────
// ─── Agent Help Types ────────────────────────────────────────────────────────
type HelpType = 'showing' | 'inspection' | 'closing' | 'other';

type AgentHelpItem = {
  id: string;
  helpType: HelpType;
  description: string;
  propertyAddress?: string;
  needDate?: string;
  needTime?: string;
  compensation?: number;
  compensationNote?: string;
  agentName: string;
  agentPhone: string;
  agentEmail?: string;
  agentProfileId?: string;
  createdByUid?: string;
  status: 'active' | 'removed';
  claimedByUid?: string | null;
  claimedByName?: string | null;
  claimedByPhone?: string | null;
  claimedByEmail?: string | null;
  claimedAt?: string | null;
  createdAt: string;
};

type OHClaim = {
  claimId: string;
  claimedByUid: string;
  claimantName: string;
  claimantPhone: string;
  claimantEmail?: string;
  claimedDate: string;
  claimedStartTime: string;
  claimedEndTime: string;
  claimedAt: string;
};

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
  // Compensation (open house opportunities)
  compensation?: number | null;
  compensationNote?: string;
  // Claim fields (legacy single-claim)
  claimedByUid?: string | null;
  claimedByName?: string | null;
  claimedByPhone?: string | null;
  claimedByEmail?: string | null;
  claimedDate?: string | null;
  claimedTime?: string | null;
  claimedEndTime?: string | null;
  claimedAt?: string | null;
  // Multi-slot claims array
  claims?: OHClaim[];
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
  listedOnMls?: boolean;
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
  { id: 'open-houses', label: 'Open House Opportunities', emoji: '🏠', desc: 'Open house opportunities for agents to claim' },
  { id: 'competition', label: 'Competition',     emoji: '🏎️', desc: 'Live competition scoreboard (NASCAR, Golf, etc.)' },
  { id: 'agent-help',  label: 'Agent Help Needed', emoji: '🤝', desc: 'Agents seeking showing/inspection/closing help' },
];

const DEFAULT_COMMUNITY_SECTIONS = ['activity', 'leaderboard', 'coming-soon', 'buyer-needs', 'open-houses', 'agent-help'];

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

  const [tab, setTab] = useState<'open-houses' | 'buyer-needs' | 'coming-soon' | 'agent-help' | 'archived'>('open-houses');

  // ── Archived posts state ───────────────────────────────────────────────
  const [archivedItems, setArchivedItems] = useState<any[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [readingId, setReadingId] = useState<string | null>(null);

  // ── Agent Help state ──────────────────────────────────────────────────────
  const [helpItems, setHelpItems] = useState<AgentHelpItem[]>([]);
  const [helpLoading, setHelpLoading] = useState(false);
  const [showHelpAddDialog, setShowHelpAddDialog] = useState(false);
  const [helpForm, setHelpForm] = useState<Partial<AgentHelpItem & { compensation: string }>>({});
  const [helpPostToFacebook, setHelpPostToFacebook] = useState(false);
  const [helpSaving, setHelpSaving] = useState(false);
  const [editingHelpItem, setEditingHelpItem] = useState<AgentHelpItem | null>(null);
  const [showHelpEditDialog, setShowHelpEditDialog] = useState(false);
  const [helpEditSaving, setHelpEditSaving] = useState(false);
  const [deletingHelpId, setDeletingHelpId] = useState<string | null>(null);
  const [showClaimDialog, setShowClaimDialog] = useState(false);
  const [claimingItem, setClaimingItem] = useState<AgentHelpItem | null>(null);
  const [claimForm, setClaimForm] = useState<{ claimantName: string; claimantPhone: string; claimantEmail: string }>({ claimantName: '', claimantPhone: '', claimantEmail: '' });
  const [claimSaving, setClaimSaving] = useState(false);
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

  // ── Pre-fill Add dialog from appointment shortcut URL params ──────────────
  const searchParams = useSearchParams();
  useEffect(() => {
    const postType = searchParams.get('postType');
    if (!postType) return;
    const area = searchParams.get('area') || '';
    const minPrice = searchParams.get('minPrice') || '';
    const maxPrice = searchParams.get('maxPrice') || '';
    const notes = searchParams.get('notes') || '';
    if (postType === 'buyer-needs') {
      setTab('buyer-needs');
      setForm({ area, minPrice, maxPrice, notes });
      setShowAddDialog(true);
    } else if (postType === 'coming-soon') {
      setTab('coming-soon');
      setForm({ area, price: minPrice || maxPrice, notes });
      setShowAddDialog(true);
    }
    // Clear URL params after reading so refreshing doesn’t re-open the dialog
    const url = new URL(window.location.href);
    ['postType', 'area', 'minPrice', 'maxPrice', 'notes'].forEach(p => url.searchParams.delete(p));
    window.history.replaceState({}, '', url.toString());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Edit state
  const [editingItem, setEditingItem] = useState<BoardItem | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  // Open House Opportunity claim state
  const [showOHClaimDialog, setShowOHClaimDialog] = useState(false);
  const [claimingOHItem, setClaimingOHItem] = useState<BoardItem | null>(null);
  const [ohClaimForm, setOhClaimForm] = useState<{ claimantName: string; claimantPhone: string; claimantEmail: string; claimedDate: string; claimedStartTime: string; claimedEndTime: string }>({ claimantName: '', claimantPhone: '', claimantEmail: '', claimedDate: '', claimedStartTime: '', claimedEndTime: '' });
  const [ohClaimSaving, setOhClaimSaving] = useState(false);
  // Search/filter state
  const [searchQuery, setSearchQuery] = useState('');

  const apiPath = tab === 'open-houses' ? 'open-houses' : tab === 'buyer-needs' ? 'buyer-needs' : tab === 'coming-soon' ? 'coming-soon' : 'agent-help';

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
    // listedOnMls is included for coming-soon items
    const prefill: Record<string, string | boolean | number> = {};
    const fields: (keyof BoardItem)[] = [
      'agentName', 'agentPhone', 'address', 'price', 'beds', 'baths', 'sqft',
      'notes', 'openHouseDate', 'openHouseTime', 'openHouseEndTime',
      'area', 'minPrice', 'maxPrice', 'minAcreage', 'maxAcreage', 'pool',
      'generator', 'stories', 'otherAmenities', 'expectedDate', 'acreage', 'listedOnMls',
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

  // ── Open House Opportunity claim handlers ──────────────────────────────────────────
  const openOHClaimDialog = (item: BoardItem) => {
    setClaimingOHItem(item);
    setOhClaimForm({
      claimantName: '',
      claimantPhone: '',
      claimantEmail: '',
      claimedDate: item.openHouseDate || '',
      claimedStartTime: item.openHouseTime || '',
      claimedEndTime: item.openHouseEndTime || '',
    });
    setShowOHClaimDialog(true);
  };

  const handleOHClaim = async () => {
    if (!claimingOHItem) return;
    setOhClaimSaving(true);
    try {
      const token = await user!.getIdToken();
      const res = await fetch(`/api/community/open-houses/${claimingOHItem.id}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(ohClaimForm),
      });
      const json = await res.json();
      if (json.ok) { setShowOHClaimDialog(false); setClaimingOHItem(null); loadItems(); }
      else alert(json.error || 'Failed to claim');
    } catch (e) { console.error(e); } finally { setOhClaimSaving(false); }
  };

  // ── Agent Help handlers ────────────────────────────────────────────────────
  const loadHelpItems = useCallback(async () => {
    setHelpLoading(true);
    try {
      const token = await user!.getIdToken();
      const res = await fetch('/api/community/agent-help', { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.ok) setHelpItems(json.items || []);
    } catch (e) { console.error(e); } finally { setHelpLoading(false); }
  }, [user]);

  useEffect(() => { if (tab === 'agent-help') loadHelpItems(); }, [tab, loadHelpItems]);

  const handleHelpAdd = async () => {
    setHelpSaving(true);
    try {
      const token = await user!.getIdToken();
      const body = { ...helpForm, compensation: helpForm.compensation ? Number(helpForm.compensation) : 0, postToFacebook: helpPostToFacebook };
      const res = await fetch('/api/community/agent-help', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.ok) { setShowHelpAddDialog(false); setHelpForm({}); setHelpPostToFacebook(false); loadHelpItems(); }
    } catch (e) { console.error(e); } finally { setHelpSaving(false); }
  };

  const handleHelpDelete = async (id: string) => {
    setDeletingHelpId(id);
    try {
      const token = await user!.getIdToken();
      await fetch(`/api/community/agent-help/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      loadHelpItems();
    } catch (e) { console.error(e); } finally { setDeletingHelpId(null); }
  };

  const openHelpEditDialog = (item: AgentHelpItem) => {
    setEditingHelpItem(item);
    setHelpForm({
      helpType: item.helpType,
      description: item.description,
      propertyAddress: item.propertyAddress || '',
      needDate: item.needDate || '',
      needTime: item.needTime || '',
      compensation: item.compensation ? String(item.compensation) : '',
      compensationNote: item.compensationNote || '',
      agentName: item.agentName,
      agentPhone: item.agentPhone,
      agentEmail: item.agentEmail || '',
    } as any);
    setShowHelpEditDialog(true);
  };

  const handleHelpSaveEdit = async () => {
    if (!editingHelpItem) return;
    setHelpEditSaving(true);
    try {
      const token = await user!.getIdToken();
      const body = { ...helpForm, compensation: helpForm.compensation ? Number(helpForm.compensation) : 0 };
      const res = await fetch(`/api/community/agent-help/${editingHelpItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.ok) { setShowHelpEditDialog(false); setEditingHelpItem(null); setHelpForm({}); loadHelpItems(); }
    } catch (e) { console.error(e); } finally { setHelpEditSaving(false); }
  };

  const openClaimDialog = (item: AgentHelpItem) => {
    setClaimingItem(item);
    setClaimForm({ claimantName: '', claimantPhone: '', claimantEmail: '' });
    setShowClaimDialog(true);
  };

  const handleClaim = async () => {
    if (!claimingItem) return;
    setClaimSaving(true);
    try {
      const token = await user!.getIdToken();
      const res = await fetch(`/api/community/agent-help/${claimingItem.id}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(claimForm),
      });
      const json = await res.json();
      if (json.ok) { setShowClaimDialog(false); setClaimingItem(null); loadHelpItems(); }
    } catch (e) { console.error(e); } finally { setClaimSaving(false); }
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
    'open-houses': { label: 'Open House Opportunities', icon: Home,       color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
    'buyer-needs': { label: 'Buyer Needs',        icon: Users,      color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20'   },
    'coming-soon': { label: 'Coming Soon',        icon: Clock,      color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
    'agent-help':  { label: 'Agent Help Needed',  icon: Handshake,  color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20'  },
  };

  const tc = tab === 'archived' ? { label: 'Archived Posts', icon: null, color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/20' } : tabConfig[tab];

  // Load archived posts when tab switches to archived
  const loadArchivedItems = useCallback(async () => {
    if (!user) return;
    setArchivedLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/community/archived', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.ok) setArchivedItems(data.items ?? []);
    } catch { /* ignore */ } finally { setArchivedLoading(false); }
  }, [user]);

  useEffect(() => { if (tab === 'archived') loadArchivedItems(); }, [tab, loadArchivedItems]);

  const handleReadd = async (collection: string, postId: string) => {
    setReadingId(postId);
    try {
      const token = await user!.getIdToken();
      await fetch('/api/community/archived', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ collection, postId }),
      });
      loadArchivedItems();
    } catch { /* ignore */ } finally { setReadingId(null); }
  };

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
            <p className="text-gray-400 text-sm">Manage office boards · Open Houses · Buyer Needs · Coming Soon · Agent Help</p>
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
          {/* Archived tab */}
          <button
            onClick={() => setTab('archived')}
            className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-colors ${
              tab === 'archived' ? 'text-gray-300 border-b-2 border-gray-400' : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            📦 Archived
          </button>
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">
                {tab === 'agent-help'
                  ? `${helpItems.length} active request${helpItems.length !== 1 ? 's' : ''}`
                  : `${items.length} active listing${items.length !== 1 ? 's' : ''}`
                }
              </span>
              <button onClick={loadItems} className="text-gray-600 hover:text-gray-400">
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <Button
              size="sm"
              className="bg-orange-500 hover:bg-orange-600 text-white"
              onClick={() => {
                if (tab === 'agent-help') { setHelpForm({}); setShowHelpAddDialog(true); }
                else { setForm({}); setShowAddDialog(true); }
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              {tab === 'agent-help' ? 'Post Help Request' : `Add ${tc.label.slice(0, -1)}`}
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

          {/* ── Agent Help tab content ────────────────────────────────────────────────── */}
          {tab === 'agent-help' ? (
            helpLoading ? (
              <div className="py-12 text-center text-gray-500">Loading...</div>
            ) : helpItems.length === 0 ? (
              <div className="py-12 text-center">
                <Handshake className="h-10 w-10 text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No help requests posted yet</p>
                <p className="text-gray-600 text-sm mt-1">Click “Post Help Request” to ask fellow agents for help</p>
              </div>
            ) : (
              <div className="space-y-3">
                {helpItems
                  .filter((item) => {
                    if (!searchQuery.trim()) return true;
                    const q = searchQuery.toLowerCase();
                    return (
                      (item.agentName || '').toLowerCase().includes(q) ||
                      (item.description || '').toLowerCase().includes(q) ||
                      (item.propertyAddress || '').toLowerCase().includes(q) ||
                      (item.helpType || '').toLowerCase().includes(q)
                    );
                  })
                  .map((item) => {
                    const isOwner = !!(myProfileIds.size > 0 && (
                      myProfileIds.has(item.createdByUid ?? '') ||
                      myProfileIds.has(item.agentProfileId ?? '')
                    ));
                    const isClaimed = !!item.claimedByUid;
                    const helpTypeLabel: Record<string, string> = {
                      showing: '🏠 Showing',
                      inspection: '🔍 Inspection',
                      closing: '📝 Closing',
                      other: '🤝 Other Help',
                    };
                    return (
                      <div key={item.id} className={`bg-gray-800 border rounded-xl p-4 ${
                        isClaimed ? 'border-green-500/30' : 'border-white/10'
                      }`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            {/* Type badge + date */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-green-400 font-semibold text-sm">{helpTypeLabel[item.helpType] || item.helpType}</span>
                              {item.needDate && (
                                <span className="text-gray-400 text-xs">📅 {item.needDate}{item.needTime ? ` at ${item.needTime}` : ''}</span>
                              )}
                              {item.compensation && item.compensation > 0 && (
                                <span className="bg-yellow-500/20 text-yellow-300 text-xs px-2 py-0.5 rounded-full font-medium">
                                  💵 ${item.compensation} offered
                                </span>
                              )}
                              {isClaimed && (
                                <span className="bg-green-500/20 text-green-300 text-xs px-2 py-0.5 rounded-full font-medium">
                                  ✓ Claimed by {item.claimedByName}
                                </span>
                              )}
                            </div>
                            {/* Property address */}
                            {item.propertyAddress && (
                              <div className="text-gray-300 text-sm mt-1 font-medium">{item.propertyAddress}</div>
                            )}
                            {/* Description */}
                            <div className="text-gray-400 text-xs mt-1 line-clamp-2">{item.description}</div>
                            {/* Agent info */}
                            <div className="flex items-center gap-1 mt-2 text-gray-500 text-xs">
                              <span>{item.agentName}</span>
                              <span>·</span>
                              <Phone className="h-3 w-3" />
                              <span>{item.agentPhone}</span>
                              {item.compensationNote && (
                                <><span>·</span><span className="text-yellow-400">{item.compensationNote}</span></>
                              )}
                            </div>
                          </div>
                          {/* Actions */}
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {!isClaimed && !isOwner && (
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 text-white text-xs h-7"
                                onClick={() => openClaimDialog(item)}
                              >
                                <Handshake className="h-3 w-3 mr-1" />I Can Help
                              </Button>
                            )}
                            {isOwner && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-gray-500 hover:text-blue-400 h-7 w-7 p-0"
                                onClick={() => openHelpEditDialog(item)}
                                title="Edit this request"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {isOwner && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-gray-600 hover:text-red-400 h-7 w-7 p-0"
                                onClick={() => handleHelpDelete(item.id)}
                                disabled={deletingHelpId === item.id}
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
            )
          ) : loading ? (
            <div className="py-12 text-center text-gray-500">Loading...</div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center">
              {tc.icon && (() => { const TcIcon = tc.icon; return <TcIcon className="h-10 w-10 text-gray-700 mx-auto mb-3" />; })()}
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
                          {item.openHouseDate && <span>📅 {item.openHouseDate}{item.openHouseTime ? ` at ${item.openHouseTime}` : ''}</span>}
                          {item.expectedDate && <span>📅 Expected {item.expectedDate}</span>}
                          {tab === 'coming-soon' && (
                            <span className={item.listedOnMls ? 'bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full font-medium' : 'bg-gray-700/40 text-gray-400 px-2 py-0.5 rounded-full font-medium'}>
                              {item.listedOnMls ? '✅ Listed on Coming Soon MLS' : '⏳ Not yet on MLS'}
                            </span>
                          )}
                          {tab === 'open-houses' && item.compensation && item.compensation > 0 && (
                            <span className="bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded-full font-medium">
                              💵 ${item.compensation} offered
                            </span>
                          )}
                          {tab === 'open-houses' && (item.claims || []).length > 0 && (
                            <span className="bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full font-medium">
                              ✓ {(item.claims || []).length} slot{(item.claims || []).length > 1 ? 's' : ''} claimed
                            </span>
                          )}
                        </div>
                        {/* Multi-slot availability for open house opportunities */}
                        {tab === 'open-houses' && (item.claims || []).length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(item.claims || []).map((c) => (
                              <span key={c.claimId} className="bg-red-900/30 border border-red-500/20 text-red-300 text-xs px-2 py-0.5 rounded">
                                {fmtDate(c.claimedDate)} · {c.claimedStartTime}–{c.claimedEndTime} · {c.claimantName}
                              </span>
                            ))}
                          </div>
                        )}
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
                        {/* Open House Opportunity — Claim button for non-owners (always available for partial slots) */}
                        {tab === 'open-houses' && !isOwner && (
                          <Button
                            size="sm"
                            className="bg-orange-600 hover:bg-orange-700 text-white text-xs h-7"
                            onClick={() => openOHClaimDialog(item)}
                          >
                            <Home className="h-3 w-3 mr-1" />Claim Slot
                          </Button>
                        )}
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
                    {/* Comment thread — logged-in agents can post */}
                    <PostComments
                      collection={
                        tab === 'buyer-needs' ? 'buyerNeeds' :
                        tab === 'coming-soon' ? 'comingSoonListings' :
                        tab === 'open-houses' ? 'openHouseListings' :
                        'agentHelpRequests'
                      }
                      postId={item.id}
                      readOnly={false}
                      getToken={() => user?.getIdToken() ?? Promise.resolve(null)}
                      compact
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ─── Archived Posts tab content ──────────────────────────────────────────────── */}
        {tab === 'archived' && (
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-white font-semibold">Archived Posts</h3>
                <p className="text-gray-400 text-sm mt-0.5">Posts that were removed or that you declined to renew. Click Re-add to put them back on the board.</p>
              </div>
              <Button size="sm" variant="outline" className="border-gray-700 text-gray-300" onClick={loadArchivedItems} disabled={archivedLoading}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${archivedLoading ? 'animate-spin' : ''}`} />Refresh
              </Button>
            </div>
            {archivedLoading ? (
              <div className="py-12 text-center text-gray-500">Loading archived posts...</div>
            ) : archivedItems.length === 0 ? (
              <div className="py-12 text-center">
                <div className="text-4xl mb-3">📦</div>
                <p className="text-gray-500 font-medium">No archived posts</p>
                <p className="text-gray-600 text-sm mt-1">Posts that expire or are declined will appear here for easy re-adding.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {archivedItems.map((item) => (
                  <div key={`${item.collection}-${item.id}`} className="bg-gray-800 border border-white/10 rounded-xl p-4 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{item.emoji}</span>
                        <span className="text-gray-300 font-semibold text-sm">{item.label}</span>
                        {item.archivedReason === 'agent_declined' && (
                          <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">Declined</span>
                        )}
                        {item.archivedReason === 'no_response' && (
                          <span className="text-xs bg-yellow-900/40 text-yellow-400 px-2 py-0.5 rounded-full">No response</span>
                        )}
                      </div>
                      <div className="text-white text-sm font-medium truncate">
                        {item.address || item.area || item.description || 'Post'}
                      </div>
                      <div className="text-gray-500 text-xs mt-1">
                        Archived {item.archivedAt ? new Date(item.archivedAt).toLocaleDateString() : 'recently'}
                      </div>
                      {item.notes && (
                        <div className="text-gray-400 text-xs mt-1 line-clamp-2">{item.notes}</div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      className="bg-orange-600 hover:bg-orange-700 text-white shrink-0"
                      onClick={() => handleReadd(item.collection, item.id)}
                      disabled={readingId === item.id}
                    >
                      {readingId === item.id ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      ) : (
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Re-add
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {/* ─── Add Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-gray-900 border-white/10 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className={tc.color}>Add {tab === 'open-houses' ? 'Open House Opportunity' : tab === 'buyer-needs' ? 'Buyer Need' : 'Coming Soon Listing'}</DialogTitle>
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
                    <Label className="text-gray-300 text-xs">Preferred Date <span className="text-gray-500 font-normal">(optional)</span></Label>
                    <Input type="date" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.openHouseDate || '')} onChange={(e) => setForm((f) => ({ ...f, openHouseDate: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-gray-300 text-xs">Preferred Start <span className="text-gray-500 font-normal">(optional)</span></Label>
                    <Input type="time" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.openHouseTime || '')} onChange={(e) => setForm((f) => ({ ...f, openHouseTime: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-gray-300 text-xs">Preferred End <span className="text-gray-500 font-normal">(optional)</span></Label>
                    <Input type="time" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.openHouseEndTime || '')} onChange={(e) => setForm((f) => ({ ...f, openHouseEndTime: e.target.value }))} />
                  </div>
                </div>
                <p className="text-xs text-gray-500 -mt-1">Leave date/time blank — any agent can claim any day and time that works for them.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-gray-300 text-xs">Compensation Offered ($)</Label>
                    <Input type="number" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.compensation || '')} onChange={(e) => setForm((f) => ({ ...f, compensation: e.target.value }))} placeholder="e.g. 50" />
                  </div>
                  <div>
                    <Label className="text-gray-300 text-xs">Compensation Note</Label>
                    <Input className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.compensationNote || '')} onChange={(e) => setForm((f) => ({ ...f, compensationNote: e.target.value }))} placeholder="e.g. Cash at closing" />
                  </div>
                </div>
                <div>
                  <Label className="text-gray-300 text-xs">Notes / Description</Label>
                  <Textarea className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.notes || '')} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Beautiful 3/2 in Youngsville. Need someone to host 1–4pm Sunday." rows={3} />
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
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch checked={Boolean(form.listedOnMls)} onCheckedChange={(v) => setForm((f) => ({ ...f, listedOnMls: v }))} />
                    <span className="text-gray-300 text-sm">Listed on Coming Soon MLS</span>
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
              Edit {tab === 'open-houses' ? 'Open House Opportunity' : tab === 'buyer-needs' ? 'Buyer Need' : 'Coming Soon Listing'}
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
                    <Label className="text-gray-300 text-xs">Preferred Date <span className="text-gray-500 font-normal">(optional)</span></Label>
                    <Input type="date" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.openHouseDate || '')} onChange={(e) => setForm((f) => ({ ...f, openHouseDate: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-gray-300 text-xs">Preferred Start <span className="text-gray-500 font-normal">(optional)</span></Label>
                    <Input type="time" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.openHouseTime || '')} onChange={(e) => setForm((f) => ({ ...f, openHouseTime: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-gray-300 text-xs">Preferred End <span className="text-gray-500 font-normal">(optional)</span></Label>
                    <Input type="time" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.openHouseEndTime || '')} onChange={(e) => setForm((f) => ({ ...f, openHouseEndTime: e.target.value }))} />
                  </div>
                </div>
                <p className="text-xs text-gray-500 -mt-1">Leave date/time blank — any agent can claim any day and time that works for them.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-gray-300 text-xs">Compensation Offered ($)</Label>
                    <Input type="number" className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.compensation || '')} onChange={(e) => setForm((f) => ({ ...f, compensation: e.target.value }))} placeholder="e.g. 50" />
                  </div>
                  <div>
                    <Label className="text-gray-300 text-xs">Compensation Note</Label>
                    <Input className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.compensationNote || '')} onChange={(e) => setForm((f) => ({ ...f, compensationNote: e.target.value }))} placeholder="e.g. Cash at closing" />
                  </div>
                </div>
                <div>
                  <Label className="text-gray-300 text-xs">Notes / Description</Label>
                  <Textarea className="bg-gray-800 border-white/10 text-white mt-1" value={String(form.notes || '')} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Beautiful 3/2 in Youngsville. Need someone to host 1–4pm Sunday." rows={3} />
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
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch checked={Boolean(form.listedOnMls)} onCheckedChange={(v) => setForm((f) => ({ ...f, listedOnMls: v }))} />
                    <span className="text-gray-300 text-sm">Listed on Coming Soon MLS</span>
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


      {/* ─── Agent Help — Add Dialog ─────────────────────────────────────────── */}
      <Dialog open={showHelpAddDialog} onOpenChange={setShowHelpAddDialog}>
        <DialogContent className="bg-gray-900 border-white/10 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-green-400">🤝 Post Agent Help Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300 text-xs">Your Name *</Label>
                <Input className="bg-gray-800 border-white/10 text-white mt-1" value={String(helpForm.agentName || '')} onChange={(e) => setHelpForm((f) => ({ ...f, agentName: e.target.value }))} placeholder="Your name" />
              </div>
              <div>
                <Label className="text-gray-300 text-xs">Your Phone *</Label>
                <Input className="bg-gray-800 border-white/10 text-white mt-1" value={String(helpForm.agentPhone || '')} onChange={(e) => setHelpForm((f) => ({ ...f, agentPhone: e.target.value }))} placeholder="(555) 555-5555" />
              </div>
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Your Email</Label>
              <Input type="email" className="bg-gray-800 border-white/10 text-white mt-1" value={String(helpForm.agentEmail || '')} onChange={(e) => setHelpForm((f) => ({ ...f, agentEmail: e.target.value }))} placeholder="you@example.com" />
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Type of Help Needed *</Label>
              <Select value={String(helpForm.helpType || '')} onValueChange={(v) => setHelpForm((f) => ({ ...f, helpType: v as HelpType }))}>
                <SelectTrigger className="bg-gray-800 border-white/10 text-white mt-1"><SelectValue placeholder="Select type..." /></SelectTrigger>
                <SelectContent className="bg-gray-800 border-white/10 text-white">
                  <SelectItem value="showing">🏠 Showing — cover a showing for me</SelectItem>
                  <SelectItem value="inspection">🔍 Inspection — open door for inspection</SelectItem>
                  <SelectItem value="closing">📝 Closing — attend closing on my behalf</SelectItem>
                  <SelectItem value="other">🤝 Other — describe below</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Property Address (optional)</Label>
              <Input className="bg-gray-800 border-white/10 text-white mt-1" value={String(helpForm.propertyAddress || '')} onChange={(e) => setHelpForm((f) => ({ ...f, propertyAddress: e.target.value }))} placeholder="123 Main St, Lafayette, LA" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300 text-xs">Date Needed</Label>
                <Input type="date" className="bg-gray-800 border-white/10 text-white mt-1" value={String(helpForm.needDate || '')} onChange={(e) => setHelpForm((f) => ({ ...f, needDate: e.target.value }))} />
              </div>
              <div>
                <Label className="text-gray-300 text-xs">Time Needed</Label>
                <Input type="time" className="bg-gray-800 border-white/10 text-white mt-1" value={String(helpForm.needTime || '')} onChange={(e) => setHelpForm((f) => ({ ...f, needTime: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300 text-xs">Compensation Offered ($)</Label>
                <Input type="number" className="bg-gray-800 border-white/10 text-white mt-1" value={String(helpForm.compensation || '')} onChange={(e) => setHelpForm((f) => ({ ...f, compensation: e.target.value as any }))} placeholder="e.g. 50" />
              </div>
              <div>
                <Label className="text-gray-300 text-xs">Compensation Note</Label>
                <Input className="bg-gray-800 border-white/10 text-white mt-1" value={String(helpForm.compensationNote || '')} onChange={(e) => setHelpForm((f) => ({ ...f, compensationNote: e.target.value }))} placeholder="e.g. Cash at closing" />
              </div>
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Description / Details *</Label>
              <Textarea className="bg-gray-800 border-white/10 text-white mt-1" value={String(helpForm.description || '')} onChange={(e) => setHelpForm((f) => ({ ...f, description: e.target.value }))} placeholder="I'm out of town and need someone to show 123 Main St on Friday at 2pm. Buyer is pre-approved. Easy showing." rows={4} />
            </div>
          </div>
                    {/* Share to KRE Agents Facebook Group */}
          <div
            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors mx-0 ${
              helpPostToFacebook
                ? 'bg-blue-900/40 border-blue-500'
                : 'bg-gray-800/60 border-white/10 hover:bg-gray-800'
            }`}
            onClick={() => setHelpPostToFacebook(v => !v)}
          >
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
              helpPostToFacebook ? 'bg-blue-600 border-blue-600' : 'border-gray-500'
            }`}>
              {helpPostToFacebook && <span className="text-white text-xs font-bold">✓</span>}
            </div>
            <div>
              <p className="text-sm font-medium text-white">
                <svg className="h-3.5 w-3.5 inline mr-1 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                Share to KRE Agents Facebook Group
              </p>
              <p className="text-xs text-gray-400">
                Posts this help request to the KRE Agents group as you (requires Facebook connected in Settings)
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="text-gray-400" onClick={() => setShowHelpAddDialog(false)}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleHelpAdd} disabled={helpSaving}>
              {helpSaving ? 'Posting...' : '🤝 Post Help Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ─── Agent Help — Edit Dialog ─────────────────────────────────────────── */}
      <Dialog open={showHelpEditDialog} onOpenChange={(open) => { if (!open) { setShowHelpEditDialog(false); setEditingHelpItem(null); setHelpForm({}); } }}>
        <DialogContent className="bg-gray-900 border-white/10 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-blue-400">Edit Help Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300 text-xs">Your Name *</Label>
                <Input className="bg-gray-800 border-white/10 text-white mt-1" value={String(helpForm.agentName || '')} onChange={(e) => setHelpForm((f) => ({ ...f, agentName: e.target.value }))} placeholder="Your name" />
              </div>
              <div>
                <Label className="text-gray-300 text-xs">Your Phone *</Label>
                <Input className="bg-gray-800 border-white/10 text-white mt-1" value={String(helpForm.agentPhone || '')} onChange={(e) => setHelpForm((f) => ({ ...f, agentPhone: e.target.value }))} placeholder="(555) 555-5555" />
              </div>
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Type of Help Needed *</Label>
              <Select value={String(helpForm.helpType || '')} onValueChange={(v) => setHelpForm((f) => ({ ...f, helpType: v as HelpType }))}>
                <SelectTrigger className="bg-gray-800 border-white/10 text-white mt-1"><SelectValue placeholder="Select type..." /></SelectTrigger>
                <SelectContent className="bg-gray-800 border-white/10 text-white">
                  <SelectItem value="showing">🏠 Showing</SelectItem>
                  <SelectItem value="inspection">🔍 Inspection</SelectItem>
                  <SelectItem value="closing">📝 Closing</SelectItem>
                  <SelectItem value="other">🤝 Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Property Address</Label>
              <Input className="bg-gray-800 border-white/10 text-white mt-1" value={String(helpForm.propertyAddress || '')} onChange={(e) => setHelpForm((f) => ({ ...f, propertyAddress: e.target.value }))} placeholder="123 Main St" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300 text-xs">Date Needed</Label>
                <Input type="date" className="bg-gray-800 border-white/10 text-white mt-1" value={String(helpForm.needDate || '')} onChange={(e) => setHelpForm((f) => ({ ...f, needDate: e.target.value }))} />
              </div>
              <div>
                <Label className="text-gray-300 text-xs">Time Needed</Label>
                <Input type="time" className="bg-gray-800 border-white/10 text-white mt-1" value={String(helpForm.needTime || '')} onChange={(e) => setHelpForm((f) => ({ ...f, needTime: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300 text-xs">Compensation Offered ($)</Label>
                <Input type="number" className="bg-gray-800 border-white/10 text-white mt-1" value={String(helpForm.compensation || '')} onChange={(e) => setHelpForm((f) => ({ ...f, compensation: e.target.value as any }))} placeholder="e.g. 50" />
              </div>
              <div>
                <Label className="text-gray-300 text-xs">Compensation Note</Label>
                <Input className="bg-gray-800 border-white/10 text-white mt-1" value={String(helpForm.compensationNote || '')} onChange={(e) => setHelpForm((f) => ({ ...f, compensationNote: e.target.value }))} placeholder="e.g. Cash at closing" />
              </div>
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Description / Details *</Label>
              <Textarea className="bg-gray-800 border-white/10 text-white mt-1" value={String(helpForm.description || '')} onChange={(e) => setHelpForm((f) => ({ ...f, description: e.target.value }))} rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="text-gray-400" onClick={() => { setShowHelpEditDialog(false); setEditingHelpItem(null); setHelpForm({}); }}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleHelpSaveEdit} disabled={helpEditSaving}>
              {helpEditSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Agent Help — Claim Dialog ─────────────────────────────────────────── */}
      <Dialog open={showClaimDialog} onOpenChange={(open) => { if (!open) { setShowClaimDialog(false); setClaimingItem(null); } }}>
        <DialogContent className="bg-gray-900 border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-green-400">🤝 Claim Help Request</DialogTitle>
          </DialogHeader>
          {claimingItem && (
            <div className="space-y-4 py-2">
              <div className="bg-gray-800 rounded-lg p-3 border border-white/10">
                <div className="text-green-400 font-semibold text-sm">
                  {claimingItem.helpType === 'showing' ? '🏠 Showing' : claimingItem.helpType === 'inspection' ? '🔍 Inspection' : claimingItem.helpType === 'closing' ? '📝 Closing' : '🤝 Other'}
                </div>
                {claimingItem.propertyAddress && <div className="text-white text-sm mt-0.5">{claimingItem.propertyAddress}</div>}
                {claimingItem.needDate && <div className="text-gray-400 text-xs mt-0.5">📅 {claimingItem.needDate}{claimingItem.needTime ? ` at ${claimingItem.needTime}` : ''}</div>}
                {claimingItem.compensation && claimingItem.compensation > 0 && (
                  <div className="text-yellow-300 text-xs mt-0.5">💵 ${claimingItem.compensation} compensation offered</div>
                )}
                <div className="text-gray-400 text-xs mt-1">{claimingItem.description}</div>
                <div className="text-gray-500 text-xs mt-1">Posted by {claimingItem.agentName} · {claimingItem.agentPhone}</div>
              </div>
              <p className="text-gray-400 text-sm">Enter your contact info so {claimingItem.agentName} knows who is helping them.</p>
              <div>
                <Label className="text-gray-300 text-xs">Your Name *</Label>
                <Input className="bg-gray-800 border-white/10 text-white mt-1" value={claimForm.claimantName} onChange={(e) => setClaimForm((f) => ({ ...f, claimantName: e.target.value }))} placeholder="Your name" />
              </div>
              <div>
                <Label className="text-gray-300 text-xs">Your Phone *</Label>
                <Input className="bg-gray-800 border-white/10 text-white mt-1" value={claimForm.claimantPhone} onChange={(e) => setClaimForm((f) => ({ ...f, claimantPhone: e.target.value }))} placeholder="(555) 555-5555" />
              </div>
              <div>
                <Label className="text-gray-300 text-xs">Your Email</Label>
                <Input type="email" className="bg-gray-800 border-white/10 text-white mt-1" value={claimForm.claimantEmail} onChange={(e) => setClaimForm((f) => ({ ...f, claimantEmail: e.target.value }))} placeholder="you@example.com" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" className="text-gray-400" onClick={() => { setShowClaimDialog(false); setClaimingItem(null); }}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleClaim} disabled={claimSaving || !claimForm.claimantName || !claimForm.claimantPhone}>
              {claimSaving ? 'Claiming...' : '✓ I will Help!'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* ─── Open House Opportunity Claim Dialog ─────────────────── */}
      <Dialog open={showOHClaimDialog} onOpenChange={(o) => { if (!o) { setShowOHClaimDialog(false); setClaimingOHItem(null); } }}>
        <DialogContent className="bg-gray-900 border-white/10 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-orange-400">Claim Open House Opportunity</DialogTitle>
            {claimingOHItem && (
              <p className="text-gray-400 text-sm mt-1">{claimingOHItem.address}</p>
            )}
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">

            {/* ─ Listing info + compensation ─ */}
            {claimingOHItem && (
              <div className="bg-gray-800 rounded-lg p-3 text-sm space-y-1">
                {claimingOHItem.openHouseDate && (
                  <div className="text-gray-300">📅 Available: {fmtDate(claimingOHItem.openHouseDate)}{claimingOHItem.openHouseTime ? ` · ${claimingOHItem.openHouseTime}` : ''}{claimingOHItem.openHouseEndTime ? ` – ${claimingOHItem.openHouseEndTime}` : ''}</div>
                )}
                {claimingOHItem.compensation && claimingOHItem.compensation > 0 && (
                  <div className="text-yellow-300">💵 ${claimingOHItem.compensation} offered{claimingOHItem.compensationNote ? ` · ${claimingOHItem.compensationNote}` : ''}</div>
                )}
              </div>
            )}

            {/* ─ Existing time-slot claims (availability) ─ */}
            {claimingOHItem && (claimingOHItem.claims || []).length > 0 && (
              <div>
                <Label className="text-gray-300 text-xs font-semibold uppercase tracking-wide">Already Claimed Time Slots</Label>
                <div className="mt-2 space-y-1">
                  {(claimingOHItem.claims || []).map((c) => (
                    <div key={c.claimId} className="flex items-center gap-2 bg-red-900/30 border border-red-500/20 rounded px-3 py-1.5 text-xs">
                      <span className="text-red-400 font-medium">🚫 {fmtDate(c.claimedDate)}</span>
                      <span className="text-red-300">{c.claimedStartTime} – {c.claimedEndTime}</span>
                      <span className="text-gray-400 ml-auto">{c.claimantName}</span>
                    </div>
                  ))}
                </div>
                <p className="text-gray-500 text-xs mt-1">Pick a time slot that does not overlap with the above.</p>
              </div>
            )}

            {/* ─ Agent info ─ */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300 text-xs">Your Name *</Label>
                <Input className="bg-gray-800 border-white/10 text-white mt-1" value={ohClaimForm.claimantName} onChange={(e) => setOhClaimForm((f) => ({ ...f, claimantName: e.target.value }))} placeholder="Your full name" />
              </div>
              <div>
                <Label className="text-gray-300 text-xs">Your Phone *</Label>
                <Input className="bg-gray-800 border-white/10 text-white mt-1" value={ohClaimForm.claimantPhone} onChange={(e) => setOhClaimForm((f) => ({ ...f, claimantPhone: e.target.value }))} placeholder="(555) 555-5555" />
              </div>
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Your Email</Label>
              <Input className="bg-gray-800 border-white/10 text-white mt-1" value={ohClaimForm.claimantEmail} onChange={(e) => setOhClaimForm((f) => ({ ...f, claimantEmail: e.target.value }))} placeholder="you@example.com" />
            </div>

            {/* ─ Date + time slot dropdowns ─ */}
            <div>
              <Label className="text-gray-300 text-xs">Date *</Label>
              <Input type="date" className="bg-gray-800 border-white/10 text-white mt-1" value={ohClaimForm.claimedDate} onChange={(e) => setOhClaimForm((f) => ({ ...f, claimedDate: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300 text-xs">Start Time *</Label>
                <Select value={ohClaimForm.claimedStartTime} onValueChange={(v) => setOhClaimForm((f) => ({ ...f, claimedStartTime: v }))}>
                  <SelectTrigger className="bg-gray-800 border-white/10 text-white mt-1">
                    <SelectValue placeholder="Select start" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-white/10 text-white max-h-48 overflow-y-auto">
                    {TIME_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t} className="text-white hover:bg-gray-700">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-300 text-xs">End Time *</Label>
                <Select value={ohClaimForm.claimedEndTime} onValueChange={(v) => setOhClaimForm((f) => ({ ...f, claimedEndTime: v }))}>
                  <SelectTrigger className="bg-gray-800 border-white/10 text-white mt-1">
                    <SelectValue placeholder="Select end" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-white/10 text-white max-h-48 overflow-y-auto">
                    {TIME_OPTIONS.filter((t) => !ohClaimForm.claimedStartTime || toMinutes(t) > toMinutes(ohClaimForm.claimedStartTime)).map((t) => (
                      <SelectItem key={t} value={t} className="text-white hover:bg-gray-700">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ─ Conflict / availability indicator ─ */}
            {ohClaimForm.claimedDate && ohClaimForm.claimedStartTime && ohClaimForm.claimedEndTime && (() => {
              const ns = toMinutes(ohClaimForm.claimedStartTime);
              const ne = toMinutes(ohClaimForm.claimedEndTime);
              const conflict = (claimingOHItem?.claims || []).find((c) => {
                if (c.claimedDate !== ohClaimForm.claimedDate) return false;
                const cs = toMinutes(c.claimedStartTime);
                const ce = toMinutes(c.claimedEndTime);
                return ns < ce && ne > cs;
              });
              return conflict ? (
                <div className="bg-red-900/40 border border-red-500/30 rounded px-3 py-2 text-xs text-red-300">
                  ⚠️ Conflicts with {conflict.claimantName}’s slot ({conflict.claimedStartTime}–{conflict.claimedEndTime}). Please choose a different time.
                </div>
              ) : (
                <div className="bg-green-900/30 border border-green-500/20 rounded px-3 py-2 text-xs text-green-300">
                  ✓ Time slot is available!
                </div>
              );
            })()}

          </div>
          <DialogFooter>
            <Button variant="ghost" className="text-gray-400" onClick={() => { setShowOHClaimDialog(false); setClaimingOHItem(null); }}>Cancel</Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={handleOHClaim}
              disabled={ohClaimSaving || !ohClaimForm.claimantName || !ohClaimForm.claimantPhone || !ohClaimForm.claimedDate || !ohClaimForm.claimedStartTime || !ohClaimForm.claimedEndTime || !!(() => {
                const ns = toMinutes(ohClaimForm.claimedStartTime);
                const ne = toMinutes(ohClaimForm.claimedEndTime);
                return (claimingOHItem?.claims || []).find((c) => {
                  if (c.claimedDate !== ohClaimForm.claimedDate) return false;
                  const cs = toMinutes(c.claimedStartTime);
                  const ce = toMinutes(c.claimedEndTime);
                  return ns < ce && ne > cs;
                });
              })()}
            >
              {ohClaimSaving ? 'Claiming...' : 'Claim This Time Slot'}
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
