import { estimateCost, getModel } from "./models";
import type { ModelResult, Synthesis } from "./types";

const architectureResponses: Record<string, string> = {
  "openai-gpt-oss-120b": `I would use a token-bucket policy per tenant, backed by Redis and enforced at the API gateway.

1. Give each tenant a configurable capacity and refill rate.
2. Execute refill-and-consume atomically with a Redis Lua script.
3. Use short-lived local token leases to reduce Redis pressure at high volume.
4. Return standard rate-limit headers and a precise Retry-After value.

For resilience, fail open for low-risk reads but fail closed for costly mutations. Track saturation, rejected requests, and Redis latency per tenant.`,
  "llama-4-maverick": `Start with a distributed sliding-window counter because it is easy to explain, tune, and operate.

Keep counters in a regional Redis cluster, partitioned by tenant ID and endpoint class. Apply separate burst and sustained limits, and protect premium operations with tighter quotas. When Redis is unavailable, use a small in-process emergency allowance rather than blocking every customer.

This favors operational clarity while still preventing one tenant from overwhelming shared capacity.`,
  "qwen3.5-397b-a17b": `Use GCRA (Generic Cell Rate Algorithm) with an atomic Redis script. It provides smooth limiting without storing every request timestamp.

Key design details:
• Key: rate:{tenantId}:{routeClass}
• State: theoretical arrival time with TTL
• Atomicity: EVALSHA for compare-and-update
• Scaling: Redis Cluster hash tags keep each tenant's state colocated
• Recovery: bounded local fallback buckets and circuit breaking

Expose policy version, remaining quota, reset time, and decision reason for debugging.`,
  "openai-gpt-oss-20b": `Use a two-level limiter: a fast local token bucket on each instance plus a shared Redis counter per tenant.

The local layer absorbs bursts cheaply. Redis enforces the global quota. Set different limits for reads, writes, and expensive AI operations. Return 429 with Retry-After, and alert when rejection rates rise unexpectedly.

This is simple enough for an MVP and can evolve into a more precise distributed algorithm later.`,
};

const vectorResponses: Record<string, string> = {
  "openai-gpt-oss-120b": `A vector database is a search engine for meaning rather than exact words.

It turns text, images, or other content into lists of numbers called embeddings. Items with similar meaning end up close together in that numerical space. When someone asks a question, the database finds the closest items and returns them as useful context.

Product teams commonly use this for semantic search, recommendations, and retrieval-augmented generation.`,
  "llama-4-maverick": `Imagine organizing a library by ideas instead of alphabetically. Books about similar topics sit near one another even when their titles use different words.

A vector database creates that kind of map for software. It stores a numerical representation of each item and quickly finds the nearest matches. The main product value is helping an application retrieve relevant information even when the user's wording is unexpected.`,
  "qwen3.5-397b-a17b": `A vector database stores embeddings: high-dimensional coordinates produced by an AI model. Similar inputs have nearby coordinates, so the system can search using distance metrics such as cosine similarity.

Unlike a traditional database query, the result is approximate and ranked. Product decisions therefore include the embedding model, metadata filters, recall-versus-latency target, and how retrieved results will be evaluated.`,
  "openai-gpt-oss-20b": `It is a database designed to answer “what is most similar to this?”

Content is converted into numerical fingerprints. The database compares those fingerprints and returns the closest matches. That enables meaning-based search, related-item recommendations, and supplying relevant company information to an AI assistant.`,
};

const genericResponses: Record<string, string> = {
  "openai-gpt-oss-120b": `I would approach this by first defining the desired outcome and constraints, then separating the decision into measurable components.

The strongest implementation starts with a small reversible experiment, records both quality and operating cost, and uses those observations to decide whether additional complexity is justified.`,
  "llama-4-maverick": `There are several reasonable approaches. I would prioritize the one that is easiest for users to understand, validate it with representative examples, and preserve a clear fallback when assumptions do not hold.

The decision should balance customer value, implementation risk, latency, and ongoing operational effort.`,
  "qwen3.5-397b-a17b": `A robust solution should define explicit inputs, outputs, invariants, and failure behavior. Instrument the critical path, validate it against realistic cases, and avoid coupling the interface to one implementation.

This makes the system easier to benchmark, replace, and optimize as requirements change.`,
  "openai-gpt-oss-20b": `Start with the smallest useful version, measure how well it solves the real task, and add complexity only where the evidence supports it.

Keep the first implementation observable and reversible so that later changes do not require a costly migration.`,
};

function fixtureSet(prompt: string) {
  const normalized = prompt.toLowerCase();
  if (normalized.includes("rate-limit") || normalized.includes("rate limit")) {
    return architectureResponses;
  }
  if (normalized.includes("vector database")) return vectorResponses;
  return genericResponses;
}

function approximateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function createFixtureResult(prompt: string, modelId: string, latencyMs: number): ModelResult {
  const model = getModel(modelId);
  if (!model) throw new Error("Unknown fixture model");

  const output = fixtureSet(prompt)[modelId] ?? genericResponses[modelId] ??
    `${model.name} would begin by clarifying the desired outcome, constraints, and failure conditions. It would then compare a small set of viable approaches, make the important tradeoffs explicit, and recommend a reversible first step.\n\nFor this task, the response would prioritize ${model.strength.toLowerCase()} while identifying what should be measured before the design is expanded.`;
  const promptTokens = approximateTokens(prompt) + 24;
  const completionTokens = approximateTokens(output);
  const estimatedCost = estimateCost(modelId, promptTokens, completionTokens);

  return {
    modelId,
    modelName: model.name,
    output,
    latencyMs,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    },
    estimatedCost,
    mode: "demo",
  };
}

export function createFixtureSynthesis(prompt: string, results: ModelResult[]): Synthesis {
  const ids = results.map((result) => result.modelId);
  const architecture = prompt.toLowerCase().includes("rate");
  const vectors = prompt.toLowerCase().includes("vector database");

  if (architecture) {
    return {
      answer: [
        {
          text: "Use a per-tenant token-bucket or GCRA policy at the gateway, with Redis providing the shared source of truth and an atomic script applying each decision.",
          sources: ids,
        },
        {
          text: "Separate burst capacity from sustained quotas, partition limits by endpoint cost, and return standard 429 and Retry-After information so clients can recover predictably.",
          sources: ids.slice(0, Math.min(3, ids.length)),
        },
        {
          text: "Add a bounded local fallback when Redis is impaired. Choose fail-open or fail-closed by operation risk, and monitor rejection rate, saturation, and datastore latency per tenant.",
          sources: ids,
        },
      ],
      agreements: [
        { text: "A shared Redis-backed limit is needed across application instances.", sources: ids },
        { text: "Tenants and endpoint classes should receive distinct quotas.", sources: ids },
      ],
      disagreements: [
        {
          topic: "Core rate-limiting algorithm",
          positions: results.map((result, index) => ({
            modelId: result.modelId,
            text: index === 1 ? "Sliding-window counter for simplicity" : index === 2 ? "GCRA for smoother enforcement" : "Token bucket for configurable bursts",
          })),
        },
        {
          topic: "Datastore failure behavior",
          positions: [
            { modelId: ids[0], text: "Vary fail-open versus fail-closed by operation risk" },
            { modelId: ids[Math.min(1, ids.length - 1)], text: "Use a small local emergency allowance" },
          ],
        },
      ],
      recommendation: {
        label: "Best balanced approach",
        rationale: "Token bucket with atomic Redis enforcement is understandable, scalable, and leaves room for local leasing if traffic grows.",
      },
      mode: "demo",
      engine: "fixture",
    };
  }

  if (vectors) {
    return {
      answer: [
        { text: "A vector database is a search system for similarity and meaning rather than exact text matches.", sources: ids },
        { text: "It stores numerical representations called embeddings and retrieves nearby items, enabling semantic search, recommendations, and relevant context for AI applications.", sources: ids },
        { text: "The results are approximate and ranked, so teams should evaluate retrieval quality as well as latency and cost.", sources: ids.filter((id) => id.includes("qwen") || id.includes("120b")) },
      ],
      agreements: [
        { text: "Embeddings represent content as numbers.", sources: ids },
        { text: "Nearby vectors represent semantically similar items.", sources: ids },
      ],
      disagreements: [
        {
          topic: "Best explanation depth",
          positions: results.map((result, index) => ({
            modelId: result.modelId,
            text: index === 2 ? "Include distance metrics and retrieval tradeoffs" : "Lead with a simple real-world analogy",
          })),
        },
      ],
      recommendation: {
        label: "Best audience fit",
        rationale: "Start with the library analogy, then add the embedding and ranked-retrieval details when the audience needs implementation context.",
      },
      mode: "demo",
      engine: "fixture",
    };
  }

  return {
    answer: [
      { text: "Define the desired outcome and constraints, then test the smallest reversible approach against representative examples.", sources: ids },
      { text: "Measure quality, latency, cost, and failure behavior before adding complexity, while keeping the interface replaceable as requirements evolve.", sources: ids },
    ],
    agreements: [
      { text: "Begin with a focused, measurable implementation.", sources: ids },
      { text: "Keep the first decision reversible and observable.", sources: ids },
    ],
    disagreements: [
      {
        topic: "Primary optimization",
        positions: results.map((result, index) => ({
          modelId: result.modelId,
          text: index === 0 ? "Optimize for measurable outcomes" : index === 1 ? "Optimize for user clarity" : "Optimize for explicit technical invariants",
        })),
      },
    ],
    recommendation: {
      label: "Evidence-led starting point",
      rationale: "Run a small experiment with clear success measures before committing to additional platform complexity.",
    },
    mode: "demo",
    engine: "fixture",
  };
}
