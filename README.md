# Volt & Co. — Agent-Readable Commerce (AI Buyer)

**Razorpay Buildathon · Track 01 — AI Growth & Agentic Commerce**

> *"Make a merchant transactable by an AI buyer, end to end."*

This is a working demo where an **AI buyer agent** walks into a merchant storefront
(**Volt & Co.**), reads an **agent-readable catalog**, picks items, and completes a
**gated, bounded, fully-audited payment** through Razorpay — with one payment
failure handled gracefully.

---

## The pitch (2 minutes)

Most commerce is built for human eyes. When an AI agent shows up to buy, it can't
parse a marketing page, and nobody wants an agent that can silently charge money.

**Volt & Co.** solves both halves:

1. **Sellable to AI buyers** — the merchant exposes its catalog as a first-class,
   agent-readable surface: structured JSON for tool-calling agents, `llms.txt` +
   `agent.json` for discovery, and Schema.org JSON-LD product pages for crawlers.
2. **Buyable safely** — the AI buyer can search, reason, and build a cart, but it
   can **never charge money directly**. A **money guard** bounds every order
   (₹25,000 cap, qty caps, price/stock snapshot checks), a **human gate** must
   approve each charge, and an **append-only audit trail** records every money
   action with the agent's reasoning — so a reviewer can replay *why* a charge
   happened.

The demo also shows **graceful failure**: the first payment attempt fails
(gateway timeout), and the agent recovers with a fallback payment method — all
honestly surfaced in the audit trail.

**The bar (from the brief):** *Every money action explainable, bounded and
gated. Show the audit trail and one failure handled gracefully.* → built in.

---

## Features

| Area | What it does |
|------|--------------|
| Agent-readable catalog | `GET /api/catalog/agent` (structured), `llms.txt`, `agent.json` manifest, JSON-LD product pages |
| AI buyer agent | Tool-calling LLM planner (OpenAI-compatible) **or** local **ML semantic model** (subword-embedding retrieval — zero API keys, offline, handles typos/inflections) |
| Money guards | Order total cap (₹25,000), per-line qty cap (5), line-item cap, positive amounts, price/stock snapshot re-validation at payment time |
| Human gate | The agent can only *propose*; every charge needs human **Approve / Deny**, with a **deny → agent adjusts → re-propose** loop |
| Audit trail | Append-only JSONL per session (`data/audit/`), downloadable; each entry carries reasoning + guard checks + amounts |
| Payments | **Mock provider** (offline demo, seeded to fail once for the recovery demo) or **real Razorpay test-mode API** (Orders + Payment Links) |
| Receipt | Post-purchase receipt "emailed" via a mock provider — audited (`RECEIPT_EMAILED`) and rendered in the UI; a real SMTP adapter drops in behind the same interface |
| Demo UI | Live storefront + agent console (SSE stream) + gated checkout + audit panel |
| Resilient | One failed payment → automatic retry with fallback method, surfaced honestly |

---

## Quick start

```bash
npm install
npm start          # → http://localhost:4173
```

Works out of the box with **no API keys** (local ML semantic buyer + mock payments + mock receipts).

### Turn on the LLM buyer (recommended for the pitch)

```bash
cp .env.example .env
# set in .env:
LLM_API_KEY=sk-...          # any OpenAI-compatible key
LLM_BASE_URL=https://api.openai.com/v1   # OpenRouter/Groq/etc. also work
LLM_MODEL=gpt-4o-mini
```

### Turn on real Razorpay test mode

```bash
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
```

(Without these, the built-in mock provider runs the exact same flow offline.)

### Guardrails (env-tunable)

```bash
MAX_ORDER_AMOUNT_INR=25000   # order total cap
MAX_QTY_PER_LINE=5           # per-line quantity cap
MAX_LINE_ITEMS=10            # max line items
```

---

## Deploy (Render — free)

This is a **persistent Node/Express server** (SSE streaming + in-memory sessions),
so it needs a long-running host — not static hosting. `render.yaml` at the repo
root makes this one-click:

1. Push this repo to GitHub.
2. Render → **New → Blueprint** → connect the repo. Done.

