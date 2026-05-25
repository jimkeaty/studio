import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initAdminApp } from '@/lib/firebase/admin';
import OpenAI from 'openai';

initAdminApp();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ─── Auth helper ─────────────────────────────────────────────────────── */
async function getUid(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return null;
  try {
    const decoded = await getAuth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

/* ─── System prompt ───────────────────────────────────────────────────── */
const SYSTEM_PROMPT = `You are a real estate transaction data extraction assistant. 
You will be given the full text of a purchase agreement / sales contract PDF.
Extract the fields listed below and return ONLY a valid JSON object — no markdown, no explanation.

For each field, also include a confidence score (0.0–1.0) in a parallel "_confidence" object.
Use 0.0 if the field was not found, 0.5 if inferred/uncertain, 1.0 if clearly stated.

Return this exact JSON shape:
{
  "fields": {
    "address": "",
    "salePrice": null,
    "listPrice": null,
    "contractDate": "",
    "projectedCloseDate": "",
    "inspectionDeadline": "",
    "surveyDeadline": "",
    "loanApplicationDeadline": "",
    "appraisalDeadline": "",
    "finalLoanCommitmentDeadline": "",
    "optionExpiration": "",
    "earnestMoney": null,
    "closingType": "",
    "dealType": "",
    "clientType": "",
    "buyerName": "",
    "buyerEmail": "",
    "buyerPhone": "",
    "buyer2Name": "",
    "buyer2Email": "",
    "buyer2Phone": "",
    "sellerName": "",
    "sellerEmail": "",
    "sellerPhone": "",
    "seller2Name": "",
    "seller2Email": "",
    "seller2Phone": "",
    "otherAgentName": "",
    "otherAgentEmail": "",
    "otherAgentPhone": "",
    "otherBrokerage": "",
    "mortgageCompany": "",
    "loanOfficer": "",
    "loanOfficerEmail": "",
    "loanOfficerPhone": "",
    "titleCompany": "",
    "titleOfficer": "",
    "titleOfficerEmail": "",
    "titleOfficerPhone": "",
    "titleAttorney": "",
    "inspectorName": "",
    "loanType": "",
    "loanAmount": null,
    "downPaymentAmount": null,
    "downPaymentPercent": null,
    "interestRate": null,
    "loanTerm": null,
    "financingContingency": "",
    "mineralRights": "",
    "mineralRightsClause": "",
    "homeWarranty": "",
    "homeWarrantyAmount": null,
    "homeWarrantyPaidBy": "",
    "occupancyAgreement": "",
    "occupancyDates": "",
    "sellerConcessions": null,
    "notes": ""
  },
  "_confidence": {
    "address": 0.0,
    "salePrice": 0.0,
    "contractDate": 0.0,
    "projectedCloseDate": 0.0,
    "inspectionDeadline": 0.0,
    "buyerName": 0.0,
    "sellerName": 0.0,
    "otherAgentName": 0.0,
    "mortgageCompany": 0.0,
    "titleCompany": 0.0,
    "loanType": 0.0,
    "loanAmount": 0.0,
    "mineralRights": 0.0,
    "financingContingency": 0.0
  }
}

Rules:
- Dates must be in YYYY-MM-DD format (e.g. "2025-06-15"). If only month/day/year text is found, convert it.
- Dollar amounts must be numbers only (no $ or commas). E.g. 425000 not "$425,000".
- closingType: infer from context — "buyer" if agent represents buyer, "listing" if agent represents seller, "dual" if both, "referral" if referral fee only.
- dealType: one of "residential_sale", "residential_lease", "land", "commercial_sale", "commercial_lease".
- clientType: "buyer", "seller", or "dual".
- mineralRights: "included", "excluded", "reserved", or "not_mentioned".
- loanType: e.g. "conventional", "FHA", "VA", "USDA", "cash", "owner_finance", or the exact text found.
- financingContingency: "yes", "no", or the contingency deadline date if found.
- For fields not found, use "" for strings and null for numbers.
- Do not invent data. Only extract what is clearly present in the document.`;

/* ─── POST /api/agent/parse-purchase-agreement ────────────────────────── */
export async function POST(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'pdf') {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
    }

    const maxBytes = 25 * 1024 * 1024; // 25 MB
    if (file.size > maxBytes) {
      return NextResponse.json({ error: 'File too large (max 25 MB)' }, { status: 400 });
    }

    // Extract text from PDF using pdf-parse
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let pdfText = '';
    try {
      // Dynamic import to avoid SSR issues
      const pdfParse = (await import('pdf-parse')).default;
      const parsed = await pdfParse(buffer);
      pdfText = parsed.text;
    } catch (err) {
      console.error('pdf-parse error:', err);
      return NextResponse.json({ error: 'Could not read PDF. Please ensure the file is not password-protected.' }, { status: 422 });
    }

    if (!pdfText || pdfText.trim().length < 100) {
      return NextResponse.json({ error: 'PDF appears to be a scanned image. Text extraction requires a text-based PDF.' }, { status: 422 });
    }

    // Truncate to ~60k chars to stay within token limits (purchase agreements are rarely longer)
    const truncated = pdfText.slice(0, 60000);

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      temperature: 0,
      max_tokens: 2000,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `PURCHASE AGREEMENT TEXT:\n\n${truncated}` },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() || '';

    // Parse JSON response
    let extracted: { fields: Record<string, unknown>; _confidence: Record<string, number> };
    try {
      // Strip markdown code fences if present
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
      extracted = JSON.parse(cleaned);
    } catch {
      console.error('OpenAI returned non-JSON:', raw.slice(0, 500));
      return NextResponse.json({ error: 'AI extraction failed to return valid data. Please fill the form manually.' }, { status: 422 });
    }

    return NextResponse.json({
      success: true,
      fields: extracted.fields || {},
      confidence: extracted._confidence || {},
      pdfName: file.name,
    });

  } catch (err: unknown) {
    console.error('parse-purchase-agreement error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Extraction failed: ${message}` }, { status: 500 });
  }
}
