# InterviewOS — Phase 0: Current State Report

> **Audit Date:** 2026-08-15
> **Auditor:** Principal Software Architect
> **Scope:** Full repository (`c:\Users\Lenovo\Desktop\mockinterview\mock`)

---

## 1. Repository Inventory

### File Manifest

| File | Size | Role |
|---|---|---|
| `server.ts` | 13,389 B (324 lines) | Express.js backend — 6 Gemini API endpoints |
| `src/App.tsx` | 41,367 B (883 lines) | **Entire frontend in one file** — 3-step state machine |
| `src/types.ts` | 923 B (46 lines) | TypeScript interfaces for all data shapes |
| `src/index.css` | 758 B (38 lines) | TailwindCSS v4 import + markdown body styles |
| `src/main.tsx` | 241 B (11 lines) | React entry point |
| `index.html` | 324 B (14 lines) | Vite HTML shell |
| `package.json` | 1,051 B | Dependencies and scripts |
| `vite.config.ts` | 730 B | Vite + Tailwind + React plugins |
| `tsconfig.json` | 534 B | TypeScript compiler options |
| `.env.example` | 454 B | `GEMINI_API_KEY`, `APP_URL` |
| `metadata.json` | 315 B | AI Studio metadata (microphone permission) |
| `README.md` | 4,231 B | Documentation |
| `bun.lock` | 94,952 B | Bun lockfile (project uses npm scripts) |
| `assets/.aistudio/` | — | Empty AI Studio asset directory |

### System Environment (Verified)

| Tool | Version | Status |
|---|---|---|
| Docker | 29.6.1 | ✅ Running |
| Docker Compose | v5.2.0 | ✅ Available |
| Python | 3.13.7 | ✅ |
| Node.js | 24.14.0 | ✅ |
| npm | 11.9.0 | ✅ |
| MySQL | 8.0.43 | ✅ Running (service `MySQL80`) |

---

## 2. Features Already Implemented (Working)

### Backend — 6 API Endpoints (`server.ts`)

| # | Endpoint | Method | Gemini Schema | Purpose | Lines |
|---|---|---|---|---|---|
| 1 | `/api/generate-questions` | POST | ✅ Structured JSON (Type.OBJECT) | Generates 3 Behavioral + 2 Technical questions from JD + Resume | L29–L78 |
| 2 | `/api/chat` | POST | ❌ Freeform text | Conversational turns with "Alex" persona, injects interview plan into system instruction | L80–L117 |
| 3 | `/api/evaluate` | POST | ❌ Freeform Markdown | Post-interview STAR evaluation of full transcript | L119–L152 |
| 4 | `/api/extract-claims` | POST | ✅ Structured JSON (Type.ARRAY) | Extracts atomic, testable claims from resume text | L154–L196 |
| 5 | `/api/analyze-job-fit` | POST | ✅ Structured JSON (Type.OBJECT) | Compares resume claims against JD requirements, produces skill gap analysis | L198–L249 |
| 6 | `/api/evaluate-answer` | POST | ✅ Structured JSON (Type.OBJECT) | Evaluates a single answer against a specific resume claim | L251–L302 |

**AI Model:** All endpoints use `gemini-2.5-flash`.

### Backend — AI Prompts (Salvageable Logic)

| Prompt | Quality | Reuse Status |
|---|---|---|
| Question generation system instruction (L43–L48) | Good — strict schema, clear constraints | ✅ **Port to Python** |
| Alex persona system instruction (L11–L21) | Good — STAR-focused, one-question-at-a-time rule | ⚠️ **Port but strip voice references** ("spoken-word friendly" language) |
| STAR evaluation instruction (L131–L142) | Good — produces actionable feedback | ✅ **Port to Python** |
| Resume claim extraction instruction (L166–L172) | Good — atomic claims with importance scoring | ✅ **Port to Python** |
| Job fit analysis instruction (L212–L218) | Good — Missing/Weak/Unverified/Strong classification | ✅ **Port to Python** |
| Answer evaluation instruction (L265–L271) | Good — claim credibility + next question strategy | ✅ **Port to Python, evolve into Shadow Compiler** |

