export type RunMode = "demo" | "live";

export type AutoPickComplexity = "low" | "medium" | "high";

export type AutoPickRole = "Best fit" | "Complement" | "Challenger";

export type AutoPickRecommendation = {
  taskType: string;
  complexity: AutoPickComplexity;
  priority: string;
  summary: string;
  selections: Array<{
    modelId: string;
    role: AutoPickRole;
    reason: string;
  }>;
  mode: RunMode;
  method: "ai" | "rules";
  notice?: string;
};

export type Usage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type ModelResult = {
  modelId: string;
  modelName: string;
  output: string;
  latencyMs: number;
  usage: Usage;
  estimatedCost: number | null;
  mode: RunMode;
};

export type ProvenanceSection = {
  text: string;
  sources: string[];
};

export type Agreement = {
  text: string;
  sources: string[];
};

export type Disagreement = {
  topic: string;
  positions: Array<{
    modelId: string;
    text: string;
  }>;
};

export type Synthesis = {
  answer: ProvenanceSection[];
  agreements: Agreement[];
  disagreements: Disagreement[];
  recommendation: {
    label: string;
    rationale: string;
  };
  mode: RunMode;
  engine?: "fixture" | "digitalocean-model-synthesis" | "direct-synthesizer";
};

export type ApiError = {
  error: string;
  code?: string;
};

export type ModelDirectory = {
  models: import("./models").ModelConfig[];
  source: "digitalocean" | "fixture" | "fallback";
  notice?: string;
};
