# Gateway evaluations

Model Council evaluates the gateway separately from the models it selects. This prevents a strong model answer from hiding a poor routing decision, and prevents a routing heuristic from being presented as an objective answer-quality score.

## Evaluation layers

1. **Routing contract:** Every recommendation must return three unique verified IDs with the roles Best fit, Complement, and Challenger.
2. **Routing fitness:** The council should cover the expected task, complexity, capabilities, and at least two model providers. Several different councils can pass; the suite does not require one exact trio.
3. **Operations:** Measure routing p50/p95 latency, inference success count, council wall-clock latency, tokens, estimated cost when rates are available, and fallback usage.
4. **Outcome quality:** Compare Auto-pick with the fixed default council using blinded human A/B review. This evidence stays advisory and is never shown as an objective user-facing score.

The optional AI selector has a two-second production latency budget. If it exceeds that budget or violates the routing constraints, the gateway returns the transparent deterministic council so Auto-pick remains usable within the three-second p95 guardrail after edge and runtime overhead.

## Dataset

[`evals/gateway-cases.json`](../evals/gateway-cases.json) contains 30 versioned cases across technical work, writing, analysis, explanation, general requests, and adversarial prompt injection. Each case specifies an expected task group, complexity, and capability coverage rather than a single correct set of models.

The checked-in thresholds require:

- 100% valid contracts, verified IDs, unique councils, and role coverage.
- At least 80% task and complexity accuracy.
- At least 85% expected-capability Hit@3.
- At least 95% provider diversity.
- Routing p95 at or below three seconds.

Thresholds are initial product guardrails, not universal benchmarks. Change them only with a versioned dataset update and an explanation in the pull request.

## Run the routing suite

The default command uses the built fixture worker and does not make billable requests:

```bash
npm run eval:gateway
```

It generates `gateway-scorecard-fixture.json` and `gateway-scorecard-fixture.md` under `evals/results/`. Set `EVAL_RUN_LABEL` to preserve named before/after runs.

To measure the deployed AI selector, explicitly acknowledge live inference and provide the deployment URL:

```bash
CONFIRM_BILLABLE_EVAL=true \
MODEL_COUNCIL_URL=https://your-app.example \
EVAL_RUN_LABEL=live-candidate \
npm run eval:gateway:live
```

Live routing defaults to four concurrent requests. Override `EVAL_CONCURRENCY` only when the account's rate and spend limits are understood.

## Run the blinded outcome sample

The outcome sampler uses the six dataset cases marked `outcomeSample`. It invokes both Auto-pick and the fixed baseline council, synthesizes each successful council, and randomizes which result is candidate A or B.

```bash
CONFIRM_BILLABLE_EVAL=true \
MODEL_COUNCIL_URL=https://your-app.example \
npm run eval:gateway:outcomes
```

Review `evals/results/gateway-outcome-review.json` without reading `routingDetails`. Set each `winner` to `A`, `B`, or `tie`, add optional notes, then aggregate the unblinded result:

```bash
npm run eval:gateway:aggregate
```

Always report the review sample size and protocol. Do not treat a small human or LLM-judge preference sample as ground truth.

## Automated failure coverage

The test suite verifies allowlist and schema constraints, adversarial prompts, missing-selector fallback, empty and oversized prompts, independent partial model failure, synthesis from successful seats only, and refusal to synthesize a one-seat council.

DigitalOcean Evaluations can extend this harness with reusable datasets, custom metrics, model or Inference Router candidates, LLM-as-a-judge runs, latency/token comparisons, and downloadable results. DigitalOcean recommends manual review before production decisions:

- [Evaluate models and routers](https://docs.digitalocean.com/products/inference/how-to/evaluate-models/)
- [Evaluation best practices](https://docs.digitalocean.com/products/inference/concepts/model-evaluations-best-practices/)
- [Inference Router](https://docs.digitalocean.com/products/inference/how-to/use-inference-router/)
