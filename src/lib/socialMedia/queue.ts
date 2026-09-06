import 'server-only';
import crypto from 'crypto';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isStaff } from '@/lib/auth/staffAccess';

export const SOCIAL_MEDIA_COLLECTION = 'socialMediaGroups';
export const SOCIAL_CONTENT_LIBRARY_COLLECTION = 'socialContentLibrary';
export type QueueStatus = 'draft' | 'ready_to_post' | 'published' | 'archived';
export const MAX_SOCIAL_MEDIA_BYTES = 100 * 1024 * 1024;
export const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);
export const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
export const ALLOWED_SOCIAL_MEDIA_TYPES = new Set([...IMAGE_TYPES, ...VIDEO_TYPES]);

export function bearer(req: Request) { const value = req.headers.get('authorization') || ''; return value.startsWith('Bearer ') ? value.slice(7).trim() : null; }
export async function caller(req: Request) { const token = bearer(req); if (!token) throw new Error('Unauthorized'); const decoded = await adminAuth.verifyIdToken(token); return { uid: decoded.uid, email: decoded.email || '', name: decoded.name || decoded.email || 'Agent', isStaff: await isStaff(decoded.uid) }; }
export function safeMediaName(name: string) { return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_').slice(0, 100) || 'media'; }
export function groupPublicView(id: string, data: Record<string, any>) { return { id, agentUid: data.agentUid, agentName: data.agentName, rawNotes: data.rawNotes || '', aiCaption: data.aiCaption || '', finalCaption: data.finalCaption || '', status: data.status || 'draft', media: Array.isArray(data.media) ? data.media.map(({ storagePath, ...media }: any) => media) : [], selectedAssetIds: data.selectedAssetIds || [], createdAt: data.createdAt?.toDate?.().toISOString?.() || data.createdAt || null, updatedAt: data.updatedAt?.toDate?.().toISOString?.() || data.updatedAt || null, publishedAt: data.publishedAt?.toDate?.().toISOString?.() || data.publishedAt || null, publishingHistory: data.publishingHistory || [] }; }
export async function appendQueueAudit(groupId: string, event: string, actor: { uid: string; name: string }, details: Record<string, any> = {}) { await adminDb.collection(SOCIAL_MEDIA_COLLECTION).doc(groupId).collection('auditEvents').add({ event, actorUid: actor.uid, actorName: actor.name, ...details, occurredAt: new Date() }); }
export function captionPrompt(notes: string, action: string) { const directive: Record<string, string> = { professional: 'Make it polished, professional, and warm.', casual: 'Make it conversational and relaxed.', shorten: 'Make it shorter while retaining the strongest message.', cta: 'Add a concise, appropriate call to action.', voice: 'Make it sound authentic and first-person, without inventing facts.', rewrite: 'Rewrite the notes into a factual, engaging social-media caption.' }; return `Write one factual real-estate social-media caption from the submitted notes. ${directive[action] || directive.rewrite} Do not invent property facts, claims, results, or legal/financial promises. Preserve uncertainty rather than adding details. Return caption text only. Notes: ${notes.slice(0, 5000)}`; }
export function connectionConfigReady() { return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_LOGIN_CONFIG_ID && process.env.META_PAGE_ID && process.env.SOCIAL_CONNECTION_ENCRYPTION_KEY); }
function key() { const value = process.env.SOCIAL_CONNECTION_ENCRYPTION_KEY || ''; const result = crypto.createHash('sha256').update(value).digest(); if (!value) throw new Error('Social connection encryption is not configured.'); return result; }
export function encryptSecret(value: string) { const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv); const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`; }
export function decryptSecret(value: string) { const [ivText, tagText, valueText] = value.split('.'); const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivText, 'base64url')); decipher.setAuthTag(Buffer.from(tagText, 'base64url')); return Buffer.concat([decipher.update(Buffer.from(valueText, 'base64url')), decipher.final()]).toString('utf8'); }
