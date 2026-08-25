import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  buildGatewayScorecard,
  renderGatewayScorecardMarkdown,
  scoreGatewayCase,
} from "./gateway-eval-lib.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const datasetPath = fileURLToPath(new URL("../evals/gateway-cases.json", import.meta.url));
const resultsDirectory = fileURLToPath(new URL("../evals/results/", import.meta.url));
const args = new Set(process.argv.slice(2));
const requestedBaseUrl = process.env.MODEL_COUNCIL_URL?.replace(/\/$/, "");
const useLiveDeployment = args.has("--live") || Boolean(requestedBaseUrl);
const sampleOutcomes = args.has("--outcomes");
const evaluationConcurrency = Math.max(1, Number.parseInt(process.env.EVAL_CONCURRENCY ?? (useLiveDeployment ? "4" : "30"), 10));
const runLabel = (process.env.EVAL_RUN_LABEL ?? (useLiveDeployment ? "live" : "fixture"))
  .toLowerCase()
  .replace(/[^a-z0-9-]+/g, "-")
  .replace(/^-|-$/g, "") || "run";
const scorecardPathPrefix = `${resultsDirectory}gateway-scorecard-${runLabel}`;

if (useLiveDeployment && process.env.CONFIRM_BILLABLE_EVAL !== "true") {
  throw new Error("Live gateway evaluation can make billable inference calls. Set CONFIRM_BILLABLE_EVAL=true to continue.");
}
if (sampleOutcomes && !requestedBaseUrl) {
  throw new Error("Outcome sampling requires MODEL_COUNCIL_URL to point to a live deployment.");
}

const datasetSource = await readFile(datasetPath, "utf8");
const dataset = JSON.parse(datasetSource);
const datasetSha256 = createHash("sha256").update(datasetSource).digest("hex");

let worker;
if (!useLiveDeployment) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("eval", `${process.pid}-${Date.now()}`);
  ({ default: worker } = await import(workerUrl.href));
}

async function appFetch(path, init) {
  if (useLiveDeployment) return fetch(`${requestedBaseUrl}${path}`, init);
  return worker.fetch(
    new Request(`http://localhost${path}`, init),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function requestJson(path, init) {
  const startedAt = performance.now();
  try {
    const response = await appFetch(path, init);
    const latencyMs = Math.round(performance.now() - startedAt);
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text.slice(0, 300) || "Non-JSON response" };
    }
    return { status: response.status, payload, latencyMs };
  } catch (error) {
    return {
      status: 0,
      payload: { error: error instanceof Error ? error.message : "Request failed" },
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }
}

const directoryResponse = await requestJson("/api/models");
if (directoryResponse.status !== 200 || !Array.isArray(directoryResponse.payload.models)) {
  throw new Error(`The model directory could not be loaded (${directoryResponse.status}).`);
}
const models = directoryResponse.payload.models;

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function workerLoop() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, workerLoop));
  return results;
}

const evaluatedCases = await mapWithConcurrency(dataset.cases, evaluationConcurrency, async (testCase) => {
  const response = await requestJson("/api/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: testCase.prompt }),
  });
  return {
    testCase,
    recommendation: response.payload,
    score: scoreGatewayCase(testCase, response.payload, models, response.latencyMs, response.status),
  };
});

const scorecard = buildGatewayScorecard(
  dataset,
  evaluatedCases.map((entry) => entry.score),
  {
    target: useLiveDeployment ? requestedBaseUrl : "built worker · fixture routing",
    datasetSha256,
  },
);

await mkdir(resultsDirectory, { recursive: true });
await Promise.all([
  writeFile(`${scorecardPathPrefix}.json`, `${JSON.stringify(scorecard, null, 2)}\n`, "utf8"),
  writeFile(`${scorecardPathPrefix}.md`, renderGatewayScorecardMarkdown(scorecard), "utf8"),
]);

async function invokeModels(prompt, modelIds) {
  const entries = await Promise.all([...new Set(modelIds)].map(async (modelId) => {
    const response = await requestJson("/api/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, modelId }),
    });
    return [modelId, response];
  }));
  return new Map(entries);
}

function successfulResults(modelIds, responses) {
  return modelIds.flatMap((modelId) => {
    const response = responses.get(modelId);
    return response?.status === 200 && typeof response.payload?.output === "string"
      ? [response.payload]
      : [];
  });
}

