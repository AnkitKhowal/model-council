# Model compatibility probe — August 25, 2026

The production Model Council deployment sent `Reply with exactly OK and nothing else.` through each of 55 text-model candidates, using four concurrent workers and the application's normal `/api/invoke` path. A model passed only when the route returned HTTP 200 with a non-empty output.

Probe timestamp: `2026-08-25T06:11:24.820Z`

## Passed (20)

- `qwen3.8-max`
- `deepseek-3.2`
- `deepseek-4-flash`
- `deepseek-v4-flash-0731`
- `deepseek-v4-pro`
- `deepseek-v4-pro-0813`
- `gemma-4-31B-it`
- `llama-4-maverick`
- `minimax-m2.5`
- `mistral-3-14B`
- `kimi-k3`
- `nemotron-3-nano-omni`
- `nvidia-nemotron-3-super-120b`
- `nemotron-3-ultra-550b`
- `nemotron-nano-12b-v2-vl`
- `openai-gpt-oss-120b`
- `openai-gpt-oss-20b`
- `mimo-v2.5-pro`
- `glm-5.1`
- `glm-5.2`

## Excluded (35)

- 31 returned HTTP 403: every probed commercial OpenAI and Anthropic model, plus `arcee-trinity-large-thinking`. These IDs were discoverable but not invokable by the current account tier.
- `qwen3.5-397b-a17b` returned HTTP 429 after previously timing out through the same deployment.
- `kimi-k2.5` and `kimi-k2.6` returned HTTP 400 for the application's request contract.
- `glm-5` returned HTTP 504 after approximately 30 seconds.

Embedding models and DigitalOcean router pseudo-IDs were excluded before billable probing because they are not comparable text-generation seats.

This is a dated last-known-good allowlist, not an uptime guarantee. Transient failures can still degrade independently during a comparison.