### Backend — Gemini JSON Schemas (Salvageable)

| Schema | Location | Fields |
|---|---|---|
| InterviewPlan | L50–L68 | `interview_plan[]` → `{id, question, type, focus_area}` |
| ResumeClaims | L174–L186 | `[{claim_text, category, skill_tags[], importance}]` |
| JobFitAnalysis | L220–L239 | `{required_skills[], readiness_score_percentage, skill_gaps[]}` |
| AnswerEvaluation | L273–L292 | `{evaluation_scores{technical_correctness, ownership}, claim_credibility, evidence_rationale, next_question_strategy}` |

### Frontend — TypeScript Types (`src/types.ts`)

All 7 interfaces cleanly defined, mapping 1:1 to backend JSON schemas:
- `Message` — `{role: 'user'|'model', text: string}`
- `InterviewQuestion` — `{id, question, type: 'Behavioral'|'Technical', focus_area}`
- `InterviewPlan` — `{interview_plan: InterviewQuestion[]}`
- `ResumeClaim` — `{claim_text, category, skill_tags[], importance}`
- `SkillGap` — `{skill, gap_type: 'Missing'|'Weak'|'Unverified'|'Strong', explanation}`
- `JobFitAnalysis` — `{required_skills[], readiness_score_percentage, skill_gaps[]}`
- `AnswerEvaluation` — `{evaluation_scores, claim_credibility, evidence_rationale, next_question_strategy}`

### Frontend — 3-Step State Machine (`src/App.tsx`)

| Step | Name | UI | Lines |
|---|---|---|---|
| 1 | `setup` | JD + Resume textareas, Extract Claims, Analyze Job Fit, Generate Plan, Start Interview | L303–L583 |
| 2 | `interview` | Chat interface, header with Alex avatar, input bar with mic/send | L623–L881 |
| 3 | `feedback` | Post-interview STAR scorecard rendered via ReactMarkdown | L586–L621 |

### Frontend — Implemented UI Components (Inline in App.tsx)

| Component | Status | Description |
|---|---|---|
| Setup form (JD + Resume) | ✅ Working | Two-column textarea layout, "Load Dummy Data" prefill |
| Resume Claims display | ✅ Working | Card grid with claim text, category badge, skill tags, importance score |
| Job Fit Analysis panel | ✅ Working | Readiness score, required skills tags, skill gaps with color-coded status |
| Interview Plan display | ✅ Working | Question cards with Behavioral/Technical badges |
| Chat message bubbles | ✅ Working | Animated entry (Framer Motion), user/model differentiation |
| Typing indicator | ✅ Working | Bouncing dots animation |
| Adaptive Evaluator sidebar | ✅ Working | Claim selector, evaluate button, credibility badge, score bars, rationale, next strategy |
| STAR Scorecard | ✅ Working | ReactMarkdown rendering of evaluation feedback |

### Frontend — Dependencies (Working)

| Package | Version | Purpose |
|---|---|---|
| `react` / `react-dom` | ^19.0.1 | UI framework |
| `motion` (Framer Motion) | ^12.23.24 | Animation |
| `react-markdown` | ^10.1.0 | Markdown rendering for scorecard |
| `lucide-react` | ^0.546.0 | Icons |
| `tailwindcss` / `@tailwindcss/vite` | ^4.1.14 | Styling (entire CSS is Tailwind utilities) |

---

## 3. Features Partially Implemented or Broken

