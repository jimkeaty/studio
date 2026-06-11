// POST /api/admin/update-agent-contacts
// Admin-only endpoint that accepts an array of { name, email, phone } objects
// and updates matching agentProfile docs with the email and phone fields.
// Matching is done by name (case-insensitive, first+last).
// Also stamps firebaseUid from Firebase Auth if an account exists for the email.
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

interface ContactRow {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

function normalizeName(s: string) {
  return s.toLowerCase().replace(/[^a-z]/g, '');
}

function normalizePhone(p: string) {
  // Strip everything except digits
  const digits = p.replace(/\D/g, '');
  // Remove leading country code 1 if 11 digits
  const core = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (core.length === 10) {
    return `(${core.slice(0,3)}) ${core.slice(3,6)}-${core.slice(6)}`;
  }
  return p.trim(); // return original if can't normalize
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const isAdmin = await isAdminLike(decoded.uid);
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const contacts: ContactRow[] = body.contacts || [];
    const dryRun: boolean = body.dryRun === true;

    if (!contacts.length) {
      return NextResponse.json({ error: 'contacts array required' }, { status: 400 });
    }

    // Load all agent profiles
    const profilesSnap = await adminDb.collection('agentProfiles').get();
    
    // Build lookup maps: normalized full name → profile doc
    const profileByFullName = new Map<string, { id: string; data: FirebaseFirestore.DocumentData }>();
    const profileByFirstName = new Map<string, { id: string; data: FirebaseFirestore.DocumentData }[]>();
    
    for (const doc of profilesSnap.docs) {
      const d = doc.data();
      const rawName = (d.name || d.displayName || '').trim();
      const parts = rawName.split(/\s+/);
      const firstName = normalizeName(parts[0] || '');
      const lastName = normalizeName(parts[parts.length - 1] || '');
      const fullKey = firstName + lastName;
      if (fullKey) profileByFullName.set(fullKey, { id: doc.id, data: d });
      if (firstName) {
        if (!profileByFirstName.has(firstName)) profileByFirstName.set(firstName, []);
        profileByFirstName.get(firstName)!.push({ id: doc.id, data: d });
      }
    }

    const results: {
      contact: string;
      email: string;
      phone: string;
      status: string;
      profileId?: string;
      oldEmail?: string;
      oldPhone?: string;
      firebaseUid?: string;
    }[] = [];

    for (const contact of contacts) {
      const fn = normalizeName(contact.firstName);
      const ln = normalizeName(contact.lastName);
      const fullKey = fn + ln;
      const contactName = `${contact.firstName} ${contact.lastName}`.trim();
      const normalizedPhone = normalizePhone(contact.phone);

      // Try exact full name match first
      let match = profileByFullName.get(fullKey);
      
      // If no match, try first name only (if unique)
      if (!match && fn) {
        const candidates = profileByFirstName.get(fn) || [];
        if (candidates.length === 1) {
          match = candidates[0];
        }
      }

      if (!match) {
        results.push({ contact: contactName, email: contact.email, phone: normalizedPhone, status: 'no_profile_match' });
        continue;
      }

      const profileId = match.id;
      const profileData = match.data;
      const oldEmail = profileData.email || null;
      const oldPhone = profileData.phone || null;

      // Look up Firebase Auth UID by email
      let firebaseUid: string | undefined;
      try {
        const authUser = await adminAuth.getUserByEmail(contact.email);
        firebaseUid = authUser.uid;
      } catch {
        // No auth account yet — that's OK, we still update email/phone
      }

      const updates: Record<string, string> = {};
      // Only fill in fields that are currently missing — never overwrite existing data
      if (contact.email && !profileData.email) updates.email = contact.email.toLowerCase().trim();
      if (normalizedPhone && !profileData.phone) updates.phone = normalizedPhone;
      // Fix firebaseUid if missing OR if it equals the profile doc ID (a placeholder, not a real Auth UID)
      if (firebaseUid && (!profileData.firebaseUid || profileData.firebaseUid === profileId)) {
        updates.firebaseUid = firebaseUid;
      }

      if (!dryRun && Object.keys(updates).length > 0) {
        await adminDb.collection('agentProfiles').doc(profileId).update(updates);
      }

      results.push({
        contact: contactName,
        email: contact.email,
        phone: normalizedPhone,
        status: dryRun ? 'dry_run' : 'updated',
        profileId,
        oldEmail: oldEmail || '(none)',
        oldPhone: oldPhone || '(none)',
        firebaseUid: firebaseUid || '(no auth account)',
      });
    }

    const updated = results.filter(r => r.status === 'updated').length;
    const dryRunCount = results.filter(r => r.status === 'dry_run').length;
    const noMatch = results.filter(r => r.status === 'no_profile_match').length;

    return NextResponse.json({
      ok: true,
      dryRun,
      summary: { updated, dryRunCount, noMatch, total: contacts.length },
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
