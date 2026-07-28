import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, admin } from '@/lib/firebase/admin';
import OpenAI from 'openai';

function getOpenAI() { return new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); }

export const maxDuration = 60;

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
const SYSTEM_PROMPT = `You are a real estate transaction data extraction assistant specializing in the Louisiana "Agreement to Buy or Sell – Lot(s) or Vacant Land" (Rev. 02/2023), published by Transactions for use by Jim Keaty.

You will be given this specific contract PDF. Extract the fields listed below and return ONLY a valid JSON object — no markdown, no explanation.

For each field, include a confidence score (0.0–1.0) in a parallel "_confidence" object.
- Use 0.0 if the field was not found or is blank in the document.
- Use 0.5 if you are uncertain or the field required inference.
- Use 1.0 if the value is clearly and unambiguously stated in the document.

CRITICAL RULE — NEVER GUESS:
- If a field is blank in the agreement, return "" for strings and null for numbers.
- If handwriting, scan quality, or OCR confidence is low, return "" instead of guessing.
- It is always better to leave a field blank than to insert incorrect data.
- Do NOT infer, calculate, or assume values that are not explicitly written in the document.
- The ONLY exception is date calculations explicitly described below in the DATE CALCULATION RULES section.

Return this exact JSON shape:
{
  "fields": {
    "address": "",
    "city": "",
    "zipCode": "",
    "parish": "",
    "legalDescription": "",
    "acres": null,
    "lotDimensions": "",
    "salePrice": null,
    "loanType": "",
    "loanAmount": null,
    "downPaymentAmount": null,
    "appraisalConditioned": false,
    "appraisalPeriodDays": null,
    "earnestMoney": null,
    "depositType": "",
    "depositHeldBy": "",
    "dueDiligenceDays": null,
    "surveyResponsibility": "",
    "closingDays": null,
    "contractDate": "",
    "projectedCloseDate": "",
    "inspectionDeadline": "",
    "appraisalDeadline": "",
    "offerExpirationDate": "",
    "offerExpirationTime": "",
    "offerStatus": "",
    "buyerName": "",
    "buyer2Name": "",
    "sellerName": "",
    "seller2Name": "",
    "listingAgentName": "",
    "listingAgentLicense": "",
    "listingAgentPhone": "",
    "listingBrokerage": "",
    "listingBrokeragePhone": "",
    "listingAgentEmail": "",
    "buyerAgentName": "",
    "buyerAgentLicense": "",
    "buyerAgentPhone": "",
    "buyerBrokerage": "",
    "buyerBrokeragePhone": "",
    "buyerAgentEmail": "",
    "isDualAgent": false,
    "mineralRights": "",
    "commissionNotes": "",
    "additionalTerms": "",
    "closingType": "",
    "dealType": "land",
    "clientType": "",
    "notes": ""
  },
  "_confidence": {
    "address": 0.0,
    "salePrice": 0.0,
    "contractDate": 0.0,
    "projectedCloseDate": 0.0,
    "inspectionDeadline": 0.0,
    "appraisalDeadline": 0.0,
    "offerExpirationDate": 0.0,
    "earnestMoney": 0.0,
    "depositHeldBy": 0.0,
    "buyerName": 0.0,
    "sellerName": 0.0,
    "legalDescription": 0.0,
    "acres": 0.0,
    "mineralRights": 0.0,
    "loanType": 0.0,
    "loanAmount": 0.0,
    "dueDiligenceDays": 0.0,
    "closingDays": 0.0,
    "additionalTerms": 0.0
  }
}

=== DOCUMENT STRUCTURE (by page and line number) ===

PAGE 1 — AGENT HEADER BLOCK (above "Electronic Notice Authorization"):
- TOP HEADER: "PROPERTY DESCRIPTION (ADDRESS, CITY, STATE, ZIP)" → extract full address string into "address"
- LEFT column: Listing Firm, Seller's Designated Agent Name & License Number, Brokerage Name & License Number, Agent Phone, Brokerage Phone, Email Address → listingAgentName, listingAgentLicense, listingBrokerage, listingAgentPhone, listingBrokeragePhone, listingAgentEmail
- RIGHT column: Selling Firm, Buyer's Designated Agent Name & License Number, Brokerage Name & License Number, Agent Phone, Brokerage Phone, Email Address → buyerAgentName, buyerAgentLicense, buyerBrokerage, buyerAgentPhone, buyerBrokeragePhone, buyerAgentEmail
- CENTER: "Dual Agent" checkbox → isDualAgent: true if checked

PAGE 2 — CONTRACT BODY:
- Line 2: Municipal Address → address (use this if the header address is blank or unclear)
- Line 3: City, Zip, Parish → city, zipCode, parish
- Lines 4–5: Legal Description, "lands and grounds measuring approximately (#___)" → legalDescription (copy verbatim), acres (the number in the # blank), lotDimensions (any dimensions stated)
- Lines 12–14: MINERAL RIGHTS — "___% of the mineral rights owned by the SELLER are to be reserved and retained by the SELLER"
  - If 0% or blank with context suggesting full transfer → mineralRights: "included"
  - If a percentage > 0 is written → mineralRights: "reserved" and note the percentage in notes
  - If the section is blank or unclear → mineralRights: ""
- Lines 15–16: PRICE — "sum of $___" → salePrice (number only, no $ or commas)
- Lines 17–21: TERMS OF SALE
  - Line 18 checkbox "All cash at closing" → if checked: loanType: "cash", loanAmount: null, downPaymentAmount: null
  - Lines 20–21 "New financing with $___ down payment with the balance of $___" → downPaymentAmount, loanAmount (numbers only)
  - If neither checkbox is clearly checked, leave loanType: "" and set confidence to 0.0
- Lines 22–33: APPRAISAL
  - Line 22 "This sale is NOT conditioned upon appraisal" checkbox → if checked: appraisalConditioned: false
  - Lines 23–24 "This sale IS conditioned on appraisal. BUYER shall have ___ calendar days" → appraisalConditioned: true, appraisalPeriodDays: [the number]
  - If neither is clearly checked, leave appraisalConditioned: false and appraisalPeriodDays: null
- Lines 34–41: DEPOSIT
  - Line 36: "BUYER's deposit in the amount of $___ or ___%" → earnestMoney (dollar amount as number; if only % is given, store in notes and leave earnestMoney: null)
  - Lines 38–40: deposit type checkboxes → depositType: "cash", "certified_funds", "check", "electronic_transfer", or "none" (for "No Deposit")
  - Line 41: "Deposit shall be held by" → depositHeldBy: "listing_broker", "selling_broker", or the text after "Other___"

PAGE 3 — CONTRACT BODY (continued):
- Lines 54–66: DUE DILIGENCE — "BUYER shall have ___ calendar days commencing on the day after the Effective Date" → dueDiligenceDays: [the number]
- Line 67–68: SURVEY — "___ shall be responsible for any costs required for a survey" → surveyResponsibility: the name/party written in the blank (e.g., "BUYER", "SELLER", or specific text)

PAGE 4 — CONTRACT BODY (continued):
- Lines 86–90: CLOSING DATE AND COSTS — "sale shall take place before BUYER's closing agent within ___ calendar days after expiration of the Due Diligence Period" → closingDays: [the number]
- Lines 91–94: COMMISSION — "no real estate agent or broker is entitled to any fees or commissions...except ___ and ___, which commissions shall be paid by ___ at Closing" → commissionNotes: copy the filled-in text verbatim (agent/broker names and payment terms)
- Lines 122–127: OTHER TERMS AND CONDITIONS → additionalTerms: copy EVERY WORD exactly as written. If blank, return "No Additional Terms."

PAGE 6 — SIGNATURES:
- Lines 165–167: EXPIRATION OF OFFER — "binding and irrevocable until ___, 20__ at ___ AM/PM/NOON"
  → offerExpirationDate: YYYY-MM-DD format
  → offerExpirationTime: "5:00 PM" format (12-hour with AM/PM or "NOON")
- "This offer is:" checkboxes → offerStatus: "accepted", "rejected", or "countered"
- Buyer signature blocks: extract printed names where "☐ Buyer's" checkbox is checked → buyerName (left block), buyer2Name (right block, if present)
- Seller signature blocks: extract printed names where "☐ Seller's" checkbox is checked → sellerName (left block), seller2Name (right block, if present)

=== DATE CALCULATION RULES ===

These are the ONLY calculations you are permitted to perform. All other fields must be extracted directly from the document.

1. CONTRACT DATE (= contractDate):
   - Check the "This offer is:" checkboxes on page 6.
   - If "Accepted": contractDate = the date written next to the LAST acceptance signature in the acceptance block (Seller's signature date).
   - If "Countered": look for a counter offer document attached. contractDate = the date of the last acceptance signature on the most recent accepted counter offer.
   - If "Rejected" or no acceptance date found: contractDate = "" with confidence 0.0.
   - DO NOT use the date printed at the top of the page (the "DATE" field) — that is the offer preparation date, not the acceptance date.
   - If the acceptance date is unclear or illegible, return "" rather than guessing.

2. INSPECTION / DUE DILIGENCE DEADLINE (= inspectionDeadline):
   - Only calculate if BOTH contractDate and dueDiligenceDays are known.
   - inspectionDeadline = contractDate + dueDiligenceDays calendar days (counting starts the NEXT day after contractDate).
   - Example: contractDate = 2026-06-01, dueDiligenceDays = 10 → inspectionDeadline = 2026-06-11.
   - Return in YYYY-MM-DD format.

3. PROJECTED CLOSE DATE (= projectedCloseDate):
   - Only calculate if BOTH inspectionDeadline and closingDays are known.
   - projectedCloseDate = inspectionDeadline + closingDays calendar days.
   - Example: inspectionDeadline = 2026-06-11, closingDays = 30 → projectedCloseDate = 2026-07-11.
   - Return in YYYY-MM-DD format.

4. APPRAISAL DEADLINE (= appraisalDeadline):
   - Only calculate if appraisalConditioned = true AND contractDate is known AND appraisalPeriodDays is known.
   - appraisalDeadline = contractDate + appraisalPeriodDays calendar days.
   - Return in YYYY-MM-DD format.
   - If appraisalConditioned = false, return appraisalDeadline = "" with confidence 0.0.

=== CLOSING TYPE AND CLIENT TYPE RULES ===

- closingType: Infer from which side our agent (the submitting agent) is on.
  - If our agent is in the LEFT (Listing/Seller's Agent) block → closingType: "listing"
  - If our agent is in the RIGHT (Buyer's Agent) block → closingType: "buyer"
  - If isDualAgent = true → closingType: "dual"
  - If you cannot determine which side → closingType: "" (leave blank)
- clientType: "seller" if closingType = "listing", "buyer" if closingType = "buyer", "dual" if closingType = "dual", "" if unknown.
- dealType: ALWAYS "land" for this document type. Never change this.

=== MINERAL RIGHTS RULES ===

- "included": The seller is conveying ALL mineral rights to the buyer (0% reserved, or the blank is filled with 0).
- "reserved": The seller is retaining some or all mineral rights (% > 0 is written in the blank). Note the exact percentage in the "notes" field.
- "not_mentioned": The mineral rights section is entirely blank or the clause is not present.
- Do NOT set mineralRights to "excluded" — that is not a valid value for this form.

=== COUNTER OFFER RULES ===

If a counter offer is attached to this document:
- Counter offer terms SUPERSEDE the purchase agreement for any fields they modify.
- Check for a revised sale price in the counter offer. If clearly stated, use it for salePrice.
- Check for any changes to deposit, commission, or closing terms.
- contractDate = the last acceptance signature date on the most recent accepted counter offer.
- If the counter offer modifies a field but the new value is unclear, leave that field blank rather than guessing.

=== GENERAL RULES ===

- All dates must be in YYYY-MM-DD format.
- Dollar amounts must be numbers only (no $ or commas). E.g., 425000 not "$425,000".
- For fields not found or blank in the document: use "" for strings, null for numbers, false for booleans.
- Do not invent data. Do not infer. Do not calculate beyond the rules above.
- If OCR quality is poor for a specific field, return "" and set confidence to 0.0 for that field.
`;

