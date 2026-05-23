'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  BookUser, Search, Plus, Pencil, Trash2, Loader2, Phone, Mail,
  Building2, User, HardHat, Users2, Home,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
type ContactType = 'client' | 'lender' | 'title' | 'other_agent' | 'inspector';

interface Contact {
  id: string;
  type: ContactType;
  name?: string;
  companyName?: string;
  officerName?: string;
  email?: string;
  phone?: string;
  office?: string;
  attorney?: string;
  brokerage?: string;
  newAddress?: string;
  usageCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TYPE_LABELS: Record<ContactType, string> = {
  client: 'Client',
  lender: 'Lender / Mortgage',
  title: 'Title Company',
  other_agent: 'Cooperating Agent',
  inspector: 'Inspector',
};

const TYPE_ICONS: Record<ContactType, React.ElementType> = {
  client: User,
  lender: Building2,
  title: Home,
  other_agent: Users2,
  inspector: HardHat,
};

const TYPE_COLORS: Record<ContactType, string> = {
  client: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  lender: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  title: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  other_agent: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  inspector: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300',
};

function displayName(c: Contact): string {
  return c.companyName || c.name || c.officerName || '(No name)';
}

function displaySub(c: Contact): string {
  const parts: string[] = [];
  if (c.type === 'lender') {
    if (c.officerName) parts.push(c.officerName);
    if (c.office) parts.push(`Office: ${c.office}`);
  } else if (c.type === 'title') {
    if (c.officerName) parts.push(c.officerName);
    if (c.attorney) parts.push(`Atty: ${c.attorney}`);
  } else if (c.type === 'other_agent') {
    if (c.brokerage) parts.push(c.brokerage);
  } else if (c.type === 'client') {
    if (c.newAddress) parts.push(c.newAddress);
  }
  return parts.join(' · ');
}

// ─── Empty form state ─────────────────────────────────────────────────────────
function emptyForm(type: ContactType): Partial<Contact> {
  return { type, name: '', companyName: '', officerName: '', email: '', phone: '', office: '', attorney: '', brokerage: '', newAddress: '' };
}

// ─── Contact Form Fields ──────────────────────────────────────────────────────
function ContactFormFields({ form, onChange }: { form: Partial<Contact>; onChange: (f: Partial<Contact>) => void }) {
  const set = (key: keyof Contact, val: string) => onChange({ ...form, [key]: val });
  const type = form.type as ContactType;

  return (
    <div className="space-y-3">
      {(type === 'lender' || type === 'title') && (
        <div>
          <label className="text-sm font-medium">Company Name</label>
          <Input value={form.companyName || ''} onChange={(e) => set('companyName', e.target.value)} placeholder="Company name" className="mt-1" />
        </div>
      )}
      {(type === 'lender' || type === 'title') && (
        <div>
          <label className="text-sm font-medium">{type === 'lender' ? 'Loan Officer Name' : 'Title Officer Name'}</label>
          <Input value={form.officerName || ''} onChange={(e) => set('officerName', e.target.value)} placeholder="Officer name" className="mt-1" />
        </div>
      )}
      {(type === 'client' || type === 'other_agent' || type === 'inspector') && (
        <div>
          <label className="text-sm font-medium">Name</label>
          <Input value={form.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="Full name" className="mt-1" />
        </div>
      )}
      <div>
        <label className="text-sm font-medium">Email</label>
        <Input type="email" value={form.email || ''} onChange={(e) => set('email', e.target.value)} placeholder="email@example.com" className="mt-1" />
      </div>
      <div>
        <label className="text-sm font-medium">Phone</label>
        <Input type="tel" value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} placeholder="(337) 555-0000" className="mt-1" />
      </div>
      {type === 'lender' && (
        <div>
          <label className="text-sm font-medium">Office #</label>
          <Input value={form.office || ''} onChange={(e) => set('office', e.target.value)} placeholder="Office number" className="mt-1" />
        </div>
      )}
      {type === 'title' && (
        <>
          <div>
            <label className="text-sm font-medium">Attorney</label>
            <Input value={form.attorney || ''} onChange={(e) => set('attorney', e.target.value)} placeholder="Attorney name" className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Office #</label>
            <Input value={form.office || ''} onChange={(e) => set('office', e.target.value)} placeholder="Office number" className="mt-1" />
          </div>
        </>
      )}
      {type === 'other_agent' && (
        <div>
          <label className="text-sm font-medium">Brokerage</label>
          <Input value={form.brokerage || ''} onChange={(e) => set('brokerage', e.target.value)} placeholder="Their brokerage" className="mt-1" />
        </div>
      )}
      {type === 'client' && (
        <div>
          <label className="text-sm font-medium">New Address (after closing)</label>
          <Input value={form.newAddress || ''} onChange={(e) => set('newAddress', e.target.value)} placeholder="New address" className="mt-1" />
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ContactsPage() {
  const { user } = useUser();
  const { toast } = useToast();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<ContactType | 'all'>('all');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [form, setForm] = useState<Partial<Contact>>(emptyForm('client'));
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Fetch contacts ──────────────────────────────────────────────────────────
  const fetchContacts = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams({ limit: '500' });
      if (filterType !== 'all') params.set('type', filterType);
      const res = await fetch(`/api/contacts?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) setContacts(data.contacts || []);
    } catch {
      toast({ title: 'Error loading contacts', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user, filterType, toast]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  // ── Filtered list ───────────────────────────────────────────────────────────
  const filtered = contacts.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [c.name, c.companyName, c.officerName, c.email, c.phone, c.brokerage]
      .filter(Boolean).join(' ').toLowerCase().includes(q);
  });

  // ── Open add dialog ─────────────────────────────────────────────────────────
  function openAdd() {
    setEditContact(null);
    setForm(emptyForm('client'));
    setDialogOpen(true);
  }

  // ── Open edit dialog ────────────────────────────────────────────────────────
  function openEdit(c: Contact) {
    setEditContact(c);
    setForm({ ...c });
    setDialogOpen(true);
  }

  // ── Save (create or update) ─────────────────────────────────────────────────
  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      if (editContact) {
        // Update
        const res = await fetch(`/api/contacts/${editContact.id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Update failed');
        toast({ title: 'Contact updated' });
      } else {
        // Create
        const res = await fetch('/api/contacts', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Create failed');
        toast({ title: 'Contact saved' });
      }
      setDialogOpen(false);
      fetchContacts();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    if (!user) return;
    setDeleting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/contacts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Delete failed');
      toast({ title: 'Contact deleted' });
      setDeleteId(null);
      fetchContacts();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <BookUser className="h-7 w-7 text-primary" /> Contacts Book
          </h1>
          <p className="text-muted-foreground mt-1">
            Saved contacts auto-fill into new transactions. Contacts are shared across the brokerage.
          </p>
        </div>
        <Button onClick={openAdd} className="shrink-0">
          <Plus className="h-4 w-4 mr-1" /> Add Contact
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={(v) => setFilterType(v as ContactType | 'all')}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {(Object.keys(TYPE_LABELS) as ContactType[]).map((t) => (
              <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(TYPE_LABELS) as ContactType[]).map((t) => {
          const count = contacts.filter((c) => c.type === t).length;
          const Icon = TYPE_ICONS[t];
          return (
            <button
              key={t}
              onClick={() => setFilterType(filterType === t ? 'all' : t)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                filterType === t ? TYPE_COLORS[t] + ' ring-2 ring-offset-1 ring-current' : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              <Icon className="h-3 w-3" />
              {TYPE_LABELS[t]} ({count})
            </button>
          );
        })}
      </div>

      {/* Contact list */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading contacts…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <BookUser className="h-12 w-12 mb-3 opacity-20" />
          <p className="font-medium">No contacts yet</p>
          <p className="text-sm mt-1">
            Contacts are saved automatically when you submit a transaction, or you can add them manually.
          </p>
          <Button variant="outline" className="mt-4" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" /> Add First Contact
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const Icon = TYPE_ICONS[c.type];
            const sub = displaySub(c);
            return (
              <div
                key={c.id}
                className="group relative rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Type badge */}
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium mb-2 ${TYPE_COLORS[c.type]}`}>
                  <Icon className="h-3 w-3" />
                  {TYPE_LABELS[c.type]}
                </span>

                {/* Name */}
                <p className="font-semibold text-sm leading-tight truncate">{displayName(c)}</p>
                {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}

                {/* Contact info */}
                <div className="mt-2 space-y-1">
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground truncate">
                      <Mail className="h-3 w-3 shrink-0" /> {c.email}
                    </a>
                  )}
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                      <Phone className="h-3 w-3 shrink-0" /> {c.phone}
                    </a>
                  )}
                </div>

                {/* Usage count */}
                {(c.usageCount || 0) > 1 && (
                  <p className="mt-2 text-xs text-muted-foreground">Used {c.usageCount} times</p>
                )}

                {/* Actions */}
                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(c.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editContact ? 'Edit Contact' : 'Add Contact'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!editContact && (
              <div>
                <label className="text-sm font-medium">Contact Type</label>
                <Select
                  value={form.type || 'client'}
                  onValueChange={(v) => setForm(emptyForm(v as ContactType))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPE_LABELS) as ContactType[]).map((t) => (
                      <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <ContactFormFields form={form} onChange={setForm} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editContact ? 'Save Changes' : 'Add Contact'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Contact?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently remove the contact from the Contacts Book. It will not affect any existing transactions.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
