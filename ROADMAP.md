# Model Council Roadmap

## How I am thinking about the roadmap

The first version of Model Council answers one question: “For this prompt, which model should I trust?” It lets the user compare real answers and keeps the final decision with them.

If the product gets traction, I would grow it into a model decision system. The goal is not to add more model cards. The goal is to help a customer move from trying models to making a repeatable decision, using that decision in production, and checking that it is still the right decision later.

I would build this in the following order:

```text
Compare one prompt
    → collect human evidence
    → test a complete workload
    → deploy the winning policy
    → monitor it
    → test new challengers
```

I am not ranking features by how impressive they sound. I am using four questions:

1. Does it reduce model choice uncertainty for the customer?
2. Does it create evidence that later features can use?
3. Can we explain and reverse the decision?
4. Does an earlier feature need to exist before this one can work well?

This is why Model Autopilot is last. Automatic switching sounds valuable, but I would not let a system change production model choices until we have customer goals, test data, health checks, and a safe way to roll back.

## Stack-ranked summary

| Rank | Feature | Stage | Customer impact | Engineering effort |
| ---: | --- | --- | --- | --- |
| 1 | Saved comparisons and decision history | Build evidence | High | Medium |
| 2 | Blind review and structured human feedback | Build evidence | High | Medium |
| 3 | Custom success rules | Build evidence | High | Medium |
| 4 | Reusable prompt sets | Build evidence | High | Medium |
| 5 | DigitalOcean Evaluations integration | Test workloads | High | Large |
| 6 | Quality, cost, and speed decision view | Test workloads | High | Medium |
| 7 | Scheduled model health checks | Keep results trustworthy | High | Medium |
| 8 | Team reports and shared decisions | Make decisions reusable | Medium | Medium |
| 9 | Workload profiles and evidence-based Auto-pick | Improve recommendations | High | Large |
| 10 | One-click Inference Router setup | Move to production | High | Large |
| 11 | Production limits and fallback rules | Move to production safely | High | Large |
| 12 | Champion–challenger testing | Improve production choices | Medium | Large |
| 13 | Drift alerts and automatic testing of new models | Keep choices current | High | Large |
| 14 | Workload-based Model Autopilot | Long-term outcome | High | Very large |

The impact and effort labels are directional. I would update them after customer interviews and a short engineering design for each stage.

## Stage 1: Build trustworthy customer evidence

### 1. Saved comparisons and decision history

**What I would build**

Save the prompt, selected models, original answers, combined answer, response time, token use, estimated cost, Auto-pick reasons, and the user’s final choice. A user should be able to reopen a comparison and run it again against newer models.

**Why this is first**

This is the base for almost everything else in the roadmap. Without saved results, every session starts from zero. The customer has to pay to repeat the same work, and we have no record of why a model was selected.

Saved comparisons also give us the first useful signal for improving Auto-pick: what the system suggested, what the customer changed, and which answer they finally chose.

**What I would measure**

- How often users reopen or rerun a comparison.
- How often a saved result leads to a model decision.
- Time saved compared with repeating the test manually.

### 2. Blind review and structured human feedback

**What I would build**

Add a review mode that hides model names and changes the answer order. After reading the results, the user picks a winner and can give a simple reason such as “most accurate,” “clearest,” “best format,” “fast enough,” or “too expensive.” Model names are shown after the choice.

**Why it is ranked second**

Model FOMO is partly caused by brand and model-size bias. A user may choose a familiar provider before reading the answer. Blind review gives us a better human signal and makes the comparison more credible.

I would add this after saved comparisons because a vote is much more useful when it is stored with the prompt, answers, and model settings that produced it.

**What I would measure**

- How often the blind winner differs from the user’s original model choice.
- How often users provide a reason with their vote.
- Whether confidence improves after names are revealed.

### 3. Custom success rules

**What I would build**

Let the user define what a good answer means before starting a comparison. Examples include correctness, required JSON format, clear writing, company policy, safety, maximum response time, or maximum cost.

I would keep each rule focused and easy to test. A customer support team should be able to say, “The answer must follow our refund policy and must not promise an unsupported refund.” A data team should be able to say, “The answer must return valid JSON with these fields.”

**Why it is ranked third**

There is no universal best model. A model is only right when it is right for the customer’s job. Custom success rules turn “I like this answer” into a repeatable decision.

This should come before large evaluations because the evaluation needs to know what to measure.

**What I would measure**

- How many comparisons use a saved success rule.
- Pass rate by rule and model.
- How often the selected winner changes after a rule is added.

### 4. Reusable prompt sets

**What I would build**

