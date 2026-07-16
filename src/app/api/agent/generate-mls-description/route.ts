/**
 * POST /api/agent/generate-mls-description
 *
 * Accepts a free-form "brain dump" of property features from an agent and
 * returns a polished, fair-housing-compliant MLS description.
 *
 * Body: { brainDump: string, address?: string, propertyType?: string }
 * Response: { description: string } | { error: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import OpenAI from 'openai';

export const maxDuration = 60;

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function extractBearer(req: NextRequest): string | null {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

const SYSTEM_PROMPT = `You are an expert real estate copywriter specializing in MLS listing descriptions for the Louisiana market (Acadiana / Lafayette area).

Your job is to take an agent's raw notes and brain-dump about a property and transform them into a compelling, professional MLS description.

CRITICAL FAIR HOUSING COMPLIANCE RULES — you MUST follow these without exception:
1. NEVER mention race, color, religion, national origin, sex, disability, or familial status — directly or indirectly.
2. NEVER use phrases like "perfect for families", "great for couples", "ideal for retirees", "walking distance to church", "quiet neighborhood" (implies exclusion), "exclusive", "private community" (unless factually describing a gated community).
3. NEVER describe the demographics, character, or "feel" of a neighborhood in terms that imply who should or shouldn't live there.
4. DO NOT mention school district names in a way that implies the property is only suitable for people with children.
5. DO NOT use coded language that implies racial or ethnic composition of an area.
6. Focus ONLY on the physical property features, upgrades, lot, location amenities (proximity to highways, shopping, dining), and objective facts.

WRITING STYLE:
- Write in flowing, engaging prose — NOT bullet points.
- Use 2–4 short paragraphs (150–300 words total).
- Lead with the most compelling feature or overall impression.
- Use vivid but professional language — avoid clichés like "won't last long", "must see", "priced to sell".
- Highlight upgrades, finishes, and standout features naturally within the prose.
- End with a brief mention of location benefits (proximity to major roads, dining, shopping, etc.) using objective facts only.
- Write in third person (e.g., "This home features..." not "Your dream home...").
- Do NOT include the property address in the description.
- Do NOT include price information.
- Do NOT include agent names or brokerage names.

OUTPUT: Return ONLY the description text — no preamble, no explanation, no markdown formatting, no quotes around it. Just the plain description paragraphs.`;

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const token = extractBearer(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
      await adminAuth.verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { brainDump, address, propertyType } = body;

    if (!brainDump || typeof brainDump !== 'string' || brainDump.trim().length < 10) {
      return NextResponse.json({ error: 'Please provide more details about the property.' }, { status: 400 });
    }

    // Build the user message
    const contextLines: string[] = [];
    if (address) contextLines.push(`Property address (for context only — do NOT include in description): ${address}`);
    if (propertyType) {
      const typeLabel: Record<string, string> = {
        listing: 'Listing (seller side)',
        buyer: 'Buyer side',
        dual: 'Dual agency',
      };
      contextLines.push(`Transaction type: ${typeLabel[propertyType] || propertyType}`);
    }
    contextLines.push('');
    contextLines.push('Agent notes and property features:');
    contextLines.push(brainDump.trim());

    const userMessage = contextLines.join('\n');

    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 600,
    });

    const description = completion.choices[0]?.message?.content?.trim();
    if (!description) {
      return NextResponse.json({ error: 'AI returned an empty response. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ description });
  } catch (err: any) {
    console.error('[POST /api/agent/generate-mls-description]', err);
    return NextResponse.json(
      { error: err.message || 'Failed to generate description. Please try again.' },
      { status: 500 }
    );
  }
}
