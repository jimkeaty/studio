'use client';

import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Plus, Pencil, Trash2, UserCog, Mail, Phone, Shield, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

type TcProfile = {
  id: string;
  displayName: string;
  email: string;
  phone: string | null;
  role: 'tc' | 'tc_admin';
  status: 'active' | 'inactive';
  notifyOnNewIntake: boolean;
  notifyOnStatusChange: boolean;
  assignedIntakeIds: string[];
  createdAt: string;
  updatedAt: string;
};

const emptyForm = {
  displayName: '',
  email: '',
  phone: '',
  role: 'tc' as 'tc' | 'tc_admin',
  notifyOnNewIntake: true,
  notifyOnStatusChange: true,
};

export default function TcProfilesPage() {
  const { user } = useUser();
  const [profiles, setProfiles] = useState<TcProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const isAdmin = user?.uid === ADMIN_UID;
  const [isStaffAdmin, setIsStaffAdmin] = useState(false);
  useEffect(() => {
    if (!user || user.uid === ADMIN_UID) return;
    let cancelled = false;
    user.getIdToken().then((token) => {
      fetch('/api/admin/staff-users', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => { if (!cancelled && d.ok) setIsStaffAdmin(true); })
        .catch(() => {});
    });
    return () => { cancelled = true; };
  }, [user]);
  const hasAdminAccess: boolean = !!(user && ((user as any).role === 'admin' || isStaffAdmin));

  const fetchProfiles = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/tc-profiles', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to load TC profiles');
      setProfiles(data.profiles || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user && hasAdminAccess) fetchProfiles();
  }, [user, hasAdminAccess, fetchProfiles]);

  const handleSave = async () => {
    if (!user || !form.displayName.trim() || !form.email.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const url = editingId
        ? `/api/admin/tc-profiles/${editingId}`
        : '/api/admin/tc-profiles';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          displayName: form.displayName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          role: form.role,
          notifyOnNewIntake: form.notifyOnNewIntake,
          notifyOnStatusChange: form.notifyOnStatusChange,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to save');
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      fetchProfiles();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (profileId: string) => {
    if (!user || !confirm('Are you sure you want to delete this TC profile?')) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/tc-profiles/${profileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to delete');
      fetchProfiles();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleStatus = async (profile: TcProfile) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/tc-profiles/${profile.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: profile.status === 'active' ? 'inactive' : 'active' }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to update status');
      fetchProfiles();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const openEdit = (profile: TcProfile) => {
    setEditingId(profile.id);
    setForm({
      displayName: profile.displayName,
      email: profile.email,
      phone: profile.phone || '',
      role: profile.role,
      notifyOnNewIntake: profile.notifyOnNewIntake,
      notifyOnStatusChange: profile.notifyOnStatusChange,
    });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  if (!hasAdminAccess) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>This page is restricted to administrators.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const activeProfiles = profiles.filter(p => p.status === 'active');
  const inactiveProfiles = profiles.filter(p => p.status === 'inactive');

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">TC Profiles</h1>
          <p className="text-muted-foreground">Manage Transaction Coordinator profiles and notification preferences.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchProfiles} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} /> Refresh
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openNew}>
                <Plus className="h-4 w-4 mr-1" /> Add TC Profile
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? 'Edit TC Profile' : 'New TC Profile'}</DialogTitle>
                <DialogDescription>
                  {editingId ? 'Update the TC profile details.' : 'Create a new Transaction Coordinator profile.'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="displayName">Name *</Label>
                  <Input id="displayName" value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} placeholder="Jane Smith" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input id="email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@example.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(555) 123-4567" />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={form.role} onValueChange={(v: 'tc' | 'tc_admin') => setForm(f => ({ ...f, role: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tc">TC</SelectItem>
                      <SelectItem value="tc_admin">TC Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="notifyNew">Notify on new intake</Label>
                  <Switch id="notifyNew" checked={form.notifyOnNewIntake} onCheckedChange={v => setForm(f => ({ ...f, notifyOnNewIntake: v }))} />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="notifyStatus">Notify on status change</Label>
                  <Switch id="notifyStatus" checked={form.notifyOnStatusChange} onCheckedChange={v => setForm(f => ({ ...f, notifyOnStatusChange: v }))} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving || !form.displayName.trim() || !form.email.trim()}>
                  {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : profiles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <UserCog className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No TC profiles yet</p>
            <p className="text-sm mt-1">Click &quot;Add TC Profile&quot; to create one.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {activeProfiles.length} Active · {inactiveProfiles.length} Inactive
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notifications</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map(profile => (
                  <TableRow key={profile.id} className={profile.status === 'inactive' ? 'opacity-50' : ''}>
                    <TableCell className="font-medium">{profile.displayName}</TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1 text-sm">
                          <Mail className="h-3 w-3 text-muted-foreground" /> {profile.email}
                        </div>
                        {profile.phone && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Phone className="h-3 w-3" /> {profile.phone}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={profile.role === 'tc_admin' ? 'default' : 'secondary'} className="gap-1">
                        {profile.role === 'tc_admin' && <Shield className="h-3 w-3" />}
                        {profile.role === 'tc_admin' ? 'TC Admin' : 'TC'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          'cursor-pointer',
                          profile.status === 'active'
                            ? 'border-green-500/50 text-green-700 dark:text-green-400'
                            : 'border-red-500/50 text-red-700 dark:text-red-400'
                        )}
                        onClick={() => handleToggleStatus(profile)}
                      >
                        {profile.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2 text-xs text-muted-foreground">
                        {profile.notifyOnNewIntake && <Badge variant="outline" className="text-[10px]">New Intake</Badge>}
                        {profile.notifyOnStatusChange && <Badge variant="outline" className="text-[10px]">Status Change</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(profile)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700" onClick={() => handleDelete(profile.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
