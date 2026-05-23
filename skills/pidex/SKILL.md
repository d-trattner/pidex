---
name: pidex
description: Start a pidex pipeline run. Primary invocation is /pidex; /pd is a shortcut alias. Runs a structured pre-flight interview to define the task precisely, then starts the pidex-* pipeline in Pi direct mode using the pidex_agent tool.
---

# PIDEX Orchestrator (`/pidex`)

This skill is the entry point for every pidex pipeline run. The primary user-facing invocation is `/pidex`; `/pd` remains supported as a short alias.

It ensures the task is precisely defined before any code is written. A vague epic is the single biggest source of wasted pipeline runs.

## Supplemental questioning skills

If the fixed pre-flight interview below is not enough to remove ambiguity, use the correct grilling skill for the project state:

- **New/non-existing/fresh projects:** load and apply `grill-me` (`~/.pi/agent/skills/grill-me/SKILL.md`).
- **Existing projects with inspectable code/docs/context:** load and apply PIDEX `grill-with-docs` (`<pidex-root>/skills/grill-with-docs/SKILL.md`).

Use these skills to interview the user relentlessly about the plan or design until all decision branches needed for the pipeline are resolved.

Rules for grilling inside pidex:

- Ask questions one at a time.
- For every question, provide the recommended answer.
- If a question can be answered by inspecting the codebase, docs, or `<project-root>/pidex/context/**`, inspect instead of asking.
- For existing projects, challenge terms against `<project-root>/pidex/context/CONTEXT.md` or `CONTEXT-MAP.md` when present.
- If an existing project has no `<project-root>/pidex/context/CONTEXT.md` or `CONTEXT-MAP.md`, initialize the single-context template first with `node <pidex-root>/scripts/project-context/init.mjs <project-root>`.
- `CONTEXT.md` follows Matt Pocock's context format exactly. Use `<pidex-root>/skills/grill-with-docs/CONTEXT-FORMAT.md` as the single source of truth for context handling.
- Put confirmed user statements and clear code/docs-evidenced project/domain terms directly into `## Language` only when they can be defined in one sentence. Do not put task specs, acceptance criteria, implementation plans, roadmap items, workflows, architecture notes, operational constraints, or release decisions in `CONTEXT.md`.
- For fresh/new projects, create `pidex/context/CONTEXT.md` during the orchestrator preparation step before spawning agents so the first plan has a context home.
- Agents may update context from confirmed user statements or clear code evidence; the user/domain expert owns truth.
- Stop grilling once you can write a crisp 3-5 sentence epic statement with explicit acceptance criteria, constraints, and out-of-scope items.
- Do not invoke `pidex-planner` before this clarity threshold is met.

## When to invoke

- User types `/pidex`
- User types `/pd` as a shortcut alias

Do not auto-trigger pidex from natural-language phrases such as "pipeline starten", "build this", or "implement this"; those may belong to Running Pi or normal chat.

## Direct-mode operation (current supported mode)

pidex currently supports direct mode as the working MVP:

- The host Pi session is the orchestrator.
- Specialist handoffs use the `pidex_agent` tool registered by the package extension.
- `pidex_agent` honors `<pidex-root>/config/agents.json`: default/tool-heavy agents use lean isolated Pi subprocesses; configured review/synthesis agents may route to Claude, Codex, or Gemini CLI delegates.
- `pidex_agent` stores raw child JSON streams under `<pidex-root>/state/runs/` and returns only compact tool details to avoid parent-session bloat.
- `pidex_agent` records per-agent metrics under `<pidex-root>/state/metrics/`.
- For plan-id allocation, use atomic helper `bash <pidex-root>/scripts/parallel/manifest.sh next-id --project-root <project-root>` (do not increment `.next-id` ad hoc under parallel load).
- Specialist final responses must stay short: write full artifacts to files, then return only status, output paths, next route, concise evidence, and the ROUTING block.
- Generated `agents.output/**` artifacts are runtime/operator outputs and must never be committed. Do not stage them, do not use `git add -f` for them, and do not suggest them as commit candidates. Commit durable wiki/project metadata instead (for example `wiki/**` or `pidex/state/wiki-hygiene.json` when appropriate).
- Gates are asked in the Pi session. Do not use Telegram reply handling unless the user explicitly asks for the scaffolded background mode.
- Optional notify-only Telegram is allowed in direct mode: use `<pidex-root>/scripts/telegram/notify.sh --optional` to alert the user that Pi needs attention and when the pipeline reaches terminal completion/failure/abort. This sends information only, no buttons, no replies, no `pending-gate.json`.

Before invoking the first delegated non-Pi agent, ensure delegate auth preflight is green. `/pidex` and `/pd` run this automatically, but if continuing manually use:

```bash
bash <pidex-root>/scripts/delegate/check-auth.sh --config <pidex-root>/config/agents.json
```

If auth/setup fails, stop and ask the user to fix auth or explicitly override affected agents to `provider=pi`. Do not silently fall back on auth/setup failure.

When an `pidex-*` subprocess emits a `gate:` in its final `<!-- ROUTING -->` block, stop and ask the user for the gate decision in the current Pi session. Then continue routing based on the answer.

---

## Pre-flight sequence

The pre-flight runs in this fixed order. Every step must be resolved before proceeding.

### Low-context project reconnaissance (mandatory)

Keep orchestrator context lean by default:

1. Prefer `rg`, `find`, `head`, `tail`, and narrow `read offset/limit` over full-file reads.
2. Do **not** read long artifacts (`open-items.md`, large plan docs, retros) end-to-end unless a specific gate/decision requires it.
3. When a project is mentioned by name/path, do a **roadmap-first quick look** before broader scanning:
   - Check `<project>/agents.output/roadmap/product-roadmap.md` first (if present).
   - Reconcile it with newer roadmap/planning artifacts before answering next-work/status questions: targeted-check latest `<project>/agents.output/roadmap/*roadmap-update*.md`, `<project>/agents.output/planning/*brief*.md`, `<project>/agents.output/planning/*draft*.md`, and `<project>/agents.output/planning/*summary*.md` whose mtimes or plan IDs are newer than the canonical roadmap.
   - If a newer artifact proposes planned epics or next work that is not present in the canonical roadmap, say so explicitly and treat it as a pending/unpromoted roadmap update; do not answer from the older canonical roadmap alone.
   - Extract only current/open signals (e.g., ACTIVE/OPEN/IN PROGRESS/recent epics) with targeted grep/snippets.
   - Expand to other files only if roadmap data is missing, newer artifacts conflict with canonical roadmap, or the user asks for deeper detail.
4. After a project is selected, if roadmap/open-work signals exist, present a compact lettered shortlist immediately instead of asking a blank "what deliverable?" question. Include up to 5 items from canonical roadmap plus reconciled newer roadmap/planning artifacts, clearly labelling status/source such as `Interview`, `Planned (canonical)`, `Pending roadmap update`, or `Backlog candidate`. Always include options for `Other/manual task` and `Show more/open work`. If an item is `Interview`, or if the orchestrator can see unresolved user story/acceptance/scope/dependency/UI-intent ambiguity, label it interview-first and start the interview/grill phase when selected; do not route directly to planner.
5. Default summary depth: top 3-5 actionable items, then ask whether to drill deeper.

### Project boundary write guard (mandatory)

Before any direct-mode pipeline mutation or `pidex-*` spawn, load and apply `<pidex-root>/rules/orchestrator/project-boundary-write-guard.md`.

A pipeline may only mutate its declared `<project-root>` / allowed write root. Other repositories, including `<pidex-root>` when the active project is not PIDEX itself, are read-only references unless the user explicitly switches project and starts a new pipeline for that root.

Every specialist handoff must include a `PROJECT BOUNDARY` block naming current project root, allowed write root, read-only external reference roots, and the rule: do not edit/commit/tag/push outside allowed write root.

### Pre-spawn context pack (preferred; helper optional)

Before every `pidex-*` spawn, use a compact context pack instead of pasting broad/full artifacts. If a PIDEX context-budget helper exists, prefer it:

```bash
bash <pidex-root>/scripts/pre-spawn/spawn-with-budget.sh \
  --agent <pidex-agent> \
  --brief-file <brief.md|txt> \
  --focus "<epic|section>" \
  --include-file <doc1> [--include-file <doc2> ...]
```

Use the emitted pack path in the `pidex_agent` briefing.

If the helper is unavailable, do **not** block the pipeline. Create a compact manual context pack/brief instead, include only targeted artifact paths/snippets, and mention `CONTEXT-PACK-MANUAL: helper unavailable` in the handoff.

Budget check is **soft by default** (warn-only). Use `--hard` only when you explicitly want blocking behavior and the helper exists.

### Step 0 — Recent projects shortlist

Before asking "which project?", check the pidex history log and offer a shortlist of recently-touched **unique project directories**. This saves the user from typing paths they already used.

```bash
bash <pidex-root>/scripts/history/list.sh --limit 5
```

If the script prints nothing (empty or missing `<pidex-root>/state/history.jsonl`), skip straight to Step 1. Otherwise present its output to the user with an explicit "new" option appended:

```
Recent projects:
A) <project-root-a>
   last touched: 2026-05-06T09:59:46Z (direct, direct-complete)
B) <project-root-b>
   last touched: 2026-04-10T09:14:00Z (direct, stop)
...
N) New project / different path
```

Do **not** list multiple entries for the same project just because it had multiple epics. Epics are intentionally not shown in this shortlist. Accept a letter (A-E) to select that cwd, then ask what the user wants to do next for that project. Accept "N" / "new" / any name or path to fall through to Step 1.

### Step 1 — Project directory

This is always the first question when Step 0 did not resolve the project. The user does NOT need to give an exact path. Accept sloppy input and resolve it.

> **Which project?** Name, path, or "new".

