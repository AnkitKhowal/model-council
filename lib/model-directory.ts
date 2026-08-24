import { MODEL_CATALOG, createModelConfig, isTextModelId, type ModelConfig } from "./models";
import type { ModelDirectory } from "./types";

const CACHE_TTL_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 10_000;
let cachedDirectory: { expiresAt: number; value: ModelDirectory } | null = null;

function fallbackDirectory(notice?: string): ModelDirectory {
  return {
    models: MODEL_CATALOG,
    source: process.env.DEMO_MODE !== "false" ? "fixture" : "fallback",
    ...(notice ? { notice } : {}),
  };
}

export async function getModelDirectory(): Promise<ModelDirectory> {
  if (process.env.DEMO_MODE !== "false") return fallbackDirectory();
  if (cachedDirectory && cachedDirectory.expiresAt > Date.now()) return cachedDirectory.value;

  const apiKey = process.env.DIGITALOCEAN_INFERENCE_KEY;
  if (!apiKey) return fallbackDirectory("Live model discovery is unavailable, so the built-in catalog is shown.");

  const baseUrl = (process.env.DIGITALOCEAN_INFERENCE_BASE_URL ?? "https://inference.do-ai.run/v1").replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return fallbackDirectory("DigitalOcean model discovery failed, so the built-in catalog is shown.");

    const payload = await response.json() as { data?: Array<{ id?: unknown; owned_by?: unknown }> };
    const models = (payload.data ?? []).flatMap((entry): ModelConfig[] => {
      if (typeof entry.id !== "string" || !isTextModelId(entry.id)) return [];
      return [createModelConfig(entry.id, typeof entry.owned_by === "string" ? entry.owned_by : undefined)];
    }).filter((model, index, all) => all.findIndex((candidate) => candidate.id === model.id) === index)
      .sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));

    if (models.length < 3) return fallbackDirectory("DigitalOcean returned too few compatible text models, so the built-in catalog is shown.");
    const value: ModelDirectory = { models, source: "digitalocean" };
    cachedDirectory = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return fallbackDirectory("DigitalOcean model discovery timed out, so the built-in catalog is shown.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveAvailableModel(modelId: string) {
  const directory = await getModelDirectory();
  return directory.models.find((model) => model.id === modelId);
}
