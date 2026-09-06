// GET  /api/contacts?type=lender&q=searchterm  — search saved contacts
// POST /api/contacts                            — create or upsert a contact
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { admin } from '@/lib/firebase/admin';
import { isStaff } from '@/lib/auth/staffAccess';

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
const VALID_TYPES = ['client', 'lender', 'title', 'other_agent', 'inspector', 'insurance', 'vendor', 'attorney'] as const;
type ContactType = typeof VALID_TYPES[number];
const DEFAULT_TENANT_ID = 'smart-broker-usa';

function clean(value: unknown) { return String(value || '').trim(); }
function normalized(value: unknown) { return clean(value).toLowerCase().replace(/[^a-z0-9]/g, ''); }
function tenantId(decoded: any) { return String(decoded?.tenantId || decoded?.brokerageId || DEFAULT_TENANT_ID); }
function companyDocumentId(scope: string, type: string, companyName: string) {
  return `company_${normalized(scope)}_${type}_${normalized(companyName)}`.slice(0, 140);
}

export async function GET(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const url = new URL(req.url);
    const type = url.searchParams.get('type') as ContactType | null;
    const q = (url.searchParams.get('q') || '').toLowerCase().trim();
    // The Contact Book page loads up to 500 records and performs its live search
    // client-side. The former 200-record cap meant a newly saved contact could
    // exist but never appear in search once the book passed that threshold.
    const requestedLimit = parseInt(url.searchParams.get('limit') || '500');
    const limitN = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 1000)
      : 500;

    // Staff (admin, TC, office staff) see ALL contacts.
    // Agents only see contacts they personally created (createdBy == their uid).
    const callerIsStaff = await isStaff(uid);

    let query: FirebaseFirestore.Query = adminDb.collection('contacts').limit(limitN);

    if (type && VALID_TYPES.includes(type as ContactType)) {
      query = query.where('type', '==', type);
    }

    // Scope to agent's own contacts when caller is not staff
    if (!callerIsStaff) {
      query = query.where('createdBy', '==', uid);
    }

    const snap = await query.get();
    const scope = tenantId(decoded);
    let contacts = snap.docs
      .map((d) => ({ id: d.id, ...serialize(d.data()) }))
      // Older SmartBroker contacts predate tenantId; they belong to the original
      // Smart Broker USA tenant. New documents always carry an explicit scope.
      .filter((contact: any) => (contact.tenantId || DEFAULT_TENANT_ID) === scope);

    // Client-side text filter (Firestore doesn't support full-text search)
    if (q) {
      contacts = contacts.filter((c: any) => {
        const searchable = [
          c.name, c.companyName, c.email, c.phone,
          c.officerName, c.officerEmail, c.brokerage, c.attorney, c.specialties,
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

    const callerIsStaff = await isStaff(uid);

    const body = await req.json();
    const { type, upsert = false, viewAs: postViewAs, ownerAgentId, ...fields } = body;

    if (!type || !VALID_TYPES.includes(type as ContactType)) {
      return jsonError(400, `type must be one of: ${VALID_TYPES.join(', ')}`);
    }

    // When admin is saving on behalf of an agent (viewAs), use the agent's UID as createdBy
    let effectiveCreatedBy = (callerIsStaff && postViewAs) ? String(postViewAs) : uid;
    if (callerIsStaff && ownerAgentId && !postViewAs) {
      const profile = await adminDb.collection('agentProfiles').doc(String(ownerAgentId)).get();
      effectiveCreatedBy = String(profile.data()?.firebaseUid || profile.data()?.uid || ownerAgentId);
    }

    const now = new Date().toISOString();

    // Build the contact document
    const contact: Record<string, any> = {
      type,
      updatedAt: now,
      updatedBy: uid,
      tenantId: tenantId(decoded),
      recordKind: 'individual',
    };

    // Map fields by type
    if (type === 'client') {
      contact.name = clean(fields.name || fields.clientName);
      contact.email = clean(fields.email || fields.clientEmail).toLowerCase();
      contact.phone = clean(fields.phone || fields.clientPhone);
      contact.newAddress = clean(fields.newAddress || fields.clientNewAddress);
    } else if (type === 'lender') {
      contact.companyName = clean(fields.companyName || fields.mortgageCompany);
      contact.officerName = clean(fields.officerName || fields.loanOfficer);
      contact.email = clean(fields.email || fields.loanOfficerEmail).toLowerCase();
      contact.phone = clean(fields.phone || fields.loanOfficerPhone);
      contact.office = clean(fields.office || fields.lenderOffice);
      contact.name = contact.officerName || contact.companyName;
    } else if (type === 'title') {
      contact.companyName = clean(fields.companyName || fields.titleCompany);
      contact.officerName = clean(fields.officerName || fields.titleOfficer);
      contact.email = clean(fields.email || fields.titleOfficerEmail).toLowerCase();
      contact.phone = clean(fields.phone || fields.titleOfficerPhone);
      contact.attorney = clean(fields.attorney || fields.titleAttorney);
      contact.office = clean(fields.office || fields.titleOffice);
      contact.name = contact.officerName || contact.companyName;
    } else if (type === 'other_agent') {
      contact.name = clean(fields.name || fields.otherAgentName);
      contact.email = clean(fields.email || fields.otherAgentEmail).toLowerCase();
      contact.phone = clean(fields.phone || fields.otherAgentPhone);
      contact.brokerage = clean(fields.brokerage || fields.otherBrokerage);
    } else if (type === 'inspector') {
      contact.companyName = clean(fields.companyName || fields.inspectorCompany);
      contact.name = clean(fields.name || fields.inspectorName || contact.companyName);
      contact.email = clean(fields.email).toLowerCase();
      contact.phone = clean(fields.phone);
      contact.specialties = clean(fields.specialties || fields.specialty);
    } else if (type === 'insurance' || type === 'vendor' || type === 'attorney') {
      contact.companyName = clean(fields.companyName || fields.company);
      contact.name = clean(fields.name || fields.contactName || contact.companyName);
      contact.email = clean(fields.email).toLowerCase();
      contact.phone = clean(fields.phone);
      contact.specialties = clean(fields.specialties || fields.practiceArea || fields.service);
    }

    contact.normalizedEmail = normalized(contact.email);
    contact.normalizedPhone = normalized(contact.phone);
    contact.normalizedName = normalized(contact.name);
    contact.normalizedCompanyName = normalized(contact.companyName);

    // Skip if no meaningful data
    const hasData = contact.name || contact.companyName || contact.email;
    if (!hasData) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'No meaningful data to save' });
    }

    // Companies remain first-class records in the same canonical contacts collection.
    // A lender/title company can therefore have many separate officer records without
    // one officer overwriting another during a transaction contact upsert.
    const personName = type === 'lender' || type === 'title' ? contact.officerName : contact.name;
    if (contact.companyName) {
      const companyId = companyDocumentId(contact.tenantId, type, contact.companyName);
      contact.companyContactId = companyId;
      await adminDb.collection('contacts').doc(companyId).set({
        type, recordKind: 'company', tenantId: contact.tenantId, name: contact.companyName,
        companyName: contact.companyName, normalizedCompanyName: contact.normalizedCompanyName,
        createdBy: effectiveCreatedBy, createdAt: now, updatedBy: uid, updatedAt: now,
      }, { merge: true });
      if (!personName) {
        return NextResponse.json({ ok: true, id: companyId, upserted: true, contact: { id: companyId, type, recordKind: 'company', companyName: contact.companyName } });
      }
    }

    // Upsert: prefer a stable individual email, then individual name within the
    // same type, owner, and tenant. Company name alone never merges two officers.
    if (upsert) {
      let existingId: string | null = null;
      // Always scope upsert lookups to the same owner so each agent gets their
      // own copy of a contact rather than silently updating another agent's record.
      if (contact.email) {
        const emailSnap = await adminDb.collection('contacts')
          .where('type', '==', type)
          .where('normalizedEmail', '==', contact.normalizedEmail)
          .where('createdBy', '==', effectiveCreatedBy)
          .limit(10).get();
        const matching = emailSnap.docs.find((doc) => (doc.data().tenantId || DEFAULT_TENANT_ID) === contact.tenantId && doc.data().recordKind !== 'company');
        if (matching) existingId = matching.id;
      }
      // Legacy contacts created before normalized fields were introduced should
      // still be reused rather than duplicated on the next transaction save.
      if (!existingId && contact.email) {
        const legacyEmailSnap = await adminDb.collection('contacts')
          .where('type', '==', type)
          .where('email', '==', contact.email)
          .where('createdBy', '==', effectiveCreatedBy)
          .limit(10).get();
        const matching = legacyEmailSnap.docs.find((doc) => (doc.data().tenantId || DEFAULT_TENANT_ID) === contact.tenantId && doc.data().recordKind !== 'company');
        if (matching) existingId = matching.id;
      }
      if (!existingId && contact.normalizedName) {
        const nameSnap = await adminDb.collection('contacts')
          .where('type', '==', type)
          .where('normalizedName', '==', contact.normalizedName)
          .where('createdBy', '==', effectiveCreatedBy)
          .limit(10).get();
        const matching = nameSnap.docs.find((doc) => (doc.data().tenantId || DEFAULT_TENANT_ID) === contact.tenantId && doc.data().recordKind !== 'company');
        if (matching) existingId = matching.id;
      }
      if (!existingId && contact.name) {
        const legacyNameSnap = await adminDb.collection('contacts')
          .where('type', '==', type)
          .where('name', '==', contact.name)
          .where('createdBy', '==', effectiveCreatedBy)
          .limit(10).get();
        const matching = legacyNameSnap.docs.find((doc) => (doc.data().tenantId || DEFAULT_TENANT_ID) === contact.tenantId && doc.data().recordKind !== 'company');
        if (matching) existingId = matching.id;
      }
      if (existingId) {
        await adminDb.collection('contacts').doc(existingId).update({
          ...contact,
          usageCount: admin.firestore.FieldValue.increment(1),
        });
        return NextResponse.json({ ok: true, id: existingId, upserted: true });
      }
    }

    // Create new
    contact.createdAt = now;
    contact.createdBy = effectiveCreatedBy;
    contact.usageCount = 1;
    const ref = await adminDb.collection('contacts').add(contact);
    return NextResponse.json({ ok: true, id: ref.id, contact: { id: ref.id, ...contact } });
  } catch (err: any) {
    return jsonError(500, err.message || 'Internal error');
  }
}
