import { ArticleOutline, OutlineTopic } from "./schema";

interface Section {
  text: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Parse article into sections based on paragraph breaks.
 * Returns sections with their text and position in the original.
 */
function parseIntoSections(article: string): Section[] {
  const sections: Section[] = [];

  // Split by double newlines (paragraphs) or heading patterns
  const paragraphPattern = /\n\s*\n/g;
  let lastIndex = 0;
  let match;

  while ((match = paragraphPattern.exec(article)) !== null) {
    if (match.index > lastIndex) {
      const text = article.slice(lastIndex, match.index).trim();
      if (text.length > 50) { // Skip very short sections
        sections.push({
          text,
          startIndex: lastIndex,
          endIndex: match.index,
        });
      }
    }
    lastIndex = match.index + match[0].length;
  }

  // Add final section
  if (lastIndex < article.length) {
    const text = article.slice(lastIndex).trim();
    if (text.length > 50) {
      sections.push({
        text,
        startIndex: lastIndex,
        endIndex: article.length,
      });
    }
  }

  return sections;
}

/**
 * Calculate how well a section matches a topic based on keyword overlap.
 * Returns a score from 0-1.
 */
function calculateTopicMatch(sectionText: string, topic: OutlineTopic): number {
  const sectionLower = sectionText.toLowerCase();
  const topicWords = topic.topic.toLowerCase().split(/\s+/);
  const keyPointWords = topic.key_points
    .flatMap((kp) => kp.toLowerCase().split(/\s+/));

  const allWords = [...topicWords, ...keyPointWords].filter(
    (w) => w.length > 3 // Skip short words
  );

  if (allWords.length === 0) return 0;

  const matchCount = allWords.filter((word) =>
    sectionLower.includes(word)
  ).length;

  return matchCount / allWords.length;
}

/**
 * Find the best matching topic for a section.
 * Returns the topic and match score, or null if no good match.
 */
function findMatchingTopic(
  section: Section,
  topics: OutlineTopic[]
): { topic: OutlineTopic; score: number } | null {
  let bestMatch: { topic: OutlineTopic; score: number } | null = null;

  for (const topic of topics) {
    const score = calculateTopicMatch(section.text, topic);
    if (score > 0.2 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { topic, score };
    }
  }

  return bestMatch;
}

/**
 * Get the first paragraph of a section.
 */
function getFirstParagraph(text: string): string {
  const firstBreak = text.search(/\n\s*\n/);
  if (firstBreak > 0 && firstBreak < text.length - 100) {
    return text.slice(0, firstBreak);
  }
  // If no clear paragraph break, take first 500 chars
  return text.slice(0, 500);
}

/**
 * Smart truncation that uses the outline to preserve important content.
 *
 * Strategy:
 * 1. Always keep intro (first 1500 chars)
 * 2. Always keep conclusion (last 1000 chars)
 * 3. Keep full text of sections matching "high" relevance topics
 * 4. Keep only first paragraph of sections matching "medium" relevance topics
 * 5. Skip sections that don't match any topic
 */
export function smartTruncate(
  article: string,
  outline: ArticleOutline,
  targetLength: number = 15000
): string {
  // If article is already short enough, return as-is
  if (article.length <= targetLength) {
    return article;
  }

  const introLength = 1500;
  const conclusionLength = 1000;
  const intro = article.slice(0, introLength);
  const conclusion = article.slice(-conclusionLength);

  // Parse middle content into sections
  const middleContent = article.slice(introLength, -conclusionLength);
  const sections = parseIntoSections(middleContent);

  // Match sections to topics and build truncated content
  const truncatedParts: string[] = [intro];
  let currentLength = intro.length + conclusion.length;

  for (const section of sections) {
    // Stop if we're approaching the target length
    if (currentLength >= targetLength - conclusionLength - 500) {
      break;
    }

    const match = findMatchingTopic(section, outline.main_topics);

    if (!match) {
      // Section doesn't match any topic - skip it
      continue;
    }

    if (match.topic.relevance === "high") {
      // Keep full text for high relevance
      const textToAdd = section.text;
      if (currentLength + textToAdd.length < targetLength - conclusionLength) {
        truncatedParts.push(textToAdd);
        currentLength += textToAdd.length;
      } else {
        // Partial add if we're near the limit
        const remaining = targetLength - conclusionLength - currentLength - 100;
        if (remaining > 200) {
          truncatedParts.push(textToAdd.slice(0, remaining) + "...");
          currentLength += remaining;
        }
      }
    } else {
      // Keep only first paragraph for medium relevance
      const firstPara = getFirstParagraph(section.text);
      if (currentLength + firstPara.length < targetLength - conclusionLength) {
        truncatedParts.push(firstPara);
        currentLength += firstPara.length;
      }
    }
  }

  truncatedParts.push(conclusion);

  return truncatedParts.join("\n\n");
}

/**
 * Simple truncation fallback when no outline is available.
 * Keeps intro and conclusion, samples middle content.
 */
export function simpleTruncate(
  article: string,
  targetLength: number = 15000
): string {
  if (article.length <= targetLength) {
    return article;
  }

  const introLength = 2000;
  const conclusionLength = 1500;
  const middleLength = targetLength - introLength - conclusionLength;

  const intro = article.slice(0, introLength);
  const conclusion = article.slice(-conclusionLength);

  // Sample from the middle
  const middleStart = introLength;
  const middleEnd = article.length - conclusionLength;
  const middleContent = article.slice(middleStart, middleStart + middleLength);

  return `${intro}\n\n[...content truncated for length...]\n\n${middleContent}\n\n[...]\n\n${conclusion}`;
}
