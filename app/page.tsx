"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_MODEL_IDS, MODEL_CATALOG, PRICING_AS_OF, getModel, type ModelConfig } from "../lib/models";
import type { ApiError, AutoPickRecommendation, ModelDirectory, ModelResult, RunMode, Synthesis } from "../lib/types";

const examples = [
  {
    label: "Architecture",
    prompt: "Design a rate-limiting strategy for a multi-tenant SaaS API. Explain the algorithm, storage choice, failure behavior, and scaling tradeoffs.",
  },
  {
    label: "Explain simply",
    prompt: "Explain vector databases to a product manager in plain English. Include when a team should and should not use one.",
  },
];

type ResultState =
  | { status: "loading" }
  | { status: "success"; data: ModelResult }
  | { status: "error"; error: string };

type SynthesisState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: Synthesis }
  | { status: "error"; error: string };

type AutoPickState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: AutoPickRecommendation }
  | { status: "error"; error: string };

function formatLatency(milliseconds: number) {
  return milliseconds < 1_000 ? `${milliseconds} ms` : `${(milliseconds / 1_000).toFixed(1)} sec`;
}

function formatCost(cost: number | null) {
  if (cost === null) return "Rate unavailable";
  if (cost < 0.00001) return "<$0.00001";
  if (cost < 0.001) return `$${cost.toFixed(5)}`;
  return `$${cost.toFixed(3)}`;
}

function getErrorMessage(payload: unknown, fallback: string) {
  const error = payload as ApiError;
  return typeof error?.error === "string" ? error.error : fallback;
}

async function readApiPayload(response: Response, fallback: string) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return { error: response.ok ? fallback : `The service returned HTTP ${response.status}. Please try again.` } satisfies ApiError;
  }

  try {
    return await response.json() as unknown;
  } catch {
    return { error: fallback } satisfies ApiError;
  }
}

function ResponseText({ text }: { text: string }) {
  return (
    <div className="response-copy">
      {text.split("\n").filter((line) => line.trim()).map((line, index) => {
        const trimmed = line.trim();
        const isList = /^(?:\d+\.|•|-)/.test(trimmed);
        return <p className={isList ? "response-list-item" : undefined} key={`${trimmed}-${index}`}>{trimmed}</p>;
      })}
    </div>
  );
}

function SourcePills({ sources, models, onSource }: { sources: string[]; models: ModelConfig[]; onSource: (source: string) => void }) {
  return (
    <span className="source-pills" aria-label="Source models">
      {sources.map((source) => {
        const model = getModel(source, models);
        return (
          <button type="button" key={source} onClick={() => onSource(source)} title={`View ${model?.name ?? source} response`}>
            {model?.shortName ?? source}
          </button>
        );
      })}
    </span>
  );
}

