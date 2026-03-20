/**
 * Bootstrap Paradigm Tree Migration Script
 *
 * This script:
 * 1. Fetches all existing entities from the knowledge graph
 * 2. Uses an LLM to generate a proposed paradigm hierarchy (2-4 levels)
 * 3. Presents the tree for interactive review
 * 4. Executes the migration to create paradigm hierarchy and attach entities
 *
 * Usage:
 *   npx tsx scripts/bootstrap-paradigm-tree.ts
 *
 * Prerequisites:
 *   1. Set environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 */

import { config } from "dotenv";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import * as readline from "readline";

// Load environment variables
config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing Supabase environment variables:");
  console.error(
    "- NEXT_PUBLIC_SUPABASE_URL:",
    SUPABASE_URL ? "set" : "missing"
  );
  console.error(
    "- SUPABASE_SERVICE_ROLE_KEY:",
    SUPABASE_SERVICE_KEY ? "set" : "missing"
  );
  process.exit(1);
}

if (!ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY environment variable");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic();

interface Entity {
  id: string;
  name: string;
  type: string;
  description: string | null;
  is_primary: boolean;
}

interface ProposedParadigm {
  name: string;
  description: string;
  children: ProposedParadigm[];
  attached_entities: string[]; // Entity names to attach
}

interface ProposedTree {
  roots: ProposedParadigm[];
}

const TREE_GENERATION_PROMPT = `You are organizing entities into a paradigm tree for a knowledge graph.

Given a list of entities (tools, companies, events, case studies, and existing paradigms), create a paradigm hierarchy that:

1. Has 2-4 levels of depth (flexible per branch)
2. Groups related entities under common paradigms
3. Uses existing paradigm entities as tree nodes when appropriate
4. Creates new paradigm nodes to organize entities without clear parents

STRUCTURE RULES:
- Paradigms represent emerging concepts, trends, or domains
- **L1 (root) paradigms are for ORGANIZATION ONLY** - they should NEVER have attached_entities
- **Tools and companies attach to L2 or L3 paradigms ONLY** (depth >= 1 from root)
- Events attach to companies
- Case studies attach to tools
- Paradigms can be nested (broader → more specific)

ATTACHMENT DEPTH RULE (CRITICAL):
- L1 paradigms (roots): attached_entities must be EMPTY []
- L2 paradigms (children of roots): CAN have attached_entities
- L3 paradigms (grandchildren of roots): CAN have attached_entities

GOOD PARADIGM NAMES:
- "Agentic AI" (L1, no entities) → "Agentic coding tools" (L2, entities here) → "Context for agentic coding" (L3)
- "AI Infrastructure" (L1, no entities) → "LLM APIs" (L2, entities here)
- "Developer Tools" (L1, no entities) → "Code editors" (L2) → "AI-powered editors" (L3, entities here)

BAD PARADIGM NAMES:
- "Miscellaneous" (too generic)
- "Various Tools" (not a concept)
- "Other Companies" (not meaningful)

Return a JSON object with this structure:
{
  "roots": [
    {
      "name": "Top-level Paradigm Name",
      "description": "What this paradigm represents",
      "children": [
        {
          "name": "Child Paradigm",
          "description": "...",
          "children": [],
          "attached_entities": ["Tool A", "Company B"]
        }
      ],
      "attached_entities": []
    }
  ]
}

IMPORTANT:
- L1 (root) paradigms MUST have attached_entities: [] (empty array)
- Only L2/L3 paradigms should have attached_entities
- Use exact entity names from the input
- Every non-paradigm entity should appear in exactly one attached_entities list
- Existing paradigm entities should become tree nodes, not attached entities`;

async function fetchAllEntities(userId?: string): Promise<Entity[]> {
  let query = supabase
    .from("entities")
    .select("id, name, type, description, is_primary")
    .order("type")
    .order("name");

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch entities: ${error.message}`);
  }

  return data || [];
}

async function generateParadigmTree(entities: Entity[]): Promise<ProposedTree> {
  console.log("\nGenerating paradigm tree proposal using Claude...\n");

  // Group entities by type for the prompt
  const byType: Record<string, string[]> = {};
  for (const e of entities) {
    if (!byType[e.type]) byType[e.type] = [];
    const desc = e.description ? ` - ${e.description.slice(0, 100)}` : "";
    byType[e.type].push(`${e.name}${desc}`);
  }

  const entityList = Object.entries(byType)
    .map(([type, names]) => `${type.toUpperCase()}S:\n${names.map((n) => `  - ${n}`).join("\n")}`)
    .join("\n\n");

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `${TREE_GENERATION_PROMPT}

---

EXISTING ENTITIES:

${entityList}

---

Generate a paradigm tree to organize these entities. Return valid JSON only.`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in response");
  }

  return JSON.parse(jsonMatch[0]) as ProposedTree;
}

function printTree(tree: ProposedTree): void {
  console.log("\n=== PROPOSED PARADIGM TREE ===\n");

  function printNode(node: ProposedParadigm, depth: number): void {
    const prefix = "  ".repeat(depth);
    const levelLabel = `L${depth + 1}`;
    console.log(`${prefix}[${levelLabel}] ${node.name}`);
    if (node.description) {
      console.log(`${prefix}  "${node.description}"`);
    }
    if (node.attached_entities.length > 0) {
      if (depth < 1) {
        // Warn if L1 paradigm has attachments (should not happen)
        console.log(`${prefix}  ⚠️  WARNING: L1 paradigm has attachments (will be skipped): ${node.attached_entities.join(", ")}`);
      } else {
        console.log(`${prefix}  Attached: ${node.attached_entities.join(", ")}`);
      }
    }
    for (const child of node.children) {
      printNode(child, depth + 1);
    }
  }

  for (const root of tree.roots) {
    printNode(root, 0);
    console.log();
  }
}

function countNodes(tree: ProposedTree): { paradigms: number; attachments: number } {
  let paradigms = 0;
  let attachments = 0;

  function count(node: ProposedParadigm): void {
    paradigms++;
    attachments += node.attached_entities.length;
    for (const child of node.children) {
      count(child);
    }
  }

  for (const root of tree.roots) {
    count(root);
  }

  return { paradigms, attachments };
}

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function normalizeEntityName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/\s+/g, " ")
    .replace(/[^\w\s\-.']/g, "");
}

async function executeMigration(
  tree: ProposedTree,
  entities: Entity[],
  userId: string
): Promise<void> {
  console.log("\n=== EXECUTING MIGRATION ===\n");

  // Build a map of normalized name -> entity for lookups
  const entityMap = new Map<string, Entity>();
  for (const e of entities) {
    entityMap.set(normalizeEntityName(e.name), e);
  }

  // Track created paradigms: name -> id
  const paradigmIds = new Map<string, string>();

  // Also map existing paradigm entities
  for (const e of entities) {
    if (e.type === "paradigm") {
      paradigmIds.set(normalizeEntityName(e.name), e.id);
    }
  }

  async function createOrGetParadigm(
    node: ProposedParadigm,
    parentId: string | null
  ): Promise<string> {
    const normalizedName = normalizeEntityName(node.name);

    // Check if paradigm already exists
    if (paradigmIds.has(normalizedName)) {
      const existingId = paradigmIds.get(normalizedName)!;
      console.log(`  Using existing paradigm: ${node.name}`);

      // If it has a parent and the existing paradigm doesn't have this parent, add the relationship
      if (parentId) {
        await supabase.from("relationships").upsert(
          {
            source_entity_id: parentId,
            target_entity_id: existingId,
            relationship_type: "parent_of",
          },
          {
            onConflict: "source_entity_id,target_entity_id,relationship_type",
            ignoreDuplicates: true,
          }
        );
      }

      return existingId;
    }

    // Create new paradigm
    const { data: newParadigm, error } = await supabase
      .from("entities")
      .insert({
        name: node.name,
        normalized_name: normalizedName,
        type: "paradigm",
        description: node.description,
        is_primary: !parentId, // Root paradigms are primary
        mention_count: 1,
        user_id: userId,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create paradigm ${node.name}: ${error.message}`);
    }

    console.log(`  Created paradigm: ${node.name}`);
    paradigmIds.set(normalizedName, newParadigm.id);

    // Create parent relationship if needed
    if (parentId) {
      await supabase.from("relationships").insert({
        source_entity_id: parentId,
        target_entity_id: newParadigm.id,
        relationship_type: "parent_of",
      });
    }

    return newParadigm.id;
  }

  async function processNode(
    node: ProposedParadigm,
    parentId: string | null,
    depth: number = 0
  ): Promise<void> {
    // Create or get this paradigm
    const paradigmId = await createOrGetParadigm(node, parentId);

    // Process children first (increment depth)
    for (const child of node.children) {
      await processNode(child, paradigmId, depth + 1);
    }

    // Attach entities - but ONLY to L2+ paradigms (depth >= 1)
    if (node.attached_entities.length > 0) {
      if (depth < 1) {
        // L1 paradigm - warn and skip attachments
        console.log(`  Warning: Skipping ${node.attached_entities.length} entity attachments on L1 paradigm "${node.name}" (depth=${depth})`);
        console.log(`    Entities that would have been attached: ${node.attached_entities.join(", ")}`);
        return;
      }

      for (const entityName of node.attached_entities) {
        const normalizedName = normalizeEntityName(entityName);
        const entity = entityMap.get(normalizedName);

        if (!entity) {
          console.log(`  Warning: Entity "${entityName}" not found, skipping`);
          continue;
        }

        // Create parent_of relationship from paradigm to entity
        const { error } = await supabase.from("relationships").upsert(
          {
            source_entity_id: paradigmId,
            target_entity_id: entity.id,
            relationship_type: "parent_of",
          },
          {
            onConflict: "source_entity_id,target_entity_id,relationship_type",
            ignoreDuplicates: true,
          }
        );

        if (error) {
          console.log(`  Warning: Failed to attach ${entityName}: ${error.message}`);
        } else {
          console.log(`  Attached ${entityName} to ${node.name} (L${depth + 1})`);
        }
      }
    }
  }

  // Process all root nodes (depth 0 = L1)
  for (const root of tree.roots) {
    await processNode(root, null, 0);
  }

  // Update is_primary for all attached entities
  console.log("\nUpdating is_primary flags...");

  // Get all entities that are children of paradigms
  const { data: childRelationships } = await supabase
    .from("relationships")
    .select("target_entity_id")
    .eq("relationship_type", "parent_of");

  if (childRelationships && childRelationships.length > 0) {
    const childIds = [...new Set(childRelationships.map((r) => r.target_entity_id))];

    // Set is_primary = false for attached entities (tools, companies)
    await supabase
      .from("entities")
      .update({ is_primary: false })
      .in("id", childIds)
      .in("type", ["paradigm", "tool", "company"])
      .eq("user_id", userId);
  }

  console.log("\nMigration complete!");
}

