import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export interface RelevanceResult {
  isRelevant: boolean;
  reason: string;
  confidence: number;
}

const RELEVANCE_PROMPT = `You are a content filter for a tech knowledge graph system called Orbex.

Your task: Determine if this article is relevant to the tech/startup/developer ecosystem.

RELEVANT TOPICS:
- Developer tools, frameworks, libraries, IDEs, programming languages
- Tech companies (startups, big tech, acquisitions, funding, launches)
- AI/ML tools, research, paradigms, applications
- Software paradigms, methodologies, architectural patterns
- Case studies of how companies use technology
- Open source projects, GitHub repos, package releases
- Cloud platforms, infrastructure, DevOps, SaaS
- Tech industry events (conferences, product launches, significant announcements)
- Technical tutorials, deep dives, engineering blog posts

NOT RELEVANT:
- Lifestyle, entertainment, celebrity news
- Politics (unless directly tech policy like AI regulation, antitrust)
- Sports, travel, food, fashion
- Consumer electronics reviews (phones, laptops as consumer products)
- General business news not related to tech companies
- Health/medical (unless medical tech/AI)
- Generic productivity/self-help content

EDGE CASES:
- Consumer AI products (ChatGPT, Midjourney, etc.) → RELEVANT (they're tech products)
- Apple/Google hardware announcements → RELEVANT (tech companies)
- Crypto/blockchain → RELEVANT (tech ecosystem)
- Remote work tools → RELEVANT (developer/startup ecosystem)
- Y Combinator/startup accelerators → RELEVANT (startup ecosystem)

Return JSON only:
{
  "isRelevant": true/false,
  "reason": "Brief explanation (one sentence)",
  "confidence": 0.0-1.0
}

Confidence scale:
- 0.9-1.0: Obviously relevant (developer tools, AI tech, coding frameworks)
- 0.7-0.8: Clearly relevant (tech companies, startup news, tech case studies)
- 0.5-0.6: Borderline relevant (tangentially tech-related)
- 0.3-0.4: Borderline irrelevant (mostly non-tech but some tech mentions)
- 0.0-0.2: Obviously irrelevant (lifestyle, politics, sports)`;

/**
 * Uses Claude Haiku to determine if an article is relevant to the tech ecosystem.
 * This is a cost-efficient pre-filter (~$0.003/article) before the full extraction pipeline.
 *
 * @param article - Article with title and optional description
 * @returns Relevance result with isRelevant flag, reason, and confidence score
 */
export async function checkRelevance(article: {
  title: string;
  description?: string;
}): Promise<RelevanceResult> {
  try {
    const articleText = `Title: ${article.title}

Description: ${article.description || '(No description provided)'}`;

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001", // Fast and cheap model for filtering
      max_tokens: 256, // Small response needed
      messages: [
        {
          role: "user",
          content: `${RELEVANCE_PROMPT}

---

${articleText}`,
        },
      ],
    });

    // Extract text content from response
    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from Claude Haiku");
    }

    // Parse JSON from response
    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in Claude relevance response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate response structure
    if (
      typeof parsed.isRelevant !== "boolean" ||
      typeof parsed.reason !== "string" ||
      typeof parsed.confidence !== "number"
    ) {
      throw new Error("Invalid relevance response structure");
    }

    // Apply confidence threshold: only consider relevant if confidence >= 0.5
    const confidence = Number(parsed.confidence);
    const isRelevant = parsed.isRelevant && confidence >= 0.5;

    return {
      isRelevant,
      reason: parsed.reason,
      confidence,
    };
  } catch (error) {
    // Log error but don't fail - default to relevant on error to avoid losing potentially good content
    console.error("Relevance check failed:", error);
    return {
      isRelevant: true,
      reason: "Error during relevance check - defaulting to relevant",
      confidence: 0.5,
    };
  }
}
