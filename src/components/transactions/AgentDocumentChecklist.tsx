'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, ChevronDown, ChevronUp, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChecklistItem {
  label: string;
  mandatory?: boolean;
  conditional?: string; // e.g. "if applicable"
}

interface ChecklistSection {
  title: string;
  items: ChecklistItem[];
}

// ─── Seller Checklist Data ────────────────────────────────────────────────────

const SELLER_CHECKLIST: ChecklistSection[] = [
  {
    title: 'Pre-Listing',
    items: [
      { label: 'Seller Counseling Interview' },
      { label: 'Listing General Information' },
      { label: 'Seller Property Description Form' },
      { label: 'Guideline to Market Value Net Sheet' },
      { label: 'MLS Input Form' },
    ],
  },
  {
    title: 'Mandatory Documents',
    items: [
      { label: 'Customer Information', mandatory: true },
      { label: 'Cancellation Agreement', mandatory: true },
      { label: 'Dual Agency Disclosure', mandatory: true },
      { label: 'Flood Disclosure', mandatory: true },
      { label: 'Lead Base Paint Disclosure', mandatory: true, conditional: 'if applicable' },
      { label: 'Seller Property Disclosure', mandatory: true },
      { label: 'Sewage Treatment Disclosure', mandatory: true, conditional: 'if applicable' },
      { label: 'Exclusive Right to Sell Listing Agreement', mandatory: true },
      { label: 'Keaty Real Estate Listing Package', mandatory: true },
      { label: 'Wire Fraud Form', mandatory: true },
      { label: 'Affiliated Business Disclosure', mandatory: true },
    ],
  },
  {
    title: 'MLS / Active Listing',
    items: [
      { label: 'MLS Coming Soon Notice' },
    ],
  },
  {
    title: 'Once Under Contract',
    items: [
      { label: 'Purchase Agreement' },
      { label: 'Counter(s)' },
      { label: 'Addendums' },
      { label: 'Signed Flood Disclosure' },
      { label: 'Property Disclosure (signed)' },
      { label: 'Lead Base Paint Disclosure (signed)', conditional: 'if applicable' },
      { label: 'Pre-Qualification Letter' },
      { label: 'Copy of Deposit' },
    ],
  },
];

// ─── Buyer Checklist Data ─────────────────────────────────────────────────────

const BUYER_CHECKLIST: ChecklistSection[] = [
  {
    title: 'Pre-Contract',
    items: [
      { label: 'Buyer Counseling Interview' },
    ],
  },
  {
    title: 'Mandatory Documents',
    items: [
      { label: 'Buyer Agency Agreement', mandatory: true },
      { label: 'Cancellation Guarantee', mandatory: true },
      { label: 'Buyer Advantage Program', mandatory: true },
      { label: 'Transaction Compliance Fee', mandatory: true },
      { label: 'TILA-RESPA Form', mandatory: true },
      { label: 'Wire Fraud Form', mandatory: true },
    ],
  },
  {
    title: 'Once Under Contract',
    items: [
      { label: 'Flood Disclosure (signed)' },
      { label: 'Property Disclosure (signed)' },
      { label: 'Lead Base Paint Disclosure (signed)', conditional: 'if applicable' },
      { label: 'Sewer Disclosure (signed)', conditional: 'if applicable' },
      { label: 'Due Diligence Waiver (signed)', conditional: 'if applicable' },
      { label: 'Copy of Deposit' },
      { label: 'Agreement to Purchase' },
      { label: 'Counter(s)' },
      { label: 'Addendums' },
      { label: 'Formal Loan Application Date' },
      { label: 'Lender Authorization' },
      { label: 'Affiliated Business Disclosure' },
    ],
  },
];

// ─── Sub-component: a single checklist section ───────────────────────────────

function ChecklistSectionBlock({ section }: { section: ChecklistSection }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        {section.title}
      </p>
      <ul className="space-y-1.5">
        {section.items.map((item) => (
          <li key={item.label} className="flex items-start gap-2 text-sm">
            <span className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border border-muted-foreground/30 bg-background" />
            <span className="leading-snug">
              {item.label}
              {item.mandatory && (
                <Star className="inline-block h-3 w-3 ml-1 text-destructive fill-destructive align-middle" />
              )}
              {item.conditional && (
                <span className="ml-1 text-xs text-muted-foreground italic">({item.conditional})</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface AgentDocumentChecklistProps {
  closingType?: string;
}

export function AgentDocumentChecklist({ closingType }: AgentDocumentChecklistProps) {
  const [open, setOpen] = useState(false);

  const isListing = closingType === 'listing' || closingType === 'dual';
  const isBuyer = closingType === 'buyer' || closingType === 'dual';

  const sellerSections = SELLER_CHECKLIST;
  const buyerSections = BUYER_CHECKLIST;

  return (
    <Card className="border-dashed border-muted-foreground/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            Agent Document Checklist
            <Badge variant="outline" className="text-xs font-normal">Reference Only</Badge>
          </CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-muted-foreground"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? (
              <><ChevronUp className="h-3.5 w-3.5" /> Hide</>
            ) : (
              <><ChevronDown className="h-3.5 w-3.5" /> Show</>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Use this checklist to ensure all required documents are collected.{' '}
          <Star className="inline-block h-3 w-3 text-destructive fill-destructive align-middle" />{' '}
          = mandatory document.
        </p>
      </CardHeader>

      {open && (
        <CardContent className="pt-2">
          <div className={cn('grid gap-8', closingType === 'dual' ? 'md:grid-cols-2' : 'grid-cols-1')}>
            {/* Seller / Listing side */}
            {(isListing || (!isListing && !isBuyer)) && (
              <div className="space-y-6">
                {closingType === 'dual' && (
                  <p className="text-sm font-semibold text-foreground border-b pb-1">Seller Side</p>
                )}
                {!isListing && !isBuyer && (
                  <p className="text-sm font-semibold text-foreground border-b pb-1">Seller / Listing</p>
                )}
                {sellerSections.map((section) => (
                  <ChecklistSectionBlock key={section.title} section={section} />
                ))}
              </div>
            )}

            {/* Buyer side */}
            {isBuyer && (
              <div className="space-y-6">
                {closingType === 'dual' && (
                  <p className="text-sm font-semibold text-foreground border-b pb-1">Buyer Side</p>
                )}
                {buyerSections.map((section) => (
                  <ChecklistSectionBlock key={section.title} section={section} />
                ))}
              </div>
            )}


          </div>
        </CardContent>
      )}
    </Card>
  );
}
