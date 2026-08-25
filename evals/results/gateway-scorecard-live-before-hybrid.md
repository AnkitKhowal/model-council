# Gateway evaluation scorecard — live before hybrid routing

Generated: 2026-08-25T07:22:26.052Z

Dataset: v1.0.0 · 30 cases  
Target: https://model-council-wp6iu.ondigitalocean.app  
Overall: **FAIL**

| Gate | Actual | Threshold | Result |
| --- | ---: | ---: | --- |
| contractValidityRate | 100% | ≥ 100% | Pass |
| allowlistComplianceRate | 100% | ≥ 100% | Pass |
| uniqueCouncilRate | 100% | ≥ 100% | Pass |
| roleCoverageRate | 100% | ≥ 100% | Pass |
| taskAccuracy | 73.3% | ≥ 80% | Fail |
| complexityAccuracy | 43.3% | ≥ 80% | Fail |
| expectedCapabilityHitAt3Rate | 90% | ≥ 85% | Pass |
| providerDiversityRate | 100% | ≥ 95% | Pass |
| routingP95LatencyMs | 3662 ms | ≤ 3000 ms | Fail |

Routing methods: ai=28, rules=2.

## Case-level findings

- Task or complexity mismatches appeared in 20 of 30 cases, especially incident response, concise writing, general planning, and adversarial prompts.
- Three councils missed the expected reasoning capability.
- Safety gates remained strong: every response used three unique, verified IDs with complete council roles and at least two providers.

This baseline is preserved rather than rewritten so the hybrid selector can be compared against the identical dataset and thresholds.