Let users save a group of prompts for a workload such as customer support, coding, document extraction, marketing, or internal search. Include expected answers or required fields when the team has them. Version the set so later test results can be compared fairly.

**Why it is ranked fourth**

One prompt is useful for exploration but weak evidence for a production choice. A model may do well on a simple example and fail on edge cases. A prompt set moves the decision from “best for this prompt” to “best for this job.”

It comes after custom success rules because a prompt set should carry the same clear definition of success across every row.

**What I would measure**

- Number of prompt sets created and reused.
- Number of prompts per real customer workload.
- How often the winner changes when moving from one prompt to a full set.

## Stage 2: Test a complete workload

### 5. DigitalOcean Evaluations integration

**What I would build**

Let a user send a Model Council prompt set and its success rules to DigitalOcean Evaluations. They could compare Serverless Inference models, dedicated models, or an Inference Router using the same dataset. Results would come back into Model Council with per-prompt scores, judge reasons, response time, tokens, and cost.

DigitalOcean Evaluations already supports datasets, reusable presets, built-in metrics, custom metrics, judge models, and router candidates. The product documentation also makes an important point: automated evaluation is advice, and people should review outputs before making a production decision. That fits the Model Council approach. See [DigitalOcean Evaluations](https://docs.digitalocean.com/products/inference/how-to/evaluate-models/).

**Why it is ranked fifth**

This is the point where Model Council becomes more than a comparison screen. It lets a customer test a real workload using a DigitalOcean-managed evaluation system.

I would not start here because an evaluation without a useful dataset or clear success rules can produce a precise-looking score that does not help the customer.

**What I would measure**

- Number of saved prompt sets promoted to an evaluation.
- Time from creating a prompt set to choosing a model.
- How often human review agrees with the evaluation result.

### 6. Quality, cost, and speed decision view

**What I would build**

Add a view that shows the useful tradeoffs instead of naming one overall winner. It would highlight:

- Best quality.
- Fastest model that meets the quality target.
- Lowest-cost model that meets the quality target.
- Best balance for the selected workload.

I would also show models that are dominated—for example, a model that is slower, more expensive, and lower quality than another candidate.

**Why it is ranked sixth**

The highest-scoring model is not always deployable. A support chatbot may need a two-second response. A background report may accept a slower model for better reasoning. This view turns evaluation results into a product decision.

It depends on the earlier success rules and workload results. Without those, “best balance” would be another unexplained score.

**What I would measure**

- How often users choose something other than the highest-quality model.
- Cost or response-time improvement at the same accepted quality level.
- Time taken to make a final decision after an evaluation finishes.

### 7. Scheduled model health checks

**What I would build**

Run small checks against the active model catalog on a schedule. Track whether each model is available, returns a valid answer, meets a basic response-time limit, and supports the request shape we use. Keep a last-known-good catalog when a provider has a short outage.

**Why it is ranked seventh**

The current project uses a dated model check. That is enough for a small project but not for a product that makes recommendations every day. A model name in the catalog does not prove that the customer’s account can call it right now.

Health data also becomes an input to Auto-pick and future routing. I would not recommend a model that has recently failed most checks, even if it won an older quality test.

**What I would measure**

- Failed recommendations caused by an unavailable model.
- Time to detect a model problem.
- Percentage of requests protected by the last-known-good list.

### 8. Team reports and shared decisions

**What I would build**

Create a shareable decision report with the prompt set version, models, settings, results, human votes, success rules, cost, speed, final recommendation, and approval notes. Teams could comment and record who approved the production choice.

**Why it is ranked eighth**

Model selection is rarely only an engineering choice. Product, finance, security, legal, and support teams may care about different parts of the result. A decision report gives them one clear record instead of screenshots and spreadsheets.

I rank it after the core evidence features because sharing a weak decision does not make it stronger. First make the result trustworthy, then make it easy to share.

**What I would measure**

- Number of reports shared with another person or team.
- Time from completed evaluation to approval.
- Number of production choices with a stored decision record.

## Stage 3: Turn evidence into a production policy

### 9. Workload profiles and evidence-based Auto-pick

**What I would build**

Let a customer define profiles such as:

- Customer support: clear, policy-safe, and under two seconds.
- Code review: strong reasoning; cost is less important.
- Data extraction: valid JSON, low cost, and high volume.
- Marketing: tone and variety matter most.

Auto-pick would use the profile’s test results, human votes, cost limits, and current model health. It would still explain the recommendation and let the user change it.

**Why it is ranked ninth**

The current Auto-pick uses prompt type, model strengths, and safety checks. That is a good starting point, but a customer-specific recommendation should be based on customer evidence.

This comes after saved decisions and evaluations because I do not want Auto-pick to “learn” from guesses. It should learn from reviewed results.

**What I would measure**

- How often users keep the recommended council without editing it.
- Human win rate of recommended models against the fixed default group.
- Recommendation performance by workload profile.

### 10. One-click Inference Router setup

**What I would build**

After an evaluation produces a winner, let the user create a DigitalOcean Inference Router draft from the decision. For example:

- Coding requests → coding winner.
- Writing requests → writing winner.
- Simple requests → fast, low-cost model.
- No clear match → ordered fallback models.

The user would review the task descriptions and models before anything is used in production. DigitalOcean Inference Router supports task-based model choices and fallback models, and it can be evaluated before use. See [DigitalOcean Inference Router](https://docs.digitalocean.com/products/inference/how-to/use-inference-router/).

**Why it is ranked tenth**

This closes the gap between experiment and production. Today, a customer can learn which model works and then has to rebuild the decision elsewhere. One-click setup makes the result useful without making the deployment automatic.

It comes after workload profiles because the router needs clear, non-overlapping task definitions and proven model choices.

**What I would measure**

- Number of winning evaluations converted into router drafts.
- Time from model decision to the first production request.
- Router accuracy on the saved prompt set before launch.

### 11. Production limits and fallback rules

**What I would build**

Let customers add limits to the production decision:

- Maximum cost per request.
- Maximum response time.
- Allowed or blocked providers.
- Required data or safety policy.
- Retry and fallback order.
- Stop conditions when quality or health drops.

**Why it is ranked eleventh**

A model can be the quality winner and still be the wrong production choice. Production decisions need operating limits and a clear fallback.

I rank this next to router setup but after the first routing path because the exact controls should be based on what customers learn while promoting real workloads.

**What I would measure**

- Requests that meet the customer’s cost and response-time target.
- Successful fallbacks during model failure.
- Policy violations caught before a response is served.

## Stage 4: Keep the decision current

### 12. Champion–challenger testing

**What I would build**

Keep the current production model as the champion. Send a small, controlled sample of prompts to a challenger model in the background. Do not show the challenger response to the end user until it has enough evidence and an approved rollout.

**Why it is ranked twelfth**

Offline datasets never contain every real production case. Champion–challenger testing lets a customer learn from real workload traffic without replacing the model too early.

This requires stored decisions, privacy controls, production routing, and clear success rules. That is why it is not an early feature.

**What I would measure**

- Challenger win rate on reviewed production samples.
- Cost of shadow testing.
- Number of safe champion changes backed by enough evidence.

### 13. Drift alerts and automatic testing of new models

**What I would build**

Run saved prompt sets on a schedule and alert the customer when quality, response time, cost, output format, or safety changes. When DigitalOcean adds a new model, test it as a challenger against the customer’s workload without changing production traffic.

**Why it is ranked thirteenth**

This directly addresses model FOMO over time. The customer should not need to watch every model release or wonder whether the earlier choice is now stale. They should only be notified when the evidence shows a meaningful change.

This feature needs trusted baselines and alert thresholds. Without them, it would create noise and make model FOMO worse.

**What I would measure**

- Important model changes detected before they affect many users.
- New models tested automatically.
- Alerts that lead to a reviewed model or router update.
- False alert rate.

### 14. Workload-based Model Autopilot

**What I would build**

Autopilot would choose a model for each request using the workload profile, evaluation history, human choices, current model health, cost and response-time limits, and safety rules. Every decision would record which model was used and why. Customers would be able to lock a model, require approval, roll back, or turn Autopilot off.

**Why it is last**

This is the long-term outcome, not the starting point. Automatic model choice is only valuable when the system has good evidence and safe controls. Otherwise, we would replace model FOMO with a routing system the customer does not trust.

By this stage, the earlier roadmap items give Autopilot what it needs: customer goals, reviewed data, workload tests, health signals, production policies, fallbacks, and drift checks.

**What I would measure**

- Quality, cost, and response time compared with a fixed production model.
- Automatic decisions accepted without rollback.
- Time saved by teams managing model changes.
- Customer trust in the explanation for each decision.

## What I would build first

If I had to choose one next release, I would build ranks 1 through 4 as one connected workflow:

1. Save a comparison.
2. Review the answers without model names.
3. Record why one answer won.
4. Add the prompt to a reusable workload set with clear success rules.

That release would not look as advanced as Autopilot, but it would create the most important missing asset: trustworthy customer evidence. Once that exists, DigitalOcean Evaluations, better Auto-pick, and production routing can all build on something real.

## Product outcome

The roadmap is successful when customers spend less time asking, “Did I choose the wrong model?” and more time using a model choice they can explain, test, and change safely.
