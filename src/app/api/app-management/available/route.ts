import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { PLUGIN_REGISTRY } from '@/lib/plugins/registry';

type RolloutState = 'hidden' | 'coming_soon' | 'active';
type RolloutRule = { state?: RolloutState; roles?: string[]; officeIds?: string[]; teamIds?: string[]; userIds?: string[] };
const matches = (rule: RolloutRule, profile: Record<string, any>, uid: string) => {
  const constraints: Array<{ values: string[]; identifiers: string[] }> = [
    { values: rule.roles || [], identifiers: [String(profile.role || 'agent')] },
    { values: rule.officeIds || [], identifiers: [String(profile.officeId || profile.office || '')] },
    { values: rule.teamIds || [], identifiers: [String(profile.primaryTeamId || profile.teamId || '')] },
    { values: rule.userIds || [], identifiers: [uid, String(profile.agentId || ''), String(profile.id || '')] },
  ].filter((constraint) => constraint.values.length > 0);
  return constraints.length === 0 || constraints.some(({ values, identifiers }) => identifiers.some((identifier) => values.includes(identifier)));
};

export async function GET(req: NextRequest) {
  const header = req.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return NextResponse.json({ ok: false, error: 'Sign in is required' }, { status: 401 });
  try {
    const decoded = await adminAuth.verifyIdToken(header.slice(7));
    const profileSnap = await adminDb.collection('agentProfiles').where('firebaseUid', '==', decoded.uid).limit(1).get();
    const profile = profileSnap.empty ? {} : { id: profileSnap.docs[0].id, ...profileSnap.docs[0].data() };
    const settings = (await adminDb.collection('appManagement').doc('default').get()).data() as { rollouts?: Record<string, RolloutRule> } | undefined;
    const rollouts = settings?.rollouts || {};
    const apps = PLUGIN_REGISTRY.map((plugin) => {
      const rule = rollouts[plugin.id];
      if (!rule) return { id: plugin.id, state: null, configured: false };
      const state: RolloutState = rule.state === 'active' || rule.state === 'coming_soon' ? rule.state : 'hidden';
      const permitted = state !== 'hidden' && matches(rule, profile, decoded.uid);
      return { id: plugin.id, state: permitted ? state : 'hidden', configured: true };
    });
    return NextResponse.json({ ok: true, apps });
  } catch (error: any) { return NextResponse.json({ ok: false, error: error.message || 'Unable to resolve app availability' }, { status: 500 }); }
}
