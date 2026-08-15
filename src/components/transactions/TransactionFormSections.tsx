/**
 * TransactionFormSections.tsx
 *
 * Shared form sections used across all transaction views:
 *   - Add Transaction (new/page.tsx)
 *   - Agent Transaction Detail (my-transactions/[txId]/page.tsx)
 *   - TC Queue Detail (admin/tc/[id]/page.tsx)
 *   - Staff Queue Detail (admin/staff-queue/[itemId]/page.tsx)
 *   - Admin Transaction Ledger (admin/transactions/edit/page.tsx)
 *
 * Each section accepts { form, role, isReadOnly, user, toast } props.
 * role: 'agent' | 'tc' | 'staff' | 'admin'
 * isReadOnly: true = closed transaction (agent view only)
 */

'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { UseFormReturn } from 'react-hook-form';
import {
  FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  ChevronDown, CheckCircle2, Send, Loader2, PlusCircle, Trash2,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
export const INSP_TYPES = [
  { key: 'inspector_general',    label: 'General Home Inspection' },
  { key: 'inspector_roof',       label: 'Roof Inspection' },
  { key: 'inspector_termite',    label: 'Termite Inspection' },
  { key: 'inspector_foundation', label: 'Foundation Inspection' },
  { key: 'inspector_sewer',      label: 'Sewer Inspection' },
  { key: 'inspector_hvac',       label: 'HVAC Inspection' },
  { key: 'inspector_pool',       label: 'Pool Inspection' },
  { key: 'inspector_water_well', label: 'Water Well Inspection' },
  { key: 'inspector_survey',     label: 'Survey' },
  { key: 'inspector_elevation',  label: 'Elevation Certificate' },
  { key: 'inspector_stucco',     label: 'Stucco Inspection' },
];

export const SIGN_SERVICE_OPTIONS = [
  'Install Sign Post',
  'Repair Sign Post or Panel',
  'Remove Sign Post (No Fee)',
  'Commercial Sign-Frame 4x4',
  'Commercial Sign-Frame 4x8',
  'Other',
];

export const SIGN_ADDITIONAL_OPTIONS = [
  'Directional Sign (+$2.00)',
  'Attach Personalized Name Rider',
  'Text2 Rider',
  'Phone# Rider EXT',
];

export const SHOWING_NOTES_TO_AGENT_OPTIONS = [
  'Leave card',
  'Lock doors',
  'Turn off lights',
  'Scramble lockbox when leaving',
  'Remove shoes or wear booties',
  'Return and secure key in lockbox',
];

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export type InspRowState = {
  vendorId: string;
  sendMode: 'selected' | 'all';
  preferredDate: string;
  preferredTimeStart: string;
  preferredTimeEnd: string;
  fallbackDateStart: string;
  fallbackDateEnd: string;
  sent: boolean;
  sending: boolean;
};

export type InspVendor = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
};

export type TransactionRole = 'agent' | 'tc' | 'staff' | 'admin';

export interface TransactionFormSectionProps {
  form: UseFormReturn<any>;
  role: TransactionRole;
  isReadOnly?: boolean;
  user?: any; // Firebase user for sending requests
  toast?: (opts: any) => void;
  transactionId?: string; // For sending inspection/staging requests on existing transactions
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout helpers
// ─────────────────────────────────────────────────────────────────────────────
export function Section({ title, description, children }: {
  title: string; description?: string; children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  );
}

export function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-5">{children}</div>;
}

export function Grid3({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-3 gap-5">{children}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Currency / Percent input helpers
// ─────────────────────────────────────────────────────────────────────────────
function parseCurrencyInput(val: string): string {
  const clean = val.replace(/[^0-9.]/g, '');
  const parts = clean.split('.');
  if (parts.length > 2) return parts[0] + '.' + parts.slice(1).join('');
  return clean;
}

export function CurrencyInput({ value, onChange, placeholder }: {
  value: string | number | undefined;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  const [displayVal, setDisplayVal] = useState('');
  useEffect(() => {
    if (value === '' || value === undefined || value === null) { setDisplayVal(''); return; }
    const str = String(value).replace(/,/g, '');
    const num = parseFloat(str);
    if (isNaN(num)) { setDisplayVal(String(value)); return; }
    const decimalMatch = str.match(/\.(\d+)$/);
    const decimals = decimalMatch ? decimalMatch[1].length : 0;
    setDisplayVal(num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: Math.max(decimals, 2) }));
  }, [value]);
  return (
    <Input
      type="text"
      inputMode="decimal"
      placeholder={placeholder || '0'}
      value={displayVal}
      onChange={(e) => {
        const raw = parseCurrencyInput(e.target.value);
        setDisplayVal(e.target.value.replace(/[^0-9.,]/g, ''));
        onChange(raw);
      }}
      onBlur={() => {
        const raw = parseCurrencyInput(displayVal);
        const num = parseFloat(raw);
        if (!isNaN(num)) {
          const decimalMatch = raw.match(/\.(\d+)$/);
          const decimals = decimalMatch ? decimalMatch[1].length : 0;
          setDisplayVal(num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: Math.max(decimals, 2) }));
        }
      }}
    />
  );
}

