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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
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
import {
  Plus, Pencil, UserX, UserCheck, AlertTriangle, CheckCircle2, Sparkles,
  Sofa, Building2, Landmark, ClipboardCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Vendor categories ────────────────────────────────────────────────────────
export const VENDOR_CATEGORIES = [
  { value: 'stager',                  label: 'Stagers' },
  { value: 'title_company',           label: 'Title Companies' },
  { value: 'lender',                  label: 'Lenders' },
  { value: 'inspector_general',       label: 'Inspector — General' },
  { value: 'inspector_termite',       label: 'Inspector — Termite' },
  { value: 'inspector_foundation',    label: 'Inspector — Foundation' },
  { value: 'inspector_sewer',         label: 'Inspector — Sewer' },
  { value: 'inspector_roof',          label: 'Inspector — Roof' },
  { value: 'inspector_hvac',          label: 'Inspector — HVAC' },
  { value: 'inspector_pool',          label: 'Inspector — Pool' },
  { value: 'inspector_water_well',    label: 'Inspector — Water Well' },
  { value: 'inspector_survey',        label: 'Inspector — Survey' },
  { value: 'inspector_elevation',     label: 'Inspector — Elevation Certificate' },
] as const;

type VendorCategory = typeof VENDOR_CATEGORIES[number]['value'];

// Tab groups for the UI
const TAB_GROUPS = [
  {
    value: 'stager',
    label: 'Stagers',
    icon: Sofa,
    categories: ['stager'] as VendorCategory[],
  },
  {
    value: 'title_company',
    label: 'Title',
    icon: Landmark,
    categories: ['title_company'] as VendorCategory[],
  },
  {
    value: 'lender',
    label: 'Lenders',
    icon: Building2,
    categories: ['lender'] as VendorCategory[],
  },
  {
    value: 'inspectors',
    label: 'Inspectors',
    icon: ClipboardCheck,
    categories: [
      'inspector_general', 'inspector_termite', 'inspector_foundation',
      'inspector_sewer', 'inspector_roof', 'inspector_hvac',
      'inspector_pool', 'inspector_water_well', 'inspector_survey',
      'inspector_elevation',
    ] as VendorCategory[],
  },
];

function getCategoryLabel(value: string) {
  return VENDOR_CATEGORIES.find(c => c.value === value)?.label ?? value;
}

type Vendor = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  category: VendorCategory;
  notes: string | null;
  active: boolean;
  createdAt: string;
};

type VendorFormData = {
  name: string;
  email: string;
  phone: string;
  company: string;
  category: VendorCategory;
  notes: string;
};

const emptyForm = (cat: VendorCategory): VendorFormData => ({
  name: '', email: '', phone: '', company: '', category: cat, notes: '',
});

