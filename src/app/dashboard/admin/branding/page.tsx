'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useUser } from '@/firebase';
import { useIsAdminLike } from '@/hooks/useIsAdminLike';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Upload, Image as ImageIcon, Paintbrush, Save, CheckCircle2, AlertTriangle, Loader2, X, Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type BrandingSettings = {
  companyName: string;
  tagline: string | null;
  logoUrl: string | null;
  animatedLogoUrl: string | null;
  useAnimatedLogo: boolean;
  primaryColor: string | null;
  updatedAt: string | null;
};

const DEFAULT_BRANDING: BrandingSettings = {
  companyName: 'Smart Broker USA',
  tagline: null,
  logoUrl: null,
  animatedLogoUrl: null,
  useAnimatedLogo: false,
  primaryColor: null,
  updatedAt: null,
};

// ---------- Upload Drop Zone ----------
function UploadZone({
  label,
  accept,
  currentUrl,
  onUpload,
  uploading,
  hint,
}: {
  label: string;
  accept: string;
  currentUrl: string | null;
  onUpload: (file: File) => void;
  uploading: boolean;
  hint: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    onUpload(file);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      handleFile(file);
    },
    [onUpload]
  );

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div
        className={cn(
          'relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors cursor-pointer',
          dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50',
          uploading && 'pointer-events-none opacity-60'
        )}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        ) : currentUrl ? (
          <img
            src={currentUrl}
            alt={label}
            className="max-h-24 max-w-full object-contain rounded"
          />
        ) : (
          <Upload className="h-8 w-8 text-muted-foreground" />
        )}
        <p className="mt-2 text-sm text-muted-foreground text-center">
          {uploading ? 'Uploading...' : 'Drag & drop or click to upload'}
        </p>
        <p className="text-xs text-muted-foreground/60">{hint}</p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>
      {currentUrl && !uploading && (
        <p className="text-xs text-muted-foreground truncate">
          Current: {currentUrl}
        </p>
      )}
    </div>
  );
}

