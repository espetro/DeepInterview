---
id: ai-fde-system-design-generic
company: generic
role: ai-engineer
level: senior
competency:
  - llm-application-design
  - problem-solving
  - system-design
  - consulting
version: 1
source_runs: 0
confidence: 0.6
last_verified: 2026-09-03
status: draft
---

# Generic — AI FDE System Design (Forward Deployed, senior)

> Company-agnostic pack for applied GenAI system-design rounds with a consulting
> twist: design for a named enterprise customer, not a generic backend. Hand-curated
> from public FDE intel, not distilled from runs (`source_runs: 0`).

## Round structure
1. Candidate picks 1 of 2-3 GenAI scenarios (e.g. agents & workflow automation, RAG over private data, GenMedia pipeline) (45m total)
2. **Discovery + stakeholder alignment (~15m)** — interviewer plays the customer/stakeholder and probes; explicitly scored on the Consulting axis. The interviewer may inject a mid-flight constraint change ("legal now says EU-only data residency"). Hard checkpoint at minute 15: say out loud that you're switching from questions to architecture.
3. **Deep-dive design on a whiteboard (~30m)** — architecture, evals, cost/latency, failure handling.
4. Asking for time or scenario details is explicitly OK. No GenAI tools during the round.

## Question bank
- "Design a RAG system over a customer's private data. What would you ask before designing anything?"
- "Automate an enterprise workflow with agents. Where do you put deterministic code vs. the model?"
- "Integrate a foundation model into an existing production pipeline. What breaks first?"
- "How do you know it works? Build an eval suite that covers accuracy and cost, before launch and every day after."
- "Walk me through an agentic system you built. Why X over Y in your own RAG project?" (resume-anchored probe)
- "Wrong answers on customer contracts, demo on-site tomorrow — how do you debug?"
- "The CISO says no data may leave the network. What changes in your design?"
- Discovery cluster: "Who owns the workflow today? What does an error cost them? What's the escalation path when the model is wrong? What does 'good enough to launch' mean to this customer?"
- Customer-communication cluster: "Tell me about pushing back on a customer request. Explaining a model's limits to a non-technical stakeholder. Deploying under security restrictions. Turning customer feedback into core product changes."

## Signals
- **State the dominant constraint before the model choice** — names compliance/latency/cost first, model second.
- **One-sentence architecture before detail** — sketches the obvious architecture, says it in one sentence, then moves on; depth spent where it matters (evals, failure modes), not chunking minutiae.
- **Leads with evals** — "how do you know it's right before launch and every day after"; proposes trajectory vs. outcome evals, knows LLM-judge bias.
- **Bounds the blast radius** — of a confidently-wrong model: HITL gates, scoped tool permissions, staged rollout, deterministic fallbacks.
- **Cost per request + p99 latency** — gives $/request and p99 under load in production terms without being asked twice.
- Consulting signals: clarifies before designing, checks alignment with the stakeholder mid-round, manages scope changes (e.g. EU-only data residency) without redesigning from scratch, and delivers in the customer's stack framing rather than generic architecture.

## Pitfalls
- Jumping straight to model choice ("I'd use Gemini/GPT") before naming the constraint.
- Ignoring the customer's actual workflow — designing for the demo, not the operator who escalates errors.
- No eval plan, or evals bolted on after the architecture.
- Hand-waving cost and latency ("it's just an API call") with no $/request or p99 estimate.
- Diagram-less design: talks in abstractions, never draws boxes and arrows.