Or create a **Web Service** manually with:
- Build command: `npm install && npm run build`
- Start command: `node dist/index.js`
- Instance: **Free** · Node 22

It deploys running the **built-in mock payments + local semantic AI buyer** with
zero keys. To go live with the LLM agent or real Razorpay test mode, add the env
vars above (LLM_* / RAZORPAY_*) in the Render dashboard.

---

## 5-minute demo script (for the pitch video)

1. **Show the storefront** and click a mission chip, e.g. *"Buy me a good
   mechanical keyboard under ₹5,000"* → **Run AI buyer**.
2. **Agent console** streams the agent's reasoning + tool calls (search →
   policies → add to cart).
3. The agent calls `propose_order` and **stops** — an order card appears:
   **Approve charge / Deny**. Point out the guard checks listed on the card.
4. **Approve.** Watch the first payment fail (gateway timeout) and the agent
   **recover** with a fallback method → paid.
5. Open the **audit trail**: every entry shows who did what, the amount, the
   reasoning, and the guard checks. Download the JSONL to show it's exportable.
6. (Optional) **Deny** an order and show the agent adjusting and re-proposing.

---

## Architecture

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for diagrams and design
decisions. Short version:

```
                    ┌─────────────────────────────┐
                    │  Agent-readable catalog     │
   AI buyer ──────► │  /api/catalog/agent         │
                    │  llms.txt · agent.json      │
                    │  JSON-LD product pages      │
                    └─────────────┬───────────────┘
                                  │ search / pick / add
                                  ▼
                    ┌─────────────────────────────┐
                    │  BuyerSession (state machine)│
                    │  propose_order  ──► GUARDS ──► human approve ──► pay
                    └─────────────┬───────────────┘
                                  │ every step
                                  ▼
                    ┌─────────────────────────────┐
                    │  AuditTrail (append-only)   │
                    │  + PaymentProvider (mock|RZP)│
                    └─────────────────────────────┘
```

---

## API surface (agent-facing)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/catalog/agent` | Structured, agent-readable catalog |
| GET | `/api/catalog/llms.txt` | `llms.txt` for AI discovery |
| GET | `/agent.json` | Capability + policy manifest |
| GET | `/api/catalog/products/:id` | Schema.org JSON-LD product page |
| POST | `/api/sessions` | Create a buyer session |
| POST | `/api/sessions/:id/run` | Run the AI buyer with a mission |
| POST | `/api/sessions/:id/approve` | Human approval (gates the charge) |
| POST | `/api/sessions/:id/deny` | Deny (agent adjusts & re-proposes) |
| GET | `/api/sessions/:id/audit` | Full audit trail (JSON) |
| GET | `/api/sessions/:id/audit/download` | Audit trail as JSONL |
| GET | `/api/sessions/:id/events` | SSE live event stream |

---

## Project structure

```
src/
├── catalog/        agent-readable catalog (products, service, serializers)
├── ml/             local subword-embedding retriever (offline semantic search)
├── agent/          LLM + local-ML planners, tools, session state machine
├── guards/         money guards (bounded / gated / re-validated)
├── audit/          append-only audit trail (JSONL)
├── payments/       mock + Razorpay test-mode providers
├── notify/         mock receipt/notification provider
├── server/         Express app, SSE, session manager, public/ (UI)
└── index.ts        entry point
```

---

## Honest limitations

- **Offline planner** (no LLM key) uses a **local subword-embedding model** trained
  on the catalog — real vector semantics (typos, inflections, compound terms)
  with zero network or keys, and it's the automatic fallback when the cloud LLM
  is down or rate-limited. The **LLM planner** is the real agent; set
  `LLM_API_KEY` for it.
- **Mock payments** simulate latency + failure; real Razorpay test mode creates
  real Orders/Payment Links (payment completion would come via webhooks in
  production).
- Stock is static in this demo — the guard *would* block an order whose item
  went out of stock between proposal and payment (the TOCTOU check is built and
  tested).
- Sessions are in-memory (fine for a demo); the audit trail persists to disk.

---

*Built for the Razorpay Buildathon — Track 01: AI Growth & Agentic Commerce.*