export default function VendorsAdminPage() {
  const { user } = useUser();
  const { isAdmin } = useIsAdminLike();

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('stager');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [formData, setFormData] = useState<VendorFormData>(emptyForm('stager'));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Deactivate confirm
  const [deactivateTarget, setDeactivateTarget] = useState<Vendor | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  // Seed
  const [seeding, setSeeding] = useState(false);

  const getToken = useCallback(async () => {
    if (!user) return null;
    return user.getIdToken();
  }, [user]);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const fetchVendors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/vendors', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to load vendors');
      setVendors(data.vendors);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (user) fetchVendors();
  }, [user, fetchVendors]);

  // Vendors for the current tab
  const currentGroup = TAB_GROUPS.find(g => g.value === activeTab);
  const filteredVendors = vendors.filter(v =>
    currentGroup?.categories.includes(v.category as VendorCategory)
  );

  const openAddDialog = () => {
    // Default category = first in current tab group
    const defaultCat = currentGroup?.categories[0] ?? 'stager';
    setEditingVendor(null);
    setFormData(emptyForm(defaultCat));
    setFormError(null);
    setDialogOpen(true);
  };

  const openEditDialog = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setFormData({
      name: vendor.name,
      email: vendor.email || '',
      phone: vendor.phone || '',
      company: vendor.company || '',
      category: vendor.category,
      notes: vendor.notes || '',
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) { setFormError('Name is required.'); return; }
    setSaving(true);
    setFormError(null);
    try {
      const token = await getToken();
      let res: Response;
      if (editingVendor) {
        res = await fetch(`/api/admin/vendors/${editingVendor.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(formData),
        });
      } else {
        res = await fetch('/api/admin/vendors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(formData),
        });
      }
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Save failed');
      setDialogOpen(false);
      await fetchVendors();
      showSuccess(editingVendor ? `${formData.name} updated.` : `${formData.name} added.`);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = (vendor: Vendor) => {
    if (vendor.active) { setDeactivateTarget(vendor); return; }
    doToggle(vendor, true);
  };

  const doToggle = async (vendor: Vendor, active: boolean) => {
    setDeactivating(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/vendors/${vendor.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ active }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Update failed');
      await fetchVendors();
      showSuccess(active ? `${vendor.name} reactivated.` : `${vendor.name} deactivated.`);
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
      const res = await fetch('/api/admin/vendors/seed', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Seed failed');
      await fetchVendors();
      const msg = data.added.length > 0
        ? `Seeded: ${data.added.join(', ')}${data.skipped.length > 0 ? `. Already existed: ${data.skipped.join(', ')}` : ''}`
        : 'All default stagers already exist — nothing to seed.';
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

  // Show seed button only on Stagers tab when no stagers exist
  const stagersExist = vendors.some(v => v.category === 'stager');
  const showSeedButton = activeTab === 'stager' && !stagersExist && !loading;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Vendor Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage preferred vendors — stagers, title companies, lenders, and inspectors.
          </p>
        </div>
        <div className="flex gap-2">
          {showSeedButton && (
            <Button variant="outline" onClick={handleSeed} disabled={seeding}>
              <Sparkles className="h-4 w-4 mr-2" />
              {seeding ? 'Seeding…' : 'Seed Default Stagers'}
            </Button>
          )}
          <Button onClick={openAddDialog}>
            <Plus className="h-4 w-4 mr-2" /> Add Vendor
          </Button>
        </div>
      </div>

      {/* Alerts */}
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

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          {TAB_GROUPS.map(group => {
            const count = vendors.filter(v => group.categories.includes(v.category as VendorCategory) && v.active).length;
            return (
              <TabsTrigger key={group.value} value={group.value} className="flex items-center gap-1.5">
                <group.icon className="h-3.5 w-3.5" />
                {group.label}
                {count > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-4">
                    {count}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {TAB_GROUPS.map(group => (
          <TabsContent key={group.value} value={group.value} className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <group.icon className="h-5 w-5" />
                  {group.label}
                </CardTitle>
                <CardDescription>
                  {loading ? 'Loading…' : `${filteredVendors.length} vendor${filteredVendors.length !== 1 ? 's' : ''}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : filteredVendors.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <group.icon className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No {group.label.toLowerCase()} yet.</p>
                    <p className="text-sm mt-1">
                      Click <strong>Add Vendor</strong> to add one.
                      {group.value === 'stager' && ' Or use "Seed Default Stagers" to add Renee, Lori, and Amy.'}
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        {group.value === 'inspectors' && <TableHead>Type</TableHead>}
                        <TableHead>Company</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredVendors.map(vendor => (
                        <TableRow key={vendor.id} className={cn(!vendor.active && 'opacity-50')}>
                          <TableCell className="font-medium">{vendor.name}</TableCell>
                          {group.value === 'inspectors' && (
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {getCategoryLabel(vendor.category).replace('Inspector — ', '')}
                              </Badge>
                            </TableCell>
                          )}
                          <TableCell>{vendor.company || <span className="text-muted-foreground italic">—</span>}</TableCell>
                          <TableCell>{vendor.email || <span className="text-muted-foreground italic">—</span>}</TableCell>
                          <TableCell>{vendor.phone || <span className="text-muted-foreground italic">—</span>}</TableCell>
                          <TableCell>
                            <Badge variant={vendor.active ? 'default' : 'secondary'}>
                              {vendor.active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="ghost" onClick={() => openEditDialog(vendor)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleToggleActive(vendor)}
                                disabled={deactivating}
                                title={vendor.active ? 'Deactivate' : 'Reactivate'}
                              >
                                {vendor.active
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
          </TabsContent>
        ))}
      </Tabs>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingVendor ? 'Edit Vendor' : 'Add Vendor'}</DialogTitle>
            <DialogDescription>
              {editingVendor ? 'Update vendor details.' : 'Add a new vendor to the directory.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {formError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            {/* Category selector */}
            <div className="space-y-1">
              <Label htmlFor="vendor-category">Category <span className="text-destructive">*</span></Label>
              <select
                id="vendor-category"
                value={formData.category}
                onChange={e => setFormData(f => ({ ...f, category: e.target.value as VendorCategory }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {VENDOR_CATEGORIES.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="vendor-name">Name <span className="text-destructive">*</span></Label>
              <Input
                id="vendor-name"
                value={formData.name}
                onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="vendor-email">Email</Label>
                <Input
                  id="vendor-email"
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
                  placeholder="email@example.com"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="vendor-phone">Phone</Label>
                <Input
                  id="vendor-phone"
                  value={formData.phone}
                  onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))}
                  placeholder="337-000-0000"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="vendor-company">Company</Label>
              <Input
                id="vendor-company"
                value={formData.company}
                onChange={e => setFormData(f => ({ ...f, company: e.target.value }))}
                placeholder="Company name (optional)"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="vendor-notes">Notes</Label>
              <Textarea
                id="vendor-notes"
                value={formData.notes}
                onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                placeholder="Any notes about this vendor…"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editingVendor ? 'Save Changes' : 'Add Vendor'}
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
              This vendor will no longer appear in agent-facing dropdowns. You can reactivate them at any time.
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
