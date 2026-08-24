export type ModelConfig = {
  id: string;
  name: string;
  shortName: string;
  provider: string;
  strength: string;
  accent: "blue" | "violet" | "teal" | "amber";
  inputRatePerMillion: number | null;
  outputRatePerMillion: number | null;
};

export const PRICING_AS_OF = "August 2026";

const DEMO_MODEL_IDS = [
  "openai-gpt-oss-120b", "llama-4-maverick", "qwen3.5-397b-a17b", "openai-gpt-oss-20b",
  "openai-gpt-5.6-sol", "openai-gpt-5.6-terra", "openai-gpt-5.6-luna", "openai-gpt-5.5",
  "openai-gpt-5.4", "openai-gpt-5.4-mini", "openai-gpt-5.4-nano", "openai-gpt-5.4-pro",
  "openai-gpt-5.3-codex", "openai-gpt-5.2", "openai-gpt-5.2-pro", "openai-gpt-5",
  "openai-gpt-5-mini", "openai-gpt-5-nano", "openai-gpt-4.1", "openai-gpt-4o",
  "openai-gpt-4o-mini", "openai-o1", "openai-o3", "openai-o3-mini",
  "anthropic-claude-fable-5", "anthropic-claude-haiku-4.5", "anthropic-claude-opus-5",
  "anthropic-claude-opus-4.8", "anthropic-claude-opus-4.7", "anthropic-claude-opus-4.6",
  "anthropic-claude-opus-4.5", "anthropic-claude-5-sonnet", "anthropic-claude-4.6-sonnet",
  "anthropic-claude-4.5-sonnet", "arcee-trinity-large-thinking", "qwen3.8-max",
  "deepseek-v4-pro-0813", "deepseek-v4-flash-0731", "deepseek-v4-pro", "deepseek-4-flash",
  "deepseek-3.2", "gemma-4-31B-it", "minimax-m2.5", "kimi-k3", "kimi-k2.6", "kimi-k2.5",
  "mistral-3-14B", "nemotron-3-ultra-550b", "nvidia-nemotron-3-super-120b",
  "nemotron-3-nano-omni", "nemotron-nano-12b-v2-vl", "mimo-v2.5-pro", "glm-5.2", "glm-5.1", "glm-5",
] as const;

const NAME_OVERRIDES: Record<string, string> = {
  "openai-gpt-oss-120b": "GPT OSS 120B",
  "openai-gpt-oss-20b": "GPT OSS 20B",
  "llama-4-maverick": "Llama 4 Maverick",
  "qwen3.5-397b-a17b": "Qwen 3.5 397B A17B",
  "qwen3.8-max": "Qwen 3.8 Max",
  "gemma-4-31B-it": "Gemma 4 31B IT",
  "mimo-v2.5-pro": "MiMo V2.5 Pro",
};

const PRICING: Record<string, [number, number]> = {
  "openai-gpt-oss-120b": [0.1, 0.7],
  "llama-4-maverick": [0.25, 0.87],
  "qwen3.5-397b-a17b": [0.55, 3.5],
  "openai-gpt-oss-20b": [0.05, 0.45],
};

const NON_TEXT_MODEL_PATTERN = /(^fal-ai\/|embed|embedding|rerank|bge-|e5-|gpt-image|stable-diffusion|flux|sdxl|tts|text-to-audio|speech|whisper|elevenlabs|wan\d|t2v|image-generation)/i;

