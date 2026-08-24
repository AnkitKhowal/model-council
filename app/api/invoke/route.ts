import { createFixtureResult } from "../../../lib/fixtures";
import { estimateCost, getModel } from "../../../lib/models";
import type { ApiError, ModelResult } from "../../../lib/types";

const MAX_PROMPT_LENGTH = 4_000;
const REQUEST_TIMEOUT_MS = 30_000;

function isDemoMode() {
  return process.env.DEMO_MODE !== "false";
}

function jsonError(error: string, status: number, code?: string) {
  return Response.json({ error, code } satisfies ApiError, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("The request body must be valid JSON.", 400, "INVALID_JSON");
  }

  const prompt = typeof (body as { prompt?: unknown })?.prompt === "string"
    ? (body as { prompt: string }).prompt.trim()
    : "";
  const modelId = typeof (body as { modelId?: unknown })?.modelId === "string"
    ? (body as { modelId: string }).modelId
    : "";
  const model = getModel(modelId);

  if (!prompt) return jsonError("Enter a prompt before comparing models.", 400, "EMPTY_PROMPT");
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return jsonError(`Prompts are limited to ${MAX_PROMPT_LENGTH.toLocaleString()} characters.`, 400, "PROMPT_TOO_LONG");
  }
  if (!model) return jsonError("That model is not in the approved comparison list.", 400, "MODEL_NOT_ALLOWED");

  if (isDemoMode()) {
    const delay = 650 + (modelId.length % 5) * 230;
    const startedAt = Date.now();
    await new Promise((resolve) => setTimeout(resolve, delay));
    return Response.json(createFixtureResult(prompt, modelId, Date.now() - startedAt));
  }

  const apiKey = process.env.DIGITALOCEAN_INFERENCE_KEY;
  if (!apiKey) {
    return jsonError(
      "Live inference is not configured. Add a server-side inference key or enable demo mode.",
      503,
      "INFERENCE_KEY_MISSING",
    );
  }

  const baseUrl = (process.env.DIGITALOCEAN_INFERENCE_BASE_URL ?? "https://inference.do-ai.run/v1").replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model.id,
        messages: [
          {
            role: "system",
            content: "Answer the user's request directly. Be specific, concise, and state important tradeoffs or uncertainty.",
          },
          { role: "user", content: prompt },
        ],
        max_completion_tokens: 900,
        temperature: 0.35,
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!upstream.ok) {
      const retryable = upstream.status === 408 || upstream.status === 429 || upstream.status >= 500;
      return jsonError(
        retryable
          ? `${model.name} is temporarily unavailable. The other models can still complete.`
          : `${model.name} could not process this request.`,
        upstream.status,
        `UPSTREAM_${upstream.status}`,
      );
    }

    const rawPayload = await upstream.text();
    let payload: {
      choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    try {
      payload = JSON.parse(rawPayload) as typeof payload;
    } catch {
      return jsonError(`${model.name} returned an invalid response. Please try again.`, 502, "INVALID_UPSTREAM_RESPONSE");
    }
    const rawContent = payload.choices?.[0]?.message?.content;
    const output = typeof rawContent === "string"
      ? rawContent.trim()
      : Array.isArray(rawContent)
        ? rawContent.map((part) => part.text ?? "").join("\n").trim()
        : "";

    if (!output) return jsonError(`${model.name} returned an empty response.`, 502, "EMPTY_MODEL_RESPONSE");

    const promptTokens = payload.usage?.prompt_tokens ?? Math.ceil(prompt.length / 4);
    const completionTokens = payload.usage?.completion_tokens ?? Math.ceil(output.length / 4);
    const result: ModelResult = {
      modelId: model.id,
      modelName: model.name,
      output,
      latencyMs: Date.now() - startedAt,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: payload.usage?.total_tokens ?? promptTokens + completionTokens,
      },
      estimatedCost: estimateCost(model.id, promptTokens, completionTokens),
      mode: "live",
    };

    return Response.json(result);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return jsonError(`${model.name} timed out after 30 seconds.`, 504, "MODEL_TIMEOUT");
    }
    return jsonError(`${model.name} could not be reached.`, 502, "UPSTREAM_UNREACHABLE");
  } finally {
    clearTimeout(timeout);
  }
}