async function main(): Promise<void> {
  console.log("\n=== Bootstrap Paradigm Tree ===\n");

  // Get user ID (for multi-user support, we need to pick one or iterate)
  const { data: users } = await supabase
    .from("entities")
    .select("user_id")
    .limit(1);

  if (!users || users.length === 0) {
    console.log("No entities found in the database. Nothing to migrate.");
    return;
  }

  const userId = users[0].user_id;
  console.log(`Using user ID: ${userId}\n`);

  // Fetch all entities
  console.log("Fetching existing entities...");
  const entities = await fetchAllEntities(userId);
  console.log(`Found ${entities.length} entities.`);

  if (entities.length === 0) {
    console.log("No entities to organize. Exiting.");
    return;
  }

  // Group by type for summary
  const byType: Record<string, number> = {};
  for (const e of entities) {
    byType[e.type] = (byType[e.type] || 0) + 1;
  }
  console.log("By type:", byType);

  // Generate proposed tree
  const proposedTree = await generateParadigmTree(entities);

  // Print the tree
  printTree(proposedTree);

  // Show summary
  const counts = countNodes(proposedTree);
  console.log(`Summary: ${counts.paradigms} paradigms, ${counts.attachments} entity attachments\n`);

  // Ask for confirmation
  const answer = await prompt("Do you want to execute this migration? (yes/no): ");

  if (answer.toLowerCase() !== "yes") {
    console.log("\nMigration cancelled.");
    return;
  }

  // Execute migration
  await executeMigration(proposedTree, entities, userId);
}

// Run the script
main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
