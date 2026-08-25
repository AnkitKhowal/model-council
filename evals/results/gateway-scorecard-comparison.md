# Gateway scorecard — before and after hybrid routing

Both runs used dataset v1.0.0, the same 30 cases and thresholds, the same production deployment URL, and four concurrent routing requests.

| Measure | Before hybrid | After hybrid | Change |
| --- | ---: | ---: | ---: |
| Overall result | Fail | **Pass** | All gates pass |
| Contract validity | 100% | 100% | — |
| Verified-ID compliance | 100% | 100% | — |
| Unique council / role coverage | 100% / 100% | 100% / 100% | — |
| Task accuracy | 73.3% | **100%** | +26.7 pp |
| Complexity accuracy | 43.3% | **100%** | +56.7 pp |
| Expected-capability Hit@3 | 90% | **100%** | +10 pp |
| Provider diversity | 100% | 100% | — |
| Routing p50 | 2,744 ms | **2,192 ms** | −552 ms (−20.1%) |
| Routing p95 | 3,662 ms | **2,258 ms** | −1,404 ms (−38.3%) |
| Routing methods | AI 28 / rules 2 | AI 6 / rules 24 | More bounded fallbacks under load |

The hybrid design makes the deterministic task and complexity classifier authoritative, then accepts an AI-selected council only when it stays inside the verified catalog, preserves that classification, covers the required capabilities, spans providers, and finishes within the two-second selector budget. Otherwise it returns the transparent rules council.

The higher fallback count is intentional under this four-request concurrent test: it protects the three-second user-facing p95 SLO while keeping AI selection available when the DigitalOcean Serverless Inference selector responds in time. It is not evidence that the rules council has higher answer quality. Answer quality remains a separate blinded pairwise outcome evaluation.

- [Before-hybrid scorecard](gateway-scorecard-live-before-hybrid.md)
- [After-hybrid scorecard](gateway-scorecard-live-after-hybrid.md)
