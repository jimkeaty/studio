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
    "hasPrivateWell": false,
    "hasSepticSystem": false,
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
    "financingContingency": 0.0,
    "hasPrivateWell": 0.0,
    "hasSepticSystem": 0.0
  }
}

=== LOUISIANA LREC DATE CALCULATION RULES ===

This is a Louisiana LREC Residential Agreement to Buy and Sell. Dates are NOT written explicitly in the contract — they are CALCULATED from the Under Contract Date using the rules below.

1. UNDER CONTRACT DATE (= contractDate):

   STEP 1 — Check the disposition checkbox at contract line 445 (labeled "This offer is:").
   This checkbox will show one of three states:
     ☑ Accepted  → proceed to STEP 2A (use purchase agreement acceptance date)
     ☑ Rejected  → the contract was not accepted; leave contractDate as "" and set confidence to 0.0
     ☑ Countered → proceed to STEP 2B (ignore purchase agreement signature dates; use counter offer instead)
   If the checkbox is illegible or unclear, proceed to STEP 2A but set confidence to 0.3.

   STEP 2A — "Accepted" path (no counter offer):
   - The contractDate is the date/time written next to the LAST signature in the ACCEPTANCE block (lines 447–457).
   - Look for the seller's (or accepting party's) signature date on lines 447–457.
   - DO NOT use the date printed at the top of page 1 (the "DATE" field next to the property address) — that is the offer preparation date, not the acceptance date.
   - DO NOT use today's date or the upload date. Only use dates actually written next to signatures in this block.
   - If no acceptance signature date is found in this block, leave contractDate as "" and set confidence to 0.0.

   STEP 2B — "Countered" path (counter offer is attached):
   - IGNORE all signature dates on the main purchase agreement entirely.
   - Look for a separate COUNTER OFFER document attached to this upload (it may be labeled "Counter Offer", "Counter Proposal", or similar).
   - The counter offer will have its own signature blocks — typically one block for the party making the counter and one block for the party accepting it.
   - The contractDate is the date written next to the LAST acceptance signature on the counter offer (the signature of the party who accepted the counter, not the party who issued it).
   - If there are MULTIPLE counter offers (Counter #1, Counter #2, etc.), use the most recent accepted counter offer's last signature date.
   - If the counter offer is attached but has no acceptance signature date visible, leave contractDate as "" and set confidence to 0.0.
   - If you are uncertain which signature is the acceptance signature on the counter offer, leave contractDate as "" rather than guessing.

   COUNTER OFFER — SALE PRICE ADJUSTMENT:
   - Counter offers frequently modify the sale price. Look for a revised purchase price or sale price stated anywhere in the counter offer document.
   - Common phrasings: "Purchase Price shall be", "Sale Price is amended to", "Buyer agrees to pay", or a dollar amount written next to a price field.
   - If a new sale price is clearly stated in the counter offer, use that value for salePrice — it supersedes the price on the main purchase agreement.
   - If the counter offer is silent on price (does not mention it), keep the sale price from the main purchase agreement.
   - If there is ANY ambiguity about whether the counter offer changes the price, keep the main purchase agreement price and set salePrice confidence to 0.5.

   COUNTER OFFER — COMMISSION ADJUSTMENT:
   - Counter offers may also modify the buyer broker compensation (commissionPaidBySeller).
   - Look for any language in the counter offer that changes the commission, buyer broker fee, or compensation to the buyer's agent/broker.
   - Common phrasings: "Buyer Broker Compensation shall be", "Commission is amended to", or a new percentage written next to a commission field.
   - If a new commission percentage is clearly stated in the counter offer, use that value for commissionPaidBySeller — it supersedes line 338 of the main purchase agreement.
   - If the counter offer does not mention commission, use the value from line 338 of the main purchase agreement.
   - If there is ANY ambiguity about the commission change, return null for commissionPaidBySeller rather than guessing.

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

- buyerName / buyer2Name / buyerEmail / buyerPhone / buyer2Email / buyer2Phone:
  - Found in the OFFER signature block on pages 10–11 of the LREC form (contract lines 426–436).
  - Look for printed names on lines labeled "Print Buyer's/Seller's Full Name (First, Middle, Last)" where the checkbox ☐ Buyer's is checked.
  - Contract line 429 (left side) = buyerName. Contract line 429 (right side) = buyer2Name (if a second buyer).
  - Email and phone for buyers may appear in the Electronic Notice Authorization section at the top of the contract (page 1) next to the buyer's agent email block, or may not be present — if not clearly stated, leave blank.
  - IMPORTANT: Only extract names where the ☐ Buyer's checkbox is checked, NOT where ☐ Seller's is checked.

- sellerName / seller2Name / sellerEmail / sellerPhone / seller2Email / seller2Phone:
  - Found in the ACCEPTANCE signature block on pages 10–11 of the LREC form (contract lines 447–457).
  - Look for printed names on lines labeled "Print Buyer's/Seller's Full Name (First, Middle, Last)" where the checkbox ☐ Seller's is checked.
  - Contract line 456 (left side) = sellerName. Contract line 456 (right side) = seller2Name (if a second seller).
  - Email and phone for sellers may appear in the Electronic Notice Authorization section at the top of the contract (page 1), or may not be present — if not clearly stated, leave blank.
  - IMPORTANT: Only extract names where the ☐ Seller's checkbox is checked, NOT where ☐ Buyer's is checked.

- otherAgentName / otherAgentEmail / otherAgentPhone / otherBrokerage:
  - This is the COOPERATING AGENT — the agent on the OPPOSITE side from our agent.
  - At the very top of the LREC form (page 1, immediately below the property address), there are TWO agent blocks side by side:
    LEFT side: "Seller's Designated Agent Name & License Number" ("Seller's agent")
    RIGHT side: "Buyer's Designated Agent Name & License Number" ("Buyer's agent")
  - Each block has: Agent Name & License Number, Brokerage Name & License Number, Agent Phone, Brokerage Phone, Email Address.
  - To determine which block is the COOPERATING agent, look at which side our agent (the submitting agent) is on:
    * If our agent is the BUYER's agent → the cooperating agent is on the LEFT (Seller's Designated Agent block).
    * If our agent is the SELLER's agent → the cooperating agent is on the RIGHT (Buyer's Designated Agent block).
  - If you cannot determine which side our agent is on, default to extracting the Seller's Designated Agent block as otherAgentName.
  - otherBrokerage = the brokerage name from the cooperating agent's block.
  - otherAgentPhone = the agent phone number from the cooperating agent's block.
  - otherAgentEmail = the email address from the cooperating agent's block.

