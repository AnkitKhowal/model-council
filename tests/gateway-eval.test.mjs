import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildGatewayScorecard,
  scoreGatewayCase,
} from "../scripts/gateway-eval-lib.mjs";

const dataset = JSON.parse(await readFile(new URL("../evals/gateway-cases.json", import.meta.url), "utf8"));
const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("gateway-eval-test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

function request(path = "/", init) {
  return worker.fetch(
    new Request(`http://localhost${path}`, init),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function postJson(path, body) {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("gateway dataset produces councils that pass the routing guardrails", async () => {
  const directoryResponse = await request("/api/models");
  assert.equal(directoryResponse.status, 200);
  const directory = await directoryResponse.json();

  const caseScores = await Promise.all(dataset.cases.map(async (testCase) => {
    const startedAt = performance.now();
    const response = await postJson("/api/recommend", { prompt: testCase.prompt });
    const recommendation = await response.json();
    return scoreGatewayCase(
      testCase,
      recommendation,
      directory.models,
      Math.round(performance.now() - startedAt),
      response.status,
    );
  }));
  const scorecard = buildGatewayScorecard(dataset, caseScores, { target: "test worker" });

  assert.equal(dataset.cases.length, 30);
  assert.equal(scorecard.overallPassed, true, JSON.stringify(scorecard.failedCases, null, 2));
  assert.equal(scorecard.metrics.contractValidityRate, 1);
  assert.equal(scorecard.metrics.allowlistComplianceRate, 1);
  assert.equal(scorecard.metrics.uniqueCouncilRate, 1);
  assert.equal(scorecard.metrics.roleCoverageRate, 1);
  assert.ok(scorecard.metrics.expectedCapabilityHitAt3Rate >= dataset.thresholds.expectedCapabilityHitAt3Rate);
  assert.ok(scorecard.metrics.taskAccuracy >= dataset.thresholds.taskAccuracy);
  assert.ok(scorecard.metrics.complexityAccuracy >= dataset.thresholds.complexityAccuracy);
});

test("gateway scorer fails duplicate, fabricated, and malformed recommendations", () => {
  const models = [
    { id: "allowed-a", provider: "Provider A · DigitalOcean Inference" },
    { id: "allowed-b", provider: "Provider B · DigitalOcean Inference" },
  ];
  const score = scoreGatewayCase(
    dataset.cases[0],
    {
      taskType: "Software and technical design",
      complexity: "high",
      priority: "Reasoning",
      summary: "Invalid fixture",
      method: "ai",
      selections: [
        { modelId: "allowed-a", role: "Best fit", reason: "A" },
        { modelId: "allowed-a", role: "Complement", reason: "B" },
        { modelId: "fabricated-model", role: "Challenger", reason: "C" },
      ],
    },
    models,
    10,
  );

  assert.equal(score.allowlistCompliant, false);
  assert.equal(score.uniqueCouncil, false);
  assert.ok(score.failures.includes("model outside allowlist"));
  assert.ok(score.failures.includes("duplicate or missing model"));
});

test("Auto-pick validates empty and oversized prompts", async () => {
  const [empty, oversized] = await Promise.all([
    postJson("/api/recommend", { prompt: "" }),
    postJson("/api/recommend", { prompt: "x".repeat(4_001) }),
  ]);

  assert.equal(empty.status, 400);
  assert.equal(oversized.status, 400);
  assert.equal((await empty.json()).code, "EMPTY_PROMPT");
  assert.equal((await oversized.json()).code, "PROMPT_TOO_LONG");
});

test("prompt injection cases cannot escape the verified catalog", async () => {
  const directory = await (await request("/api/models")).json();
  const allowedIds = new Set(directory.models.map((model) => model.id));
  const adversarialCases = dataset.cases.filter((testCase) => testCase.category === "adversarial");
  const recommendations = await Promise.all(adversarialCases.map(async (testCase) =>
    (await postJson("/api/recommend", { prompt: testCase.prompt })).json()
  ));

  for (const recommendation of recommendations) {
    assert.equal(recommendation.selections.length, 3);
    assert.equal(new Set(recommendation.selections.map((selection) => selection.modelId)).size, 3);
    recommendation.selections.forEach((selection) => assert.ok(allowedIds.has(selection.modelId)));
  }
});

test("one failed model request leaves successful seats usable for synthesis", async () => {
  const prompt = "Explain why idempotency matters in an API.";
  const modelIds = ["openai-gpt-oss-120b", "not-in-catalog", "openai-gpt-oss-20b"];
  const responses = await Promise.all(modelIds.map((modelId) => postJson("/api/invoke", { prompt, modelId })));

  assert.deepEqual(responses.map((response) => response.status), [200, 400, 200]);
  const payloads = await Promise.all(responses.map((response) => response.json()));
  const successfulResults = payloads.filter((_, index) => responses[index].status === 200);
  assert.equal(successfulResults.length, 2);

  const synthesis = await postJson("/api/synthesize", { prompt, results: successfulResults });
  assert.equal(synthesis.status, 200);
  const combined = await synthesis.json();
  const successfulIds = new Set(successfulResults.map((result) => result.modelId));
  combined.answer.flatMap((section) => section.sources).forEach((source) => assert.ok(successfulIds.has(source)));
});

test("synthesis refuses to invent a council from one successful seat", async () => {
  const response = await postJson("/api/synthesize", {
    prompt: "Explain queues.",
    results: [{
      modelId: "openai-gpt-oss-120b",
      modelName: "GPT OSS 120B",
      output: "A queue processes work in order.",
      latencyMs: 100,
      usage: { promptTokens: 5, completionTokens: 7, totalTokens: 12 },
      estimatedCost: 0.00001,
      mode: "demo",
    }],
  });

  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "INVALID_RESULT_COUNT");
});
