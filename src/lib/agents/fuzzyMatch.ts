// src/lib/agents/fuzzyMatch.ts
// Fuzzy name matching utilities for detecting duplicate agents

/**
 * Compute Levenshtein distance between two strings
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Normalize a name for comparison:
 * - lowercase
 * - remove extra spaces, punctuation, suffixes (jr, sr, ii, iii)
 * - handle "Last, First" → "first last"
 */
function normalizeName(name: string): string {
  let s = name.toLowerCase().trim();
  // Remove common suffixes
  s = s.replace(/\b(jr\.?|sr\.?|ii|iii|iv)\b/gi, '').trim();
  // Remove punctuation except spaces
  s = s.replace(/[^a-z\s]/g, '');
  // Handle "Last, First" format (already handled by removing commas above)
  // Collapse multiple spaces
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Split name into parts and sort alphabetically for order-independent matching
 */
function nameParts(name: string): string[] {
  return normalizeName(name).split(' ').filter(Boolean).sort();
}

/**
 * Calculate similarity score (0 to 1) between two names.
 * Uses multiple strategies:
 * 1. Exact normalized match → 1.0
 * 2. Same parts in any order → 0.95
 * 3. Levenshtein on full normalized string
 * 4. Levenshtein on individual name parts (catches first/last name typos)
 */
export function nameSimilarity(nameA: string, nameB: string): number {
  const normA = normalizeName(nameA);
  const normB = normalizeName(nameB);

  // Exact match after normalization
  if (normA === normB) return 1.0;

  // Same parts in different order (e.g., "Smith John" vs "John Smith")
  const partsA = nameParts(nameA);
  const partsB = nameParts(nameB);
  if (partsA.join(' ') === partsB.join(' ')) return 0.95;

  // Levenshtein on full name
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1.0;
  const fullScore = 1 - levenshtein(normA, normB) / maxLen;

  // Levenshtein on sorted parts (catches individual part typos better)
  const sortedA = partsA.join(' ');
  const sortedB = partsB.join(' ');
  const sortedMaxLen = Math.max(sortedA.length, sortedB.length);
  const sortedScore = sortedMaxLen > 0
    ? 1 - levenshtein(sortedA, sortedB) / sortedMaxLen
    : 1.0;

  // Part-by-part matching (for names with same number of parts)
  let partScore = 0;
  if (partsA.length === partsB.length && partsA.length > 0) {
    let totalSim = 0;
    for (let i = 0; i < partsA.length; i++) {
      const pMax = Math.max(partsA[i].length, partsB[i].length);
      totalSim += pMax > 0 ? 1 - levenshtein(partsA[i], partsB[i]) / pMax : 1;
    }
    partScore = totalSim / partsA.length;
  }

  // Return best score
  return Math.max(fullScore, sortedScore, partScore);
}

/**
 * Default threshold for fuzzy matching — 0.80 means names need to be
 * at least 80% similar to be considered a potential match.
 */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.80;

export interface FuzzyMatch {
  agentId: string;
  displayName: string;
  similarity: number;
}

/**
 * Find fuzzy matches for a name against a list of existing agent names.
 * Returns matches above the threshold, sorted by similarity (best first).
 */
export function findFuzzyMatches(
  targetName: string,
  existingAgents: { agentId: string; displayName: string }[],
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD,
): FuzzyMatch[] {
  const matches: FuzzyMatch[] = [];

  for (const agent of existingAgents) {
    const similarity = nameSimilarity(targetName, agent.displayName);
    if (similarity >= threshold) {
      matches.push({
        agentId: agent.agentId,
        displayName: agent.displayName,
        similarity,
      });
    }
  }

  return matches.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Build a lookup map that includes fuzzy matching.
 * First tries exact match (case-insensitive), then fuzzy match.
 */
export function fuzzyLookupAgent(
  targetName: string,
  exactMap: Map<string, { agentId: string; displayName: string }>,
  allAgents: { agentId: string; displayName: string }[],
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD,
): { agentId: string; displayName: string; matchType: 'exact' | 'fuzzy'; similarity: number } | null {
  // 1. Try exact match
  const exactKey = targetName.toLowerCase().trim();
  const exactMatch = exactMap.get(exactKey);
  if (exactMatch) {
    return { ...exactMatch, matchType: 'exact', similarity: 1.0 };
  }

  // 2. Try fuzzy match
  const fuzzyMatches = findFuzzyMatches(targetName, allAgents, threshold);
  if (fuzzyMatches.length > 0) {
    const best = fuzzyMatches[0];
    return {
      agentId: best.agentId,
      displayName: best.displayName,
      matchType: 'fuzzy',
      similarity: best.similarity,
    };
  }

  return null;
}
