import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { admin } from '@/lib/firebase/admin';
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
const SYSTEM_PROMPT = `You are a real estate transaction data extraction assistant specializing in the Louisiana "Commercial Agreement to Buy and Sell" (Rev. 03/2020), published by Transactions for use by Jim Keaty.

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
- For the "additionalTerms" field (lines 165–175): copy EVERY WORD exactly as written. Do NOT summarize or paraphrase.
- If a required field is blank in the document, return "Not Provided." for string fields (except dates and numbers).
- If handwriting or scan quality prevents accurate reading, return "Unable to determine from document." for that field.

Return this exact JSON shape:
{
  "fields": {
    "address": "",
    "legalDescription": "",
    "approximateLotSize": "",
    "salePrice": null,
    "loanType": "",
    "loanAmount": null,
    "downPaymentAmount": null,
    "financingCommitmentDays": null,
    "financingCommitmentDeadline": "",
    "appraisalConditioned": false,
    "appraisalPeriodDays": null,
    "appraisalDeadline": "",
    "earnestMoney": null,
    "depositDueDays": null,
    "depositHeldBy": "",
    "dueDiligenceDays": null,
    "inspectionDeadline": "",
    "surveyResponsibility": "",
    "serviceContractDisclosureDays": null,
    "mineralRights": "",
    "titleCurativeDays": null,
    "closingDays": null,
    "projectedCloseDate": "",
    "contractDate": "",
    "offerExpirationDate": "",
    "offerExpirationTime": "",
    "offerStatus": "",
    "buyerName": "",
    "buyer2Name": "",
    "buyerTitle": "",
    "sellerName": "",
    "seller2Name": "",
    "sellerTitle": "",
    "listingAgentName": "",
    "listingAgentPhone": "",
    "listingBrokerage": "",
    "buyerAgentName": "",
    "buyerAgentPhone": "",
    "buyerBrokerage": "",
    "sellerFax": "",
    "sellerEmail": "",
    "buyerFax": "",
    "buyerEmail": "",
    "commissionNotes": "",
    "additionalTerms": "",
    "closingType": "",
    "dealType": "commercial_sale",
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
    "approximateLotSize": 0.0,
    "mineralRights": 0.0,
    "loanType": 0.0,
    "loanAmount": 0.0,
    "dueDiligenceDays": 0.0,
    "closingDays": 0.0,
    "additionalTerms": 0.0,
    "commissionNotes": 0.0,
    "financingCommitmentDeadline": 0.0
  }
}

=== DOCUMENT STRUCTURE (by page and line number) ===

PAGE 1 — AGENT HEADER BLOCK:
- TOP HEADER ROW: "Listing Firm", "Seller's Agent", "Phone" → listingBrokerage, listingAgentName, listingAgentPhone
- SECOND HEADER ROW: "Selling Firm", "Buyer's Agent", "Phone" → buyerBrokerage, buyerAgentName, buyerAgentPhone
- "Received by Designated Agent" row: note if the same agent appears on both sides (dual agency indicator)
- Line 1: "The undersigned agree to buy and sell the Subject Property upon the terms and conditions stated below."
- Line 3: SUBJECT PROPERTY blank → address (full property address as written)
- Lines 4–5: LEGAL DESCRIPTION blank → legalDescription (copy verbatim)
- Line 13: APPROXIMATE LOT SIZE blank → approximateLotSize (copy as written, e.g., "2.5 acres" or "100x200 ft")
- Line 15: SALE PRICE: $ blank → salePrice (number only, no $ or commas)
- Lines 17–24: TERMS OF SALE
  - Line 18 checkbox "All cash at closing" → if checked: loanType: "cash", loanAmount: null, downPaymentAmount: null
  - Lines 19–23 "New financing with $__ down payment with the balance of $__ upon terms and conditions acceptable to the Buyer" → downPaymentAmount, loanAmount (numbers only)
  - Line 22: "within ___ calendar days after the Effective Date" → financingCommitmentDays: [the number]
  - If neither checkbox is clearly checked, leave loanType: "" and set confidence to 0.0
- Lines 26–38: APPRAISAL
  - Line 26 "This sale is NOT conditioned upon appraisal" checkbox → if checked: appraisalConditioned: false
  - Lines 27–28 "This sale IS conditioned on appraisal. Buyer shall have ___ calendar days commencing on the day after the Effective Date" → appraisalConditioned: true, appraisalPeriodDays: [the number]
  - If neither is clearly checked, leave appraisalConditioned: false and appraisalPeriodDays: null
- Lines 40–44: DEPOSIT
  - Line 41: "Buyer agrees to deposit the sum of $___" → earnestMoney (number only)
  - Line 41: "within ___ calendar days" → depositDueDays: [the number]
  - Line 41: "with ___" → depositHeldBy: the name/party written in the blank

PAGE 2 — CONTRACT BODY:
- Lines 55–69: DUE DILIGENCE — "Buyer shall have ___ calendar days commencing on the day after the Effective Date" → dueDiligenceDays: [the number]
- Lines 71–72: SURVEY — "___ shall be responsible for any costs required for a survey or replatting of the Subject Property" → surveyResponsibility: the party written in the blank (e.g., "BUYER", "SELLER")
- Lines 93–95: CONTRACTS FOR SERVICES — "Seller shall disclose all service contracts within ___ calendar days of accepted offer" → serviceContractDisclosureDays: [the number]

PAGE 3 — CONTRACT BODY (continued):
- Lines 100–104: MINERAL RIGHTS — "___ % of the mineral rights owned by Seller are to be reserved by Seller"
  - If 0% or blank with context suggesting full transfer → mineralRights: "included"
  - If a percentage > 0 is written → mineralRights: "reserved" and note the exact percentage in the "notes" field
  - If blank or unclear → mineralRights: ""
- Lines 106–113: TITLE — "Buyer's title examination shall disclose defects in the title, Seller shall have ___ (___ ) calendar days from receipt of notice" → titleCurativeDays: [the number]
- Lines 115–120: CLOSING DATE AND COSTS — "The sale shall take place before Buyer's closing agent within ___ calendar days after expiration of the Due Diligence Period" → closingDays: [the number]
- Lines 122–125: COMMISSION — "no real estate agent or broker is entitled to any fees or commissions...except ___ and ___, which commissions shall be paid by ___ at Closing" → commissionNotes: copy the filled-in text verbatim (broker/agent names and payment terms)
- Lines 127–142: NOTICES — Seller and Buyer contact blocks
  - Seller Fax → sellerFax
  - Seller Email → sellerEmail
  - Buyer Fax → buyerFax
  - Buyer Email → buyerEmail

PAGE 4 — ADDITIONAL TERMS:
- Lines 165–175: OTHER TERMS AND CONDITIONS → additionalTerms: copy EVERY WORD exactly as written. Do NOT summarize. If blank, return "No Additional Terms."

PAGE 5 — SIGNATURES:
- Lines 216–217: EXPIRATION OF OFFER — "This offer shall expire ___ (time) ___ (date)"
  → offerExpirationDate: YYYY-MM-DD format
  → offerExpirationTime: "5:00 PM" format (12-hour with AM/PM)
- Lines 220–229: BUYER signature blocks
  - Line 223: "Printed Full Legal Name/Title" (first buyer) → buyerName, buyerTitle
  - Line 229: "Printed Full Legal Name/Title" (second buyer, if present) → buyer2Name
- Lines 231–234: ACCEPTANCE block
  - Checkbox "as written" → offerStatus: "accepted"
  - Checkbox "as per counter offer or addendum" → offerStatus: "countered"
  - If neither is checked → offerStatus: ""
- Lines 236–245: SELLER signature blocks
  - Line 239: "Printed Full Legal Name/Title" (first seller) → sellerName, sellerTitle
  - Line 245: "Printed Full Legal Name/Title" (second seller, if present) → seller2Name
  - The date written next to the seller's acceptance signature → contractDate (YYYY-MM-DD)

=== DATE CALCULATION RULES ===

These are the ONLY calculations you are permitted to perform. All other fields must be extracted directly from the document.

1. CONTRACT DATE (= contractDate):
   - contractDate = the date written next to the LAST seller acceptance signature (lines 236–245).
   - If "as per counter offer or addendum" is checked, look for a counter offer document attached. contractDate = the date of the last acceptance signature on the most recent accepted counter offer.
   - If no acceptance date is found or it is illegible, return contractDate: "" with confidence 0.0.
   - DO NOT use the "Received by Designated Agent" date at the top — that is not the contract date.

2. INSPECTION / DUE DILIGENCE DEADLINE (= inspectionDeadline):
   - Only calculate if BOTH contractDate and dueDiligenceDays are known.
   - inspectionDeadline = contractDate + dueDiligenceDays calendar days (counting starts the NEXT day after contractDate).
   - Example: contractDate = 2026-06-01, dueDiligenceDays = 15 → inspectionDeadline = 2026-06-16.
   - Return in YYYY-MM-DD format.

3. PROJECTED CLOSE DATE (= projectedCloseDate):
   - Only calculate if BOTH inspectionDeadline and closingDays are known.
   - projectedCloseDate = inspectionDeadline + closingDays calendar days.
   - Example: inspectionDeadline = 2026-06-16, closingDays = 30 → projectedCloseDate = 2026-07-16.
   - Return in YYYY-MM-DD format.

4. APPRAISAL DEADLINE (= appraisalDeadline):
   - Only calculate if appraisalConditioned = true AND contractDate is known AND appraisalPeriodDays is known.
   - appraisalDeadline = contractDate + appraisalPeriodDays calendar days.
   - Return in YYYY-MM-DD format.
   - If appraisalConditioned = false, return appraisalDeadline: "" with confidence 0.0.

5. FINAL LOAN COMMITMENT DEADLINE (= financingCommitmentDeadline):
   - This is the deadline by which the Buyer must obtain a FINAL WRITTEN LOAN COMMITMENT from their lender.
   - This is DIFFERENT from the loan application deadline — it is the lender's final approval, not the application submission.
   - Only calculate if ALL of the following are true:
     a) loanType is NOT "cash" (i.e., the buyer is financing the purchase)
     b) contractDate is known
     c) financingCommitmentDays is known (the number from line 22)
   - financingCommitmentDeadline = contractDate + financingCommitmentDays calendar days.
   - Example: contractDate = 2026-06-01, financingCommitmentDays = 30 → financingCommitmentDeadline = 2026-07-01.
   - Return in YYYY-MM-DD format.
   - If loanType = "cash" OR financingCommitmentDays is blank, return financingCommitmentDeadline: "" with confidence 0.0.

=== CLOSING TYPE AND CLIENT TYPE RULES ===

- closingType: Infer from which side our agent (the submitting agent) is on.
  - If our agent is in the "Listing Firm / Seller's Agent" header row → closingType: "listing"
  - If our agent is in the "Selling Firm / Buyer's Agent" header row → closingType: "buyer"
  - If the same agent appears in both rows → closingType: "dual"
  - If you cannot determine which side → closingType: "" (leave blank)
- clientType: "seller" if closingType = "listing", "buyer" if closingType = "buyer", "dual" if closingType = "dual", "" if unknown.
- dealType: ALWAYS "commercial_sale" for this document type. Never change this.

=== MINERAL RIGHTS RULES ===

- "included": The seller is conveying ALL mineral rights to the buyer (0% reserved, or the blank is filled with 0).
- "reserved": The seller is retaining some or all mineral rights (% > 0 is written in the blank). Note the exact percentage in the "notes" field.
- "not_mentioned": The mineral rights section is entirely blank or the clause is not present.

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
                text: 'Extract all fields from this Louisiana Commercial Agreement to Buy and Sell and return the JSON as instructed. Never guess — leave blank if uncertain.',
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
      console.error('JSON parse error. Raw:', raw.slice(0, 500));
      return NextResponse.json({ error: 'AI returned invalid JSON. Please fill the form manually.' }, { status: 422 });
    }

    // This mirrors what parse-purchase-agreement and parse-land-agreement do.
    // Without this, the document never appears in the transaction's documents array.
    const BUCKET_NAME = 'smart-broker-usa.firebasestorage.app';
    let savedDoc: { name: string; url: string; storagePath: string; uploadedAt: string } | null = null;
    try {
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `transactions/documents/${uid}/${timestamp}-${safeName}`;
      const bucket = admin.storage().bucket(BUCKET_NAME);
      const blob = bucket.file(storagePath);
      const downloadToken = crypto.randomUUID();
      await blob.save(buffer, {
        metadata: {
          contentType: 'application/pdf',
          metadata: { firebaseStorageDownloadTokens: downloadToken, uploadedBy: uid },
        },
      });
      const encodedPath = encodeURIComponent(storagePath);
      const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET_NAME}/o/${encodedPath}?alt=media&token=${downloadToken}`;
      const autoName = `Commercial Agreement — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      savedDoc = { name: autoName, url: downloadUrl, storagePath, uploadedAt: new Date().toISOString() };
    } catch (storageErr) {
      console.warn('[parse-commercial-agreement] Storage save failed (non-critical):', storageErr);
    }

    return NextResponse.json({ success: true, data: extracted, savedDoc });

  } catch (err) {
    console.error('parse-commercial-agreement error:', err);
    return NextResponse.json({ error: 'Unexpected error. Please fill the form manually.' }, { status: 500 });
  } finally {
    // Clean up the uploaded file from OpenAI
    if (uploadedFileId) {
      try {
        const openai = getOpenAI();
        await openai.files.del(uploadedFileId);
      } catch {
        // Non-fatal — file will expire automatically
      }
    }
  }
}
