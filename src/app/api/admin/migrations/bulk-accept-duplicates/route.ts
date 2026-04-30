// POST /api/admin/migrations/bulk-accept-duplicates
// Matches the 91 pre-verified spreadsheet entries against live transaction data,
// builds the correct duplicate group keys, and persists them to Firestore.

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

// Same normalization as the frontend duplicate finder
function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

// All 92 pre-verified entries from the spreadsheet [address, agentName, reason]
const ENTRIES: [string, string, string][] = [
  ["Address", "Agent", "Reason"],
  ["100 Nickerson Pkwy", "Debbie Foreman", "Same agent listed and sold the property"],
  ["100 shadow bluff", "Neil Curtis", "Same agent listed and sold the property"],
  ["1001 Renella Simon", "NOAH NORRIS", "Same agent listed and sold the property"],
  ["1003 Walter Road", "Hannah Reeve", "Same agent listed and sold the property"],
  ["1013 Main St", "Brennan Gouaux", "Same agent listed and sold the property"],
  ["105 Hibiscus St", "Jason Ray", "Same address sold in different years"],
  ["106 Dunvegan Court", "Tony Cobarrubia", "Same agent listed and sold the property"],
  ["106 Oak Tree Park Dr", "Jason Ray", "Same agent listed and sold the property"],
  ["108 Bonita St", "MATTHEW DELCAMBRE", "Same agent listed and sold the property"],
  ["108 Wheat Circle", "Raelyn Payne", "Same agent listed and sold the property"],
  ["109 Countryview Dr.", "Hannah Reeve", "Same agent listed and sold the property"],
  ["109 Cranston Court", "Alyson Schexnayder", "Same agent listed and sold the property"],
  ["110 Drifting Sands Lane", "Becky Etzel", "Same agent listed and sold the property"],
  ["1103 Lee Ave", "Michele Ezell", "Same address sold in different years"],
  ["1117 N. Main St.", "Tyler Albrecht", "Same agent listed and sold the property"],
  ["114 Harvest Pointe Circle", "Tyler Albrecht", "Same agent listed and sold the property"],
  ["114 Souvenir Gate", "Tyler Albrecht", "Same agent listed and sold the property"],
  ["115 Woodhaven", "Tony Cobarrubia", "Same address sold in different years"],
  ["11520 LA Hwy 696", "Michele Ezell", "Same agent listed and sold the property"],
  ["117 Autumnbrook", "Tyler Albrecht", "Same agent listed and sold the property"],
  ["118 Veranda Pl", "Tony Cobarrubia", "Same agent listed and sold the property"],
  ["119 Ridgela Circle", "Tyler Albrecht", "Same agent listed and sold the property"],
  ["120 Breakers Way", "Debbie Foreman", "Same agent listed and sold the property"],
  ["120 Dwain Dr", "Hannah Reeve", "Same agent listed and sold the property"],
  ["120 Rue Fosse", "Brice Trahan", "Same agent listed and sold the property"],
  ["1215 W Main St", "Sean Landry", "Same agent listed and sold the property"],
  ["123 Sparrowhawk", "Adam Angers", "Same agent listed and sold the property"],
  ["123 Sweet Ridge Way", "Brennan Gouaux", "Same agent listed and sold the property"],
  ["129 Branton Drive", "Debbie Foreman", "Same agent listed and sold the property"],
  ["137 Branton", "Debbie Foreman", "Same agent listed and sold the property"],
  ["1507 Alice Dr", "Emily Babineaux", "Same agent listed and sold the property"],
  ["157 Coker Rd.", "Tyler Manuel", "Same agent listed and sold the property"],
  ["159 Antigua Circle", "Becky Etzel", "Same agent listed and sold the property"],
  ["159 Emerite Drive", "Charles Ditch", "Same agent listed and sold the property"],
  ["162 Twin Oaks", "Emily Babineaux", "Same agent listed and sold the property"],
  ["1913 W Congress St", "MATTHEW DELCAMBRE", "Same agent listed and sold the property"],
  ["2 Larkspur Lane", "Jason Ray", "Same agent listed and sold the property"],
  ["201 Settlers Trace #1404", "Lane Ortego", "Same agent listed and sold the property"],
  ["202 Elsinore Circle", "MATTHEW DELCAMBRE", "Same agent listed and sold the property"],
  ["203 E Main St", "Debbie Foreman", "Same agent listed and sold the property"],
  ["205 Hutton Lane", "Sean Landry", "Same agent listed and sold the property"],
  ["207 Thibodeaux Dr", "Emily Babineaux", "Same agent listed and sold the property"],
  ["207 Timber Mill", "Michele Ezell", "Same agent listed and sold the property"],
  ["207 Treasure Cove", "Leslie Guillory", "Leases 6+ months apart (separate lease periods)"],
  ["208 Bon Mange Circle", "Bridget Simon", "Same address sold in different years"],
  ["208 Debby Dr", "Michele Ezell", "Same agent listed and sold the property"],
  ["210 Claymore", "Amanda Talley", "Same agent listed and sold the property"],
  ["212 Twin Meadows", "Mariana Olivares", "Same agent listed and sold the property"],
  ["214 Cedar Crest Court", "Alyson Schexnayder", "Same agent listed and sold the property"],
  ["220 Bowers Rd.", "Katelyn Simon", "Same agent listed and sold the property"],
  ["220 Doucet 105A", "Michele Ezell", "Same agent listed and sold the property"],
  ["220 Doucet 125D", "Michele Ezell", "Same agent listed and sold the property"],
  ["224 harbor Bend Blvd", "Leslie Guillory", "Same address sold in different years"],
  ["2619 S Fieldspan Rd", "Jason Ray", "Same agent listed and sold the property"],
  ["300 Parkerson St.", "Erin Roussel", "Same agent listed and sold the property"],
  ["301 Villager Ave", "Jason Ray", "Same address sold in different years"],
  ["302 Superior Rd", "Leslie Guillory", "Same agent listed and sold the property"],
  ["307 Bayou Gardens Blvd", "Mariana Olivares", "Same address sold in different years"],
  ["309 Lafittes Landing", "Leslie Guillory", "Same address sold in different years"],
  ["312 Bertrand Unit 200", "Elise Landry", "Leases 6+ months apart (separate lease periods)"],
  ["315 Arrowwood Rd", "Amanda Kidder", "Same address sold in different years"],
  ["3400 W Pinhook", "Randy Foreman", "Same agent listed and sold the property"],
  ["3914 Carondolet", "Erica Stone", "Leases 6+ months apart (separate lease periods)"],
  ["403 S Buchanan Street #8", "Heather Guidroz", "Same agent listed and sold the property"],
  ["404 N. Railroad St.", "Sean Landry", "Same agent listed and sold the property"],
  ["404 Robinhood Circle", "Erin Roussel", "Same agent listed and sold the property"],
  ["4065 Parhams", "Shelley Denham", "Same agent listed and sold the property"],
  ["410 Doyle", "Adam Angers", "Same agent listed and sold the property"],
  ["410 Linden Lewis", "Lena Lavine", "Same address sold in different years"],
  ["415 Last Quarter Drive", "Alexis Gibbens", "Same agent listed and sold the property"],
  ["430 Planters Row", "Dyllan Hawkins", "Same agent listed and sold the property"],
  ["4411 Decon Road", "Mariana Olivares", "Same agent listed and sold the property"],
  ["450 Failla Rd", "Alison Martin", "Same address sold in different years"],
  ["4533 Johnston-F45", "Adam Angers", "Leases 6+ months apart (separate lease periods)"],
  ["4533 Johnston-F45", "Charles Ditch", "Leases 6+ months apart (separate lease periods)"],
  ["4533 Johnston-F45", "Alison Martin", "Leases 6+ months apart (separate lease periods)"],
  ["4551 Johnston", "Adam Angers", "Same agent listed and sold the property"],
  ["500 Chemin Metairie", "MATTHEW DELCAMBRE", "Same agent listed and sold the property"],
  ["500 King Arthurs Way", "Tyler Albrecht", "Same address sold in different years"],
  ["516 Alonda", "Ellen Bienvenu", "Same agent listed and sold the property"],
  ["518 Evangeline Drive", "Tyler Albrecht", "Same agent listed and sold the property"],
  ["600 Channel Drive", "Tyler Albrecht", "Same address sold in different years"],
  ["606 Rynella Rd.", "Erin Glynn", "Same agent listed and sold the property"],
  ["607 Evangeline Dr.", "Tyler Albrecht", "Same agent listed and sold the property"],
  ["702 W Bayou Pkway", "Emily Babineaux", "Same agent listed and sold the property"],
  ["710 Colorado Rd", "MATTHEW DELCAMBRE", "Same agent listed and sold the property"],
  ["8040 LA 82", "Leslie Guillory", "Same address sold in different years"],
  ["8234 & 8236 Keel Ave.", "Brennan Gouaux", "Same agent listed and sold the property"],
  ["9 Heatherstone Dr.", "Mariana Olivares", "Same agent listed and sold the property"],
  ["905 Jefferson", "Tyler Albrecht", "Leases 6+ months apart (separate lease periods)"],
  ["TBD Willie Young Road", "Charles Ditch", "Same agent listed and sold the property"],
];

