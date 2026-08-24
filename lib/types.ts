export type RunMode = "demo" | "live";

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
  estimatedCost: number;
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
