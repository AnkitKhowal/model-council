export type ModelConfig = {
  id: string;
  name: string;
  shortName: string;
  provider: string;
  strength: string;
  accent: "blue" | "violet" | "teal" | "amber";
  inputRatePerMillion: number;
  outputRatePerMillion: number;
};

export const PRICING_AS_OF = "August 2026";

export const MODEL_CATALOG: ModelConfig[] = [
  {
    id: "openai-gpt-oss-120b",
    name: "GPT OSS 120B",
    shortName: "GPT OSS",
    provider: "OpenAI · DigitalOcean hosted",
    strength: "Deep reasoning",
    accent: "blue",
    inputRatePerMillion: 0.1,
    outputRatePerMillion: 0.7,
  },
  {
    id: "llama-4-maverick",
    name: "Llama 4 Maverick",
    shortName: "Llama 4",
    provider: "Meta · DigitalOcean hosted",
    strength: "Balanced",
    accent: "violet",
    inputRatePerMillion: 0.25,
    outputRatePerMillion: 0.87,
  },
  {
    id: "qwen3.5-397b-a17b",
    name: "Qwen 3.5 397B",
    shortName: "Qwen 3.5",
    provider: "Alibaba · DigitalOcean hosted",
    strength: "Technical depth",
    accent: "teal",
    inputRatePerMillion: 0.55,
    outputRatePerMillion: 3.5,
  },
  {
    id: "openai-gpt-oss-20b",
    name: "GPT OSS 20B",
    shortName: "GPT OSS 20B",
    provider: "OpenAI · DigitalOcean hosted",
    strength: "Speed and efficiency",
    accent: "amber",
    inputRatePerMillion: 0.05,
    outputRatePerMillion: 0.45,
  },
];

export const DEFAULT_MODEL_IDS = MODEL_CATALOG.slice(0, 3).map((model) => model.id);

export function getModel(modelId: string) {
  return MODEL_CATALOG.find((model) => model.id === modelId);
}

export function estimateCost(
  modelId: string,
  promptTokens: number,
  completionTokens: number,
) {
  const model = getModel(modelId);
  if (!model) return 0;

  return (
    (promptTokens / 1_000_000) * model.inputRatePerMillion +
    (completionTokens / 1_000_000) * model.outputRatePerMillion
  );
}