**Resolving the project:**

The user might say any of these:
- An exact path: `~/projects/my-app` → use directly
- A project name: "my-app", "sofafahrten", "homelab" → search for it
- A vague reference: "the todo project", "that thing I started yesterday" → search and ask
- "new" or "new project" → new project flow

**If the user gives a name (not a full path):**
1. Search the entire home directory for a match (exclude hidden dirs and node_modules):
   ```bash
   find ~ -maxdepth 4 -type d -name "*<search-term>*" \
     -not -path '*/\.*' -not -path '*/node_modules/*' 2>/dev/null
   ```
2. If exactly one match: propose it. "Found `~/dev/my-app`. Is that the one?"
3. If multiple matches: present a lettered list and let the user pick:
   ```
   Found multiple matches:
     A) ~/projects/local/my-app
     B) ~/projects/www/my-app-frontend
     C) ~/old/my-app-archive
   Which one? (A/B/C)
   ```
4. If no matches: "I couldn't find a project matching '<name>'. Give me the full path, or say 'new' to create it."

**After resolving to a path:**
1. Verify the directory exists. If not: "This directory does not exist. Should I create it as a new project, or did you mean something else?"
2. Use bundled agents from `<pidex-root>/agents/` through the `pidex_agent` tool. Project-local `.pi/agents/` copies are optional and not required for the MVP.
3. Check if `<path>/agents.output/` exists. If not, create it with `.next-id` set to 0.
4. Check roadmap/open-work signals using the low-context roadmap-first reconciliation rule above even if the user only selected a project. If actionable planned/open/backlog items exist, present a compact lettered shortlist, for example:
   ```text
   Selected project: <path>

   Roadmap options:
   A) <planned epic> — Interview (interview first)
   B) <planned epic> — Planned (ready for planner after quick confirmation)
   C) <newer epic> — Pending roadmap update from <artifact>
   D) Other/manual task
   E) Show more/open work

   Which deliverable should this run take?
   ```
   Do not force the user to ask "what is open?" when obvious roadmap options are available. Treat `Interview` as a start-interview choice, not a start-implementation choice.
5. Determine project type: does the directory have source code? A package.json / pyproject.toml / go.mod? Tests? This informs which interview flow to use.
6. Store the resolved absolute path.

**If the user says "new":**
1. Ask: "What should the project be called, and where should it live? Give me a name (I'll ask where to put it) or a full path."
2. If the user gives just a name (e.g., "invoice-parser"): ask where to create it. Do NOT assume a default location — different users organize their projects differently.
3. If the user gives a full path: use that.
4. Store the path. The directory will be created during pipeline execution.
5. The interview will use the Onboarding flow.

### Step 2 — Execution mode

Use **Direct mode** by default. It is the only parity-supported mode in the MVP.

If the user asks for background mode, explain that background/Telegram scripts are scaffolded but not parity-complete yet, and ask whether to continue in direct mode instead.

Store the choice as `direct` unless the user explicitly accepts experimental background work.

### Step 3 — Interview

Walk through the appropriate interview flow to produce a crisp epic statement. The project state from Step 1 determines the scenario.

**UI design interview branch (mandatory when triggered):** Before routing to planner/designer/implementer, load `<pidex-root>/rules/orchestrator/ui-design-interview-gate.md`, `<pidex-root>/rules/orchestrator/ui-preservation-classifier.md`, and (after UI G9 rejection) `<pidex-root>/rules/orchestrator/g9-ui-rejection-delta.md` when the request touches UI placement, hierarchy, layout, mobile, forms, tables, navigation, modals/sheets, cards, status strips, toolbars, or pattern parity ("match", "like X", "same as", "move to where X is"). Ask targeted missing questions only; inspect source when possible instead of asking. Classify the UI intent as preserve / preserve-mostly / redesign / new / incidental. For UI-heavy or visually sensitive work, ask whether the user wants a designer meeting with a temporary preview before implementation (`yes`, `no`, or `only if designer finds ambiguity`). Persist the result as `agents.output/design/<plan-id>-ui-intent-interview.md` or as `## UI Intent Contract` plus `## UI Preservation Classification` in the first plan/design artifact. If UI intent remains ambiguous, route to `user`; do not spawn implementer. If the user requests a temporary preview, route to pidex-designer with `rules/pidex-designer/design-snippet-preview.md` and use `scripts/preview/*design-snippet.sh` helpers to return localhost and LAN URLs on a random port. For any G9/post-devops preview on a headless/server host, apply `rules/orchestrator/preview-lan-url-required.md`: bind to `0.0.0.0`, verify LAN route, and include both localhost and LAN URLs. If G9/user feedback rejects positioning twice, this UI interview branch is mandatory before any further implementer fix.


**Fresh project (Step 1 = "new" or empty directory):**
→ Onboarding flow, and use `grill-me` for extra ambiguity resolution.

**Existing project with code/docs/context:**
→ Ask what the user wants to do, inspect code/docs/context when useful, and use PIDEX `grill-with-docs` for extra ambiguity resolution. `grill-with-docs` uses `<project-root>/pidex/context/**` for glossary/ADR context and must not default to root `CONTEXT.md` or root `docs/adr/`.

Then route:

1. **Is this a fresh project or an existing codebase?**
   - Fresh → Onboarding flow
   - Existing → one of the flows below

2. **What is the scope?**
   - Single function or small fix → Small scope
   - New module or multi-file feature → Medium scope
   - New system, major refactor, or multi-epic initiative → Large scope

Then run the matching interview below.

---

### Onboarding flow (fresh project)

For projects where no code exists yet or the project is being set up for the first time.

**Letter shortcuts:** Throughout the interview, when options are listed with letters (A, B, C...), the user can reply with just the letter instead of typing the full answer. Accept both uppercase and lowercase. If the user replies with a number, match it to the option at that position.

**Step 1 — Language and runtime**

> What language and runtime will this project use?

```
A) TypeScript + Node.js (recommended — best TDD support)
B) TypeScript + Deno
C) TypeScript + Bun
D) Python
E) Go
F) Rust
G) Java / Kotlin (JVM)
H) C# / .NET
I) Ruby
J) PHP
K) Elixir
L) Other (specify)
```

**Step 2 — Project type**

> What kind of project is this?

```
A) CLI tool
B) Library / package (npm, PyPI, crate, gem...)
C) REST API / backend service
D) GraphQL API
E) Full-stack web app (frontend + backend)
F) Frontend SPA (single-page app)
G) Static site / landing page
H) Mobile app (React Native / Flutter / native)
I) Desktop app (Electron / Tauri)
J) Browser extension
K) Discord / Slack / Telegram bot
L) Microservice / worker / queue consumer
M) Infrastructure / DevOps scripts
N) Data pipeline / ETL
O) Machine learning / AI project
P) Game
Q) Monorepo (multiple packages)
R) Other (specify)
```

**Step 3 — Framework (if applicable)**

Based on Step 2, ask about framework. Present only the relevant category.

For REST API / backend (TypeScript/JavaScript):
```
A) Express
B) Fastify
C) Hono
D) Koa
E) NestJS
F) AdonisJS
G) tRPC (standalone)
H) None (plain Node HTTP)
```

For REST API / backend (Python):
```
A) FastAPI
B) Django + DRF
C) Flask
D) Litestar
E) None (plain WSGI/ASGI)
```

For REST API / backend (Go):
```
A) Gin
B) Echo
C) Chi
D) Fiber
E) net/http (stdlib)
```

For REST API / backend (Rust):
```
A) Actix Web
B) Axum
C) Rocket
D) Warp
```

For REST API / backend (Ruby):
```
A) Rails
B) Sinatra
C) Hanami
```

For REST API / backend (PHP):
```
A) Laravel
B) Symfony
C) Slim
```

For REST API / backend (Elixir):
```
A) Phoenix
```

For REST API / backend (Java/Kotlin):
```
A) Spring Boot
B) Quarkus
C) Ktor
D) Micronaut
```