| Feature | Status | Detail |
|---|---|---|
| **Stripe Payment Gate** | 🔴 **Broken** | Hardcoded link `https://buy.stripe.com/plink_1U1YnV1dgaKpbfvEhgj0G2O0` (L14). Paywall bypassed trivially via `?paid=true` URL param (L13). No server-side verification. |
| **Free Trial System** | ⚠️ **Fragile** | Uses `localStorage('interview_trials')` client-side (L25–L28). Trivially resettable by clearing browser storage. |
| **Voice / STT** | ⚠️ **Violates constraint** | `SpeechRecognition` setup (L50–L70), `toggleDictation()` (L100–L108). Must be **removed entirely** per text-only WebSocket constraint. |
| **Voice / TTS** | ⚠️ **Violates constraint** | `speak()` (L82–L94), `stopAudio()` (L96–L98), voice enable/disable toggle (L646–L660). Must be **removed entirely**. |
| **Error Handling** | 🔴 **Primitive** | All errors use `alert()` (L124, L144, L165, L173, L272, L296). No toast system. |
| **Session Persistence** | 🔴 **None** | No database. No session ID. Refreshing the page during an interview loses all state. |

---

## 4. Existing Database Schemas and API Contracts

### Database

**There is no database.** The application has zero persistence beyond `localStorage` for a trial counter. No MySQL, no SQLite, no file-based storage.

### API Contracts (Request → Response)

#### `POST /api/generate-questions`
```
Request:  { jobDescription: string, resume: string }
Response: { interview_plan: [{ id: number, question: string, type: string, focus_area: string }] }
```

#### `POST /api/chat`
```
Request:  { history: [{role, text}], message: string, interviewPlan?: object }
Response: { text: string }
```

#### `POST /api/evaluate`
```
Request:  { transcript: string }
Response: { feedback: string }  // Raw Markdown
```

#### `POST /api/extract-claims`
```
Request:  { resume: string }
Response: [{ claim_text: string, category: string, skill_tags: string[], importance: number }]
```

#### `POST /api/analyze-job-fit`
```
Request:  { jobDescription: string, resumeClaims: ResumeClaim[] }
Response: { required_skills: string[], readiness_score_percentage: number, skill_gaps: SkillGap[] }
```

#### `POST /api/evaluate-answer`
```
Request:  { claim: string, question: string, answer: string }
Response: { evaluation_scores: {technical_correctness, ownership}, claim_credibility, evidence_rationale, next_question_strategy }
```

---

## 5. Architectural Risks

### 🔴 CRITICAL

| Risk | Location | Impact |
|---|---|---|
| **883-line monolith** | `App.tsx` | All state, all UI, all business logic in one function. Impossible to test, review, or extend. |
| **No database** | Entire project | Zero persistence. No interview history, no session recovery, no analytics. |
| **No WebSocket** | `server.ts` L80–L117 | Chat uses synchronous HTTP POST per message. No real-time protocol. Violates WebSocket constraint. |
| **Voice code embedded** | `App.tsx` L50–L108 | SpeechRecognition + SpeechSynthesis deeply wired into state. Violates text-only constraint. |
| **No event sourcing** | Entire project | Chat messages stored only in React `useState`. Lost on unmount. No event log, no replay. |

### 🟡 HIGH

| Risk | Location | Impact |
|---|---|---|
| **Duplicated API key check** | `server.ts` L35, L84, L123, L158, L202, L255 | `if (!process.env.GEMINI_API_KEY)` repeated 6 times. Should be middleware. |
| **Hardcoded Stripe URL** | `App.tsx` L14 | Dead payment link baked into source. |
| **Hardcoded port** | `server.ts` L25 | `const PORT = 3000` — no env var. |
| **No input validation** | All endpoints | `req.body` destructured directly with no schema validation. |
| **No CORS configuration** | `server.ts` | No CORS middleware. Only works because Vite dev server proxies same-origin. |
| **Package name** | `package.json` L2 | Named `"react-example"` — generic placeholder. |
| **HTML title** | `index.html` L6 | `"My Google AI Studio App"` — no SEO, no branding. |
| **Mismatched lockfile** | `bun.lock` exists | Package scripts use `tsx`/`npm` but lockfile is from Bun. |

### 🟢 LOW

| Risk | Location | Impact |
|---|---|---|
| **AI Studio metadata** | `metadata.json` | Requests microphone permission. Not relevant to target deployment. |
| **`@ts-ignore` usage** | `App.tsx` L51 | Suppresses SpeechRecognition type error. Will be deleted with voice code. |
| **Dummy data hardcoded** | `App.tsx` L315–L344 | "Alice Engineer" sample data embedded in JSX. Should be a fixture file. |