export function PercentInput({ value, onChange, placeholder }: {
  value: string | number | undefined;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  return (
    <Input
      type="number"
      min={0}
      max={100}
      step={0.01}
      placeholder={placeholder || '0'}
      value={value ?? ''}
      onChange={onChange}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Default inspection row factory
// ─────────────────────────────────────────────────────────────────────────────
export function makeDefaultInspRow(): InspRowState {
  const today = new Date().toISOString().split('T')[0];
  const fallbackEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  return {
    vendorId: '',
    sendMode: 'selected',
    preferredDate: '',
    preferredTimeStart: '08:00',
    preferredTimeEnd: '17:00',
    fallbackDateStart: today,
    fallbackDateEnd: fallbackEnd,
    sent: false,
    sending: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// useInspectionRows hook — shared state management for inspection rows
// ─────────────────────────────────────────────────────────────────────────────
export function useInspectionRows(initialData?: Record<string, any>) {
  const [inspRows, setInspRows] = useState<Record<string, InspRowState>>(() => {
    const rows: Record<string, InspRowState> = {};
    for (const t of INSP_TYPES) {
      const saved = initialData?.[t.key];
      rows[t.key] = saved ? { ...makeDefaultInspRow(), ...saved } : makeDefaultInspRow();
    }
    return rows;
  });

  const updateInspRow = useCallback((key: string, patch: Partial<InspRowState>) => {
    setInspRows(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  const toggleInspectionType = useCallback((label: string, currentTypes: string[], setTypes: (t: string[]) => void) => {
    if (currentTypes.includes(label)) {
      setTypes(currentTypes.filter(t => t !== label));
    } else {
      setTypes([...currentTypes, label]);
    }
  }, []);

  return { inspRows, setInspRows, updateInspRow, toggleInspectionType };
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Key Dates
// ─────────────────────────────────────────────────────────────────────────────
export function KeyDatesSection({ form, role }: TransactionFormSectionProps) {
  const closingType = form.watch('closingType') || form.watch('side') || '';
  const isListing = closingType === 'listing';
  const isBuyer = closingType === 'buyer';
  const isDual = closingType === 'dual';
  const isAdmin = role === 'admin' || role === 'tc' || role === 'staff';

  return (
    <Section title="Key Dates">
      {(isListing || isDual) && (
        <Grid3>
          <FormField control={form.control} name="listingDate" render={({ field }) => (
            <FormItem><FormLabel>Listing Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
          )} />
          <FormField control={form.control} name="contractDate" render={({ field }) => (
            <FormItem><FormLabel>Under Contract Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
          )} />
          <FormField control={form.control} name="listingExpirationDate" render={({ field }) => (
            <FormItem><FormLabel>Listing Expiration Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
          )} />
        </Grid3>
      )}
      {(isBuyer || isDual) && (
        <>
          <Grid3>
            <FormField control={form.control} name="contractDate" render={({ field }) => (
              <FormItem>
                <FormLabel>Under Contract Date</FormLabel>
                <FormControl><Input type="date" {...field} /></FormControl>
                <FormDescription>Leave blank if not yet under contract.</FormDescription>
              </FormItem>
            )} />
            <FormField control={form.control} name="inspectionDeadline" render={({ field }) => (
              <FormItem><FormLabel>Inspection Deadline</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="surveyDeadline" render={({ field }) => (
              <FormItem><FormLabel>Survey Deadline</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
            )} />
          </Grid3>
          <Grid3>
            <FormField control={form.control} name="projectedCloseDate" render={({ field }) => (
              <FormItem><FormLabel>Projected Close Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="loanApplicationDeadline" render={({ field }) => (
              <FormItem><FormLabel>Loan Application Deadline</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="appraisalDeadline" render={({ field }) => (
              <FormItem><FormLabel>Appraisal Deadline</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
            )} />
          </Grid3>
          <Grid3>
            <FormField control={form.control} name="titleDeadline" render={({ field }) => (
              <FormItem><FormLabel>Title Deadline</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="finalLoanCommitmentDeadline" render={({ field }) => (
              <FormItem><FormLabel>Final Loan Commitment Deadline</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="closedDate" render={({ field }) => (
              <FormItem>
                <FormLabel>Actual Close Date</FormLabel>
                <FormControl><Input type="date" {...field} /></FormControl>
                <FormDescription>{isAdmin ? 'Sets status to Closed automatically.' : 'Leave blank if not yet closed.'}</FormDescription>
              </FormItem>
            )} />
          </Grid3>
        </>
      )}
      {isListing && (
        <Grid3>
          <FormField control={form.control} name="projectedCloseDate" render={({ field }) => (
            <FormItem><FormLabel>Projected Close Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
          )} />
          <FormField control={form.control} name="inspectionDeadline" render={({ field }) => (
            <FormItem><FormLabel>Inspection Deadline</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
          )} />
          <FormField control={form.control} name="closedDate" render={({ field }) => (
            <FormItem><FormLabel>Actual Close Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
          )} />
        </Grid3>
      )}
      <FormField control={form.control} name="optionExpiration" render={({ field }) => (
        <FormItem className="max-w-xs">
          <FormLabel>Option Expiration</FormLabel>
          <FormControl><Input type="date" {...field} /></FormControl>
        </FormItem>
      )} />
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Buyer / Seller Information
// ─────────────────────────────────────────────────────────────────────────────
export function BuyerSellerSection({ form }: TransactionFormSectionProps) {
  const closingType = form.watch('closingType') || form.watch('side') || '';
  const clientType = form.watch('clientType') || '';
  const isBuyer = closingType === 'buyer' || clientType === 'buyer' || clientType === 'dual';
  const isSeller = closingType === 'listing' || clientType === 'seller' || clientType === 'dual';
  const isDual = closingType === 'dual';

  const [showBuyer2, setShowBuyer2] = useState(!!(form.getValues('buyer2Name')));
  const [showBuyer3, setShowBuyer3] = useState(!!(form.getValues('buyer3Name')));
  const [showBuyer4, setShowBuyer4] = useState(!!(form.getValues('buyer4Name')));
  const [showSeller2, setShowSeller2] = useState(!!(form.getValues('seller2Name')));
  const [showSeller3, setShowSeller3] = useState(!!(form.getValues('seller3Name')));
  const [showSeller4, setShowSeller4] = useState(!!(form.getValues('seller4Name')));

  return (
    <Section title="Buyer / Seller Information">
      {/* Buyer section */}
      {(isBuyer || isDual || closingType === 'buyer') && (
        <>
          <p className="text-sm font-semibold text-foreground">Buyer Information</p>
          <Grid3>
            <FormField control={form.control} name="buyerName" render={({ field }) => (
              <FormItem><FormLabel>Buyer Name</FormLabel><FormControl><Input placeholder="First Last" {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="buyerEmail" render={({ field }) => (
              <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="buyer@email.com" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="buyerPhone" render={({ field }) => (
              <FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" placeholder="(337) 555-1234" {...field} /></FormControl></FormItem>
            )} />
          </Grid3>
          {/* Buyer 2 */}
          {showBuyer2 ? (
            <>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-muted-foreground">Second Buyer</p>
                <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => { setShowBuyer2(false); setShowBuyer3(false); setShowBuyer4(false); form.setValue('buyer2Name', ''); form.setValue('buyer2Email', ''); form.setValue('buyer2Phone', ''); }}><Trash2 className="h-3 w-3 mr-1" />Remove</Button>
              </div>
              <Grid3>
                <FormField control={form.control} name="buyer2Name" render={({ field }) => (<FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="buyer2Email" render={({ field }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="buyer2Phone" render={({ field }) => (<FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" placeholder="Optional" {...field} /></FormControl></FormItem>)} />
              </Grid3>
            </>
          ) : (
            <Button type="button" variant="outline" size="sm" className="mt-1 text-xs" onClick={() => setShowBuyer2(true)}><PlusCircle className="h-3 w-3 mr-1" />Add 2nd Buyer</Button>
          )}
          {/* Buyer 3 */}
          {showBuyer2 && (showBuyer3 ? (
            <>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-muted-foreground">Third Buyer</p>
                <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => { setShowBuyer3(false); setShowBuyer4(false); form.setValue('buyer3Name', ''); form.setValue('buyer3Email', ''); form.setValue('buyer3Phone', ''); }}><Trash2 className="h-3 w-3 mr-1" />Remove</Button>
              </div>
              <Grid3>
                <FormField control={form.control} name="buyer3Name" render={({ field }) => (<FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="buyer3Email" render={({ field }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="buyer3Phone" render={({ field }) => (<FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" placeholder="Optional" {...field} /></FormControl></FormItem>)} />
              </Grid3>
            </>
          ) : (
            <Button type="button" variant="outline" size="sm" className="mt-1 text-xs" onClick={() => setShowBuyer3(true)}><PlusCircle className="h-3 w-3 mr-1" />Add 3rd Buyer</Button>
          ))}
          {/* Buyer 4 */}
          {showBuyer3 && (showBuyer4 ? (
            <>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-muted-foreground">Fourth Buyer</p>
                <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => { setShowBuyer4(false); form.setValue('buyer4Name', ''); form.setValue('buyer4Email', ''); form.setValue('buyer4Phone', ''); }}><Trash2 className="h-3 w-3 mr-1" />Remove</Button>
              </div>
              <Grid3>
                <FormField control={form.control} name="buyer4Name" render={({ field }) => (<FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="buyer4Email" render={({ field }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="buyer4Phone" render={({ field }) => (<FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" placeholder="Optional" {...field} /></FormControl></FormItem>)} />
              </Grid3>
            </>
          ) : (
            <Button type="button" variant="outline" size="sm" className="mt-1 text-xs" onClick={() => setShowBuyer4(true)}><PlusCircle className="h-3 w-3 mr-1" />Add 4th Buyer</Button>
          ))}
        </>
      )}

      {/* Seller section */}
      {(isSeller || isDual || closingType === 'listing') && (
        <>
          {(isBuyer || isDual || closingType === 'buyer') && <Separator />}
          <p className="text-sm font-semibold text-foreground">Seller Information</p>
          <Grid3>
            <FormField control={form.control} name="sellerName" render={({ field }) => (
              <FormItem><FormLabel>Seller Name</FormLabel><FormControl><Input placeholder="First Last" {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="sellerEmail" render={({ field }) => (
              <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="seller@email.com" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="sellerPhone" render={({ field }) => (
              <FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" placeholder="(337) 555-5678" {...field} /></FormControl></FormItem>
            )} />
          </Grid3>
          {/* Seller 2 */}
          {showSeller2 ? (
            <>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-muted-foreground">Second Seller</p>
                <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => { setShowSeller2(false); setShowSeller3(false); setShowSeller4(false); form.setValue('seller2Name', ''); form.setValue('seller2Email', ''); form.setValue('seller2Phone', ''); }}><Trash2 className="h-3 w-3 mr-1" />Remove</Button>
              </div>
              <Grid3>
                <FormField control={form.control} name="seller2Name" render={({ field }) => (<FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="seller2Email" render={({ field }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="seller2Phone" render={({ field }) => (<FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" placeholder="Optional" {...field} /></FormControl></FormItem>)} />
              </Grid3>
            </>
          ) : (
            <Button type="button" variant="outline" size="sm" className="mt-1 text-xs" onClick={() => setShowSeller2(true)}><PlusCircle className="h-3 w-3 mr-1" />Add 2nd Seller</Button>
          )}
          {/* Seller 3 */}
          {showSeller2 && (showSeller3 ? (
            <>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-muted-foreground">Third Seller</p>
                <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => { setShowSeller3(false); setShowSeller4(false); form.setValue('seller3Name', ''); form.setValue('seller3Email', ''); form.setValue('seller3Phone', ''); }}><Trash2 className="h-3 w-3 mr-1" />Remove</Button>
              </div>
              <Grid3>
                <FormField control={form.control} name="seller3Name" render={({ field }) => (<FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="seller3Email" render={({ field }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="seller3Phone" render={({ field }) => (<FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" placeholder="Optional" {...field} /></FormControl></FormItem>)} />
              </Grid3>
            </>
          ) : (
            <Button type="button" variant="outline" size="sm" className="mt-1 text-xs" onClick={() => setShowSeller3(true)}><PlusCircle className="h-3 w-3 mr-1" />Add 3rd Seller</Button>
          ))}
          {/* Seller 4 */}
          {showSeller3 && (showSeller4 ? (
            <>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-muted-foreground">Fourth Seller</p>
                <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => { setShowSeller4(false); form.setValue('seller4Name', ''); form.setValue('seller4Email', ''); form.setValue('seller4Phone', ''); }}><Trash2 className="h-3 w-3 mr-1" />Remove</Button>
              </div>
              <Grid3>
                <FormField control={form.control} name="seller4Name" render={({ field }) => (<FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="seller4Email" render={({ field }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="seller4Phone" render={({ field }) => (<FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" placeholder="Optional" {...field} /></FormControl></FormItem>)} />
              </Grid3>
            </>
          ) : (
            <Button type="button" variant="outline" size="sm" className="mt-1 text-xs" onClick={() => setShowSeller4(true)}><PlusCircle className="h-3 w-3 mr-1" />Add 4th Seller</Button>
          ))}
          <FormField control={form.control} name="clientNewAddress" render={({ field }) => (
            <FormItem>
              <FormLabel>Client New Address</FormLabel>
              <FormDescription>Where the seller is moving to (for mailers)</FormDescription>
              <FormControl><Input placeholder="New address after closing" {...field} /></FormControl>
            </FormItem>
          )} />
        </>
      )}

      {/* Other Agent */}
      <Separator />
      <p className="text-sm font-semibold text-foreground">Cooperating Agent</p>
      <Grid2>
        <FormField control={form.control} name="otherAgentName" render={({ field }) => (
          <FormItem><FormLabel>Agent Name</FormLabel><FormControl><Input placeholder="Cooperating agent name" {...field} /></FormControl></FormItem>
        )} />
        <FormField control={form.control} name="otherAgentBrokerage" render={({ field }) => (
          <FormItem><FormLabel>Brokerage</FormLabel><FormControl><Input placeholder="Brokerage name" {...field} /></FormControl></FormItem>
        )} />
        <FormField control={form.control} name="otherAgentEmail" render={({ field }) => (
          <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="agent@brokerage.com" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="otherAgentPhone" render={({ field }) => (
          <FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" placeholder="(337) 555-9999" {...field} /></FormControl></FormItem>
        )} />
      </Grid2>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Lender / Mortgage
// ─────────────────────────────────────────────────────────────────────────────
export function LenderSection({ form }: TransactionFormSectionProps) {
  return (
    <Section title="Lender / Mortgage">
      <Grid2>
        <FormField control={form.control} name="mortgageCompany" render={({ field }) => (
          <FormItem><FormLabel>Mortgage Company</FormLabel><FormControl><Input placeholder="First Federal Bank" {...field} /></FormControl></FormItem>
        )} />
        <FormField control={form.control} name="loanOfficer" render={({ field }) => (
          <FormItem><FormLabel>Loan Officer Name</FormLabel><FormControl><Input placeholder="John Smith" {...field} /></FormControl></FormItem>
        )} />
        <FormField control={form.control} name="loanOfficerEmail" render={({ field }) => (
          <FormItem><FormLabel>Loan Officer Email</FormLabel><FormControl><Input type="email" placeholder="lo@bank.com" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="loanOfficerPhone" render={({ field }) => (
          <FormItem><FormLabel>Loan Officer Phone</FormLabel><FormControl><Input type="tel" placeholder="(337) 555-9012" {...field} /></FormControl></FormItem>
        )} />
      </Grid2>
      <div className="max-w-xs">
        <FormField control={form.control} name="lenderOffice" render={({ field }) => (
          <FormItem><FormLabel>Office #</FormLabel><FormControl><Input placeholder="Office number" {...field} /></FormControl></FormItem>
        )} />
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Title Company
// ─────────────────────────────────────────────────────────────────────────────
export function TitleSection({ form }: TransactionFormSectionProps) {
  return (
    <Section title="Title Company">
      <Grid2>
        <FormField control={form.control} name="titleCompany" render={({ field }) => (
          <FormItem><FormLabel>Title Company</FormLabel><FormControl><Input placeholder="Acadian Title" {...field} /></FormControl></FormItem>
        )} />
        <FormField control={form.control} name="titleOfficer" render={({ field }) => (
          <FormItem><FormLabel>Title Officer Name</FormLabel><FormControl><Input placeholder="Jane Doe" {...field} /></FormControl></FormItem>
        )} />
        <FormField control={form.control} name="titleOfficerEmail" render={({ field }) => (
          <FormItem><FormLabel>Title Officer Email</FormLabel><FormControl><Input type="email" placeholder="closer@title.com" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="titleOfficerPhone" render={({ field }) => (
          <FormItem><FormLabel>Title Officer Phone</FormLabel><FormControl><Input type="tel" placeholder="(337) 555-3456" {...field} /></FormControl></FormItem>
        )} />
      </Grid2>
      <Grid2>
        <FormField control={form.control} name="titleAttorney" render={({ field }) => (
          <FormItem><FormLabel>Attorney</FormLabel><FormControl><Input placeholder="Attorney name" {...field} /></FormControl></FormItem>
        )} />
        <FormField control={form.control} name="titleOffice" render={({ field }) => (
          <FormItem><FormLabel>Office #</FormLabel><FormControl><Input placeholder="Office number" {...field} /></FormControl></FormItem>
        )} />
      </Grid2>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Financial Details
// ─────────────────────────────────────────────────────────────────────────────
export function FinancialDetailsSection({ form }: TransactionFormSectionProps) {
  const depositHolder = form.watch('depositHolder');
  return (
    <Section title="Financial Details">
      <Grid2>
        <FormField control={form.control} name="earnestMoney" render={({ field }) => (
          <FormItem>
            <FormLabel>Earnest Money / Deposit ($)</FormLabel>
            <FormControl>
              <CurrencyInput value={field.value as any} onChange={(val) => field.onChange(val)} placeholder="0" />
            </FormControl>
          </FormItem>
        )} />
        <FormField control={form.control} name="depositHolder" render={({ field }) => (
          <FormItem>
            <FormLabel>Who is holding the deposit?</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
              <SelectContent>
                <SelectItem value="listing_broker">Listing Broker</SelectItem>
                <SelectItem value="selling_broker">Selling Broker</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </FormItem>
        )} />
      </Grid2>
      {depositHolder === 'other' && (
        <div className="max-w-xs">
          <FormField control={form.control} name="depositHolderOther" render={({ field }) => (
            <FormItem><FormLabel>Specify deposit holder</FormLabel><FormControl><Input placeholder="Name or company..." {...field} /></FormControl></FormItem>
          )} />
        </div>
      )}
    </Section>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Referrals
// ─────────────────────────────────────────────────────────────────────────────
export function ReferralSection({ form }: TransactionFormSectionProps) {
  const hasOutbound = form.watch('hasOutboundReferral');
  const hasInbound = form.watch('hasInboundReferral');
  const referralPct = Number(form.watch('outboundReferralPercent')) || 0;
  const gci = Number(form.watch('gci')) || 0;

  return (
    <Section title="Referrals">
      {/* Outbound Referral */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="hasOutboundReferral"
            checked={!!hasOutbound}
            onChange={e => form.setValue('hasOutboundReferral', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary"
          />
          <label htmlFor="hasOutboundReferral" className="text-sm font-medium cursor-pointer">
            Outbound Referral (referring this client to another agent/broker)
          </label>
        </div>
        {hasOutbound && (
          <div className="pl-7 space-y-4">
            <Grid2>
              <FormField control={form.control} name="outboundReferralPercent" render={({ field }) => (
                <FormItem>
                  <FormLabel>Referral %</FormLabel>
                  <FormControl>
                    <PercentInput value={field.value as any} placeholder="e.g. 25" onChange={(e) => {
                      field.onChange(e);
                      const pct = Number(e.target.value) || 0;
                      if (pct > 0 && gci > 0) {
                        form.setValue('outboundReferralFeeDollar', Math.round(gci * (pct / 100) * 100) / 100 as any);
                      }
                    }} />
                  </FormControl>
                  <FormDescription className="text-xs">Percentage of GCI paid to the outside broker</FormDescription>
                </FormItem>
              )} />
              <FormField control={form.control} name="outboundReferralFeeDollar" render={({ field }) => (
                <FormItem>
                  <FormLabel>Referral Dollar Amount</FormLabel>
                  <FormControl><Input type="number" min={0} step={0.01} placeholder="Auto-calculated" {...field} /></FormControl>
                  <FormDescription className="text-xs">Auto-calculated from % above. Override if needed.</FormDescription>
                </FormItem>
              )} />
            </Grid2>
            <Grid2>
              <FormField control={form.control} name="outboundReferralBrokerage" render={({ field }) => (
                <FormItem><FormLabel>Outside Broker / Company Name</FormLabel><FormControl><Input placeholder="e.g. Keller Williams" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="outboundReferralAgentName" render={({ field }) => (
                <FormItem><FormLabel>Referring Agent / Contact Name</FormLabel><FormControl><Input placeholder="e.g. John Smith" {...field} /></FormControl></FormItem>
              )} />
            </Grid2>
            {referralPct > 0 && gci > 0 && (() => {
              const dollar = Number(form.watch('outboundReferralFeeDollar')) || Math.round(gci * (referralPct / 100) * 100) / 100;
              const net = gci - dollar;
              return (
                <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1 dark:bg-amber-950/20 dark:border-amber-700 dark:text-amber-300">
                  <p className="font-semibold">Referral Fee Summary</p>
                  <p>Gross GCI: <strong>${gci.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>
                  <p>Referral Fee ({referralPct}%): <strong>-${dollar.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>
                  <p>Net to Agent/Broker Split: <strong>${net.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      <Separator />

      {/* Inbound Referral */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="hasInboundReferral"
            checked={!!hasInbound}
            onChange={e => form.setValue('hasInboundReferral', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary"
          />
          <label htmlFor="hasInboundReferral" className="text-sm font-medium cursor-pointer">
            Inbound Referral (client was referred to you by another agent/broker)
          </label>
        </div>
        {hasInbound && (
          <div className="pl-7 space-y-4">
            <Grid2>
              <FormField control={form.control} name="inboundReferralAgentName" render={({ field }) => (
                <FormItem><FormLabel>Referring Agent Name</FormLabel><FormControl><Input placeholder="Agent who referred the client" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="inboundReferralBrokerage" render={({ field }) => (
                <FormItem><FormLabel>Referring Brokerage</FormLabel><FormControl><Input placeholder="Their brokerage name" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="inboundReferralFeePercent" render={({ field }) => (
                <FormItem><FormLabel>Referral Fee %</FormLabel><FormControl><PercentInput value={field.value as any} placeholder="e.g. 25" onChange={field.onChange} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="inboundReferralFeeDollar" render={({ field }) => (
                <FormItem><FormLabel>Referral Fee $ Amount</FormLabel><FormControl><Input type="number" min={0} step={0.01} placeholder="Auto-calculated" {...field} /></FormControl></FormItem>
              )} />
            </Grid2>
          </div>
        )}
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Additional Info (warranty, compliance fee, occupancy, shortage)
// ─────────────────────────────────────────────────────────────────────────────
export function AdditionalInfoSection({ form }: TransactionFormSectionProps) {
  const warrantyAtClosing = form.watch('warrantyAtClosing');
  const txComplianceFee = form.watch('txComplianceFee');
  const occupancyAgreement = form.watch('occupancyAgreement');
  const shortageInCommission = form.watch('shortageInCommission');

  return (
    <Section title="Additional Info">
      {/* Warranty */}
      <FormField control={form.control} name="warrantyAtClosing" render={({ field }) => (
        <FormItem>
          <FormLabel>Warranty at Closing?</FormLabel>
          <Select onValueChange={field.onChange} value={field.value}>
            <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
            <SelectContent>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </FormItem>
      )} />
      {warrantyAtClosing === 'yes' && (
        <Grid2>
          <FormField control={form.control} name="warrantyAmount" render={({ field }) => (
            <FormItem><FormLabel>Warranty Amount ($)</FormLabel><FormControl><CurrencyInput value={field.value as any} onChange={(val) => field.onChange(val)} placeholder="0" /></FormControl></FormItem>
          )} />
          <FormField control={form.control} name="warrantyPaidBy" render={({ field }) => (
            <FormItem>
              <FormLabel>Paid By</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="buyer">Buyer</SelectItem>
                  <SelectItem value="seller">Seller</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )} />
        </Grid2>
      )}

      <Separator />

      {/* Transaction Compliance Fee */}
      <FormField control={form.control} name="txComplianceFee" render={({ field }) => (
        <FormItem>
          <FormLabel>Transaction Compliance Fee?</FormLabel>
          <Select onValueChange={field.onChange} value={field.value}>
            <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
            <SelectContent>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </FormItem>
      )} />
      {txComplianceFee === 'yes' && (
        <Grid2>
          <FormField control={form.control} name="txComplianceFeeAmount" render={({ field }) => (
            <FormItem><FormLabel>Fee Amount ($)</FormLabel><FormControl><CurrencyInput value={field.value as any} onChange={(val) => field.onChange(val)} placeholder="0" /></FormControl></FormItem>
          )} />
          <FormField control={form.control} name="txComplianceFeePaidBy" render={({ field }) => (
            <FormItem>
              <FormLabel>Who is paying for it?</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="buyer">Buyer</SelectItem>
                  <SelectItem value="seller">Seller</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="seller_closing_cost">Take out of Seller Paid Closing Cost</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )} />
        </Grid2>
      )}

      <Separator />

      {/* Occupancy Agreement */}
      <FormField control={form.control} name="occupancyAgreement" render={({ field }) => (
        <FormItem>
          <FormLabel>Occupancy Agreement?</FormLabel>
          <Select onValueChange={field.onChange} value={field.value}>
            <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
            <SelectContent>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </FormItem>
      )} />
      {occupancyAgreement === 'yes' && (
        <FormField control={form.control} name="occupancyDates" render={({ field }) => (
          <FormItem><FormLabel>When does occupancy start &amp; end?</FormLabel><FormControl><Input placeholder="e.g. 3/15/2026 - 4/15/2026" {...field} /></FormControl></FormItem>
        )} />
      )}

      <Separator />

      {/* Shortage in Commission */}
      <FormField control={form.control} name="shortageInCommission" render={({ field }) => (
        <FormItem>
          <FormLabel>Shortage in Commission?</FormLabel>
          <Select onValueChange={field.onChange} value={field.value}>
            <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
            <SelectContent>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </FormItem>
      )} />
      {shortageInCommission === 'yes' && (
        <Grid2>
          <FormField control={form.control} name="shortageAmount" render={({ field }) => (
            <FormItem><FormLabel>How much? ($)</FormLabel><FormControl><CurrencyInput value={field.value as any} onChange={(val) => field.onChange(val)} placeholder="0" /></FormControl></FormItem>
          )} />
          <FormField control={form.control} name="buyerBringToClosing" render={({ field }) => (
            <FormItem><FormLabel>Buyer will bring to closing ($)</FormLabel><FormControl><CurrencyInput value={field.value as any} onChange={(val) => field.onChange(val)} placeholder="0" /></FormControl></FormItem>
          )} />
        </Grid2>
      )}

      <Separator />

      {/* Notes */}
      <FormField control={form.control} name="notes" render={({ field }) => (
        <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea placeholder="Any additional notes..." {...field} /></FormControl></FormItem>
      )} />
      <FormField control={form.control} name="additionalComments" render={({ field }) => (
        <FormItem><FormLabel>Additional Comments</FormLabel><FormControl><Textarea placeholder="Any other comments..." {...field} /></FormControl></FormItem>
      )} />
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Sign Order (listing/dual only)
// ─────────────────────────────────────────────────────────────────────────────
export function SignOrderSection({ form }: TransactionFormSectionProps) {
  const [open, setOpen] = useState(true);
  const signServiceType = form.watch('signServiceType') || '';
  const signAdditionalOptions: string[] = form.watch('signAdditionalOptions') || [];

  const toggleSignAdditionalOption = (opt: string) => {
    if (signAdditionalOptions.includes(opt)) {
      form.setValue('signAdditionalOptions', signAdditionalOptions.filter((o: string) => o !== opt));
    } else {
      form.setValue('signAdditionalOptions', [...signAdditionalOptions, opt]);
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="cursor-pointer select-none py-4" onClick={() => setOpen(!open)}>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Sign Order</CardTitle>
              <CardDescription>Request sign installation, removal, or repair.</CardDescription>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-5 pt-0">
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 p-4 text-sm text-amber-800 dark:text-amber-300">
              <p className="font-semibold mb-1">Sign orders are sent to staff for review.</p>
              <p>Staff will add your personalized QR code or text rider number before forwarding to J Allen / PostMan337. You can also order directly at <a href="https://www.PostMan337.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">PostMan337.com</a>.</p>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Type of Service:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {SIGN_SERVICE_OPTIONS.map((opt) => (
                  <label key={opt} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="radio"
                      name="signServiceType"
                      value={opt}
                      checked={signServiceType === opt}
                      onChange={() => form.setValue('signServiceType', opt)}
                      className="h-4 w-4 border-gray-300 text-primary focus:ring-primary"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Additional Sign Post Options:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SIGN_ADDITIONAL_OPTIONS.map((opt) => (
                  <label key={opt} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={signAdditionalOptions.includes(opt)}
                      onChange={() => toggleSignAdditionalOption(opt)}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    {opt}
                  </label>
                ))}
              </div>
              {(signAdditionalOptions.includes('Text2 Rider') || signAdditionalOptions.includes('Phone# Rider EXT')) && (
                <div className="mt-3 max-w-xs">
                  <FormField control={form.control} name="signRiderExt" render={({ field }) => (
                    <FormItem><FormLabel>Phone# Rider EXT</FormLabel><FormControl><Input placeholder="Extension number..." {...field} /></FormControl></FormItem>
                  )} />
                </div>
              )}
            </div>
            <Grid2>
              <FormField control={form.control} name="signOwnerName" render={({ field }) => (
                <FormItem><FormLabel>Owner Name</FormLabel><FormControl><Input placeholder="Property owner name" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="signRequestedDate" render={({ field }) => (
                <FormItem><FormLabel>Requested Date of Service</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
              )} />
            </Grid2>
            <FormField control={form.control} name="signSpecialRequests" render={({ field }) => (
              <FormItem><FormLabel>Special Requests</FormLabel><FormControl><Textarea placeholder="Any special instructions for the sign company..." {...field} /></FormControl></FormItem>
            )} />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Media Order (listing/dual only)
// ─────────────────────────────────────────────────────────────────────────────
export function MediaOrderSection() {
  return (
    <Card>
      <CardHeader className="py-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Media Order</CardTitle>
            <CardDescription>Order media directly through Media Engage for this listing.</CardDescription>
          </div>
          <span className="text-2xl">📸</span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-5 flex flex-col items-center gap-4 text-center">
          <div>
            <p className="font-semibold text-blue-900 dark:text-blue-200 text-base mb-1">Order Media Through Media Engage</p>
            <p className="text-sm text-blue-700 dark:text-blue-300">All media orders are placed directly through Media Engage. Click below to open their order form. Staff will follow up to confirm scheduling.</p>
          </div>
          <a
            href="https://mediaengagellc.com/order/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-blue-700 hover:bg-blue-800 text-white font-semibold px-6 py-3 text-sm transition-colors"
          >
            📷 Order Media at Media Engage
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: MLS Description (listing/dual only)
// ─────────────────────────────────────────────────────────────────────────────
export function MLSDescriptionSection({ form, user, toast }: TransactionFormSectionProps) {
  const [open, setOpen] = useState(false);
  const [brainDump, setBrainDump] = useState('');
  const [generating, setGenerating] = useState(false);

  const generate = async () => {
    if (!brainDump.trim() || !user) return;
    setGenerating(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/agent/generate-mls-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          brainDump,
          address: form.getValues('address'),
          propertyType: form.getValues('closingType'),
        }),
      });
      const data = await res.json();
      if (data.description) {
        form.setValue('mlsDescription', data.description);
        toast?.({ title: 'Description generated!' });
      } else {
        toast?.({ title: 'Generation failed', description: data.error || 'Please try again.', variant: 'destructive' });
      }
    } catch {
      toast?.({ title: 'Error', description: 'Failed to generate description. Please try again.', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="cursor-pointer select-none py-4" onClick={() => setOpen(!open)}>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">MLS Description</CardTitle>
              <CardDescription>AI-powered MLS description builder.</CardDescription>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            <FormField control={form.control} name="mlsNumber" render={({ field }) => (
              <FormItem className="max-w-xs"><FormLabel>MLS Number</FormLabel><FormControl><Input placeholder="e.g. 24012345" {...field} /></FormControl></FormItem>
            )} />
            <div>
              <label className="text-sm font-medium block mb-1.5">Brain Dump — Features, Area, Benefits</label>
              <Textarea
                placeholder="List features, neighborhood highlights, unique selling points, recent upgrades, lot size, school district, proximity to amenities... anything you want the AI to work with."
                className="min-h-[120px] text-sm"
                value={brainDump}
                onChange={e => setBrainDump(e.target.value)}
              />
            </div>
            <Button type="button" size="sm" className="gap-2" disabled={generating || !brainDump.trim()} onClick={generate}>
              {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</> : '✨ Generate MLS Description'}
            </Button>
            <FormField control={form.control} name="mlsDescription" render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between mb-1.5">
                  <FormLabel className="mb-0">Generated MLS Description</FormLabel>
                  {field.value && (
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                      onClick={() => { navigator.clipboard.writeText(field.value || ''); toast?.({ title: 'Copied to clipboard!' }); }}>
                      📋 Copy
                    </Button>
                  )}
                </div>
                <FormControl>
                  <Textarea placeholder="Your AI-generated description will appear here. You can edit it before copying to MLS." className="min-h-[200px] text-sm" {...field} />
                </FormControl>
                <FormDescription>Review and edit the description as needed. This will be saved with your listing submission.</FormDescription>
              </FormItem>
            )} />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Pre-Listing Inspection (listing/dual only)
// ─────────────────────────────────────────────────────────────────────────────
interface InspectionSectionProps extends TransactionFormSectionProps {
  inspRows: Record<string, InspRowState>;
  updateInspRow: (key: string, patch: Partial<InspRowState>) => void;
  inspVendors: Record<string, InspVendor[]>;
  inspVendorsLoading?: boolean;
  inspectionTypes: string[];
  onToggleType: (label: string) => void;
  sectionTitle?: string;
  fieldPrefix?: string; // 'preListing' or ''
}

export function PreListingInspectionSection({
  form, inspRows, updateInspRow, inspVendors, inspectionTypes, onToggleType, user, toast, transactionId,
}: InspectionSectionProps) {
  const today = new Date().toISOString().split('T')[0];
  const fallbackEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const preListingTcSchedule = form.watch('preListingTcScheduleInspections');

  return (
    <Section title="Pre-Listing Inspections" description="Optional: Order inspections before the listing goes live. Leave blank if not applicable.">
      <Grid2>
        <FormField control={form.control} name="preListingInspectionOrdered" render={({ field }) => (
          <FormItem>
            <FormLabel>Pre-Listing Inspection Ordered?</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
              <SelectContent>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </FormItem>
        )} />
        <FormField control={form.control} name="preListingTargetInspectionDate" render={({ field }) => (
          <FormItem><FormLabel>Target Inspection Date</FormLabel><FormControl><Input type="date" {...field}
            onChange={e => {
              field.onChange(e);
              const newDate = e.target.value;
              if (newDate) {
                for (const { key } of INSP_TYPES) {
                  const row = inspRows[key];
                  if (row && !row.sent) updateInspRow(key, { preferredDate: newDate, fallbackDateStart: today, fallbackDateEnd: fallbackEnd });
                }
              }
            }}
          /></FormControl></FormItem>
        )} />
      </Grid2>
      <FormField control={form.control} name="preListingTcScheduleInspections" render={({ field }) => (
        <FormItem>
          <FormLabel>Pre-Listing Inspection Scheduling Status</FormLabel>
          <Select onValueChange={field.onChange} value={field.value}>
            <FormControl><SelectTrigger><SelectValue placeholder="Select status..." /></SelectTrigger></FormControl>
            <SelectContent>
              <SelectItem value="already_scheduled">✅ Already Scheduled — I contacted the inspector</SelectItem>
              <SelectItem value="yes">📋 TC / Staff to Schedule</SelectItem>
              <SelectItem value="other">📝 Other / Notes</SelectItem>
            </SelectContent>
          </Select>
        </FormItem>
      )} />
      {preListingTcSchedule === 'other' && (
        <FormField control={form.control} name="preListingTcScheduleInspectionsOther" render={({ field }) => (
          <FormItem><FormLabel>Please specify</FormLabel><FormControl><Input placeholder="Describe what you need..." {...field} /></FormControl></FormItem>
        )} />
      )}
      {/* Per-type inspector rows */}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground mb-2">Inspection Types</p>
        <p className="text-xs text-muted-foreground mb-3">Check each inspection needed. Each row expands to assign an inspector and send a request.</p>
        {INSP_TYPES.map(({ key, label }) => {
          const isChecked = inspectionTypes.includes(label);
          const row = inspRows[key] || makeDefaultInspRow();
          const vendors = inspVendors[key] || [];
          const generalVendor = inspVendors['inspector_general']?.[0];
          const generalVendorId = inspRows['inspector_general']?.vendorId;

          return (
            <div key={key} className={`rounded-lg border transition-colors ${isChecked ? 'border-primary/30 bg-primary/5' : 'border-border bg-background'}`}>
              <label className="flex items-center gap-3 px-4 py-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => onToggleType(label)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span className="text-sm font-medium flex-1">{label}</span>
                {row.sent && <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Sent</Badge>}
                {isChecked && !row.sent && <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </label>
              {isChecked && (
                <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Inspector</label>
                      <select value={row.vendorId} onChange={e => updateInspRow(key, { vendorId: e.target.value })}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                        <option value="">— Select inspector —</option>
                        {key !== 'inspector_general' && (
                          <option value="USE_GENERAL">{generalVendor ? `Use General Inspector (${generalVendor.name})` : 'Use General Inspector'}</option>
                        )}
                        {vendors.map(v => <option key={v.id} value={v.id}>{v.name}{v.company ? ` — ${v.company}` : ''}</option>)}
                        {vendors.length === 0 && <option disabled value="">No inspectors added yet</option>}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Send To</label>
                      <select value={row.sendMode} onChange={e => updateInspRow(key, { sendMode: e.target.value as 'selected' | 'all' })}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                        <option value="selected">Selected inspector only</option>
                        <option value="all">All {label} inspectors</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Preferred Date</label>
                      <Input type="date" value={row.preferredDate} min={today}
                        onChange={e => {
                          updateInspRow(key, { preferredDate: e.target.value });
                          if (key === 'inspector_general' && e.target.value) {
                            for (const t of INSP_TYPES) {
                              if (t.key !== 'inspector_general' && !inspRows[t.key]?.sent) {
                                updateInspRow(t.key, { preferredDate: e.target.value });
                              }
                            }
                          }
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Time Start</label>
                      <Input type="time" value={row.preferredTimeStart} onChange={e => updateInspRow(key, { preferredTimeStart: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Time End</label>
                      <Input type="time" value={row.preferredTimeEnd} onChange={e => updateInspRow(key, { preferredTimeEnd: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Available From</label>
                      <Input type="date" value={row.fallbackDateStart || today} onChange={e => updateInspRow(key, { fallbackDateStart: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Available Until</label>
                      <Input type="date" value={row.fallbackDateEnd || fallbackEnd} onChange={e => updateInspRow(key, { fallbackDateEnd: e.target.value })} />
                    </div>
                  </div>
                  {!row.sent && user && (
                    <div className="flex justify-end">
                      <Button type="button" size="sm"
                        disabled={row.sending || (!row.vendorId && row.sendMode === 'selected')}
                        onClick={async () => {
                          updateInspRow(key, { sending: true });
                          try {
                            const token = await user.getIdToken();
                            const formVals = form.getValues();
                            const effectiveVendorId = row.vendorId === 'USE_GENERAL' ? generalVendorId : row.vendorId;
                            const res = await fetch('/api/agent/inspection-request', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                              body: JSON.stringify({
                                transactionId: transactionId || null,
                                transactionType: 'listing',
                                inspectionCategory: key,
                                vendorId: effectiveVendorId || undefined,
                                sendMode: row.sendMode,
                                preferredDate: row.preferredDate || today,
                                preferredTimeStart: row.preferredTimeStart,
                                preferredTimeEnd: row.preferredTimeEnd,
                                fallbackDateStart: row.fallbackDateStart || today,
                                fallbackDateEnd: row.fallbackDateEnd || fallbackEnd,
                                propertyAddress: formVals.address || '',
                                clientName: formVals.sellerName || '',
                                clientPhone: formVals.sellerPhone || '',
                                clientEmail: formVals.sellerEmail || '',
                                agentName: formVals.agentDisplayName || '',
                                agentPhone: '',
                                agentEmail: user.email || '',
                                sqft: '',
                                accessNotes: formVals.showingAccessNotes || '',
                              }),
                            });
                            const data = await res.json();
                            if (data.ok) {
                              updateInspRow(key, { sent: true, sending: false });
                              toast?.({ title: 'Request sent!', description: `Inspection request sent to ${data.vendorCount} inspector(s).` });
                            } else {
                              updateInspRow(key, { sending: false });
                              toast?.({ title: 'Error', description: data.error || 'Failed to send request', variant: 'destructive' });
                            }
                          } catch (err: any) {
                            updateInspRow(key, { sending: false });
                            toast?.({ title: 'Error', description: err.message, variant: 'destructive' });
                          }
                        }}
                      >
                        {row.sending ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Sending...</> : <><Send className="h-3 w-3 mr-1" />Send Request</>}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Buyer Inspection (buyer/dual only)
// ─────────────────────────────────────────────────────────────────────────────
export function BuyerInspectionSection({
  form, inspRows, updateInspRow, inspVendors, inspectionTypes, onToggleType, user, toast, transactionId,
}: InspectionSectionProps) {
  const today = new Date().toISOString().split('T')[0];
  const fallbackEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const inspectionOrdered = form.watch('inspectionOrdered');
  const tcSchedule = form.watch('tcScheduleInspections');

  return (
    <Section title="Inspections">
      <Grid2>
        <FormField control={form.control} name="inspectionOrdered" render={({ field }) => (
          <FormItem>
            <FormLabel>Inspection Ordered?</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
              <SelectContent>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </FormItem>
        )} />
        <FormField control={form.control} name="targetInspectionDate" render={({ field }) => (
          <FormItem><FormLabel>Target Inspection Date</FormLabel><FormControl><Input type="date" {...field}
            onChange={e => {
              field.onChange(e);
              const newDate = e.target.value;
              if (newDate) {
                for (const { key } of INSP_TYPES) {
                  const row = inspRows[key];
                  if (row && !row.sent) updateInspRow(key, { preferredDate: newDate, fallbackDateStart: today, fallbackDateEnd: fallbackEnd });
                }
              }
            }}
          /></FormControl></FormItem>
        )} />
      </Grid2>
      <FormField control={form.control} name="tcScheduleInspections" render={({ field }) => (
        <FormItem>
          <FormLabel>Inspection Scheduling Status</FormLabel>
          <Select onValueChange={field.onChange} value={field.value}>
            <FormControl><SelectTrigger><SelectValue placeholder="Select status..." /></SelectTrigger></FormControl>
            <SelectContent>
              <SelectItem value="already_scheduled">✅ Already Scheduled — I contacted the inspector</SelectItem>
              <SelectItem value="yes">📋 TC / Staff to Schedule</SelectItem>
              <SelectItem value="other">📝 Other / Notes</SelectItem>
            </SelectContent>
          </Select>
        </FormItem>
      )} />
      {tcSchedule === 'other' && (
        <FormField control={form.control} name="tcScheduleInspectionsOther" render={({ field }) => (
          <FormItem><FormLabel>Please specify</FormLabel><FormControl><Input placeholder="Describe what you need..." {...field} /></FormControl></FormItem>
        )} />
      )}
      {/* Per-type inspector rows */}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground mb-2">Inspection Types</p>
        <p className="text-xs text-muted-foreground mb-3">Check each inspection needed. Each row expands to assign an inspector and send a request.</p>
        {INSP_TYPES.map(({ key, label }) => {
          const isChecked = inspectionTypes.includes(label);
          const row = inspRows[key] || makeDefaultInspRow();
          const vendors = inspVendors[key] || [];
          const generalVendor = inspVendors['inspector_general']?.[0];
          const generalVendorId = inspRows['inspector_general']?.vendorId;

          return (
            <div key={key} className={`rounded-lg border transition-colors ${isChecked ? 'border-primary/30 bg-primary/5' : 'border-border bg-background'}`}>
              <label className="flex items-center gap-3 px-4 py-3 cursor-pointer">
                <input type="checkbox" checked={isChecked} onChange={() => onToggleType(label)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
                <span className="text-sm font-medium flex-1">{label}</span>
                {row.sent && <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Sent</Badge>}
                {isChecked && !row.sent && <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </label>
              {isChecked && (
                <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Inspector</label>
                      <select value={row.vendorId} onChange={e => updateInspRow(key, { vendorId: e.target.value })}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                        <option value="">— Select inspector —</option>
                        {key !== 'inspector_general' && (
                          <option value="USE_GENERAL">{generalVendor ? `Use General Inspector (${generalVendor.name})` : 'Use General Inspector'}</option>
                        )}
                        {vendors.map(v => <option key={v.id} value={v.id}>{v.name}{v.company ? ` — ${v.company}` : ''}</option>)}
                        {vendors.length === 0 && <option disabled value="">No inspectors added yet</option>}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Send To</label>
                      <select value={row.sendMode} onChange={e => updateInspRow(key, { sendMode: e.target.value as 'selected' | 'all' })}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                        <option value="selected">Selected inspector only</option>
                        <option value="all">All {label} inspectors</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Preferred Date</label>
                      <Input type="date" value={row.preferredDate} min={today}
                        onChange={e => {
                          updateInspRow(key, { preferredDate: e.target.value });
                          if (key === 'inspector_general' && e.target.value) {
                            for (const t of INSP_TYPES) {
                              if (t.key !== 'inspector_general' && !inspRows[t.key]?.sent) {
                                updateInspRow(t.key, { preferredDate: e.target.value });
                              }
                            }
                          }
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Time Start</label>
                      <Input type="time" value={row.preferredTimeStart} onChange={e => updateInspRow(key, { preferredTimeStart: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Time End</label>
                      <Input type="time" value={row.preferredTimeEnd} onChange={e => updateInspRow(key, { preferredTimeEnd: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Available From</label>
                      <Input type="date" value={row.fallbackDateStart || today} onChange={e => updateInspRow(key, { fallbackDateStart: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Available Until</label>
                      <Input type="date" value={row.fallbackDateEnd || fallbackEnd} onChange={e => updateInspRow(key, { fallbackDateEnd: e.target.value })} />
                    </div>
                  </div>
                  {!row.sent && user && (
                    <div className="flex justify-end">
                      <Button type="button" size="sm"
                        disabled={row.sending || (!row.vendorId && row.sendMode === 'selected')}
                        onClick={async () => {
                          updateInspRow(key, { sending: true });
                          try {
                            const token = await user.getIdToken();
                            const formVals = form.getValues();
                            const effectiveVendorId = row.vendorId === 'USE_GENERAL' ? generalVendorId : row.vendorId;
                            const res = await fetch('/api/agent/inspection-request', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                              body: JSON.stringify({
                                transactionId: transactionId || null,
                                transactionType: 'buyer',
                                inspectionCategory: key,
                                vendorId: effectiveVendorId || undefined,
                                sendMode: row.sendMode,
                                preferredDate: row.preferredDate,
                                preferredTimeStart: row.preferredTimeStart,
                                preferredTimeEnd: row.preferredTimeEnd,
                                fallbackDateStart: row.fallbackDateStart || today,
                                fallbackDateEnd: row.fallbackDateEnd || fallbackEnd,
                                propertyAddress: formVals.address || '',
                                clientName: formVals.buyerName || '',
                                clientPhone: formVals.buyerPhone || '',
                                clientEmail: formVals.buyerEmail || '',
                                agentName: formVals.agentDisplayName || '',
                                agentPhone: '',
                                agentEmail: user.email || '',
                                sqft: '',
                                accessNotes: formVals.showingAccessNotes || '',
                              }),
                            });
                            const responseText = await res.text();
                            let data: any;
                            try { data = JSON.parse(responseText); }
                            catch { throw new Error(`Inspection request service returned ${res.status} instead of a valid response. Please try again or contact support.`); }
                            if (data.ok) {
                              updateInspRow(key, { sent: true, sending: false });
                              toast?.({ title: 'Request sent!', description: `Inspection request sent to ${data.vendorCount} inspector(s).` });
                            } else {
                              updateInspRow(key, { sending: false });
                              toast?.({ title: 'Error', description: data.error || 'Failed to send request', variant: 'destructive' });
                            }
                          } catch (err: any) {
                            updateInspRow(key, { sending: false });
                            toast?.({ title: 'Error', description: err.message, variant: 'destructive' });
                          }
                        }}
                      >
                        {row.sending ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Sending...</> : <><Send className="h-3 w-3 mr-1" />Send Request</>}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Staging Consult (listing/dual only)
// ─────────────────────────────────────────────────────────────────────────────
interface StagingVendor { id: string; name: string; company?: string | null; }

interface StagingSectionProps extends TransactionFormSectionProps {
  stagers?: StagingVendor[];
  stagersLoading?: boolean;
}

export function StagingSection({ form, user, toast, transactionId, stagers = [], stagersLoading = false }: StagingSectionProps) {
  const [open, setOpen] = useState(false);
  const [stagingData, setStagingData] = useState({
    stagerId: '',
    paymentMethod: '',
    serviceType: '',
    coordinateWith: '',
    preferredDate: '',
    preferredTime: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSendRequest = async () => {
    if (!user || !stagingData.stagerId) return;
    setSubmitting(true);
    setError('');
    try {
      const token = await user.getIdToken();
      const formVals = form.getValues();
      const res = await fetch('/api/agent/staging-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          transactionId: transactionId || null,
          stagerId: stagingData.stagerId,
          paymentMethod: stagingData.paymentMethod,
          serviceType: stagingData.serviceType,
          coordinateWith: stagingData.coordinateWith,
          preferredDate: stagingData.preferredDate,
          preferredTime: stagingData.preferredTime,
          notes: stagingData.notes,
          propertyAddress: formVals.address || '',
          clientName: formVals.sellerName || '',
          clientPhone: formVals.sellerPhone || '',
          clientEmail: formVals.sellerEmail || '',
          agentName: formVals.agentDisplayName || '',
          agentEmail: user.email || '',
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSent(true);
        toast?.({ title: 'Staging request sent!' });
      } else {
        setError(data.error || 'Failed to send request');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="cursor-pointer select-none py-4" onClick={() => setOpen(!open)}>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Staging Consult</CardTitle>
              <CardDescription>Request a staging consultation for this listing.</CardDescription>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-5 pt-0">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}
            {sent ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Staging request sent successfully!
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="text-sm font-medium">Select Stager</label>
                    <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={stagingData.stagerId} onChange={e => setStagingData(d => ({ ...d, stagerId: e.target.value }))}>
                      <option value="">-- Choose a stager --</option>
                      {stagersLoading ? <option disabled>Loading stagers...</option> : stagers.map(s => (
                        <option key={s.id} value={s.id}>{s.name}{s.company ? ` — ${s.company}` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Payment Method</label>
                    <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={stagingData.paymentMethod} onChange={e => setStagingData(d => ({ ...d, paymentMethod: e.target.value }))}>
                      <option value="">-- Select payment method --</option>
                      <option value="Prepaid Keaty Listing Package">Prepaid Keaty Listing Package (Keaty invoiced)</option>
                      <option value="Agent">Agent pays directly</option>
                      <option value="Seller">Seller pays directly</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="text-sm font-medium">Staging Service Type</label>
                    <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={stagingData.serviceType} onChange={e => setStagingData(d => ({ ...d, serviceType: e.target.value }))}>
                      <option value="">-- Select service type --</option>
                      <option value="Walk & Talk Consultation">Walk &amp; Talk Consultation</option>
                      <option value="Staging Furniture Package">Staging Furniture Package</option>
                      <option value="Accessory Package">Accessory Package</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Stager Should Coordinate With</label>
                    <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={stagingData.coordinateWith} onChange={e => setStagingData(d => ({ ...d, coordinateWith: e.target.value }))}>
                      <option value="">-- Select who to contact --</option>
                      <option value="Seller">Seller</option>
                      <option value="Agent">Agent</option>
                      <option value="TC">Transaction Coordinator (TC)</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="text-sm font-medium">Preferred Consultation Date</label>
                    <Input type="date" value={stagingData.preferredDate} onChange={e => setStagingData(d => ({ ...d, preferredDate: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Preferred Time</label>
                    <Input type="time" value={stagingData.preferredTime} onChange={e => setStagingData(d => ({ ...d, preferredTime: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Notes for Stager</label>
                  <Textarea className="mt-1" placeholder="Any special instructions or notes for the stager..."
                    value={stagingData.notes} onChange={e => setStagingData(d => ({ ...d, notes: e.target.value }))} />
                </div>
                {user && (
                  <div className="flex justify-end">
                    <Button type="button" disabled={submitting || !stagingData.stagerId} onClick={handleSendRequest}>
                      {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</> : <><Send className="h-4 w-4 mr-2" />Send Staging Request</>}
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: ShowingTime Setup (listing/dual only)
// ─────────────────────────────────────────────────────────────────────────────
export function ShowingTimeSection({ form }: TransactionFormSectionProps) {
  const [open, setOpen] = useState(false);
  const showingTimeRequested = form.watch('showingTimeRequested');
  const showingApptHandling: string[] = form.watch('showingApptHandling') || [];
  const showingNotesToAgent: string[] = form.watch('showingNotesToAgent') || [];
  const showingNoSameDayAppts = form.watch('showingNoSameDayAppts');

  const toggleApptHandling = (val: string) => {
    if (showingApptHandling.includes(val)) {
      form.setValue('showingApptHandling', showingApptHandling.filter((v: string) => v !== val));
    } else {
      form.setValue('showingApptHandling', [...showingApptHandling, val]);
    }
  };

  const toggleNotesToAgent = (note: string) => {
    if (showingNotesToAgent.includes(note)) {
      form.setValue('showingNotesToAgent', showingNotesToAgent.filter((n: string) => n !== note));
    } else {
      form.setValue('showingNotesToAgent', [...showingNotesToAgent, note]);
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="cursor-pointer select-none py-4" onClick={() => setOpen(!open)}>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">ShowingTime Setup</CardTitle>
              <CardDescription>Configure showing appointment settings for this listing.</CardDescription>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-5 pt-0">
            <FormField control={form.control} name="showingTimeRequested" render={({ field }) => (
              <FormItem>
                <FormLabel>Request ShowingTime Setup?</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="yes">Yes — Set up ShowingTime for this listing</SelectItem>
                    <SelectItem value="no">No — I will handle showings manually</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )} />

            {showingTimeRequested === 'yes' && (
              <>
                <Grid2>
                  <FormField control={form.control} name="showingStartDate" render={({ field }) => (
                    <FormItem><FormLabel>Showing Start Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="showingEndDate" render={({ field }) => (
                    <FormItem><FormLabel>Showing End Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
                  )} />
                </Grid2>
                <Grid2>
                  <FormField control={form.control} name="showingApptType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Appointment Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="conf_any">Appt. Required — Conf. with ANY</SelectItem>
                          <SelectItem value="conf_all">Appt. Required — Conf. with ALL</SelectItem>
                          <SelectItem value="courtesy_call">Courtesy Call</SelectItem>
                          <SelectItem value="go_show">Go &amp; Show</SelectItem>
                          <SelectItem value="refer_listing">Refer to Listing Agent</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="showingApptOverlaps" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Appointment Overlaps</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="yes_no_inform">Yes — No Need to Inform Showing Agent</SelectItem>
                          <SelectItem value="yes_inform">Yes — Please Inform the Showing Agent</SelectItem>
                          <SelectItem value="no_exclusive">No — Exclusive Showings Only</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                </Grid2>
                <div>
                  <p className="text-sm font-medium mb-2">Appointment Handling:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { value: 'no_appt_center', label: "Don't Allow Appt Center to Take Appts" },
                      { value: 'no_online', label: "Don't Allow Online Scheduling" },
                    ].map((opt) => (
                      <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm">
                        <input type="checkbox" checked={showingApptHandling.includes(opt.value)} onChange={() => toggleApptHandling(opt.value)}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
                <FormField control={form.control} name="showingVirtualPreference" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Virtual Appointment Preference</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="in_person_virtual">In-Person and Virtual Appointments</SelectItem>
                        <SelectItem value="virtual_only">Virtual Appointments Only</SelectItem>
                        <SelectItem value="in_person_only">In-Person Appointments Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <div>
                  <p className="text-sm font-medium mb-1">Advanced Notice:</p>
                  <label className="flex items-center gap-2 cursor-pointer text-sm mb-3">
                    <input type="checkbox" checked={!!showingNoSameDayAppts}
                      onChange={(e) => form.setValue('showingNoSameDayAppts', e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
                    No Same Day Appointments
                  </label>
                  <Grid2>
                    <FormField control={form.control} name="showingLeadTimeRequired" render={({ field }) => (
                      <FormItem><FormLabel>Lead Time Required (minutes)</FormLabel><FormControl><Input type="number" placeholder="e.g. 60" {...field} /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="showingLeadTimeSuggested" render={({ field }) => (
                      <FormItem><FormLabel>Lead Time Suggested (minutes)</FormLabel><FormControl><Input type="number" placeholder="e.g. 120" {...field} /></FormControl></FormItem>
                    )} />
                  </Grid2>
                </div>
                <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                  <p className="text-sm font-semibold">Call Order #1 — Listing Agent (auto-filled from your profile)</p>
                  <Grid2>
                    <FormField control={form.control} name="showingCallOrder2Type" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Call Order #2 — Contact Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="seller">Seller</SelectItem>
                            <SelectItem value="buyer">Buyer</SelectItem>
                            <SelectItem value="other_agent">Other Agent</SelectItem>
                            <SelectItem value="tc">Transaction Coordinator</SelectItem>
                            <SelectItem value="none">None</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="showingCallOrder2Phone" render={({ field }) => (
                      <FormItem><FormLabel>Call Order #2 — Phone</FormLabel><FormControl><Input type="tel" placeholder="(337) 555-0000" {...field} /></FormControl></FormItem>
                    )} />
                  </Grid2>
                  <Grid2>
                    <FormField control={form.control} name="showingCallOrder3Type" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Call Order #3 — Contact Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="seller">Seller</SelectItem>
                            <SelectItem value="buyer">Buyer</SelectItem>
                            <SelectItem value="other_agent">Other Agent</SelectItem>
                            <SelectItem value="tc">Transaction Coordinator</SelectItem>
                            <SelectItem value="none">None</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="showingCallOrder3Phone" render={({ field }) => (
                      <FormItem><FormLabel>Call Order #3 — Phone</FormLabel><FormControl><Input type="tel" placeholder="(337) 555-0000" {...field} /></FormControl></FormItem>
                    )} />
                  </Grid2>
                </div>
                <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                  <p className="text-sm font-semibold">Lockbox Information</p>
                  <Grid2>
                    <FormField control={form.control} name="showingLockboxType" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Lockbox Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="none">No Lockbox</SelectItem>
                            <SelectItem value="combo">Combo</SelectItem>
                            <SelectItem value="supra">Supra</SelectItem>
                            <SelectItem value="sentrilock">SentriLock</SelectItem>
                            <SelectItem value="risco_lb">Risco LB</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="showingLockboxLocation" render={({ field }) => (
                      <FormItem><FormLabel>Lockbox Location</FormLabel><FormControl><Input placeholder="e.g. Front door handle" {...field} /></FormControl></FormItem>
                    )} />
                  </Grid2>
                  <Grid2>
                    <FormField control={form.control} name="showingAccessNotes" render={({ field }) => (
                      <FormItem><FormLabel>Access Notes</FormLabel><FormControl><Input placeholder="e.g. lockbox code, gate code..." {...field} /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="showingAccessDoor" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Door Location</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="front">Front Door</SelectItem>
                            <SelectItem value="back">Back Door</SelectItem>
                            <SelectItem value="side">Side Door</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                  </Grid2>
                </div>
                <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                  <p className="text-sm font-semibold">Alarm Information</p>
                  <Grid3>
                    <FormField control={form.control} name="showingDisarmCode" render={({ field }) => (
                      <FormItem><FormLabel>Disarm Code</FormLabel><FormControl><Input placeholder="Disarm code" {...field} /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="showingArmCode" render={({ field }) => (
                      <FormItem><FormLabel>Arm Code</FormLabel><FormControl><Input placeholder="Arm code" {...field} /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="showingPasscode" render={({ field }) => (
                      <FormItem><FormLabel>Passcode</FormLabel><FormControl><Input placeholder="Passcode" {...field} /></FormControl></FormItem>
                    )} />
                  </Grid3>
                  <FormField control={form.control} name="showingAlarmNotes" render={({ field }) => (
                    <FormItem><FormLabel>Alarm Notes</FormLabel><FormControl><Input placeholder="Additional alarm notes..." {...field} /></FormControl></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="showingNotesToStaff" render={({ field }) => (
                  <FormItem><FormLabel>Notes to Appointment Staff</FormLabel><FormControl><Textarea placeholder="Special instructions for the appointment staff..." {...field} /></FormControl></FormItem>
                )} />
                <div>
                  <p className="text-sm font-medium mb-2">Notes to Showing Agent (check all that apply):</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {SHOWING_NOTES_TO_AGENT_OPTIONS.map((note) => (
                      <label key={note} className="flex items-center gap-2 cursor-pointer text-sm">
                        <input type="checkbox" checked={showingNotesToAgent.includes(note)} onChange={() => toggleNotesToAgent(note)}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
                        {note}
                      </label>
                    ))}
                  </div>
                  <div className="mt-3">
                    <FormField control={form.control} name="showingNotesToAgentOther" render={({ field }) => (
                      <FormItem><FormLabel>Additional Notes to Showing Agent</FormLabel><FormControl><Textarea placeholder="Any other instructions for showing agents..." {...field} /></FormControl></FormItem>
                    )} />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