function providerFor(modelId: string, ownedBy?: string) {
  if (/^openai-|^openai\//i.test(modelId)) return "OpenAI";
  if (/^anthropic-|claude/i.test(modelId)) return "Anthropic";
  if (/llama|^meta[-/]/i.test(modelId)) return "Meta";
  if (/qwen/i.test(modelId)) return "Alibaba";
  if (/deepseek/i.test(modelId)) return "DeepSeek";
  if (/kimi/i.test(modelId)) return "Moonshot AI";
  if (/mistral|ministral/i.test(modelId)) return "Mistral AI";
  if (/nemotron|nvidia/i.test(modelId)) return "NVIDIA";
  if (/gemma/i.test(modelId)) return "Google";
  if (/^glm/i.test(modelId)) return "Z.ai";
  if (/mimo/i.test(modelId)) return "Xiaomi";
  if (/minimax/i.test(modelId)) return "MiniMax";
  if (/arcee/i.test(modelId)) return "Arcee AI";
  return ownedBy && ownedBy !== "digitalocean"
    ? ownedBy.replace(/(^|[-_])\w/g, (value) => value.replace(/[-_]/, "").toUpperCase())
    : "DigitalOcean hosted";
}

function displayNameFor(modelId: string) {
  if (NAME_OVERRIDES[modelId]) return NAME_OVERRIDES[modelId];
  const withoutProvider = modelId.replace(/^(openai|anthropic|meta|nvidia|arcee)[-/]/i, "").replace(/^models\//i, "");
  const tokenNames: Record<string, string> = {
    ai: "AI", a17b: "A17B", codex: "Codex", deepseek: "DeepSeek", glm: "GLM", gpt: "GPT",
    it: "IT", kimi: "Kimi", llama: "Llama", mimo: "MiMo", minimax: "MiniMax", nemotron: "Nemotron",
    omni: "Omni", opus: "Opus", oss: "OSS", qwen: "Qwen", sonnet: "Sonnet", vl: "VL",
  };
  return withoutProvider.split(/[-_/]+/).filter(Boolean).map((token) => {
    const lower = token.toLowerCase();
    if (tokenNames[lower]) return tokenNames[lower];
    if (/^\d+(?:\.\d+)?[a-z]*$/i.test(token)) return token.toUpperCase();
    return token.charAt(0).toUpperCase() + token.slice(1);
  }).join(" ");
}

function strengthFor(modelId: string) {
  if (/codex|code/i.test(modelId)) return "Coding";
  if (/haiku|flash|luna|mini|nano|20b|8b|small/i.test(modelId)) return "Speed and efficiency";
  if (/opus|sol|120b|large|thinking|reason|^openai-o[13]/i.test(modelId)) return "Deep reasoning";
  if (/vl|vision|maverick|kimi/i.test(modelId)) return "Multimodal reasoning";
  return "General purpose";
}

function accentFor(provider: string): ModelConfig["accent"] {
  if (["Anthropic", "Arcee AI"].includes(provider)) return "violet";
  if (["Alibaba", "DeepSeek", "Z.ai"].includes(provider)) return "teal";
  if (["Meta", "Mistral AI", "Google"].includes(provider)) return "amber";
  return "blue";
}

export function isTextModelId(modelId: string) {
  return Boolean(modelId) && modelId.length <= 160 && !NON_TEXT_MODEL_PATTERN.test(modelId);
}

export function createModelConfig(modelId: string, ownedBy?: string): ModelConfig {
  const providerName = providerFor(modelId, ownedBy);
  const name = displayNameFor(modelId);
  const rates = PRICING[modelId];
  return {
    id: modelId,
    name,
    shortName: name.length > 20 ? name.split(" ").slice(0, 3).join(" ") : name,
    provider: `${providerName} · DigitalOcean Inference`,
    strength: strengthFor(modelId),
    accent: accentFor(providerName),
    inputRatePerMillion: rates?.[0] ?? null,
    outputRatePerMillion: rates?.[1] ?? null,
  };
}

export const MODEL_CATALOG: ModelConfig[] = DEMO_MODEL_IDS.map((modelId) => createModelConfig(modelId));

export const DEFAULT_MODEL_IDS = ["openai-gpt-oss-120b", "llama-4-maverick", "qwen3.5-397b-a17b"];

export function getModel(modelId: string, catalog: ModelConfig[] = MODEL_CATALOG) {
  return catalog.find((model) => model.id === modelId);
}

export function usesResponsesApi(modelId: string) {
  return /^openai-gpt-5\.(?:4(?:-|$)|5$)/.test(modelId);
}

export function estimateCost(modelId: string, promptTokens: number, completionTokens: number, catalog: ModelConfig[] = MODEL_CATALOG) {
  const model = getModel(modelId, catalog);
  if (!model || model.inputRatePerMillion === null || model.outputRatePerMillion === null) return null;
  return (promptTokens / 1_000_000) * model.inputRatePerMillion
    + (completionTokens / 1_000_000) * model.outputRatePerMillion;
}
