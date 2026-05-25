import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import OpenAI from 'openai';

// OpenAI client initialized inside handler — avoids build-time crash when env var is absent
function getOpenAI() { return new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); }

// Maximum request body size for Next.js App Router
export const maxDuration = 60; // seconds (Firebase App Hosting supports up to 60s)

/* ─── Auth helper ─────────────────────────────────────────────────────── */
async function getUid(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

/* ─── System prompt ───────────────────────────────────────────────────── */
const SYSTEM_PROMPT = `You are a real estate transaction data extraction assistant specializing in Louisiana LREC (Louisiana Real Estate Commission) purchase agreements.
You will be given a purchase agreement / sales contract PDF.
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
    "titleDeadline": "",
    "offerExpirationDate": "",
    "offerExpirationTime": "",
    "earnestMoney": null,
    "depositHeldBy": "",
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
    "commissionPaidBySeller": null,
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
    "loanApplicationDeadline": 0.0,
    "appraisalDeadline": 0.0,
    "finalLoanCommitmentDeadline": 0.0,
    "titleDeadline": 0.0,
    "offerExpirationDate": 0.0,
    "buyerName": 0.0,
    "sellerName": 0.0,
    "otherAgentName": 0.0,
    "depositHeldBy": 0.0,
    "commissionPaidBySeller": 0.0,
    "mortgageCompany": 0.0,
    "titleCompany": 0.0,
    "loanType": 0.0,
    "loanAmount": 0.0,
    "mineralRights": 0.0,
    "financingContingency": 0.0
  }
}

=== LOUISIANA LREC DATE CALCULATION RULES ===

This is a Louisiana LREC Residential Agreement to Buy and Sell. Dates are NOT written explicitly in the contract — they are CALCULATED from the Under Contract Date using the rules below.

1. UNDER CONTRACT DATE (= contractDate):
   - This is the date of the LAST signature on the purchase agreement OR the counter offer (whichever is most recent).
   - Look for the most recent signature date among all parties (buyer and seller).
   - This is the "date of acceptance" and the "commencement" date.

2. LOAN APPLICATION DEADLINE (= loanApplicationDeadline):
   - Found in the Financing section: "written authorization to lender to proceed with the loan approval process within __ calendar days after the date of acceptance."
   - The blank is typically filled with 5.
   - Calculate: contractDate + 5 calendar days (counting starts the NEXT day after contractDate).
   - Example: contractDate = May 25, 2026 → loanApplicationDeadline = May 30, 2026.

3. INSPECTION DEADLINE (= inspectionDeadline):
   - Found in the Due Diligence and Inspection Period section: "__ calendar days after commencement."
   - The blank is typically filled with 7.
   - Calculate: contractDate + 7 calendar days (counting starts the NEXT day after contractDate).
   - Example: contractDate = May 25, 2026 → inspectionDeadline = June 1, 2026.

4. SURVEY DEADLINE (= surveyDeadline):
   - Same date as inspectionDeadline.

5. APPRAISAL DEADLINE (= appraisalDeadline):
   - Calculate: projectedCloseDate − 10 calendar days.
   - Example: projectedCloseDate = July 1, 2026 → appraisalDeadline = June 21, 2026.

6. FINAL LOAN COMMITMENT DEADLINE (= finalLoanCommitmentDeadline):
   - Calculate: projectedCloseDate − 5 calendar days.
   - Example: projectedCloseDate = July 1, 2026 → finalLoanCommitmentDeadline = June 26, 2026.

7. TITLE DEADLINE (= titleDeadline):
   - Calculate: projectedCloseDate − 3 calendar days.
   - Example: projectedCloseDate = July 1, 2026 → titleDeadline = June 28, 2026.

8. OFFER EXPIRATION (= offerExpirationDate + offerExpirationTime):
   - Found in the "Expiration of Offer" section of the contract.
   - Extract the date and time exactly as written (e.g., "May 26, 2026 at 5:00 PM").
   - offerExpirationDate: YYYY-MM-DD format.
   - offerExpirationTime: 12-hour format string, e.g. "5:00 PM".

IMPORTANT: If the contractDate is not yet known (e.g., the contract has not been signed yet), leave all calculated date fields as "" and set their confidence to 0.0. If the contractDate IS present, you MUST calculate all derived dates using the rules above.

=== PEOPLE AND CONTACT FIELDS ===

- buyerName / buyer2Name: Found in the Buyers section of the contract (typically near the bottom, in the signature/party identification area).
  - If two buyers are listed, put the first in buyerName and the second in buyer2Name.

- sellerName / seller2Name: Found in the Sellers section of the contract.
  - If two sellers are listed, put the first in sellerName and the second in seller2Name.

- otherAgentName: This is the COOPERATING AGENT — specifically the "Seller's Designated Agent" listed at the TOP of the purchase agreement.
  - Their brokerage name goes in otherBrokerage.
  - Their phone/email goes in otherAgentPhone / otherAgentEmail.

- depositHeldBy: Look for who is holding the earnest money deposit.
  - If it says "Listing Broker" or "Listing Agent's Broker", return "listing_broker".
  - If it says "Selling Broker" or "Buyer's Broker", return "selling_broker".
  - If it says a specific company name, return that company name.
  - If not found, return "".

- commissionPaidBySeller: Look for a clause where the seller agrees to pay the buyer's broker/agent a commission.
  - Extract the percentage as a number (e.g., if it says "3% of the purchase price", return 3).
  - If not found or not applicable, return null.

=== GENERAL RULES ===

- Dates must be in YYYY-MM-DD format (e.g. "2025-06-15"). If only month/day/year text is found, convert it.
- Dollar amounts must be numbers only (no $ or commas). E.g. 425000 not "$425,000".
- Percentages must be numbers only (e.g. 3 not "3%").
- closingType: infer from context — "buyer" if agent represents buyer, "listing" if agent represents seller, "dual" if both, "referral" if referral fee only.
- dealType: one of "residential_sale", "residential_lease", "land", "commercial_sale", "commercial_lease".
- clientType: "buyer", "seller", or "dual".
- mineralRights: "included", "excluded", "reserved", or "not_mentioned".
- loanType: e.g. "conventional", "FHA", "VA", "USDA", "cash", "owner_finance", or the exact text found.
- financingContingency: "yes", "no", or the contingency deadline date if found.
- If a COUNTER OFFER is present in the document, its terms SUPERSEDE the purchase agreement for any fields it modifies. Always use the most recent/final agreed-upon values.
- For fields not found, use "" for strings and null for numbers.
- Do not invent data. Only extract what is clearly present in the document.`;

/* ─── POST /api/agent/parse-purchase-agreement ────────────────────────── */
export async function POST(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const openai = getOpenAI();
  let uploadedFileId: string | null = null;

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

    // Upload PDF to OpenAI Files API so gpt-4o can read it natively.
    // This handles Authentisign/LREC custom font encoding that breaks text extraction.
    // gpt-4o extracts both text and page images from PDFs automatically.
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    try {
      const blob = new Blob([buffer], { type: 'application/pdf' });
      const fileForUpload = new File([blob], file.name, { type: 'application/pdf' });
      const uploadedFile = await openai.files.create({
        file: fileForUpload,
        purpose: 'user_data',
      });
      uploadedFileId = uploadedFile.id;
    } catch (uploadErr) {
      console.error('OpenAI file upload error:', uploadErr);
      return NextResponse.json({
        error: 'Could not upload PDF for analysis. Please try again.',
      }, { status: 422 });
    }

    // Call gpt-4o with the uploaded file — it extracts both text and page images
    let raw = '';
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0,
        max_tokens: 2048,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                type: 'file' as any,
                file: { file_id: uploadedFileId },
              },
              {
                type: 'text',
                text: 'Extract all fields from this purchase agreement and return the JSON as instructed.',
              },
            ],
          },
        ],
      });
      raw = completion.choices[0]?.message?.content?.trim() || '';
    } catch (aiErr) {
      console.error('OpenAI extraction error:', aiErr);
      return NextResponse.json({ error: 'AI extraction failed. Please fill the form manually.' }, { status: 422 });
    }

    if (!raw) {
      return NextResponse.json({ error: 'AI extraction returned no data. Please fill the form manually.' }, { status: 422 });
    }

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
  } finally {
    // Clean up the uploaded file from OpenAI to avoid storage accumulation
    if (uploadedFileId) {
      try {
        await openai.files.delete(uploadedFileId);
      } catch {
        // Non-critical — log but don't fail the request
        console.warn('Could not delete OpenAI file:', uploadedFileId);
      }
    }
  }
}
