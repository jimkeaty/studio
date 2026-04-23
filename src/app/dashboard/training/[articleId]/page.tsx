'use client';
export const dynamic = 'force-dynamic';

import { use } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft, GraduationCap, Clock, Calendar, Users, ShieldCheck, AlertTriangle } from 'lucide-react';
import { getArticleById, type ArticleAudience } from '@/lib/training/articles';
import { cn } from '@/lib/utils';

const AUDIENCE_CONFIG: Record<ArticleAudience, { label: string; color: string; icon: React.ReactNode }> = {
  agent: {
    label: 'For Agents',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: <Users className="h-3 w-3" />,
  },
  staff: {
    label: 'For Staff & Admin',
    color: 'bg-purple-100 text-purple-800 border-purple-200',
    icon: <ShieldCheck className="h-3 w-3" />,
  },
  both: {
    label: 'For Everyone',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    icon: <Users className="h-3 w-3" />,
  },
};

export default function TrainingArticlePage({ params }: { params: Promise<{ articleId: string }> }) {
  const { articleId } = use(params);
  const article = getArticleById(articleId);

  if (!article) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Article Not Found</AlertTitle>
          <AlertDescription>
            This guide does not exist or may have been moved.{' '}
            <Link href="/dashboard/training" className="underline font-medium">
              Return to Training Center
            </Link>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const aud = AUDIENCE_CONFIG[article.audience];

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      {/* Back */}
      <Link href="/dashboard/training">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          Training Center
        </Button>
      </Link>

      {/* Article Header */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full border-slate-200 text-slate-600 bg-slate-50">
            {article.category}
          </Badge>
          <span className={cn('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border', aud.color)}>
            {aud.icon}
            {aud.label}
          </span>
        </div>

        <h1 className="text-2xl font-bold tracking-tight leading-snug">
          {article.title}
        </h1>
        <p className="text-base text-muted-foreground">{article.description}</p>

        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground pt-1">
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            {article.readingTimeMinutes} min read
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            {format(parseISO(article.publishedAt), 'MMMM d, yyyy')}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-border" />

      {/* Article Content */}
      <div
        className={cn(
          'prose prose-slate max-w-none',
          // Headings
          'prose-h2:text-xl prose-h2:font-bold prose-h2:mt-8 prose-h2:mb-3',
          'prose-h3:text-base prose-h3:font-semibold prose-h3:mt-5 prose-h3:mb-2',
          // Paragraphs
          'prose-p:text-sm prose-p:leading-relaxed prose-p:text-foreground',
          // Lists
          'prose-ul:text-sm prose-ol:text-sm prose-li:my-0.5',
          // Tables
          'prose-table:text-sm prose-th:bg-muted/50 prose-th:font-semibold prose-th:text-left prose-th:px-3 prose-th:py-2',
          'prose-td:px-3 prose-td:py-2 prose-td:border-t prose-td:border-border',
          'prose-table:border prose-table:border-border prose-table:rounded-lg prose-table:overflow-hidden',
          // Blockquotes
          'prose-blockquote:border-l-4 prose-blockquote:border-primary/40 prose-blockquote:bg-primary/5 prose-blockquote:rounded-r-lg prose-blockquote:px-4 prose-blockquote:py-2 prose-blockquote:text-sm prose-blockquote:not-italic prose-blockquote:text-foreground',
          // Code
          'prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono',
        )}
        dangerouslySetInnerHTML={{ __html: article.content }}
      />

      {/* Footer nav */}
      <div className="pt-4 border-t flex justify-between items-center">
        <Link href="/dashboard/training">
          <Button variant="outline" size="sm" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Back to Training Center
          </Button>
        </Link>
        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
          <GraduationCap className="h-3.5 w-3.5" />
          Smart Broker USA Training
        </span>
      </div>
    </div>
  );
}
