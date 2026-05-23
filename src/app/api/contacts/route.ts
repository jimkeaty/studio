// GET  /api/contacts?type=lender&q=searchterm  — search saved contacts
// POST /api/contacts                            — create or upsert a contact
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function serialize(val: any): any {
  if (val == null) return val;
  if (typeof val?.toDate === 'function') return val.toDate().toISOString();
  if (Array.isArray(val)) return val.map(serialize);
  if (typeof val === 'object' && val.constructor === Object) {
    const out: any = {};
    for (const [k, v] of Object.entries(val)) out[k] = serialize(v);
    return out;
  }
  return val;
}

// Valid contact types
const VALID_TYPES = ['client', 'lender', 'title', 'other_agent', 'inspector'] as const;
type ContactType = typeof VALID_TYPES[number];

export async function GET(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const url = new URL(req.url);
    const type = url.searchParams.get('type') as ContactType | null;
    const q = (url.searchParams.get('q') || '').toLowerCase().trim();
    const limitN = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);

    // Contacts are shared across the brokerage (all authenticated users can read)
    let query: FirebaseFirestore.Query = adminDb.collection('contacts').limit(limitN);

    if (type && VALID_TYPES.includes(type as ContactType)) {
      query = query.where('type', '==', type);
    }

    const snap = await query.get();
    let contacts = snap.docs.map((d) => ({ id: d.id, ...serialize(d.data()) }));

    // Client-side text filter (Firestore doesn't support full-text search)
    if (q) {
      contacts = contacts.filter((c: any) => {
        const searchable = [
          c.name, c.companyName, c.email, c.phone,
          c.officerName, c.officerEmail, c.brokerage,
        ].filter(Boolean).join(' ').toLowerCase();
        return searchable.includes(q);
      });
    }

    // Sort by usage count desc, then name asc
    contacts.sort((a: any, b: any) => {
      const ua = a.usageCount || 0;
      const ub = b.usageCount || 0;
      if (ub !== ua) return ub - ua;
      return (a.name || a.companyName || '').localeCompare(b.name || b.companyName || '');
    });

    return NextResponse.json({ ok: true, contacts });
  } catch (err: any) {
    return jsonError(500, err.message || 'Internal error');
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const body = await req.json();
    const { type, upsert = false, ...fields } = body;

    if (!type || !VALID_TYPES.includes(type as ContactType)) {
      return jsonError(400, `type must be one of: ${VALID_TYPES.join(', ')}`);
    }

    const now = new Date().toISOString();

    // Build the contact document
    const contact: Record<string, any> = {
      type,
      updatedAt: now,
      updatedBy: uid,
    };

    // Map fields by type
    if (type === 'client') {
      contact.name = (fields.name || fields.clientName || '').trim();
      contact.email = (fields.email || fields.clientEmail || '').trim().toLowerCase();
      contact.phone = (fields.phone || fields.clientPhone || '').trim();
      contact.newAddress = (fields.newAddress || fields.clientNewAddress || '').trim();
    } else if (type === 'lender') {
      contact.companyName = (fields.companyName || fields.mortgageCompany || '').trim();
      contact.officerName = (fields.officerName || fields.loanOfficer || '').trim();
      contact.email = (fields.email || fields.loanOfficerEmail || '').trim().toLowerCase();
      contact.phone = (fields.phone || fields.loanOfficerPhone || '').trim();
      contact.office = (fields.office || fields.lenderOffice || '').trim();
      // Primary display name is company
      contact.name = contact.companyName || contact.officerName;
    } else if (type === 'title') {
      contact.companyName = (fields.companyName || fields.titleCompany || '').trim();
      contact.officerName = (fields.officerName || fields.titleOfficer || '').trim();
      contact.email = (fields.email || fields.titleOfficerEmail || '').trim().toLowerCase();
      contact.phone = (fields.phone || fields.titleOfficerPhone || '').trim();
      contact.attorney = (fields.attorney || fields.titleAttorney || '').trim();
      contact.office = (fields.office || fields.titleOffice || '').trim();
      contact.name = contact.companyName || contact.officerName;
    } else if (type === 'other_agent') {
      contact.name = (fields.name || fields.otherAgentName || '').trim();
      contact.email = (fields.email || fields.otherAgentEmail || '').trim().toLowerCase();
      contact.phone = (fields.phone || fields.otherAgentPhone || '').trim();
      contact.brokerage = (fields.brokerage || fields.otherBrokerage || '').trim();
    } else if (type === 'inspector') {
      contact.name = (fields.name || fields.inspectorName || '').trim();
      contact.email = (fields.email || '').trim().toLowerCase();
      contact.phone = (fields.phone || '').trim();
    }

    // Skip if no meaningful data
    const hasData = contact.name || contact.companyName || contact.email;
    if (!hasData) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'No meaningful data to save' });
    }

    // Upsert: find existing by email or name+type
    if (upsert) {
      let existingId: string | null = null;
      if (contact.email) {
        const emailSnap = await adminDb.collection('contacts')
          .where('type', '==', type)
          .where('email', '==', contact.email)
          .limit(1).get();
        if (!emailSnap.empty) existingId = emailSnap.docs[0].id;
      }
      if (!existingId && contact.name) {
        const nameSnap = await adminDb.collection('contacts')
          .where('type', '==', type)
          .where('name', '==', contact.name)
          .limit(1).get();
        if (!nameSnap.empty) existingId = nameSnap.docs[0].id;
      }
      if (!existingId && contact.companyName) {
        const coSnap = await adminDb.collection('contacts')
          .where('type', '==', type)
          .where('companyName', '==', contact.companyName)
          .limit(1).get();
        if (!coSnap.empty) existingId = coSnap.docs[0].id;
      }

      if (existingId) {
        await adminDb.collection('contacts').doc(existingId).update({
          ...contact,
          usageCount: (adminDb as any).FieldValue
            ? (adminDb as any).FieldValue.increment(1)
            : ((await adminDb.collection('contacts').doc(existingId).get()).data()?.usageCount || 0) + 1,
        });
        return NextResponse.json({ ok: true, id: existingId, upserted: true });
      }
    }

    // Create new
    contact.createdAt = now;
    contact.createdBy = uid;
    contact.usageCount = 1;
    const ref = await adminDb.collection('contacts').add(contact);
    return NextResponse.json({ ok: true, id: ref.id, contact: { id: ref.id, ...contact } });
  } catch (err: any) {
    return jsonError(500, err.message || 'Internal error');
  }
}
