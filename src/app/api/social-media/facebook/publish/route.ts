import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { appendQueueAudit, caller, decryptSecret, IMAGE_TYPES, SOCIAL_MEDIA_COLLECTION } from '@/lib/socialMedia/queue';

const graph = 'https://graph.facebook.com/v26.0';
const safeError = () => 'Facebook did not accept this post. Check the Page connection, selected media, and Meta permissions, then retry.';

export async function POST(req: NextRequest) {
  let jobRef: any = null;
  try {
    const user = await caller(req);
    if (!user.isStaff) return NextResponse.json({ ok: false, error: 'Marketing or Admin approval is required.' }, { status: 403 });
    const { groupId, selectedAssetIds, confirm } = await req.json();
    if (confirm !== true) return NextResponse.json({ ok: false, error: 'Explicit publish confirmation is required.' }, { status: 400 });
    const groupRef = adminDb.collection(SOCIAL_MEDIA_COLLECTION).doc(String(groupId || ''));
    const groupSnapshot = await groupRef.get();
    const group = groupSnapshot.data();
    if (!group || group.status !== 'ready_to_post') return NextResponse.json({ ok: false, error: 'Only a Ready to Post submission can be published.' }, { status: 400 });
    const selected = (group.media || []).filter((asset: any) => (selectedAssetIds || group.selectedAssetIds || []).map(String).includes(String(asset.id)));
    if (!selected.length) return NextResponse.json({ ok: false, error: 'Select at least one media asset.' }, { status: 400 });
    const videos = selected.filter((asset: any) => !IMAGE_TYPES.has(asset.mimeType));
    if (videos.length && (videos.length !== 1 || selected.length !== 1)) return NextResponse.json({ ok: false, error: 'Facebook Page publishing supports photos or exactly one video per post; mixed media is not permitted.' }, { status: 400 });
    const connection = (await adminDb.collection('facebookPageConnections').doc('default').get()).data();
    if (!connection?.pageTokenEncrypted || connection.status !== 'connected' || !connection.pageId) return NextResponse.json({ ok: false, error: 'No verified Facebook Page connection is available. Use the official Page connection setup first.' }, { status: 503 });
    jobRef = adminDb.collection('facebookPublishJobs').doc();
    const caption = String(group.finalCaption || '').trim();
    await jobRef.set({ groupId: groupRef.id, selectedAssetIds: selected.map((asset: any) => asset.id), caption, mediaKind: videos.length ? 'video' : 'photos', status: 'publishing', pageId: connection.pageId, pageName: connection.pageName || null, createdAt: new Date(), createdBy: user.uid, attempts: 1 });
    const pageToken = decryptSecret(connection.pageTokenEncrypted);
    let postId = '';
    if (videos.length) {
      const body = new URLSearchParams({ file_url: selected[0].url, description: caption, access_token: pageToken, published: 'true' });
      const response = await fetch(`${graph}/${connection.pageId}/videos`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      const result = await response.json();
      if (!response.ok || !result.id) throw new Error('Video publish failed');
      postId = String(result.id);
    } else {
      const photoIds: string[] = [];
      for (const media of selected) {
        const body = new URLSearchParams({ url: media.url, published: 'false', access_token: pageToken });
        const response = await fetch(`${graph}/${connection.pageId}/photos`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
        const result = await response.json();
        if (!response.ok || !result.id) throw new Error('Photo upload failed');
        photoIds.push(String(result.id));
      }
      const body = new URLSearchParams({ message: caption, access_token: pageToken });
      photoIds.forEach((id, index) => body.set(`attached_media[${index}]`, JSON.stringify({ media_fbid: id })));
      const response = await fetch(`${graph}/${connection.pageId}/feed`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      const result = await response.json();
      if (!response.ok || !result.id) throw new Error('Photo post publish failed');
      postId = String(result.id);
    }
    const permalink = `https://www.facebook.com/${postId}`;
    await jobRef.update({ status: 'published', metaObjectId: postId, canonicalPermalink: permalink, publishedAt: new Date(), updatedAt: new Date() });
    await groupRef.update({ status: 'published', publishedAt: new Date(), updatedAt: new Date(), publishingHistory: [...(group.publishingHistory || []), { jobId: jobRef.id, status: 'published', pagePostId: postId, permalink, publishedAt: new Date().toISOString() }] });
    await appendQueueAudit(groupRef.id, 'facebook_page_published', user, { jobId: jobRef.id, pagePostId: postId, canonicalPermalink: permalink });
    return NextResponse.json({ ok: true, jobId: jobRef.id, pagePostId: postId, canonicalPermalink: permalink });
  } catch (e: any) {
    if (jobRef) await jobRef.update({ status: 'failed', error: safeError(), updatedAt: new Date() }).catch(() => {});
    const message = safeError();
    if (e?.message?.includes('Explicit') || e?.message?.includes('Ready to Post') || e?.message?.includes('Select') || e?.message?.includes('mixed')) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
