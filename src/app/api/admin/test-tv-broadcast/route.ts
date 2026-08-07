import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { broadcastTvPost, type TvPostType } from '@/lib/notifications/broadcastTvPost';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    const callerUid = decoded.uid;
    const adminCheck = await isAdminLike(callerUid);
    if (!adminCheck) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const postType: TvPostType = body.postType || 'openHouseOpps';

    const postTypeLabels: Record<TvPostType, { label: string; emoji: string }> = {
      openHouseOpps: { label: 'Open House Opportunity', emoji: '🏡' },
      buyerNeeds:    { label: 'Buyer Need',             emoji: '🏠' },
      comingSoon:    { label: 'Coming Soon',             emoji: '🏷️' },
      agentHelp:     { label: 'Agent Help Needed',       emoji: '🤝' },
    };

    const { label, emoji } = postTypeLabels[postType];

    const result = await broadcastTvPost({
      postType,
      postId: `test-${Date.now()}`,
      label,
      emoji,
      description: `🧪 TEST BROADCAST — This is a test ${label} notification sent from the Admin Notification Debug page to verify that in-app, email, and SMS notifications are working correctly for all agents.`,
      agentName: decoded.name || decoded.email || 'Admin',
      dashboardUrl: '/dashboard/community',
    });

    return NextResponse.json({ ok: true, notified: result.notified, postType, label });
  } catch (err: any) {
    console.error('[test-tv-broadcast]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