export default function Home() {
  const [prompt, setPrompt] = useState(examples[0].prompt);
  const [selectedIds, setSelectedIds] = useState<string[]>(DEFAULT_MODEL_IDS);
  const [results, setResults] = useState<Record<string, ResultState>>({});
  const [synthesis, setSynthesis] = useState<SynthesisState>({ status: "idle" });
  const [preferred, setPreferred] = useState<string | null>(null);
  const [runPrompt, setRunPrompt] = useState("");
  const [runMode, setRunMode] = useState<RunMode | null>(null);
  const [hasRun, setHasRun] = useState(false);
  const [autoPick, setAutoPick] = useState<AutoPickState>({ status: "idle" });
  const [autoPickAdjusted, setAutoPickAdjusted] = useState(false);
  const [models, setModels] = useState<ModelConfig[]>(MODEL_CATALOG);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelQuery, setModelQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState("All providers");
  const [directorySource, setDirectorySource] = useState<ModelDirectory["source"]>("fixture");
  const [directoryNotice, setDirectoryNotice] = useState<string | null>(null);
  const resultsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/models")
      .then((response) => readApiPayload(response, "The model catalog could not be loaded."))
      .then((payload) => {
        if (!active) return;
        const directory = payload as ModelDirectory;
        if (!Array.isArray(directory.models) || directory.models.length < 3) throw new Error("The model catalog is unavailable.");
        setModels(directory.models);
        setDirectorySource(directory.source);
        setDirectoryNotice(directory.notice ?? null);
        setSelectedIds((current) => {
          const availableIds = new Set(directory.models.map((model) => model.id));
          const next = current.filter((modelId) => availableIds.has(modelId));
          for (const modelId of [...DEFAULT_MODEL_IDS, ...directory.models.map((model) => model.id)]) {
            if (next.length >= 3) break;
            if (availableIds.has(modelId) && !next.includes(modelId)) next.push(modelId);
          }
          return next;
        });
      })
      .catch(() => {
        if (active) setDirectoryNotice("Live discovery is unavailable; the built-in compatible catalog is shown.");
      })
      .finally(() => {
        if (active) setModelsLoading(false);
      });
    return () => { active = false; };
  }, []);

  const successfulResults = useMemo(
    () => selectedIds.map((id) => results[id]).filter((state): state is { status: "success"; data: ModelResult } => state?.status === "success").map((state) => state.data),
    [results, selectedIds],
  );
  const fastestId = successfulResults.length
    ? [...successfulResults].sort((a, b) => a.latencyMs - b.latencyMs)[0].modelId
    : null;
  const pricedResults = successfulResults.filter((result) => result.estimatedCost !== null);
  const cheapestId = pricedResults.length
    ? [...pricedResults].sort((a, b) => (a.estimatedCost ?? Infinity) - (b.estimatedCost ?? Infinity))[0].modelId
    : null;
  const comparisonRunning = selectedIds.some((id) => results[id]?.status === "loading");
  const controlsBusy = comparisonRunning || synthesis.status === "loading" || autoPick.status === "loading";
  const providers = useMemo(
    () => ["All providers", ...new Set(models.map((model) => model.provider.split(" · ")[0]))],
    [models],
  );
  const visibleModels = useMemo(() => {
    const normalizedQuery = modelQuery.trim().toLowerCase();
    return models.filter((model) => {
      const provider = model.provider.split(" · ")[0];
      return (providerFilter === "All providers" || provider === providerFilter)
        && (!normalizedQuery || `${model.name} ${model.id} ${model.provider} ${model.strength}`.toLowerCase().includes(normalizedQuery));
    });
  }, [modelQuery, models, providerFilter]);

  function updatePrompt(nextPrompt: string) {
    setPrompt(nextPrompt);
    setAutoPick({ status: "idle" });
    setAutoPickAdjusted(false);
  }

  function toggleModel(modelId: string) {
    if (controlsBusy) return;
    if (autoPick.status === "success") setAutoPickAdjusted(true);
    setSelectedIds((current) => {
      if (current.includes(modelId)) return current.length <= 2 ? current : current.filter((id) => id !== modelId);
      if (current.length >= 3) return current;
      return [...current, modelId];
    });
  }

  async function runAutoPick() {
    const currentPrompt = prompt.trim();
    if (!currentPrompt || controlsBusy) return;

    setAutoPick({ status: "loading" });
    setAutoPickAdjusted(false);
    try {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: currentPrompt }),
      });
      const payload = await readApiPayload(response, "The model selector returned an unreadable response.");
      if (!response.ok) throw new Error(getErrorMessage(payload, "Auto-pick could not analyze this prompt."));

      const recommendation = payload as AutoPickRecommendation;
      const recommendedIds = Array.isArray(recommendation.selections)
        ? recommendation.selections.map((selection) => selection.modelId)
        : [];
      const validIds = recommendedIds.filter((modelId) => Boolean(getModel(modelId, models)));
      if (validIds.length !== 3 || new Set(validIds).size !== 3) {
        throw new Error("Auto-pick did not return three valid models. Your manual selection is unchanged.");
      }

      setSelectedIds(validIds);
      setAutoPick({ status: "success", data: recommendation });
      setHasRun(false);
      setResults({});
      setSynthesis({ status: "idle" });
      setPreferred(null);
      setRunMode(null);
    } catch (error) {
      setAutoPick({
        status: "error",
        error: error instanceof Error ? error.message : "Auto-pick is unavailable. You can still choose models manually.",
      });
    }
  }

  function scrollToSource(modelId: string) {
    document.getElementById(`result-${modelId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function invokeModel(modelId: string, currentPrompt: string) {
    try {
      const response = await fetch("/api/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: currentPrompt, modelId }),
      });
      const payload = await readApiPayload(response, "This model returned an unreadable response. Please try again.");
      if (!response.ok) throw new Error(getErrorMessage(payload, "This model could not complete the request."));

      const data = payload as ModelResult;
      setRunMode(data.mode);
      setResults((current) => ({ ...current, [modelId]: { status: "success", data } }));
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "This model could not complete the request.";
      setResults((current) => ({ ...current, [modelId]: { status: "error", error: message } }));
      return null;
    }
  }

  async function synthesize(currentPrompt: string, completed: ModelResult[]) {
    setSynthesis({ status: "loading" });
    try {
      const response = await fetch("/api/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: currentPrompt, results: completed }),
      });
      const payload = await readApiPayload(response, "The synthesis service returned an unreadable response.");
      if (!response.ok) throw new Error(getErrorMessage(payload, "The comparison could not be synthesized."));

      const data = payload as Synthesis;
      setRunMode(data.mode);
      setSynthesis({ status: "success", data });
    } catch (error) {
      setSynthesis({
        status: "error",
        error: error instanceof Error ? error.message : "The original responses are still available below.",
      });
    }
  }

  async function runComparison() {
    const currentPrompt = prompt.trim();
    if (!currentPrompt || selectedIds.length < 2 || comparisonRunning || synthesis.status === "loading") return;

    const pending = Object.fromEntries(selectedIds.map((id) => [id, { status: "loading" } satisfies ResultState]));
    setRunPrompt(currentPrompt);
    setHasRun(true);
    setPreferred(null);
    setRunMode(null);
    setResults(pending);
    setSynthesis({ status: "idle" });

    window.setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    const completed = (await Promise.all(selectedIds.map((id) => invokeModel(id, currentPrompt))))
      .filter((result): result is ModelResult => Boolean(result));

    if (completed.length >= 2) await synthesize(currentPrompt, completed);
    else if (completed.length === 1) {
      setSynthesis({ status: "error", error: "At least two successful responses are needed for a combined view." });
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Model Council home">
          <span className="brand-mark">MC</span>
          <span>Model Council</span>
        </a>
        <div className="header-meta">
          {runMode && <span className={`mode-pill ${runMode}`}>{runMode === "live" ? "Live inference" : "Demo data"}</span>}
          <div className="powered-by">
            <span className="status-dot" />
            Powered by DigitalOcean Gradient™ AI
          </div>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow">ONE PROMPT · MULTIPLE PERSPECTIVES</div>
        <h1>Ask once. Decide <span>with confidence.</span></h1>
        <p>
          Compare leading AI models side by side, understand where they agree,
          and get one transparent answer without losing the evidence.
        </p>
      </section>

      <section className="workspace" aria-label="Model comparison workspace">
        <div className="composer-card">
          <div className="section-heading">
            <div>
              <span className="step-number">01</span>
              <h2>What do you want to ask?</h2>
            </div>
            <span className="character-count">{prompt.length.toLocaleString()} / 4,000</span>
          </div>

          <textarea
            aria-label="Prompt"
            maxLength={4000}
            value={prompt}
            onChange={(event) => updatePrompt(event.target.value)}
            placeholder="Enter a prompt to compare across models…"
          />

          <div className="example-row">
            <span>Try an example</span>
            {examples.map((example) => (
              <button key={example.label} type="button" onClick={() => updatePrompt(example.prompt)}>
                {example.label}
              </button>
            ))}
          </div>
        </div>

        <div className="models-card">
          <div className="section-heading">
            <div>
              <span className="step-number">02</span>
              <h2>Your model council</h2>
            </div>
            <span className="selection-count">{selectedIds.length} / 3 selected</span>
          </div>

          <button
            className="auto-pick-button"
            type="button"
            onClick={runAutoPick}
            disabled={!prompt.trim() || controlsBusy}
          >
            <span className="auto-pick-spark" aria-hidden="true">✦</span>
            <span className="auto-pick-copy">
              <strong>Auto-pick <small>Beta</small></strong>
              <span>{autoPick.status === "loading" ? "Analyzing task and complexity…" : "Let the gateway recommend a balanced council"}</span>
            </span>
            <span className="auto-pick-arrow" aria-hidden="true">{autoPick.status === "loading" ? "•••" : "→"}</span>
          </button>

          <div className="selected-council" aria-label="Selected council">
            {selectedIds.map((modelId, index) => {
              const model = getModel(modelId, models);
              return model ? <span key={modelId}><small>Seat {index + 1}</small>{model.name}</span> : null;
            })}
          </div>

          <div className="model-browser-tools">
            <label>
              <span className="sr-only">Search all models</span>
              <input
                type="search"
                value={modelQuery}
                onChange={(event) => setModelQuery(event.target.value)}
                placeholder="Search all models…"
              />
            </label>
            <label>
              <span className="sr-only">Filter by provider</span>
              <select value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)}>
                {providers.map((provider) => <option key={provider}>{provider}</option>)}
              </select>
            </label>
          </div>

          <div className="catalog-meta">
            <span>{modelsLoading ? "Loading DigitalOcean catalog…" : `${visibleModels.length} of ${models.length} compatible models`}</span>
            <span>{directorySource === "digitalocean" ? "Live catalog" : directorySource === "fixture" ? "Demo catalog" : "Fallback catalog"}</span>
          </div>

          <div className="model-grid model-browser-grid">
            {visibleModels.map((model) => {
              const selected = selectedIds.includes(model.id);
              const selectionBlocked = !selected && selectedIds.length >= 3;
              const modelIndex = models.findIndex((candidate) => candidate.id === model.id) + 1;
              return (
                <button
                  className={`model-option ${model.accent} ${selected ? "selected" : ""}`}
                  key={model.id}
                  type="button"
                  aria-pressed={selected}
                  aria-label={`${selected ? "Remove" : "Add"} ${model.name}`}
                  disabled={selectionBlocked || controlsBusy}
                  onClick={() => toggleModel(model.id)}
                >
                  <span className="checkmark">{selected ? "✓" : "+"}</span>
                  <span className="model-index">{String(modelIndex).padStart(2, "0")}</span>
                  <strong>{model.name}</strong>
                  <small>{model.provider.split(" · ")[0]} · {model.strength}</small>
                </button>
              );
            })}
            {!visibleModels.length && <p className="model-empty">No compatible models match this search.</p>}
          </div>

          {directoryNotice && <p className="catalog-notice">{directoryNotice}</p>}

          <button
            className="compare-button"
            type="button"
            onClick={runComparison}
            disabled={!prompt.trim() || selectedIds.length < 2 || controlsBusy}
          >
            <span>{comparisonRunning ? "Council is thinking…" : `Compare ${selectedIds.length} models`}</span>
            <span aria-hidden="true">{comparisonRunning ? "•••" : "→"}</span>
          </button>
          <p className="privacy-note">Your API key stays on the server. Prompts are not stored.</p>
        </div>
      </section>

      {autoPick.status === "success" && (
        <section className="auto-pick-panel" aria-live="polite" aria-label="Auto-pick recommendation">
          <div className="auto-pick-panel-heading">
            <div>
              <span className="gateway-label"><span aria-hidden="true">✦</span> Gateway recommendation</span>
              <h2>Why this council?</h2>
            </div>
            <div className="routing-tags">
              <span>{autoPick.data.complexity} complexity</span>
              <span>{autoPick.data.taskType}</span>
              {autoPickAdjusted && <span className="adjusted-tag">Adjusted by you</span>}
            </div>
          </div>
          <p className="auto-pick-summary">{autoPick.data.summary}</p>
          <div className="auto-pick-list">
            {autoPick.data.selections.map((selection) => (
              <div className="auto-pick-selection" key={selection.modelId}>
                <span className="selection-role">{selection.role}</span>
                <strong>{getModel(selection.modelId, models)?.name ?? selection.modelId}</strong>
                <p>{selection.reason}</p>
              </div>
            ))}
          </div>
          <div className="auto-pick-footnote">
            <span>Recommendations are explainable, not quality scores. Swap any model before running.</span>
            <span>{autoPick.data.method === "ai" ? "AI-routed" : "Rule-routed"}</span>
          </div>
          {autoPick.data.notice && <p className="auto-pick-notice">{autoPick.data.notice}</p>}
        </section>
      )}

      {autoPick.status === "error" && (
        <section className="auto-pick-panel auto-pick-error" role="status">
          <div className="warning-mark">!</div>
          <div><strong>Auto-pick is unavailable</strong><p>{autoPick.error}</p><small>Your manual model controls still work.</small></div>
        </section>
      )}

      {!hasRun ? (
        <section className="results-preview" aria-label="Comparison results preview">
          <div className="results-icon" aria-hidden="true">03</div>
          <div>
            <h2>Your council is ready</h2>
            <p>Run the prompt to see independent answers and a traceable synthesis.</p>
          </div>
          <div className="result-lines" aria-hidden="true"><span /><span /><span /></div>
        </section>
      ) : (
        <section className="results-section" ref={resultsRef} aria-live="polite">
          <div className="results-header">
            <div>
              <span className="step-number">03 · INDEPENDENT RESPONSES</span>
              <h2>Compare the evidence</h2>
              <p className="run-prompt">“{runPrompt}”</p>
            </div>
            <button type="button" className="edit-prompt" onClick={() => document.getElementById("top")?.scrollIntoView({ behavior: "smooth" })}>Edit prompt ↑</button>
          </div>

          <div className="results-grid">
            {selectedIds.map((modelId) => {
              const model = getModel(modelId, models)!;
              const state = results[modelId];
              const isPreferred = preferred === modelId;
              return (
                <article className={`result-card ${model.accent} ${isPreferred ? "preferred" : ""}`} id={`result-${modelId}`} key={modelId}>
                  <div className="result-card-header">
                    <div className="model-avatar">{model.shortName.slice(0, 2).toUpperCase()}</div>
                    <div>
                      <h3>{model.name}</h3>
                      <p>{model.provider}</p>
                    </div>
                    <span className={`result-status ${state?.status ?? "loading"}`}>
                      {state?.status === "success" ? "Complete" : state?.status === "error" ? "Unavailable" : "Thinking"}
                    </span>
                  </div>

                  {(!state || state.status === "loading") && (
                    <div className="response-skeleton" aria-label={`${model.name} is generating a response`}>
                      <span /><span /><span /><span />
                    </div>
                  )}

                  {state?.status === "error" && (
                    <div className="model-error">
                      <strong>This seat could not respond</strong>
                      <p>{state.error}</p>
                    </div>
                  )}

                  {state?.status === "success" && (
                    <>
                      <ResponseText text={state.data.output} />
                      <div className="objective-metrics">
                        <div><span>Latency</span><strong>{formatLatency(state.data.latencyMs)}</strong></div>
                        <div><span>Tokens</span><strong>{state.data.usage.totalTokens.toLocaleString()}</strong></div>
                        <div><span>Est. cost</span><strong>{formatCost(state.data.estimatedCost)}</strong></div>
                      </div>
                      <div className="result-footer">
                        <div className="fact-badges">
                          {fastestId === modelId && <span>Fastest</span>}
                          {cheapestId === modelId && <span>Lowest cost</span>}
                        </div>
                        <button className="choose-button" type="button" aria-pressed={isPreferred} onClick={() => setPreferred(isPreferred ? null : modelId)}>
                          {isPreferred ? "Selected ✓" : "Choose answer"}
                        </button>
                      </div>
                    </>
                  )}
                </article>
              );
            })}
          </div>

          <p className="pricing-caption">Costs are estimates using configured published rates as of {PRICING_AS_OF}. “Rate unavailable” appears when the discovery API does not provide pricing.</p>

          {(synthesis.status === "loading" || synthesis.status === "success" || synthesis.status === "error") && (
            <div className="synthesis-wrap">
              <div className="synthesis-heading">
                <div>
                  <span className="step-number">04 · COMBINED VIEW</span>
                  <h2>One answer, with receipts</h2>
                </div>
                <span className="transparency-pill">
                  {synthesis.status === "success" && synthesis.data.engine === "digitalocean-model-synthesis"
                    ? "DigitalOcean Model Synthesis"
                    : "Transparent synthesis"}
                </span>
              </div>

              {synthesis.status === "loading" && (
                <div className="synthesis-loading">
                  <div className="synthesis-orbit"><span /><span /><span /></div>
                  <div><strong>Finding the common ground</strong><p>Comparing claims, tradeoffs, and meaningful disagreement…</p></div>
                </div>
              )}

              {synthesis.status === "error" && (
                <div className="synthesis-error">
                  <div className="warning-mark">!</div>
                  <div><strong>Combined view unavailable</strong><p>{synthesis.error}</p><small>Your original model responses remain intact above.</small></div>
                </div>
              )}

              {synthesis.status === "success" && (
                <div className="synthesis-card">
                  <div className="recommendation-banner">
                    <span>RECOMMENDATION</span>
                    <strong>{synthesis.data.recommendation.label}</strong>
                    <p>{synthesis.data.recommendation.rationale}</p>
                  </div>

                  <div className="combined-answer">
                    <h3>Combined answer</h3>
                    {synthesis.data.answer.map((section, index) => (
                      <div className="provenance-section" key={`${section.text}-${index}`}>
                        <p>{section.text}</p>
                        <SourcePills sources={section.sources} models={models} onSource={scrollToSource} />
                      </div>
                    ))}
                  </div>

                  <div className="analysis-grid">
                    <div className="analysis-panel agreement-panel">
                      <div className="analysis-title"><span>✓</span><h3>Where they agree</h3></div>
                      {synthesis.data.agreements.map((agreement, index) => (
                        <div className="analysis-item" key={`${agreement.text}-${index}`}>
                          <p>{agreement.text}</p>
                          <SourcePills sources={agreement.sources} models={models} onSource={scrollToSource} />
                        </div>
                      ))}
                    </div>

                    <div className="analysis-panel disagreement-panel">
                      <div className="analysis-title"><span>≠</span><h3>Where they differ</h3></div>
                      {synthesis.data.disagreements.length ? synthesis.data.disagreements.map((disagreement, index) => (
                        <div className="disagreement-item" key={`${disagreement.topic}-${index}`}>
                          <strong>{disagreement.topic}</strong>
                          {disagreement.positions.map((position) => (
                            <p key={`${position.modelId}-${position.text}`}>
                              <button type="button" onClick={() => scrollToSource(position.modelId)}>{getModel(position.modelId, models)?.shortName ?? position.modelId}</button>
                              {position.text}
                            </p>
                          ))}
                        </div>
                      )) : <p className="no-disagreement">No material disagreements were identified.</p>}
                    </div>
                  </div>

                  <button className={`choose-combined ${preferred === "combined" ? "selected" : ""}`} type="button" onClick={() => setPreferred(preferred === "combined" ? null : "combined")}>
                    <span>{preferred === "combined" ? "Combined answer selected" : "Choose combined answer"}</span>
                    <span aria-hidden="true">{preferred === "combined" ? "✓" : "→"}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {preferred && (
            <div className="decision-toast" role="status">
              <span className="decision-check">✓</span>
              <div><strong>Decision captured</strong><p>You preferred {preferred === "combined" ? "the transparent combined answer" : getModel(preferred, models)?.name}.</p></div>
              <button type="button" onClick={() => setPreferred(null)} aria-label="Clear selection">×</button>
            </div>
          )}
        </section>
      )}

      <footer>
        <span>Model Council</span>
        <p>Built with DigitalOcean Serverless Inference · No prompts are persisted</p>
      </footer>
    </main>
  );
}