- depositHeldBy: Look for who is holding the earnest money deposit.
  - If it says "Listing Broker" or "Listing Agent's Broker", return "listing_broker".
  - If it says "Selling Broker" or "Buyer's Broker", return "selling_broker".
  - If it says a specific company name, return that company name.
  - If not found, return "".

- commissionPaidBySeller: Found at contract line 338, in the section titled "BUYER BROKER COMPENSATION".
  - The exact text reads: "BUYER BROKER COMPENSATION: At closing, SELLER shall pay __________________________ ($0 / 0% of Sale Price if left blank) toward the BUYER's Broker's compensation."
  - The blank is filled in with either a dollar amount OR a percentage. Extract the PERCENTAGE only as a number (e.g., "2.5%" → return 2.5, "3%" → return 3).
  - If only a dollar amount is filled in (no percentage), return null — do not calculate or guess the percentage.
  - If the blank is left empty or shows "$0 / 0%", return null.
  - If a COUNTER OFFER modifies this amount, use the counter offer value — it supersedes.
  - If there is ANY ambiguity about the percentage, return null. NEVER default to 3 — only return a value if clearly stated.
  - If not found or not applicable, return null.

- homeWarranty: Look for a home service/warranty plan clause (typically labeled "Home Service/Warranty" or similar).
  - If the contract states a warranty plan WILL be purchased at closing, return "yes".
  - If the contract states a warranty plan will NOT be purchased, return "no".
  - If it is unclear, crossed out, or not mentioned, return "".

- homeWarrantyAmount: The maximum dollar amount for the warranty plan (e.g., "not to exceed $700" → return 700).
  - Return as a number only. If not stated, return null.

- homeWarrantyPaidBy: Who is paying for the warranty plan.
  - Return "seller" if the seller is paying.
  - Return "buyer" if the buyer is paying.
  - IMPORTANT: If a COUNTER OFFER changes who is paying, the counter offer supersedes — use the counter offer value.
  - If there is ANY confusion or ambiguity about who is paying, return "" (leave blank). It is always better to leave blank than to guess.
  - If not stated, return "".

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
- Do not invent data. Only extract what is clearly present in the document.

=== PRIVATE WELL AND SEPTIC/SEWER DETECTION ===

- hasPrivateWell (boolean): Set to true if the contract indicates the property has a private water well.
  - Look in the "Private Water/Sewer" section of the LREC contract (typically a section titled "Private Water and/or Sewer" or similar).
  - Also look for any checkbox, clause, or notation indicating "private well", "water well", "well water", or "private water supply".
  - If a well inspection is mentioned or required, set to true.
  - If the property is on municipal/city water only, set to false.
  - Default: false.

- hasSepticSystem (boolean): Set to true if the contract indicates the property has a septic system or private sewer.
  - Look in the "Private Water/Sewer" section of the LREC contract.
  - Also look for any checkbox, clause, or notation indicating "septic", "septic tank", "private sewer", "sewer system", or "on-site sewage".
  - If a septic inspection is mentioned or required, set to true.
  - If the property is on municipal/city sewer only, set to false.
  - Default: false.`;

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
