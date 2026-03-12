/**
 * Normalize an entity name for deduplication matching.
 * Converts to lowercase, trims whitespace, removes special characters.
 */
export function normalizeEntityName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/['']/g, "'") // Normalize quotes
    .replace(/[""]/g, '"') // Normalize double quotes
    .replace(/\s+/g, " ") // Collapse whitespace
    .replace(/[^\w\s\-.']/g, ""); // Remove special chars except dash, period, apostrophe
}

/**
 * Calculate Levenshtein distance between two strings.
 * Used for fuzzy matching during deduplication.
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity ratio between two strings (0-1).
 * Higher is more similar.
 */
export function similarityRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

/**
 * Check if two entity names are similar enough to be considered duplicates.
 * Uses normalized comparison with a similarity threshold.
 */
export function areNamesSimilar(
  name1: string,
  name2: string,
  threshold: number = 0.85
): boolean {
  const norm1 = normalizeEntityName(name1);
  const norm2 = normalizeEntityName(name2);

  // Exact match after normalization
  if (norm1 === norm2) return true;

  // Fuzzy match
  return similarityRatio(norm1, norm2) >= threshold;
}
