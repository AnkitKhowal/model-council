const baseUrl = (process.env.MODEL_COUNCIL_URL ?? "http://localhost:3000").replace(/\/$/, "");
const concurrency = Number.parseInt(process.env.PROBE_CONCURRENCY ?? "4", 10);
const timeoutMs = Number.parseInt(process.env.PROBE_TIMEOUT_MS ?? "40000", 10);
const prompt = "Reply with exactly OK and nothing else.";

const excludedModelPattern = /(^router:|all-mini-lm|gte-|mpnet|embed|embedding|rerank|bge-|e5-|gpt-image|stable-diffusion|flux|sdxl|tts|text-to-audio|speech|whisper|elevenlabs|wan\d|t2v|image-generation)/i;

async function fetchJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { error: text.slice(0, 200) || "Non-JSON response" };
  }
  return { response, payload };
}

const { response: directoryResponse, payload: directory } = await fetchJson("/api/models");
if (!directoryResponse.ok || !Array.isArray(directory.models)) {
  throw new Error(`Could not load model directory (${directoryResponse.status}).`);
}

const candidates = directory.models
  .map((model) => model.id)
  .filter((modelId) => typeof modelId === "string" && !excludedModelPattern.test(modelId));

let cursor = 0;
const results = [];

async function worker() {
  while (cursor < candidates.length) {
    const modelId = candidates[cursor++];
    const startedAt = Date.now();
    try {
      const { response, payload } = await fetchJson("/api/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, prompt }),
      });
      const result = {
        modelId,
        working: response.ok && typeof payload.output === "string" && payload.output.trim().length > 0,
        status: response.status,
        code: payload.code ?? null,
        latencyMs: Date.now() - startedAt,
        error: response.ok ? null : payload.error ?? "Unknown error",
      };
      results.push(result);
      process.stderr.write(`${result.working ? "PASS" : "FAIL"} ${modelId} ${result.status} ${result.latencyMs}ms\n`);
    } catch (error) {
      const result = {
        modelId,
        working: false,
        status: 0,
        code: error?.name ?? "PROBE_ERROR",
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Probe failed",
      };
      results.push(result);
      process.stderr.write(`FAIL ${modelId} 0 ${result.latencyMs}ms\n`);
    }
  }
}

await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, candidates.length)) }, worker));
results.sort((a, b) => candidates.indexOf(a.modelId) - candidates.indexOf(b.modelId));

const output = {
  probedAt: new Date().toISOString(),
  baseUrl,
  candidateCount: candidates.length,
  workingModelIds: results.filter((result) => result.working).map((result) => result.modelId),
  results,
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
