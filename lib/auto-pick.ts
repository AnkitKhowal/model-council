import { MODEL_CATALOG, type ModelConfig } from "./models";
import type { AutoPickComplexity, AutoPickRecommendation, AutoPickRole, RunMode } from "./types";

const MODEL_IDS = {
  deepReasoning: "openai-gpt-oss-120b",
  generalist: "llama-4-maverick",
  technical: "qwen3.8-max",
  efficient: "openai-gpt-oss-20b",
} as const;

const ROLES: AutoPickRole[] = ["Best fit", "Complement", "Challenger"];

const MODEL_REASONS: Record<string, string> = {
  [MODEL_IDS.deepReasoning]: "Leads on multi-step reasoning, constraints, and tradeoffs.",
  [MODEL_IDS.generalist]: "Adds a balanced generalist perspective and clear communication.",
  [MODEL_IDS.technical]: "Challenges the answer with technical depth and implementation detail.",
  [MODEL_IDS.efficient]: "Tests whether a faster, lower-cost model is sufficient.",
};

const TECHNICAL_PATTERN = /\b(code|coding|api|architecture|architect|debug|algorithm|database|sql|distributed|infrastructure|security|software|typescript|javascript|python|kubernetes|network|latency|rate[- ]limit|scal(?:e|ing))\b/i;
const ANALYSIS_PATTERN = /\b(analy[sz]e|evaluate|compare|strategy|tradeoffs?|recommend|decision|plan|risk|forecast|research)\b/i;
const WRITING_PATTERN = /\b(write|rewrite|edit|email|copy|headline|blog|story|tone|summari[sz]e)\b/i;
const SIMPLE_PATTERN = /\b(simple|simply|brief|briefly|concise|plain english|eli5|one sentence|short)\b/i;
const HIGH_STAKES_PATTERN = /\b(legal|medical|financial|security|compliance|privacy|production|proof|formal verification)\b/i;

export function createRuleRecommendation(
  prompt: string,
  mode: RunMode,
  availableModels: ModelConfig[] = MODEL_CATALOG,
  notice?: string,
): AutoPickRecommendation {
  const isTechnical = TECHNICAL_PATTERN.test(prompt);
  const isAnalysis = ANALYSIS_PATTERN.test(prompt);
  const isWriting = WRITING_PATTERN.test(prompt);
  const isSimple = SIMPLE_PATTERN.test(prompt);
  const isHighStakes = HIGH_STAKES_PATTERN.test(prompt);
  const isLong = prompt.length > 700;
  const complexity: AutoPickComplexity = isLong || isHighStakes || (isTechnical && isAnalysis)
    ? "high"
    : isSimple && prompt.length < 260
      ? "low"
      : "medium";

  let taskType = "General reasoning";
  let priority = "Balanced reasoning and clarity";
  let modelIds: string[] = [MODEL_IDS.deepReasoning, MODEL_IDS.generalist, MODEL_IDS.efficient];

  if (isTechnical) {
    taskType = "Software and technical design";
    priority = complexity === "high" ? "Reasoning depth and implementation detail" : "Technical accuracy and efficiency";
    modelIds = complexity === "high"
      ? [MODEL_IDS.deepReasoning, MODEL_IDS.technical, MODEL_IDS.efficient]
      : [MODEL_IDS.technical, MODEL_IDS.efficient, MODEL_IDS.generalist];
  } else if (isWriting) {
    taskType = "Writing and communication";
    priority = "Clarity, voice, and a fast alternative";
    modelIds = [MODEL_IDS.generalist, MODEL_IDS.deepReasoning, MODEL_IDS.efficient];
  } else if (isAnalysis) {
    taskType = "Analysis and strategy";
    priority = "Tradeoff reasoning and a diverse challenge";
    modelIds = [MODEL_IDS.deepReasoning, MODEL_IDS.generalist, MODEL_IDS.efficient];
  } else if (complexity === "low") {
    taskType = "Focused explanation";
    priority = "Clarity and response efficiency";
    modelIds = [MODEL_IDS.generalist, MODEL_IDS.efficient, MODEL_IDS.deepReasoning];
  }

  const availableIds = new Set(availableModels.map((model) => model.id));
  const uniqueAllowedIds = modelIds.filter(
    (modelId, index) => availableIds.has(modelId) && modelIds.indexOf(modelId) === index,
  );
  const taskPatterns = isTechnical
    ? [/codex|qwen|deepseek/i, /sol|opus|120b|reason|o3/i, /mini|nano|flash|luna|20b/i]
    : isWriting
      ? [/sonnet|llama|maverick|gpt-4o/i, /opus|sol|120b/i, /mini|nano|haiku|luna|20b/i]
      : [/sol|opus|120b|reason|o3/i, /llama|sonnet|qwen|glm/i, /mini|nano|flash|luna|20b/i];
  for (const pattern of taskPatterns) {
    const match = availableModels.find((model) => pattern.test(model.id) && !uniqueAllowedIds.includes(model.id));
    if (match) uniqueAllowedIds.push(match.id);
  }
  for (const model of availableModels) {
    if (uniqueAllowedIds.length >= 3) break;
    if (!uniqueAllowedIds.includes(model.id)) uniqueAllowedIds.push(model.id);
  }
  const selectedIds = uniqueAllowedIds.slice(0, 3);

  return {
    taskType,
    complexity,
    priority,
    summary: `A ${complexity}-complexity ${taskType.toLowerCase()} prompt; this council balances ${priority.toLowerCase()} with a complementary challenger.`,
    selections: selectedIds.map((modelId, index) => ({
      modelId,
      role: ROLES[index],
      reason: MODEL_REASONS[modelId] ?? `${availableModels.find((model) => model.id === modelId)?.strength ?? "General-purpose capability"} adds a distinct perspective to this council.`,
    })),
    mode,
    method: "rules",
    ...(notice ? { notice } : {}),
  };
}

export function normalizeAiRecommendation(
  candidate: unknown,
  mode: RunMode,
  allowedIds: Set<string>,
): AutoPickRecommendation | null {
  if (!candidate || typeof candidate !== "object") return null;
  const value = candidate as Record<string, unknown>;
  const selections = Array.isArray(value.selections) ? value.selections : [];
  const complexity = value.complexity;
  const validComplexity = complexity === "low" || complexity === "medium" || complexity === "high";

  const normalizedSelections = selections.map((selection, index) => {
    if (!selection || typeof selection !== "object") return null;
    const item = selection as Record<string, unknown>;
    const modelId = typeof item.modelId === "string" ? item.modelId : "";
    const reason = typeof item.reason === "string" ? item.reason.trim().slice(0, 220) : "";
    if (!allowedIds.has(modelId) || !reason || index > 2) return null;
    return { modelId, role: ROLES[index], reason };
  });

  if (
    !validComplexity
    || normalizedSelections.length !== 3
    || normalizedSelections.some((selection) => !selection)
    || new Set(normalizedSelections.map((selection) => selection?.modelId)).size !== 3
  ) return null;

  const taskType = typeof value.taskType === "string" ? value.taskType.trim().slice(0, 80) : "";
  const priority = typeof value.priority === "string" ? value.priority.trim().slice(0, 100) : "";
  const summary = typeof value.summary === "string" ? value.summary.trim().slice(0, 260) : "";
  if (!taskType || !priority || !summary) return null;

  return {
    taskType,
    complexity,
    priority,
    summary,
    selections: normalizedSelections as AutoPickRecommendation["selections"],
    mode,
    method: "ai",
  };
}