---

## 6. Salvage Assessment

### ✅ REUSE (Port to new stack)

| Asset | Target |
|---|---|
| 6 Gemini AI prompts + system instructions | → `backend/services/gemini.py` |
| 4 structured JSON schemas (question plan, claims, job fit, answer eval) | → `backend/schemas.py` (Pydantic models) |
| 7 TypeScript interfaces in `types.ts` | → `frontend/src/types/index.ts` |
| API contract shapes (request/response) | → FastAPI router signatures |
| Dummy data for testing ("Alice Engineer") | → Test fixtures |
| Chat bubble UI logic (role differentiation, animation patterns) | → `frontend/src/components/ChatBubble.tsx` |
| Resume claims card layout | → `frontend/src/components/ClaimsPanel.tsx` |
| Job fit analysis UI (readiness score, skill gap badges) | → `frontend/src/components/JobFitPanel.tsx` |
| Adaptive evaluator sidebar pattern | → `frontend/src/components/AdaptiveEvaluator.tsx` |
| STAR scorecard markdown rendering | → `frontend/src/components/Scorecard.tsx` |
| Markdown body CSS rules (`.markdown-body`) | → `frontend/src/app/globals.css` (converted from Tailwind to vanilla) |

### 🔴 REPLACE (Incompatible with target architecture)

| Asset | Reason |
|---|---|
| Express.js server (`server.ts`) | → FastAPI (Python) |
| Vite SPA architecture | → Next.js App Router |
| TailwindCSS v4 styling | → Vanilla CSS design system |
| HTTP POST chat (`/api/chat`) | → WebSocket (`ws://`) |
| Client-side `useState` message store | → In-memory event-sourced queue |
| `localStorage` trial counter | → MySQL session tracking |
| SpeechRecognition / SpeechSynthesis | → **Deleted** (text-only constraint) |
| Stripe payment link | → **Deleted** (broken, bypassable) |

### 🆕 BUILD NEW (Not in current codebase)

| Feature | Target Architecture Component |
|---|---|
| MySQL database + schema | `docker-compose.yml` + SQLAlchemy models |
| WebSocket chat server | `backend/websocket/chat.py` |
| Event store (in-memory) | `backend/event_store.py` |
| Event consumer (bulk write) | `backend/event_consumer.py` |
| Shadow Compiler | `backend/services/shadow_compiler.py` |
| Docker sandbox (Java execution) | `sandbox/` directory + gRPC |
| Evidence Engine + Vulnerability Map | `backend/services/evidence_engine.py` |
| Adaptive Decision Engine | `backend/services/decision_engine.py` |
| Recovery Engine | `backend/services/recovery_engine.py` |
| Counterfactual Feedback | `backend/services/counterfactual.py` |
| Readiness History (longitudinal) | MySQL schema + `backend/routers/history.py` |
| Monaco Code Editor | `frontend/src/components/CodeEditor.tsx` |
| Toast notification system | `frontend/src/components/Toast.tsx` |

---

## 7. Completion Estimate

Based on the audit, approximately **20% of the product's total intended functionality exists in working form**:

| Category | Existing | Total Needed | Coverage |
|---|---|---|---|
| AI Prompts & Schemas | 6/6 base prompts | 10+ (with Shadow Compiler, Evidence, Recovery, Counterfactual) | ~55% |
| API Endpoints | 6 REST (Express) | 12+ REST + 1 WebSocket (FastAPI) | ~30% |
| Database | 0 tables | 8+ tables | 0% |
| Frontend Pages | 1 monolith (3 states) | 4 pages + 13+ components | ~15% |
| Type Definitions | 7 interfaces | 15+ interfaces | ~45% |
| Infrastructure | 0 config files | docker-compose + Dockerfile + proto + .env | 0% |
| Tests | 0 | Unit + integration | 0% |
| **Weighted Total** | — | — | **~20%** |
