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
const SYSTEM_PROMPT = `You are a real estate data extraction assistant specializing in Louisiana ROAM MLS Residential Input Forms (REALTOR® Association of Acadiana).
You will be given an MLS Residential Input Form PDF.
Extract the fields listed below and return ONLY a valid JSON object — no markdown, no explanation.
For each field, also include a confidence score (0.0–1.0) in a parallel "_confidence" object.
Use 0.0 if the field was not found, 0.5 if inferred/uncertain, 1.0 if clearly stated.

Return this exact JSON shape:
{
  "fields": {
    "address": "",
    "streetNumber": "",
    "streetName": "",
    "streetSuffix": "",
    "streetDir": "",
    "unitNumber": "",
    "city": "",
    "state": "",
    "zipCode": "",
    "parish": "",
    "subdivision": "",
    "listPrice": null,
    "listingDate": "",
    "expirationDate": "",
    "startShowingDate": "",
    "propertyType": "",
    "propertySubType": "",
    "propertyAttached": "",
    "sellerName": "",
    "sellerPhone": "",
    "listType": "",
    "occupiedBy": "",
    "bedrooms": null,
    "bathsFull": null,
    "bathsHalf": null,
    "sqftLiving": null,
    "sqftTotal": null,
    "sqftUpper": null,
    "sqftLower": null,
    "sqftCoveredPorch": null,
    "sqftGarage": null,
    "sqftCarport": null,
    "stories": null,
    "yearBuilt": null,
    "approxAge": "",
    "propertyCondition": "",
    "acres": null,
    "lotDimensions": "",
    "hoaFee": null,
    "hoaFeeTerms": "",
    "hasPool": false,
    "mineralRights": "",
    "floodZone": "",
    "floodZoneArea": "",
    "taxAssessmentNumber": "",
    "legalDescription": "",
    "schoolDistrict": "",
    "elementarySchool": "",
    "middleSchool": "",
    "highSchool": "",
    "mlsArea": "",
    "lotNumber": "",
    "directions": "",
    "remarks": "",
    "realtorRemarks": "",
    "architecturalStyle": "",
    "roofType": "",
    "counterTopMaterial": "",
    "hasSepticSystem": false,
    "hasPublicSewer": false,
    "hasPrivateWell": false,
    "hasPublicWater": false,
    "waterCompany": "",
    "sewerCompany": "",
    "garageType": "",
    "garageSpaces": null,
    "carportSpaces": null,
    "financing": "",
    "dealType": "residential_sale",
    "closingType": "listing",
    "clientType": "seller",
    "notes": ""
  },
  "_confidence": {
    "address": 0.0,
    "listPrice": 0.0,
    "listingDate": 0.0,
    "expirationDate": 0.0,
    "sellerName": 0.0,
    "sellerPhone": 0.0,
    "bedrooms": 0.0,
    "bathsFull": 0.0,
    "sqftLiving": 0.0,
    "yearBuilt": 0.0,
    "acres": 0.0,
    "subdivision": 0.0,
    "floodZone": 0.0,
    "legalDescription": 0.0,
    "remarks": 0.0
  }
}

=== FIELD EXTRACTION RULES ===

ADDRESS: Combine Street Number + Direction + Street Name + Street Suffix + Unit # into a single string.
Example: "127 Beau Coteau" or "127 N Main St Unit 4B"
Store the full combined address in "address". Also store each component separately.

LISTING PRICE: Extract the dollar amount from the "Listing Price" field. Return as a number (no $ or commas).

DATES: Extract dates in MM/DD/YYYY format as written on the form.
- "Listing Date" → listingDate
- "Expiration Date" → expirationDate
- "Start Showing Date" → startShowingDate

SELLER INFO: Look for "Seller Name" and "Seller Phone" in the "Office/Member/Contract Info" section (usually page 2).

PROPERTY TYPE: Look for the checked "Type*" field (e.g., "Single Family", "Condo", "Townhouse", "Multi-Family").

BEDROOMS / BATHS: Look in "General Property Description" section.
- "# Bedrooms" → bedrooms (integer)
- "Baths - Full" → bathsFull (integer)
- "Baths - 1/2" → bathsHalf (integer)

SQUARE FOOTAGE: All sqft fields are integers.
- "SqFt - Living" → sqftLiving
- "SqFt - Total" → sqftTotal

YEAR BUILT: Look for "Year Built" field. Return as integer (e.g., 1984).

APPROXIMATE AGE: Look for "Approximate Age*" or "Approximate Condition*" field (e.g., "41 - 50 Years").

ACRES: Look for "Acres" field. Return as decimal number (e.g., 1.07).

LOT DIMENSIONS: Look for "Lot Dimensions" field.

HOA: Look for "Assn Fee $" and "Assn Fee Terms*". If "None" is checked for Assn Fee, set hoaFee to 0.

POOL: Look for "Pool on Subject Property*" — if "Yes" is checked, set hasPool to true.

FLOOD ZONE: Look for "Flood Zone" section. Extract the Zone code (e.g., "AE", "X", "X500").

LEGAL DESCRIPTION: Extract the full "Legal Desc" text.

SCHOOL DISTRICT: Extract Elementary, Middle, and High school names.

REMARKS: Extract the full public "Remarks" text. Also extract "Realtor Remarks" if present.

ARCHITECTURAL STYLE: Look for checked style(s) in the "Style" section (e.g., "Ranch", "Traditional", "French Provincial").

SEWER/WATER: Look for checked options in "Sewer" and "Water Source" sections.
- "Public Sewer" → hasPublicSewer: true
- "Septic" → hasSepticSystem: true
- "Public" water → hasPublicWater: true
- "Well" → hasPrivateWell: true

FINANCING: Look for checked financing options (e.g., "Conventional", "FHA", "VA", "Cash").

ALWAYS set:
- closingType: "listing"
- clientType: "seller"
- dealType: "residential_sale" (unless property type indicates otherwise — use "land" for land, "commercial_sale" for commercial)
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

    // Upload PDF to OpenAI
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
      return NextResponse.json({ error: 'Could not upload PDF for analysis. Please try again.' }, { status: 422 });
    }

    // Call gpt-4o with the uploaded file
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
                text: 'Extract all fields from this MLS Residential Input Form and return the JSON as instructed.',
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
      const safeName = file.name
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_{2,}/g, '_')
        .slice(0, 80);
      const storagePath = `transactions/documents/${uid}/${timestamp}-${safeName}`;
      const downloadToken = crypto.randomUUID();
      const bucket = admin.storage().bucket(BUCKET_NAME);
      const blob = bucket.file(storagePath);
      await blob.save(buffer, {
        metadata: {
          contentType: 'application/pdf',
          metadata: {
            firebaseStorageDownloadTokens: downloadToken,
            uploadedBy: uid,
            originalName: file.name,
          },
        },
      });
      const encodedPath = encodeURIComponent(storagePath);
      const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET_NAME}/o/${encodedPath}?alt=media&token=${downloadToken}`;
      const address = (extracted.fields?.address as string) || '';
      const autoName = address ? `MLS Input Form — ${address}` : file.name;
      savedDoc = { name: autoName, url: downloadUrl, storagePath, uploadedAt: new Date().toISOString() };
    } catch (storageErr) {
      console.warn('[parse-mls-input-form] Storage save failed (non-critical):', storageErr);
    }

    return NextResponse.json({
      success: true,
      fields: extracted.fields || {},
      confidence: extracted._confidence || {},
      pdfName: file.name,
      savedDoc,
    });
  } catch (err: unknown) {
    console.error('parse-mls-input-form error:', err);
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
