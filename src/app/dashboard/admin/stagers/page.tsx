'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@/firebase';
import { useIsAdminLike } from '@/hooks/useIsAdminLike';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, Pencil, UserX, UserCheck, Sofa, AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

type Stager = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  active: boolean;
  createdAt: string;
};

type StagerFormData = {
  name: string;
  email: string;
  phone: string;
  company: string;
};

const emptyForm: StagerFormData = { name: '', email: '', phone: '', company: '' };

export default function StagersAdminPage() {
  const { user } = useUser();
  const { isAdmin } = useIsAdminLike();

  const [stagers, setStagers] = useState<Stager[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStager, setEditingStager] = useState<Stager | null>(null);
  const [formData, setFormData] = useState<StagerFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Deactivate confirm
  const [deactivateTarget, setDeactivateTarget] = useState<Stager | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  // Seed state
  const [seeding, setSeeding] = useState(false);

  const getToken = useCallback(async () => {
    if (!user) return null;
    return user.getIdToken();
  }, [user]);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const fetchStagers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/stagers', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to load stagers');
      setStagers(data.stagers);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (user) fetchStagers();
  }, [user, fetchStagers]);

  const openAddDialog = () => {
    setEditingStager(null);
    setFormData(emptyForm);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEditDialog = (stager: Stager) => {
    setEditingStager(stager);
    setFormData({
      name: stager.name,
      email: stager.email || '',
      phone: stager.phone || '',
      company: stager.company || '',
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setFormError('Name is required.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const token = await getToken();
      let res: Response;
      if (editingStager) {
        res = await fetch(`/api/admin/stagers/${editingStager.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(formData),
        });
      } else {
        res = await fetch('/api/admin/stagers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(formData),
        });
      }
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Save failed');
      setDialogOpen(false);
      await fetchStagers();
      showSuccess(editingStager ? `${formData.name} updated.` : `${formData.name} added.`);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (stager: Stager) => {
    if (stager.active) {
      // Show confirm dialog before deactivating
      setDeactivateTarget(stager);
      return;
    }
    // Reactivate directly
    await doToggle(stager, true);
  };

  const doToggle = async (stager: Stager, active: boolean) => {
    setDeactivating(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/stagers/${stager.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ active }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Update failed');
      await fetchStagers();
      showSuccess(active ? `${stager.name} reactivated.` : `${stager.name} deactivated.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeactivating(false);
      setDeactivateTarget(null);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/stagers/seed', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Seed failed');
      await fetchStagers();
      const msg = data.added.length > 0
        ? `Seeded: ${data.added.join(', ')}${data.skipped.length > 0 ? `. Skipped (already exist): ${data.skipped.join(', ')}` : ''}`
        : `All stagers already exist — nothing to seed.`;
      showSuccess(msg);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSeeding(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Admin access required.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sofa className="h-6 w-6" /> Stager Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage stagers available in the Staging Request form on new listings.
          </p>
        </div>
        <div className="flex gap-2">
          {stagers.length === 0 && !loading && (
            <Button variant="outline" onClick={handleSeed} disabled={seeding}>
              <Sparkles className="h-4 w-4 mr-2" />
              {seeding ? 'Seeding…' : 'Seed Initial Stagers'}
            </Button>
          )}
          <Button onClick={openAddDialog}>
            <Plus className="h-4 w-4 mr-2" /> Add Stager
          </Button>
        </div>
      </div>

      {successMsg && (
        <Alert className="border-green-500 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{successMsg}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Stagers</CardTitle>
          <CardDescription>
            {loading ? 'Loading…' : `${stagers.length} stager${stagers.length !== 1 ? 's' : ''} total`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : stagers.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Sofa className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No stagers yet.</p>
              <p className="text-sm mt-1">Click <strong>Seed Initial Stagers</strong> to add the default three, or use <strong>Add Stager</strong> to add manually.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stagers.map(stager => (
                  <TableRow key={stager.id} className={cn(!stager.active && 'opacity-50')}>
                    <TableCell className="font-medium">{stager.name}</TableCell>
                    <TableCell>{stager.email || <span className="text-muted-foreground italic">—</span>}</TableCell>
                    <TableCell>{stager.phone || <span className="text-muted-foreground italic">—</span>}</TableCell>
                    <TableCell>{stager.company || <span className="text-muted-foreground italic">—</span>}</TableCell>
                    <TableCell>
                      <Badge variant={stager.active ? 'default' : 'secondary'}>
                        {stager.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => openEditDialog(stager)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleToggleActive(stager)}
                          disabled={deactivating}
                          title={stager.active ? 'Deactivate' : 'Reactivate'}
                        >
                          {stager.active
                            ? <UserX className="h-4 w-4 text-destructive" />
                            : <UserCheck className="h-4 w-4 text-green-600" />
                          }
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingStager ? 'Edit Stager' : 'Add Stager'}</DialogTitle>
            <DialogDescription>
              {editingStager ? 'Update stager details.' : 'Add a new stager to the dropdown.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {formError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1">
              <Label htmlFor="stager-name">Name <span className="text-destructive">*</span></Label>
              <Input
                id="stager-name"
                value={formData.name}
                onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Renee Doré"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="stager-email">Email</Label>
              <Input
                id="stager-email"
                type="email"
                value={formData.email}
                onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
                placeholder="stager@example.com"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="stager-phone">Phone</Label>
              <Input
                id="stager-phone"
                value={formData.phone}
                onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))}
                placeholder="337-000-0000"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="stager-company">Company</Label>
              <Input
                id="stager-company"
                value={formData.company}
                onChange={e => setFormData(f => ({ ...f, company: e.target.value }))}
                placeholder="e.g. House Dressings"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editingStager ? 'Save Changes' : 'Add Stager'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirm */}
      <AlertDialog open={!!deactivateTarget} onOpenChange={open => !open && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {deactivateTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This stager will no longer appear in the Staging Request dropdown. You can reactivate them at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deactivating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deactivateTarget && doToggle(deactivateTarget, false)}
              disabled={deactivating}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deactivating ? 'Deactivating…' : 'Deactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
