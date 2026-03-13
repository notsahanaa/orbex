import { config } from "dotenv";
config({ path: ".env.local" });

import { createOutline, extractEntities } from "../src/lib/extraction/extract";
import { smartTruncate } from "../src/lib/extraction/truncate";
import { filterByConfidence } from "../src/lib/extraction/deduplicate";

// Sample article about AI agents for testing
const sampleArticle = `
What Are AI Agents? A Complete Guide to Autonomous AI Systems

The rise of AI agents represents one of the most significant shifts in how we interact with artificial intelligence. Unlike traditional chatbots that simply respond to queries, AI agents can autonomously plan, execute, and iterate on complex tasks.

## Defining AI Agents

An AI agent is an autonomous system that can perceive its environment, make decisions, and take actions to achieve specific goals. "The key differentiator," explains Dr. Sarah Chen at Stanford's AI Lab, "is that agents don't just respond—they act independently and learn from outcomes."

The core components of an AI agent include:
- **Perception**: Understanding context from various inputs
- **Reasoning**: Planning multi-step solutions
- **Action**: Executing tasks via tools and APIs
- **Memory**: Learning from past interactions

## The Agent-Driven Economy

We're witnessing the emergence of what many call the "agent-driven economy"—a paradigm shift where AI agents handle increasingly complex workflows. Companies like Anthropic, OpenAI, and Google are racing to build more capable agent systems.

Claude, developed by Anthropic, exemplifies this trend. The model powers tools like Claude Code, which can autonomously navigate codebases, write tests, and implement features. "Claude Code represents a new category of developer tools," notes Anthropic's documentation, "where the AI takes initiative rather than waiting for instructions."

Similarly, Cursor has emerged as a leading AI-native IDE. Built on top of large language models, Cursor demonstrates the paradigm of "vibe coding"—where developers describe intent and the AI handles implementation details.

## Real-World Applications

### Case Study: Automated Development Workflows

Engineering teams at several startups have reported 3-5x productivity gains using agent-based tools. One team at a YC startup described their workflow: "We outline the feature in plain English, Claude Code implements it, runs tests, and opens a PR. We review and merge."

### Case Study: Research Automation

Academic researchers are using AI agents to automate literature reviews, data analysis, and even hypothesis generation. Tools like Elicit and Consensus demonstrate how agents can synthesize information across thousands of papers.

## Key Players in the Space

**Anthropic** continues to push boundaries with Claude's capabilities. Their focus on "constitutional AI" ensures agents remain aligned with human values while becoming more autonomous.

**OpenAI** recently announced GPT-4's improved function calling and agent capabilities. Their API now supports more sophisticated tool use patterns.

**LangChain** provides the infrastructure for building custom agents. Their framework has become the standard for agent orchestration, with thousands of production deployments.

**AutoGPT** sparked massive interest when it launched in early 2023, demonstrating what fully autonomous agents could achieve—though reliability remains a challenge.

## Challenges and Considerations

Despite the excitement, AI agents face significant hurdles:

1. **Reliability**: Agents can get stuck in loops or make compounding errors
2. **Safety**: Autonomous systems need robust guardrails
3. **Cost**: Multi-step agent workflows consume significant API tokens

## The Future of AI Agents

Looking ahead, the trajectory is clear: AI agents will become more capable, more reliable, and more integrated into everyday workflows. The question isn't whether agents will transform how we work, but how quickly and comprehensively.

As Sam Altman noted at a recent conference, "We're moving from AI as a tool you use to AI as an entity that works alongside you." This shift—from assistant to autonomous collaborator—defines the next chapter of artificial intelligence.
`;

async function main() {
  console.log("=".repeat(60));
  console.log("TWO-PASS EXTRACTION PIPELINE TEST");
  console.log("=".repeat(60));
  console.log();

  // Pass 1: Create outline
  console.log("PASS 1: Creating article outline...");
  console.log("-".repeat(40));

  const outline = await createOutline(sampleArticle, "What Are AI Agents? A Complete Guide");

  console.log("\nArticle Type:", outline.article_type);
  console.log("Primary Focus:", outline.primary_focus);
  console.log("\nMain Topics:");
  for (const topic of outline.main_topics) {
    console.log(`  [${topic.relevance.toUpperCase()}] ${topic.topic}`);
    for (const point of topic.key_points) {
      console.log(`    - ${point}`);
    }
  }

  // Smart truncation demo (article is short, but shows the logic)
  console.log("\n" + "-".repeat(40));
  console.log("SMART TRUNCATION:");
  console.log(`Original length: ${sampleArticle.length} chars`);
  const truncated = smartTruncate(sampleArticle, outline, 15000);
  console.log(`Truncated length: ${truncated.length} chars`);
  console.log(`(No truncation needed - article under 15k chars)`);

  // Pass 2: Extract entities
  console.log("\n" + "-".repeat(40));
  console.log("PASS 2: Extracting entities with outline context...");

  const result = await extractEntities(sampleArticle, "What Are AI Agents?", outline);

  // Filter by confidence
  const { filtered, removed } = filterByConfidence(result.entities, 0.6);

  console.log(`\nExtracted ${result.entities.length} entities, filtered ${removed} low-confidence`);
  console.log(`\nENTITIES (${filtered.length}):`);
  console.log("-".repeat(40));

  // Group by type
  const byType = new Map<string, typeof filtered>();
  for (const entity of filtered) {
    const list = byType.get(entity.type) || [];
    list.push(entity);
    byType.set(entity.type, list);
  }

  for (const [type, entities] of byType) {
    console.log(`\n${type.toUpperCase()} (${entities.length}):`);
    for (const e of entities) {
      const primaryTag = e.is_primary ? "🔵" : "⚪";
      console.log(`  ${primaryTag} ${e.name} (confidence: ${e.confidence.toFixed(2)})`);
      console.log(`     ${e.description.slice(0, 150)}...`);
      if (e.source_topic) {
        console.log(`     Source topic: ${e.source_topic}`);
      }
    }
  }

  console.log("\n" + "-".repeat(40));
  console.log(`RELATIONSHIPS (${result.relationships.length}):`);
  console.log("-".repeat(40));

  for (const rel of result.relationships) {
    console.log(`  ${rel.source_name} --[${rel.relationship_type}]--> ${rel.target_name}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("EXTRACTION COMPLETE");
  console.log("=".repeat(60));
}

main().catch(console.error);
