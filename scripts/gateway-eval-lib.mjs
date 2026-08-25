const REQUIRED_ROLES = ["Best fit", "Complement", "Challenger"];

const TASK_PATTERNS = {
  technical: /software|technical|code|coding|api|architecture|debug|infrastructure|security|database|algorithm/i,
  writing: /writing|communication|content|copy|email/i,
  analysis: /analysis|strategy|decision|recommendation|forecast|research/i,
  explanation: /explanation|explain|focused/i,
  general: /general|other|everyday/i,
};

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function percentile(values, percentileValue) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return sorted[index];
}

export function inferTaskGroup(taskType) {
  if (typeof taskType !== "string") return "unknown";
  return Object.entries(TASK_PATTERNS).find(([, pattern]) => pattern.test(taskType))?.[0] ?? "unknown";
}

export function capabilitiesForModel(modelId) {
  const capabilities = new Set();
  if (/qwen|deepseek|mimo|glm|nemotron|gpt-oss/i.test(modelId)) capabilities.add("technical");
  if (/120b|qwen3\.8|max|deepseek.*pro|ultra|kimi-k3|glm-5\.[12]|mimo.*pro/i.test(modelId)) capabilities.add("reasoning");
  if (/20b|flash|nano|14b|minimax|gemma/i.test(modelId)) capabilities.add("efficiency");
  if (/llama|qwen|mistral|gemma|kimi|gpt-oss/i.test(modelId)) capabilities.add("communication");
  return capabilities;
}

function recommendationContractIsValid(recommendation) {
  return Boolean(
    recommendation
    && typeof recommendation.taskType === "string"
    && recommendation.taskType.trim()
    && ["low", "medium", "high"].includes(recommendation.complexity)
    && typeof recommendation.priority === "string"
    && recommendation.priority.trim()
    && typeof recommendation.summary === "string"
    && recommendation.summary.trim()
    && ["ai", "rules"].includes(recommendation.method)
    && Array.isArray(recommendation.selections)
    && recommendation.selections.length === 3
    && recommendation.selections.every((selection) =>
      selection
      && typeof selection.modelId === "string"
      && typeof selection.reason === "string"
      && selection.reason.trim().length > 0
      && REQUIRED_ROLES.includes(selection.role)
    )
  );
}

export function scoreGatewayCase(testCase, recommendation, models, latencyMs, status = 200) {
  const allowedIds = new Set(models.map((model) => model.id));
  const providerById = new Map(models.map((model) => [model.id, model.provider.split(" · ")[0]]));
  const selections = Array.isArray(recommendation?.selections) ? recommendation.selections : [];
  const selectedIds = selections.map((selection) => selection?.modelId).filter((modelId) => typeof modelId === "string");
  const selectedCapabilities = new Set(selectedIds.flatMap((modelId) => [...capabilitiesForModel(modelId)]));
  const providerCount = new Set(selectedIds.map((modelId) => providerById.get(modelId)).filter(Boolean)).size;
  const contractValid = status === 200 && recommendationContractIsValid(recommendation);
  const allowlistCompliant = selectedIds.length === 3 && selectedIds.every((modelId) => allowedIds.has(modelId));
  const uniqueCouncil = selectedIds.length === 3 && new Set(selectedIds).size === 3;
  const roleCoverage = selections.length === 3 && REQUIRED_ROLES.every((role) => selections.some((selection) => selection?.role === role));
  const taskMatch = inferTaskGroup(recommendation?.taskType) === testCase.expectedTaskGroup;
  const complexityMatch = recommendation?.complexity === testCase.expectedComplexity;
  const missingCapabilities = testCase.expectedCapabilities.filter((capability) => !selectedCapabilities.has(capability));
  const capabilityHitAt3 = missingCapabilities.length === 0;
  const providerDiverse = providerCount >= 2;

  const failures = [];
  if (!contractValid) failures.push("invalid contract");
  if (!allowlistCompliant) failures.push("model outside allowlist");
  if (!uniqueCouncil) failures.push("duplicate or missing model");
  if (!roleCoverage) failures.push("missing council role");
  if (!taskMatch) failures.push(`task classified as ${inferTaskGroup(recommendation?.taskType)}`);
  if (!complexityMatch) failures.push(`complexity classified as ${recommendation?.complexity ?? "unknown"}`);
  if (!capabilityHitAt3) failures.push(`missing ${missingCapabilities.join(", ")}`);
  if (!providerDiverse) failures.push("less than two providers");

  return {
    id: testCase.id,
    category: testCase.category,
    status,
    latencyMs,
    method: recommendation?.method ?? "unknown",
    predictedTaskType: recommendation?.taskType ?? null,
    predictedComplexity: recommendation?.complexity ?? null,
    selectedModelIds: selectedIds,
    contractValid,
    allowlistCompliant,
    uniqueCouncil,
    roleCoverage,
    taskMatch,
    complexityMatch,
    capabilityHitAt3,
    providerDiverse,
    failures,
  };
}