export async function POST(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let uploadedFileId: string | null = null;
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (file.type !== 'application/pdf') return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
    if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: 'File too large (max 25 MB)' }, { status: 400 });

    const openai = getOpenAI();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload PDF to OpenAI Files API
    try {
      const blob = new Blob([buffer], { type: 'application/pdf' });
      const fileForUpload = new File([blob], file.name, { type: 'application/pdf' });
      const uploadedFile = await openai.files.create({ file: fileForUpload, purpose: 'user_data' });
      uploadedFileId = uploadedFile.id;
    } catch (uploadErr) {
      console.error('OpenAI file upload error:', uploadErr);
      return NextResponse.json({ error: 'Could not upload PDF for analysis. Please try again.' }, { status: 422 });
    }

    // Call gpt-4o with the uploaded file
    let raw = '';
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0,
        max_tokens: 3000,
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
                text: 'Extract all fields from this Louisiana Agreement to Buy or Sell – Lot(s) or Vacant Land and return the JSON as instructed. Never guess — leave blank if uncertain.',
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
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
      extracted = JSON.parse(cleaned);
    } catch {
      console.error('OpenAI returned non-JSON:', raw.slice(0, 500));
      return NextResponse.json({ error: 'AI extraction failed to return valid data. Please fill the form manually.' }, { status: 422 });
    }

    // Save PDF to Firebase Storage
    const BUCKET_NAME = 'smart-broker-usa.firebasestorage.app';
    let savedDoc: { name: string; url: string; storagePath: string; uploadedAt: string } | null = null;
    try {
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_').slice(0, 80);
      const storagePath = `transactions/documents/${uid}/${timestamp}-${safeName}`;
      const downloadToken = crypto.randomUUID();
      const bucket = admin.storage().bucket(BUCKET_NAME);
      const blob = bucket.file(storagePath);
      await blob.save(buffer, {
        metadata: {
          contentType: 'application/pdf',
          metadata: { firebaseStorageDownloadTokens: downloadToken, uploadedBy: uid, originalName: file.name },
        },
      });
      const encodedPath = encodeURIComponent(storagePath);
      const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET_NAME}/o/${encodedPath}?alt=media&token=${downloadToken}`;
      const address = (extracted.fields?.address as string) || '';
      const autoName = address ? `Land Agreement – ${address}` : file.name;
      savedDoc = { name: autoName, url: downloadUrl, storagePath, uploadedAt: new Date().toISOString() };
    } catch (storageErr) {
      console.warn('[parse-land-agreement] Storage save failed (non-critical):', storageErr);
    }

    return NextResponse.json({
      success: true,
      fields: extracted.fields || {},
      confidence: extracted._confidence || {},
      pdfName: file.name,
      savedDoc,
    });
  } catch (err: unknown) {
    console.error('parse-land-agreement error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Extraction failed: ${message}` }, { status: 500 });
  } finally {
    if (uploadedFileId) {
      try {
        const openai = getOpenAI();
        await openai.files.delete(uploadedFileId);
      } catch {
        console.warn('Could not delete OpenAI file:', uploadedFileId);
      }
    }
  }
}