export async function POST(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Load all transactions to build the key map
    const snap = await adminDb.collection('transactions').get();
    const transactions = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    // Build a map: normalizedAgent|||normalizedAddress -> actualKey (agentDisplayName|||normalizedAddress)
    const txKeyMap = new Map<string, string>();
    for (const tx of transactions) {
      const agent = (tx.agentDisplayName || tx.agentId || '').trim();
      const addr = normalize(tx.address || tx.propertyAddress || '');
      if (!agent || !addr) continue;
      const actualKey = `${agent}|||${addr}`;
      const lookupKey = `${normalize(agent)}|||${addr}`;
      if (!txKeyMap.has(lookupKey)) {
        txKeyMap.set(lookupKey, actualKey);
      }
    }

    const accepted: string[] = [];
    const notFound: { address: string; agent: string }[] = [];

    for (const [address, agentName] of ENTRIES) {
      const normAddr = normalize(address);
      const normAgent = normalize(agentName);
      const lookupKey = `${normAgent}|||${normAddr}`;
      const actualKey = txKeyMap.get(lookupKey);

      if (!actualKey) {
        notFound.push({ address, agent: agentName });
        continue;
      }

      if (!accepted.includes(actualKey)) {
        accepted.push(actualKey);
      }
    }

    // Persist accepted keys to Firestore in batches
    const COLLECTION = 'acceptedDuplicates';
    const BATCH_SIZE = 400;
    for (let i = 0; i < accepted.length; i += BATCH_SIZE) {
      const batch = adminDb.batch();
      const chunk = accepted.slice(i, i + BATCH_SIZE);
      for (const key of chunk) {
        const docId = Buffer.from(key).toString('base64url');
        batch.set(adminDb.collection(COLLECTION).doc(docId), {
          key,
          acceptedBy: 'bulk-migration-spreadsheet',
          acceptedAt: new Date().toISOString(),
        }, { merge: true });
      }
      await batch.commit();
    }

    return NextResponse.json({
      ok: true,
      totalEntries: ENTRIES.length,
      accepted: accepted.length,
      notFound: notFound.length,
      notFoundList: notFound,
    });
  } catch (err: any) {
    console.error('[bulk-accept-duplicates]', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
