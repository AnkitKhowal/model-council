import assert from "node:assert/strict";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

function request(path = "/", init) {
  return worker.fetch(
    new Request(`http://localhost${path}`, init),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Model Council experience", async () => {
  const response = await request();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Model Council/);
  assert.match(html, /Ask once\. Decide/);
  assert.match(html, /DigitalOcean Gradient/);
  assert.match(html, /Auto-pick/);
  assert.match(html, /Compare 3 models/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|Your site is taking shape/);
});

test("returns three explainable, allowlisted Auto-pick recommendations", async () => {
  const response = await request("/api/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: "Design a production API architecture and evaluate its scaling, security, and failure tradeoffs.",
    }),
  });

  assert.equal(response.status, 200);
  const recommendation = await response.json();
  const allowed = new Set([
    "openai-gpt-oss-120b",
    "llama-4-maverick",
    "qwen3.5-397b-a17b",
    "openai-gpt-oss-20b",
  ]);

  assert.equal(recommendation.mode, "demo");
  assert.equal(recommendation.method, "rules");
  assert.equal(recommendation.complexity, "high");
  assert.equal(recommendation.selections.length, 3);
  assert.equal(new Set(recommendation.selections.map((selection) => selection.modelId)).size, 3);
  assert.deepEqual(
    recommendation.selections.map((selection) => selection.role),
    ["Best fit", "Complement", "Challenger"],
  );
  recommendation.selections.forEach((selection) => {
    assert.ok(allowed.has(selection.modelId));
    assert.ok(selection.reason.length > 20);
  });
});

test("exposes the complete compatible model directory without media or embedding models", async () => {
  const response = await request("/api/models");
  assert.equal(response.status, 200);

  const directory = await response.json();
  assert.equal(directory.source, "fixture");
  assert.ok(directory.models.length > 40);
  assert.equal(new Set(directory.models.map((model) => model.id)).size, directory.models.length);
  assert.ok(directory.models.some((model) => model.id === "openai-gpt-5.5"));
  assert.ok(directory.models.some((model) => model.id === "anthropic-claude-opus-5"));
  assert.ok(directory.models.every((model) => !/(embedding|rerank|gpt-image|tts|text-to-audio|stable-diffusion)/i.test(model.id)));
});

test("rejects empty prompts and unapproved models", async () => {
  const [emptyPrompt, badModel] = await Promise.all([
    request("/api/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "", modelId: "openai-gpt-oss-120b" }),
    }),
    request("/api/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Hello", modelId: "not-approved" }),
    }),
  ]);

  assert.equal(emptyPrompt.status, 400);
  assert.equal(badModel.status, 400);
  assert.equal((await emptyPrompt.json()).code, "EMPTY_PROMPT");
  assert.equal((await badModel.json()).code, "MODEL_NOT_ALLOWED");
});

test("returns independent demo results with objective metrics", async () => {
  const prompt = "Explain vector databases in simple terms.";
  const modelIds = ["openai-gpt-oss-120b", "llama-4-maverick", "qwen3.5-397b-a17b"];
  const responses = await Promise.all(modelIds.map((modelId) => request("/api/invoke", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, modelId }),
  })));

  responses.forEach((response) => assert.equal(response.status, 200));
  const results = await Promise.all(responses.map((response) => response.json()));
  assert.deepEqual(results.map((result) => result.modelId), modelIds);
  for (const result of results) {
    assert.equal(result.mode, "demo");
    assert.ok(result.output.length > 80);
    assert.ok(result.latencyMs > 0);
    assert.ok(result.usage.totalTokens > 0);
    assert.ok(result.estimatedCost > 0);
  }
});

test("synthesis provenance only references submitted model responses", async () => {
  const prompt = "Explain vector databases in simple terms.";
  const results = [
    {
      modelId: "openai-gpt-oss-120b",
      modelName: "GPT OSS 120B",
      output: "A vector database searches for semantic similarity using embeddings.",
      latencyMs: 800,
      usage: { promptTokens: 20, completionTokens: 20, totalTokens: 40 },
      estimatedCost: 0.00002,
      mode: "demo",
    },
    {
      modelId: "llama-4-maverick",
      modelName: "Llama 4 Maverick",
      output: "It organizes information by meaning instead of exact words.",
      latencyMs: 900,
      usage: { promptTokens: 20, completionTokens: 18, totalTokens: 38 },
      estimatedCost: 0.00003,
      mode: "demo",
    },
  ];

  const response = await request("/api/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, results }),
  });
  assert.equal(response.status, 200);

  const synthesis = await response.json();
  const allowed = new Set(results.map((result) => result.modelId));
  assert.equal(synthesis.mode, "demo");
  assert.ok(synthesis.answer.length > 0);
  for (const section of synthesis.answer) {
    assert.ok(section.sources.length > 0);
    section.sources.forEach((source) => assert.ok(allowed.has(source)));
  }
});