For REST API / backend (C#/.NET):
```
A) ASP.NET Core (minimal API)
B) ASP.NET Core (MVC)
```

For full-stack web app:
```
A) Next.js — App Router
B) Next.js — Pages Router
C) Remix
D) SvelteKit
E) Nuxt
F) Astro (with islands)
G) SolidStart
H) RedwoodJS
I) T3 Stack (Next.js + tRPC + Prisma + Tailwind)
J) Django (templates + htmx)
K) Rails (Hotwire/Turbo)
L) Laravel (Livewire / Inertia)
M) Phoenix LiveView
N) None (separate frontend + backend)
```

For frontend SPA:
```
A) React (Vite)
B) Vue (Vite)
C) Svelte (Vite)
D) Solid (Vite)
E) Angular
F) Preact
G) Qwik
H) Vanilla (no framework)
```

For static site:
```
A) Astro
B) 11ty (Eleventy)
C) Hugo
D) Jekyll
E) Plain HTML/CSS/JS
```

For CLI:
```
A) No framework (just the language stdlib)
B) Commander.js / yargs (Node)
C) Click / Typer (Python)
D) Cobra (Go)
E) Clap (Rust)
F) Thor (Ruby)
```

For mobile:
```
A) React Native (Expo)
B) React Native (bare)
C) Flutter
D) Native iOS (Swift)
E) Native Android (Kotlin)
F) Capacitor (web → native)
```

For desktop:
```
A) Electron
B) Tauri
C) Qt (Python/C++)
```

For bot:
```
A) discord.js
B) Slack Bolt
C) Telegraf / grammY (Telegram)
D) Custom (specify)
```

If the project type doesn't have a framework list above (e.g., data pipeline, ML project), skip this step or ask: "Any specific framework or tool? (e.g., Airflow, dbt, PyTorch, LangChain) — or 'none'."

**Step 3b — Styling (only for web projects with a UI)**

Skip this step for APIs, CLIs, libraries, workers, bots, and anything without a visual frontend.

> How should the UI be styled?

```
A) Tailwind CSS
B) Tailwind CSS + shadcn/ui (recommended for React)
C) Tailwind CSS + DaisyUI
D) CSS Modules
E) Vanilla CSS / plain stylesheets
F) styled-components / Emotion (CSS-in-JS)
G) Material UI (MUI)
H) Chakra UI
I) Ant Design
J) Mantine
K) Radix UI + custom styles
L) Bootstrap
M) Bulma
N) UnoCSS
O) PandaCSS
P) None / will decide later
```

**Step 3c — Design template (only for web projects with a UI)**

Skip this step for APIs, CLIs, libraries, workers, bots, and anything without a visual frontend.

> Want to start from a design template? These are curated design systems inspired by real products — they set colors, typography, spacing, and visual tone. The pidex-designer agent will use the template as a starting point for DESIGN.md.

```
A) Vercel — Black and white precision, Geist font, gallery-like minimalism
B) Stripe — Signature purple gradients, weight-300 elegance, payment infrastructure aesthetic
C) Linear — Dark-mode-first, near-black canvas, extreme precision engineering
D) Supabase — Dark developer aesthetic, emerald green accents, terminal-born sophistication
E) Figma — Typographic sophistication, custom variable font weights, micro-hierarchy
F) None / custom — Start from scratch or bring your own DESIGN.md
```

If the user picks A-E, include in the epic: "Design template: <name> (from <pidex-root>/design-templates/<name>.md — copy to agents.output/design/DESIGN.md at project init)."

If the user picks F, the pidex-designer will bootstrap DESIGN.md from the existing codebase or from scratch during its first run.

**Step 4 — Data layer**

> Does this project need a database or persistent storage?

```
A) No (stateless / pure functions)
B) SQLite (local, simple)
C) PostgreSQL
D) MySQL / MariaDB
E) MongoDB
F) Supabase (Postgres + auth + realtime)
G) Firebase / Firestore
H) Redis (caching / sessions / pub-sub)
I) DynamoDB
J) Turso (libSQL, edge SQLite)
K) PlanetScale (MySQL, serverless)
L) Dragonfly / Valkey (Redis-compatible)
M) File-based (JSON, YAML, Markdown)
N) S3 / R2 / object storage
O) Vector DB (Pinecone, Qdrant, Chroma, pgvector)
P) Multiple (specify)
Q) Other (specify)
```

If the user picks a relational DB (C, D, F, J, K), follow up with ORM:
```
A) Prisma
B) Drizzle
C) Kysely
D) TypeORM
E) Sequelize
F) SQLAlchemy (Python)
G) Django ORM (Python)
H) GORM (Go)
I) Diesel (Rust)
J) ActiveRecord (Ruby)
K) Eloquent (Laravel/PHP)
L) Ecto (Elixir)
M) Raw SQL / query builder
N) Other
```

**Step 5 — Testing**

> Which test framework?

```
A) vitest (recommended for TypeScript)
B) jest
C) Node test runner (built-in)
D) Playwright (E2E)
E) Cypress (E2E)
F) pytest (Python)
G) unittest (Python)
H) go test (Go)
I) cargo test (Rust)
J) RSpec (Ruby)
K) PHPUnit (PHP)
L) JUnit (Java/Kotlin)
M) xUnit / NUnit (.NET)
N) ExUnit (Elixir)
O) Other (specify)
```

**Step 6 — Initial deliverable**

> What is the FIRST thing the pipeline should build? Not the whole app — the first shippable increment.

Help the user narrow down: "What's the smallest useful thing that proves the architecture works?" Examples:
- "A single endpoint that returns health status"
- "A CLI that reads one file and prints a summary"
- "A function that validates one input type"

**Step 7 — Synthesize, scaffold, and confirm**

Compose the epic from all interview steps (1-6, including 3b and 3c if applicable) plus the project path from Pre-flight Step 1, filling in ALL values from the interview — nothing should be left as a placeholder. The epic MUST include the project setup as the first paragraph if this is a fresh project. Every choice the user made (language, framework, styling, design template, test runner, data layer, ORM, project path) must appear verbatim.

Example of a completed epic (every value came from the interview, none are generic):

> Create a new Python project at <project-root>/invoice-parser. Initialize with: git init, pyproject.toml (name: invoice-parser, version 0.0.0, pytest as test framework), src/invoice_parser/ package directory, tests/ directory, .gitignore (venv, __pycache__, .pytest_cache). Create and activate venv, install pytest. Initial commit.
>
> Then build the first feature: a function parse_total(pdf_path: str) -> Decimal in src/invoice_parser/parser.py that extracts the total amount from a single-page PDF invoice. Uses pdfplumber for text extraction. Returns the first number that follows the word "Total" (case-insensitive). Edge cases: file not found raises FileNotFoundError, no "Total" found raises ValueError("no total line found"), multiple "Total" lines uses the last one. 100% coverage on src/invoice_parser/parser.py.

The project scaffold is part of the epic, not a separate step. The lead's pidex-planner will incorporate it into its plan, and pidex-implementer will execute the setup before writing the feature code.

Read back to the user: "Here is the epic I would send to the pipeline. Does this match your intent, or should I adjust anything?"

**What the orchestrator does BEFORE starting the lead (for fresh projects only):**

After the user confirms the epic, create the project directory, project context template, and minimal agents.output structure so the lead has somewhere to write, and ensure generated/runtime PIDEX folders are ignored before any agent creates files:

```bash
mkdir -p <project-path>/agents.output <project-path>/pidex/state <project-path>/pidex/rules <project-path>/pidex/config <project-path>/pidex/prompts
node <pidex-root>/scripts/project-context/init.mjs <project-path>
printf '\n# PIDEX / agent runtime artifacts\nagents.output/\n.wiki-migration/\n' >> <project-path>/.gitignore
echo 0 > <project-path>/agents.output/.next-id
```

If `.gitignore` already exists, append only missing entries. `agents.output/**` must remain ignored/uncommitted; `pidex/state/wiki-hygiene.json` and other durable `pidex/` metadata may be committed when explicitly appropriate.

Do NOT scaffold the project code (package.json, tsconfig, etc.) — that is the lead's job as part of the epic. The orchestrator only creates the directory, initializes `pidex/context/CONTEXT.md`, initializes agents.output, and ensures `.gitignore` protects generated PIDEX artifacts. Do not copy agent files; bundled agents are invoked through `pidex_agent`.

Only proceed after explicit confirmation.

---

### Feature flow (existing project)

For adding new functionality to an existing codebase.

**Step 1 — What and where**

> What should the new feature do? Which file(s) should it live in?

If the user is vague ("add user management"), dig deeper:
- What specific operations? (create, read, update, delete?)
- What entity? (User type with which fields?)
- Where in the codebase? (new file? extend existing module?)

**Step 2 — Interface definition**

> What is the function signature or API contract?

Push for specifics:
- Function name, parameters, return type
- For APIs: HTTP method, path, request body, response shape
- For UI: which component, what props, what user interaction

**Step 3 — Behavior and edge cases**

> What are the edge cases?

Prompt with examples:
- What happens with empty input?
- What happens with invalid input?
- What happens when the dependency (DB, API, file) is unavailable?
- Are there size limits?
- Concurrent access considerations?

The user should name at least 2-3 edge cases explicitly.

**Step 4 — Constraints**

> Are there constraints I should know about?

- Must it be backward-compatible with an existing API?
- Performance requirements?
- Security considerations? (auth, input sanitization, secrets)
- Existing patterns in the codebase to follow?

**Step 5 — Acceptance criteria**

> What does "done" look like?

Propose concrete criteria:
- "Function X exists in file Y and handles cases A, B, C"
- "All tests pass, coverage >= N% on the new code"
- "Existing tests still pass (no regressions)"

**Step 6 — Synthesize and confirm**

Same as onboarding Step 7. Read the epic back, get confirmation.

---

### Bugfix flow (existing project)

**Step 1 — Reproduce**

> Can you describe the bug? What is the expected behavior vs actual behavior?

If the user can't describe it precisely: "Can you show me the error message, the failing test, or the steps to reproduce?"

**Step 2 — Locate**

> Do you know which file or function is involved?

If unknown: "I'll include investigation in the epic so the planner can scope it."

**Step 3 — Scope the fix**

> Should the fix ONLY address this bug, or are there related issues to clean up?

- Bug only (tight scope, preferred for pipeline)
- Bug + related cleanup (wider scope, note explicitly)

**Step 4 — Synthesize and confirm**

Example epic:

> Fix: addTodo returns a mutated input array instead of a new copy. Expected: addTodo(list, text) returns a new array; original list is unchanged. Actual: the original list has the new todo appended in-place. Root cause suspected in src/todos.ts addTodo function (uses push instead of spread). Acceptance: existing mutation test (tests/todos.test.ts "does not mutate input") passes. No other behavioral changes.

---

### Refactor flow (existing project)

**Step 1 — What and why**

> What do you want to refactor, and what motivates it?

- Code quality (too complex, hard to test, duplicated logic)
- Architecture (wrong abstraction, coupling issue)
- Performance (measured bottleneck, not speculative)
- Preparation for a future feature

**Step 2 — Boundaries**

> What should NOT change?

- External API contracts?
- Test behavior?
- Database schema?
- File structure?

**Step 3 — Acceptance criteria**

> How do we know the refactor succeeded without changing behavior?

- "All existing tests pass unchanged"
- "Coverage does not drop below N%"
- "Function X is now in file Y instead of Z"
- "Cyclomatic complexity of function X drops from N to M"

**Step 4 — Synthesize and confirm**

---

### Migration flow (existing project, moving from one thing to another)

For replacing a framework, library, language version, API, database, or any infrastructure component with a different one while preserving existing behavior.

**Step 1 — Source and target**

> What are you migrating FROM and TO?

Push for specifics:
- Framework migration: Express → Fastify? React class components → hooks? Vue 2 → Vue 3?
- Language migration: JavaScript → TypeScript? Python 2 → 3? CJS → ESM?
- Database migration: MySQL → PostgreSQL? REST → GraphQL? Monolith → microservice?
- Infrastructure migration: Heroku → self-hosted? Docker Compose → Kubernetes?

**Step 2 — Source inventory**

> Where is the code that needs to migrate? How much of it?

The orchestrator MUST understand the blast radius before planning:
- How many files are affected? (Rough count is fine: "5 files" vs "the entire src/ tree")
- Are there tests for the current implementation?
- Is there configuration (env vars, config files, CI pipelines) that also needs changing?
- Are there external consumers (other services, users, APIs) that depend on the current interface?

If the user cannot answer these: "I'll add a reconnaissance step to the epic so pidex-analyst can inventory the migration surface before pidex-planner starts."

**Step 3 — Migration strategy**

> How should the migration proceed?

- Big bang (replace everything in one pass, test, ship) — only viable for small surfaces
- Incremental (migrate one module/endpoint/component at a time, keep both working) — recommended for medium+ scope
- Strangler fig (new code uses new approach, old code stays until deprecated) — for large systems with external consumers

**Step 4 — Compatibility requirements**

> What must remain backward-compatible during and after migration?

- Public API contracts (REST endpoints, function signatures, CLI flags)
- Database schema (can you do a schema migration, or must old and new coexist?)
- Configuration format (do existing env vars / config files still work?)
- Test suite (must all existing tests pass with zero changes, or can tests be rewritten?)

**Step 5 — Rollback plan**

> If the migration breaks something, how do we undo it?

- Git revert (if single commit)
- Feature flag (if gradual rollout)
- Database rollback script (if schema changed)
- "No rollback needed, this is a dev-only tool" (acceptable for small-scope)

**Step 6 — Synthesize and confirm**

Example epic:

> Migrate the Express REST API in src/server/ to Fastify. 12 route handlers in 4 files. All existing integration tests in tests/api/ must pass unchanged (they hit the HTTP interface, not Express internals). Middleware for auth (src/middleware/auth.ts) and validation (src/middleware/validate.ts) must be ported to Fastify equivalents. No database changes. Env vars unchanged. Incremental strategy: migrate one route file at a time, keep Express running for unmigrated routes via a compatibility adapter until all routes are ported. Rollback: git revert the migration commit(s). Coverage must not drop below 85%.

---

### Security audit flow

For investigating potential vulnerabilities, hardening an existing system, or preparing for a compliance review.

**Step 1 — Scope and motivation**

> What triggered this security concern?

- Dependency vulnerability alert (Dependabot, npm audit, Snyk)
- Upcoming compliance review (SOC2, GDPR, PCI-DSS)
- Incident or near-miss
- Proactive hardening (no specific trigger)
- New feature touching auth, payments, or PII

**Step 2 — Attack surface**

> What parts of the system handle sensitive data or face external input?

Walk through systematically:
- Authentication: how do users log in? (JWT, sessions, OAuth, API keys?)
- Authorization: who can do what? (RBAC, per-resource checks, admin panel?)
- User input: which endpoints accept untrusted data? (forms, file uploads, API bodies?)
- Secrets management: where are credentials stored? (env vars, vault, config files, hardcoded?)
- Dependencies: when was the last `npm audit` / `pip audit` / equivalent?
- Network: is the service behind a firewall? TLS everywhere? CORS configured?

If the user doesn't know some answers: "I'll include an inventory step so pidex-security can map the attack surface before recommending fixes."

**Step 3 — Depth of audit**

> How deep should the audit go?

Match to the pidex-security modes:
- **Full audit** — comprehensive review of all code, deps, infra config (days of pipeline time, thorough)
- **Targeted** — focus on a specific area (e.g., "only auth middleware" or "only the file upload endpoint")
- **Dependency-only** — just check third-party packages for known CVEs
- **Pre-production gate** — quick pass on new code before a release (runs after pidex-qa, before pidex-devops)

**Step 4 — Remediation expectations**

> Should the pipeline FIX issues it finds, or just REPORT them?

- Report only (pidex-security writes findings, user decides what to fix later)
- Report + fix critical/high (pipeline fixes OWASP Top 10 level issues, defers low-risk)
- Fix everything (pipeline attempts to remediate all findings — higher risk of breaking changes)

**Step 5 — Synthesize and confirm**

Example epic:

> Security audit (targeted) on the authentication flow in src/auth/. Motivation: adding OAuth support next sprint, want to verify the existing JWT implementation is solid first. Scope: src/auth/*.ts, src/middleware/auth.ts, related tests. Check for: token expiry validation, secret rotation readiness, CSRF on state-changing endpoints, SQL injection in user lookup queries. Mode: report + fix critical/high. Acceptance: all high/critical findings have PRs or documented justification for deferral. Existing auth tests still pass.

---

### Redesign flow (UI/UX overhaul, visual refresh, or design system migration)

For changing how something looks or works from a user-experience perspective, potentially with design files (Figma, screenshots, templates) as input.

**Step 1 — Design inputs**

> Do you have design files, mockups, or a reference to work from?

```
A) Figma / Sketch file (URL or exported images)
B) Screenshots of the current UI to annotate
C) A reference site or app ("make it look like X")
D) Written description only (no visual reference)
```

If A or B: "Please place exported images (PNG/SVG) or the Figma export in a `design/` directory in the project root, or give me a URL. I'll include the path in the epic so pidex-designer and pidex-implementer can reference them."

**Step 1b — Design template**

> Want to base the redesign on a design template? These set the visual tone — colors, typography, spacing, motion. The pidex-designer agent uses the template as starting point for DESIGN.md.

```
A) Vercel — Black and white precision, Geist font, gallery-like minimalism
B) Stripe — Signature purple gradients, weight-300 elegance, payment infrastructure aesthetic
C) Linear — Dark-mode-first, near-black canvas, extreme precision engineering
D) Supabase — Dark developer aesthetic, emerald green accents, terminal-born sophistication
E) Figma — Typographic sophistication, custom variable font weights, micro-hierarchy
F) Custom file — I have my own DESIGN.md or design token file (provide path)
G) Generic — Start with a neutral, clean baseline (pidex-designer will create one)
H) None — Keep the existing design system, only redesign within current tokens
```

If A-E: include in the epic "Design template: <name> (from <pidex-root>/design-templates/<name>.md — copy to agents.output/design/DESIGN.md at project init)."

If F: ask for the path. Include in the epic "Custom design template: <path> — copy to agents.output/design/DESIGN.md at project init."

If G: the pidex-designer will bootstrap a clean, neutral DESIGN.md during its first run.

If H: the pidex-designer will read the existing codebase to extract the current design system into DESIGN.md and work within those constraints.

**Step 2 — Scope of redesign**

> What is being redesigned?

- Single component (e.g., "the login form", "the navigation bar")
- Single page / view (e.g., "the dashboard", "the settings page")
- Multiple pages (e.g., "all public-facing pages")
- Entire app (design system migration)

**Step 3 — Styling framework and constraints**

> What CSS/styling framework is in use (or should be)?

```
A) Tailwind CSS
B) Tailwind CSS + shadcn/ui (recommended for React)
C) CSS Modules / vanilla CSS
D) styled-components / Emotion (CSS-in-JS)
E) Material UI / Chakra UI / Ant Design
F) Keep current (no change to styling framework)
```

Additional constraints:
- Must it be responsive? (Mobile-first? Specific breakpoints?)
- Dark mode support?
- Accessibility requirements? (WCAG level?)
- Animation/transition expectations?

**Step 4 — Behavior changes**

> Does the redesign change how things WORK, or only how they LOOK?

- Visual only (same interactions, new appearance)
- Visual + interaction changes (e.g., "move from tabs to accordion", "add drag-and-drop")
- Full UX rethink (new information architecture, different user flows)

If behavior changes: "I need to define the new behavior explicitly in the epic, not just the visual changes. Otherwise the implementer may preserve old behavior that you want changed."

**Step 5 — Reference material path**

> Where should I tell the pipeline to find the design inputs?

Confirm the location:
- `<project>/design/` — for Figma exports, screenshots, mockups
- `<project>/design/README.md` — for written design specs
- External URL — for Figma links (note: the pipeline can read screenshots but not live Figma files)

**Step 6 — Acceptance criteria**

> How do we know the redesign is done?

- "The login page matches the Figma mockup in design/login-v2.png"
- "All pages use the new color tokens from the design system"
- "Lighthouse accessibility score >= 90"
- "Existing E2E tests pass with updated selectors"
- "The component renders correctly at 320px, 768px, and 1440px widths"

**Step 7 — Synthesize and confirm**

Example epic:

> Redesign the dashboard page (src/pages/Dashboard.tsx). Design template: Linear (from <pidex-root>/design-templates/linear.app.md — copy to agents.output/design/DESIGN.md at project init). Design inputs: mockup in design/dashboard-v2.png. Styling: Tailwind + shadcn/ui (migrating from custom CSS). Layout changes: replace the 3-column grid with a 2-column layout, move the stats cards from sidebar into a top row. Behavior: unchanged — same data, same interactions, new layout and styling. Must be responsive (mobile: single column, tablet: 2 columns). Dark mode: yes (Linear template is dark-mode-first). Accessibility: all interactive elements must be keyboard-navigable, WCAG AA. Acceptance: visual match to mockup at 1440px, responsive at 768px and 375px, existing Playwright E2E tests pass with updated selectors if needed.

---

### Step 8 — Task classification (decides the opening agent)

Before starting the pipeline, classify the task to decide whether `pidex-architect` runs BEFORE `pidex-planner` (architecture-first), whether a specialist maintenance agent opens directly, or whether `pidex-planner` opens directly.

**Why this matters:** Horizontal-slicing plan failures (Plan-014-pattern) often trace back to structural decisions that pidex-planner made without architectural context — monorepo layouts, migration ordering, dependency boundaries. Running pidex-architect first produces an ADR that constrains the plan before it exists, eliminating a class of rejection loops.

**Classify into one of these buckets.** Use the heuristics; when truly in doubt, ask the user. Specialist maintenance routes take precedence over generic Bugfix / maintenance.

| Category | Trigger heuristics | Opening agent |
|----------|-------------------|---------------|
| **Structural** | Framework migration (e.g. Next.js → TanStack), runtime swap (Node → Bun, CJS → ESM), DB engine/ORM change, monorepo restructure, auth-system replacement, new architectural pattern (event sourcing, CQRS, microservice split), major dependency version jump that breaks contracts. Epic verbs: "migrate", "switch from X to Y", "replace X with Y", "rewrite on top of", "refactor base". | `pidex-architect` → produces ADR → then `pidex-planner` |
| **Cross-cutting large feature** | Touches 3+ system layers in one epic (e.g. UI + API + DB + auth), introduces a new cross-boundary contract, or spans 3+ existing epics. Epic mentions end-to-end new flows with multiple integration points. | `pidex-architect` → produces ADR → then `pidex-planner` |
| **Standard feature** | Single-layer or 2-layer work, fits existing patterns, no new abstractions. Most "add endpoint X, wire UI Y" work lives here. | `pidex-planner` directly |
| **Wiki hygiene / project memory maintenance** | User asks for wiki hygiene, wiki cleanup, duplicate/stale wiki files, broken wiki links, Obsidian/wiki organization, `wiki/` audit, project memory/session-memory organization, or explicitly mentions `pidex-wiki-hygienist` / `/pdwiki`. Read-only audit/report requests should not go through planner. Cleanup/apply requests must still start audit-first and ask for explicit mutation approval. | `pidex-wiki-hygienist` directly |
| **Bugfix / maintenance** | Localized, no new abstractions. If root cause is unclear: open with `pidex-analyst` first. Do not use this generic bucket for wiki hygiene; use the specialist route above. | `pidex-planner` (or `pidex-analyst` if diagnostic) |

**Present the classification to the user explicitly:**

```
Classification: <Structural | Cross-cutting large | Standard feature | Wiki hygiene / project memory maintenance | Bugfix>
Opening-Agent: <pidex-architect → pidex-planner | pidex-planner | pidex-analyst → pidex-planner | pidex-wiki-hygienist>
Reason: <one-sentence justification, e.g. "Migration from Next.js App Router to TanStack Start = framework base change">
```

Ask the user to confirm or override. If the user overrides, record their decision in the team prompt so the lead starts with the chosen agent.

**Pass the decision to the pipeline:**

For architecture-first routes, the team prompt (see Rule 7 template in pidex-instructions.md) must include:

```
OPENING AGENT: pidex-architect
After the pre-flight classifier determined this is a <Structural|Cross-cutting> task.
pidex-architect MUST run before pidex-planner and produce:
- An ADR in wiki/decisions/ locking the structural decision
- Findings in agents.output/architecture/<plan-id>-<slug>-architecture-findings.md
pidex-planner then reads the ADR + findings as mandatory input.
```

For wiki hygiene / project memory maintenance routes, the team prompt must include:

```
OPENING AGENT: pidex-wiki-hygienist
This is a wiki hygiene / project memory maintenance task.
Do not run /pdwiki or scripts/wiki/hygiene.py from the orchestrator before invoking the specialist.
Invoke pidex-wiki-hygienist as the opening agent and instruct it to run the deterministic read-only audit itself:
python3 <pidex-root>/scripts/wiki/hygiene.py audit --project <project-root>
pidex-wiki-hygienist MUST start read-only, run the audit, write a prioritized report/cleanup plan, and MUST NOT mutate <project-root>/pidex/** except the deterministic audit state file <project-root>/pidex/state/wiki-hygiene.json. It must not create agents.wiki.*. It must not mutate wiki files unless the user approves an explicit apply plan; future apply scope is <project-root>/wiki/** only. If the user asked to execute/apply hygiene, pidex-wiki-hygienist must create a separate execution report at <project-root>/agents.output/wiki-hygiene/<timestamp>-execution-report.md and must not overwrite the deterministic audit report. After audit/report-only wiki hygiene completes, provide a useful brief (score, counts, top findings, report path, state path, whether wiki content changed) and ask whether to commit the hygiene state. Suggested commit files must include <project-root>/pidex/state/wiki-hygiene.json only for audit-only runs; never suggest committing agents.output/**.
Canonical wiki path is <project-root>/wiki/.
```

For standard routes, no additional directive — pidex-planner opens as usual.

---

## After confirmation: start the pipeline

The execution mode the user chose at the beginning determines how the pipeline starts.

---

### Background mode

Compose the lead prompt from the template in `<pidex-root>/pidex-instructions.md` Rule 7 and call:

```bash
bash <pidex-root>/scripts/lead/start.sh \
  --prompt "<full prompt with Rules 0-7 reference and the confirmed epic>" \
  --cwd "<project-path>" \
  --teams
```

Report the lead UUID to the user. Then begin monitoring (see "Monitoring" below).

#### Monitoring a running lead (MANDATORY in background mode)

After starting a lead, the orchestrator MUST actively monitor its progress. Do NOT fire-and-forget. The lead runs headless — if it crashes, stalls, or hits an unexpected state, nobody notices unless the orchestrator checks.

**Cadence:**
- First check ~60 seconds after start (verify PID alive, lead log has content)
- Ongoing every 2-3 minutes (lead log growing? new agents.output/ files?)
- After a gate relay: check ~30 seconds later that resume spawned

**Healthy:** PID alive, log growing, new docs appearing, pending-gate.json appears when gate sent.
**Warning:** PID alive but no output for 3+ minutes → tell user. No new docs for 5+ minutes → tell user.
**Failure:** PID gone + no gate + error in log → crash, report to user. PID gone + no gate + normal log → completion, report deliverables. PID gone + gate exists → expected, orchestrator must poll `recv-gate.sh` for the reply (see below).

**Gate-reply polling (when `pending-gate.json` exists):**
```bash
reply=$(bash <pidex-root>/scripts/telegram/recv-gate.sh --wait 60)
if [ -n "$reply" ]; then
    bash <pidex-root>/scripts/relay/handle.sh --text "$reply" --chat-id "$TELEGRAM_CHAT_ID"
fi
```
Loop this after each gate send until the gate clears. If `recv-gate.sh` returns empty, check back on the next monitoring tick. If the user reports "Telegram message does not arrive", relay their chosen option manually: `bash <pidex-root>/scripts/relay/handle.sh --text "pidex!approve" --chat-id "$TELEGRAM_CHAT_ID"`.

**G9 auto-start dev server (orchestrator responsibility):** When a pending gate with `"gate": "G9"` is detected and no dev server is running on the project's default port, the orchestrator MUST start the dev server BEFORE the user tries to open the preview URL. The lead cannot start it — the project's dev server is a foreground process that would block the lead.

Detection and start pattern:
```bash
# Check if the pending gate is G9
GATE=$(jq -r '.gate' <pidex-root>/state/pending-gate.json 2>/dev/null)
if [ "$GATE" = "G9" ]; then
    # Extract project cwd from active-lead.id
    LEAD_ID=$(cat <pidex-root>/state/active-lead.id)
    CWD=$(cat <pidex-root>/state/lead-${LEAD_ID}.cwd)

    # Check if dev server already reachable (default ports: 3000 Next/Vite, 5173 Vite, 8080 generic)
    for PORT in 3000 5173 8080; do
        if curl -sS -o /dev/null -w "%{http_code}" "http://localhost:$PORT" --max-time 2 2>/dev/null | grep -q "^[23]"; then
            DEV_UP=1; break
        fi
    done

    # Start dev server if not running. Use npm run dev if present; else pnpm/yarn/bun.
    # IMPORTANT: run the cd inside a subshell so the orchestrator's persistent
    # Bash tool cwd is NOT affected — otherwise hook-based notifications will
    # keep showing the project basename (e.g. "pidex-test") long after RC ends.
    if [ -z "$DEV_UP" ] && [ -f "$CWD/package.json" ]; then
        (cd "$CWD" && nohup npm run dev > /tmp/pidex-dev-${LEAD_ID}.log 2>&1 &)
        # Give it up to 20s to come up, then report URL to user
    fi
fi
```

Report the working URL to the user (they'll already see the Telegram gate). Kill the dev server after G9 resolves (approve or reject routes on).

**Reporting:** Concise one-liners at milestones (plan written, impl started, gate sent, pipeline complete, crash with log excerpt).

**Real-time progress:** Tail `<cwd>/agents.output/.progress.jsonl` for doc-written events. The keepalive watchdog appends one JSON line each time a new file appears under agents.output/. Use `tail -f` from a separate check or `jq` over the last N lines to surface what the lead wrote most recently — this bypasses --print output buffering.

**Stall auto-kill:** Since keepalive v2, the lead is automatically SIGTERMed if no new agents.output/ file appears for 600s AND no gate is pending. Look for `keepalive_stall_kill` in pidex.log to confirm. No manual intervention needed for common hang cases.

**Do NOT** during background monitoring: interrupt the lead, modify project files, kill the lead prematurely, start a second lead.

#### Status and control (background mode)

- **Status:** `bash <pidex-root>/scripts/lead/status.sh`
- **Stop:** `bash <pidex-root>/scripts/lead/stop.sh` (add `--force` if needed)
- **Replace:** `bash <pidex-root>/scripts/lead/start.sh --replace --prompt "..." --cwd "..." --teams`

---

### Direct mode

In direct mode, YOU (the orchestrator session) are the lead. You drive the pipeline yourself by invoking the pidex-* agents as subagents in this session. No headless process, no scripts, no Telegram relay — everything is visible to the user in real-time.

#### How to drive the pipeline

After the user confirms the epic, proceed as follows. Apply Rule 4 (auto-proceed) throughout — do not ask the user for confirmation at non-gate transitions.

**1. Preparation (for fresh projects only)**

If the epic includes project scaffolding (onboarding flow), create the directory and initialize PIDEX runtime/metadata directories before invoking any pidex-* agent:

```bash
mkdir -p <project-path>/agents.output <project-path>/pidex/state <project-path>/pidex/rules <project-path>/pidex/config <project-path>/pidex/prompts
printf '\n# PIDEX / agent runtime artifacts\nagents.output/\n.wiki-migration/\n' >> <project-path>/.gitignore
echo 0 > <project-path>/agents.output/.next-id
```

If `.gitignore` already exists, append only missing entries. `agents.output/**` must remain ignored/uncommitted; durable `pidex/` metadata is not ignored by default.

Do not copy agent files into the project. Use bundled agents from `<pidex-root>/agents/` through `pidex_agent`. Then `cd` into the project (or pass the project path as `cwd` to every `pidex_agent` call).

Append a history entry so this run shows up in the next `/pidex`/`/pd` Step 0 shortlist, and emit an analytics-only pipeline lifecycle event for the dashboard:

```bash
bash <pidex-root>/scripts/history/append.sh \
  --event direct-start \
  --cwd "<absolute project path>" \
  --mode direct \
  --epic "<confirmed epic, first 200 chars on one line>"

cd "<absolute project path>" && bash <pidex-root>/scripts/pipeline/event.sh \
  --plan "<plan-key-or-initial-id>" \
  --event pipeline_started \
  --status running \
  --actor orchestrator \
  --message "Started direct-mode pipeline"
```

`pipeline/event.sh` is analytics-only. It writes JSONL under `<pidex-root>/state/pipeline-events/`; it does not drive a backend scheduler. Operators never pass SQLite `project_id`; ingest derives that from `project_path` (default `$PWD`).

After the pipeline completes (step 9 / post-retro handoffs) or if the user aborts it, append closing history and lifecycle events:

```bash
bash <pidex-root>/scripts/history/append.sh \
  --event direct-complete \
  --cwd "<absolute project path>" \
  --mode direct

cd "<absolute project path>" && bash <pidex-root>/scripts/pipeline/event.sh \
  --plan "<plan-key>" \
  --event pipeline_completed \
  --status completed \
  --actor orchestrator \
  --message "Direct-mode pipeline complete"
```

Terminal lifecycle events (`pipeline_completed`, `pipeline_failed`, `pipeline_aborted`, `pipeline_cancelled`) automatically run plan-scoped PDQ quality cadence unless `PIDEX_AUTO_PDQ=0` is set. The auto hook updates `state/quality/review-state.json`, writes report files, and appends `OpQualityReview`; failures are fail-soft and must not block terminal event recording.

(Use `--event direct-abort` with `--reason "<why>"` and `pipeline_aborted --status aborted` if the user stopped it mid-pipeline.)

**1b. pidex_agent routing (MANDATORY before every agent spawn)**

Use the `pidex_agent` tool for every specialist handoff. Do **not** use legacy `dispatch.sh` in normal direct mode; `pidex_agent` already honors `<pidex-root>/config/agents.json`, routes to Pi/Codex/Claude/Gemini as configured, stores raw child logs under `state/runs/`, and validates ROUTING/context files.

Before each spawn:

1. Build compact context pack with `spawn-with-budget.sh` when available; otherwise create a compact manual pack and mark `CONTEXT-PACK-MANUAL: helper unavailable`.
2. Emit `pipeline_stage_started` with `scripts/pipeline/event.sh` (`--actor <pidex-agent>`, `--status running`).
3. Pass complete task context to `pidex_agent`: project cwd, current epic/plan, relevant artifact paths, expected output path, gate/ROUTING expectations, and the mandatory `PROJECT BOUNDARY` block from `<pidex-root>/rules/orchestrator/project-boundary-write-guard.md`.
4. Set `cwd` to the project root (or lane worktree for implementer lanes). The `cwd` must be inside the allowed write root unless the lane worktree is explicitly declared for the same project pipeline.
5. After return, parse the final `<!-- ROUTING -->` block. The authoritative artifact path field is `context_file:`.
6. Emit `pipeline_stage_completed` with the route/verdict summary in `--message` or `--metadata-json`; keep pipeline status `running` unless the whole pipeline is waiting/blocked. Reserve `--status completed` for `pipeline_completed`.
7. If the route blocks on user/orchestrator, emit `pipeline_waiting` or `pipeline_blocked`; if `pidex_agent` reports missing ROUTING or invalid `context_file`, treat as stall/format failure and recover per section 4b.

Minimal call shape:

```text
pidex_agent(
  agent=<pidex-agent>,
  cwd=<project-root>,
  task=<compact context pack + PROJECT BOUNDARY block + precise objective + expected output path + routing rules>
)
```

Provider overrides are exceptional debugging tools only. Prefer config-driven routing.

**2. Pipeline sequence**

**Context-pack enforcement:** before each `pidex_agent` call, prefer `spawn-with-budget.sh` if it exists and pass the emitted pack path/content in the task briefing. If the helper is unavailable, create a compact manual pack instead and mark `CONTEXT-PACK-MANUAL: helper unavailable`. Budget warnings are non-blocking by default; use `--hard` only when needed and the helper exists.

**Legacy plan migration:** when resuming an active plan that lacks `Execution Profile`, `Skipped Agents`, or `Retro Mode`, read `<pidex-root>/rules/orchestrator/legacy-plan-profile-migration.md`. Prefer a small pidex-planner revision before implementation; if late-stage, run conservative full path and brief `LEGACY-PROFILE-SKIP: no skips honored`.

Default direct-mode route graph:

**Execution Profile handling (conservative):** after `pidex-critic` approves, read the approved plan's `Execution Profile`, `Skipped Agents`, `Retro Mode`, and critic `Execution Profile Assessment`. You may honor skipped agents only when all are true:
1. plan explicitly lists the skip in `Skipped Agents`,
2. pidex-critic verdict is `APPROVED` or `APPROVED_WITH_COMMENTS`,
3. critique has no unresolved Critical/Major finding against the skip/profile,
4. no mandatory trigger contradicts the skip (UI-heavy → designer, API/user input → security, product code → QA, UI/G9 → UAT/browser evidence, full-retro trigger → retrospective/pidex-pi),
5. you record the skip reason in your running notes or next agent briefing.

If uncertain, ignore the skip and run the conservative default route. Never skip `pidex-qa` for product code; only downgrade/shorten based on profile if plan+critic explicitly allow it. This guidance does not override agent ROUTING blocks for rejection/failure loops.

| Step | Agent / Gate | Route rule |
|---|---|---|
| 0W | `pidex-wiki-hygienist` | Specialist opening route for wiki hygiene / project memory maintenance. Orchestrator must not run `/pdwiki` or the hygiene script itself for this route; it invokes `pidex-wiki-hygienist`, and the specialist runs the deterministic audit. Wiki hygiene must never mutate `<project-root>/pidex/**` except audit/cadence state at `<project-root>/pidex/state/wiki-hygiene.json`. Audit/report-only runs must end with a brief and ask whether to commit the hygiene state. If user approves commit, orchestrator owns the commit: stage `pidex/state/wiki-hygiene.json` (use `git add -f pidex/state/wiki-hygiene.json` if ignored), never stage `agents.output/**`, then commit with a `chore(wiki): record hygiene audit`-style message. `COMPLETE` routes to user or orchestrator; cleanup implementation is not automatic. |
| 1 | `pidex-planner` | Epic → implementation-ready plan. `COMPLETE` routes to `pidex-critic`; `BLOCKED` routes to `pidex-analyst`, `pidex-architect`, or user depending on reason. |
| 2 | `pidex-critic` | `APPROVED*` + UI-heavy/frontend scope → `pidex-designer` unless approved profile explicitly permits skip; `APPROVED*` + no UI or approved designer skip → `pidex-implementer`; `REJECTED` → `pidex-planner` (G1). |
| 2.5 | `pidex-designer` | UI plans only. `APPROVED*` → `pidex-implementer`; `REJECTED` → `pidex-planner`. |
| 3 | `pidex-implementer` | `COMPLETE` → `pidex-code-reviewer`; `BLOCKED` → `pidex-planner`, `pidex-analyst`, or user based on blocker. |
| 4 | `pidex-code-reviewer` | `APPROVED*` → `pidex-security` by default; direct `pidex-qa` only when Security Scope Assessment and approved Execution Profile both say skip. `REJECTED` → `pidex-implementer` or `pidex-architect`. |
| 5 | `pidex-security` | `APPROVED*` → `pidex-qa`; `APPROVED_WITH_CONTROLS` / blocking verdict → `pidex-implementer` or `pidex-planner` (G5 when user decision/risk acceptance needed). |
| 6 | `pidex-qa` | `COMPLETE` → `pidex-uat`; `FAILED` → `pidex-implementer` (G2); browser-smoke `BLOCKED` → orchestrator collects Playwright evidence and appends QA doc; infra/spec `BLOCKED` → `pidex-planner` or user. |
| 7 | `pidex-uat` | `APPROVED` + `gate: G9` → G9 preview then `pidex-devops`; `APPROVED` + `gate: none` / G9 not applicable → `pidex-devops` directly; `REJECTED` → `pidex-implementer` or `pidex-planner` (G3). |
| 7.5 | G9 Preview | Orchestrator starts dev server when applicable, asks user to approve/reject visual preview. Reject loops to `pidex-implementer`. UAT-era preview does not replace post-devops UI preview before G4. |
| 8 | `pidex-devops` | Stage 1 local commit → if UI involved/uncertain, orchestrator post-devops G9 preview before G4; if non-UI, G4 directly. Stage 2 push/local/hold/abort → `pidex-retrospective` only when Retro Mode is `full` or mandatory full-retro trigger exists; otherwise record `Retro Mode Closure` in deployment/final summary and continue according to plan. |
| 9 | `pidex-retrospective` | `COMPLETE` → `pidex-pi`, with optional `post_retro_handoffs`; skip only when approved Retro Mode is `none`/`mini` and no mandatory trigger occurred. |
| 10 | `pidex-pi` | `COMPLETE`/`DEFERRED`/`REJECTED` → `pidex-roadmap`. |
| 11 | `pidex-roadmap` | Post-pipeline update → orchestrator with G10 next-epic decision. |

Optional early agents:

- `pidex-analyst` — unknown APIs, unverified assumptions, RCA gaps.
- `pidex-architect` — structural/core architecture decisions.
- `pidex-wiki-hygienist` — wiki hygiene, project memory/wiki organization, duplicate/stale wiki files, broken wiki links. Use directly for those tasks rather than routing through `pidex-planner`.

Parallel implementer lanes are optional, not default. Use them only when the plan has explicit spawn/lane markers and slice independence is clear. Otherwise use sequential implementer spawns following the plan's `Spawn` annotations.

**Parallel pidex_agent safety:** When emitting multiple `pidex_agent` calls in the same assistant turn (parallel implementer lanes, configured secondary review lanes, or post-retro handoffs), pass explicit `provider`, `model`, and `effort` for every secondary call. Do not rely on default routing in same-turn parallel calls. Never force `provider=pi` while leaving a delegate model alias such as `sonnet`/`opus`; if overriding to Pi, use a Pi-qualified model from config defaults (for example `openai-codex/gpt-5.3-codex`).

**Automatic configured parallel secondary review lanes:** PIDEX optional parallel agents are configured in `<pidex-root>/config/parallel-agents.json` and are orchestrator-owned. If global config, the agent container, and a provider/model entry are enabled, the orchestrator MUST automatically launch matching secondary lanes for these triggers unless the user explicitly requested a minimal/cheap/single-lane run:
- `after-plan` → with the primary `pidex-critic` lane, launch enabled secondary `pidex-critic` lanes.
- `after-implementation` → with the primary `pidex-code-reviewer` lane, launch enabled secondary `pidex-code-reviewer` lanes.

Before spawning `pidex-critic` or `pidex-code-reviewer`, run:
```bash
node <pidex-root>/scripts/parallel-agents/status.mjs eligible --agent <agent> --trigger <trigger> --json
```
If `.lanes[]` is non-empty, launch the primary lane and every eligible secondary lane as separate visible `pidex_agent` calls in the same assistant turn. `pidex_agent` itself must not spawn nested agents.

Lane launch rules:
- Primary: call `pidex_agent` normally using configured primary routing from `<pidex-root>/config/agents.json`.
- Secondary: call the same `agent` with explicit `provider`, `model`, and `effort` from `status.mjs eligible`. Use `runner_provider` and `runner_model` when present; these map Pi-auth provider/model IDs like DeepSeek/Minimax to `provider=pi`, `model=<provider>/<model>`. Do not pass unsupported direct providers such as `deepseek` or `minimax` to `pidex_agent`.
- Each lane must receive a unique expected output path; never let secondaries write the primary artifact.
- Secondary failure is advisory and non-blocking. Record it with `status.mjs warn --lane <lane_id> --message <short reason>` and continue.
- Secondary success should be recorded with `status.mjs success --lane <lane_id> --message success` after its output/ROUTING is verified.

Secondary artifact suffixes:
- `agents.output/critic/<id>-<slug>-critique.<provider>.<model-slug>.md`
- `agents.output/code-review/<id>-<slug>-code-review.<provider>.<model-slug>.md`

Secondary lane brief requirements:
```text
This is a configured secondary review lane for PIDEX parallel agents.
Lane: <lane_id>.
Do not overwrite the primary artifact.
Write only the assigned secondary artifact file.
Do not write any other path: no `wiki/open-items.md`, `wiki/**`, roadmap docs, source files, rules, configs, primary artifacts, temp helper files, or extra outputs.
If you find deferred/non-blocking work, include it as a candidate in the assigned artifact; the merge/adjudication step decides whether to write follow-ups elsewhere.
Do not implement changes.
Do not invent findings.
Every finding must include file path, line/range if possible, risk, evidence, and proposed fix.
If no concrete findings exist, write NO_FINDINGS.
Return a valid ROUTING block with context_file pointing to the secondary artifact.
```

After all lanes return, read every returned `context_file`, deduplicate findings, and write a required merge/adjudication summary before continuing. Suggested path: `agents.output/parallel-agents/<id>-<slug>-<agent>-merge.md`. Classification values: `confirmed-by-multiple-lanes`, `primary-only`, `secondary-only`, `duplicate`, `contradicted`, `no-evidence`. Disposition values: `accepted`, `rejected-no-evidence`, `duplicate`, `deferred`, `needs-primary-review`.

For agents with configured parallel lanes, do **not** send user/Telegram gate notifications from the primary lane result. Wait until every secondary lane has completed/timed out and the merge/adjudication summary exists. If the merged decision has a gate, notify/ask the user using the merge summary as the `context_file`, not the primary artifact.

Initial policy: advisory execution plus mandatory merge summary. Continue when primary approves and no secondary has concrete High/Critical evidence. Route to `pidex-implementer` or ask for primary-reviewer adjudication when a secondary reports High/Critical with concrete file/path/evidence. Record secondary timeout/failure/malformed ROUTING in the merge summary and continue with the primary result during rollout.

Skip secondary lanes when the primary gate already failed clearly, the diff is docs/changelog/version-only, no product diff exists, or the user requested a minimal/cheap/single-lane run.

Before `pidex-security` or `pidex-qa` on JS/TS scopes, include the Fallow requirement in the brief:
- `pidex-security`: read `<pidex-root>/rules/pidex-security/fallow-structural-signal.md`; record fallow evidence or `FALLOW-SKIP`.
- `pidex-qa`: read `<pidex-root>/rules/pidex-qa/fallow-static-audit-gate.md`; do not emit QA COMPLETE without fallow evidence or `FALLOW-SKIP`.

After every agent return, trust the final `<!-- ROUTING -->` block over prose. Read `verdict`, `route_to`, `gate`, `reason`, and `context_file`; verify `context_file` exists before proceeding. `route_to: orchestrator` means deterministic internal work for this orchestrator session, not a user gate. If ROUTING contradicts an approved Execution Profile skip, treat it as a routing inconsistency: do not silently override; either follow conservative route or re-run/ask the emitting agent to resolve the contradiction. Special case: `pidex-qa` with `reason` containing `browser smoke BLOCKED` routes to orchestrator action, not user decision.

**Post-devops UI preview before G4 (mandatory):** Load `<pidex-root>/rules/orchestrator/post-devops-ui-preview-gate.md` when `pidex-devops` Stage 1 completes or before any G4. If any included plan has `User Preview Requirement` with `UI involved: yes`, `Preview required before G4: yes`, visible UI/browser changes, or uncertainty, do NOT ask `push/local/hold/abort` yet. Start preview from committed local HEAD, show URL/routes/screens to user, ask `approve/reject` as G9. On approve, mark/brief `User Preview Before G4: APPROVED`, then ask G4 directly or re-invoke `pidex-devops` for Stage 2 with that approval context. On reject, record `MANDATORY-RETRO-TRIGGER: G9 rejection` and route to `pidex-implementer`.

**3. Gate handling in direct mode**

When an agent reaches a gate (G1-G9), it will report the situation in its output. In direct mode, first send a best-effort notify-only Telegram alert when configured:

```bash
bash <pidex-root>/scripts/telegram/notify.sh \
  --project "<project-cwd>" \
  --needs "<gate/user decision needed>" \
  --context "<short summary: what happened, URL if preview, options to answer in Pi>" \
  --optional || true
```

This notification is informational only: no buttons, no reply handling, no `pending-gate.json`. The user still answers in the Pi session.

- **G1-G3, G5 (rejection/failure gates):** Present the agent's findings to the user directly in the terminal and ask for their decision.
- **G4 (release push):** Before asking, enforce post-devops UI preview: if UI involved/uncertain and preview before G4 is not approved, start G9 preview first. Only after approved preview ask the user in the terminal: "Ready to tag and release? push / local / hold / abort"
- **G7 (agent instruction change):** Show the proposed changes and ask for approval in the terminal.
- **G8 (destructive ops):** Ask for explicit confirmation before proceeding.
- **G9 (preview verification):** Triggered either after pidex-uat approves with `gate: G9` or after pidex-devops Stage 1 for UI-involved work before G4. The orchestrator (you) starts the dev server/preview server, determines the accessible URL, and asks the user to verify visually. Only proceed after the user says "approve". On "reject", ask what's wrong, record a scoped `MANDATORY-RETRO-TRIGGER: G9 rejection`, load `<pidex-root>/rules/orchestrator/g9-rejection-playwright-repro.md`, capture a G9 Rejection Repro Contract, and loop back to pidex-implementer. Before asking G9 again for the same flow, require live Playwright evidence from QA or orchestrator that reproduces the exact rejected browser flow and now passes. After a second rejection in the same plan, or for navigation/runtime/API-auth/browser-only issues, the orchestrator must run Playwright evidence directly when tooling is available before another broad loop. Skip G9 only for non-UI projects without a dev server (pure libraries, CLI tools). If pidex-uat emits `gate: G9` but the plan says G9 is not applicable or no dev server exists, treat it as routing inconsistency; do not start fake preview. Route to devops with documented correction or ask pidex-uat to resolve. Kill the dev server after G9 resolves.

The agents' instructions include "If running via pidex, call send-gate.sh" — in direct mode, ignore that branch. The agents will fall through to their interactive-mode behavior (report to user directly).

**4. Auto-proceed discipline**

Between agents, do NOT ask the user "should I continue to pidex-critic now?" — just proceed. Rule 4 applies identically in direct mode. The only difference is that the user CAN see you proceeding and CAN interrupt if they want to. But do not invite interruptions.

**4b. Stall detection + auto-recovery (MANDATORY after every Agent-tool return)**

After every `pidex_agent` return, the orchestrator MUST perform a rate-limit pre-check and then a 3-step stall check BEFORE treating the result as complete.

**Pre-check: Rate-limit abort detection (check FIRST, before the 3-step stall check)** — PROC-NEW-12

Inspect the `pidex_agent` result telemetry (`exitCode`, `durationMs`, `turnCount`, `maxTurns`, `timedOut`, `turnLimitHit`, `stderr`, `finalText`) and output doc mtime:

- If no child turns executed (`turnCount: 0` or no output events) AND (output doc is unmodified OR file doesn't exist yet) AND the return contains a provider-side rate-limit/auth message like `You've hit your limit · resets HH:MM` OR returned within <60s with no content:
  → Classify as **RATE_LIMIT_ABORT** — the agent was rejected by the API BEFORE running, not stalled mid-run.
  → Action: wait for the reset time indicated (or 60s if unknown), then re-spawn with the IDENTICAL brief and pre-created skeleton. No tighter brief needed. No skeleton changes needed (none was consumed).
  → Do NOT count this against the 3-strike escalation rule — the agent had no agency in the failure.
  → After 2 consecutive RATE_LIMIT_ABORTs, notify the user: rate-limit window may be extended; consider manual pause.
  → Skip the 3-step stall check below — the agent simply didn't run.

- If no child turns executed BUT no rate-limit message + `durationMs < 5000`: unusual empty return — fall through to stall check as "No ROUTING + empty doc" (genuine start-of-turn stall).

**Empirical basis**: Plan 25 Spawn A attempt 1 returned `tool_uses: 0` with Anthropic rate-limit message `You've hit your limit · resets 1:30pm`. Orchestrator recovered ad-hoc — this pre-check formalizes it.

**3-step stall check** (if pre-check did not trigger):

1. **ROUTING presence check**: grep the Agent return message for `<!-- ROUTING`. If absent → **stall detected** (per Rule 9c two-phase, even a draft ROUTING should appear within first ~5 tool_uses; total absence means agent was cut off before first Edit or before draft emission).

2. **Doc-completeness check**: `grep -c "_pending_\|_(pending)_" <output-doc-path>`. If the count is >50% of the skeleton's initial pending count → **partial stall** (agent started filling but was cut off mid-work).

3. **Commit-delta check** (for pidex-implementer spawns only): `git log --oneline <start-commit>..HEAD` since the spawn began. If implementer's ROUTING says COMPLETE but expected slice commits are missing → **commit-only stall** (agent finished work but did not persist to git).

**Recovery pattern (per stall type):**

| Stall type | Recovery action |
|-----------|----------------|
| No ROUTING + empty doc | Re-spawn with pre-created skeleton + hyper-targeted brief (max 3 files to read, "first action: Edit"). Use the 3rd-time-is-the-charm pattern validated in Plans 23+24. |
| No ROUTING + partial doc | Re-spawn "continuation" agent with brief "finalize sections X, Y, Z then emit ROUTING" — reference the partial doc explicitly. |
| ROUTING present but uncommitted code (implementer) | Re-spawn "commit-only finalization" agent: brief `git status` → commit named slices → final ROUTING. No new code. |
| Repeated stalls (3+ spawns same stage) | **PROC-NEW-10 orchestrator-direct fallback**: run the commands yourself (Vitest / Playwright / git) and author the doc from evidence. Only when agent-based recovery fails repeatedly. Document as orchestrator-direct in the doc's Reviewer line. |

**Telemetry in `pidex_agent` responses**: use `turnLimitHit`, `timedOut`, `turnCount`, `maxTurns`, and `durationMs`. If `turnLimitHit=true` or `turnCount >= maxTurns`, treat any abrupt mid-sentence return as a maxTurns cutoff even if ROUTING is present. Verify the last edit is not mid-section.

**Empirical basis**: 8 of 12 subagent spawns in Plan 24 (67%) stalled on maxTurns cutoff with no ROUTING. Orchestrator recovered 7/8 via fresh spawn with tighter brief + 1 via PROC-NEW-10 fallback. Rule 9c draft-ROUTING (post-Plan-24 update) aims to reduce stalls to ~0; this section is the safety net when it fails.

**5. Backward loops (rejection handling)**

When an agent rejects, loop back to the upstream agent automatically:

- **pidex-critic REJECTED** → re-invoke pidex-planner with critique findings → pidex-critic again
- **pidex-code-reviewer REJECTED** → re-invoke pidex-implementer with findings → pidex-code-reviewer again
- **pidex-qa FAILED** → re-invoke pidex-implementer with failing tests → pidex-code-reviewer → pidex-qa again
- **pidex-uat NOT APPROVED** → re-invoke pidex-implementer (implementation gap) or pidex-planner (plan was wrong) based on UAT findings
- **G9 Preview REJECTED** → load `<pidex-root>/rules/orchestrator/g9-rejection-playwright-repro.md`; capture G9 Rejection Repro Contract; re-invoke pidex-implementer with user feedback and exact repro contract → pidex-code-reviewer → pidex-qa with mandatory live Playwright evidence for the rejected flow → pidex-uat → pidex-devops → post-devops G9 before G4 again only after evidence passes

Backward loops auto-proceed just like forward transitions. Track rejection count per agent per plan. On the 3rd rejection for the same reason, stop and ask the user.

**6. After pidex-pi: post-retro handoffs (up to 3, optional, auto-proceed)**

Check the retrospective doc for these sections and invoke the corresponding agents. Run in parallel if multiple apply. For parallel post-retro handoffs, apply **Parallel pidex_agent safety** above: pass explicit provider/model/effort from config for each handoff.

- **"Planning Insights"** → invoke pidex-planner to capture learnings in wiki (`concepts/` or `decisions/`)
- **"Project Improvement Findings"** → invoke pidex-roadmap to evaluate as future epics/backlog
- **"Architecture Patterns"** → invoke pidex-architect to update `system-architecture.md`

Only invoke agents whose sections have content.

**7. When the pipeline completes**

After the final agent finishes (pidex-pi, post-retro agents, devops with approved Retro Mode `none`/`mini` closure, or G10 roadmap update), summarize what was delivered:
- Files created/modified
- Test count and coverage
- Commits made
- Wiki pages written (if any)
- PI proposals (accepted/rejected/deferred)
- Post-retro handoffs executed (planning insights, project improvements, architecture patterns)

Then load `<pidex-root>/rules/orchestrator/followup-roadmap-suggestion.md` and perform the follow-up closeout scan. Do not merely list follow-ups. Classify them and give an explicit next-action recommendation:
- product/runtime/user-value follow-up → suggest creating/updating a roadmap epic
- cross-cutting cleanup/test/reliability follow-up → suggest a maintenance epic or `wiki/open-items.md`
- PIDEX/process follow-up → suggest `pidex-pi`/rule update path
- already tracked/duplicate → say no new epic needed

Final user prompt must include a compact choice set, for example:
```text
Follow-ups found:
- <item> — class: <class> — source: <path>

Recommendation: create a <roadmap|maintenance> epic for <reason>.
Choose: A) create/update roadmap epic now B) track in wiki/open-items only C) defer/no action D) continue existing roadmap epic
```
If no follow-ups exist, do not stop at a passive summary. Say that no follow-ups were found, then provide a compact next-action choice set with at least: A) show more detail on the next roadmap epic, B) start pre-flight for the next roadmap epic, C) run a quick roadmap/open-work status check, D) stop here. Do not create a new epic without user confirmation.

Every terminal closeout must include a `Choose next:` block. When a roadmap exists, include an option to get more detail on the next epic before starting it.

Then send a best-effort notify-only Telegram completion message when configured:

```bash
bash <pidex-root>/scripts/telegram/notify.sh \
  --project "<project-cwd>" \
  --needs "Pipeline complete" \
  --context "<short final summary: version/mode, key deliverables, next action if any>" \
  --optional || true
```

Also send notify-only Telegram for terminal failure/abort/hold states using `--needs "Pipeline failed"`, `--needs "Pipeline aborted"`, or `--needs "Release held"` with concise context.

**Then cd back to $HOME as the final step.** Claude Code's Bash tool has a persistent shell cwd across tool calls — if you `cd` into the project during monitoring (e.g. to start a dev server or run tests), that cwd sticks. Subsequent hooks (notify.sh, session-end.sh) read `basename "$PWD"` and will label every future notification with the project name (e.g. "[pidex-test]") even after the pipeline ended. Run `cd "$HOME"` explicitly at the end of every RC session — background OR direct mode — so the orchestrator returns to a neutral directory.

---

### Switching modes mid-run

Not supported in v1. If the user started in background mode and wants to switch to direct, they should stop the lead (`lead/stop.sh`) and restart in direct mode. The agents.output/ state from the background run is preserved — a direct-mode run can pick up from where the lead left off by reading the existing docs.