// ---------- Sidebar Preview ----------
function SidebarPreview({ branding }: { branding: BrandingSettings }) {
  const activeLogo = branding.useAnimatedLogo && branding.animatedLogoUrl
    ? branding.animatedLogoUrl
    : branding.logoUrl;

  const bgColor = branding.primaryColor || '#0f172a';

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        <Eye className="h-4 w-4" /> Live Preview
      </Label>
      <div
        className="rounded-lg overflow-hidden shadow-lg w-full max-w-[260px]"
        style={{ backgroundColor: bgColor }}
      >
        {/* Sidebar header mockup */}
        <div className="flex flex-col items-center gap-3 px-4 py-6">
          {activeLogo ? (
            <img
              src={activeLogo}
              alt="Logo preview"
              className={cn(
                'h-16 w-auto object-contain rounded',
                branding.useAnimatedLogo && branding.animatedLogoUrl && 'animate-pulse'
              )}
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-white/20 flex items-center justify-center">
              <ImageIcon className="h-8 w-8 text-white/60" />
            </div>
          )}
          <div className="text-center">
            <h3 className="text-white font-bold text-sm leading-tight">
              {branding.companyName || 'Company Name'}
            </h3>
            {branding.tagline && (
              <p className="text-white/70 text-xs mt-0.5">{branding.tagline}</p>
            )}
          </div>
        </div>
        {/* Simulated menu items */}
        <div className="px-3 pb-4 space-y-1">
          {['Dashboard', 'Transactions', 'Pipeline', 'Reports'].map((item) => (
            <div
              key={item}
              className="rounded-md px-3 py-2 text-xs text-white/60"
              style={item === 'Dashboard' ? { backgroundColor: 'rgba(255,255,255,0.12)', color: 'white' } : undefined}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Main Page ----------
export default function AdminBrandingPage() {
  const { user, loading: userLoading } = useUser();
  const { isAdmin, loading: adminLoading } = useIsAdminLike();

  const [branding, setBranding] = useState<BrandingSettings>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingAnimated, setUploadingAnimated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ---------- Fetch branding ----------
  const loadBranding = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/branding', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load branding');
      setBranding(data.branding);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!userLoading && user) loadBranding();
  }, [user, userLoading, loadBranding]);

  // ---------- Save branding ----------
  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/branding', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(branding),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to save');
      setSuccess('Branding settings saved successfully.');
      // Clear success after a few seconds
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ---------- Upload handler ----------
  const handleUpload = async (file: File, type: 'logo' | 'animated') => {
    if (!user) return;
    const setUploading = type === 'logo' ? setUploadingLogo : setUploadingAnimated;
    setUploading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const form = new FormData();
      form.append('logo', file);
      const res = await fetch(`/api/admin/branding/upload?type=${type}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Upload failed');

      // Update local state with new URL
      if (type === 'logo') {
        setBranding((prev) => ({ ...prev, logoUrl: data.url }));
      } else {
        setBranding((prev) => ({ ...prev, animatedLogoUrl: data.url }));
      }
      setSuccess(`${type === 'logo' ? 'Logo' : 'Animated logo'} uploaded. Remember to save.`);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  // ---------- Auth guards ----------
  if (userLoading || adminLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <Alert>
        <AlertTitle>Authentication Required</AlertTitle>
        <AlertDescription>Please sign in.</AlertDescription>
      </Alert>
    );
  }

  if (!isAdmin) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Access Denied</AlertTitle>
        <AlertDescription>Admin only.</AlertDescription>
      </Alert>
    );
  }

  // ---------- Render ----------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">White-Label Branding</h1>
        <p className="text-muted-foreground">
          Customize your brokerage branding, logo, and colors.
        </p>
      </div>

      {/* Alerts */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="border-green-500/50 bg-green-500/10">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-700">Success</AlertTitle>
          <AlertDescription className="text-green-600">{success}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left column: Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Company Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Paintbrush className="h-5 w-5" /> Company Info
                </CardTitle>
                <CardDescription>
                  Set your brokerage name and tagline.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name *</Label>
                  <Input
                    id="companyName"
                    placeholder="e.g. Keaty Real Estate"
                    value={branding.companyName}
                    onChange={(e) =>
                      setBranding((prev) => ({ ...prev, companyName: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tagline">Tagline</Label>
                  <Input
                    id="tagline"
                    placeholder="e.g. Your Trusted Partner"
                    value={branding.tagline || ''}
                    onChange={(e) =>
                      setBranding((prev) => ({ ...prev, tagline: e.target.value || null }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="primaryColor">Primary Color</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      id="primaryColorPicker"
                      value={branding.primaryColor || '#0f172a'}
                      onChange={(e) =>
                        setBranding((prev) => ({ ...prev, primaryColor: e.target.value }))
                      }
                      className="h-10 w-10 rounded cursor-pointer border border-input"
                    />
                    <Input
                      id="primaryColor"
                      placeholder="#0f172a"
                      value={branding.primaryColor || ''}
                      onChange={(e) =>
                        setBranding((prev) => ({ ...prev, primaryColor: e.target.value || null }))
                      }
                      className="max-w-[160px] font-mono"
                    />
                    {branding.primaryColor && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setBranding((prev) => ({ ...prev, primaryColor: null }))}
                      >
                        <X className="h-4 w-4 mr-1" /> Reset
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Used for sidebar background and accent colors.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Logo Uploads */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" /> Logos
                </CardTitle>
                <CardDescription>
                  Upload a static logo and an optional animated version (GIF, APNG, WebP).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <UploadZone
                    label="Static Logo"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    currentUrl={branding.logoUrl}
                    onUpload={(file) => handleUpload(file, 'logo')}
                    uploading={uploadingLogo}
                    hint="PNG, JPG, SVG, or WebP. Max 5 MB."
                  />
                  <UploadZone
                    label="Animated Logo"
                    accept="image/gif,image/png,image/webp"
                    currentUrl={branding.animatedLogoUrl}
                    onUpload={(file) => handleUpload(file, 'animated')}
                    uploading={uploadingAnimated}
                    hint="GIF, APNG, or WebP. Max 5 MB."
                  />
                </div>

                {/* Animated toggle */}
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="useAnimatedLogo" className="text-sm font-medium">
                      Use Animated Logo
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Show the animated version in the sidebar instead of the static logo.
                    </p>
                  </div>
                  <Switch
                    id="useAnimatedLogo"
                    checked={branding.useAnimatedLogo}
                    onCheckedChange={(checked) =>
                      setBranding((prev) => ({ ...prev, useAnimatedLogo: checked }))
                    }
                    disabled={!branding.animatedLogoUrl}
                  />
                </div>
                {branding.useAnimatedLogo && !branding.animatedLogoUrl && (
                  <p className="text-xs text-amber-600">
                    Upload an animated logo to enable this option.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Save */}
            <div className="flex items-center gap-4">
              <Button onClick={handleSave} disabled={saving || !branding.companyName.trim()}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {saving ? 'Saving...' : 'Save Branding'}
              </Button>
              {branding.updatedAt && (
                <span className="text-xs text-muted-foreground">
                  Last saved: {new Date(branding.updatedAt).toLocaleString()}
                </span>
              )}
            </div>
          </div>

          {/* Right column: Live Preview */}
          <div className="space-y-4">
            <SidebarPreview branding={branding} />

            {/* Branding Summary */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Branding Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium truncate ml-2">{branding.companyName || '---'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tagline</span>
                  <span className="truncate ml-2">{branding.tagline || '---'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Color</span>
                  {branding.primaryColor ? (
                    <div className="flex items-center gap-1.5">
                      <div
                        className="h-4 w-4 rounded-full border"
                        style={{ backgroundColor: branding.primaryColor }}
                      />
                      <span className="font-mono text-xs">{branding.primaryColor}</span>
                    </div>
                  ) : (
                    <span className="text-xs">Default</span>
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Static Logo</span>
                  <Badge variant={branding.logoUrl ? 'default' : 'secondary'}>
                    {branding.logoUrl ? 'Uploaded' : 'None'}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Animated Logo</span>
                  <Badge variant={branding.animatedLogoUrl ? 'default' : 'secondary'}>
                    {branding.animatedLogoUrl ? 'Uploaded' : 'None'}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Animated Active</span>
                  <Badge variant={branding.useAnimatedLogo ? 'default' : 'outline'}>
                    {branding.useAnimatedLogo ? 'On' : 'Off'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