async function synthesize(prompt, results) {
  if (results.length < 2) return null;
  const response = await requestJson("/api/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, results: results.slice(0, 3) }),
  });
  if (response.status !== 200 || !Array.isArray(response.payload.answer)) return null;
  return {
    text: response.payload.answer.map((section) => section.text).join("\n\n"),
    latencyMs: response.latencyMs,
    engine: response.payload.engine ?? response.payload.mode,
  };
}

function objectiveCouncilMetrics(results) {
  const costs = results.map((result) => result.estimatedCost).filter((cost) => typeof cost === "number");
  return {
    successfulSeats: results.length,
    wallClockLatencyMs: results.length ? Math.max(...results.map((result) => result.latencyMs)) : null,
    totalTokens: results.reduce((total, result) => total + (result.usage?.totalTokens ?? 0), 0),
    estimatedCost: costs.length === results.length ? costs.reduce((total, cost) => total + cost, 0) : null,
  };
}

if (sampleOutcomes) {
  const sampledCases = evaluatedCases.filter(({ testCase }) => testCase.outcomeSample);
  const reviewItems = [];
  const routingDetails = [];

  for (const [index, entry] of sampledCases.entries()) {
    const autoModelIds = entry.score.selectedModelIds;
    const baselineModelIds = dataset.baselineModelIds;
    const responses = await invokeModels(entry.testCase.prompt, [...autoModelIds, ...baselineModelIds]);
    const autoResults = successfulResults(autoModelIds, responses);
    const baselineResults = successfulResults(baselineModelIds, responses);
    const [autoSynthesis, baselineSynthesis] = await Promise.all([
      synthesize(entry.testCase.prompt, autoResults),
      synthesize(entry.testCase.prompt, baselineResults),
    ]);
    const autoFirst = index % 2 === 0;

    reviewItems.push({
      id: entry.testCase.id,
      prompt: entry.testCase.prompt,
      candidateA: autoFirst ? autoSynthesis?.text ?? null : baselineSynthesis?.text ?? null,
      candidateB: autoFirst ? baselineSynthesis?.text ?? null : autoSynthesis?.text ?? null,
      winner: null,
      notes: "",
    });
    routingDetails.push({
      id: entry.testCase.id,
      candidateMapping: autoFirst ? { A: "auto-pick", B: "fixed-baseline" } : { A: "fixed-baseline", B: "auto-pick" },
      autoPick: {
        modelIds: autoModelIds,
        ...objectiveCouncilMetrics(autoResults),
        synthesisLatencyMs: autoSynthesis?.latencyMs ?? null,
      },
      fixedBaseline: {
        modelIds: baselineModelIds,
        ...objectiveCouncilMetrics(baselineResults),
        synthesisLatencyMs: baselineSynthesis?.latencyMs ?? null,
      },
    });
  }

  await writeFile(
    `${resultsDirectory}gateway-outcome-review.json`,
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      target: requestedBaseUrl,
      instructions: "Review candidate A and B without reading routingDetails. Set winner to A, B, or tie; then aggregate the unblinded mappings.",
      reviewItems,
      routingDetails,
    }, null, 2)}\n`,
    "utf8",
  );
}

process.stdout.write([
  `Gateway evaluation: ${scorecard.overallPassed ? "PASS" : "FAIL"}`,
  `Cases: ${scorecard.caseCount}`,
  `Contract: ${(scorecard.metrics.contractValidityRate * 100).toFixed(1)}%`,
  `Capability Hit@3: ${(scorecard.metrics.expectedCapabilityHitAt3Rate * 100).toFixed(1)}%`,
  `Task accuracy: ${(scorecard.metrics.taskAccuracy * 100).toFixed(1)}%`,
  `Complexity accuracy: ${(scorecard.metrics.complexityAccuracy * 100).toFixed(1)}%`,
  `Routing p95: ${scorecard.metrics.routingP95LatencyMs} ms`,
  `Report: ${scorecardPathPrefix}.md`,
  ...(sampleOutcomes ? [`Blind review: ${projectRoot}evals/results/gateway-outcome-review.json`] : []),
].join("\n") + "\n");

if (!scorecard.overallPassed) process.exitCode = 1;
