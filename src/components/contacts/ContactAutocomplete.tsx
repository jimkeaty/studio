'use client';
import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Loader2, UserCheck } from 'lucide-react';
import { useContactSearch, ContactType, SavedContact } from '@/hooks/useContactSearch';

interface Props {
  type: ContactType;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (contact: SavedContact) => void;
  className?: string;
}

function displayLabel(c: SavedContact): string {
  const parts: string[] = [];
  if (c.companyName) parts.push(c.companyName);
  if (c.officerName) parts.push(c.officerName);
  if (c.name && c.name !== c.companyName) parts.push(c.name);
  if (c.email) parts.push(c.email);
  return parts.join(' · ');
}

export function ContactAutocomplete({ type, placeholder, value, onChange, onSelect, className }: Props) {
  const { results, loading, search, clear } = useContactSearch(type);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        clear();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [clear]);

  function handleChange(v: string) {
    onChange(v);
    search(v);
    setOpen(true);
  }

  function handleSelect(c: SavedContact) {
    onSelect(c);
    setOpen(false);
    clear();
  }

  const showDropdown = open && (loading || results.length > 0);

  return (
    <div ref={wrapRef} className={`relative ${className || ''}`}>
      <Input
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => { if (value) { search(value); setOpen(true); } }}
        placeholder={placeholder}
        autoComplete="off"
      />
      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Searching…
            </div>
          )}
          {!loading && results.map((c) => (
            <button
              key={c.id}
              type="button"
              className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(c); }}
            >
              <UserCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="truncate">{displayLabel(c)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