function rate(caseScores, field) {
  return round(caseScores.filter((score) => score[field]).length / Math.max(1, caseScores.length));
}

export function buildGatewayScorecard(dataset, caseScores, metadata = {}) {
  const latencies = caseScores.map((score) => score.latencyMs);
  const metrics = {
    contractValidityRate: rate(caseScores, "contractValid"),
    allowlistComplianceRate: rate(caseScores, "allowlistCompliant"),
    uniqueCouncilRate: rate(caseScores, "uniqueCouncil"),
    roleCoverageRate: rate(caseScores, "roleCoverage"),
    taskAccuracy: rate(caseScores, "taskMatch"),
    complexityAccuracy: rate(caseScores, "complexityMatch"),
    expectedCapabilityHitAt3Rate: rate(caseScores, "capabilityHitAt3"),
    providerDiversityRate: rate(caseScores, "providerDiverse"),
    routingP50LatencyMs: percentile(latencies, 50),
    routingP95LatencyMs: percentile(latencies, 95),
  };
  const gates = Object.entries(dataset.thresholds).map(([metric, threshold]) => {
    const actual = metrics[metric];
    const comparison = metric === "routingP95LatencyMs" ? "atMost" : "atLeast";
    return {
      metric,
      actual,
      threshold,
      comparison,
      passed: comparison === "atMost" ? actual <= threshold : actual >= threshold,
    };
  });
  const methodCounts = caseScores.reduce((counts, score) => {
    counts[score.method] = (counts[score.method] ?? 0) + 1;
    return counts;
  }, {});

  return {
    generatedAt: new Date().toISOString(),
    datasetVersion: dataset.version,
    caseCount: caseScores.length,
    target: metadata.target ?? "unknown",
    datasetSha256: metadata.datasetSha256 ?? null,
    overallPassed: gates.every((gate) => gate.passed),
    metrics,
    thresholds: dataset.thresholds,
    gates,
    methodCounts,
    categoryCounts: caseScores.reduce((counts, score) => {
      counts[score.category] = (counts[score.category] ?? 0) + 1;
      return counts;
    }, {}),
    failedCases: caseScores.filter((score) => score.failures.length > 0),
    cases: caseScores,
    qualityEvaluation: {
      status: "not-scored",
      reason: "Answer quality requires a separate blinded pairwise review; routing heuristics are not an objective quality score.",
    },
  };
}

function formatMetric(metric, value) {
  return metric.endsWith("Ms") ? `${Math.round(value)} ms` : `${Math.round(value * 1000) / 10}%`;
}

export function renderGatewayScorecardMarkdown(scorecard) {
  const rows = scorecard.gates.map((gate) =>
    `| ${gate.metric} | ${formatMetric(gate.metric, gate.actual)} | ${gate.comparison === "atMost" ? "≤" : "≥"} ${formatMetric(gate.metric, gate.threshold)} | ${gate.passed ? "Pass" : "Fail"} |`
  ).join("\n");
  const failures = scorecard.failedCases.length
    ? scorecard.failedCases.map((testCase) => `- \`${testCase.id}\`: ${testCase.failures.join("; ")}`).join("\n")
    : "- None.";

  return `# Gateway evaluation scorecard

Generated: ${scorecard.generatedAt}

Dataset: v${scorecard.datasetVersion} · ${scorecard.caseCount} cases  
Target: ${scorecard.target}  
Overall: **${scorecard.overallPassed ? "PASS" : "FAIL"}**

| Gate | Actual | Threshold | Result |
| --- | ---: | ---: | --- |
${rows}

Routing methods: ${Object.entries(scorecard.methodCounts).map(([method, count]) => `${method}=${count}`).join(", ")}.

## Case-level findings

${failures}

## Interpretation

This scorecard measures routing contract safety, expected task and complexity classification, capability coverage, provider diversity, and routing latency. It does not claim that one model or council is objectively higher quality. Run the opt-in outcome sampler and complete its blinded A/B review for answer-quality evidence.
`;
}
