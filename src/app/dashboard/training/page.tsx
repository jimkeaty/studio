'use client';
export const dynamic = 'force-dynamic';

import { useState, useMemo } from 'react';
import { useUser } from '@/firebase';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GraduationCap, Search, BookOpen, Clock, ChevronRight, Users, ShieldCheck } from 'lucide-react';
import { ARTICLES, CATEGORIES, type Article, type ArticleAudience } from '@/lib/training/articles';
import { cn } from '@/lib/utils';

const AUDIENCE_CONFIG: Record<ArticleAudience, { label: string; color: string; icon: React.ReactNode }> = {
  agent: {
    label: 'Agents',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: <Users className="h-3 w-3" />,
  },
  staff: {
    label: 'Staff & Admin',
    color: 'bg-purple-100 text-purple-800 border-purple-200',
    icon: <ShieldCheck className="h-3 w-3" />,
  },
  both: {
    label: 'Everyone',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    icon: <Users className="h-3 w-3" />,
  },
};

function ArticleCard({ article }: { article: Article }) {
  const aud = AUDIENCE_CONFIG[article.audience];
  return (
    <Link href={`/dashboard/training/${article.id}`} className="group block h-full">
      <Card className="h-full border transition-all duration-150 group-hover:border-primary/50 group-hover:shadow-md">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2 mb-1">
            <Badge variant="outline" className="text-[10px] font-semibold px-2 py-0.5 rounded-full border-slate-200 text-slate-600 bg-slate-50">
              {article.category}
            </Badge>
            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border', aud.color)}>
              {aud.icon}
              {aud.label}
            </span>
          </div>
          <CardTitle className="text-base leading-snug group-hover:text-primary transition-colors">
            {article.title}
          </CardTitle>
          <CardDescription className="text-sm line-clamp-2 mt-0.5">
            {article.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {article.readingTimeMinutes} min read
            </span>
            <span className="flex items-center gap-1 text-primary font-medium group-hover:gap-2 transition-all">
              Read guide
              <ChevronRight className="h-3 w-3" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function TrainingPage() {
  const { user } = useUser();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [audienceFilter, setAudienceFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return ARTICLES.filter((a) => {
      const matchSearch =
        !q ||
        a.title.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q);
      const matchCategory = categoryFilter === 'all' || a.category === categoryFilter;
      const matchAudience = audienceFilter === 'all' || a.audience === audienceFilter || a.audience === 'both';
      return matchSearch && matchCategory && matchAudience;
    });
  }, [search, categoryFilter, audienceFilter]);

  // Group by category for display
  const grouped = useMemo(() => {
    const map = new Map<string, Article[]>();
    for (const article of filtered) {
      const existing = map.get(article.category) ?? [];
      map.set(article.category, [...existing, article]);
    }
    return map;
  }, [filtered]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" />
            Training & Help Center
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Step-by-step guides and feature explanations for agents and staff
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-1.5 border">
          <BookOpen className="h-4 w-4" />
          <span>{ARTICLES.length} guide{ARTICLES.length !== 1 ? 's' : ''} available</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative sm:max-w-xs w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search guides..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={audienceFilter} onValueChange={setAudienceFilter}>
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="All Audiences" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Audiences</SelectItem>
            <SelectItem value="agent">Agents</SelectItem>
            <SelectItem value="staff">Staff & Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <GraduationCap className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No guides found</p>
          <p className="text-sm mt-1">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Array.from(grouped.entries()).map(([category, articles]) => (
            <div key={category}>
              <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                <span className="h-px flex-1 bg-border" />
                {category}
                <span className="h-px flex-1 bg-border" />
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {articles.map((article) => (
                  <ArticleCard key={article.id} article={article} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
