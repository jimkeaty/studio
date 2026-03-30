'use client';

import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, Pencil, UserX, UserCheck, Mail, Shield, Building2, ClipboardList, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

type StaffRole = 'office_admin' | 'tc_admin' | 'tc';

type StaffUser = {
  id: string;
  displayName: string;
  email: string;
  phone: string | null;
  role: StaffRole;
  status: 'active' | 'inactive';
  firebaseUid: string | null;
  authCreated: boolean;
  createdAt: string;
  updatedAt: string;
};

const ROLE_LABELS: Record<StaffRole, string> = {
  office_admin: 'Office Admin',
  tc_admin: 'TC Admin',
  tc: 'Transaction Coordinator',
};

const ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  office_admin: 'Full dashboard access — agents, transactions, reports. No TC notifications.',
  tc_admin: 'Full TC queue + can view agent dashboards. Receives TC notifications.',
  tc: 'TC intake queue only. Receives TC notifications.',
};

const ROLE_ICONS: Record<StaffRole, React.ElementType> = {
  office_admin: Building2,
  tc_admin: Shield,
  tc: ClipboardList,
};

const ROLE_COLORS: Record<StaffRole, string> = {
  office_admin: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  tc_admin: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  tc: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
};

const emptyForm = {
  displayName: '',
  email: '',
  phone: '',
  role: 'office_admin' as StaffRole,
};

export default function StaffUsersPage() {
  const { user } = useUser();
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<StaffUser | null>(null);
  const [form, setForm] = useState(emptyForm);

  const isAdmin = user?.uid === ADMIN_UID;

  const fetchUsers = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/staff-users', {
        headers: { Authorization: \`Bearer \${token}\` },
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to load staff users');
      setUsers(data.users || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user && isAdmin) fetchUsers();
  }, [user, isAdmin, fetchUsers]);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const handleSave = async () => {
    if (!user || !form.displayName.trim() || !form.email.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const url = editingId ? \`/api/admin/staff-users/\${editingId}\` : '/api/admin/staff-users';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { Authorization: \`Bearer \${token}\`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to save');
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      await fetchUsers();
      if (!editingId) {
        showSuccess(\`\${form.displayName} has been added. A password setup email has been sent to \${form.email}.\`);
      } else {
        showSuccess('Staff user updated successfully.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (staffUser: StaffUser) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(\`/api/admin/staff-users/\${staffUser.id}\`, {
        method: 'DELETE',
        headers: { Authorization: \`Bearer \${token}\` },
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to deactivate');
      setDeactivateTarget(null);
      await fetchUsers();
      showSuccess(\`\${staffUser.displayName} has been deactivated.\`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleReactivate = async (staffUser: StaffUser) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(\`/api/admin/staff-users/\${staffUser.id}\`, {
        method: 'PATCH',
        headers: { Authorization: \`Bearer \${token}\`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to reactivate');
      await fetchUsers();
      showSuccess(\`\${staffUser.displayName} has been reactivated.\`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const openEdit = (staffUser: StaffUser) => {
    setEditingId(staffUser.id);
    setForm({
      displayName: staffUser.displayName,
      email: staffUser.email,
      phone: staffUser.phone || '',
      role: staffUser.role,
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Access denied. Office Admin only.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staff Users</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage office admins and transaction coordinators. New users receive a password setup email automatically.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add Staff User
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit Staff User' : 'Add Staff User'}</DialogTitle>
              <DialogDescription>
                {editingId
                  ? 'Update this staff user\'s details and role.'
                  : 'A password setup email will be sent automatically when you save.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="displayName">Full Name *</Label>
                <Input
                  id="displayName"
                  value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                  placeholder="Jane Smith"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="jane@example.com"
                  disabled={!!editingId}
                />
                {editingId && (
                  <p className="text-xs text-muted-foreground">Email cannot be changed after creation.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="(555) 000-0000"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role">Role *</Label>
                <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as StaffRole }))}>
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ROLE_LABELS) as StaffRole[]).map((r) => (
                      <SelectItem key={r} value={r}>
                        <div>
                          <div className="font-medium">{ROLE_LABELS[r]}</div>
                          <div className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={handleSave}
                disabled={saving || !form.displayName.trim() || !form.email.trim()}
              >
                {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add & Send Invite'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {successMsg && (
        <Alert className="border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/20 dark:text-green-300">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{successMsg}</AlertDescription>
        </Alert>
      )}

      {/* Role legend */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(Object.keys(ROLE_LABELS) as StaffRole[]).map((r) => {
          const Icon = ROLE_ICONS[r];
          return (
            <Card key={r} className="border">
              <CardContent className="p-4 flex items-start gap-3">
                <div className={cn('rounded-md p-2', ROLE_COLORS[r])}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-medium text-sm">{ROLE_LABELS[r]}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{ROLE_DESCRIPTIONS[r]}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Staff Members</CardTitle>
          <CardDescription>
            {users.filter((u) => u.status === 'active').length} active ·{' '}
            {users.filter((u) => u.status === 'inactive').length} inactive
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Shield className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No staff users yet</p>
              <p className="text-sm mt-1">Add your first office admin or TC above.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Login</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const Icon = ROLE_ICONS[u.role];
                  return (
                    <TableRow key={u.id} className={u.status === 'inactive' ? 'opacity-50' : ''}>
                      <TableCell className="font-medium">{u.displayName}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        <div className="flex items-center gap-1.5">
                          <Mail className="h-3 w-3" />
                          {u.email}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', ROLE_COLORS[u.role])}>
                          <Icon className="h-3 w-3" />
                          {ROLE_LABELS[u.role]}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.status === 'active' ? 'default' : 'secondary'}>
                          {u.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={cn('text-xs', u.firebaseUid ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground')}>
                          {u.firebaseUid ? '✓ Account created' : '— Pending'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(u)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {u.status === 'active' ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeactivateTarget(u)}
                            >
                              <UserX className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => handleReactivate(u)}>
                              <UserCheck className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Deactivate confirmation */}
      <AlertDialog open={!!deactivateTarget} onOpenChange={(o) => !o && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {deactivateTarget?.displayName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will disable their login access immediately. Their data is preserved and they can be reactivated at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deactivateTarget && handleDeactivate(deactivateTarget)}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
