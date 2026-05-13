# PIDEX baseline scan
source: <home>/running-pi
target: <home>/pidex
timestamp: 2026-05-11T18:24:43Z

## Scope commands run

```bash
rg -n "rp-|runningpi|running-pi|spark|claude|gemini|openrouter" <home>/running-pi
find <home>/running-pi -maxdepth 2 -type d -name '.git'
rg -n "\brp-[a-z]|gpt-5\\.3-codex-spark|gpt-5\\.4-mini|provider:\\s*\"(claude|gemini)\"" <home>/running-pi
```

## legacy-pattern scan

### rg pattern: rp-
count: 1513
<home>/running-pi/config/agents.json:11:    "rp-planner": {
<home>/running-pi/config/agents.json:17:    "rp-architect": {
<home>/running-pi/config/agents.json:23:    "rp-implementer": {
<home>/running-pi/config/agents.json:29:    "rp-code-reviewer": {
<home>/running-pi/config/agents.json:51:    "rp-critic": {
<home>/running-pi/config/agents.json:73:    "rp-security": {
<home>/running-pi/config/agents.json:95:    "rp-qa": {
<home>/running-pi/config/agents.json:101:    "rp-devops": {
<home>/running-pi/config/agents.json:107:    "rp-designer": {
<home>/running-pi/config/agents.json:114:    "rp-uat": {
<home>/running-pi/config/agents.json:120:    "rp-retrospective": {
<home>/running-pi/config/agents.json:126:    "rp-analyst": {
<home>/running-pi/config/agents.json:132:    "rp-roadmap": {
<home>/running-pi/config/agents.json:138:    "rp-pi": {
<home>/running-pi/config/profiles/codex-ultralight.json:4:  "description": "Codex-ultralight quota rescue profile: planner uses Claude Opus for deepest reasoning; all configured rp-* specialist roles use Claude Sonnet so Codex is reserved for the current/orchestrating Pi session only.",
<home>/running-pi/config/profiles/codex-ultralight.json:11:    "rp-analyst": {
<home>/running-pi/config/profiles/codex-ultralight.json:26:    "rp-architect": {
<home>/running-pi/config/profiles/codex-ultralight.json:41:    "rp-planner": {
<home>/running-pi/config/profiles/codex-ultralight.json:56:    "rp-implementer": {
<home>/running-pi/config/profiles/codex-ultralight.json:71:    "rp-qa": {
<home>/running-pi/config/profiles/codex-ultralight.json:86:    "rp-security": {
<home>/running-pi/config/profiles/codex-ultralight.json:113:    "rp-devops": {
<home>/running-pi/config/profiles/codex-ultralight.json:128:    "rp-pi": {
<home>/running-pi/config/profiles/codex-ultralight.json:143:    "rp-code-reviewer": {
<home>/running-pi/config/profiles/codex-ultralight.json:170:    "rp-critic": {
<home>/running-pi/config/profiles/codex-ultralight.json:197:    "rp-designer": {
<home>/running-pi/config/profiles/codex-ultralight.json:213:    "rp-roadmap": {
<home>/running-pi/config/profiles/codex-ultralight.json:228:    "rp-uat": {
<home>/running-pi/config/profiles/codex-ultralight.json:243:    "rp-retrospective": {
<home>/running-pi/config/profiles/codex-heavy.json:4:  "description": "Running Pi rp-* routing and runner-permission policy. All bundled rp-* agents run through provider=pi so each specialist uses an isolated Pi subprocess with consistent tools, logs, metadata, ROUTING validation, and model syntax.",
<home>/running-pi/config/profiles/codex-heavy.json:11:    "rp-analyst": {
<home>/running-pi/config/profiles/codex-heavy.json:18:    "rp-architect": {
<home>/running-pi/config/profiles/codex-heavy.json:25:    "rp-planner": {
<home>/running-pi/config/profiles/codex-heavy.json:32:    "rp-implementer": {
<home>/running-pi/config/profiles/codex-heavy.json:39:    "rp-qa": {
<home>/running-pi/config/profiles/codex-heavy.json:46:    "rp-security": {
<home>/running-pi/config/profiles/codex-heavy.json:60:    "rp-devops": {
<home>/running-pi/config/profiles/codex-heavy.json:67:    "rp-pi": {
<home>/running-pi/config/profiles/codex-heavy.json:74:    "rp-code-reviewer": {
<home>/running-pi/config/profiles/codex-heavy.json:88:    "rp-critic": {
<home>/running-pi/config/profiles/codex-heavy.json:102:    "rp-designer": {
<home>/running-pi/config/profiles/codex-heavy.json:110:    "rp-roadmap": {
<home>/running-pi/config/profiles/codex-heavy.json:117:    "rp-uat": {
<home>/running-pi/config/profiles/codex-heavy.json:124:    "rp-retrospective": {
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:11:    "rp-planner": {
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:17:    "rp-architect": {
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:23:    "rp-implementer": {
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:29:    "rp-code-reviewer": {
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:51:    "rp-critic": {
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:73:    "rp-security": {
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:95:    "rp-qa": {
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:101:    "rp-devops": {
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:107:    "rp-designer": {
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:114:    "rp-uat": {
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:120:    "rp-retrospective": {
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:126:    "rp-analyst": {
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:132:    "rp-roadmap": {
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:138:    "rp-pi": {
<home>/running-pi/config/profiles/deepseek-claude.json:4:  "description": "DeepSeek operator with Claude delegates: same specialist routing as codex-ultralight (rp-planner Claude Opus, other configured rp-* roles Claude Sonnet), but the Pi/operator default model is deepseek/deepseek-v4-flash for non-delegate/fallback operation.",
<home>/running-pi/config/profiles/deepseek-claude.json:11:    "rp-analyst": {
<home>/running-pi/config/profiles/deepseek-claude.json:26:    "rp-architect": {
<home>/running-pi/config/profiles/deepseek-claude.json:41:    "rp-planner": {
<home>/running-pi/config/profiles/deepseek-claude.json:56:    "rp-implementer": {
<home>/running-pi/config/profiles/deepseek-claude.json:71:    "rp-qa": {
<home>/running-pi/config/profiles/deepseek-claude.json:86:    "rp-security": {
<home>/running-pi/config/profiles/deepseek-claude.json:113:    "rp-devops": {
<home>/running-pi/config/profiles/deepseek-claude.json:128:    "rp-pi": {
<home>/running-pi/config/profiles/deepseek-claude.json:143:    "rp-code-reviewer": {
<home>/running-pi/config/profiles/deepseek-claude.json:170:    "rp-critic": {
<home>/running-pi/config/profiles/deepseek-claude.json:197:    "rp-designer": {
<home>/running-pi/config/profiles/deepseek-claude.json:213:    "rp-roadmap": {
<home>/running-pi/config/profiles/deepseek-claude.json:228:    "rp-uat": {
<home>/running-pi/config/profiles/deepseek-claude.json:243:    "rp-retrospective": {
<home>/running-pi/config/profiles/openrouter-heavy.json:11:    "rp-planner": {
<home>/running-pi/config/profiles/openrouter-heavy.json:26:    "rp-architect": {
<home>/running-pi/config/profiles/openrouter-heavy.json:41:    "rp-implementer": {
<home>/running-pi/config/profiles/openrouter-heavy.json:56:    "rp-code-reviewer": {
<home>/running-pi/config/profiles/openrouter-heavy.json:78:    "rp-critic": {
<home>/running-pi/config/profiles/openrouter-heavy.json:100:    "rp-security": {
<home>/running-pi/config/profiles/openrouter-heavy.json:122:    "rp-qa": {
<home>/running-pi/config/profiles/openrouter-heavy.json:137:    "rp-analyst": {
<home>/running-pi/config/profiles/openrouter-heavy.json:152:    "rp-devops": {
<home>/running-pi/config/profiles/openrouter-heavy.json:167:    "rp-designer": {
<home>/running-pi/config/profiles/openrouter-heavy.json:183:    "rp-roadmap": {
<home>/running-pi/config/profiles/openrouter-heavy.json:198:    "rp-uat": {
<home>/running-pi/config/profiles/openrouter-heavy.json:213:    "rp-retrospective": {
<home>/running-pi/config/profiles/openrouter-heavy.json:228:    "rp-pi": {
<home>/running-pi/config/profiles/codex-light.json:11:    "rp-analyst": {
<home>/running-pi/config/profiles/codex-light.json:26:    "rp-architect": {
<home>/running-pi/config/profiles/codex-light.json:41:    "rp-planner": {
<home>/running-pi/config/profiles/codex-light.json:56:    "rp-implementer": {
<home>/running-pi/config/profiles/codex-light.json:62:    "rp-qa": {
<home>/running-pi/config/profiles/codex-light.json:68:    "rp-security": {
<home>/running-pi/config/profiles/codex-light.json:95:    "rp-devops": {
<home>/running-pi/config/profiles/codex-light.json:101:    "rp-pi": {
<home>/running-pi/config/profiles/codex-light.json:107:    "rp-code-reviewer": {
<home>/running-pi/config/profiles/codex-light.json:134:    "rp-critic": {
<home>/running-pi/config/profiles/codex-light.json:161:    "rp-designer": {
<home>/running-pi/config/profiles/codex-light.json:177:    "rp-roadmap": {
<home>/running-pi/config/profiles/codex-light.json:192:    "rp-uat": {
<home>/running-pi/config/profiles/codex-light.json:207:    "rp-retrospective": {
<home>/running-pi/config/profiles/minimax-claude.json:4:  "description": "MiniMax operator with Claude delegates: same specialist routing as codex-ultralight (rp-planner Claude Opus, other configured rp-* roles Claude Sonnet), but the Pi/operator default model is minimax/MiniMax-M2.7 for non-delegate/fallback operation.",
<home>/running-pi/config/profiles/minimax-claude.json:11:    "rp-analyst": {
<home>/running-pi/config/profiles/minimax-claude.json:26:    "rp-architect": {
<home>/running-pi/config/profiles/minimax-claude.json:41:    "rp-planner": {
<home>/running-pi/config/profiles/minimax-claude.json:56:    "rp-implementer": {
<home>/running-pi/config/profiles/minimax-claude.json:71:    "rp-qa": {
<home>/running-pi/config/profiles/minimax-claude.json:86:    "rp-security": {
<home>/running-pi/config/profiles/minimax-claude.json:113:    "rp-devops": {
<home>/running-pi/config/profiles/minimax-claude.json:128:    "rp-pi": {
<home>/running-pi/config/profiles/minimax-claude.json:143:    "rp-code-reviewer": {
<home>/running-pi/config/profiles/minimax-claude.json:170:    "rp-critic": {
<home>/running-pi/config/profiles/minimax-claude.json:197:    "rp-designer": {
<home>/running-pi/config/profiles/minimax-claude.json:213:    "rp-roadmap": {
<home>/running-pi/config/profiles/minimax-claude.json:228:    "rp-uat": {
<home>/running-pi/config/profiles/minimax-claude.json:243:    "rp-retrospective": {
<home>/running-pi/scripts/preview/create-design-snippet.sh:53:    .rp-preview-note {{ font-size:12px; color:#667085; margin-bottom:16px; }}
<home>/running-pi/scripts/preview/create-design-snippet.sh:57:  <div class="rp-preview-note">Running Pi disposable design preview — not production code.</div>
<home>/running-pi/scripts/lead/start.sh:2:# Start a new rp-* pipeline lead session.
<home>/running-pi/scripts/lead/keepalive.sh:37:# 10 minutes is generous — even rp-pi's largest docs write within 5min.
<home>/running-pi/extensions/runningpi-fallow.ts:30:    role: "rp-implementer",
<home>/running-pi/extensions/runningpi-fallow.ts:39:    role: "rp-qa",
<home>/running-pi/extensions/runningpi-fallow.ts:47:    role: "rp-security",
<home>/running-pi/extensions/runningpi-fallow.ts:55:    role: "rp-architect / rp-planner",
<home>/running-pi/extensions/runningpi-fallow.ts:60:    role: "rp-devops",
<home>/running-pi/scripts/watchdog/check-heartbeat.sh:2:# check-heartbeat.sh — watchdog probe for rp-qa heartbeat files.
<home>/running-pi/scripts/analysis/run-pipeline-analysis.sh:111:    'rules/rp-planner/index.md',
<home>/running-pi/scripts/analysis/run-pipeline-analysis.sh:112:    'rules/rp-planner/ui-intent-boundary-parity.md',
<home>/running-pi/scripts/analysis/run-pipeline-analysis.sh:113:    'rules/rp-planner/ui-pattern-source-contract.md',
<home>/running-pi/scripts/analysis/run-pipeline-analysis.sh:114:    'rules/rp-planner/user-preview-requirement.md',
<home>/running-pi/scripts/analysis/run-pipeline-analysis.sh:115:    'rules/rp-uat/index.md',
<home>/running-pi/scripts/analysis/run-pipeline-analysis.sh:116:    'rules/rp-uat/semantic-ui-fit.md',
<home>/running-pi/scripts/analysis/run-pipeline-analysis.sh:117:    'rules/rp-uat/ui-evidence-before-g9.md',
<home>/running-pi/scripts/analysis/run-pipeline-analysis.sh:118:    'rules/rp-uat/visual-proof-before-g9.md',
<home>/running-pi/scripts/analysis/run-pipeline-analysis.sh:119:    'rules/rp-designer/index.md',
<home>/running-pi/scripts/analysis/run-pipeline-analysis.sh:120:    'rules/rp-designer/design-snippet-preview.md',
<home>/running-pi/scripts/analysis/run-pipeline-analysis.sh:121:    'rules/rp-designer/ui-heavy-required.md',
<home>/running-pi/scripts/analysis/run-pipeline-analysis.sh:122:    'rules/rp-code-reviewer/ui-pattern-parity-review.md',
<home>/running-pi/scripts/analysis/run-pipeline-analysis.sh:123:    'rules/rp-pipeline-analyst-template.md',
<home>/running-pi/scripts/analysis/run-pipeline-analysis.sh:200:prompt = f"""You are rp-pipeline-analyst, an advisory meta-critic for Running Pi pipeline runs.
<home>/running-pi/scripts/delegate/dispatch.sh:4:# Reads <pidex-root>/config/agents.json to route a rp-* agent to a CLI
<home>/running-pi/scripts/delegate/dispatch.sh:9:#     --agent rp-code-reviewer \
<home>/running-pi/scripts/delegate/dispatch.sh:95:PROMPT_FILE=$(mktemp "/tmp/rp-dispatch-prompt-XXXXXX.md")
<home>/running-pi/scripts/delegate/dispatch.sh:146:- Use Running Pi rp-* names and conventions.
<home>/running-pi/scripts/delegate/claude.sh:72:  AUTH_SMOKE_OUT=$(mktemp "/tmp/rp-claude-auth-smoke-XXXXXX.out")
<home>/running-pi/scripts/delegate/claude.sh:73:  AUTH_SMOKE_ERR=$(mktemp "/tmp/rp-claude-auth-smoke-XXXXXX.err")
<home>/running-pi/scripts/delegate/claude.sh:93:AUGMENTED_PROMPT=$(mktemp "/tmp/rp-claude-prompt-XXXXXX.md")
<home>/running-pi/scripts/delegate/claude.sh:94:RAW_RESULT=$(mktemp "/tmp/rp-claude-raw-XXXXXX.md")
<home>/running-pi/scripts/pipeline/event.sh:45:  --actor ACTOR           orchestrator, lead, rp-planner, etc. Defaults to orchestrator.
<home>/running-pi/scripts/delegate/codex.sh:4:# Simplified adaption of forge.ng's codex.sh for the rp-* pipeline.
<home>/running-pi/scripts/delegate/gemini.sh:4:# Simplified adaption of forge.ng's gemini.sh for the rp-* pipeline.
<home>/running-pi/scripts/delegate/gemini.sh:48:AUGMENTED_PROMPT=$(mktemp "/tmp/rp-gemini-prompt-XXXXXX.md")
<home>/running-pi/scripts/delegate/gemini.sh:54:RAW_RESULT=$(mktemp "/tmp/rp-gemini-raw-XXXXXX.md")
<home>/running-pi/extensions/running-pi/index.ts:119:	"rp-analyst",
<home>/running-pi/extensions/running-pi/index.ts:120:	"rp-architect",
<home>/running-pi/extensions/running-pi/index.ts:121:	"rp-planner",
<home>/running-pi/extensions/running-pi/index.ts:122:	"rp-implementer",
<home>/running-pi/extensions/running-pi/index.ts:123:	"rp-qa",
<home>/running-pi/extensions/running-pi/index.ts:124:	"rp-security",
<home>/running-pi/extensions/running-pi/index.ts:125:	"rp-devops",
<home>/running-pi/extensions/running-pi/index.ts:126:	"rp-pi",
<home>/running-pi/extensions/running-pi/index.ts:232:		.replace(/^rp-/, "")
<home>/running-pi/extensions/running-pi/index.ts:289:	if (!/^rp-[a-z0-9-]+\.md$/.test(safeName)) throw new Error(`Invalid rp agent name: ${agentName}`);
<home>/running-pi/extensions/running-pi/index.ts:294:			.filter((f) => f.startsWith("rp-") && f.endsWith(".md"))
<home>/running-pi/extensions/running-pi/index.ts:337:	return `${body}\n\n---\nRunning Pi adapter notes:\n- You are running as ${agentName} through provider '${provider}'.\n- You are a child Running Pi role agent, not the parent orchestrator. Complete only your assigned rp-* role.\n- Do not start or invoke Running Pi recursively. Do not propose subagent fanout unless explicitly requested by the parent task.\n- Use Running Pi rp-* names and conventions.\n- If you need user input, do not block; emit a ROUTING block with the appropriate gate and question for the orchestrator.\n- Write full artifacts to files under the requested agents.output/ or agents.wiki.* path; do not paste full documents into your final response.\n- Final response must be <= ${MAX_AGENT_FINAL_CHARS} characters and contain only: status, output path(s), next agent/route, concise evidence, and the ROUTING HTML comment.\n- Always finish with exactly one ROUTING HTML comment that includes context_file, then stop immediately after it.\n`;
<home>/running-pi/extensions/running-pi/index.ts:1438:	agent: Type.String({ description: "rp-* agent to run, e.g. rp-planner, rp-critic, rp-implementer" }),
<home>/running-pi/extensions/running-pi/index.ts:1483:			"Use the rp_agent tool for specialist handoffs. Keep project artifacts under agents.output/ and agents.wiki.<project>/ using rp-* conventions. Treat the final ROUTING block as authoritative and require context_file to exist. ROUTING route_to may be an rp-* agent, user, or orchestrator for deterministic internal work such as browser-evidence collection.",
<home>/running-pi/extensions/running-pi/index.ts:1484:			"Run the pre-flight interview before invoking rp-planner. If the fixed interview is insufficient, read <pidex-root>/skills/grill-me/SKILL.md and use it to ask one question at a time, with your recommended answer, until the epic is crisp.",
<home>/running-pi/extensions/running-pi/index.ts:1495:		description: "Start the running-pi rp-* software-delivery pipeline (direct-mode MVP).",
<home>/running-pi/extensions/running-pi/index.ts:1507:		description: "Run a bundled rp-* specialist agent through config/agents.json. Defaults to lean Pi subprocesses, with optional Claude/Codex/Gemini CLI delegates for configured agents. Raw child logs are stored outside the parent Pi session.",
<home>/running-pi/extensions/running-pi/index.ts:1508:		promptSnippet: "Run a bundled rp-* specialist agent using Running Pi provider routing from config/agents.json.",
<home>/running-pi/extensions/running-pi/index.ts:1510:			"Use rp_agent for Running Pi specialist handoffs such as rp-planner, rp-critic, rp-implementer, rp-code-reviewer, rp-qa, rp-uat, rp-devops, rp-retrospective, and rp-pi.",
<home>/running-pi/extensions/running-pi/index.ts:1513:			"When using rp_agent, pass complete context in the task, including project cwd, current epic, relevant agents.output paths, expected output file, and required ROUTING behavior. The final ROUTING block must include context_file, not doc. route_to may be an rp-* agent, user, or orchestrator for deterministic internal follow-up.",
<home>/running-pi/extensions/running-pi/index.ts:1514:			"For JS/TS security or QA handoffs, remind rp-security/rp-qa to run the relevant Fallow gate or document FALLOW-SKIP.",
<home>/running-pi/scripts/parallel/auto-lanes.sh:42:python3 - "$LANES_JSON" <<'PY' > /tmp/rp-auto-lanes.$$ 
<home>/running-pi/scripts/parallel/auto-lanes.sh:65:done < /tmp/rp-auto-lanes.$$
<home>/running-pi/scripts/parallel/auto-lanes.sh:66:rm -f /tmp/rp-auto-lanes.$$ 
<home>/running-pi/scripts/telegram/send-gate.sh:2:# Send a rp-* pipeline gate question to Telegram with a custom keyboard.
<home>/running-pi/scripts/parallel/provision-lane.sh:20:  <project-root>/.worktrees/rp-<plan-id>-<lane-id>
<home>/running-pi/scripts/parallel/provision-lane.sh:52:WORKTREE_NAME="rp-${PLAN_ID}-${LANE_ID}"
<home>/running-pi/scripts/evals/check-ui-gates.sh:27:require_file "rules/rp-qa/browser-level-smoke.md"
<home>/running-pi/scripts/evals/check-ui-gates.sh:28:require_file "rules/rp-qa/browser-stall-fallback.md"
<home>/running-pi/scripts/evals/check-ui-gates.sh:29:require_file "rules/rp-planner/ui-pattern-source-contract.md"
<home>/running-pi/scripts/evals/check-ui-gates.sh:30:require_file "rules/rp-critic/ui-quality-contract-check.md"
<home>/running-pi/scripts/evals/check-ui-gates.sh:31:require_file "rules/rp-designer/ui-heavy-required.md"
<home>/running-pi/scripts/evals/check-ui-gates.sh:32:require_file "rules/rp-uat/ui-evidence-before-g9.md"
<home>/running-pi/scripts/evals/check-ui-gates.sh:33:require_file "rules/rp-uat/visual-proof-before-g9.md"
<home>/running-pi/scripts/evals/check-ui-gates.sh:34:require_file "rules/rp-code-reviewer/ui-pattern-parity-review.md"
<home>/running-pi/scripts/evals/check-ui-gates.sh:35:require_file "rules/rp-planner/ui-screenshot-matrix-contract.md"
<home>/running-pi/scripts/evals/check-ui-gates.sh:36:require_file "rules/rp-planner/mobile-ui-contract.md"
<home>/running-pi/scripts/evals/check-ui-gates.sh:37:require_file "rules/rp-planner/ui-accessibility-baseline.md"
<home>/running-pi/scripts/evals/check-ui-gates.sh:41:require_file "rules/rp-devops/post-stage1-ui-preview-before-g4.md"
<home>/running-pi/scripts/evals/check-ui-gates.sh:42:require_file "rules/rp-planner/user-preview-requirement.md"
<home>/running-pi/scripts/evals/check-ui-gates.sh:43:require_file "rules/rp-qa/visual-proof-sufficiency.md"
<home>/running-pi/scripts/evals/check-ui-gates.sh:44:require_file "rules/rp-qa/dev-host-console-profile.md"
<home>/running-pi/scripts/evals/check-ui-gates.sh:45:require_file "rules/rp-planner/table-ui-copy-contract.md"
<home>/running-pi/scripts/evals/check-ui-gates.sh:46:require_file "rules/rp-critic/ui-intent-proof-contract-check.md"
<home>/running-pi/scripts/evals/check-ui-gates.sh:47:require_file "rules/rp-implementer/shared-ui-primitives-default.md"
<home>/running-pi/scripts/evals/check-ui-gates.sh:67:require_text "rules/rp-qa/browser-level-smoke.md" 'QA MUST NOT emit final `QA COMPLETE` unless browser evidence is present'
<home>/running-pi/scripts/evals/check-ui-gates.sh:68:require_text "rules/rp-qa/browser-stall-fallback.md" 'verdict: BLOCKED'
<home>/running-pi/scripts/evals/check-ui-gates.sh:73:require_text "rules/rp-planner/ui-pattern-source-contract.md" 'Pattern source'
<home>/running-pi/scripts/evals/check-ui-gates.sh:74:require_text "rules/rp-planner/ui-pattern-source-contract.md" 'Screenshot matrix'
<home>/running-pi/scripts/evals/check-ui-gates.sh:75:require_text "rules/rp-critic/ui-quality-contract-check.md" 'Existing pattern parity claimed but no source named'
<home>/running-pi/scripts/evals/check-ui-gates.sh:80:require_text "rules/rp-planner/ui-screenshot-matrix-contract.md" 'Screenshot Matrix'
<home>/running-pi/scripts/evals/check-ui-gates.sh:81:require_text "rules/rp-planner/ui-screenshot-matrix-contract.md" 'Artifact directory'
<home>/running-pi/scripts/evals/check-ui-gates.sh:82:require_text "rules/rp-planner/mobile-ui-contract.md" 'Mobile UI Contract'
<home>/running-pi/scripts/evals/check-ui-gates.sh:83:require_text "rules/rp-planner/mobile-ui-contract.md" 'safe-area'
<home>/running-pi/scripts/evals/check-ui-gates.sh:84:require_text "rules/rp-planner/ui-accessibility-baseline.md" 'Accessibility Baseline'
<home>/running-pi/scripts/evals/check-ui-gates.sh:85:require_text "rules/rp-planner/ui-accessibility-baseline.md" 'Keyboard/focus expectation'
<home>/running-pi/scripts/evals/check-ui-gates.sh:86:require_text "rules/rp-critic/ui-quality-contract-check.md" 'No mobile contract for mobile-relevant'
<home>/running-pi/scripts/evals/check-ui-gates.sh:93:require_text "rules/rp-qa/visual-proof-sufficiency.md" 'Visual Proof Sufficiency'
<home>/running-pi/scripts/evals/check-ui-gates.sh:94:require_text "rules/rp-qa/visual-proof-sufficiency.md" 'target element is inside/outside the intended container'
<home>/running-pi/scripts/evals/check-ui-gates.sh:95:require_text "rules/rp-uat/visual-proof-before-g9.md" 'verify that QA evidence proves the exact visual claim'
<home>/running-pi/scripts/evals/check-ui-gates.sh:96:require_text "rules/rp-qa/dev-host-console-profile.md" 'Browser Console Classification'
<home>/running-pi/scripts/evals/check-ui-gates.sh:97:require_text "rules/rp-planner/table-ui-copy-contract.md" 'Table UI Checklist'
<home>/running-pi/scripts/evals/check-ui-gates.sh:98:require_text "rules/rp-planner/table-ui-copy-contract.md" 'Copy Semantics Contract'
<home>/running-pi/scripts/evals/check-ui-gates.sh:99:require_text "rules/rp-planner/table-ui-copy-contract.md" 'No div-grid substitute'
<home>/running-pi/scripts/evals/check-ui-gates.sh:100:require_text "rules/rp-implementer/shared-ui-primitives-default.md" 'Shared primitive exception'
<home>/running-pi/scripts/evals/check-ui-gates.sh:101:require_text "rules/rp-qa/visual-proof-sufficiency.md" 'Truthfulness fixture audit'
<home>/running-pi/scripts/evals/check-ui-gates.sh:102:require_text "rules/rp-critic/ui-intent-proof-contract-check.md" 'UI Intent Contract'
<home>/running-pi/scripts/evals/check-ui-gates.sh:104:require_text "evals/ui-gates/fixtures/qa-screenshot-without-selector-proof.md" 'expected_rule: rules/rp-qa/visual-proof-sufficiency.md'
<home>/running-pi/scripts/evals/check-ui-gates.sh:105:require_text "evals/ui-gates/fixtures/plan-table-ui-missing-checklist.md" 'expected_rule: rules/rp-planner/table-ui-copy-contract.md'
<home>/running-pi/scripts/evals/check-ui-gates.sh:107:require_text "evals/ui-gates/fixtures/qa-hmr-console-unclassified.md" 'expected_rule: rules/rp-qa/dev-host-console-profile.md'
<home>/running-pi/scripts/evals/check-ui-gates.sh:111:require_text "rules/rp-code-reviewer/ui-pattern-parity-review.md" 'UI Pattern Parity Review'
<home>/running-pi/scripts/evals/check-ui-gates.sh:112:require_text "rules/rp-code-reviewer/ui-pattern-parity-review.md" 'placement in page/shell hierarchy'
<home>/running-pi/scripts/evals/check-ui-gates.sh:113:require_text "evals/ui-gates/fixtures/code-review-ui-parity-missing.md" 'expected_rule: rules/rp-code-reviewer/ui-pattern-parity-review.md'
<home>/running-pi/scripts/evals/check-ui-gates.sh:117:require_text "rules/rp-designer/ui-heavy-required.md" 'For `ui-heavy` plans, rp-designer review is mandatory'
<home>/running-pi/scripts/evals/check-ui-gates.sh:122:require_text "rules/rp-uat/ui-evidence-before-g9.md" 'UAT MUST NOT approve routing to G9 unless the doc chain contains UI browser evidence'
<home>/running-pi/scripts/evals/check-ui-gates.sh:123:require_text "rules/rp-uat/ui-evidence-before-g9.md" 'Designer audit required but missing'
<home>/running-pi/scripts/evals/check-ui-gates.sh:124:require_text "agents/rp-uat.md" 'Gate G9 not applicable/no dev server/no visible UI preview'
<home>/running-pi/scripts/evals/check-ui-gates.sh:127:require_text "skills/runningpi/SKILL.md" 'If rp-uat emits `gate: G9` but the plan says G9 is not applicable'
<home>/running-pi/scripts/evals/check-ui-gates.sh:135:require_text "rules/rp-planner/user-preview-requirement.md" 'Preview required before G4'
<home>/running-pi/scripts/evals/check-ui-gates.sh:137:require_text "rules/rp-devops/post-stage1-ui-preview-before-g4.md" 'route_to: orchestrator'
<home>/running-pi/scripts/evals/check-ui-gates.sh:138:require_text "rules/rp-devops/post-stage1-ui-preview-before-g4.md" 'preview_required_before_g4: yes'
<home>/running-pi/scripts/evals/check-ui-gates.sh:139:require_text "agents/rp-devops.md" 'User Preview Before G4'
<home>/running-pi/scripts/evals/check-ui-gates.sh:146:require_text "rules/rp-uat/g9-port-in-context.md" 'LAN URL'
<home>/running-pi/scripts/smoke-test.sh:33:printf '%s\n' '---' 'Status: test' '---' '' '<!-- ROUTING' 'verdict: COMPLETE' 'route_to: rp-pi' 'reason: fake smoke test' 'context_file: fake.md' '-->'
<home>/running-pi/scripts/smoke-test.sh:51:  --agent rp-designer \
<home>/running-pi/scripts/smoke-test.sh:62:  --agent rp-smoke \
<home>/running-pi/scripts/smoke-test.sh:70:RUNNING_PI_STATE_DIR="$TMP/state" bash "$ROOT/scripts/metrics/summarize.sh" plan-smoke --project /tmp/project | grep -q 'rp-smoke'
<home>/running-pi/scripts/pre-spawn/release-version-check.sh:2:# running-pi — Release version precheck (before rp-devops)
<home>/running-pi/scripts/evals/check-parallel-secondary-lanes.sh:22:for agent in rp-critic rp-code-reviewer rp-security; do
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:4:# Estimates prompt/context size before spawning an rp-* agent.
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:9:#     --agent rp-planner \
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:56:    rp-planner) echo 9000 ;;
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:57:    rp-implementer) echo 8000 ;;
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:58:    rp-qa) echo 8000 ;;
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:59:    rp-security) echo 6500 ;;
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:60:    rp-devops) echo 7000 ;;
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:61:    rp-pi) echo 7000 ;;
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:62:    rp-critic) echo 6500 ;;
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:63:    rp-code-reviewer) echo 6500 ;;
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:64:    rp-designer) echo 6500 ;;
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:65:    rp-roadmap) echo 5000 ;;
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:66:    rp-uat) echo 6000 ;;
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:67:    rp-retrospective) echo 5500 ;;
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:68:    rp-architect) echo 6500 ;;
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:69:    rp-analyst) echo 6500 ;;
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:77:    rp-planner) echo 6200 ;;
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:78:    rp-implementer) echo 5000 ;;
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:79:    rp-qa) echo 5000 ;;
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:80:    rp-security) echo 3000 ;;
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:81:    rp-devops) echo 3500 ;;
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:82:    rp-pi) echo 3600 ;;
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:83:    rp-critic) echo 3000 ;;
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:84:    rp-code-reviewer) echo 2600 ;;
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:85:    rp-designer) echo 3200 ;;
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:86:    rp-roadmap) echo 1600 ;;
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:87:    rp-uat) echo 2600 ;;
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:88:    rp-retrospective) echo 2400 ;;
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:89:    rp-architect) echo 2700 ;;
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:90:    rp-analyst) echo 3200 ;;
<home>/running-pi/scripts/pre-spawn/extract-context-snippet.sh:53:  OUT="/tmp/rp-snippet-${BASE}-$(date +%Y%m%d%H%M%S).md"
<home>/running-pi/scripts/evals/check-execution-profile.sh:27:require_file "rules/rp-planner/execution-profile-contract.md"
<home>/running-pi/scripts/evals/check-execution-profile.sh:28:require_file "rules/rp-critic/execution-profile-safety-check.md"
<home>/running-pi/scripts/evals/check-execution-profile.sh:43:require_file "rules/rp-devops/dirty-tree-triage-report.md"
<home>/running-pi/scripts/evals/check-execution-profile.sh:44:require_file "rules/rp-code-reviewer/boundary-source-of-truth-parity.md"
<home>/running-pi/scripts/evals/check-execution-profile.sh:48:require_text "rules/rp-planner/execution-profile-contract.md" 'Every plan MUST include an `Execution Profile` section'
<home>/running-pi/scripts/evals/check-execution-profile.sh:49:require_text "rules/rp-planner/execution-profile-contract.md" 'This is a declaration contract. Orchestrator behavior remains conservative'
<home>/running-pi/scripts/evals/check-execution-profile.sh:50:require_text "rules/rp-planner/execution-profile-contract.md" 'skip `rp-security`'
<home>/running-pi/scripts/evals/check-execution-profile.sh:51:require_text "rules/rp-planner/execution-profile-contract.md" 'skip `rp-designer`'
<home>/running-pi/scripts/evals/check-execution-profile.sh:55:require_text "rules/rp-critic/execution-profile-safety-check.md" 'UI-heavy work skips `rp-designer`'
<home>/running-pi/scripts/evals/check-execution-profile.sh:56:require_text "rules/rp-critic/execution-profile-safety-check.md" 'API/user input/auth/storage/filesystem/dependency/secrets skips `rp-security`'
<home>/running-pi/scripts/evals/check-execution-profile.sh:57:require_text "rules/rp-critic/execution-profile-safety-check.md" 'Product code skips all QA'
<home>/running-pi/scripts/evals/check-execution-profile.sh:58:require_text "rules/rp-critic/execution-profile-safety-check.md" 'Small docs change uses full pipeline'
<home>/running-pi/scripts/evals/check-execution-profile.sh:59:require_text "agents/rp-critic.md" 'approved designer skip'
<home>/running-pi/scripts/evals/check-execution-profile.sh:60:require_text "agents/rp-code-reviewer.md" 'approved Execution Profile/critic assessment allow security skip'
<home>/running-pi/scripts/evals/check-execution-profile.sh:61:require_text "agents/rp-code-reviewer.md" 'Execution profile diff guard'
<home>/running-pi/scripts/evals/check-execution-profile.sh:62:require_text "rules/rp-code-reviewer/execution-profile-diff-guard.md" 'actual changed files/surfaces against the approved Execution Profile'
<home>/running-pi/scripts/evals/check-execution-profile.sh:63:require_text "rules/rp-devops/execution-profile-diff-guard.md" 'DevOps is the final safety net for fast paths'
<home>/running-pi/scripts/evals/check-execution-profile.sh:64:require_text "rules/rp-devops/execution-profile-diff-guard.md" 'git diff --name-only <base>...HEAD'
<home>/running-pi/scripts/evals/check-execution-profile.sh:65:require_text "rules/rp-devops/execution-profile-diff-guard.md" 'LOW-CONFIDENCE-DIFF-BASE'
<home>/running-pi/scripts/evals/check-execution-profile.sh:66:require_text "agents/rp-devops.md" 'LOW-CONFIDENCE-DIFF-BASE'
<home>/running-pi/scripts/evals/check-execution-profile.sh:67:require_text "agents/rp-devops.md" 'Execution Profile Diff Guard'
<home>/running-pi/scripts/evals/check-execution-profile.sh:68:require_text "rules/rp-devops/dirty-tree-triage-report.md" 'Dirty Tree Triage'
<home>/running-pi/scripts/evals/check-execution-profile.sh:69:require_text "rules/rp-devops/dirty-tree-triage-report.md" 'Do not tag/push when dirty files are present and no triage table exists'
<home>/running-pi/scripts/evals/check-execution-profile.sh:70:require_text "rules/rp-code-reviewer/fallow-evidence.md" 'FALLOW-SKIP: non-JS/TS scope'
<home>/running-pi/scripts/evals/check-execution-profile.sh:71:require_text "rules/rp-code-reviewer/boundary-source-of-truth-parity.md" 'same source of truth'
<home>/running-pi/scripts/evals/check-execution-profile.sh:72:require_text "rules/rp-code-reviewer/boundary-source-of-truth-parity.md" 'intended failure cause'
<home>/running-pi/scripts/evals/check-execution-profile.sh:73:require_text "agents/rp-code-reviewer.md" 'Fallow evidence'
<home>/running-pi/scripts/evals/check-execution-profile.sh:74:require_text "rules/rp-critic/execution-profile-safety-check.md" 'that satisfies the `structural` profile'
<home>/running-pi/scripts/evals/check-execution-profile.sh:78:require_text "extensions/running-pi/index.ts" 'route_to may be an rp-* agent, user, or orchestrator'
<home>/running-pi/scripts/evals/check-execution-profile.sh:80:require_text "agents/rp-devops.md" 'route to `rp-roadmap` by default'
<home>/running-pi/scripts/evals/check-execution-profile.sh:81:require_text "rules/rp-critic/execution-profile-safety-check.md" 'Structural work lacks `rp-architect` profile/path'
<home>/running-pi/scripts/evals/check-execution-profile.sh:82:require_text "rules/rp-critic/execution-profile-safety-check.md" '`ui-small` is valid only for trivial copy/icon/minor layout work'
<home>/running-pi/scripts/evals/check-execution-profile.sh:97:require_text "evals/execution-profile/fixtures/api-user-input-skips-security.md" 'rp-security | YES'
<home>/running-pi/scripts/evals/check-execution-profile.sh:99:require_text "evals/execution-profile/fixtures/ui-heavy-skips-designer.md" 'rp-designer | YES'
<home>/running-pi/scripts/evals/check-execution-profile.sh:103:require_text "evals/execution-profile/fixtures/structural-needs-architect.md" 'rp-architect | YES'
<home>/running-pi/dashboard.backup-20260508-190805/scripts/server.py:245:          MAX(CASE WHEN ar.route_to IN ('rp-roadmap','user') OR ar.verdict = 'Released' OR (ar.agent IN ('rp-devops','rp-roadmap','rp-pi') AND ar.verdict IN ('COMPLETE','APPROVED')) THEN ar.timestamp END) AS completed_at,
<home>/running-pi/dashboard.backup-20260508-190805/scripts/server.py:347:                      AND (ar.agent IN ('rp-devops','rp-roadmap','rp-pi') OR ar.route_to IN ('rp-roadmap','user') OR ar.verdict IN ('Released','COMPLETE'))
<home>/running-pi/dashboard.backup-20260508-190805/scripts/server.py:386:                      MAX(CASE WHEN ar.agent IN ('rp-devops','rp-roadmap','rp-pi') OR ar.route_to IN ('rp-roadmap','user') OR ar.verdict IN ('Released','COMPLETE') THEN ar.timestamp END) AS completed_at,
<home>/running-pi/dashboard.backup-20260508-190805/scripts/server.py:411:                      MAX(CASE WHEN ar.agent IN ('rp-devops','rp-roadmap','rp-pi') OR ar.route_to IN ('rp-roadmap','user') OR ar.verdict IN ('Released','COMPLETE') THEN ar.timestamp END) AS completed_at,
<home>/running-pi/dashboard.backup-20260508-190805/scripts/server.py:478:                      WHERE ar.agent = 'rp-planner' {where}
<home>/running-pi/scripts/pre-spawn/rp-qa-prep.sh:2:# running-pi — rp-qa Pre-Spawn Preparation (PROC-NEW-36e)
<home>/running-pi/scripts/pre-spawn/rp-qa-prep.sh:4:# Collects vitest output and assesses server-need BEFORE spawning rp-qa.
<home>/running-pi/scripts/pre-spawn/rp-qa-prep.sh:8:#   bash <pidex-root>/scripts/pre-spawn/rp-qa-prep.sh \
<home>/running-pi/scripts/pre-spawn/rp-qa-prep.sh:15:#   /tmp/rp-qa-briefing.txt    — ready-to-paste briefing note for rp-qa spawn
<home>/running-pi/scripts/pre-spawn/rp-qa-prep.sh:59:    echo "ERROR: vitest run failed — fix tests before spawning rp-qa" >&2
<home>/running-pi/scripts/pre-spawn/rp-qa-prep.sh:67:  echo "→ ≤100 tests — rp-qa can run vitest itself"
<home>/running-pi/scripts/pre-spawn/rp-qa-prep.sh:109:BRIEFING="/tmp/rp-qa-briefing.txt"
<home>/running-pi/scripts/pre-spawn/rp-qa-prep.sh:111:rp-qa Pre-Spawn Briefing (PROC-NEW-36e)
<home>/running-pi/scripts/pre-spawn/rp-qa-prep.sh:124:── Briefing note for rp-qa spawn ────────────────────────────
<home>/running-pi/scripts/evals/check-pipeline-analysis.sh:13:require_file "rules/rp-pipeline-analyst-template.md"
<home>/running-pi/scripts/evals/check-pipeline-analysis.sh:14:require_text "scripts/analysis/run-pipeline-analysis.sh" "rp-pipeline-analyst"
<home>/running-pi/scripts/evals/check-pipeline-analysis.sh:18:require_text "rules/rp-pipeline-analyst-template.md" "User Intent / Product Fit"
<home>/running-pi/scripts/evals/check-pipeline-analysis.sh:19:require_text "rules/rp-pipeline-analyst-template.md" "Existing Harness Coverage Check"
<home>/running-pi/scripts/evals/check-pipeline-analysis.sh:20:require_text "rules/rp-pipeline-analyst-template.md" "Harness Improvement Candidates"
<home>/running-pi/scripts/evals/check-pipeline-analysis.sh:30:route_to: rp-critic
<home>/running-pi/scripts/pre-spawn/spawn-with-budget.sh:20:    --agent rp-planner \
<home>/running-pi/scripts/pre-spawn/spawn-with-budget.sh:24:    [--budget <tokens>] [--hard] [--out /tmp/rp-context.md]
<home>/running-pi/scripts/pre-spawn/spawn-with-budget.sh:53:  OUT="/tmp/rp-context-${AGENT}-$(date +%Y%m%d%H%M%S).md"
<home>/running-pi/scripts/pre-spawn/spawn-with-budget.sh:61:  if [[ "$f" == /tmp/rp-snippet-* ]] || [[ "$f" == /tmp/*brief* ]] || [[ "$f" == /tmp/*snippet* ]]; then
<home>/running-pi/scripts/pre-spawn/spawn-with-budget.sh:66:    rp-planner)
<home>/running-pi/scripts/pre-spawn/spawn-with-budget.sh:72:    rp-critic)
<home>/running-pi/scripts/pre-spawn/spawn-with-budget.sh:79:    rp-implementer)
<home>/running-pi/scripts/pre-spawn/spawn-with-budget.sh:83:    rp-qa)
<home>/running-pi/scripts/pre-spawn/spawn-with-budget.sh:88:    rp-uat)
<home>/running-pi/scripts/pre-spawn/spawn-with-budget.sh:91:    rp-devops)
<home>/running-pi/prompts/runningpi.md:5:Use direct mode and the bundled rp-* agents.
<home>/running-pi/scripts/evals/check-retro-mode.sh:12:require_file "rules/rp-planner/retro-mode-contract.md"
<home>/running-pi/scripts/evals/check-retro-mode.sh:13:require_file "rules/rp-critic/retro-mode-safety-check.md"
<home>/running-pi/scripts/evals/check-retro-mode.sh:14:require_file "rules/rp-retrospective/retro-mode.md"
<home>/running-pi/scripts/evals/check-retro-mode.sh:23:require_text "rules/rp-planner/retro-mode-contract.md" 'Retro Mode: <none | mini | full>'
<home>/running-pi/scripts/evals/check-retro-mode.sh:24:require_text "rules/rp-planner/retro-mode-contract.md" 'G9 rejection or repeated user-preview loop'
<home>/running-pi/scripts/evals/check-retro-mode.sh:25:require_text "rules/rp-planner/retro-mode-contract.md" '`rp-pi` only when process improvements exist or full retro runs'
<home>/running-pi/scripts/evals/check-retro-mode.sh:28:require_text "rules/rp-critic/retro-mode-safety-check.md" 'G9 rejection scope with `none`/`mini`'
<home>/running-pi/scripts/evals/check-retro-mode.sh:29:require_text "rules/rp-critic/retro-mode-safety-check.md" 'Security/process/multi-agent failure with `none`/`mini`'
<home>/running-pi/scripts/evals/check-retro-mode.sh:30:require_text "rules/rp-critic/retro-mode-safety-check.md" 'two-or-more Major review findings with `none`/`mini`'
<home>/running-pi/scripts/evals/check-retro-mode.sh:31:require_text "rules/rp-critic/retro-mode-safety-check.md" 'Missing Retro Mode'
<home>/running-pi/scripts/evals/check-retro-mode.sh:34:require_text "rules/rp-retrospective/retro-mode.md" 'rp-retrospective should run only for `Retro Mode: full`'
<home>/running-pi/scripts/evals/check-retro-mode.sh:35:require_text "rules/rp-retrospective/retro-mode.md" 'Do not run rp-retrospective'
<home>/running-pi/scripts/evals/check-retro-mode.sh:36:require_text "agents/rp-devops.md" 'Retro Mode Closure'
<home>/running-pi/scripts/evals/check-retro-mode.sh:41:require_text "agents/rp-devops.md" 'UNSCOPED-MANDATORY-RETRO-MARKER'
<home>/running-pi/scripts/evals/check-retro-mode.sh:43:require_text "agents/rp-security.md" 'MANDATORY-RETRO-TRIGGER: security finding'
<home>/running-pi/scripts/evals/check-retro-mode.sh:44:require_text "agents/rp-devops.md" 'search current plan/deployment/UAT/security/QA docs'
<home>/running-pi/scripts/evals/check-retro-mode.sh:45:require_text "agents/rp-devops.md" 'grep relevant pipeline artifact roots'
<home>/running-pi/README.md:20:- **Bundled specialist agents** in `agents/rp-*.md`.
<home>/running-pi/README.md:72:user → /runningpi → orchestrator → rp_agent(rp-planner) → rp_agent(rp-critic) → ... → completion
<home>/running-pi/README.md:130:<pidex-root>/scripts/pipeline/event.sh --plan plan-031 --event pipeline_stage_started --status running --actor rp-planner
<home>/running-pi/README.md:131:<pidex-root>/scripts/pipeline/event.sh --plan plan-031 --event pipeline_stage_completed --status running --actor rp-planner --message "Plan complete; route rp-critic"
<home>/running-pi/README.md:152:- **rp-implementer**: `dead-code --changed-since main --format json`, `dupes --changed-since main --format json`
<home>/running-pi/README.md:153:- **rp-qa**: `audit --changed-since main --gate new-only --format json`
<home>/running-pi/README.md:154:- **rp-security**: `audit --changed-since main --gate new-only --format json` plus `dead-code --changed-since main`
<home>/running-pi/README.md:155:- **rp-architect / rp-planner**: `list --format json`, `flags --format json`
<home>/running-pi/README.md:156:- **rp-devops**: `audit --changed-since main --gate all --format json`
<home>/running-pi/README.md:169:agents/                 Bundled rp-* specialist prompts
<home>/running-pi/scripts/evals/check-analytics.sh:99:python3 dashboard/scripts/ingest.py --db "$TMP_DIR/rp.sqlite" --project <home>/projects/local/forge.ng >/tmp/rp-analytics-ingest.json
<home>/running-pi/scripts/evals/check-design-user-loop.sh:14:require_file "rules/rp-planner/ui-intent-boundary-parity.md"
<home>/running-pi/scripts/evals/check-design-user-loop.sh:15:require_file "rules/rp-uat/semantic-ui-fit.md"
<home>/running-pi/scripts/evals/check-design-user-loop.sh:16:require_file "rules/rp-designer/design-snippet-preview.md"
<home>/running-pi/scripts/evals/check-design-user-loop.sh:24:require_text "rules/rp-planner/index.md" "ui-intent-boundary-parity.md"
<home>/running-pi/scripts/evals/check-design-user-loop.sh:25:require_text "rules/rp-uat/index.md" "semantic-ui-fit.md"
<home>/running-pi/scripts/evals/check-design-user-loop.sh:26:require_text "rules/rp-designer/index.md" "design-snippet-preview.md"
<home>/running-pi/scripts/evals/check-design-user-loop.sh:29:require_text "agents/rp-planner.md" "ui-intent-boundary-parity.md"
<home>/running-pi/scripts/evals/check-design-user-loop.sh:30:require_text "agents/rp-uat.md" "semantic-ui-fit.md"
<home>/running-pi/scripts/evals/check-design-user-loop.sh:31:require_text "agents/rp-designer.md" "design-snippet-preview.md"
<home>/running-pi/scripts/evals/check-design-user-loop.sh:33:require_text "rules/rp-planner/ui-intent-boundary-parity.md" "Forbidden Changes"
<home>/running-pi/scripts/evals/check-design-user-loop.sh:34:require_text "rules/rp-uat/semantic-ui-fit.md" "Potential user surprise"
<home>/running-pi/scripts/evals/check-pipeline-analyst-findings.sh:12:require_file "rules/rp-planner/ui-label-source-contract.md"
<home>/running-pi/scripts/evals/check-pipeline-analyst-findings.sh:13:require_file "rules/rp-planner/binding-id-validation-references.md"
<home>/running-pi/scripts/evals/check-pipeline-analyst-findings.sh:14:require_file "rules/rp-uat/visible-text-semantic-check.md"
<home>/running-pi/scripts/evals/check-pipeline-analyst-findings.sh:15:require_file "rules/rp-critic/enumeration-completeness-check.md"
<home>/running-pi/scripts/evals/check-pipeline-analyst-findings.sh:16:require_file "rules/rp-code-reviewer/tdd-table-narrow-hotfix-escape.md"
<home>/running-pi/scripts/evals/check-pipeline-analyst-findings.sh:18:require_text "rules/rp-planner/index.md" "ui-label-source-contract.md"
<home>/running-pi/scripts/evals/check-pipeline-analyst-findings.sh:19:require_text "rules/rp-planner/index.md" "binding-id-validation-references.md"
<home>/running-pi/scripts/evals/check-pipeline-analyst-findings.sh:20:require_text "rules/rp-uat/index.md" "visible-text-semantic-check.md"
<home>/running-pi/scripts/evals/check-pipeline-analyst-findings.sh:21:require_text "rules/rp-critic/index.md" "enumeration-completeness-check.md"
<home>/running-pi/scripts/evals/check-pipeline-analyst-findings.sh:22:require_text "rules/rp-code-reviewer/index.md" "tdd-table-narrow-hotfix-escape.md"
<home>/running-pi/scripts/evals/check-pipeline-analyst-findings.sh:24:require_text "agents/rp-planner.md" "ui-label-source-contract.md"
<home>/running-pi/scripts/evals/check-pipeline-analyst-findings.sh:25:require_text "agents/rp-planner.md" "binding-id-validation-references.md"
<home>/running-pi/scripts/evals/check-pipeline-analyst-findings.sh:26:require_text "agents/rp-uat.md" "visible-text-semantic-check.md"
<home>/running-pi/scripts/evals/check-pipeline-analyst-findings.sh:27:require_text "agents/rp-code-reviewer.md" "tdd-table-narrow-hotfix-escape.md"
<home>/running-pi/scripts/evals/check-pipeline-analyst-findings.sh:29:require_text "rules/rp-planner/ui-label-source-contract.md" "Source-of-truth field/constant"
<home>/running-pi/scripts/evals/check-pipeline-analyst-findings.sh:30:require_text "rules/rp-planner/binding-id-validation-references.md" "cite binding IDs verbatim"
<home>/running-pi/scripts/evals/check-pipeline-analyst-findings.sh:31:require_text "rules/rp-uat/visible-text-semantic-check.md" "Expected text/source"
<home>/running-pi/scripts/evals/check-pipeline-analyst-findings.sh:32:require_text "rules/rp-critic/enumeration-completeness-check.md" "applies to all"
<home>/running-pi/scripts/evals/check-pipeline-analyst-findings.sh:33:require_text "rules/rp-code-reviewer/tdd-table-narrow-hotfix-escape.md" "N/A — test-only/devops-blocker fix"
<home>/running-pi/agents.wiki.running-pi/open-items.md:6:- M1 | Value statement not user-story form | rp-critic | parallel-lanes-iteration1-locking
<home>/running-pi/agents.wiki.running-pi/open-items.md:7:- M2 | AC4 tests sequential writes only — needs parallel write AC | rp-critic | parallel-lanes-iteration1-locking
<home>/running-pi/agents.wiki.running-pi/open-items.md:8:- M3 | events.jsonl append-event atomicity under parallel access unspecified | rp-critic | parallel-lanes-iteration1-locking
<home>/running-pi/agents.wiki.running-pi/open-items.md:9:- M4 | Slice 3 "low-risk Stellen" undefined — needs explicit file list or explicit zero | rp-critic | parallel-lanes-iteration1-locking
<home>/running-pi/agents.wiki.running-pi/open-items.md:10:- L2 | Empty/malformed lock file behavior unspecified in status/stale logic | rp-critic | parallel-lanes-iteration1-locking
<home>/running-pi/agents/rp-critic.md:2:name: rp-critic
<home>/running-pi/agents/rp-critic.md:3:description: Program-manager-style reviewer in the rp-* pipeline that stress-tests planning documents BEFORE implementation. Use proactively after @agent-rp-planner produces a plan. Assesses value statement, architectural fit, scope, technical debt, unresolved questions. Produces a critique doc with APPROVED / APPROVED_WITH_COMMENTS / REJECTED verdict. After approval, the next logical step is @agent-rp-implementer.
<home>/running-pi/agents/rp-critic.md:13:At task start, read `<pidex-root>/rules/rp-critic/index.md` to load active process rules.
<home>/running-pi/agents/rp-critic.md:14:If a project wiki exists with `agents.wiki.<project>/rules/rp-critic.md`, read that too for project-specific rules.
<home>/running-pi/agents/rp-critic.md:58:- No review code/diff/test/done work (that rp-code-reviewer domain)
<home>/running-pi/agents/rp-critic.md:66:- **`code-review-standards`** — severity level + review criteria; share vocab with rp-code-reviewer for finding classification.
<home>/running-pi/agents/rp-critic.md:93:   - **Ask user explicit**: "This plan has X unresolved open question. Approve for impl with these open, or rp-planner fix first?"
<home>/running-pi/agents/rp-critic.md:124:5. **Reference**: rp-implementer read critique for context
<home>/running-pi/agents/rp-critic.md:126:**Difference from rp-code-reviewer**: rp-critic = BEFORE impl; rp-code-reviewer = AFTER impl.
<home>/running-pi/agents/rp-critic.md:173:route_to: rp-designer | rp-implementer | rp-planner | rp-analyst | user
<home>/running-pi/agents/rp-critic.md:182:- **APPROVED / APPROVED_WITH_COMMENTS + UI-heavy/frontend touched** → `rp-designer` unless Execution Profile Assessment explicitly approves `rp-designer` skip for `ui-small`/trivial UI.
<home>/running-pi/agents/rp-critic.md:183:- **APPROVED / APPROVED_WITH_COMMENTS + no UI/frontend or approved designer skip** → `rp-implementer`.
<home>/running-pi/agents/rp-critic.md:184:- **REJECTED** → `rp-planner`, `gate: G1`.
<home>/running-pi/agents/rp-critic.md:185:- **REJECTED + research gap** → `rp-analyst` first, then planner.
<home>/running-pi/agents/rp-critic.md:198:- **REJECTED** → back to `rp-planner` with critique finding. Planner revise plan, then you re-review.
<home>/running-pi/agents/rp-critic.md:199:- **REJECTED + research gap** → back to `rp-analyst` first, then `rp-planner` revise with analysis result.
<home>/running-pi/evals/execution-profile/fixtures/small-docs-fast-path-allowed.md:3:agent_under_test: rp-critic
<home>/running-pi/evals/execution-profile/fixtures/small-docs-fast-path-allowed.md:5:expected_rule: rules/rp-critic/execution-profile-safety-check.md
<home>/running-pi/evals/execution-profile/fixtures/small-docs-fast-path-allowed.md:18:| rp-security | YES | No security surface. | Docs-only. |
<home>/running-pi/evals/execution-profile/fixtures/small-docs-fast-path-allowed.md:19:| rp-designer | YES | No UI surface. | Docs-only. |
<home>/running-pi/evals/execution-profile/fixtures/small-docs-fast-path-allowed.md:20:| rp-qa | YES | No product behavior. | Documentation diff review enough. |
<home>/running-pi/evals/execution-profile/fixtures/small-docs-fast-path-allowed.md:27:rp-critic may approve. It may add LOW comment if docs need local validation, but this skip set is safe for docs-only scope.
<home>/running-pi/running-pi-instructions.md:9:That line make host Pi session aware of rp-* pipeline when CLAUDE.md load.
<home>/running-pi/running-pi-instructions.md:13:## What is the rp-* pipeline?
<home>/running-pi/running-pi-instructions.md:15:14-agent software-delivery pipeline ported from `vs-code-agents` to Pi subprocess subagent format. Each agent = self-contained Markdown file under `<project>/.claude/agents/rp-*.md`, auto-discovered by Claude Code. Communicate via structured Markdown docs in `agents.output/<category>/`.
<home>/running-pi/running-pi-instructions.md:21:| `rp-roadmap` | Vision, epics, releases, evergreen `product-roadmap.md` | No (no ID, evergreen) |
<home>/running-pi/running-pi-instructions.md:22:| `rp-planner` | Plan creation; reads/increments `agents.output/.next-id` | **Yes** |
<home>/running-pi/running-pi-instructions.md:23:| `rp-analyst` | Investigation/research, may run pre-plan or mid-plan | Sometimes (pre-plan only) |
<home>/running-pi/running-pi-instructions.md:24:| `rp-architect` | Design review + evergreen `system-architecture.md` | No (inherits) |
<home>/running-pi/running-pi-instructions.md:25:| `rp-designer` | Visual design authority + evergreen `DESIGN.md` | No (inherits) |
<home>/running-pi/running-pi-instructions.md:26:| `rp-security` | Security audits | Sometimes (standalone audit only) |
<home>/running-pi/running-pi-instructions.md:27:| `rp-critic` | Plan gate before implementation | No (inherits) |
<home>/running-pi/running-pi-instructions.md:28:| `rp-implementer` | TDD-first code, full RED → GREEN → REFACTOR | No (inherits) |
<home>/running-pi/running-pi-instructions.md:29:| `rp-code-reviewer` | Quality gate after implementation | No (inherits) |
<home>/running-pi/running-pi-instructions.md:30:| `rp-qa` | Test execution + coverage verification | No (inherits) |
<home>/running-pi/running-pi-instructions.md:31:| `rp-uat` | Value validation against the original epic statement | No (inherits) |
<home>/running-pi/running-pi-instructions.md:32:| `rp-devops` | Commit (Stage 1) + push/release (Stage 2) | Per-version |
<home>/running-pi/running-pi-instructions.md:33:| `rp-retrospective` | Lessons learned | No (inherits) |
<home>/running-pi/running-pi-instructions.md:34:| `rp-pi` | Process improvement: writes rules to two-tier rules architecture (`<pidex-root>/rules/<agent>/`) — never edits agent `.md` files directly | No (inherits) |
<home>/running-pi/running-pi-instructions.md:67:├── index.md              — master index (maintained by rp-roadmap)
<home>/running-pi/running-pi-instructions.md:69:├── open-items.md         — deferred findings tracker (rp-critic, rp-code-reviewer write; rp-qa resolves)
<home>/running-pi/running-pi-instructions.md:71:├── concepts/             — distilled knowledge entries (rp-planner writes these)
<home>/running-pi/running-pi-instructions.md:72:├── decisions/            — ADRs, architecture decisions (rp-architect writes these)
<home>/running-pi/running-pi-instructions.md:74:└── retrospectives/       — condensed release retro summaries (rp-retrospective writes these)
<home>/running-pi/running-pi-instructions.md:79:**Initialization:** `rp-planner` create wiki dir on first run. `rp-roadmap` maintain index.
<home>/running-pi/running-pi-instructions.md:112:Every rp-* agent MUST emit routing directive as HTML comment at end of chat output (not in doc file). Gives orchestrator machine-readable signal for next route — no natural language parsing needed.
<home>/running-pi/running-pi-instructions.md:117:route_to: <next agent name, e.g. rp-implementer>
<home>/running-pi/running-pi-instructions.md:126:- `route_to`: Next agent for orchestrator to invoke, or `orchestrator` for deterministic internal work (e.g., collect browser evidence, final closure bookkeeping) that should not ask user yet. For gates = agent to invoke AFTER user responds (e.g., `rp-planner` for G1 revise). Multi-target post-retro: comma-separate: `rp-planner, rp-roadmap`.
<home>/running-pi/running-pi-instructions.md:137:route_to: rp-implementer
<home>/running-pi/running-pi-instructions.md:147:route_to: rp-implementer
<home>/running-pi/running-pi-instructions.md:157:route_to: rp-implementer
<home>/running-pi/running-pi-instructions.md:168:route_to: rp-pi
<home>/running-pi/running-pi-instructions.md:170:post_retro_handoffs: rp-planner, rp-roadmap
<home>/running-pi/running-pi-instructions.md:184:- **Direct mode:** Orchestrator session itself drive pipeline by invoking rp-* agents as subagents. Gates in terminal. No headless lead is required; emit analytics-only lifecycle events with `<pidex-root>/scripts/pipeline/event.sh` so the dashboard can distinguish real running pipelines from legacy unresolved metric groups.
<home>/running-pi/running-pi-instructions.md:253:**Rule of thumb:** only `rp-planner` (always), `rp-analyst` (pre-plan only), and `rp-security` (standalone only) touch `.next-id`. Everyone else INHERITS plan's ID/Origin/UUID. Evergreen docs (roadmap, architecture) and deployment/v<X.Y.Z>.md carry no plan ID.
<home>/running-pi/running-pi-instructions.md:259:**Rule of thumb:** terminal-status docs (Committed / Released / Abandoned / Deferred / Superseded) move to `agents.output/<category>/closed/`. `rp-planner` close plan docs post-commit, `rp-devops` close plan+impl+review+qa+uat post-commit, `rp-pi` close retros. `rp-roadmap` run global sweep.
<home>/running-pi/running-pi-instructions.md:274:| **Structural** (migration, base-change, monorepo restructure, runtime/framework swap) | `rp-architect` (produces ADR + findings) | `rp-planner` reads the ADR as mandatory input |
<home>/running-pi/running-pi-instructions.md:275:| **Cross-cutting large** (3+ layers, new end-to-end contract) | `rp-architect` (produces ADR + findings) | `rp-planner` reads the ADR as mandatory input |
<home>/running-pi/running-pi-instructions.md:276:| **Standard feature** | `rp-planner` | `rp-critic` |
<home>/running-pi/running-pi-instructions.md:277:| **Bugfix / maintenance** | `rp-planner` (or `rp-analyst` if root cause unclear) | `rp-critic` |
<home>/running-pi/running-pi-instructions.md:279:If team prompt include `OPENING AGENT: rp-architect`, lead start with rp-architect, only route to rp-planner after ADR written. Otherwise lead start with rp-planner.
<home>/running-pi/running-pi-instructions.md:295:2. Run `rp-implementer` per lane with lane worktree as cwd.
<home>/running-pi/running-pi-instructions.md:307:**Execution Profile handling (conservative):** After `rp-critic` approves, lead MUST read the approved plan's `Execution Profile`, `Skipped Agents`, `Retro Mode`, and critique `Execution Profile Assessment`. Lead MAY honor skips only when plan explicitly lists the skip, critic approved it without unresolved Critical/Major profile findings, and no mandatory trigger contradicts it. If uncertain, run the conservative default route. Never skip QA for product code; never skip designer for UI-heavy; never skip security for API/user-input/auth/storage/filesystem/dependency/secrets; never skip UAT/G9 evidence for UI; never skip full retro when G9/security/process/multi-agent failure trigger occurred. Record honored skips in next-agent briefing or lead notes.
<home>/running-pi/running-pi-instructions.md:311:| `rp-architect` (pre-plan, structural) | ADR written in `agents.wiki/decisions/`, findings in `agents.output/architecture/` | `rp-planner` |
<home>/running-pi/running-pi-instructions.md:312:| `rp-roadmap` | Epic defined, user approved initial request | `rp-planner` (or `rp-architect` for structural tasks — see opening-agent table above) |
<home>/running-pi/running-pi-instructions.md:313:| `rp-planner` | Plan doc written, no unresolved OPEN QUESTIONs | `rp-critic` |
<home>/running-pi/running-pi-instructions.md:314:| `rp-critic` APPROVED / APPROVED_WITH_COMMENTS | Critique doc written | `rp-designer` for UI-heavy/frontend unless approved Execution Profile explicitly permits skip; otherwise `rp-implementer` |
<home>/running-pi/running-pi-instructions.md:315:| `rp-designer` APPROVED / APPROVED_WITH_COMMENTS | Design review doc written | `rp-implementer` |
<home>/running-pi/running-pi-instructions.md:316:| `rp-implementer` | Impl doc written, tests green, TDD table filled | `rp-code-reviewer` |
<home>/running-pi/running-pi-instructions.md:317:| `rp-code-reviewer` APPROVED / APPROVED_WITH_COMMENTS | Review doc written | `rp-security` by default; `rp-qa` only when code-review Security Scope Assessment and approved Execution Profile both allow security skip |
<home>/running-pi/running-pi-instructions.md:318:| `rp-security` APPROVED / APPROVED_WITH_COMMENTS | Security review doc written | `rp-qa` |
<home>/running-pi/running-pi-instructions.md:319:| `rp-qa` COMPLETE | QA doc written, all tests pass | `rp-uat` |
<home>/running-pi/running-pi-instructions.md:320:| `rp-qa` BLOCKED with browser smoke BLOCKED | QA partial doc written | **Orchestrator collects Playwright evidence**, appends QA doc, then routes to `rp-uat` or `rp-implementer` based on evidence |
<home>/running-pi/running-pi-instructions.md:321:| `rp-uat` APPROVED FOR RELEASE + `gate: G9` | UAT verdict delivered, G9 required | **Orchestrator: Preview Gate (G9)** |
<home>/running-pi/running-pi-instructions.md:322:| `rp-uat` APPROVED FOR RELEASE + `gate: none` / G9 not applicable | UAT verdict delivered, no browser preview needed | `rp-devops` |
<home>/running-pi/running-pi-instructions.md:323:| Preview Gate approved | User confirmed preview works | `rp-devops` (Stage 1); still run post-devops UI preview before G4 when UI involved |
<home>/running-pi/running-pi-instructions.md:324:| `rp-devops` Stage 1 complete + UI involved/uncertain | Local commit, docs closed | **Orchestrator: post-devops Preview Gate (G9)** before G4 |
<home>/running-pi/running-pi-instructions.md:325:| `rp-devops` Stage 1 complete + non-UI | Local commit, docs closed | `rp-devops` Stage 2 (Gate G4) |
<home>/running-pi/running-pi-instructions.md:326:| `rp-devops` Stage 2 resolved | push/local/hold/abort answered | `rp-retrospective` only when Retro Mode is `full` or mandatory full-retro trigger occurred; otherwise follow mini/none closure |
<home>/running-pi/running-pi-instructions.md:327:| `rp-retrospective` | Retrospective doc written | `rp-pi` |
<home>/running-pi/running-pi-instructions.md:328:| `rp-pi` | PI analysis written | `rp-roadmap` (update) |
<home>/running-pi/running-pi-instructions.md:329:| `rp-roadmap` (update) | Epic marked Delivered, roadmap updated | **Orchestrator: Token log (Rule 7c) → Next Epic Gate (G10)** |
<home>/running-pi/running-pi-instructions.md:330:| `rp-implementer` TDD RED verified | Test file created, failure confirmed | continue to GREEN (write impl) |
<home>/running-pi/running-pi-instructions.md:331:| `rp-implementer` TDD GREEN verified | Test passes | continue to next function or REFACTOR |
<home>/running-pi/running-pi-instructions.md:333:If agent body explicitly say "ask the user" (e.g., rp-devops Stage 2 confirmation, rp-security unclear mode), honor it — registered Gate (see Rule 5). But **do not invent new gates.** "Should I proceed to rp-critic now?" not a Gate. Answer always yes.
<home>/running-pi/running-pi-instructions.md:339:| `rp-critic` REJECTED | Plan inadequate | `rp-planner` (revise) | `rp-critic` |
<home>/running-pi/running-pi-instructions.md:340:| `rp-code-reviewer` REJECTED | Code quality issues | `rp-implementer` (fix) | `rp-code-reviewer` |
<home>/running-pi/running-pi-instructions.md:341:| `rp-security` APPROVED_WITH_CONTROLS | Security controls required | `rp-implementer` (fix) | `rp-code-reviewer` → `rp-security` |
<home>/running-pi/running-pi-instructions.md:342:| `rp-qa` FAILED | Test failures / coverage gaps | `rp-implementer` (fix) | `rp-code-reviewer` → `rp-security` → `rp-qa` |
<home>/running-pi/running-pi-instructions.md:343:| `rp-uat` NOT APPROVED | Value not delivered | `rp-implementer` (fix) or `rp-planner` (re-plan) | depends on root cause |
<home>/running-pi/running-pi-instructions.md:344:| G9 Preview REJECTED | Visual/UX issue | `rp-implementer` (fix) | `rp-code-reviewer` → `rp-security` → `rp-qa` → `rp-uat` → `rp-devops` → post-devops G9 before G4 |
<home>/running-pi/running-pi-instructions.md:350:**Post-retro handoffs (up to 3, all optional, all auto-proceed).** After rp-pi complete, orchestrator check retrospective doc for three finding categories, invoke corresponding agents:
<home>/running-pi/running-pi-instructions.md:354:| "Planning Insights" | `rp-planner` | Capture learnings in wiki (`concepts/` or `decisions/`) to improve future plans |
<home>/running-pi/running-pi-instructions.md:355:| "Project Improvement Findings" | `rp-roadmap` | Evaluate whether findings warrant new epics or backlog entries |
<home>/running-pi/running-pi-instructions.md:356:| "Architecture Patterns" | `rp-architect` | Update the evergreen `system-architecture.md` |
<home>/running-pi/running-pi-instructions.md:360:**G9 applicability contradiction:** If `rp-uat` emits `gate: G9` but the plan declares G9 not applicable or the project has no dev server/browser preview surface, treat it as routing inconsistency. Do not start fake preview. Either route to `rp-devops` with documented correction when evidence is clear, or ask/re-run `rp-uat` to resolve the contradiction.
<home>/running-pi/running-pi-instructions.md:362:**Post-devops UI preview before G4:** Load `rules/orchestrator/post-devops-ui-preview-gate.md` after `rp-devops` Stage 1 and before any G4. If any included plan is UI-involved or uncertain, G4 is blocked until user approves a preview from committed local HEAD. QA/UAT browser evidence and any earlier UAT-era G9 do not replace this release-preview gate. On approve, record/brief `User Preview Before G4: APPROVED`, then ask G4 directly or re-invoke `rp-devops` for Stage 2 with that approval context.
<home>/running-pi/running-pi-instructions.md:364:**Retro Mode controls local/hold/abort closure.** Local-only, held, or aborted releases do NOT automatically force `rp-retrospective`/`rp-pi`. If approved Retro Mode is `full` or any mandatory full-retro trigger occurred (G9 rejection, security finding, process finding, multi-agent failure, user escalation), run `rp-retrospective` → `rp-pi`. If Retro Mode is `mini`/`none` and no mandatory trigger occurred, `rp-devops`/orchestrator records `Retro Mode Closure` in deployment/final summary, skips full retrospective, then still runs final bookkeeping: roadmap/release tracker update when needed, token log when applicable, final summary, and G10/next-epic decision when roadmap has open work.
<home>/running-pi/running-pi-instructions.md:372:| **G1** | Plan rejected | `rp-critic` REJECTED | Critique verdict is REJECTED | Confirm revision direction or abort epic |
<home>/running-pi/running-pi-instructions.md:373:| **G2** | QA failed with regression | `rp-qa` QA Failed | Tests fail or coverage gap | Continue fix loop vs. abort |
<home>/running-pi/running-pi-instructions.md:374:| **G3** | UAT not approved | `rp-uat` NOT APPROVED | Value drift detected | Revise plan vs. escalate vs. accept partial |
<home>/running-pi/running-pi-instructions.md:375:| **G4** | Release push | `rp-devops` Stage 2 | All plans for version committed, and UI-involved work has approved post-devops G9 preview | "push" / "local" / "hold" / "abort" |
<home>/running-pi/running-pi-instructions.md:376:| **G5** | Security blocked | `rp-security` REJECTED or BLOCKED_PENDING_REMEDIATION | Fundamental security flaw | Rework plan or accept risk |
<home>/running-pi/running-pi-instructions.md:378:| **G7** | Agent instruction change | `rp-pi` proposing updates to rules files (`<pidex-root>/rules/<agent>/`) | Self-modification request | Approve/reject the proposed diff |
<home>/running-pi/running-pi-instructions.md:380:| **G9** | Preview verification | Orchestrator (not an agent) | rp-uat APPROVED FOR RELEASE on a project with a dev server, OR rp-devops Stage 1 complete for UI-involved work before G4 | "approve" / "reject" |
<home>/running-pi/running-pi-instructions.md:381:| **G10** | Next epic | Orchestrator (after rp-roadmap update) | Pipeline complete, roadmap has remaining open epics | "next" (start next epic) / "stop" (end pipeline) / pick specific epic |
<home>/running-pi/running-pi-instructions.md:389:- "rp-devops is ready to push v0.1.0 to main. Confirm?" — **G4, real gate**
<home>/running-pi/running-pi-instructions.md:391:- "rp-pi proposes changing rp-uat's permissionMode. Confirm?" — **G7, real gate**
<home>/running-pi/running-pi-instructions.md:423:**G9 — Preview verification** (after rp-uat APPROVED FOR RELEASE with `gate: G9`, or after rp-devops Stage 1 when UI preview is required before G4, dev/preview server started):
<home>/running-pi/running-pi-instructions.md:436:**G4 — Release push** (after rp-devops Stage 1 commit):
<home>/running-pi/running-pi-instructions.md:476:Standard way to start rp-* pipeline = via running-pi. Orchestrator call:
<home>/running-pi/running-pi-instructions.md:489:**Template location:** `<pidex-root>/templates/lead-prompt.md`. Orchestrator read this file, substitute `<rp-planner | rp-architect>` (per opening-agent table in Rule 4) and `<epic statement>`, pass result as `--prompt`. Do NOT inline different prompt — template encode load-bearing rules (team formation, opening agent, gate routing, deadlock prevention) matching Rules 1, 4, 5, and 6.
<home>/running-pi/running-pi-instructions.md:492:- Explicit team formation with all 12 teammates listed (not "start with rp-planner, then delegate")
<home>/running-pi/running-pi-instructions.md:499:- "Starte mit rp-planner. Originiere Plan-ID 6." — reads as sequential delegation, not team formation. Lead fall back to classic subagent mode, Rule 1 not exercised.
<home>/running-pi/running-pi-instructions.md:515:**Trigger:** After G10 (Next Epic Gate) — after rp-roadmap update complete and pipeline cycle fully done. Run once per completed plan, not after each agent.
<home>/running-pi/running-pi-instructions.md:535:**Do NOT run this:** mid-pipeline, before G10, or if pipeline aborted before rp-pi completed. Partial runs produce misleading per-agent numbers.
<home>/running-pi/running-pi-instructions.md:542:**File:** `agents.output/.checkpoint.md` (overwritten each time). Minimum fields: Plan id+slug, Last agent, Last verdict, Next agent, Gate pending, Timestamp, Rejection-loop count. `rp-devops` delete it after Stage 1 commit.
<home>/running-pi/running-pi-instructions.md:551:When invoking any rp-* subagent, provide ONLY path to agent's **primary input doc** — the one it cannot self-locate without hint. Do NOT pre-load reference docs on agent's behalf.
<home>/running-pi/running-pi-instructions.md:559:| rp-critic | plan doc path | architecture, critique templates |
<home>/running-pi/running-pi-instructions.md:560:| rp-designer | plan doc path | design templates (agent loads these) |
<home>/running-pi/running-pi-instructions.md:561:| rp-implementer | plan doc path + critique doc path | architecture, ADR, concept pages (agent reads these itself) |
<home>/running-pi/running-pi-instructions.md:562:| rp-code-reviewer | implementation doc path | plan, critique, design review, architecture |
<home>/running-pi/running-pi-instructions.md:563:| rp-security | implementation doc path | plan, code review doc |
<home>/running-pi/running-pi-instructions.md:564:| rp-qa | QA doc path + **pre-collected vitest output** (mandatory on projects >100 tests, PROC-NEW-36e) + **server-need flag** (see rp-qa spawn checklist below) | plan, implementation doc, architecture |
<home>/running-pi/running-pi-instructions.md:565:| rp-uat | UAT doc path + implementation summary | plan, test results, architecture |
<home>/running-pi/running-pi-instructions.md:566:| rp-devops | implementation doc path + version target | plan, QA, UAT docs |
<home>/running-pi/running-pi-instructions.md:567:| rp-retrospective | deployment doc path + plan doc path | all other pipeline docs |
<home>/running-pi/running-pi-instructions.md:568:| rp-pi | retrospective doc path | all other pipeline docs |
<home>/running-pi/running-pi-instructions.md:572:Before every rp-* spawn, run:
<home>/running-pi/running-pi-instructions.md:576:  --agent <rp-agent> \
<home>/running-pi/running-pi-instructions.md:588:**rp-qa spawn checklist (mandatory before every rp-qa spawn):**
<home>/running-pi/running-pi-instructions.md:590:On any project with >100 tests, the orchestrator **MUST call rp-qa-prep.sh** before spawning rp-qa. This is no longer SHOULD — Plan 52 demonstrated that letting rp-qa run vitest inline can hang the pipeline for 1h45m with no visibility (root cause: no heartbeat, no timeout, no watchdog).
<home>/running-pi/running-pi-instructions.md:592:1. **Pre-collect vitest output**: `npx vitest run --reporter=verbose 2>&1 > /tmp/vitest-output.txt` — pass path in briefing. Never let rp-qa run vitest itself on projects >100 tests (takes 100s+ and burns budget before any doc write).
<home>/running-pi/running-pi-instructions.md:594:3. **Shortcut script**: `bash <pidex-root>/scripts/pre-spawn/rp-qa-prep.sh --project-dir <path>` runs steps 1+2 automatically and prints the briefing note to paste.
<home>/running-pi/running-pi-instructions.md:596:**Stop-and-fix on pre-collection failure**: if `rp-qa-prep.sh` fails or returns non-zero, the orchestrator MUST **stop and resolve the failure** before spawning rp-qa. Do NOT fall back to inline vitest execution. Surface the failure to the user, fix the root cause (missing dependency, build break, vitest config error), then retry pre-collection. Inline vitest as fallback re-introduces the Plan 52 hang risk and is forbidden.
<home>/running-pi/running-pi-instructions.md:598:**Watchdog flow when rp-qa runs vitest inline (rare — only when no pre-collected output)**:
<home>/running-pi/running-pi-instructions.md:600:When rp-qa is spawned without a `vitest-output:` briefing line, rp-qa writes a heartbeat to `/tmp/rp-qa-<timestamp>.heartbeat` (start event before vitest, periodic `vitest-running` updates every 30s, done event after). The orchestrator's responsibility:
<home>/running-pi/running-pi-instructions.md:602:1. **Capture heartbeat path** from rp-qa's chat output or QA doc `## Heartbeat` section.
<home>/running-pi/running-pi-instructions.md:612:   rp-qa watchdog: <STALE|MISSING> heartbeat
<home>/running-pi/running-pi-instructions.md:614:   File: /tmp/rp-qa-<timestamp>.heartbeat
<home>/running-pi/running-pi-instructions.md:617:   Action: kill rp-qa? (G8 — destructive op, requires explicit yes)
<home>/running-pi/running-pi-instructions.md:619:   Killing the rp-qa subagent is a Gate G8 destructive operation — requires explicit user confirmation per call.
<home>/running-pi/running-pi-instructions.md:620:5. **On FRESH (exit 0)**: if heartbeat's last phase is `vitest-running` (not `vitest-done`), schedule another wakeup. If `vitest-done`, the watchdog cycle ends — rp-qa will return on its own.
<home>/running-pi/running-pi-instructions.md:622:In **direct mode** (no `ScheduleWakeup`), the orchestrator may either run the watchdog probe manually before each user-visible action, or accept the risk and rely on rp-qa's own `maxTurns` ceiling. Background mode is the recommended path for long-running QA.
<home>/running-pi/running-pi-instructions.md:628:Before spawning any rp-* agent that produce output doc (rp-critic, rp-implementer, rp-code-reviewer, rp-qa, rp-uat, rp-security, rp-designer, rp-retrospective, rp-pi), orchestrator SHOULD pre-create agent's output doc with:
<home>/running-pi/running-pi-instructions.md:663:**Empirical basis:** Plan 16 (2026-04-21) had 5 subagent stalls (rp-implementer 4x, rp-code-reviewer 1x) before orchestrator applied Rules 9a+9b mid-run. All subsequent agents (rp-security, rp-qa, rp-uat, rp-devops, rp-retrospective, rp-pi) completed without stalls. Pattern causally linked to budget exhaustion before Write.
<home>/running-pi/running-pi-instructions.md:667:**Rule:** every rp-* agent emit ROUTING twice: (1) **draft** within first ~5 tool_uses (right after first substantive Edit) with `verdict: IN_PROGRESS`, and (2) **final** block as second-to-last action with authoritative verdict. Orchestrator treat LAST `<!-- ROUTING -->` in chat output as authoritative — final overrides draft. Draft guarantee routing signal even on mid-turn budget cutoff.
<home>/running-pi/running-pi-instructions.md:675:### 9d — rp-devops version preflight (mandatory)
<home>/running-pi/running-pi-instructions.md:677:Before spawning `rp-devops`, validate version target:
<home>/running-pi/running-pi-instructions.md:683:If validation fails, do not spawn `rp-devops`. Resolve version at G4 first.
<home>/running-pi/running-pi-instructions.md:710:Agents live under `<project>/.claude/agents/rp-*.md`, copied there by `<pidex-root>/install.sh`. If missing, re-run install.sh with same target project.
<home>/running-pi/running-pi-instructions.md:716:Canonical instructions file for rp-* pipeline as shipped by running-pi. Project-specific rules (e.g., "use vitest in this project", "deployment target is Netlify") belong in project's own CLAUDE.md, NOT here.
<home>/running-pi/package.json:4:  "description": "Pi package for the rp-* software-delivery agent pipeline, ported from running-claude.",
<home>/running-pi/evals/execution-profile/fixtures/standard-feature-profile.md:3:agent_under_test: rp-critic
<home>/running-pi/evals/execution-profile/fixtures/standard-feature-profile.md:5:expected_rule: rules/rp-critic/execution-profile-safety-check.md
<home>/running-pi/evals/execution-profile/fixtures/standard-feature-profile.md:24:rp-critic may approve profile. No unsafe skips.
<home>/running-pi/agents/rp-implementer.md:2:name: rp-implementer
<home>/running-pi/agents/rp-implementer.md:3:description: Execution-focused coding agent in the rp-* pipeline. Implements approved plans with strict TDD-first discipline — writes failing tests before implementation, minimal code to pass, refactors. Use proactively after @agent-rp-critic approves a plan. After completion, the next logical step is @agent-rp-code-reviewer for the quality gate.
<home>/running-pi/agents/rp-implementer.md:13:At task start, read `<pidex-root>/rules/rp-implementer/index.md` to load active process rules.
<home>/running-pi/agents/rp-implementer.md:14:If a project wiki exists with `agents.wiki.<project>/rules/rp-implementer.md`, read that too for project-specific rules.
<home>/running-pi/agents/rp-implementer.md:139:3. **Release-prep slices** (CHANGELOG, version bump): CHANGELOG entry is the FIRST file written. → See `<pidex-root>/rules/rp-implementer/changelog-ordering.md`
<home>/running-pi/agents/rp-implementer.md:164:`maxTurns` × ~1.75 = approximate tool-call ceiling. If plan has more slices than budget supports, emit `verdict: BLOCKED, route_to: rp-planner, reason: plan exceeds single-turn budget, suggest sub-plan split` BEFORE starting Slice 0.
<home>/running-pi/agents/rp-implementer.md:170:→ See `<pidex-root>/rules/rp-implementer/stall-recovery.md`
<home>/running-pi/agents/rp-implementer.md:179:**Non-stall example**: all slices done, doc filled → emit `verdict: COMPLETE, route_to: rp-code-reviewer`.
<home>/running-pi/agents/rp-implementer.md:187:5. Read design review if exists. Check "Must-Fix Before Commit" FIRST. → See `<pidex-root>/rules/rp-implementer/design-review-must-fix.md`
<home>/running-pi/agents/rp-implementer.md:190:8. **Uncertainty Guardrail (bugfixes)**: Plan without verified root cause = speculative fix. Prefer verifiable changes (tests), reduced blast radius, improved diagnosability. Speculative behavior change? STOP and request clarification from rp-planner.
<home>/running-pi/agents/rp-implementer.md:202:16. Invoke rp-analyst when hitting unknown APIs or unverified assumptions — don't guess.
<home>/running-pi/agents/rp-implementer.md:204:18. **Wiki log**: On complete, append one-liner to `agents.wiki.<project-name>/log.md`: `` `YYYY-MM-DD` — rp-implementer: Plan <ID> <slug> implementation complete (<test count> tests green) ``.
<home>/running-pi/agents/rp-implementer.md:312:route_to: rp-code-reviewer | rp-planner | rp-analyst | user
<home>/running-pi/agents/rp-implementer.md:320:- **COMPLETE** → `rp-code-reviewer` only when final slice committed, tests green, TDD table complete, value statement validated.
<home>/running-pi/agents/rp-implementer.md:321:- **BLOCKED + plan ambiguity/scope too large** → `rp-planner`.
<home>/running-pi/agents/rp-implementer.md:322:- **BLOCKED + unknown API/root cause** → `rp-analyst`.
<home>/running-pi/agents/rp-implementer.md:324:- **FAILED verification after code changes** → `rp-planner` if plan/spec issue; `user` if environment/access issue.
<home>/running-pi/agents/rp-implementer.md:334:- **From rp-code-reviewer REJECTED**: Read findings, fix specific issues, re-run tests, update impl doc with revision entry. Fix surgically — not from scratch. **Fix loop scope cap (PROC-NEW-14)**: → See `<pidex-root>/rules/rp-implementer/fix-loop-scope-cap.md`
<home>/running-pi/agents/rp-implementer.md:335:- **From rp-qa FAILED**: Read QA doc for failing tests/coverage gaps, fix impl, re-run tests, update impl doc.
<home>/running-pi/agents/rp-implementer.md:336:- **From rp-uat NOT APPROVED**: Read UAT doc for value gaps, fix to deliver stated value, update impl doc.
<home>/running-pi/evals/execution-profile/fixtures/devops-broad-upstream-low-confidence.md:3:agent_under_test: rp-devops
<home>/running-pi/evals/execution-profile/fixtures/devops-broad-upstream-low-confidence.md:5:expected_rule: rules/rp-devops/execution-profile-diff-guard.md
<home>/running-pi/evals/execution-profile/fixtures/devops-broad-upstream-low-confidence.md:13:Skipped Agents: rp-code-reviewer YES, rp-security YES, rp-qa YES.
<home>/running-pi/evals/execution-profile/fixtures/devops-broad-upstream-low-confidence.md:24:rp-devops must mark `LOW-CONFIDENCE-DIFF-BASE` and ask orchestrator for plan start commit or implementation commit list. It must not approve or invalidate skips based only on broad unrelated history.
<home>/running-pi/NOTICE:27:  agents/rp-analyst.md
<home>/running-pi/NOTICE:28:  agents/rp-architect.md
<home>/running-pi/NOTICE:29:  agents/rp-code-reviewer.md
<home>/running-pi/NOTICE:30:  agents/rp-critic.md
<home>/running-pi/NOTICE:31:  agents/rp-devops.md
<home>/running-pi/NOTICE:32:  agents/rp-implementer.md
<home>/running-pi/NOTICE:33:  agents/rp-pi.md
<home>/running-pi/NOTICE:34:  agents/rp-planner.md
<home>/running-pi/NOTICE:35:  agents/rp-qa.md
<home>/running-pi/NOTICE:36:  agents/rp-retrospective.md
<home>/running-pi/NOTICE:37:  agents/rp-roadmap.md
<home>/running-pi/NOTICE:38:  agents/rp-security.md
<home>/running-pi/NOTICE:39:  agents/rp-uat.md
<home>/running-pi/NOTICE:43:Claude Code's native subagent format with the "rp-" prefix. The pipeline
<home>/running-pi/evals/execution-profile/fixtures/devops-xs-docs-product-code-diff.md:3:agent_under_test: rp-devops
<home>/running-pi/evals/execution-profile/fixtures/devops-xs-docs-product-code-diff.md:5:expected_rule: rules/rp-devops/execution-profile-diff-guard.md
<home>/running-pi/evals/execution-profile/fixtures/devops-xs-docs-product-code-diff.md:13:Skipped Agents: rp-code-reviewer YES, rp-security YES, rp-qa YES.
<home>/running-pi/evals/execution-profile/fixtures/devops-xs-docs-product-code-diff.md:23:rp-devops must block Stage 1 commit. Actual diff includes product/API surface, invalidating docs-only skips. Route to missing gates before release.
<home>/running-pi/agents/rp-architect.md:2:name: rp-architect
<home>/running-pi/agents/rp-architect.md:3:description: Architectural coherence specialist in the rp-* pipeline. Owns `agents.output/architecture/system-architecture.md` as evergreen single source of truth. Reviews plans for architectural fit, maintains ADRs, audits technical debt. Use proactively when rp-planner produces a plan that touches core architecture, when technical approach needs validation, or for periodic health audits.
<home>/running-pi/agents/rp-architect.md:13:At task start, read `<pidex-root>/rules/rp-architect/index.md` to load active process rules.
<home>/running-pi/agents/rp-architect.md:14:If a project wiki exists with `agents.wiki.<project>/rules/rp-architect.md`, read that too for project-specific rules.
<home>/running-pi/agents/rp-architect.md:20:- Consult early on arch changes. Collaborate with rp-analyst and rp-qa.
<home>/running-pi/agents/rp-architect.md:64:3. Collaborate with rp-analyst (context, root causes). Consult rp-qa (integration points, failure modes)
<home>/running-pi/agents/rp-architect.md:153:**ADR-creation boundary (PROC-NEW-5 — MANDATORY)**: Do NOT write ADRs unless orchestrator briefing explicitly says "write ADR" or uses `ADR-CANDIDATE`. Unprompted ADR creation burns tool budget and delays downstream agents (Plan 21: 2 unprompted ADRs = 16 extra minutes). When pattern warrants ADR status, tag inline in `system-architecture.md` as `<!-- ADR-CANDIDATE: <one-line description> -->`. rp-pi promotes candidates to full ADRs on next PI pass. Constraint applies even when briefing says "ADRs optional" — treat "optional" as "do not write; tag candidates only."
<home>/running-pi/agents/rp-architect.md:185:route_to: rp-planner | rp-critic | caller | user
<home>/running-pi/agents/rp-architect.md:195:- **APPROVED**: route to `caller` or next requested gate (`rp-planner`/`rp-critic`).
<home>/running-pi/agents/rp-architect.md:196:- **APPROVED_WITH_CHANGES**: route to `rp-planner` to incorporate required changes.
<home>/running-pi/agents/rp-architect.md:197:- **REJECTED**: route to `rp-planner` for rework before re-submission.
<home>/running-pi/evals/execution-profile/fixtures/structural-needs-architect.md:3:agent_under_test: rp-critic
<home>/running-pi/evals/execution-profile/fixtures/structural-needs-architect.md:5:expected_rule: rules/rp-critic/execution-profile-safety-check.md
<home>/running-pi/evals/execution-profile/fixtures/structural-needs-architect.md:18:| rp-architect | YES | Migration is straightforward. | Existing tests cover behavior. |
<home>/running-pi/evals/execution-profile/fixtures/structural-needs-architect.md:26:rp-critic must reject. Runtime swap is structural and requires `rp-architect` path/profile.
<home>/running-pi/agents/rp-pi.md:2:name: rp-pi
<home>/running-pi/agents/rp-pi.md:3:description: Process Improvement specialist in the rp-* pipeline. Analyzes retrospectives and systematically improves agent workflows by updating agent instructions. Use proactively after @agent-rp-retrospective completes a retrospective. Only updates agent .md files and workflow docs — never source code. After improvements applied, the pipeline is complete for this cycle.
<home>/running-pi/agents/rp-pi.md:13:At task start, read `<pidex-root>/rules/rp-pi/index.md` to load active process rules.
<home>/running-pi/agents/rp-pi.md:14:If a project wiki exists with `agents.wiki.<project>/rules/rp-pi.md`, read that too for project-specific rules.
<home>/running-pi/agents/rp-pi.md:72:- Edit: source agent instruction files (`<pidex-root>/agents/rp-*.md`), rules files (`<pidex-root>/rules/<agent>/<rule>.md`), workflow docs (CLAUDE.md, README.md), project-specific rules (`agents.wiki.<project>/rules/<agent>.md`)
<home>/running-pi/agents/rp-pi.md:83:1. Read ONLY `## Findings` table and `## Process Improvement Recommendations` from retrospective doc — no full-file Read, no changelog scan (rp-retrospective already did that work). Use targeted Read with offset/limit or grep to extract just those sections.
<home>/running-pi/agents/rp-pi.md:97:1. Read current agent instructions for affected agents (`agents/rp-*.md` in running-pi; legacy `.claude/agents/rp-*.md` only if project still uses that path)
<home>/running-pi/agents/rp-pi.md:183:8. Apply canonical validation taxonomy in generated validation sections. → See `<pidex-root>/rules/rp-pi/validation-taxonomy.md`.
<home>/running-pi/agents/rp-pi.md:244:After Phase 5 done (or skipped if rejected/deferred), commit all remaining uncommitted pipeline documents. These are docs created AFTER rp-devops' Stage 1 commit — typically retrospective, this PI analysis, and deployment doc (which rp-devops updates during Stage 2).
<home>/running-pi/agents/rp-pi.md:276:route_to: rp-roadmap | user
<home>/running-pi/agents/rp-pi.md:278:post_retro_handoffs: <copied from rp-retrospective routing directive, if any>
<home>/running-pi/agents/rp-pi.md:285:- **COMPLETE / DEFERRED / REJECTED** → `rp-roadmap`; roadmap updates epic status and presents remaining open epics.
<home>/running-pi/evals/execution-profile/fixtures/devops-clean-tree-committed-product-diff.md:3:agent_under_test: rp-devops
<home>/running-pi/evals/execution-profile/fixtures/devops-clean-tree-committed-product-diff.md:5:expected_rule: rules/rp-devops/execution-profile-diff-guard.md
<home>/running-pi/evals/execution-profile/fixtures/devops-clean-tree-committed-product-diff.md:13:Skipped Agents: rp-code-reviewer YES, rp-security YES, rp-qa YES.
<home>/running-pi/evals/execution-profile/fixtures/devops-clean-tree-committed-product-diff.md:27:rp-devops must inspect committed diff range, not only working tree. Block Stage 1 commit/release and route to missing gates.
<home>/running-pi/agents/rp-roadmap.md:2:name: rp-roadmap
<home>/running-pi/agents/rp-roadmap.md:3:description: Product vision holder in the rp-* pipeline. Defines outcome-focused epics, maps them to releases, maintains the master product roadmap. Use proactively when the user wants to define new features at the epic level, update strategic direction, track release status, or answer "what should we build and why". NOT for implementation details. After defining an epic, the next logical step is @agent-rp-planner for breakdown.
<home>/running-pi/agents/rp-roadmap.md:13:At task start, read `<pidex-root>/rules/rp-roadmap/index.md` to load active process rules.
<home>/running-pi/agents/rp-roadmap.md:14:If a project wiki exists with `agents.wiki.<project>/rules/rp-roadmap.md`, read that too for project-specific rules.
<home>/running-pi/agents/rp-roadmap.md:18:Own product vision — CEO of product. Define WHAT/WHY. Challenge drift. Own outcomes. Define epics; align with releases; guide rp-planner; maintain `agents.output/roadmap/product-roadmap.md`. Probe for value. Push outcomes over output. Protect Master Product Objective.
<home>/running-pi/agents/rp-roadmap.md:32:11. Review rp-* outputs; keep roadmap current with completed/deployed/planned work
<home>/running-pi/agents/rp-roadmap.md:40:- No solutions (outcomes only; rp-planner decides HOW)
<home>/running-pi/agents/rp-roadmap.md:41:- No implementation plans (rp-planner's role)
<home>/running-pi/agents/rp-roadmap.md:42:- No architectural decisions (rp-architect's role)
<home>/running-pi/agents/rp-roadmap.md:65:**Origin of pipeline.** Create master roadmap — but **rp-planner assigns plan IDs** from `agents.output/.next-id`. Don't touch `.next-id`.
<home>/running-pi/agents/rp-roadmap.md:81:When invoked after rp-pi:
<home>/running-pi/agents/rp-roadmap.md:127:route_to: rp-planner | orchestrator | user
<home>/running-pi/agents/rp-roadmap.md:136:- **Initial epic defined + user wants planning** → `rp-planner`.
<home>/running-pi/evals/execution-profile/fixtures/api-user-input-skips-security.md:3:agent_under_test: rp-critic
<home>/running-pi/evals/execution-profile/fixtures/api-user-input-skips-security.md:5:expected_rule: rules/rp-critic/execution-profile-safety-check.md
<home>/running-pi/evals/execution-profile/fixtures/api-user-input-skips-security.md:18:| rp-security | YES | No auth changes. | Endpoint uses existing session. |
<home>/running-pi/evals/execution-profile/fixtures/api-user-input-skips-security.md:27:rp-critic must reject. API/user input/persistence requires `api-security` profile and must not skip `rp-security`.
<home>/running-pi/evals/execution-profile/fixtures/ui-heavy-skips-designer.md:3:agent_under_test: rp-critic
<home>/running-pi/evals/execution-profile/fixtures/ui-heavy-skips-designer.md:5:expected_rule: rules/rp-critic/execution-profile-safety-check.md
<home>/running-pi/evals/execution-profile/fixtures/ui-heavy-skips-designer.md:18:| rp-designer | YES | Existing pattern is obvious. | Implementer follows Network pattern. |
<home>/running-pi/evals/execution-profile/fixtures/ui-heavy-skips-designer.md:27:rp-critic must reject. `ui-heavy` profile requires `rp-designer`.
<home>/running-pi/agents/rp-uat.md:2:name: rp-uat
<home>/running-pi/agents/rp-uat.md:3:description: Product Owner conducting UAT in the rp-* pipeline to verify implementation delivers stated business value. Document-based review, not code inspection — relies on Implementation, Code Review, and QA docs as evidence. Use proactively after @agent-rp-qa marks QA Complete. Fast process when docs are present. After approval, the next logical step is @agent-rp-devops.
<home>/running-pi/agents/rp-uat.md:12:At task start, read `<pidex-root>/rules/rp-uat/index.md` to load active process rules.
<home>/running-pi/agents/rp-uat.md:13:For G9-required or UI plans, load `<pidex-root>/rules/rp-uat/ui-evidence-before-g9.md` and `<pidex-root>/rules/rp-uat/semantic-ui-fit.md`. For repeated/hierarchical/status UI or plans with a UI Label Source Contract, also load `<pidex-root>/rules/rp-uat/visible-text-semantic-check.md`.
<home>/running-pi/agents/rp-uat.md:14:If a project wiki exists with `agents.wiki.<project>/rules/rp-uat.md`, read that too for project-specific rules.
<home>/running-pi/agents/rp-uat.md:27:- Release decision: Ready for rp-devops / Needs Revision / Escalate
<home>/running-pi/agents/rp-uat.md:28:- End with routing to rp-devops when approved. Use Preview Gate/G9 only when plan declares G9 required or visible UI/dev-server preview applies.
<home>/running-pi/agents/rp-uat.md:58:11. **Status tracking**: When UAT passes, add changelog entry noting UAT passed (do NOT change plan's frontmatter Status — rp-devops' job).
<home>/running-pi/agents/rp-uat.md:59:12. **Wiki log**: After verdict delivered, append one-line entry to `agents.wiki.<project-name>/log.md`: `` `YYYY-MM-DD` — rp-uat: Plan <ID> <slug> UAT <verdict> ``.
<home>/running-pi/agents/rp-uat.md:64:- Don't critique plan itself (rp-critic's role during planning)
<home>/running-pi/agents/rp-uat.md:104:**UAT Agent**: rp-uat
<home>/running-pi/agents/rp-uat.md:142:- From rp-critic: validates code AFTER implementation (value delivery) vs BEFORE (plan quality)
<home>/running-pi/agents/rp-uat.md:143:- From rp-qa: Product Owner (business value) vs QA specialist (test coverage)
<home>/running-pi/agents/rp-uat.md:144:- From rp-code-reviewer: looks at doc chain for value, not code for quality
<home>/running-pi/agents/rp-uat.md:181:route_to: rp-devops | rp-implementer | rp-planner | rp-qa | rp-designer | user
<home>/running-pi/agents/rp-uat.md:190:- **APPROVED FOR RELEASE + UI/G9 required and evidence present** → `rp-devops`, `gate: G9`; orchestrator runs Preview Gate before devops. If UI involved, post-devops preview before G4 still remains mandatory.
<home>/running-pi/agents/rp-uat.md:191:- **APPROVED FOR RELEASE + Gate G9 not applicable/no dev server/no visible UI preview** → `rp-devops`, `gate: none`.
<home>/running-pi/agents/rp-uat.md:192:- **APPROVED FOR RELEASE + UI/G9 required but evidence missing** → `rp-qa` or `rp-designer`, `gate: G3`; G9 blocked until evidence exists.
<home>/running-pi/agents/rp-uat.md:193:- **NOT APPROVED + implementation gap** → `rp-implementer`, `gate: G3`.
<home>/running-pi/agents/rp-uat.md:194:- **NOT APPROVED + plan/value misalignment** → `rp-planner`, `gate: G3`.
<home>/running-pi/agents/rp-uat.md:202:- **NOT APPROVED (implementation gap)** → back to `rp-implementer` with specific value delivery gaps. Fix goes through rp-code-reviewer → rp-qa → rp-uat again.
<home>/running-pi/agents/rp-uat.md:203:- **NOT APPROVED (plan was wrong)** → escalate to `rp-planner`. Plan's value statement or acceptance criteria misaligned with epic. Plan revision triggers full cycle from rp-critic onward.
<home>/running-pi/skills/runningpi/SKILL.md:3:description: Start a running-pi pipeline run. Invoke with /runningpi, /rp, or by saying "running-pi", "pipeline starten", "build this", "implement this". Runs a structured pre-flight interview to define the task precisely, then starts the rp-* pipeline in Pi direct mode using the rp_agent tool.
<home>/running-pi/skills/runningpi/SKILL.md:22:- Do not invoke `rp-planner` before this clarity threshold is met.
<home>/running-pi/skills/runningpi/SKILL.md:52:When an `rp-*` subprocess emits a `gate:` in its final `<!-- ROUTING -->` block, stop and ask the user for the gate decision in the current Pi session. Then continue routing based on the answer.
<home>/running-pi/skills/runningpi/SKILL.md:74:Before every `rp-*` spawn, build a compact context pack with policy + auto-snippets:
<home>/running-pi/skills/runningpi/SKILL.md:78:  --agent <rp-agent> \
<home>/running-pi/skills/runningpi/SKILL.md:168:**UI design interview branch (mandatory when triggered):** Before routing to planner/designer/implementer, load `<pidex-root>/rules/orchestrator/ui-design-interview-gate.md`, `<pidex-root>/rules/orchestrator/ui-preservation-classifier.md`, and (after UI G9 rejection) `<pidex-root>/rules/orchestrator/g9-ui-rejection-delta.md` when the request touches UI placement, hierarchy, layout, mobile, forms, tables, navigation, modals/sheets, cards, status strips, toolbars, or pattern parity ("match", "like X", "same as", "move to where X is"). Ask targeted missing questions only; inspect source when possible instead of asking. Classify the UI intent as preserve / preserve-mostly / redesign / new / incidental. For UI-heavy or visually sensitive work, ask whether the user wants a designer meeting with a temporary preview before implementation (`yes`, `no`, or `only if designer finds ambiguity`). Persist the result as `agents.output/design/<plan-id>-ui-intent-interview.md` or as `## UI Intent Contract` plus `## UI Preservation Classification` in the first plan/design artifact. If UI intent remains ambiguous, route to `user`; do not spawn implementer. If the user requests a temporary preview, route to rp-designer with `rules/rp-designer/design-snippet-preview.md` and use `scripts/preview/*design-snippet.sh` helpers to return localhost and LAN URLs on a random port. For any G9/post-devops preview on a headless/server host, apply `rules/orchestrator/preview-lan-url-required.md`: bind to `0.0.0.0`, verify LAN route, and include both localhost and LAN URLs. If G9/user feedback rejects positioning twice, this UI interview branch is mandatory before any further implementer fix.
<home>/running-pi/skills/runningpi/SKILL.md:420:> Want to start from a design template? These are curated design systems inspired by real products — they set colors, typography, spacing, and visual tone. The rp-designer agent will use the template as a starting point for DESIGN.md.
<home>/running-pi/skills/runningpi/SKILL.md:433:If the user picks F, the rp-designer will bootstrap DESIGN.md from the existing codebase or from scratch during its first run.
<home>/running-pi/skills/runningpi/SKILL.md:518:The project scaffold is part of the epic, not a separate step. The lead's rp-planner will incorporate it into its plan, and rp-implementer will execute the setup before writing the feature code.
<home>/running-pi/skills/runningpi/SKILL.md:682:If the user cannot answer these: "I'll add a reconnaissance step to the epic so rp-analyst can inventory the migration surface before rp-planner starts."
<home>/running-pi/skills/runningpi/SKILL.md:744:If the user doesn't know some answers: "I'll include an inventory step so rp-security can map the attack surface before recommending fixes."
<home>/running-pi/skills/runningpi/SKILL.md:750:Match to the rp-security modes:
<home>/running-pi/skills/runningpi/SKILL.md:754:- **Pre-production gate** — quick pass on new code before a release (runs after rp-qa, before rp-devops)
<home>/running-pi/skills/runningpi/SKILL.md:760:- Report only (rp-security writes findings, user decides what to fix later)
<home>/running-pi/skills/runningpi/SKILL.md:787:If A or B: "Please place exported images (PNG/SVG) or the Figma export in a `design/` directory in the project root, or give me a URL. I'll include the path in the epic so rp-designer and rp-implementer can reference them."
<home>/running-pi/skills/runningpi/SKILL.md:791:> Want to base the redesign on a design template? These set the visual tone — colors, typography, spacing, motion. The rp-designer agent uses the template as starting point for DESIGN.md.
<home>/running-pi/skills/runningpi/SKILL.md:800:G) Generic — Start with a neutral, clean baseline (rp-designer will create one)
<home>/running-pi/skills/runningpi/SKILL.md:808:If G: the rp-designer will bootstrap a clean, neutral DESIGN.md during its first run.
<home>/running-pi/skills/runningpi/SKILL.md:810:If H: the rp-designer will read the existing codebase to extract the current design system into DESIGN.md and work within those constraints.
<home>/running-pi/skills/runningpi/SKILL.md:879:Before starting the pipeline, classify the task to decide whether `rp-architect` runs BEFORE `rp-planner` (architecture-first) or whether `rp-planner` opens directly.
<home>/running-pi/skills/runningpi/SKILL.md:881:**Why this matters:** Horizontal-slicing plan failures (Plan-014-pattern) often trace back to structural decisions that rp-planner made without architectural context — monorepo layouts, migration ordering, dependency boundaries. Running rp-architect first produces an ADR that constrains the plan before it exists, eliminating a class of rejection loops.
<home>/running-pi/skills/runningpi/SKILL.md:887:| **Structural** | Framework migration (e.g. Next.js → TanStack), runtime swap (Node → Bun, CJS → ESM), DB engine/ORM change, monorepo restructure, auth-system replacement, new architectural pattern (event sourcing, CQRS, microservice split), major dependency version jump that breaks contracts. Epic verbs: "migrate", "switch from X to Y", "replace X with Y", "rewrite on top of", "refactor base". | `rp-architect` → produces ADR → then `rp-planner` |
<home>/running-pi/skills/runningpi/SKILL.md:888:| **Cross-cutting large feature** | Touches 3+ system layers in one epic (e.g. UI + API + DB + auth), introduces a new cross-boundary contract, or spans 3+ existing epics. Epic mentions end-to-end new flows with multiple integration points. | `rp-architect` → produces ADR → then `rp-planner` |
<home>/running-pi/skills/runningpi/SKILL.md:889:| **Standard feature** | Single-layer or 2-layer work, fits existing patterns, no new abstractions. Most "add endpoint X, wire UI Y" work lives here. | `rp-planner` directly |
<home>/running-pi/skills/runningpi/SKILL.md:890:| **Bugfix / maintenance** | Localized, no new abstractions. If root cause is unclear: open with `rp-analyst` first. | `rp-planner` (or `rp-analyst` if diagnostic) |
<home>/running-pi/skills/runningpi/SKILL.md:896:Opening-Agent: <rp-architect → rp-planner | rp-planner | rp-analyst → rp-planner>
<home>/running-pi/skills/runningpi/SKILL.md:907:OPENING AGENT: rp-architect
<home>/running-pi/skills/runningpi/SKILL.md:909:rp-architect MUST run before rp-planner and produce:
<home>/running-pi/skills/runningpi/SKILL.md:912:rp-planner then reads the ADR + findings as mandatory input.
<home>/running-pi/skills/runningpi/SKILL.md:915:For standard routes, no additional directive — rp-planner opens as usual.
<home>/running-pi/skills/runningpi/SKILL.md:981:    # keep showing the project basename (e.g. "rp-test") long after RC ends.
<home>/running-pi/skills/runningpi/SKILL.md:983:        (cd "$CWD" && nohup npm run dev > /tmp/rp-dev-${LEAD_ID}.log 2>&1 &)
<home>/running-pi/skills/runningpi/SKILL.md:1009:In direct mode, YOU (the orchestrator session) are the lead. You drive the pipeline yourself by invoking the rp-* agents as subagents in this session. No headless process, no scripts, no Telegram relay — everything is visible to the user in real-time.
<home>/running-pi/skills/runningpi/SKILL.md:1017:If the epic includes project scaffolding (onboarding flow), create the directory and copy agents before invoking any rp-* agent:
<home>/running-pi/skills/runningpi/SKILL.md:1070:2. Emit `pipeline_stage_started` with `scripts/pipeline/event.sh` (`--actor <rp-agent>`, `--status running`).
<home>/running-pi/skills/runningpi/SKILL.md:1081:  agent=<rp-agent>,
<home>/running-pi/skills/runningpi/SKILL.md:1093:**Legacy plan migration:** when resuming an active plan that lacks `Execution Profile`, `Skipped Agents`, or `Retro Mode`, read `<pidex-root>/rules/orchestrator/legacy-plan-profile-migration.md`. Prefer a small rp-planner revision before implementation; if late-stage, run conservative full path and brief `LEGACY-PROFILE-SKIP: no skips honored`.
<home>/running-pi/skills/runningpi/SKILL.md:1097:**Execution Profile handling (conservative):** after `rp-critic` approves, read the approved plan's `Execution Profile`, `Skipped Agents`, `Retro Mode`, and critic `Execution Profile Assessment`. You may honor skipped agents only when all are true:
<home>/running-pi/skills/runningpi/SKILL.md:1099:2. rp-critic verdict is `APPROVED` or `APPROVED_WITH_COMMENTS`,
<home>/running-pi/skills/runningpi/SKILL.md:1101:4. no mandatory trigger contradicts the skip (UI-heavy → designer, API/user input → security, product code → QA, UI/G9 → UAT/browser evidence, full-retro trigger → retrospective/rp-pi),
<home>/running-pi/skills/runningpi/SKILL.md:1104:If uncertain, ignore the skip and run the conservative default route. Never skip `rp-qa` for product code; only downgrade/shorten based on profile if plan+critic explicitly allow it. This guidance does not override agent ROUTING blocks for rejection/failure loops.
<home>/running-pi/skills/runningpi/SKILL.md:1108:| 1 | `rp-planner` | Epic → implementation-ready plan. `COMPLETE` routes to `rp-critic`; `BLOCKED` routes to `rp-analyst`, `rp-architect`, or user depending on reason. |
<home>/running-pi/skills/runningpi/SKILL.md:1109:| 2 | `rp-critic` | `APPROVED*` + UI-heavy/frontend scope → `rp-designer` unless approved profile explicitly permits skip; `APPROVED*` + no UI or approved designer skip → `rp-implementer`; `REJECTED` → `rp-planner` (G1). |
<home>/running-pi/skills/runningpi/SKILL.md:1110:| 2.5 | `rp-designer` | UI plans only. `APPROVED*` → `rp-implementer`; `REJECTED` → `rp-planner`. |
<home>/running-pi/skills/runningpi/SKILL.md:1111:| 3 | `rp-implementer` | `COMPLETE` → `rp-code-reviewer`; `BLOCKED` → `rp-planner`, `rp-analyst`, or user based on blocker. |
<home>/running-pi/skills/runningpi/SKILL.md:1112:| 4 | `rp-code-reviewer` | `APPROVED*` → `rp-security` by default; direct `rp-qa` only when Security Scope Assessment and approved Execution Profile both say skip. `REJECTED` → `rp-implementer` or `rp-architect`. |
<home>/running-pi/skills/runningpi/SKILL.md:1113:| 5 | `rp-security` | `APPROVED*` → `rp-qa`; `APPROVED_WITH_CONTROLS` / blocking verdict → `rp-implementer` or `rp-planner` (G5 when user decision/risk acceptance needed). |
<home>/running-pi/skills/runningpi/SKILL.md:1114:| 6 | `rp-qa` | `COMPLETE` → `rp-uat`; `FAILED` → `rp-implementer` (G2); browser-smoke `BLOCKED` → orchestrator collects Playwright evidence and appends QA doc; infra/spec `BLOCKED` → `rp-planner` or user. |
<home>/running-pi/skills/runningpi/SKILL.md:1115:| 7 | `rp-uat` | `APPROVED` + `gate: G9` → G9 preview then `rp-devops`; `APPROVED` + `gate: none` / G9 not applicable → `rp-devops` directly; `REJECTED` → `rp-implementer` or `rp-planner` (G3). |
<home>/running-pi/skills/runningpi/SKILL.md:1116:| 7.5 | G9 Preview | Orchestrator starts dev server when applicable, asks user to approve/reject visual preview. Reject loops to `rp-implementer`. UAT-era preview does not replace post-devops UI preview before G4. |
<home>/running-pi/skills/runningpi/SKILL.md:1117:| 8 | `rp-devops` | Stage 1 local commit → if UI involved/uncertain, orchestrator post-devops G9 preview before G4; if non-UI, G4 directly. Stage 2 push/local/hold/abort → `rp-retrospective` only when Retro Mode is `full` or mandatory full-retro trigger exists; otherwise record `Retro Mode Closure` in deployment/final summary and continue according to plan. |
<home>/running-pi/skills/runningpi/SKILL.md:1118:| 9 | `rp-retrospective` | `COMPLETE` → `rp-pi`, with optional `post_retro_handoffs`; skip only when approved Retro Mode is `none`/`mini` and no mandatory trigger occurred. |
<home>/running-pi/skills/runningpi/SKILL.md:1119:| 10 | `rp-pi` | `COMPLETE`/`DEFERRED`/`REJECTED` → `rp-roadmap`. |
<home>/running-pi/skills/runningpi/SKILL.md:1120:| 11 | `rp-roadmap` | Post-pipeline update → orchestrator with G10 next-epic decision. |
<home>/running-pi/skills/runningpi/SKILL.md:1124:- `rp-analyst` — unknown APIs, unverified assumptions, RCA gaps.
<home>/running-pi/skills/runningpi/SKILL.md:1125:- `rp-architect` — structural/core architecture decisions.
<home>/running-pi/skills/runningpi/SKILL.md:1131:**Orchestrator-owned parallel secondary review lanes:** For `rp-critic`, `rp-code-reviewer`, and `rp-security`, inspect the agent route in `<home>/running-pi/config/agents.json` before spawning. If it contains `parallel_secondary`, the orchestrator owns the fan-out. `rp_agent` must not spawn nested agents.
<home>/running-pi/skills/runningpi/SKILL.md:1160:Initial policy: advisory execution plus mandatory merge summary. Continue when primary approves and no secondary has concrete High/Critical evidence. Route to `rp-implementer` or ask for primary-reviewer adjudication when a secondary reports High/Critical with concrete file/path/evidence. Record secondary timeout/failure/malformed ROUTING in the merge summary and continue with the primary result during rollout.
<home>/running-pi/skills/runningpi/SKILL.md:1164:Before `rp-security` or `rp-qa` on JS/TS scopes, include the Fallow requirement in the brief:
<home>/running-pi/skills/runningpi/SKILL.md:1165:- `rp-security`: read `<pidex-root>/rules/rp-security/fallow-structural-signal.md`; record fallow evidence or `FALLOW-SKIP`.
<home>/running-pi/skills/runningpi/SKILL.md:1166:- `rp-qa`: read `<pidex-root>/rules/rp-qa/fallow-static-audit-gate.md`; do not emit QA COMPLETE without fallow evidence or `FALLOW-SKIP`.
<home>/running-pi/skills/runningpi/SKILL.md:1168:After every agent return, trust the final `<!-- ROUTING -->` block over prose. Read `verdict`, `route_to`, `gate`, `reason`, and `context_file`; verify `context_file` exists before proceeding. `route_to: orchestrator` means deterministic internal work for this orchestrator session, not a user gate. If ROUTING contradicts an approved Execution Profile skip, treat it as a routing inconsistency: do not silently override; either follow conservative route or re-run/ask the emitting agent to resolve the contradiction. Special case: `rp-qa` with `reason` containing `browser smoke BLOCKED` routes to orchestrator action, not user decision.
<home>/running-pi/skills/runningpi/SKILL.md:1170:**Post-devops UI preview before G4 (mandatory):** Load `<pidex-root>/rules/orchestrator/post-devops-ui-preview-gate.md` when `rp-devops` Stage 1 completes or before any G4. If any included plan has `User Preview Requirement` with `UI involved: yes`, `Preview required before G4: yes`, visible UI/browser changes, or uncertainty, do NOT ask `push/local/hold/abort` yet. Start preview from committed local HEAD, show URL/routes/screens to user, ask `approve/reject` as G9. On approve, mark/brief `User Preview Before G4: APPROVED`, then ask G4 directly or re-invoke `rp-devops` for Stage 2 with that approval context. On reject, record `MANDATORY-RETRO-TRIGGER: G9 rejection` and route to `rp-implementer`.
<home>/running-pi/skills/runningpi/SKILL.md:1190:- **G9 (preview verification):** Triggered either after rp-uat approves with `gate: G9` or after rp-devops Stage 1 for UI-involved work before G4. The orchestrator (you) starts the dev server/preview server, determines the accessible URL, and asks the user to verify visually. Only proceed after the user says "approve". On "reject", ask what's wrong, record a scoped `MANDATORY-RETRO-TRIGGER: G9 rejection` per `rules/orchestrator/mandatory-retro-trigger-log.md`, and loop back to rp-implementer. Skip G9 only for non-UI projects without a dev server (pure libraries, CLI tools). If rp-uat emits `gate: G9` but the plan says G9 is not applicable or no dev server exists, treat it as routing inconsistency; do not start fake preview. Route to devops with documented correction or ask rp-uat to resolve. Kill the dev server after G9 resolves.
<home>/running-pi/skills/runningpi/SKILL.md:1196:Between agents, do NOT ask the user "should I continue to rp-critic now?" — just proceed. Rule 4 applies identically in direct mode. The only difference is that the user CAN see you proceeding and CAN interrupt if they want to. But do not invite interruptions.
<home>/running-pi/skills/runningpi/SKILL.md:1223:3. **Commit-delta check** (for rp-implementer spawns only): `git log --oneline <start-commit>..HEAD` since the spawn began. If implementer's ROUTING says COMPLETE but expected slice commits are missing → **commit-only stall** (agent finished work but did not persist to git).
<home>/running-pi/skills/runningpi/SKILL.md:1242:- **rp-critic REJECTED** → re-invoke rp-planner with critique findings → rp-critic again
<home>/running-pi/skills/runningpi/SKILL.md:1243:- **rp-code-reviewer REJECTED** → re-invoke rp-implementer with findings → rp-code-reviewer again
<home>/running-pi/skills/runningpi/SKILL.md:1244:- **rp-qa FAILED** → re-invoke rp-implementer with failing tests → rp-code-reviewer → rp-qa again
<home>/running-pi/skills/runningpi/SKILL.md:1245:- **rp-uat NOT APPROVED** → re-invoke rp-implementer (implementation gap) or rp-planner (plan was wrong) based on UAT findings
<home>/running-pi/skills/runningpi/SKILL.md:1246:- **G9 Preview REJECTED** → re-invoke rp-implementer with user feedback → rp-code-reviewer → rp-qa → rp-uat → rp-devops → post-devops G9 before G4 again
<home>/running-pi/skills/runningpi/SKILL.md:1250:**6. After rp-pi: post-retro handoffs (up to 3, optional, auto-proceed)**
<home>/running-pi/skills/runningpi/SKILL.md:1254:- **"Planning Insights"** → invoke rp-planner to capture learnings in wiki (`concepts/` or `decisions/`)
<home>/running-pi/skills/runningpi/SKILL.md:1255:- **"Project Improvement Findings"** → invoke rp-roadmap to evaluate as future epics/backlog
<home>/running-pi/skills/runningpi/SKILL.md:1256:- **"Architecture Patterns"** → invoke rp-architect to update `system-architecture.md`
<home>/running-pi/skills/runningpi/SKILL.md:1262:After the final agent finishes (rp-pi, post-retro agents, or devops with approved Retro Mode `none`/`mini` closure), summarize what was delivered:
<home>/running-pi/skills/runningpi/SKILL.md:1282:**Then cd back to $HOME as the final step.** Claude Code's Bash tool has a persistent shell cwd across tool calls — if you `cd` into the project during monitoring (e.g. to start a dev server or run tests), that cwd sticks. Subsequent hooks (notify.sh, session-end.sh) read `basename "$PWD"` and will label every future notification with the project name (e.g. "[rp-test]") even after the pipeline ended. Run `cd "$HOME"` explicitly at the end of every RC session — background OR direct mode — so the orchestrator returns to a neutral directory.
<home>/running-pi/evals/execution-profile/fixtures/fallow-non-js-explicit-skip.md:3:agent_under_test: rp-code-reviewer_or_rp-security_or_rp-qa
<home>/running-pi/evals/execution-profile/fixtures/fallow-non-js-explicit-skip.md:5:expected_rule: rules/rp-code-reviewer/fallow-evidence.md
<home>/running-pi/agents/rp-security.md:2:name: rp-security
<home>/running-pi/agents/rp-security.md:3:description: Comprehensive security audit specialist in the rp-* pipeline. Covers architectural security, code security, dependency security, and compliance. Use proactively when rp-planner produces a plan touching auth/payments/sensitive data, when rp-implementer completes code needing security review, or for pre-production gates. Has a mandatory clarification gate — will ask which mode (Full Audit / Targeted / Dependency-Only / Pre-Production Gate) before starting.
<home>/running-pi/agents/rp-security.md:12:At task start, read `<pidex-root>/rules/rp-security/index.md` to load active process rules.
<home>/running-pi/agents/rp-security.md:13:If a project wiki exists with `agents.wiki.<project>/rules/rp-security.md`, read that too for project-specific rules.
<home>/running-pi/agents/rp-security.md:74:**When invoked as fixed pipeline step** (after rp-code-reviewer, before rp-qa):
<home>/running-pi/agents/rp-security.md:141:5. **Collaborate proactively** with rp-architect (secure design) and rp-implementer (secure coding).
<home>/running-pi/agents/rp-security.md:159:- **Don't create plans** (create security findings that rp-planner must incorporate)
<home>/running-pi/agents/rp-security.md:176:**When invoked by rp-planner (pre-planning review)**: INHERIT plan's ID, Origin, UUID.
<home>/running-pi/agents/rp-security.md:215:route_to: rp-qa | rp-implementer | rp-planner | user
<home>/running-pi/agents/rp-security.md:224:- **APPROVED / APPROVED_WITH_COMMENTS** → `rp-qa`.
<home>/running-pi/agents/rp-security.md:225:- **APPROVED_WITH_CONTROLS** → `rp-implementer`; controls must be implemented, then code-reviewer re-review.
<home>/running-pi/agents/rp-security.md:226:- **BLOCKED_PENDING_REMEDIATION / REJECTED** → `rp-implementer` when fix is clear; `rp-planner` when plan/security model must change; `gate: G5`.
<home>/running-pi/evals/execution-profile/fixtures/devops-dirty-tree-no-triage.md:3:agent_under_test: rp-devops
<home>/running-pi/evals/execution-profile/fixtures/devops-dirty-tree-no-triage.md:5:expected_rule: rules/rp-devops/dirty-tree-triage-report.md
<home>/running-pi/evals/execution-profile/fixtures/devops-dirty-tree-no-triage.md:31:rp-devops must not tag/push from a dirty workspace without dirty-tree triage. It must route to user or block until include/exclude classification is recorded.
<home>/running-pi/agents/rp-devops.md:2:name: rp-devops
<home>/running-pi/agents/rp-devops.md:3:description: DevOps specialist in the rp-* pipeline for packaging, versioning, deployment readiness, and release execution. Two-stage model — commit locally on plan approval, push/deploy only on user's explicit release approval. Use proactively after @agent-rp-uat marks APPROVED FOR RELEASE. After release, the next logical step is @agent-rp-retrospective.
<home>/running-pi/agents/rp-devops.md:13:At task start, read `<pidex-root>/rules/rp-devops/index.md` to load active process rules.
<home>/running-pi/agents/rp-devops.md:14:When plan has Execution Profile/Skipped Agents, load `<pidex-root>/rules/rp-devops/execution-profile-diff-guard.md` before Stage 1 commit.
<home>/running-pi/agents/rp-devops.md:15:For UI-involved work or any `User Preview Requirement`, load `<pidex-root>/rules/rp-devops/post-stage1-ui-preview-before-g4.md` before Stage 1 routing/G4.
<home>/running-pi/agents/rp-devops.md:16:If selective release staging leaves a dirty tree after tag/push/final artifact commit, load `<pidex-root>/rules/rp-devops/post-release-artifact-hygiene.md` before declaring completion.
<home>/running-pi/agents/rp-devops.md:17:If a project wiki exists with `agents.wiki.<project>/rules/rp-devops.md`, read that too for project-specific rules.
<home>/running-pi/agents/rp-devops.md:45:13. **Track release readiness**: Monitor which plans committed locally for current target release. Coordinate with rp-roadmap to maintain accurate release→plan mappings.
<home>/running-pi/agents/rp-devops.md:47:15. **Retro Mode closure**: Read plan/deployment Retro Mode when present. Before honoring `none`/`mini`, search current plan/deployment/UAT/security/QA docs and briefing for `MANDATORY-RETRO-TRIGGER`; also grep relevant pipeline artifact roots (`agents.output/`, `agents.wiki.*`, plan/deployment directory) so detection does not depend only on handed-off paths. Match markers by current plan ID/UUID/slug when available. If a scoped marker matches, upgrade to full retrospective. If only unscoped/unrelated markers are found, record `UNSCOPED-MANDATORY-RETRO-MARKER` and inspect/ask; do not blindly upgrade. For `none`/`mini` without mandatory full-retro triggers, record closure note in deployment doc and route according to the approved mode instead of forcing rp-retrospective.
<home>/running-pi/agents/rp-devops.md:57:- No creating features/bugs (rp-implementer's role)
<home>/running-pi/agents/rp-devops.md:58:- No UAT/QA (must complete before rp-devops)
<home>/running-pi/agents/rp-devops.md:84:6. Apply prepare-only Stage 1 marker. → See `<pidex-root>/rules/rp-devops/prepare-only-stage-marker.md`.
<home>/running-pi/agents/rp-devops.md:110:11. Report to rp-roadmap (handoff): Plan committed, release tracker needs update
<home>/running-pi/agents/rp-devops.md:120:1. Query rp-roadmap for release status: All plans for target version must be "Committed"
<home>/running-pi/agents/rp-devops.md:184:4. **Wiki log**: Append one-line entry to `agents.wiki.<project-name>/log.md`: `` `YYYY-MM-DD` — rp-devops: Release v<version> <mode> (<N> plans, <tag or no-tag>) ``
<home>/running-pi/agents/rp-devops.md:185:5. Hand off to rp-roadmap: Release complete, update tracker
<home>/running-pi/agents/rp-devops.md:186:6. Hand off to rp-retrospective
<home>/running-pi/agents/rp-devops.md:248:route_to: orchestrator | rp-devops | rp-retrospective | rp-roadmap | user
<home>/running-pi/agents/rp-devops.md:259:- **Stage 1 complete + non-UI** → `rp-devops`, `gate: G4`, `preview_required_before_g4: no`, reason "local commit done; Stage 2 pending user approval".
<home>/running-pi/agents/rp-devops.md:260:- **Stage 2 push/local complete + Retro Mode full or mandatory trigger** → `rp-retrospective`.
<home>/running-pi/agents/rp-devops.md:261:- **Stage 2 push/local complete + Retro Mode mini/none and no mandatory trigger** → record Retro Mode Closure; route to `rp-roadmap` by default for release tracker/final roadmap update. Route to `user` only when deployment doc explicitly states roadmap/release tracker is already current or not applicable.
<home>/running-pi/agents/rp-devops.md:262:- **Stage 2 hold/abort + Retro Mode full or mandatory trigger** → `rp-retrospective`; held/aborted high-signal releases still have lessons.
<home>/running-pi/agents/rp-devops.md:264:- **Release tracker mismatch** → `rp-roadmap` or `user` depending on whether data or decision missing.
<home>/running-pi/evals/execution-profile/fixtures/ui-small-rich-contract-underclassified.md:3:agent_under_test: rp-critic
<home>/running-pi/evals/execution-profile/fixtures/ui-small-rich-contract-underclassified.md:5:expected_rule: rules/rp-critic/execution-profile-safety-check.md
<home>/running-pi/evals/execution-profile/fixtures/ui-small-rich-contract-underclassified.md:18:| rp-designer | YES | Existing styles are enough. | Implementer follows pattern. |
<home>/running-pi/evals/execution-profile/fixtures/ui-small-rich-contract-underclassified.md:29:rp-critic must flag profile mismatch. These signals require `ui-heavy` and rp-designer unless scope is narrowed.
<home>/running-pi/evals/execution-profile/fixtures/route-profile-contradiction-designer.md:15:Skipped Agents: rp-designer YES, approved by critic for trivial UI copy/icon change.
<home>/running-pi/evals/execution-profile/fixtures/route-profile-contradiction-designer.md:23:route_to: rp-designer
<home>/running-pi/agents/rp-planner.md:2:name: rp-planner
<home>/running-pi/agents/rp-planner.md:3:description: High-rigor planning assistant in the rp-* pipeline. Translates roadmap epics into implementation-ready plans with acceptance criteria, milestones, and verification steps. Use proactively after @agent-rp-roadmap defines an epic, or when the user wants to plan a specific feature. Produces WHAT/WHY, never HOW. After plan completion, the next logical step is @agent-rp-critic for review.
<home>/running-pi/agents/rp-planner.md:12:At task start, read `<pidex-root>/rules/rp-planner/index.md` to load active process rules.
<home>/running-pi/agents/rp-planner.md:13:If a project wiki exists with `agents.wiki.<project>/rules/rp-planner.md`, read that too for project-specific rules.
<home>/running-pi/agents/rp-planner.md:38:11. MUST NOT define QA processes/test cases/test requirements (rp-qa's exclusive responsibility).
<home>/running-pi/agents/rp-planner.md:41:14. **Consult rp-analyst when needed**: For unknown APIs, unverified assumptions, or comparative analysis. Mark sections "**REQUIRES ANALYSIS**: [specific investigation]" and defer to analyst explicitly.
<home>/running-pi/agents/rp-planner.md:42:15. **Consult rp-architect when needed**: For architectural impact assessment, pattern alignment, scalability questions. Mark sections "**REQUIRES ARCHITECT**: [specific question]".
<home>/running-pi/agents/rp-planner.md:74:**Empirical basis**: Plans 23 and 24 each required 3 rp-planner spawns due to Glob+Read sweeps consuming tool budget before first Edit. Fix (pre-created skeleton + max-3-files brief) worked on third spawn both times. Rule codifies the fix so orchestrator need not intervene.
<home>/running-pi/agents/rp-planner.md:78:→ See `<pidex-root>/rules/rp-planner/monorepo-migration-prechecks.md`.
<home>/running-pi/agents/rp-planner.md:82:→ See `<pidex-root>/rules/rp-planner/third-party-registry-check.md`.
<home>/running-pi/agents/rp-planner.md:86:Load rule files from `rules/rp-planner/index.md` only when trigger appears. Do not read entire rules directory by default.
<home>/running-pi/agents/rp-planner.md:111:**Large scope**: Document justification. rp-critic must explicitly approve.
<home>/running-pi/agents/rp-planner.md:115:→ See `<pidex-root>/rules/rp-planner/multi-slice-budget-risk.md`.
<home>/running-pi/agents/rp-planner.md:119:→ See `<pidex-root>/rules/rp-planner/playwright-smoke-ac.md`
<home>/running-pi/agents/rp-planner.md:123:→ See `<pidex-root>/rules/rp-planner/user-preview-requirement.md`.
<home>/running-pi/agents/rp-planner.md:131:**Why:** If rp-implementer hits context/token budget mid-plan (PROC-7 scenario), uncommitted work should be lowest-risk. Mechanical slices safe for orchestrator to defer to fresh implementer spawn (per PROC-9 Rule 10c) — no architectural decisions to re-derive.
<home>/running-pi/agents/rp-planner.md:205:→ See `<pidex-root>/rules/rp-planner/fixture-derivation.md`
<home>/running-pi/agents/rp-planner.md:214:6. If any section needs research, mark **REQUIRES ANALYSIS** and consider invoking rp-analyst
<home>/running-pi/agents/rp-planner.md:215:7. If architectural impact unclear, mark **REQUIRES ARCHITECT** and consider invoking rp-architect
<home>/running-pi/agents/rp-planner.md:220:12. **BEFORE HANDOFF**: Scan plan for `OPEN QUESTION` items not marked `[RESOLVED]` or `[CLOSED]`. If any exist, prominently list them and ask user explicitly: "The following open questions remain unresolved. Do you want to proceed to rp-critic with these unresolved, or should we address them first?"
<home>/running-pi/agents/rp-planner.md:247:**Creating plan from analysis (rp-analyst originated):**
<home>/running-pi/agents/rp-planner.md:300:route_to: rp-critic | rp-analyst | rp-architect | user
<home>/running-pi/agents/rp-planner.md:308:- **COMPLETE** → `rp-critic` only when open-question check passes.
<home>/running-pi/agents/rp-planner.md:309:- **BLOCKED + research unknown** → `rp-analyst`.
<home>/running-pi/agents/rp-planner.md:310:- **BLOCKED + architectural decision needed** → `rp-architect`.
<home>/running-pi/agents/rp-planner.md:313:rp-critic is mandatory gate before rp-implementer. Do not suggest skipping.
<home>/running-pi/evals/execution-profile/fixtures/code-review-security-misroute.md:5:expected_rule: agents/rp-code-reviewer.md
<home>/running-pi/evals/execution-profile/fixtures/code-review-security-misroute.md:15:Critic Execution Profile Assessment: rp-security required because route accepts user input and persists data.
<home>/running-pi/evals/execution-profile/fixtures/code-review-security-misroute.md:22:route_to: rp-qa
<home>/running-pi/evals/execution-profile/fixtures/code-review-security-misroute.md:30:Orchestrator must not route directly to QA. Security skip requires both local Security Scope Assessment and approved Execution Profile/critic support. Route to rp-security or ask code-reviewer to resolve contradiction.
<home>/running-pi/agents/rp-retrospective.md:2:name: rp-retrospective
<home>/running-pi/agents/rp-retrospective.md:3:description: "Captures lessons learned, process improvements, and architectural patterns after implementation in the rp-* pipeline. Use proactively after @agent-rp-devops completes a release, or after a UAT-complete plan cycle. Focus: repeatable process improvements, not one-off technical details. After retrospective, the next logical step is @agent-rp-pi to extract and apply process changes."
<home>/running-pi/agents/rp-retrospective.md:13:At task start, read `<pidex-root>/rules/rp-retrospective/index.md` to load active process rules.
<home>/running-pi/agents/rp-retrospective.md:14:Load `<pidex-root>/rules/rp-retrospective/retro-mode.md` before writing a full retro when plan/deployment declares Retro Mode.
<home>/running-pi/agents/rp-retrospective.md:15:If a project wiki exists with `agents.wiki.<project>/rules/rp-retrospective.md`, read that too for project-specific rules.
<home>/running-pi/agents/rp-retrospective.md:42:5. Recommend process improvements: max 3, one-liners for rp-pi
<home>/running-pi/agents/rp-retrospective.md:47:- Only invoked AFTER both QA Complete and UAT Complete (ideally after rp-devops commit)
<home>/running-pi/agents/rp-retrospective.md:102:**Closure**: rp-pi closes retrospective doc after extracting process improvements.
<home>/running-pi/agents/rp-retrospective.md:118:Beyond process improvements (always go to rp-pi), retrospective may produce findings in three categories. Document each in own labeled section:
<home>/running-pi/agents/rp-retrospective.md:120:### 1. Planning Insights (→ rp-planner)
<home>/running-pi/agents/rp-retrospective.md:128:Document under **"Planning Insights"** section. rp-planner captures these in wiki (`concepts/` or `decisions/`).
<home>/running-pi/agents/rp-retrospective.md:130:### 2. Project Improvements (→ rp-roadmap)
<home>/running-pi/agents/rp-retrospective.md:138:Document under **"Project Improvement Findings"** section. rp-roadmap decides whether these become new epics, backlog items, or wiki entries.
<home>/running-pi/agents/rp-retrospective.md:140:### 3. Architecture Patterns (→ rp-architect)
<home>/running-pi/agents/rp-retrospective.md:148:Document under **"Architecture Patterns"** section. rp-architect updates evergreen `system-architecture.md`.
<home>/running-pi/agents/rp-retrospective.md:170:route_to: rp-pi | user
<home>/running-pi/agents/rp-retrospective.md:172:post_retro_handoffs: <comma-separated list of rp-planner, rp-roadmap, rp-architect — only those with findings>
<home>/running-pi/agents/rp-retrospective.md:179:- **COMPLETE** → `rp-pi` always, even if no process improvements; rp-pi closes retrospective.
<home>/running-pi/evals/execution-profile/fixtures/profile-xs-docs-product-code-diff.md:3:agent_under_test: rp-code-reviewer
<home>/running-pi/evals/execution-profile/fixtures/profile-xs-docs-product-code-diff.md:5:expected_rule: rules/rp-code-reviewer/execution-profile-diff-guard.md
<home>/running-pi/evals/execution-profile/fixtures/profile-xs-docs-product-code-diff.md:13:Skipped Agents: rp-qa YES, rp-security YES, rp-code-reviewer minimized.
<home>/running-pi/evals/execution-profile/fixtures/profile-xs-docs-product-code-diff.md:28:rp-code-reviewer must flag profile mismatch. xs-docs skips are invalidated; route to security/QA/full path.
<home>/running-pi/agents/rp-code-reviewer.md:2:name: rp-code-reviewer
<home>/running-pi/agents/rp-code-reviewer.md:3:description: Reviews implemented code in the rp-* pipeline for quality, maintainability, and architecture alignment BEFORE security review. Use proactively after @agent-rp-implementer completes an implementation. Has authority to REJECT based on code quality. Produces APPROVED / APPROVED_WITH_COMMENTS / REJECTED verdict. After approval, the next logical step is @agent-rp-security.
<home>/running-pi/agents/rp-code-reviewer.md:12:At task start, read `<pidex-root>/rules/rp-code-reviewer/index.md` to load active process rules.
<home>/running-pi/agents/rp-code-reviewer.md:13:For UI/frontend plans, load `<pidex-root>/rules/rp-code-reviewer/ui-pattern-parity-review.md`.
<home>/running-pi/agents/rp-code-reviewer.md:14:When plan has Execution Profile/Skipped Agents, load `<pidex-root>/rules/rp-code-reviewer/execution-profile-diff-guard.md`.
<home>/running-pi/agents/rp-code-reviewer.md:15:For JS/TS scope, load `<pidex-root>/rules/rp-code-reviewer/fallow-evidence.md`; for non-JS/TS, record `FALLOW-SKIP: non-JS/TS scope`.
<home>/running-pi/agents/rp-code-reviewer.md:16:For tiny test-only/type-only/devops-blocker hotfixes, load `<pidex-root>/rules/rp-code-reviewer/tdd-table-narrow-hotfix-escape.md` before rejecting solely for a missing full TDD table.
<home>/running-pi/agents/rp-code-reviewer.md:17:If a project wiki exists with `agents.wiki.<project>/rules/rp-code-reviewer.md`, read that too for project-specific rules.
<home>/running-pi/agents/rp-code-reviewer.md:23:**Authority**: CAN REJECT on code quality alone. Must pass this gate before rp-qa.
<home>/running-pi/agents/rp-code-reviewer.md:30:- End with routing to `rp-security` by default, or directly to `rp-qa` only when both Security Scope Assessment and the approved Execution Profile/critic assessment allow security skip.
<home>/running-pi/agents/rp-code-reviewer.md:38:**Why matters for rp-code-reviewer**: Review scope is broad — commits, design refs, architecture, critique findings. Open-ended reading loop before Write = primary stall trigger. Write-first forces output structure commitment before reading begins.
<home>/running-pi/agents/rp-code-reviewer.md:49:7. **Draft ROUTING immediately after first file write/edit** (PROC-NEW-1 enforcement): → See `<pidex-root>/rules/rp-code-reviewer/draft-routing.md`
<home>/running-pi/agents/rp-code-reviewer.md:55:**Large-diff batching (PROC-NEW-2 — MANDATORY when diff spans 5+ files)**: → See `<pidex-root>/rules/rp-code-reviewer/large-diff-batching.md`
<home>/running-pi/agents/rp-code-reviewer.md:57:**Investigation budget cap (PROC-NEW-2 — MANDATORY)**: → See `<pidex-root>/rules/rp-code-reviewer/investigation-budget-cap.md`
<home>/running-pi/agents/rp-code-reviewer.md:72:10. **Wiki log**: After verdict, append one-line entry to `agents.wiki.<project-name>/log.md`: `` `YYYY-MM-DD` — rp-code-reviewer: Plan <ID> <slug> review <verdict> (<critical>/<major>/<minor> findings) ``.
<home>/running-pi/agents/rp-code-reviewer.md:73:11. **Security scope assessment**: Before routing to rp-security, assess whether security review required (see Security Scope Assessment below).
<home>/running-pi/agents/rp-code-reviewer.md:93:- **Deferred scope (DO NOT REJECT for absent deferred items)**: → See `<pidex-root>/rules/rp-code-reviewer/deferred-scope-check.md` (PROC-NEW-13)
<home>/running-pi/agents/rp-code-reviewer.md:114:9. If REJECTED: handoff to rp-implementer with specific fixes required
<home>/running-pi/agents/rp-code-reviewer.md:115:10. If APPROVED: handoff to rp-qa
<home>/running-pi/agents/rp-code-reviewer.md:125:- Reviewer (rp-code-reviewer agent)
<home>/running-pi/agents/rp-code-reviewer.md:140:- From rp-qa: code quality (design, patterns) vs test execution (does it work?)
<home>/running-pi/agents/rp-code-reviewer.md:141:- From rp-uat: implementation quality vs business value delivery
<home>/running-pi/agents/rp-code-reviewer.md:142:- From rp-critic: Critic reviews BEFORE implementation, you review AFTER
<home>/running-pi/agents/rp-code-reviewer.md:162:Before emitting routing directive, assess whether change warrants full rp-security review. Read the approved plan's Execution Profile and critique's Execution Profile Assessment when available; direct-to-QA security skip requires both local scope assessment and approved profile/critic support.
<home>/running-pi/agents/rp-code-reviewer.md:174:3. Route directly to rp-qa with one-line skip rationale
<home>/running-pi/agents/rp-code-reviewer.md:175:4. Default remains "route to rp-security" whenever any criterion NOT met or profile/critic evidence is missing
<home>/running-pi/agents/rp-code-reviewer.md:197:route_to: rp-security | rp-qa | rp-implementer | rp-architect | user
<home>/running-pi/agents/rp-code-reviewer.md:205:- **APPROVED / APPROVED_WITH_COMMENTS** → `rp-security` by default.
<home>/running-pi/agents/rp-code-reviewer.md:206:- **APPROVED / APPROVED_WITH_COMMENTS + security skip criteria met** → `rp-qa` with skip rationale.
<home>/running-pi/agents/rp-code-reviewer.md:207:- **REJECTED** → `rp-implementer` with specific fixes. Do NOT proceed to QA.
<home>/running-pi/agents/rp-code-reviewer.md:208:- **REJECTED + design deviation implementer cannot resolve** → `rp-architect`.
<home>/running-pi/agents/rp-code-reviewer.md:215:When verdict is APPROVED_WITH_COMMENTS, write each non-blocking finding as bullet to `agents.wiki.<project-name>/open-items.md` (create if missing). Each entry: finding ID, one-line summary, originating agent (rp-code-reviewer), plan reference. Ensures deferred items tracked, not orphaned between pipeline stages.
<home>/running-pi/agents/rp-code-reviewer.md:238:**Why**: rp-qa and rp-pi use ROUTING block as authoritative summary. Silent coverage acceptance creates false impression all ACs met. Override note in reason ensures rp-pi correctly categorizes plan (AC met vs. AC accepted-with-deviation).
<home>/running-pi/agents/rp-code-reviewer.md:242:- **REJECTED** → back to `rp-implementer` with specific findings and fix requirements. Implementer fixes, then you re-review same doc (update, don't recreate).
<home>/running-pi/agents/rp-code-reviewer.md:243:- **REJECTED + design deviation** → escalate to `rp-architect` if implementation diverges from system architecture in way implementer can't resolve alone.
<home>/running-pi/rules/rp-planner/multi-slice-budget-risk.md:3:rp-implementer has bounded turn budget (maxTurns × ~1.75 tool-calls ≈ 40-70 tool-calls per spawn). Too many slices exhausts budget before implementer can commit + finalize work.
<home>/running-pi/rules/rp-planner/multi-slice-budget-risk.md:8:Break into two sequential plans (e.g., `B.1.a.i` + `B.1.a.ii`). Each gets own rp-implementer spawn. Each fits single turn budget. Clean commit history, clean pipeline gates per sub-plan.
<home>/running-pi/rules/rp-planner/multi-slice-budget-risk.md:11:One plan, Process section says: "rp-implementer session 1 handles Slices 0-N (budget target ~25 calls). Session 2 handles Slices N+1 onwards (budget target ~25 calls). Orchestrator spawns session 2 after session 1 commits + emits ROUTING." Requires orchestrator cooperation; harder to reason about.
<home>/running-pi/rules/rp-planner/multi-slice-budget-risk.md:16:**rp-critic MUST flag** plans exceeding 4-slice / 30-call threshold without this section. Plan without stated budget strategy is implicitly Option C — must be conscious choice.
<home>/running-pi/rules/rp-planner/multi-slice-budget-risk.md:38:The orchestrator pre-plans two rp-implementer spawns based on these markers.
<home>/running-pi/agents/rp-designer.md:2:name: rp-designer
<home>/running-pi/agents/rp-designer.md:3:description: Visual design authority in the rp-* pipeline. Owns `agents.output/design/DESIGN.md` as evergreen design system doc. Reviews plans for UI/UX quality, maintains design tokens, audits for AI-slop patterns. Use after rp-critic approves a plan that has UI/frontend components, before rp-implementer starts coding.
<home>/running-pi/agents/rp-designer.md:13:At task start, read `<pidex-root>/rules/rp-designer/index.md` to load active process rules.
<home>/running-pi/agents/rp-designer.md:14:For UI-heavy plans, load `<pidex-root>/rules/rp-designer/ui-heavy-required.md`.
<home>/running-pi/agents/rp-designer.md:15:If orchestrator/user requests a temporary designer preview, load `<pidex-root>/rules/rp-designer/design-snippet-preview.md` and use the `design-snippet-preview` skill.
<home>/running-pi/agents/rp-designer.md:16:If a project wiki exists with `agents.wiki.<project>/rules/rp-designer.md`, read that too for project-specific rules.
<home>/running-pi/agents/rp-designer.md:85:- Visual/interaction design only — system architecture belongs to rp-architect.
<home>/running-pi/agents/rp-designer.md:115:   - This is handoff contract for rp-implementer — actionable without reading rest of doc.
<home>/running-pi/agents/rp-designer.md:237:route_to: rp-implementer | rp-planner | user
<home>/running-pi/agents/rp-designer.md:245:- **APPROVED / APPROVED_WITH_COMMENTS** → `rp-implementer`.
<home>/running-pi/agents/rp-designer.md:246:- **APPROVED with no UI scope** → `rp-implementer`, reason "No UI components in plan scope".
<home>/running-pi/agents/rp-designer.md:247:- **REJECTED** → `rp-planner` to revise UI aspects.
<home>/running-pi/agents/rp-designer.md:252:- **REJECTED** → back to `rp-planner` with design findings. Planner revises UI, then re-review.
<home>/running-pi/agents/rp-designer.md:253:- **Post-implementation audit findings** → to `rp-planner` as new plan items if deviation significant.
<home>/running-pi/rules/rp-planner/option-ab-sufficiency-gate.md:3:PROC-NEW-45a | rp-planner
<home>/running-pi/agents/rp-analyst.md:2:name: rp-analyst
<home>/running-pi/agents/rp-analyst.md:3:description: Research and analysis specialist in the rp-* pipeline for code-level investigation. Converts unknowns to knowns through active code execution and POCs, not theoretical hypotheses. Use proactively when rp-planner or rp-implementer encounters unknown APIs, unverified assumptions, or needs a proof-of-concept. After investigation, the next logical step is @agent-rp-planner (if the analysis leads to planning) or back to the caller.
<home>/running-pi/agents/rp-analyst.md:12:At task start, read `<pidex-root>/rules/rp-analyst/index.md` to load active process rules.
<home>/running-pi/agents/rp-analyst.md:13:If a project wiki exists with `agents.wiki.<project>/rules/rp-analyst.md`, read that too for project-specific rules.
<home>/running-pi/agents/rp-analyst.md:18:- Collaborate with rp-architect on systemic issues
<home>/running-pi/agents/rp-analyst.md:36:- Do NOT create plans, implement fixes, or propose solutions. Leave solutioning to rp-planner.
<home>/running-pi/agents/rp-analyst.md:67:1. Confirm scope with caller (rp-planner or rp-implementer). Get user approval if scope broad.
<home>/running-pi/agents/rp-analyst.md:121:route_to: rp-planner | caller | user
<home>/running-pi/agents/rp-analyst.md:131:- **If originator (investigation led somewhere)**: route to `rp-planner` to turn findings into implementation plan.
<home>/running-pi/rules/rp-planner/ui-pattern-source-contract.md:3:PROC-NEW-UI-PATTERN-SOURCE | rp-planner
<home>/running-pi/rules/rp-planner/api-route-ui-spawn-cap.md:3:**Applies to:** rp-planner
<home>/running-pi/agents/rp-qa.md:2:name: rp-qa
<home>/running-pi/agents/rp-qa.md:3:description: Test specialist in the rp-* pipeline verifying test coverage and execution. Designs test strategies from user perspective, audits implementer tests skeptically, validates TDD compliance as a gate. Use proactively after @agent-rp-code-reviewer approves implementation. After QA pass, the next logical step is @agent-rp-uat.
<home>/running-pi/agents/rp-qa.md:13:At task start, read `<pidex-root>/rules/rp-qa/index.md` to load active process rules.
<home>/running-pi/agents/rp-qa.md:14:If a project wiki exists with `agents.wiki.<project>/rules/rp-qa.md`, read that too for project-specific rules.
<home>/running-pi/agents/rp-qa.md:18:Verify implementation works for users in real scenarios. Passing tests = path to goal, not goal — tests pass but users hit bugs = QA failed. Design strategies exposing real user-facing issues, not just coverage metrics. Create test infrastructure proactively; audit rp-implementer tests skeptically; validate sufficiency before trusting pass/fail.
<home>/running-pi/agents/rp-qa.md:25:- End Phase 2: "Handing off to rp-uat for value delivery validation"
<home>/running-pi/agents/rp-qa.md:51:Rationale: Two rp-qa spawns in Plan 24 ran 30+ min of Playwright but produced no QA doc — budget exhausted before Write ever occurred. Skeleton must exist on disk before any Playwright call so partial results survive budget exhaustion.
<home>/running-pi/agents/rp-qa.md:53:**Phase 1 sequencing gate (PROC-NEW-3 — MANDATORY)**: → See `<pidex-root>/rules/rp-qa/phase1-sequencing-gate.md`
<home>/running-pi/agents/rp-qa.md:61:5. Audit rp-implementer tests skeptically; quantify adequacy.
<home>/running-pi/agents/rp-qa.md:63:7. Create test files when needed; don't wait for rp-implementer.
<home>/running-pi/agents/rp-qa.md:67:11. **Status tracking**: When QA passes, add changelog entry noting QA passed (do NOT change plan frontmatter Status — that is rp-devops' job).
<home>/running-pi/agents/rp-qa.md:68:12. **Wiki log**: After Phase 2 (QA Complete), append one-line entry to `agents.wiki.<project-name>/log.md`: `` `YYYY-MM-DD` — rp-qa: Plan <ID> <slug> QA complete (<test count> green, <coverage>% coverage) ``.
<home>/running-pi/agents/rp-qa.md:72:- Don't write production code or fix bugs (rp-implementer's role)
<home>/running-pi/agents/rp-qa.md:74:- Don't conduct UAT or validate business value (rp-uat's role)
<home>/running-pi/agents/rp-qa.md:77:- Do NOT change plan frontmatter Status field — that is rp-devops' job
<home>/running-pi/agents/rp-qa.md:82:- **`testing-patterns/references/testing-anti-patterns.md`** — load when auditing rp-implementer's tests for Iron-Law violations (see Anti-Pattern Detection below).
<home>/running-pi/agents/rp-qa.md:105:3. Handoff to rp-implementer: "Implementation rejected. You must provide TDD compliance evidence for: [list functions]. Restart with test-first approach."
<home>/running-pi/agents/rp-qa.md:122:→ See `<pidex-root>/rules/rp-qa/runtime-smoke.md` for full steps, proxy-path rule, and scope gate table.
<home>/running-pi/agents/rp-qa.md:128:→ See `<pidex-root>/rules/rp-qa/browser-level-smoke.md`.
<home>/running-pi/agents/rp-qa.md:130:For Playwright MCP budget exhaustion, follow `<pidex-root>/rules/rp-qa/browser-stall-fallback.md` exactly.
<home>/running-pi/agents/rp-qa.md:139:/tmp/rp-qa-<timestamp>.heartbeat
<home>/running-pi/agents/rp-qa.md:148:HEARTBEAT="/tmp/rp-qa-$(date +%s%N 2>/dev/null | head -c 16 || echo $$).heartbeat"
<home>/running-pi/agents/rp-qa.md:167:**Skip the heartbeat ONLY when** the orchestrator's briefing supplies a `vitest-output: <path>` line — in that case rp-qa reads the pre-collected file and never invokes vitest itself, so no heartbeat is needed.
<home>/running-pi/agents/rp-qa.md:174:- File: `/tmp/rp-qa-<timestamp>.heartbeat`
<home>/running-pi/agents/rp-qa.md:204:6. Validate version artifacts: `package.json`, `CHANGELOG.md`, `README.md` (if applicable). → See `<pidex-root>/rules/rp-qa/version-coherence-gate.md` before `QA Complete`.
<home>/running-pi/agents/rp-qa.md:258:route_to: rp-uat | rp-implementer | rp-planner | orchestrator | user
<home>/running-pi/agents/rp-qa.md:267:- **COMPLETE** → `rp-uat` when tests green, coverage adequate, and required smokes/evidence are complete.
<home>/running-pi/agents/rp-qa.md:268:- **FAILED** → `rp-implementer`, `gate: G2`, for implementation/test failures.
<home>/running-pi/agents/rp-qa.md:270:- **BLOCKED + missing test infrastructure planned poorly** → `rp-planner`.
<home>/running-pi/agents/rp-qa.md:277:When QA completes, check `agents.wiki.<project-name>/open-items.md` for deferred findings from earlier agents (rp-critic, rp-code-reviewer). If any are testable gaps (e.g. uncovered branches flagged by code reviewer), write tests to close before reporting QA Complete. Update `open-items.md` to mark addressed items resolved.
<home>/running-pi/agents/rp-qa.md:285:- **QA Failed (test failures / coverage gaps)** → back to `rp-implementer` with specific failing tests and coverage report. Implementer fixes, code reviewer re-reviews, QA re-runs.
<home>/running-pi/agents/rp-qa.md:286:- **QA Failed (missing test infrastructure)** → escalate to `rp-planner` if plan didn't account for required test setup (e.g. missing test database, external service mocks).
<home>/running-pi/evals/ui-gates/fixtures/qa-ui-missing-browser-evidence.md:3:agent_under_test: rp-qa
<home>/running-pi/evals/ui-gates/fixtures/qa-ui-missing-browser-evidence.md:5:expected_rule: rules/rp-qa/browser-level-smoke.md
<home>/running-pi/evals/ui-gates/fixtures/qa-ui-missing-browser-evidence.md:25:rp-qa must not emit final QA COMPLETE for this UI plan. Missing browser evidence should be BLOCKED or require orchestrator Playwright evidence collection.
<home>/running-pi/rules/rp-planner/value-statement-scope-alignment.md:3:PROC-NEW-35a | rp-planner
<home>/running-pi/rules/rp-planner/value-statement-scope-alignment.md:41:Plan 35 (post-migration-cleanup, 2026-04-25): Value Statement said "all stale `/v2/` references cleaned up" but initial Scope table covered 2 of 5+ references. rp-critic expanded scope at F-1, which was accepted — but the misalignment was avoidable at planning time. The critique correctly caught it, but that requires an extra round-trip.
<home>/running-pi/agents/README.md:1:# rp-* agents (bundled)
<home>/running-pi/agents/README.md:3:These Markdown files are the Running Pi specialist prompts, ported from the `running-claude` `rc-*` agents and renamed to the `rp-*` namespace.
<home>/running-pi/agents/README.md:10:Use rp_agent with agent=rp-planner and task=<full project/epic context>
<home>/running-pi/agents/README.md:13:The files intentionally retain the mature `agents.output/`, `agents.wiki.<project>/`, routing-block, and gate conventions from the original pipeline, but all agent and rule names should use the `rp-*` prefix.
<home>/running-pi/evals/ui-gates/fixtures/uat-g9-contradiction.md:19:route_to: rp-devops
<home>/running-pi/evals/ui-gates/fixtures/uat-g9-contradiction.md:28:Orchestrator must treat this as routing inconsistency. Do not start fake preview. Route to devops with documented correction when evidence is clear, or ask/re-run rp-uat to resolve.
<home>/running-pi/rules/rp-planner/ha-domain-derivation-guard.md:4:**Applies to:** rp-planner (plan authoring), rp-critic (review check)
<home>/running-pi/rules/rp-planner/ha-domain-derivation-guard.md:40:## rp-critic Check
<home>/running-pi/rules/rp-planner/ha-domain-derivation-guard.md:50:Validated in Plan 47: rp-critic M-1 caught that `HAEntity` has no `.domain` field. The implementer added test 16 (`"automatic_door.x"` must NOT count as `"automation"`) as a regression guard. Without this guard, an entity_id like `"automation_room.light"` would be misclassified as `"automation"` if the filter logic used `startsWith` instead of a split. The V-matrix row makes this class of bug immediately visible in CI.
<home>/running-pi/evals/ui-gates/fixtures/code-review-ui-parity-missing.md:3:agent_under_test: rp-code-reviewer
<home>/running-pi/evals/ui-gates/fixtures/code-review-ui-parity-missing.md:5:expected_rule: rules/rp-code-reviewer/ui-pattern-parity-review.md
<home>/running-pi/evals/ui-gates/fixtures/code-review-ui-parity-missing.md:28:rp-code-reviewer must add UI Pattern Parity Review and reject or raise MAJOR finding before QA.
<home>/running-pi/TODO.md:14:**Resume phrase**: `"weiter mit dashboard-as-home — rp-planner"`
<home>/running-pi/TODO.md:17:- CLI-delegates (rp-code-reviewer → codex, rp-uat → gemini) — Phase 1 infrastructure, source `1c1ab85`
<home>/running-pi/TODO.md:26:**Goal**: per-plan visibility on token consumption + $ cost per rp-* step. Show delegate savings explicitly.
<home>/running-pi/TODO.md:74:- [ ] **rp-retrospective template update** — new section "Cost Summary"
<home>/running-pi/TODO.md:75:  - Orchestrator runs `summarize.sh <plan-id>` before spawning rp-retrospective
<home>/running-pi/TODO.md:90:- [ ] **rp-retrospective → gemini** — doc-to-doc synthesis, low risk (~15 tool_uses savings/plan)
<home>/running-pi/TODO.md:91:- [ ] **rp-pi → gemini** — proposal generation from retro (~12 tool_uses savings/plan)
<home>/running-pi/TODO.md:92:  - Caveat: rp-pi emits G7 gate → user approval still needed, orchestrator enforces before applying changes
<home>/running-pi/TODO.md:93:- [ ] **rp-critic → gemini** — plan stress-test (~8 savings/plan)
<home>/running-pi/TODO.md:96:- [ ] **rp-security (Pre-Prod mode only) → codex** — security review for MSW-only / no-new-deps plans (~12 savings/plan)
<home>/running-pi/TODO.md:103:- `templates/cli-delegates/rp-retrospective.md`
<home>/running-pi/TODO.md:104:- `templates/cli-delegates/rp-pi.md`
<home>/running-pi/TODO.md:105:- `templates/cli-delegates/rp-critic.md`
<home>/running-pi/TODO.md:106:- `templates/cli-delegates/rp-security-preprod.md`
<home>/running-pi/TODO.md:156:- [ ] `rp-architect` Write-truncation on `system-architecture.md` — Plans 20+22+23 affected; Plan 25 used orchestrator-direct fallback. Root cause: large file + opus + Edit hallucination. Current workaround documented (PROC-NEW-10). No permanent fix yet — consider splitting system-architecture.md into per-release ADR-AP files if pattern recurs.
<home>/running-pi/TODO.md:158:- [ ] `rp-roadmap` Write-truncation on `product-roadmap.md` — same pattern as architect. Plan 25 succeeded with maxTurns:40 + Edit-only. Monitor next 2-3 plans; if stall-pack fixed it, close this item.
<home>/running-pi/rules/rp-planner/execution-profile-contract.md:3:PROC-NEW-EXECUTION-PROFILE | rp-planner
<home>/running-pi/rules/rp-planner/execution-profile-contract.md:59:| skip `rp-security` | API, auth, storage, filesystem, user input, dependency, secrets, outward error changes |
<home>/running-pi/rules/rp-planner/execution-profile-contract.md:60:| skip `rp-designer` | `ui-heavy` profile |
<home>/running-pi/rules/rp-planner/execution-profile-contract.md:61:| skip `rp-qa` | any product code change; may only downgrade to `qa-lite` for docs/test-data-only cases |
<home>/running-pi/rules/rp-planner/execution-profile-contract.md:62:| skip `rp-critic` | medium+ scope, multi-slice plan, API/security, UI-heavy, structural, high-risk release |
<home>/running-pi/rules/rp-planner/execution-profile-contract.md:63:| skip `rp-code-reviewer` | product code, API, persistence, UI-heavy, security-relevant changes |
<home>/running-pi/rules/rp-planner/execution-profile-contract.md:64:| skip `rp-uat` | UI, user-facing behavior, business-value validation |
<home>/running-pi/evals/ui-gates/fixtures/plan-table-ui-missing-checklist.md:3:agent_under_test: rp-critic
<home>/running-pi/evals/ui-gates/fixtures/plan-table-ui-missing-checklist.md:5:expected_rule: rules/rp-planner/table-ui-copy-contract.md
<home>/running-pi/evals/ui-gates/fixtures/plan-table-ui-missing-checklist.md:27:rp-critic must reject or flag the missing table checklist before implementation.
<home>/running-pi/rules/rp-planner/user-preview-requirement.md:3:PROC-NEW-UI-PREVIEW | rp-planner
<home>/running-pi/rules/rp-planner/user-preview-requirement.md:27:- User preview is mandatory after `rp-devops` Stage 1 local commit and before G4 (`push/local/hold/abort`).
<home>/running-pi/evals/ui-gates/fixtures/devops-non-ui-stage1-g4-ok.md:3:agent_under_test: rp-devops_or_orchestrator
<home>/running-pi/evals/ui-gates/fixtures/devops-non-ui-stage1-g4-ok.md:4:expected_rule: rules/rp-devops/post-stage1-ui-preview-before-g4.md
<home>/running-pi/evals/ui-gates/fixtures/devops-non-ui-stage1-g4-ok.md:29:rp-devops may route to `rp-devops`, `gate: G4`, `preview_required_before_g4: no`.
<home>/running-pi/rules/rp-planner/branch-state-verification.md:3:PROC-NEW-35b | rp-planner
<home>/running-pi/rules/rp-planner/branch-state-verification.md:40:Plan 35 (post-migration-cleanup, 2026-04-25): Plan specified "continue on `tanstack-migration`" but that branch was merged and deleted at v0.9.0. rp-critic flagged it as R-4. The implementer correctly worked on `master` — but only because the critique caught the stale branch name. One `git branch --list` at plan-write time prevents this class of finding.
<home>/running-pi/evals/ui-gates/fixtures/plan-ui-missing-pattern-source.md:3:agent_under_test: rp-critic
<home>/running-pi/evals/ui-gates/fixtures/plan-ui-missing-pattern-source.md:5:expected_rule: rules/rp-critic/ui-quality-contract-check.md
<home>/running-pi/evals/ui-gates/fixtures/plan-ui-missing-pattern-source.md:31:rp-critic must flag missing pattern source under `UI Quality Contract Check`.
<home>/running-pi/rules/rp-planner/live-data-smoke-baseline.md:3:PROC-NEW-45b | rp-planner, rp-qa
<home>/running-pi/rules/rp-planner/live-data-smoke-baseline.md:31:## Enforcement (rp-qa)
<home>/running-pi/evals/ui-gates/fixtures/plan-ui-heavy-without-designer.md:3:agent_under_test: rp-designer_or_orchestrator
<home>/running-pi/evals/ui-gates/fixtures/plan-ui-heavy-without-designer.md:5:expected_rule: rules/rp-designer/ui-heavy-required.md
<home>/running-pi/evals/ui-gates/fixtures/plan-ui-heavy-without-designer.md:17:| rp-designer | YES | Form is simple. |
<home>/running-pi/evals/ui-gates/fixtures/plan-ui-heavy-without-designer.md:27:UI-heavy work must require rp-designer before implementation. Skipping designer should be rejected or blocked.
<home>/running-pi/rules/rp-planner/empty-state-api-contract.md:3:**Applies to:** rp-planner, rp-implementer
<home>/running-pi/evals/ui-gates/fixtures/qa-screenshot-without-selector-proof.md:3:agent_under_test: rp-qa
<home>/running-pi/evals/ui-gates/fixtures/qa-screenshot-without-selector-proof.md:5:expected_rule: rules/rp-qa/visual-proof-sufficiency.md
<home>/running-pi/evals/ui-gates/fixtures/qa-screenshot-without-selector-proof.md:25:rp-qa must not mark QA Complete for a UI placement fix from screenshot existence alone. It must require selector/container/placement evidence under Visual Proof Sufficiency.
<home>/running-pi/rules/rp-planner/index.md:1:# rp-planner Rules Index
<home>/running-pi/evals/ui-gates/fixtures/qa-hmr-console-unclassified.md:3:agent_under_test: rp-qa
<home>/running-pi/evals/ui-gates/fixtures/qa-hmr-console-unclassified.md:5:expected_rule: rules/rp-qa/dev-host-console-profile.md
<home>/running-pi/evals/ui-gates/fixtures/qa-hmr-console-unclassified.md:25:rp-qa must not mark browser evidence complete with relevant unclassified console errors on a named dev host.
<home>/running-pi/evals/ui-gates/fixtures/uat-g9-missing-ui-evidence.md:3:agent_under_test: rp-uat
<home>/running-pi/evals/ui-gates/fixtures/uat-g9-missing-ui-evidence.md:5:expected_rule: rules/rp-uat/ui-evidence-before-g9.md
<home>/running-pi/evals/ui-gates/fixtures/uat-g9-missing-ui-evidence.md:17:route_to: rp-devops
<home>/running-pi/evals/ui-gates/fixtures/uat-g9-missing-ui-evidence.md:29:rp-uat must block G9 until browser evidence, screenshots, user flow evidence, and required designer audit exist.
<home>/running-pi/rules/rp-planner/ui-intent-boundary-parity.md:1:# rp-planner Rule — UI Intent Boundary and Existing UI Parity
<home>/running-pi/analysis/home-daniel-homelab/plan-74-20260507T170332Z-pipeline-analysis.md:9:| Started | 2026-05-07T12:33:28Z (rp-planner) |
<home>/running-pi/analysis/home-daniel-homelab/plan-74-20260507T170332Z-pipeline-analysis.md:10:| Completed | 2026-05-07T13:30:28Z (rp-pi) |
<home>/running-pi/analysis/home-daniel-homelab/plan-74-20260507T170332Z-pipeline-analysis.md:28:- rp-code-reviewer caught the 503 → static-fallback bug before QA/UAT — exactly the right gate to catch a no-false-clear violation; ui-pattern-parity-review rule paid off.
<home>/running-pi/analysis/home-daniel-homelab/plan-74-20260507T170332Z-pipeline-analysis.md:29:- rp-security correctly scoped to api-security, ran fallow signal, gave concise APPROVED — appropriate friction for a read-only route.
<home>/running-pi/analysis/home-daniel-homelab/plan-74-20260507T170332Z-pipeline-analysis.md:38:| 4 planner rounds for one contract | metrics: rp-planner spawned 4× (r1, r2, r3, r4); critic rejected r1, r3 | ~6 min + ~$1.20 in planner+critic loops | Stronger critic check on binding-vs-validation contradiction (see Existing Coverage) |
<home>/running-pi/analysis/home-daniel-homelab/plan-74-20260507T170332Z-pipeline-analysis.md:78:| Implementer ran wrong test command and hit framework startup error | None at run time | Plan didn't pin validation command; implementer chose convenience path | Already fixed: `rules/rp-implementer/root-validation-command-first.md` (PROC-NEW-2 from pi follow-up). Monitor next 3 runs |
<home>/running-pi/analysis/home-daniel-homelab/plan-74-20260507T170332Z-pipeline-analysis.md:79:| Code review found real 503-fallback bug; QA tests would not have caught it (UI consumer covered partial degraded but not all-unavailable nav path) | Partial — `ui-pattern-parity-review.md` for code-reviewer fired correctly | Plan V-matrix didn't require an "all-unavailable nav assertion" test row | Already fixed: `rules/rp-code-reviewer/all-unavailable-nav-assertion.md` (PROC-NEW-3). Recommend mirroring as a planner V-matrix row requirement so tests are written, not just checked |
<home>/running-pi/analysis/home-daniel-homelab/plan-74-20260507T170332Z-pipeline-analysis.md:86:| Critic: enumeration-completeness check (when plan lists fixed N items, binding tables must cover N rows or declare "applies to all") | refine-existing-rule (rp-critic strictness on `ui-pattern-source-contract` / `ui-intent-boundary-parity`) | medium | running-pi/rules/rp-critic | low — additive critic check |
<home>/running-pi/analysis/home-daniel-homelab/plan-74-20260507T170332Z-pipeline-analysis.md:87:| Planner self-lint: validation/AC rows must cite binding-table cell IDs verbatim, not paraphrase | refine-existing-rule (extend `degraded-badge-contract-table.md` from PROC-NEW-1) | medium | running-pi/rules/rp-planner | low — small format constraint |
<home>/running-pi/analysis/home-daniel-homelab/plan-74-20260507T170332Z-pipeline-analysis.md:88:| Planner V-matrix mirror of code-reviewer's all-unavailable-nav-assertion (so tests get written, not just checked at review) | new-rule | low-medium | running-pi/rules/rp-planner | low — explicit AC row, no behavior change |
<home>/running-pi/evals/ui-gates/fixtures/orchestrator-ui-placement-ambiguous.md:20:The orchestrator must not route directly to rp-implementer. It must run the UI design interview branch, ask targeted placement/container/reference questions, and persist a UI Intent Contract or route to `user` until resolved.
<home>/running-pi/evals/ui-gates/fixtures/plan-agent-copy-semantics-missing.md:3:agent_under_test: rp-critic
<home>/running-pi/evals/ui-gates/fixtures/plan-agent-copy-semantics-missing.md:5:expected_rule: rules/rp-planner/table-ui-copy-contract.md
<home>/running-pi/evals/ui-gates/fixtures/plan-agent-copy-semantics-missing.md:24:rp-critic must require copy correction or a Copy Semantics Contract. UI copy must not imply an active LLM/agent path when behavior is deterministic.
<home>/running-pi/rules/rp-planner/plan-lint-preflight.md:3:PROC-NEW-69-2 | rp-planner
<home>/running-pi/rules/rp-planner/plan-lint-preflight.md:18:Planner MUST add a compact `Plan Lint Preflight` section and resolve all FAIL rows before routing to `rp-critic`.
<home>/running-pi/evals/ui-gates/fixtures/devops-ui-stage1-preview-before-g4.md:3:agent_under_test: rp-devops_or_orchestrator
<home>/running-pi/evals/ui-gates/fixtures/devops-ui-stage1-preview-before-g4.md:4:expected_rule: rules/rp-devops/post-stage1-ui-preview-before-g4.md
<home>/running-pi/evals/ui-gates/fixtures/devops-ui-stage1-preview-before-g4.md:31:rp-devops/orchestrator must block G4 and run post-devops G9 preview first. Expected routing: `route_to: orchestrator`, `gate: G9`, `preview_required_before_g4: yes`. G4 may only be asked after user approves preview.
<home>/running-pi/rules/rp-planner/multi-spawn-tag-hold.md:3:**Applies to:** rp-planner
<home>/running-pi/rules/rp-planner/multi-spawn-tag-hold.md:16:| **Hold** | Tag not yet pushed by any prior Spawn | "v<X.Y.Z> tag is held; rp-devops Stage 2 will push it after this Spawn commits." |
<home>/running-pi/rules/rp-planner/multi-spawn-tag-hold.md:26:A Spawn B plan that does NOT include a "Version Tag Strategy" section and whose target release was already partially tagged by a prior plan. rp-critic should flag this as a structural gap if present.
<home>/running-pi/evals/ui-gates/fixtures/plan-ui-missing-screenshot-mobile-a11y.md:3:agent_under_test: rp-critic
<home>/running-pi/evals/ui-gates/fixtures/plan-ui-missing-screenshot-mobile-a11y.md:5:expected_rule: rules/rp-critic/ui-quality-contract-check.md
<home>/running-pi/evals/ui-gates/fixtures/plan-ui-missing-screenshot-mobile-a11y.md:28:rp-critic must flag missing screenshot matrix, mobile UI contract, and accessibility baseline before implementation.
<home>/running-pi/rules/rp-planner/tool-registry-naming-table.md:3:PROC-NEW-50-3 | rp-planner
<home>/running-pi/evals/ui-gates/fixtures/uat-g9-not-applicable.md:3:agent_under_test: rp-uat
<home>/running-pi/evals/ui-gates/fixtures/uat-g9-not-applicable.md:5:expected_rule: agents/rp-uat.md
<home>/running-pi/evals/ui-gates/fixtures/uat-g9-not-applicable.md:23:route_to: rp-devops
<home>/running-pi/evals/ui-gates/fixtures/uat-g9-not-applicable.md:32:rp-uat should not force G9 when plan says G9 not applicable or project has no dev server/visible UI preview.
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T163808Z-pipeline-analysis.md:74:| UI Intent interview: explicit "redesign vs preserve" question with binding constraint | rule update | high | rules/rp-designer + interview template | low |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T163808Z-pipeline-analysis.md:75:| Move post-impl designer audit before CR on ui-heavy profile | routing | medium | rules/orchestrator + rp-designer | low |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T163808Z-pipeline-analysis.md:77:| Plan-versioning: mark superseded plans + single `current-plan` pointer | hygiene | medium | rules/rp-planner | low |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T163808Z-pipeline-analysis.md:80:| Plan-lint: reject plans whose "reuse pattern" anchors don't resolve to actual file paths/screenshots | linter | medium | rules/rp-planner/plan-lint-preflight (already exists, extend) | low |
<home>/running-pi/rules/rp-planner/fixture-derivation.md:3:PROC-NEW-X1 | rp-planner
<home>/running-pi/rules/rp-planner/fixture-derivation.md:11:   - Project-specific grep command and file paths: `agents.wiki.<project>/rules/rp-planner.md`
<home>/running-pi/rules/rp-planner/fixture-derivation.md:27:If the active project has `agents.wiki.<project>/rules/rp-planner.md`, load it for:
<home>/running-pi/rules/rp-planner/screenshot-artifact-directory-contract.md:3:PROC-NEW-54-3 | rp-planner
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T170013Z-pipeline-analysis.md:11:| Agent count | ~120 spawn entries across rp-architect, rp-planner, rp-critic, rp-designer, rp-implementer, rp-code-reviewer, rp-security, rp-qa, rp-uat, rp-devops, rp-retrospective, rp-roadmap, rp-pi |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T170013Z-pipeline-analysis.md:32:- Final retro + roadmap + rp-pi process-lessons handoffs ran cleanly — the post-release lane is healthy.
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T170013Z-pipeline-analysis.md:38:| Designer used as post-impl auditor instead of pre-impl preview | First designer spawn at 20:44 produced spec only; first *audit* (rp-designer REJECTED) at 22:01 after full implementation + QA cycle | Wasted ~3 implementer + 3 code-review + 2 QA spawns on a UI direction the user later rejected at G9 | Tighten orchestrator rule: when UI Preservation Class is ambiguous OR plan touches existing visible screen, mandate disposable design snippet preview to user *before* first implementer spawn |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T170013Z-pipeline-analysis.md:39:| QA browser smoke port-conflict / fixture flakiness | rp-qa BLOCKED at 21:42 (port ownership conflict), again 22:17, plus three smoke selector failures (Slice C, blocker-panel, plan-phase, mini-card) | Each event cost a full QA + implementer + code-review re-loop | Add orchestrator-owned smoke preflight: free-port allocation + canonical deterministic fixture seed before first QA spawn |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T170013Z-pipeline-analysis.md:41:| Devops blocked twice on version lane | rp-devops BLOCKED 10:58 (version mismatch), 11:01 (lane unfinalized); orchestrator decided v0.29.0 ad-hoc at 11:13 | 2 wasted devops spawns, ~5min orchestrator detour | Add orchestrator pre-devops gate: resolve release lane / version artifacts at end of UAT, not at devops |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T170013Z-pipeline-analysis.md:55:| rp-architect → rp-planner | OK | Single architecture lock held |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T170013Z-pipeline-analysis.md:56:| rp-planner → rp-critic | OK on first round; loop 2× critic before designer | Critic v1 caught real roadmap collision |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T170013Z-pipeline-analysis.md:57:| rp-designer (pre-impl) | UNDERUSED | Spec produced but no user-facing preview/snippet despite UI-heavy classification |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T170013Z-pipeline-analysis.md:58:| rp-implementer ↔ rp-code-reviewer | OK technically; waste from upstream UI churn | TDD honored |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T170013Z-pipeline-analysis.md:59:| rp-qa browser smoke | FRAGILE | 3 separate flake/selector failures across plan |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T170013Z-pipeline-analysis.md:60:| rp-uat | Working as gate | Correctly blocked twice on missing designer audit |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T170013Z-pipeline-analysis.md:61:| rp-designer (post-impl audit) | OVERUSED | Acted as the actual UI direction setter — too late |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T170013Z-pipeline-analysis.md:62:| rp-devops | Blocked twice on version | Lane decision should be upstream |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T170013Z-pipeline-analysis.md:63:| rp-retrospective → rp-pi | Healthy | Post-release lane functioned |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T170013Z-pipeline-analysis.md:83:| QA browser smoke port/fixture instability | Partial — Playwright Smoke AC + UI Screenshot Matrix rules | Rules cover *what to capture*, not *infra to capture reliably* | Add orchestrator-owned smoke preflight script (free-port + fixture reset) invoked before first rp-qa spawn |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T170013Z-pipeline-analysis.md:90:| Mandatory disposable design preview before implementer for class C/D or post-G9 reject | refine-existing-rule (Disposable Design Snippet Preview) | high | running-pi orchestrator + rp-designer | low — rule already exists |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T170013Z-pipeline-analysis.md:92:| Auto-escalate Retro Mode on 2nd corrective sub-plan | refine-existing-rule (Retro Mode Contract) | medium | running-pi rp-planner | low |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T170013Z-pipeline-analysis.md:93:| Smoke preflight: free-port + canonical fixture seed before first rp-qa | new tool/script | medium | running-pi scripts/preview + rp-qa | low |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T170013Z-pipeline-analysis.md:95:| Demote secondary critic/CR lane to advisory-only when primary APPROVED | analytics + routing | low | running-pi rp-critic / rp-code-reviewer | medium — may miss edge cases |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T170013Z-pipeline-analysis.md:103:- Retro + roadmap + rp-pi post-release lane — clean and useful.
<home>/running-pi/rules/rp-planner/g9-applicability-declaration.md:3:**Applies to:** rp-planner
<home>/running-pi/rules/rp-planner/g1-dirty-release-artifact-ownership-slice.md:18:| `<path>` | `rp-...` | `stage-1|stage-2|post-release` | `<command/evidence>` |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-016-20260507T170509Z-pipeline-analysis.md:30:- Retro Mode `full` declared up-front, with concrete post-retro handoffs (rp-pi, rp-planner, rp-roadmap) recorded.
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-016-20260507T170509Z-pipeline-analysis.md:82:| TDD table required on test-only typecheck hotfix | `rp-implementer` TDD compliance section required by CR | No bypass for test-only / devops-blocker fixes | Refine TDD-table requirement: allow `N/A — test-only fix, no production behavior` row for narrow scopes (existing pattern used in plan-016 reconciliation worked fine) |
<home>/running-pi/evals/metrics/fixtures/plan-020b-routing.md:16:route_to: rp-roadmap
<home>/running-pi/rules/rp-planner/tdd-budget-multiplier.md:3:**Applies to:** rp-planner
<home>/running-pi/rules/rp-planner/artifact-existence-preflight.md:3:PROC-NEW-026-1 | rp-planner
<home>/running-pi/analysis/plans/pipeline-analyst-findings-bundle-1-plan.md:75:rules/rp-planner/ui-label-source-contract.md
<home>/running-pi/analysis/plans/pipeline-analyst-findings-bundle-1-plan.md:105:rules/rp-uat/visible-text-semantic-check.md
<home>/running-pi/analysis/plans/pipeline-analyst-findings-bundle-1-plan.md:126:rules/rp-planner/binding-id-validation-references.md
<home>/running-pi/analysis/plans/pipeline-analyst-findings-bundle-1-plan.md:148:rules/rp-critic/enumeration-completeness-check.md
<home>/running-pi/analysis/plans/pipeline-analyst-findings-bundle-1-plan.md:170:rules/rp-code-reviewer/tdd-table-narrow-hotfix-escape.md
<home>/running-pi/analysis/plans/pipeline-analyst-findings-bundle-1-plan.md:252:2. Should TDD N/A escape be owned by rp-code-reviewer only, or also rp-implementer?
<home>/running-pi/rules/rp-planner/consumer-audit.md:3:PROC-NEW-49-2 | rp-planner
<home>/running-pi/rules/rp-planner/consumer-audit.md:44:Plan 49 (editable-network-items, 2026-04-28): rp-code-reviewer rejected the first pass
<home>/running-pi/rules/rp-planner/consumer-audit.md:69:- Complements `new-endpoint-msw-handler-audit.md` (rp-implementer equivalent)
<home>/running-pi/rules/rp-planner/ui-screenshot-matrix-contract.md:3:PROC-NEW-UI-SCREENSHOT-MATRIX | rp-planner
<home>/running-pi/evals/retro-mode/fixtures/docs-only-retro-none.md:3:agent_under_test: rp-critic
<home>/running-pi/evals/retro-mode/fixtures/docs-only-retro-none.md:5:expected_rule: rules/rp-critic/retro-mode-safety-check.md
<home>/running-pi/evals/retro-mode/fixtures/docs-only-retro-none.md:24:rp-critic may approve. No full retro needed.
<home>/running-pi/rules/rp-planner/llm-infra-prompt-context.md:3:PROC-NEW-50-2 | rp-planner
<home>/running-pi/evals/retro-mode/fixtures/security-marker-omitted-from-handoff.md:3:agent_under_test: rp-devops
<home>/running-pi/evals/retro-mode/fixtures/security-marker-omitted-from-handoff.md:35:rp-devops must grep/search relevant artifact roots, find the scoped marker for the current plan, and route to full retrospective.
<home>/running-pi/rules/rp-planner/layout-parity-element-ref.md:3:PROC-NEW-034-2 | rp-planner
<home>/running-pi/rules/rp-planner/layout-parity-element-ref.md:30:Layout parity source: /projects → <aside> (implementer must snapshot exact class list before writing code — see rp-implementer layout-parity-dom-snapshot rule)
<home>/running-pi/evals/retro-mode/fixtures/g9-rejection-retro-mini.md:3:agent_under_test: rp-critic
<home>/running-pi/evals/retro-mode/fixtures/g9-rejection-retro-mini.md:5:expected_rule: rules/rp-critic/retro-mode-safety-check.md
<home>/running-pi/evals/retro-mode/fixtures/g9-rejection-retro-mini.md:25:rp-critic must reject. G9 rejection requires `Retro Mode: full` and rp-pi handoff.
<home>/running-pi/agents.output/qa/token-efficiency-optimization-plan-qa.md:18:rp-qa
<home>/running-pi/agents.output/qa/token-efficiency-optimization-plan-qa.md:69:Handing off to rp-uat for value delivery validation.
<home>/running-pi/agents.output/qa/token-efficiency-optimization-plan-qa.md:73:route_to: rp-uat
<home>/running-pi/rules/rp-planner/transitive-mock-dependency-audit.md:3:**Applies to:** rp-planner
<home>/running-pi/evals/retro-mode/fixtures/security-finding-retro-full.md:3:agent_under_test: rp-critic
<home>/running-pi/evals/retro-mode/fixtures/security-finding-retro-full.md:5:expected_rule: rules/rp-critic/retro-mode-safety-check.md
<home>/running-pi/evals/retro-mode/fixtures/security-finding-retro-full.md:17:Post-retro handoffs: rp-pi
<home>/running-pi/evals/retro-mode/fixtures/security-finding-retro-full.md:25:rp-critic may approve retro mode. Full retro and rp-pi handoff are correct.
<home>/running-pi/rules/rp-planner/version-bump-post-plan-d.md:18:## What rp-planner must do
<home>/running-pi/rules/rp-planner/version-bump-post-plan-d.md:23:3. If a plan author believes root should also be bumped, add an explicit §Version Policy Exception section and flag for rp-critic
<home>/running-pi/rules/rp-planner/version-bump-post-plan-d.md:25:## What rp-critic must do
<home>/running-pi/evals/retro-mode/fixtures/major-review-findings-retro-mini.md:3:agent_under_test: rp-critic
<home>/running-pi/evals/retro-mode/fixtures/major-review-findings-retro-mini.md:5:expected_rule: rules/rp-critic/retro-mode-safety-check.md
<home>/running-pi/evals/retro-mode/fixtures/major-review-findings-retro-mini.md:16:- rp-code-reviewer finding count: Critical 0, Major 2, Minor 0.
<home>/running-pi/evals/retro-mode/fixtures/major-review-findings-retro-mini.md:22:rp-critic must reject or require full retro/PI handling. Two Major findings are a high-signal delivery/process incident even if the final re-review passes.
<home>/running-pi/rules/rp-planner/concurrency-ordering-pseudocode.md:3:PROC-NEW-50-5 | rp-planner
<home>/running-pi/evals/retro-mode/fixtures/stale-marker-unrelated-plan.md:3:agent_under_test: rp-devops
<home>/running-pi/evals/retro-mode/fixtures/stale-marker-unrelated-plan.md:26:rp-devops must not blindly upgrade the current plan to full retro. The marker is scoped to another plan. If unscoped/unclear markers exist, record `UNSCOPED-MANDATORY-RETRO-MARKER` and inspect/ask.
<home>/running-pi/agents.output/implementation/token-efficiency-optimization-plan.md:99:route_to: rp-code-reviewer
<home>/running-pi/rules/rp-planner/monorepo-migration-prechecks.md:38:If audit surfaces call-sites with non-trivial migration strategy (option (a)/(c) with runtime plumbing needed), mark those sections `**REQUIRES ARCHITECT**` and consult rp-architect before finalizing.
<home>/running-pi/evals/retro-mode/fixtures/retro-mini-late-g9-trigger.md:3:agent_under_test: rp-devops_or_orchestrator
<home>/running-pi/evals/retro-mode/fixtures/retro-mini-late-g9-trigger.md:23:Devops/orchestrator must not honor stale mini mode. Full rp-retrospective → rp-pi required.
<home>/running-pi/rules/rp-planner/waitfor-requery-constraint.md:4:**Applies to:** rp-planner  
<home>/running-pi/rules/rp-planner/route-security-contract-table.md:3:PROC-NEW-61-1 | rp-planner
<home>/running-pi/agents.output/critiques/parallel-lanes-iteration1-locking-plan-critique.md:12:**Critic**: rp-critic
<home>/running-pi/agents.output/critiques/parallel-lanes-iteration1-locking-plan-critique.md:19:| 2026-05-01 | rp-critic | initial review | Initial critique: 4 MEDIUM + 2 LOW, APPROVED_WITH_COMMENTS |
<home>/running-pi/agents.output/critiques/parallel-lanes-iteration1-locking-plan-critique.md:20:| 2026-05-01 | rp-critic | re-review after remediation | M1/M2/M3/M4/L2 addressed; L1 OPEN LOW non-blocking; verdict → APPROVED |
<home>/running-pi/agents.output/critiques/parallel-lanes-iteration1-locking-plan-critique.md:44:**Rev 2**: Slice 3 enumerates exact migration targets: `running-pi-instructions.md`, `skills/runningpi/SKILL.md`; explicit zero for `agents/rp-*.md` (documentation-binding only, no logic changes). M4 closed.
<home>/running-pi/agents.output/critiques/parallel-lanes-iteration1-locking-plan-critique.md:97:**Description**: Slice 3 enumerates exact targets: (1) `running-pi-instructions.md`, (2) `skills/runningpi/SKILL.md`; explicit zero for `agents/rp-*.md` — documentation binding only, no logic changes in Iteration 1.
<home>/running-pi/agents.output/critiques/parallel-lanes-iteration1-locking-plan-critique.md:142:| 1 | 2026-05-01 | rp-critic | Initial critique: 4 MEDIUM + 2 LOW findings, APPROVED_WITH_COMMENTS |
<home>/running-pi/agents.output/critiques/parallel-lanes-iteration1-locking-plan-critique.md:143:| 2 | 2026-05-01 | rp-critic | Re-review after remediation: M1/M2/M3/M4/L2 ADDRESSED; L1 OPEN (LOW, non-blocking); verdict → APPROVED |
<home>/running-pi/rules/rp-planner/artifact-authority-test-matrix.md:3:PROC-NEW-1 | rp-planner
<home>/running-pi/rules/rp-planner/artifact-authority-test-matrix.md:16:Missing matrix => plan incomplete. Do not route to rp-critic.
<home>/running-pi/agents.output/critiques/token-efficiency-optimization-plan-critique.md:60:route_to: rp-implementer
<home>/running-pi/rules/rp-planner/playwright-smoke-ac.md:3:PROC-NEW (UI-smoke) | rp-planner
<home>/running-pi/rules/rp-planner/playwright-smoke-ac.md:14:...plan MUST name **Playwright-based Browser-Level Smoke** as dedicated acceptance-criteria row under "Runtime Smoke". Do NOT let rp-qa default to curl-only for UI work.
<home>/running-pi/rules/rp-planner/playwright-smoke-ac.md:25:|                  | Verified via Playwright MCP in rp-qa Phase 2. |
<home>/running-pi/rules/rp-planner/playwright-smoke-ac.md:28:rp-critic MUST flag UI plans omitting this row. Post-hydration counterpart to curl-based smoke — complementary, not redundant.
<home>/running-pi/rules/rp-planner/plan-pre-submission-checklist.md:3:**Applies to:** rp-planner  
<home>/running-pi/rules/rp-planner/plan-pre-submission-checklist.md:12:Before writing the final version of any plan doc and marking it ready for rp-critic.
<home>/running-pi/rules/rp-planner/plan-pre-submission-checklist.md:69:Eliminates first-cycle rejections on formatting and naming style. The critic still applies its full analysis — but on substance (scope, completeness, feasibility), not on predictable style issues that rp-planner can self-audit.
<home>/running-pi/evals/pi-runner/fixtures/pi-runner-json-message-end.jsonl:1:{"type":"tool_execution_start","toolName":"read","args":{"path":"agents/rp-planner.md"}}
<home>/running-pi/evals/pi-runner/fixtures/pi-runner-json-message-end.jsonl:3:{"type":"message_end","message":{"role":"assistant","model":"openai-codex/gpt-5.3-codex","content":[{"type":"text","text":"done\n<!-- ROUTING\nverdict: COMPLETE\nroute_to: rp-critic\ncontext_file: agents.output/planning/001-demo.md\n-->"}],"usage":{"input":10,"output":5,"cacheRead":100,"cacheWrite":2,"cost":{"total":0.001}},"stopReason":"stop"}}
<home>/running-pi/rules/rp-planner/msw-handler-scope-audit.md:3:PROC-NEW-36a | rp-planner
<home>/running-pi/rules/rp-planner/release-lane-taxonomy-collision-handling.md:3:PROC-NEW-026-3A | rp-planner
<home>/running-pi/agents.output/uat/token-efficiency-optimization-plan-uat.md:43:route_to: rp-devops
<home>/running-pi/rules/rp-planner/retro-mode-contract.md:3:PROC-NEW-RETRO-MODE | rp-planner
<home>/running-pi/rules/rp-planner/retro-mode-contract.md:16:Post-retro handoffs: <none | rp-pi | rp-planner | rp-roadmap | rp-architect, ...>
<home>/running-pi/rules/rp-planner/retro-mode-contract.md:25:| `full` | release close, G9 rejection, security finding, process finding, major review rejection loop, multi-agent failure, agent stall/recovery, user escalation, high-risk-release | `rp-retrospective` doc + `rp-pi` processing |
<home>/running-pi/rules/rp-planner/retro-mode-contract.md:41:- `rp-pi` only when process improvements exist or full retro runs.
<home>/running-pi/rules/rp-planner/retro-mode-contract.md:42:- `rp-planner` only when planning insights exist.
<home>/running-pi/rules/rp-planner/retro-mode-contract.md:43:- `rp-roadmap` only when product/backlog/project improvement findings exist.
<home>/running-pi/rules/rp-planner/retro-mode-contract.md:44:- `rp-architect` only when architecture patterns/decisions need evergreen docs.
<home>/running-pi/agents.output/analysis/parallel-agent-lanes-design.md:21:1. **Serial:** `rp-planner` creates the plan + lane definitions
<home>/running-pi/agents.output/analysis/parallel-agent-lanes-design.md:22:2. **Parallel:** per lane, run `rp-implementer` (optionally followed per lane by `rp-code-reviewer`, `rp-qa`)
<home>/running-pi/agents.output/analysis/parallel-agent-lanes-design.md:24:4. **Serial Gates:** global `rp-uat` + G9 + `rp-devops` + Retro/PI
<home>/running-pi/agents.output/analysis/parallel-agent-lanes-design.md:45:      "worktree": ".worktrees/rp-58-l1",
<home>/running-pi/agents.output/analysis/parallel-agent-lanes-design.md:98:- extend `agents/rp-planner.md`: optional `Parallel Lanes` section
<home>/running-pi/agents.output/analysis/parallel-agent-lanes-design.md:120:- run `rp-implementer` per lane in parallel (N configurable, e.g. 2)
<home>/running-pi/agents.output/analysis/parallel-agent-lanes-design.md:132:- then global serial sequence: `rp-code-reviewer`/`rp-qa`/`rp-uat`/G9
<home>/running-pi/rules/rp-planner/adapter-lazy-init-requirement.md:3:PROC-NEW-50-1 | rp-planner
<home>/running-pi/agents.output/code-review/token-efficiency-optimization-plan-code-review.md:45:route_to: rp-qa
<home>/running-pi/rules/rp-planner/external-api-endpoint-verification.md:3:PROC-NEW-50-4 | rp-planner
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:17:| rp-planner | 5 | 6462.6 | 103.0 | 64.0 | 40.0% | 20.0% |
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:18:| rp-implementer | 8 | 5067.1 | 319.9 | 279.6 | 12.5% | 12.5% |
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:19:| rp-qa | 6 | 4145.2 | 210.2 | 34.2 | 33.3% | 33.3% |
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:20:| rp-devops | 5 | 3559.8 | 246.8 | 114.3 | 20.0% | 20.0% |
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:21:| rp-pi | 3 | 3728.3 | 115.7 | 72.5 | 0.0% | 0.0% |
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:22:| rp-security | 6 | 2897.0 | 161.0 | 63.5 | 16.7% | 16.7% |
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:23:| rp-code-reviewer | 4 | 3759.8 | 165.2 | 207.9 | 0.0% | 0.0% |
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:24:| rp-critic | 3 | 3045.3 | 146.3 | 106.9 | 0.0% | 0.0% |
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:25:| rp-designer | 2 | 3160.5 | 191.0 | 71.8 | 0.0% | 0.0% |
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:26:| rp-roadmap | 4 | 1676.8 | 100.5 | 181.9 | 0.0% | 0.0% |
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:27:| rp-uat | 2 | 2583.5 | 99.5 | 151.9 | 0.0% | 0.0% |
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:28:| rp-architect | 1 | 2906.0 | 380.0 | 103.9 | 0.0% | 0.0% |
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:34:1. rp-implementer|pi|openai-codex/gpt-5.3-codex — 30,430 tok, 0.58h
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:35:2. rp-code-reviewer|codex|gpt-5.5 — 15,039 tok, 0.23h
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:36:3. rp-qa|pi|openai-codex/gpt-5.3-codex — 14,797 tok
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:37:4. rp-planner|pi|openai-codex/gpt-5.3-codex — 12,980 tok
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:38:5. rp-security|pi|openai-codex/gpt-5.3-codex — 11,473 tok
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:39:6. rp-pi|pi|openai-codex/gpt-5.3-codex — 11,185 tok
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:40:7. rp-critic|codex|gpt-5.5 — 9,136 tok
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:41:8. rp-devops|pi|openai-codex/gpt-5.3-codex — 7,143 tok
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:42:9. rp-devops|claude|sonnet — 7,094 tok
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:43:10. rp-roadmap|claude|sonnet — 6,707 tok
<home>/running-pi/rules/rp-planner/env-credential-conflict-check.md:3:PROC-NEW-36d | rp-planner
<home>/running-pi/rules/rp-planner/env-credential-conflict-check.md:22:This is NOT a secrets issue — placeholder values are not secrets. rp-security scans for real
<home>/running-pi/rules/rp-planner/env-credential-conflict-check.md:39:## Scope distinction from rp-security
<home>/running-pi/rules/rp-planner/env-credential-conflict-check.md:41:rp-security covers: real secrets (API keys, passwords, tokens) in committed files.
<home>/running-pi/rules/rp-planner/env-credential-conflict-check.md:43:native auth. These are orthogonal concerns. rp-security will NOT flag ANTHROPIC_API_KEY=placeholder
<home>/running-pi/agents.output/deployment/v0.1-token-efficiency.md:55:- Re-run rp-devops in git repo clone.
<home>/running-pi/rules/rp-planner/derived-display-assertions.md:3:PROC-NEW-44b | rp-planner
<home>/running-pi/rules/rp-planner/status-enum-ui-audit.md:3:PROC-NEW-50-7 | rp-planner
<home>/running-pi/dashboard/scripts/server.py:424:          MAX(CASE WHEN ar.route_to IN ('rp-roadmap','user') OR ar.verdict = 'Released' OR (ar.agent IN ('rp-devops','rp-roadmap','rp-pi') AND ar.verdict IN ('COMPLETE','APPROVED')) THEN ar.timestamp END) AS completed_at,
<home>/running-pi/dashboard/scripts/server.py:529:                      AND (ar.agent IN ('rp-devops','rp-roadmap','rp-pi') OR ar.route_to IN ('rp-roadmap','user') OR ar.verdict IN ('Released','COMPLETE'))
<home>/running-pi/dashboard/scripts/server.py:568:                      MAX(CASE WHEN ar.agent IN ('rp-devops','rp-roadmap','rp-pi') OR ar.route_to IN ('rp-roadmap','user') OR ar.verdict IN ('Released','COMPLETE') THEN ar.timestamp END) AS completed_at,
<home>/running-pi/dashboard/scripts/server.py:593:                      MAX(CASE WHEN ar.agent IN ('rp-devops','rp-roadmap','rp-pi') OR ar.route_to IN ('rp-roadmap','user') OR ar.verdict IN ('Released','COMPLETE') THEN ar.timestamp END) AS completed_at,
<home>/running-pi/dashboard/scripts/server.py:660:                      WHERE ar.agent = 'rp-planner' {where}
<home>/running-pi/dashboard/scripts/server.py:765:                    is_continuation = r.get('agent') == 'rp-implementer' and v in ('BLOCKED','IN_PROGRESS')
<home>/running-pi/rules/rp-planner/seed-data-prerequisite.md:3:PROC-NEW-034-3 | rp-planner
<home>/running-pi/agents.output/planning/sandcastle-vs-runningpi-executor-integration-plan.md:9:Compare the `mattpocock/sandcastle` agent mechanics with `running-pi` and safely adopt suitable technical patterns into `running-pi` as an internal executor layer — without replacing the existing `rp-*` process model (`Plan -> Critique -> Implement -> Code Review -> QA -> UAT -> DevOps`).
<home>/running-pi/agents.output/planning/sandcastle-vs-runningpi-executor-integration-plan.md:14:- Comparison matrix for `running-pi rp-*` roles ↔ Sandcastle templates/workflows.
<home>/running-pi/agents.output/planning/sandcastle-vs-runningpi-executor-integration-plan.md:22:- Complete replacement of the `rp-*` agents.
<home>/running-pi/agents.output/planning/sandcastle-vs-runningpi-executor-integration-plan.md:31:| 1 | Context comparison + architecture decision package | Mapping doc with adoptability per feature (`running-pi` vs Sandcastle) | rp-architect |
<home>/running-pi/agents.output/planning/sandcastle-vs-runningpi-executor-integration-plan.md:32:| 2 | Pilot design | Minimal execution blueprint including guidelines, error catalog, policy and interface draft | rp-architect + rp-planner |
<home>/running-pi/agents.output/planning/sandcastle-vs-runningpi-executor-integration-plan.md:33:| 3 | Pilot run | End-to-end pilot `planner -> implementer -> reviewer` on a non-critical feature | rp-implementer |
<home>/running-pi/agents.output/planning/sandcastle-vs-runningpi-executor-integration-plan.md:34:| 4 | Governance integration | Integrate guidelines into Running-Pi rules/templates and define approval prerequisite for continuation | rp-pi + rp-devops |
<home>/running-pi/agents.output/planning/sandcastle-vs-runningpi-executor-integration-plan.md:75:- The `rp-*` pipeline contracts (`Routing`, artifact structure, status conventions) remain untouched.
<home>/running-pi/rules/rp-planner/mobile-ui-contract.md:3:PROC-NEW-MOBILE-UI-CONTRACT | rp-planner
<home>/running-pi/rules/rp-planner/rtl-subtab-selector-pattern.md:3:**Applies to:** rp-planner, rp-implementer
<home>/running-pi/agents.output/planning/rp-61-pipeline-routing-guardrails.md:56:route_to: rp-implementer
<home>/running-pi/agents.output/planning/rp-61-pipeline-routing-guardrails.md:58:context_file: agents.output/planning/rp-61-pipeline-routing-guardrails.md
<home>/running-pi/rules/rp-planner/ui-accessibility-baseline.md:3:PROC-NEW-UI-A11Y-BASELINE | rp-planner
<home>/running-pi/agents.output/planning/parallel-lanes-iteration1-locking-plan.md:21:- Parallel `rp-implementer` spawns.
<home>/running-pi/agents.output/planning/parallel-lanes-iteration1-locking-plan.md:39:  "owner": "orchestrator|rp-planner|script-name",
<home>/running-pi/agents.output/planning/parallel-lanes-iteration1-locking-plan.md:40:  "resource": "next-id|plan-58|branch-rp-58-l1",
<home>/running-pi/agents.output/planning/parallel-lanes-iteration1-locking-plan.md:122:  3. No changes to `agents/rp-*.md` logic in Iteration 1 (documentation binding only).
<home>/running-pi/rules/rp-planner/msw-test-local-registration.md:3:PROC-NEW-44a | rp-planner
<home>/running-pi/agents.output/planning/token-efficiency-optimization-plan.md:29:| 0 | Baseline measurement | Token usage baseline captured for top workflows | None | rp-implementer |
<home>/running-pi/agents.output/planning/token-efficiency-optimization-plan.md:30:| 1 (Tracer) | Prompt/context compaction on one high-volume flow | End-to-end reduction proven with stable output quality | Slice 0 | rp-implementer |
<home>/running-pi/agents.output/planning/token-efficiency-optimization-plan.md:31:| 2 | Reuse + dedupe shared context blocks | Reduced repeated tokens across flows | Slice 1 | rp-implementer |
<home>/running-pi/agents.output/planning/token-efficiency-optimization-plan.md:32:| 3 | Rollout + guardrails | Compaction policy applied across remaining in-scope flows with fallback controls | Slice 2 | rp-implementer |
<home>/running-pi/agents.output/planning/token-efficiency-optimization-plan.md:33:| 4 | Release prep | Version artifacts aligned to `v0.1-token-efficiency` and release notes updated | Slice 3 | rp-implementer |
<home>/running-pi/rules/rp-planner/orchestrator-critical-finding-log.md:3:**PROC-NEW:** 47-1 (companion to rp-critic version-label-resolution-path)
<home>/running-pi/rules/rp-planner/orchestrator-critical-finding-log.md:9:When the orchestrator resolves a critique CRITICAL finding via briefing note rather than triggering a planner revision loop (Path A per rp-critic `version-label-resolution-path.md`), the orchestrator **must** append a one-line changelog entry to the plan doc before spawning the implementer.
<home>/running-pi/rules/rp-planner/orchestrator-critical-finding-log.md:16:| <YYYY-MM-DD> | Critique C-<N> resolved: <one-line description>; plan not amended — implementer briefed directly | rp-orchestrator |
<home>/running-pi/rules/rp-planner/orchestrator-critical-finding-log.md:21:| 2026-04-27 | Critique C-1 resolved: version label corrected from v0.9.8 to v0.10.1; plan body not amended — implementer briefed with correct target | rp-orchestrator |
<home>/running-pi/rules/rp-planner/orchestrator-critical-finding-log.md:26:When a critique CRITICAL is resolved without a plan amendment, the closed plan doc retains stale metadata. A future reader (or rp-planner revisiting the plan as a reference) sees inconsistent version numbers without context. The changelog entry closes the paper trail gap.
<home>/running-pi/rules/rp-planner/timing-fix-ac-full-suite-runs.md:4:**Applies to:** rp-planner  
<home>/running-pi/rules/rp-planner/protocol-pseudocode-binding.md:3:PROC-NEW-50-6 | rp-planner
<home>/running-pi/rules/rp-planner/cli-spawn-path-invariant.md:3:PROC-NEW-36c | rp-planner
<home>/running-pi/rules/rp-planner/env-var-naming.md:3:**Applies to:** rp-planner writing plans with environment variable references
<home>/running-pi/rules/rp-planner/env-var-naming.md:68:- Rule: rp-planner/bd-binding-review-contract.md (companion specificity rule)
<home>/running-pi/rules/orchestrator/ui-design-interview-gate.md:3:When a user request includes UI placement, hierarchy, layout, or pattern-parity ambiguity, the orchestrator MUST resolve the ambiguity before routing to `rp-planner`, `rp-designer`, or `rp-implementer`.
<home>/running-pi/rules/orchestrator/ui-design-interview-gate.md:64:- If resolved and UI-heavy/new pattern, route to `rp-designer` or `rp-planner` with the UI Intent Contract path.
<home>/running-pi/rules/orchestrator/ui-design-interview-gate.md:65:- If resolved and trivial UI-small, route to `rp-planner` with the contract embedded.
<home>/running-pi/dashboard/public/index.html:115:function App(){const topRef=useRef(null);const [tab,setTab]=useState(localStorage.getItem('rp-motion-tab')||'analytics'),[sub,setSub]=useState(localStorage.getItem('rp-motion-sub')||'quality'),[project,setProjectRaw]=useState(localStorage.getItem('rp-motion-project')||'');const [data,reload]=useAllData(project);const summary=data.summary||{};useLayoutEffect(()=>{const update=()=>{if(topRef.current)document.documentElement.style.setProperty('--top-fixed-height',`${Math.ceil(topRef.current.getBoundingClientRect().height)}px`)};update();const ro=new ResizeObserver(update);if(topRef.current)ro.observe(topRef.current);window.addEventListener('resize',update);return()=>{ro.disconnect();window.removeEventListener('resize',update)}},[tab,sub,data.projects?.length]);useEffect(()=>{document.documentElement.classList.toggle('liquid-glass-enabled',!!window.LiquidGlassContainer)},[]);useEffect(()=>{if(project && data.projects && !visibleProjects(data.projects).some(p=>p.name===project)){setProjectRaw('');localStorage.setItem('rp-motion-project','')}},[data.projects,project]);const setProject=v=>{setProjectRaw(v);localStorage.setItem('rp-motion-project',v)};const pickTab=t=>{setTab(t);localStorage.setItem('rp-motion-tab',t)};const pickSub=s=>{setSub(s);localStorage.setItem('rp-motion-sub',s)};return <><SquareField/><div className="top-fixed" ref={topRef}><Header data={data} reload={reload}/><div className="top-fixed-inner"><Panel className="project-panel top-menu"><ProjectMenu projects={data.projects||[]} project={project} setProject={setProject}/><nav className="tabs menu-tabs">{tabs.map(([id,label])=><motion.button key={id} className={`tab ${tab===id?'active':''}`} whileHover={{y:-2}} whileTap={{scale:.97}} onClick={()=>pickTab(id)}>{label}</motion.button>)}</nav>{tab==='analytics'&&<div className="submenu" style={{marginTop:8}}>{subtabs.map(([id,label])=><button key={id} className={`action ${sub===id?'active':''}`} onClick={()=>pickSub(id)}>{label}</button>)}</div>}</Panel><Panel className="status-card compact"><CompletionBox data={data}/></Panel></div></div><main className="app">{data.error&&<Panel className="card full bad">{String(data.error.message||data.error)}</Panel>}<AnimatePresence mode="wait"><motion.div key={tab+'-'+sub} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>{tab==='analytics'&&<><div className="grid" style={{marginBottom:16}}><Metric label="Projects" value={summary.projects}/><Metric label="Pipeline runs" value={summary.pipeline_runs}/><Metric label="Pipeline events" value={summary.pipeline_events||0}/><Metric label="Agent runs" value={summary.agent_runs}/><Metric label="Secondary artifacts" value={summary.secondary_artifacts}/><Metric label="Merge summaries" value={summary.merge_artifacts}/><Metric label="Malformed secondary" value={summary.malformed_secondary} cls={summary.malformed_secondary?'warn':'good'}/><Metric label="Estimated cost" value={money(summary.estimated_cost)}/></div>{sub==='quality'&&<Quality charts={data.charts}/>} {sub==='model-quality'&&<ModelQuality models={(data.modelQuality||{}).models||[]}/>} {sub==='pipelines'&&<Pipelines rows={data.pipelines||[]}/>} {sub==='analysis'&&<Analysis reports={data.analysisReports||[]} plans={data.analysisPlans||[]}/>} {sub==='secondary'&&<Secondary secondary={data.secondary}/>} {sub==='malformed'&&<Malformed rows={data.malformed||[]}/>} {sub==='runs'&&<Runs rows={data.runs||[]}/>}</>}{tab==='tokens'&&<TokenConsumption project={project}/>} {tab==='live'&&<Live live={data.live}/>} {tab==='limits'&&<Limits data={data} onRefresh={reload}/>}</motion.div></AnimatePresence></main></>}
<home>/running-pi/rules/rp-planner/bd-binding-review-contract.md:3:**Applies to:** rp-planner writing plans with behavioral bindings
<home>/running-pi/rules/rp-planner/bd-binding-review-contract.md:90:- Rule: rp-planner/env-var-naming.md (companion specificity rule)
<home>/running-pi/rules/orchestrator/ui-preservation-classifier.md:66:- If temporary preview is requested: route to rp-designer with design snippet preview instructions before full implementation.
<home>/running-pi/rules/orchestrator/g9-ui-rejection-delta.md:18:First create or request a rejection-delta artifact and route to rp-planner or rp-designer unless the fix is clearly mechanical.
<home>/running-pi/rules/orchestrator/g9-ui-rejection-delta.md:32:| Next route | rp-planner/rp-designer/rp-implementer |
<home>/running-pi/rules/orchestrator/g9-ui-rejection-delta.md:37:- Intent/layout mismatch → rp-designer or rp-planner.
<home>/running-pi/rules/orchestrator/g9-ui-rejection-delta.md:38:- Missing acceptance/invariant → rp-planner.
<home>/running-pi/rules/orchestrator/g9-ui-rejection-delta.md:39:- Visual direction unclear → rp-designer with temporary preview option.
<home>/running-pi/rules/orchestrator/g9-ui-rejection-delta.md:40:- Simple typo/spacing/selector bug → rp-implementer allowed.
<home>/running-pi/rules/orchestrator/post-devops-ui-preview-gate.md:5:For any UI-involved plan, the orchestrator MUST run a user preview gate after `rp-devops` Stage 1 local commit and before G4 release disposition.
<home>/running-pi/rules/orchestrator/post-devops-ui-preview-gate.md:21:rp-devops Stage 1 complete
<home>/running-pi/rules/orchestrator/post-devops-ui-preview-gate.md:26:→ reject: record MANDATORY-RETRO-TRIGGER and route to rp-implementer
<home>/running-pi/rules/orchestrator/post-devops-ui-preview-gate.md:45:Do NOT ask G4 (`push/local/hold/abort`) for UI-involved work until this post-devops preview is approved or user explicitly overrides preview as impossible. After approval, either ask G4 directly in the orchestrator or re-invoke `rp-devops` with the deployment doc/context stating `User Preview Before G4: APPROVED` so Stage 2 can present G4.
<home>/running-pi/rules/orchestrator/post-devops-ui-preview-gate.md:53:3. Route to `rp-implementer` with feedback.
<home>/running-pi/rules/orchestrator/post-devops-ui-preview-gate.md:54:4. Re-enter `rp-code-reviewer` → `rp-security` → `rp-qa` → `rp-uat` → `rp-devops` → post-devops preview.
<home>/running-pi/rules/orchestrator/background-agent-watchdog.md:3:**Applies to:** Orchestrator spawning rp-* subagents with long execution potential
<home>/running-pi/rules/orchestrator/background-agent-watchdog.md:7:**Evidence:** Plan 52 rp-qa hung unmonitored for 1h45m; orchestrator had zero visibility
<home>/running-pi/rules/orchestrator/background-agent-watchdog.md:12:- `rp-qa` on test suites >500 tests
<home>/running-pi/rules/orchestrator/background-agent-watchdog.md:13:- `rp-implementer` with >5 test files or known long-running TDD cycles
<home>/running-pi/rules/orchestrator/background-agent-watchdog.md:18:### Pre-Spawn: Vitest Pre-Collection (rp-qa only)
<home>/running-pi/rules/orchestrator/background-agent-watchdog.md:20:Before spawning `rp-qa`:
<home>/running-pi/rules/orchestrator/background-agent-watchdog.md:23:bash <pidex-root>/scripts/pre-spawn/rp-qa-prep.sh \
<home>/running-pi/rules/orchestrator/background-agent-watchdog.md:34:- Create heartbeat file path: `/tmp/rp-qa-<session-uuid>.heartbeat`
<home>/running-pi/rules/orchestrator/background-agent-watchdog.md:37:### Watchdog Heartbeat (rp-qa inline vitest)
<home>/running-pi/rules/orchestrator/background-agent-watchdog.md:43:   mkdir -p /tmp/rp-qa-heartbeats
<home>/running-pi/rules/orchestrator/background-agent-watchdog.md:44:   echo "$(date +%s) rp-qa <session-uuid> test <count>" > /tmp/rp-qa-<session-uuid>.heartbeat
<home>/running-pi/rules/orchestrator/background-agent-watchdog.md:60:- rp-qa with test suites >500 tests or >2 minute runtime
<home>/running-pi/rules/orchestrator/background-agent-watchdog.md:61:- rp-implementer TDD cycles with >5 test files
<home>/running-pi/rules/orchestrator/background-agent-watchdog.md:64:- rp-critic, rp-designer, rp-code-reviewer, rp-uat (non-deterministic output, no test suite)
<home>/running-pi/rules/orchestrator/background-agent-watchdog.md:65:- rp-qa on small suites (<500 tests, typical <30s runtime)
<home>/running-pi/rules/orchestrator/background-agent-watchdog.md:66:- rp-qa with pre-collected output provided
<home>/running-pi/rules/orchestrator/background-agent-watchdog.md:70:- ✓ rp-qa pre-spawn checklist enforced (rp-qa-prep.sh called BEFORE every spawn)
<home>/running-pi/rules/orchestrator/background-agent-watchdog.md:82:- Plan 52 retrospective: "rp-qa unmonitored background spawn (CRITICAL)"
<home>/running-pi/rules/orchestrator/background-agent-watchdog.md:83:- rp-qa-prep.sh script: Pre-collection checklist
<home>/running-pi/rules/orchestrator/background-agent-watchdog.md:84:- Rule: rp-planner/env-var-naming.md (context: companion rule from same retro)
<home>/running-pi/rules/orchestrator/legacy-plan-profile-migration.md:21:1. Route to `rp-planner` for a small plan revision.
<home>/running-pi/rules/orchestrator/legacy-plan-profile-migration.md:23:3. Run `rp-critic` again.
<home>/running-pi/rules/rp-devops/g9-preflight-kill-vite.md:3:PROC-NEW-48-4 | rp-devops
<home>/running-pi/rules/rp-devops/g9-preflight-kill-vite.md:18:Any time rp-devops (or the orchestrator) starts a dev server for a G9 preview gate.
<home>/running-pi/rules/orchestrator/mandatory-retro-trigger-log.md:33:- Security finding/exception: security doc and next implementer/devops briefing. `rp-security` must write the marker for `BLOCKED_PENDING_REMEDIATION`, `REJECTED`, major/high-risk `APPROVED_WITH_CONTROLS`, or user risk acceptance.
<home>/running-pi/rules/orchestrator/mandatory-retro-trigger-log.md:41:Search scoped markers first: current plan ID, UUID, or slug must match when available. If a scoped marker matches current plan, route to full `rp-retrospective` → `rp-pi`.
<home>/running-pi/rules/orchestrator/context-budget-guard.md:3:**Applies to:** orchestrator before every `rp-*` spawn
<home>/running-pi/rules/orchestrator/context-budget-guard.md:13:  --agent <rp-agent> \
<home>/running-pi/rules/rp-devops/index.md:1:# rp-devops Rules Index
<home>/running-pi/rules/rp-devops/running-pi-install-propagation.md:3:**Applies to:** rp-devops (Stage 1)  
<home>/running-pi/rules/rp-devops/running-pi-install-propagation.md:16:- `<pidex-root>/rules/<agent>/` rule files (though rp-pi usually writes these)
<home>/running-pi/rules/rp-devops/running-pi-install-propagation.md:52:`<pidex-root>/` is the canonical source for pipeline agent instructions, scripts, and rules. Project-level `.claude/agents/rp-*.md` files and `~/.claude/running-pi-instructions.md` are installed copies. Changes to source files have no effect until `install.sh` propagates them.
<home>/running-pi/rules/rp-devops/release-preflight-proof-line.md:7:Apply during rp-devops Stage 1 and Stage 2 for any release/tag/push decision.
<home>/running-pi/rules/rp-pipeline-analyst-template.md:1:# rp-pipeline-analyst Report Template
<home>/running-pi/rules/rp-devops/suppress-gate-in-direct-mode.md:3:PROC-NEW-49-3 | rp-devops (orchestrator-side)
<home>/running-pi/rules/rp-code-reviewer/live-only-msw-fallback-check.md:3:PROC-NEW-61-2 | rp-code-reviewer
<home>/running-pi/rules/rp-devops/post-stage1-ui-preview-before-g4.md:3:PROC-NEW-UI-PREVIEW | rp-devops
<home>/running-pi/rules/rp-devops/post-stage1-ui-preview-before-g4.md:7:After Stage 1 local commit, rp-devops must not route directly to G4 for UI-involved work. It must route to the orchestrator for post-devops user preview first.
<home>/running-pi/rules/rp-devops/post-stage1-ui-preview-before-g4.md:56:route_to: rp-devops
<home>/running-pi/rules/rp-devops/post-g9-fix-test-required.md:3:PROC-NEW-44d | rp-devops
<home>/running-pi/rules/rp-devops/post-g9-fix-test-required.md:8:a post-G9 fix commit exists — rp-devops Stage 1 must NOT proceed until a targeted test run
<home>/running-pi/rules/rp-code-reviewer/index.md:1:# rp-code-reviewer Rules Index
<home>/running-pi/rules/rp-code-reviewer/index.md:15:| Release-Prep Not Blocking | [release-prep-not-blocking.md](release-prep-not-blocking.md) | 50-8 | version bump and CHANGELOG absence is an n-level reminder, not an M-level blocking finding — rp-devops Stage 1 pre-flight is the appropriate gate for release-prep completeness |
<home>/running-pi/rules/rp-devops/e2e-port-owner-preflight-evidence.md:3:PROC-NEW-026-2 | rp-devops
<home>/running-pi/rules/rp-code-reviewer/investigation-budget-cap.md:3:PROC-NEW-2 (cap) | rp-code-reviewer
<home>/running-pi/rules/rp-qa/carry-forward-open-items.md:11:3. Format: `- [OPEN] **<finding-id>** — <one-line summary> Carry-forward from Plan <N>; recommended for Plan <M> or next available. (rp-qa, Plan <N>)`
<home>/running-pi/rules/rp-devops/execution-profile-diff-guard.md:3:PROC-NEW-DEVOPS-EXECUTION-PROFILE-DIFF | rp-devops
<home>/running-pi/rules/rp-devops/execution-profile-diff-guard.md:58:| `xs-docs`/docs-only profile but product code changed | `rp-code-reviewer` then `rp-qa` |
<home>/running-pi/rules/rp-devops/execution-profile-diff-guard.md:59:| security skipped but API/user input/auth/storage/dependency/secrets changed | `rp-security` |
<home>/running-pi/rules/rp-devops/execution-profile-diff-guard.md:60:| designer skipped but UI-heavy files/states changed | `rp-designer` |
<home>/running-pi/rules/rp-devops/execution-profile-diff-guard.md:61:| QA skipped/downgraded but product behavior changed | `rp-qa` |
<home>/running-pi/rules/rp-devops/execution-profile-diff-guard.md:62:| structural/runtime/build migration appears but no architect path | `rp-architect` or `rp-planner` |
<home>/running-pi/rules/rp-code-reviewer/release-prep-not-blocking.md:3:PROC-NEW-50-8 | rp-code-reviewer
<home>/running-pi/rules/rp-code-reviewer/release-prep-not-blocking.md:15:These artifacts are verified by rp-devops Stage 1 pre-flight, which is the appropriate gate.
<home>/running-pi/rules/rp-qa/index.md:1:# rp-qa Rules Index
<home>/running-pi/rules/rp-qa/index.md:17:| Pre-Collect Test Output | [pre-collect-test-output.md](pre-collect-test-output.md) | 36e / 49-1 | On projects with >**1000** tests, orchestrator MUST pre-collect vitest output before spawning rp-qa (threshold raised 100→1000 by PROC-NEW-49-1) |
<home>/running-pi/rules/rp-qa/index.md:20:| Playwright Smoke Baseline (Live Data) | [../rp-planner/live-data-smoke-baseline.md](../rp-planner/live-data-smoke-baseline.md) | 45b | When executing a V-row that asserts live data appearance: clear storage, assert count=0 before trigger, assert count=N after; inconclusive if pre-existing fixture data present |
<home>/running-pi/rules/rp-code-reviewer/hotfix-lane-runtime-unchanged-proof.md:3:PROC-NEW-3 | rp-code-reviewer
<home>/running-pi/rules/rp-code-reviewer/deferred-scope-check.md:3:PROC-NEW-13 | rp-code-reviewer
<home>/running-pi/rules/rp-analyst/index.md:1:# rp-analyst Rules Index
<home>/running-pi/rules/rp-analyst/index.md:7:*No extracted rules yet. rp-analyst has no learned PROC-NEW edge cases beyond Output Discipline (core, stays inline).*
<home>/running-pi/rules/rp-code-reviewer/ui-pattern-parity-review.md:3:PROC-NEW-UI-PATTERN-PARITY | rp-code-reviewer
<home>/running-pi/rules/rp-code-reviewer/ui-pattern-parity-review.md:55:- MAJOR parity failures → `REJECTED`, route to `rp-implementer`.
<home>/running-pi/rules/rp-code-reviewer/ui-pattern-parity-review.md:56:- Ambiguous design-source conflict → `BLOCKED` or route to `rp-designer`.
<home>/running-pi/rules/rp-qa/screenshot-artifact-directory-enforcement.md:3:PROC-NEW-54-4 | rp-qa
<home>/running-pi/rules/rp-qa/screenshot-artifact-directory-enforcement.md:7:When rp-qa captures screenshots/snapshots/browser evidence, files MUST be written only to the project artifact directory:
<home>/running-pi/rules/rp-qa/timing-fix-full-suite-required.md:4:**Applies to:** rp-qa  
<home>/running-pi/rules/rp-code-reviewer/execution-profile-diff-guard.md:3:PROC-NEW-EXECUTION-PROFILE-DIFF | rp-code-reviewer
<home>/running-pi/rules/rp-code-reviewer/execution-profile-diff-guard.md:32:| designer skipped | UI-heavy files/states added | REJECT; route to rp-designer or rp-implementer to narrow scope |
<home>/running-pi/rules/rp-code-reviewer/execution-profile-diff-guard.md:33:| security skipped | API/user input/auth/storage/dependency changed | route to rp-security |
<home>/running-pi/rules/rp-code-reviewer/execution-profile-diff-guard.md:34:| standard-feature | runtime/build/architecture changed | route to rp-architect or rp-planner |
<home>/running-pi/rules/rp-qa/browser-stall-fallback.md:3:PROC-NEW-25 | rp-qa
<home>/running-pi/rules/rp-qa/browser-stall-fallback.md:9:`verdict: FAILED` signals rp-implementer to enter a fix loop. A browser budget stall is not an implementation failure — it is a QA infrastructure constraint. `verdict: COMPLETE` would incorrectly allow rp-uat/G9 without browser evidence. The orchestrator must collect browser evidence, append it to the QA doc, then resume/reroute QA or UAT.
<home>/running-pi/rules/rp-qa/browser-stall-fallback.md:44:- `FAILED` → orchestrator routes to rp-implementer → unnecessary fix loop
<home>/running-pi/rules/rp-qa/browser-stall-fallback.md:45:- `COMPLETE` → orchestrator may route to rp-uat/G9 without required browser evidence
<home>/running-pi/rules/rp-qa/browser-stall-fallback.md:54:4. If browser smoke passes, route to rp-uat with the updated QA doc.
<home>/running-pi/rules/rp-qa/browser-stall-fallback.md:55:5. If browser smoke fails, route to rp-implementer with the failing browser evidence.
<home>/running-pi/rules/rp-qa/browser-stall-fallback.md:65:Plans 29, 30, 31, 32, 34: rp-qa stalled on browser testing in all five plans. Orchestrator handled via Playwright MCP each time — but improvised (no documented protocol). This rule documents the protocol so rp-qa emits a clean ROUTING signal rather than stalling silently or emitting ambiguous output.
<home>/running-pi/rules/rp-code-reviewer/large-diff-batching.md:3:PROC-NEW-2 (enforcement) | rp-code-reviewer
<home>/running-pi/rules/rp-code-reviewer/large-diff-batching.md:18:This is the Plan 32 stall pattern: rp-qa entered broad read phase, produced no QA doc findings, stalled. Same applies to code reviewer reading large diffs — open-ended reading loop before Write = primary stall trigger.
<home>/running-pi/rules/rp-security/index.md:1:# rp-security Rules Index
<home>/running-pi/rules/rp-qa/pre-cr-ui-proof-packet.md:3:PROC-NEW-69-1 | rp-qa / orchestrator
<home>/running-pi/rules/rp-code-reviewer/draft-routing.md:3:PROC-NEW-1 (enforcement) | rp-code-reviewer
<home>/running-pi/rules/rp-code-reviewer/draft-routing.md:14:route_to: rp-security
<home>/running-pi/rules/rp-qa/authority-change-full-suite-isolation-gate.md:3:PROC-NEW-2 | rp-qa
<home>/running-pi/rules/rp-qa/authority-change-full-suite-isolation-gate.md:16:- Missing isolation proof or full-suite fail => QA FAILED/BLOCKED. Return to rp-implementer.
<home>/running-pi/rules/rp-qa/visual-proof-sufficiency.md:51:Negative rows must cover plausible false positives such as already-latest rows, generic/device-like rows, hidden rows, or out-of-scope statuses. If the audit is missing or ambiguous, route `BLOCKED` to `rp-implementer` or `rp-planner` rather than sending to UAT.
<home>/running-pi/rules/rp-qa/visual-proof-sufficiency.md:64:Route to `rp-implementer` for implementation gaps, `rp-planner`/`rp-designer` for ambiguous intent, or `orchestrator`/`user` when a UI Intent Contract is missing.
<home>/running-pi/rules/rp-uat/ui-evidence-before-g9.md:3:PROC-NEW-UI-EVIDENCE-G9 | rp-uat
<home>/running-pi/rules/rp-uat/ui-evidence-before-g9.md:29:| Complete and passing | UAT may approve and route to `rp-devops`, `gate: G9` |
<home>/running-pi/rules/rp-uat/ui-evidence-before-g9.md:30:| Missing browser evidence | `BLOCKED`, route to `rp-qa` or `user`/orchestrator for browser evidence collection |
<home>/running-pi/rules/rp-uat/ui-evidence-before-g9.md:31:| Browser evidence fails | `REJECTED`, route to `rp-implementer` with evidence |
<home>/running-pi/rules/rp-uat/ui-evidence-before-g9.md:32:| Designer audit required but missing | `BLOCKED`, route to `rp-designer` |
<home>/running-pi/rules/rp-qa/risk-logic-coverage-followup.md:3:PROC-NEW-61-3 | rp-qa
<home>/running-pi/rules/rp-critic/ui-quality-contract-check.md:3:PROC-NEW-UI-QUALITY-CONTRACT | rp-critic
<home>/running-pi/rules/rp-critic/ui-quality-contract-check.md:11:rp-critic MUST reject or comment on UI plans that lack a verifiable UI Quality Contract.
<home>/running-pi/rules/rp-uat/g9-port-in-context.md:3:PROC-NEW-44c | rp-uat
<home>/running-pi/rules/rp-qa/runtime-smoke.md:3:PROC-NEW (runtime-smoke) | rp-qa
<home>/running-pi/rules/rp-qa/runtime-smoke.md:7:For any plan changing **HTTP routes**, **build/packaging tooling**, **cwd semantics** (monorepo moves, workspace boundaries, `process.cwd()`-dependent code), or introducing a **new network-facing listener** (proxy, server, socket binding), rp-qa MUST run a **Runtime Smoke Phase** in addition to standard test-suite.
<home>/running-pi/rules/rp-critic/version-label-resolution-path.md:4:**Applies to:** rp-critic (classification), orchestrator (resolution decision)
<home>/running-pi/rules/rp-critic/version-label-resolution-path.md:9:When rp-critic raises a CRITICAL finding for version label mismatch (plan targets a version that differs from current `package.json` or deployment context), the critique doc **must classify the finding** using one of two resolution paths:
<home>/running-pi/rules/rp-critic/version-label-resolution-path.md:18:Resolution: Orchestrator resolves by passing corrected version target in the implementer briefing note. **No planner revision loop.** Orchestrator must also append a one-line changelog entry to the plan doc (see PROC-NEW-47-3 / `orchestrator-critical-finding-log.md` in rp-planner rules).
<home>/running-pi/rules/rp-critic/version-label-resolution-path.md:27:Resolution: Critique verdict is REJECTED. Orchestrator routes back to rp-planner for a plan amendment before proceeding.
<home>/running-pi/rules/rp-uat/index.md:1:# rp-uat Rules Index
<home>/running-pi/rules/rp-qa/pre-collect-test-output.md:1:# Rule: Pre-Collect Test Output Before rp-qa Invocation
<home>/running-pi/rules/rp-qa/pre-collect-test-output.md:3:PROC-NEW-36e / PROC-NEW-49-1 | rp-qa
<home>/running-pi/rules/rp-qa/pre-collect-test-output.md:8:vitest run output and provide it in the rp-qa briefing. The QA agent MUST NOT run the test
<home>/running-pi/rules/rp-qa/pre-collect-test-output.md:12:> Plan 40 (1242 tests) and Plan 49 (1413 tests) both caused rp-qa to exceed 1 hour and be
<home>/running-pi/rules/rp-qa/pre-collect-test-output.md:25:Briefing format (orchestrator provides to rp-qa):
<home>/running-pi/rules/rp-qa/pre-collect-test-output.md:74:rp-qa stalled post-run for a second time on this project (1242 tests). The rule was written
<home>/running-pi/rules/rp-qa/pre-collect-test-output.md:82:rp-qa exceeded 1 hour and was killed on this project (1413 tests). The orchestrator had not
<home>/running-pi/rules/rp-qa/pre-collect-test-output.md:83:pre-collected vitest output, causing rp-qa to run the full suite internally. Root cause:
<home>/running-pi/rules/rp-qa/pre-collect-test-output.md:89:Plan 36 (chat-llm-wiring, 2026-04-25): First rp-qa invocation exhausted budget after writing
<home>/running-pi/rules/rp-critic/dep-pruning-lockfile-check.md:3:PROC-NEW-23 | rp-critic
<home>/running-pi/rules/rp-critic/dep-pruning-lockfile-check.md:9:A dep-pruning slice that only edits `package.json` (removing packages) without specifying `npm install` / lockfile regen leaves the lockfile stale. Stale lockfile = removed packages' CVEs persist in the pinned lockfile. rp-security will catch this, but the critic gate is earlier and cheaper.
<home>/running-pi/rules/rp-critic/dep-pruning-lockfile-check.md:31:Stale lockfile retains CVEs for removed packages; rp-security will catch this as a must-fix.
<home>/running-pi/rules/rp-critic/dep-pruning-lockfile-check.md:42:Plan 34 (plan-d-nextjs-removal): S4 dep-pruning slice had no lockfile regen step. rp-security caught CVE F-1 from the stale lockfile. Required an unplanned Stage 1 fix. The critic gate would have caught this earlier with zero pipeline disruption.
<home>/running-pi/rules/rp-uat/visual-proof-before-g9.md:17:UAT MUST NOT approve G9/release when the chain says only "screenshots attached" but does not prove the disputed claim. Route back to `rp-qa` for evidence collection, or to `rp-planner`/`rp-designer`/`user` when visual intent is still ambiguous.
<home>/running-pi/rules/rp-qa/phase1-sequencing-gate.md:3:PROC-NEW-3 | rp-qa
<home>/running-pi/rules/rp-qa/phase1-sequencing-gate.md:17:Plan 32: rp-qa entered Playwright before Phase 1 doc was complete — minor budget waste, recoverable only because QA completed. Treat Phase 1 doc write as a hard gate, not a soft preference.
<home>/running-pi/rules/rp-critic/index.md:1:# rp-critic Rules Index
<home>/running-pi/rules/rp-uat/semantic-ui-fit.md:1:# rp-uat Rule — Semantic UI Fit Check
<home>/running-pi/rules/rp-uat/semantic-ui-fit.md:25:If UAT sees substantial UI/IA drift from the source-of-truth screen and the plan did not explicitly authorize that drift, route to rp-designer or rp-planner before G9.
<home>/running-pi/rules/rp-qa/global-hook-mutation-full-suite-smoke.md:3:PROC-NEW-2 | rp-qa
<home>/running-pi/rules/rp-critic/binding-semantic-check.md:3:PROC-NEW-X3 | rp-critic
<home>/running-pi/rules/rp-critic/binding-semantic-check.md:37:Load `agents.wiki.<project>/rules/rp-critic.md` for:
<home>/running-pi/rules/rp-critic/binding-semantic-check.md:43:A plan marked a Permissions fixture as "Binding — rp-uat will assert exact matches" with internal tooling names as domain identifiers. Structurally valid; semantically wrong. The binding enforced implementation-to-plan alignment, but the plan itself was wrong. G9 rejected twice. The critic gate is the correct place to catch this before implementation begins.
<home>/running-pi/rules/rp-critic/pif-resolution-path-check.md:3:PROC-NEW-24 | rp-critic
<home>/running-pi/rules/rp-critic/pif-resolution-path-check.md:53:Plan 34 (plan-d-nextjs-removal): PIF-24-2 (Chat LLM wiring) was included in scope without a confirmed implementation path for the TanStack Start server function approach. rp-critic correctly flagged it as BLOCKING; G1 was triggered; planner deferred to v0.9.1. The G1 loop cost ~45 minutes. This check moves the catch to critique, same output with zero pipeline disruption.
<home>/running-pi/rules/rp-qa/browser-level-smoke.md:3:PROC-NEW-QA-BROWSER-SMOKE | rp-qa
<home>/running-pi/rules/rp-qa/browser-level-smoke.md:51:If browser testing cannot complete because of tool budget, browser infrastructure, or dev-server constraints, use `browser-stall-fallback.md` exactly and route as `BLOCKED` for orchestrator browser evidence collection. Do not route to `rp-uat` until browser evidence has been appended.
<home>/running-pi/rules/rp-critic/msw-handler-scope-check.md:3:PROC-NEW-36b | rp-critic
<home>/running-pi/rules/rp-pi/index.md:1:# rp-pi Rules Index
<home>/running-pi/rules/rp-critic/retro-mode-safety-check.md:3:PROC-NEW-RETRO-MODE-SAFETY | rp-critic
<home>/running-pi/rules/rp-critic/retro-mode-safety-check.md:11:rp-critic MUST verify `Retro Mode` is declared and safe for plan risk. Missing or unsafe retro mode is a plan-quality finding.
<home>/running-pi/rules/rp-critic/retro-mode-safety-check.md:30:| Product/backlog findings route to `rp-pi` only | LOW | APPROVED_WITH_COMMENTS; route should include `rp-roadmap` |
<home>/running-pi/rules/rp-critic/retro-mode-safety-check.md:31:| No process findings but `rp-pi` required | LOW | APPROVED_WITH_COMMENTS; suggest removing unnecessary handoff |
<home>/running-pi/rules/rp-critic/retro-mode-safety-check.md:44:Post-retro handoffs: rp-pi
<home>/running-pi/rules/rp-critic/execution-profile-safety-check.md:3:PROC-NEW-EXECUTION-PROFILE-SAFETY | rp-critic
<home>/running-pi/rules/rp-critic/execution-profile-safety-check.md:11:rp-critic MUST verify the plan's `Execution Profile` and `Skipped Agents` declarations are present and safe. This rule does not require the orchestrator to skip agents; it prevents unsafe skip declarations from becoming accepted process guidance.
<home>/running-pi/rules/rp-critic/execution-profile-safety-check.md:34:| UI-heavy work skips `rp-designer` | CRITICAL | REJECTED |
<home>/running-pi/rules/rp-critic/execution-profile-safety-check.md:35:| API/user input/auth/storage/filesystem/dependency/secrets skips `rp-security` | CRITICAL | REJECTED |
<home>/running-pi/rules/rp-critic/execution-profile-safety-check.md:37:| Structural work lacks `rp-architect` profile/path | CRITICAL | REJECTED |
<home>/running-pi/rules/rp-critic/execution-profile-safety-check.md:44:If task opened with `rp-architect` and an ADR/findings doc already exists, that satisfies the `structural` profile's architect path. Do not require a duplicate architect pass unless the plan changed architecture scope after the ADR or critique finds a new unresolved architecture gap.
<home>/running-pi/rules/rp-critic/execution-profile-safety-check.md:56:If plan declares `ui-small` while these signals exist, raise profile mismatch and require `rp-designer` unless user explicitly narrows scope.
<home>/running-pi/rules/rp-critic/ui-intent-proof-contract-check.md:17:- If the plan can be fixed by planner from existing code, route to `rp-planner`.
<home>/running-pi/rules/rp-critic/ui-intent-proof-contract-check.md:18:- If the UI is heavy/new pattern and needs design judgement, route to `rp-designer`.
<home>/running-pi/rules/rp-roadmap/index.md:1:# rp-roadmap Rules Index
<home>/running-pi/rules/rp-critic/msw-test-local-registration.md:3:PROC-NEW-44a | rp-critic
<home>/running-pi/rules/rp-roadmap/release-lane-taxonomy-collision-handling.md:3:PROC-NEW-026-3B | rp-roadmap
<home>/running-pi/rules/rp-critic/how-leakage-examples.md:3:PROC-NEW-48-1 | rp-critic
<home>/running-pi/rules/rp-roadmap/version-label-sweep-at-plan-close.md:4:**Applies to:** rp-roadmap (post-devops handoff)
<home>/running-pi/rules/rp-roadmap/version-label-sweep-at-plan-close.md:9:After rp-devops closes a plan and tags a version, rp-roadmap **must** sweep `product-roadmap.md` for stale or duplicate version section headers **in the same post-retro handoff run** — not deferred to a later session.
<home>/running-pi/rules/rp-roadmap/version-label-sweep-at-plan-close.md:24:- rp-devops closes a plan (new version tagged), OR
<home>/running-pi/rules/rp-roadmap/version-label-sweep-at-plan-close.md:25:- rp-roadmap is invoked as a post-retro handoff agent.
<home>/running-pi/rules/rp-implementer/impl-doc-before-final-tests.md:3:PROC-NEW-35c | rp-implementer
<home>/running-pi/rules/rp-implementer/impl-doc-before-final-tests.md:26:The commit succeeds but the impl doc is never written. The next spawn sees a committed state but no impl doc, requiring orchestrator triage before rp-code-reviewer can run.
<home>/running-pi/rules/rp-implementer/impl-doc-before-final-tests.md:42:Plan 35 (post-migration-cleanup, 2026-04-25): rp-implementer completed all edits, ran tests, committed — then stalled before writing the impl doc. A second invocation was required solely to write the impl doc. The work was complete; only the handoff artifact was missing. Reordering doc-before-final-tests would have captured the impl doc in the first spawn.
<home>/running-pi/rules/rp-implementer/dep-pruning-lockfile-regen.md:3:PROC-NEW-23 | rp-implementer
<home>/running-pi/rules/rp-implementer/dep-pruning-lockfile-regen.md:39:Plan 34 (plan-d-nextjs-removal): S4 pruned `next`, `eslint-config-next`, and `tailwindcss@^3.x` from root `package.json` but did not regenerate the lockfile. rp-security caught the stale lockfile's CVEs as finding F-1. rp-devops Stage 1 regenerated it as a dedicated unplanned step. Both the security finding and the Stage 1 fixup were avoidable if S4 had included lockfile regen as an explicit step.
<home>/running-pi/rules/rp-implementer/red-phase-commit.md:3:PROC-NEW-45c | rp-implementer
<home>/running-pi/rules/rp-implementer/port-change-package-audit.md:3:PROC-NEW-22 | rp-implementer
<home>/running-pi/templates/cli-delegates/rp-critic.md:1:You are **rp-critic** for the running-pi pipeline.
<home>/running-pi/templates/cli-delegates/rp-critic.md:22:- **REJECTED**: One or more CRITICAL or BLOCKING findings. Must go back to rp-planner.
<home>/running-pi/templates/cli-delegates/rp-critic.md:63:- APPROVED → `route_to: rp-designer`
<home>/running-pi/templates/cli-delegates/rp-critic.md:64:- APPROVED_WITH_COMMENTS → `route_to: rp-designer`
<home>/running-pi/templates/cli-delegates/rp-critic.md:65:- REJECTED → `route_to: rp-planner`, add `gate: G1`
<home>/running-pi/rules/rp-implementer/index.md:1:# rp-implementer Rules Index
<home>/running-pi/rules/rp-implementer/index.md:27:| Draft ROUTING Cleanup | [../rp-designer/draft-routing-cleanup.md](../rp-designer/draft-routing-cleanup.md) | 41b | Final ROUTING block must overwrite IN_PROGRESS draft; no dual blocks in committed doc |
<home>/running-pi/templates/cli-delegates/rp-uat.md:1:You are **rp-uat** (Product Owner) for the running-pi pipeline.
<home>/running-pi/templates/cli-delegates/rp-uat.md:18:- **NOT APPROVED**: value gap identified — route back to rp-implementer (impl gap) or rp-planner (plan was wrong).
<home>/running-pi/rules/rp-implementer/noop-slice-explicit-flag.md:3:**Applies to:** rp-implementer  
<home>/running-pi/rules/rp-implementer/noop-slice-explicit-flag.md:29:   - `grep "check-heartbeat" <pidex-root>/scripts/pre-spawn/rp-qa-prep.sh` → found ✓
<home>/running-pi/templates/cli-delegates/rp-retrospective.md:1:You are **rp-retrospective** for the running-pi pipeline.
<home>/running-pi/templates/cli-delegates/rp-retrospective.md:12:6. **Process improvement recs** — Max 3 concrete `PROC-NEW-N: <agent> — <change>` recommendations for rp-pi.
<home>/running-pi/templates/cli-delegates/rp-retrospective.md:52:ROUTING block: always `verdict: COMPLETE`, `route_to: rp-pi`. Add `post_retro_handoffs` only for sections that have actual findings (comma-separated from: `rp-planner`, `rp-roadmap`, `rp-architect`).
<home>/running-pi/rules/rp-implementer/slice-completion-self-check.md:3:**Applies to:** rp-implementer
<home>/running-pi/templates/cli-delegates/rp-code-reviewer.md:1:You are **rp-code-reviewer** for the running-pi pipeline.
<home>/running-pi/templates/cli-delegates/rp-code-reviewer.md:14:8. **Security scope assessment** — Can rp-security be skipped? (UI-only + no new deps + no new auth + no new server code + no raw-HTML injection = skip-eligible.)
<home>/running-pi/rules/rp-implementer/block-comment-route-hazard.md:3:PROC-NEW-40a | rp-implementer
<home>/running-pi/rules/rp-implementer/block-comment-route-hazard.md:51:Plan 40 (network-live-data-wiring, 2026-04-26): rp-implementer wrote a block comment describing
<home>/running-pi/templates/cli-delegates/rp-designer.md:1:You are **rp-designer** for the running-pi pipeline.
<home>/running-pi/templates/cli-delegates/rp-designer.md:10:Fill the SKELETON with: verdict APPROVED, UI Scope Summary = "No UI components in plan scope. Auto-approved.", all other sections = "N/A". ROUTING: `verdict: APPROVED`, `route_to: rp-implementer`, `reason: No UI components in plan scope`.
<home>/running-pi/templates/cli-delegates/rp-designer.md:42:### CRITIQUE (design context from rp-critic — may be empty)
<home>/running-pi/templates/cli-delegates/rp-designer.md:65:- APPROVED / APPROVED_WITH_COMMENTS → `route_to: rp-implementer`
<home>/running-pi/templates/cli-delegates/rp-designer.md:66:- REJECTED → `route_to: rp-planner`
<home>/running-pi/rules/rp-implementer/query-key-invalidation-audit.md:3:PROC-NEW-48-2 | rp-implementer
<home>/running-pi/rules/rp-implementer/screenshot-artifact-path-guard.md:3:PROC-NEW-54-5 | rp-implementer
<home>/running-pi/rules/rp-implementer/screenshot-artifact-path-guard.md:7:If rp-implementer uses Playwright screenshots/snapshots for debugging or evidence, write artifacts only to the plan-bound artifact directory.
<home>/running-pi/rules/rp-implementer/route-deletion-test-audit.md:3:PROC-NEW-21 | rp-implementer
<home>/running-pi/rules/rp-implementer/skip-safety-pre-review-checklist.md:3:PROC-NEW-021-2 | rp-implementer
<home>/running-pi/rules/rp-implementer/fix-loop-scope-cap.md:3:PROC-NEW-14 | rp-implementer
<home>/running-pi/rules/rp-implementer/fix-loop-scope-cap.md:7:**More than 3 findings from rp-code-reviewer? Address at most 3 per fix spawn.**
<home>/running-pi/rules/rp-implementer/fix-loop-scope-cap.md:9:When receiving a REJECTED verdict from rp-code-reviewer with more than 3 findings, address only the 3 highest-priority findings in the current spawn. Emit ROUTING requesting a second fix spawn for remaining findings.
<home>/running-pi/rules/rp-implementer/fix-loop-scope-cap.md:17:On backward handoff from rp-code-reviewer REJECTED:
<home>/running-pi/rules/rp-implementer/stall-recovery.md:3:PROC-NEW-16 | rp-implementer
<home>/running-pi/rules/rp-implementer/stall-recovery.md:26:   route_to: rp-implementer
<home>/running-pi/rules/rp-implementer/external-api-live-verification.md:3:PROC-NEW-50-9 | rp-implementer
<home>/running-pi/templates/fallow-agent-checklist.md:12:## rp-implementer
<home>/running-pi/templates/fallow-agent-checklist.md:22:## rp-qa
<home>/running-pi/templates/fallow-agent-checklist.md:32:## rp-security
<home>/running-pi/templates/fallow-agent-checklist.md:41:## rp-architect / rp-planner
<home>/running-pi/templates/fallow-agent-checklist.md:50:## rp-devops
<home>/running-pi/rules/rp-implementer/state-mutating-idempotency-tests.md:3:PROC-NEW-60-2 | rp-implementer
<home>/running-pi/templates/lead-prompt.md:4:Substitute `<rp-planner | rp-architect>` and `<epic statement>` before passing.
<home>/running-pi/templates/lead-prompt.md:10:  - rp-architect
<home>/running-pi/templates/lead-prompt.md:11:  - rp-planner
<home>/running-pi/templates/lead-prompt.md:12:  - rp-critic
<home>/running-pi/templates/lead-prompt.md:13:  - rp-designer
<home>/running-pi/templates/lead-prompt.md:14:  - rp-implementer
<home>/running-pi/templates/lead-prompt.md:15:  - rp-code-reviewer
<home>/running-pi/templates/lead-prompt.md:16:  - rp-security
<home>/running-pi/templates/lead-prompt.md:17:  - rp-qa
<home>/running-pi/templates/lead-prompt.md:18:  - rp-uat
<home>/running-pi/templates/lead-prompt.md:19:  - rp-devops
<home>/running-pi/templates/lead-prompt.md:20:  - rp-retrospective
<home>/running-pi/templates/lead-prompt.md:21:  - rp-pi
<home>/running-pi/templates/lead-prompt.md:23:OPENING AGENT: <rp-planner | rp-architect>
<home>/running-pi/templates/lead-prompt.md:25:rp-architect: it writes an ADR to agents.wiki.<project>/decisions/ and findings to
<home>/running-pi/templates/lead-prompt.md:26:agents.output/architecture/, then routes to rp-planner. rp-planner reads the ADR as mandatory
<home>/running-pi/templates/lead-prompt.md:27:input. For Standard features and Bugfixes, OPENING AGENT is rp-planner (normal flow).
<home>/running-pi/templates/lead-prompt.md:38:Before spawning rp-critic, rp-code-reviewer, rp-uat, rp-retrospective, or rp-designer via the
<home>/running-pi/templates/lead-prompt.md:45:  2. Build /tmp/rp-inputs.json with the keys the template expects (see SKILL.md section 1b)
<home>/running-pi/templates/lead-prompt.md:46:  3. Run: bash <pidex-root>/scripts/delegate/dispatch.sh --agent <agent> --inputs /tmp/rp-inputs.json --output <output-path> --project-dir "$PWD"
<home>/running-pi/templates/lead-prompt.md:50:  Special case — rp-designer: skip delegation if plan has no UI scope (no "page/component/route/
<home>/running-pi/templates/lead-prompt.md:71:- "Starte mit rp-planner. Originiere Plan-ID 6." — reads as sequential delegation, not team formation. Lead falls back to classic subagent mode and Rule 1 is not exercised.
<home>/running-pi/rules/rp-implementer/changelog-ordering.md:3:PROC-NEW-X2 | rp-implementer
<home>/running-pi/rules/rp-implementer/msw-test-local-registration.md:3:PROC-NEW-44a | rp-implementer
<home>/running-pi/rules/rp-implementer/draft-routing.md:3:PROC-NEW-1 (enforcement detail) | rp-implementer
<home>/running-pi/rules/rp-implementer/draft-routing.md:14:route_to: rp-code-reviewer
<home>/running-pi/rules/rp-implementer/draft-routing.md:41:route_to: rp-code-reviewer
<home>/running-pi/rules/rp-implementer/draft-routing.md:66:Plan 40 (network-live-data-wiring, 2026-04-26): rp-implementer entered a debug loop on a
<home>/running-pi/rules/rp-implementer/layout-parity-dom-snapshot.md:3:PROC-NEW-034-1 | rp-implementer
<home>/running-pi/rules/rp-implementer/wiki-concept-update-required.md:17:Plans 40, 41, and 42 all contained explicit wiki concept update instructions (one-line entries in `agents.wiki.homelab/concepts/`). All three were deferred to "rp-retrospective or rp-pi will handle it." The cumulative effect is that the wiki diverges from the implementation: the concept doc documents Pattern V1 (first use) while the codebase has Pattern V1+V2+V3. The implementer has full context at implementation time; the retro/PI agent must reconstruct it afterward.
<home>/running-pi/rules/rp-implementer/red-green-non-tdd-evidence-block.md:3:PROC-NEW-1 | rp-implementer
<home>/running-pi/rules/rp-implementer/design-review-must-fix.md:3:PROC-NEW-11 | rp-implementer
<home>/running-pi/rules/rp-implementer/open-choice-pre-selection.md:3:**Applies to:** rp-implementer (governs acceptance of briefing-note choices)
<home>/running-pi/rules/rp-implementer/open-choice-pre-selection.md:22:Before spawning rp-implementer, the orchestrator should scan critic findings for any finding
<home>/running-pi/rules/rp-retrospective/index.md:1:# rp-retrospective Rules Index
<home>/running-pi/rules/rp-implementer/new-endpoint-msw-handler-audit.md:3:PROC-NEW-48-3 | rp-implementer
<home>/running-pi/rules/rp-designer/index.md:1:# rp-designer Rules Index
<home>/running-pi/rules/rp-retrospective/retro-mode.md:3:PROC-NEW-RETRO-MODE | rp-retrospective
<home>/running-pi/rules/rp-retrospective/retro-mode.md:7:rp-retrospective should run only for `Retro Mode: full` or when orchestrator/user explicitly requests a full retro after delivery.
<home>/running-pi/rules/rp-retrospective/retro-mode.md:13:| `none` | Do not run rp-retrospective. No retro doc. |
<home>/running-pi/rules/rp-retrospective/retro-mode.md:14:| `mini` | Do not run rp-retrospective by default. Mini retro belongs in QA/UAT/deployment summary. |
<home>/running-pi/rules/rp-retrospective/retro-mode.md:15:| `full` | Run rp-retrospective and route to rp-pi for process extraction. |
<home>/running-pi/rules/rp-designer/design-snippet-preview.md:1:# rp-designer Rule — Disposable Design Snippet Preview
<home>/running-pi/rules/rp-designer/draft-routing-cleanup.md:26:All agents using two-phase ROUTING (Rule 9c): rp-designer, rp-implementer, any agent emitting an IN_PROGRESS draft.
<home>/running-pi/rules/rp-designer/ui-heavy-required.md:3:PROC-NEW-UI-HEAVY-DESIGNER | rp-designer
<home>/running-pi/rules/rp-designer/ui-heavy-required.md:18:For `ui-heavy` plans, rp-designer review is mandatory before implementation. The design review MUST produce concrete pre-implementation specs and, when screenshots are required by plan, request post-implementation screenshot audit before QA/UAT.
<home>/running-pi/rules/rp-designer/ui-heavy-required.md:34:- Pre-implementation verdict `APPROVED` / `APPROVED_WITH_COMMENTS` routes to `rp-implementer`.
<home>/running-pi/rules/rp-designer/ui-heavy-required.md:36:- Post-implementation audit routes to `rp-qa` only after Must-Fix items are satisfied or explicitly deferred by user.
<home>/running-pi/rules/rp-architect/scripted-validation-matrix.md:3:PROC-NEW-ARCH-SCRIPTED-VALIDATION | rp-architect
<home>/running-pi/rules/rp-architect/index.md:1:# rp-architect Rules Index
<home>/running-pi/rules/rp-architect/index.md:15:PROC-NEW-5 (ADR-creation boundary) is structurally core to how rp-architect conserves tool budget. Remains inline in agent .md.
<home>/running-pi/rules/rp-architect/security-api-contract-preflight.md:3:PROC-NEW-60-1 | rp-architect

### rg pattern: runningpi
count: 53
<home>/running-pi/install.sh:36:printf '\nRun in Pi:\n  /reload\n  /runningpi <your task>\n'
<home>/running-pi/running-pi-instructions.md:270:**Opening agent depends on task classification.** Orchestrator pre-flight interview (see runningpi SKILL.md "Step 8 — Task classification") classify task into one of four buckets, pass opening-agent decision in lead's team prompt:
<home>/running-pi/running-pi-instructions.md:507:**Trigger:** `/runningpi` pre-flight (for recent-projects shortlist) or debugging missing history.
<home>/running-pi/SKILL.md:2:name: runningpi
<home>/running-pi/SKILL.md:3:description: Start a running-pi pipeline run. Prefer the package skill at skills/runningpi/SKILL.md. Invoke with /runningpi after installing this Pi package.
<home>/running-pi/SKILL.md:10:`<home>/running-pi/skills/runningpi/SKILL.md`
<home>/running-pi/SKILL.md:12:Use `/runningpi` in Pi after installing the package. The Pi extension provides the `/runningpi` command and `rp_agent` tool.
<home>/running-pi/scripts/lead/start.sh:135:# on the next /runningpi invocation. Epic is extracted from the prompt
<home>/running-pi/scripts/analysis/run-pipeline-analysis.sh:105:    'skills/runningpi/SKILL.md',
<home>/running-pi/scripts/evals/check-ui-gates.sh:125:require_text "skills/runningpi/SKILL.md" 'APPROVED` + `gate: none` / G9 not applicable'
<home>/running-pi/scripts/evals/check-ui-gates.sh:127:require_text "skills/runningpi/SKILL.md" 'If rp-uat emits `gate: G9` but the plan says G9 is not applicable'
<home>/running-pi/scripts/evals/check-ui-gates.sh:140:require_text "skills/runningpi/SKILL.md" 'Post-devops UI preview before G4 (mandatory)'
<home>/running-pi/scripts/evals/check-ui-gates.sh:147:require_text "skills/runningpi/SKILL.md" 'preview-lan-url-required.md'
<home>/running-pi/scripts/evals/check-parallel-secondary-lanes.sh:6:SKILL="$ROOT/skills/runningpi/SKILL.md"
<home>/running-pi/scripts/evals/check-execution-profile.sh:76:require_text "skills/runningpi/SKILL.md" 'Legacy plan migration'
<home>/running-pi/scripts/evals/check-execution-profile.sh:79:require_text "skills/runningpi/SKILL.md" 'route_to: orchestrator'
<home>/running-pi/scripts/evals/check-telegram-notify.sh:46:require_text "skills/runningpi/SKILL.md" 'Optional notify-only Telegram is allowed in direct mode'
<home>/running-pi/scripts/evals/check-telegram-notify.sh:47:require_text "skills/runningpi/SKILL.md" 'Pipeline complete'
<home>/running-pi/scripts/evals/check-telegram-notify.sh:48:require_text "skills/runningpi/SKILL.md" 'Pipeline failed'
<home>/running-pi/scripts/evals/check-telegram-notify.sh:49:require_text "skills/runningpi/SKILL.md" 'notify.sh --optional'
<home>/running-pi/scripts/evals/check-retro-mode.sh:38:require_text "skills/runningpi/SKILL.md" 'Retro Mode Closure'
<home>/running-pi/scripts/evals/check-retro-mode.sh:39:require_text "skills/runningpi/SKILL.md" 'MANDATORY-RETRO-TRIGGER: G9 rejection'
<home>/running-pi/scripts/evals/check-design-user-loop.sh:27:require_text "skills/runningpi/SKILL.md" "UI Preservation Classification"
<home>/running-pi/scripts/evals/check-design-user-loop.sh:28:require_text "skills/runningpi/SKILL.md" "designer meeting with a temporary preview"
<home>/running-pi/extensions/runningpi-fallow.ts:220:  const guardKey = "__runningpi_fallow_commands_registered__";
<home>/running-pi/extensions/runningpi-fallow.ts:281:    description: "Show recommended fallow commands per runningpi agent role",
<home>/running-pi/extensions/paused-pi/index.ts:235:		prompt: Type.String({ description: "The user prompt to send later, e.g. /runningpi resume pause-abc123" }),
<home>/running-pi/extensions/paused-pi/index.ts:248:			"Use paused_pi_schedule when a pipeline must pause until a provider quota window resets; include a clear resume prompt such as /runningpi resume <pause-id>.",
<home>/running-pi/extensions/running-pi/index.ts:96:const SKILL_PATH = path.join(PACKAGE_ROOT, "skills", "runningpi", "SKILL.md");
<home>/running-pi/extensions/running-pi/index.ts:1494:	pi.registerCommand("runningpi", {
<home>/running-pi/extensions/running-pi/index.ts:1500:		description: "Alias for /runningpi.",
<home>/running-pi/dashboard.backup-20260508-190805/scripts/server.py:85:                "agents", "rules", "skills/runningpi", "running-pi-instructions.md",
<home>/running-pi/README.md:19:- **Pi-native orchestration** via `/runningpi` and the `rp_agent` tool.
<home>/running-pi/README.md:53:/runningpi Add a countWords function that ignores numbers in ~/projects/my-app
<home>/running-pi/README.md:72:user → /runningpi → orchestrator → rp_agent(rp-planner) → rp_agent(rp-critic) → ... → completion
<home>/running-pi/README.md:177:skills/runningpi/       Main Running Pi orchestration skill
<home>/running-pi/agents.output/critiques/parallel-lanes-iteration1-locking-plan-critique.md:44:**Rev 2**: Slice 3 enumerates exact migration targets: `running-pi-instructions.md`, `skills/runningpi/SKILL.md`; explicit zero for `agents/rp-*.md` (documentation-binding only, no logic changes). M4 closed.
<home>/running-pi/agents.output/critiques/parallel-lanes-iteration1-locking-plan-critique.md:97:**Description**: Slice 3 enumerates exact targets: (1) `running-pi-instructions.md`, (2) `skills/runningpi/SKILL.md`; explicit zero for `agents/rp-*.md` — documentation binding only, no logic changes in Iteration 1.
<home>/running-pi/agents.output/analysis/parallel-agent-lanes-design.md:91:- extend `skills/runningpi/SKILL.md` with the parallel-lane flow
<home>/running-pi/agents.output/planning/sandcastle-vs-runningpi-executor-integration-plan.md:2:ID: sandcastle-vs-runningpi-executor-integration
<home>/running-pi/agents.output/planning/sandcastle-vs-runningpi-executor-integration-plan.md:3:Origin: sandcastle-vs-runningpi-executor-integration
<home>/running-pi/agents.output/planning/sandcastle-vs-runningpi-executor-integration-plan.md:43:   - prompt mechanics ↔ `runningpi` commands/skills
<home>/running-pi/agents.output/planning/parallel-lanes-iteration1-locking-plan.md:121:  2. Reference the new helper contract from `skills/runningpi/SKILL.md`.
<home>/running-pi/dashboard/scripts/server.py:85:                "agents", "rules", "skills/runningpi", "running-pi-instructions.md",
<home>/running-pi/evals/execution-profile/fixtures/route-profile-contradiction-designer.md:5:expected_rule: skills/runningpi/SKILL.md
<home>/running-pi/evals/ui-gates/fixtures/uat-g9-contradiction.md:5:expected_rule: skills/runningpi/SKILL.md
<home>/running-pi/templates/fallow-agent-checklist.md:1:# Fallow Policy (runningpi)
<home>/running-pi/skills/runningpi/SKILL.md:2:name: runningpi
<home>/running-pi/skills/runningpi/SKILL.md:3:description: Start a running-pi pipeline run. Invoke with /runningpi, /rp, or by saying "running-pi", "pipeline starten", "build this", "implement this". Runs a structured pre-flight interview to define the task precisely, then starts the rp-* pipeline in Pi direct mode using the rp_agent tool.
<home>/running-pi/skills/runningpi/SKILL.md:8:This skill is the entry point for every running-pi pipeline run. The user invokes it by typing `/runningpi`, `/rp`, or saying "running-pi".
<home>/running-pi/skills/runningpi/SKILL.md:26:- User types `/runningpi`
<home>/running-pi/skills/runningpi/SKILL.md:44:Before invoking the first delegated non-Pi agent, ensure delegate auth preflight is green. `/runningpi` runs this automatically, but if continuing manually use:
<home>/running-pi/skills/runningpi/SKILL.md:1026:Append a history entry so this run shows up in the next `/runningpi` Step 0 shortlist, and emit an analytics-only pipeline lifecycle event for the dashboard:

### rg pattern: running-pi
count: 406
<home>/running-pi/install.sh:2:# running-pi installer. Idempotent local install into Pi settings.
<home>/running-pi/install.sh:5:INSTALL_DIR="$HOME/running-pi"
<home>/running-pi/install.sh:11:[ "$SCRIPT_REAL" = "$INSTALL_DIR" ] || fail "running-pi must live at $INSTALL_DIR (currently $SCRIPT_REAL)"
<home>/running-pi/install.sh:27:CRON_LINE="*/15 * * * * /bin/bash $INSTALL_DIR/scripts/provider-limits/check-and-alert.sh >/tmp/running-pi-provider-limits-alert.log 2>&1"
<home>/running-pi/config/agents.json:2:  "$schema": "https://running-pi.dev/agents.schema.json",
<home>/running-pi/config/profiles/codex-ultralight.json:2:  "$schema": "https://running-pi.dev/agents.schema.json",
<home>/running-pi/config/profiles/codex-heavy.json:2:  "$schema": "https://running-pi.dev/agents.schema.json",
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:2:  "$schema": "https://running-pi.dev/agents.schema.json",
<home>/running-pi/config/profiles/deepseek-claude.json:2:  "$schema": "https://running-pi.dev/agents.schema.json",
<home>/running-pi/config/profiles/openrouter-heavy.json:2:  "$schema": "https://running-pi.dev/agents.schema.json",
<home>/running-pi/config/profiles/codex-light.json:2:  "$schema": "https://running-pi.dev/agents.schema.json",
<home>/running-pi/config/profiles/minimax-claude.json:2:  "$schema": "https://running-pi.dev/agents.schema.json",
<home>/running-pi/scripts/profile/current.sh:3:python3 "$HOME/running-pi/scripts/provider-limits/probe.py" latest | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("active_profile","custom"))'
<home>/running-pi/running-pi-instructions.md:3:File shipped by [running-pi](https://github.com/) and installed at `~/.claude/running-pi-instructions.md`. Reference from `~/.claude/CLAUDE.md` via:
<home>/running-pi/running-pi-instructions.md:6:@running-pi-instructions.md
<home>/running-pi/running-pi-instructions.md:34:| `rp-pi` | Process improvement: writes rules to two-tier rules architecture (`<pidex-root>/rules/<agent>/`) — never edits agent `.md` files directly | No (inherits) |
<home>/running-pi/running-pi-instructions.md:183:- **Background mode:** Headless `claude --print` process run pipeline. Gates via Telegram custom keyboards. Orchestrator monitor and relay. Scripts in `<pidex-root>/scripts/` manage lifecycle.
<home>/running-pi/running-pi-instructions.md:184:- **Direct mode:** Orchestrator session itself drive pipeline by invoking rp-* agents as subagents. Gates in terminal. No headless lead is required; emit analytics-only lifecycle events with `<pidex-root>/scripts/pipeline/event.sh` so the dashboard can distinguish real running pipelines from legacy unresolved metric groups.
<home>/running-pi/running-pi-instructions.md:208:1. Load `<pidex-root>/rules/orchestrator/ui-design-interview-gate.md`.
<home>/running-pi/running-pi-instructions.md:248:**Full rule:** `<pidex-root>/docs/rule-01-idle-stalls.md` (cat before acting on any stall event)
<home>/running-pi/running-pi-instructions.md:254:**Full rule:** `<pidex-root>/docs/rule-02-id-inheritance.md`
<home>/running-pi/running-pi-instructions.md:260:**Full rule:** `<pidex-root>/docs/rule-03-doc-closure.md`
<home>/running-pi/running-pi-instructions.md:289:   bash <pidex-root>/scripts/parallel/auto-lanes.sh \
<home>/running-pi/running-pi-instructions.md:298:   bash <pidex-root>/scripts/parallel/complete-lane.sh --project-root "$PWD" --plan-id <id> --lane-id A --status done
<home>/running-pi/running-pi-instructions.md:299:   bash <pidex-root>/scripts/parallel/complete-lane.sh --project-root "$PWD" --plan-id <id> --lane-id B --status done
<home>/running-pi/running-pi-instructions.md:300:   bash <pidex-root>/scripts/parallel/join-lanes.sh --project-root "$PWD" --plan-id <id> --base-branch main --apply
<home>/running-pi/running-pi-instructions.md:378:| **G7** | Agent instruction change | `rp-pi` proposing updates to rules files (`<pidex-root>/rules/<agent>/`) | Self-modification request | Approve/reject the proposed diff |
<home>/running-pi/running-pi-instructions.md:400:bash <pidex-root>/scripts/telegram/notify.sh \
<home>/running-pi/running-pi-instructions.md:411:When Gate (G1–G9) reached in background mode AND running-pi installed, route gate via Telegram custom keyboard with `rp!` prefixed buttons. User approve gates from phone, no terminal needed.
<home>/running-pi/running-pi-instructions.md:415:- **Notify-only direct mode:** `<pidex-root>/scripts/telegram/notify.sh` curls `sendMessage`, writes no state, expects no reply.
<home>/running-pi/running-pi-instructions.md:416:- **Outbound background gate (lead → user):** `<pidex-root>/scripts/telegram/send-gate.sh` curls `sendMessage`, writes `pending-gate.json`.
<home>/running-pi/running-pi-instructions.md:417:- **Inbound (user → orchestrator):** `<pidex-root>/scripts/telegram/recv-gate.sh` curls `getUpdates` on demand, returns latest `rp!*` message (or empty). Orchestrator calls this itself — no background poller.
<home>/running-pi/running-pi-instructions.md:425:bash <pidex-root>/scripts/telegram/send-gate.sh \
<home>/running-pi/running-pi-instructions.md:438:bash <pidex-root>/scripts/telegram/send-gate.sh \
<home>/running-pi/running-pi-instructions.md:451:Send Telegram message with `rp!` buttons. Also write `<pidex-root>/state/pending-gate.json` with gate metadata. After send, lead turn end.
<home>/running-pi/running-pi-instructions.md:456:reply=$(bash <pidex-root>/scripts/telegram/recv-gate.sh --wait 60)
<home>/running-pi/running-pi-instructions.md:458:    bash <pidex-root>/scripts/relay/handle.sh --text "$reply" --chat-id "$TELEGRAM_CHAT_ID"
<home>/running-pi/running-pi-instructions.md:474:## Rule 7 — Launching the lead (running-pi)
<home>/running-pi/running-pi-instructions.md:476:Standard way to start rp-* pipeline = via running-pi. Orchestrator call:
<home>/running-pi/running-pi-instructions.md:479:bash <pidex-root>/scripts/lead/start.sh \
<home>/running-pi/running-pi-instructions.md:489:**Template location:** `<pidex-root>/templates/lead-prompt.md`. Orchestrator read this file, substitute `<rp-planner | rp-architect>` (per opening-agent table in Rule 4) and `<epic statement>`, pass result as `--prompt`. Do NOT inline different prompt — template encode load-bearing rules (team formation, opening agent, gate routing, deadlock prevention) matching Rules 1, 4, 5, and 6.
<home>/running-pi/running-pi-instructions.md:508:**Summary:** `<pidex-root>/state/history.jsonl` = append-only. Background runs write automatically; direct-mode runs written by orchestrator. Read via `bash <pidex-root>/scripts/history/list.sh --limit 5`. Do NOT write secrets, prompts, or pipeline state — selection aid only.
<home>/running-pi/running-pi-instructions.md:509:**Full rule:** `<pidex-root>/docs/rule-07b-run-history.md`
<home>/running-pi/running-pi-instructions.md:519:bash <pidex-root>/scripts/token-log/log-session.sh \
<home>/running-pi/running-pi-instructions.md:532:python3 <pidex-root>/scripts/token-log/report.py --project-dir <project_dir>
<home>/running-pi/running-pi-instructions.md:543:**Full rule:** `<pidex-root>/docs/rule-08-checkpointing.md` (full schema incl. Key decisions and Files created sections)
<home>/running-pi/running-pi-instructions.md:575:bash <pidex-root>/scripts/pre-spawn/spawn-with-budget.sh \
<home>/running-pi/running-pi-instructions.md:594:3. **Shortcut script**: `bash <pidex-root>/scripts/pre-spawn/rp-qa-prep.sh --project-dir <path>` runs steps 1+2 automatically and prints the briefing note to paste.
<home>/running-pi/running-pi-instructions.md:606:   bash <pidex-root>/scripts/watchdog/check-heartbeat.sh \
<home>/running-pi/running-pi-instructions.md:673:**Full rule:** `<pidex-root>/docs/rule-09c-routing-emission.md`
<home>/running-pi/running-pi-instructions.md:680:bash <pidex-root>/scripts/pre-spawn/release-version-check.sh <x.y.z|vx.y.z>
<home>/running-pi/running-pi-instructions.md:697:**Full rule** (incl. 10a trivial-finalization exception, 10c stall-recovery protocol, 10d rationale, 10e hotfix workflow): `<pidex-root>/docs/rule-10-delegation-discipline.md`
<home>/running-pi/running-pi-instructions.md:701:## Working with running-pi
<home>/running-pi/running-pi-instructions.md:703:Running-claude skill at `~/.claude/skills/running-pi/SKILL.md` describe orchestrator-side commands in detail. Briefly:
<home>/running-pi/running-pi-instructions.md:705:- **Start a run:** `bash <pidex-root>/scripts/lead/start.sh --prompt "..." --cwd "<path>" --teams`
<home>/running-pi/running-pi-instructions.md:706:- **Check status:** `bash <pidex-root>/scripts/lead/status.sh`
<home>/running-pi/running-pi-instructions.md:707:- **Stop:** `bash <pidex-root>/scripts/lead/stop.sh`
<home>/running-pi/running-pi-instructions.md:708:- **Inbound `rp!*` Telegram messages:** the orchestrator calls `bash <pidex-root>/scripts/relay/handle.sh --text "<text>" --chat-id "<chat_id>"` automatically
<home>/running-pi/running-pi-instructions.md:710:Agents live under `<project>/.claude/agents/rp-*.md`, copied there by `<pidex-root>/install.sh`. If missing, re-run install.sh with same target project.
<home>/running-pi/running-pi-instructions.md:716:Canonical instructions file for rp-* pipeline as shipped by running-pi. Project-specific rules (e.g., "use vitest in this project", "deployment target is Netlify") belong in project's own CLAUDE.md, NOT here.
<home>/running-pi/scripts/profile/recommend.sh:3:python3 "$HOME/running-pi/scripts/provider-limits/probe.py" latest | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("recommended_profile","codex-heavy"))'
<home>/running-pi/scripts/profile/use.sh:3:ROOT="$HOME/running-pi"
<home>/running-pi/package.json:2:  "name": "running-pi",
<home>/running-pi/package.json:20:    "check": "tsc --noEmit --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext extensions/running-pi/index.ts extensions/paused-pi/index.ts",
<home>/running-pi/SKILL.md:3:description: Start a running-pi pipeline run. Prefer the package skill at skills/runningpi/SKILL.md. Invoke with /runningpi after installing this Pi package.
<home>/running-pi/SKILL.md:6:# running-pi
<home>/running-pi/SKILL.md:10:`<home>/running-pi/skills/runningpi/SKILL.md`
<home>/running-pi/NOTICE:1:running-pi
<home>/running-pi/NOTICE:40:  running-pi-instructions.md (incorporates rules and conventions)
<home>/running-pi/scripts/lead/keepalive.sh:223:                run_claude "resume" "CRITICAL: You wrote a gate message as text output but did NOT call send-gate.sh. In --print mode, text output is buffered — the user NEVER saw your gate message. You MUST call: bash <pidex-root>/scripts/telegram/send-gate.sh --gate <ID> --plan <N> --slug <slug> --options '<options>' --context '<message>' --lead-id \"\$LEAD_ID\". Do this NOW for the pending gate, then end your turn. See Rule 6 in running-pi-instructions.md."
<home>/running-pi/scripts/provider-limits/guard.sh:5:ROOT="${RUNNING_PI_ROOT:-$HOME/running-pi}"
<home>/running-pi/scripts/provider-limits/probe.py:16:ROOT = Path.home() / "running-pi"
<home>/running-pi/scripts/provider-limits/probe.py:77:            "User-Agent": "running-pi-provider-limits/0.1",
<home>/running-pi/scripts/provider-limits/check-and-alert.sh:3:python3 "$HOME/running-pi/scripts/provider-limits/probe.py" alert "$@"
<home>/running-pi/scripts/telegram/notify.sh:96:    [ -n "${TELEGRAM_BOT_TOKEN:-}" ] || die 1 "TELEGRAM_BOT_TOKEN is not set; export it in ~/.bashrc, <pidex-root>/config.env, or <project>/.env"
<home>/running-pi/scripts/telegram/notify.sh:97:    [ -n "$CHAT" ] || die 1 "TELEGRAM_CHAT_ID is not set; export it in ~/.bashrc, <pidex-root>/config.env, or <project>/.env"
<home>/running-pi/scripts/pre-spawn/release-version-check.sh:2:# running-pi — Release version precheck (before rp-devops)
<home>/running-pi/scripts/pre-spawn/extract-context-snippet.sh:2:# running-pi — Context snippet extractor
<home>/running-pi/scripts/token-log/parse-session.py:3:running-pi token log parser
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:2:# running-pi — Pre-spawn context budget guard
<home>/running-pi/scripts/pre-spawn/context-budget-check.sh:8:#   bash <pidex-root>/scripts/pre-spawn/context-budget-check.sh \
<home>/running-pi/scripts/token-log/report.py:3:running-pi token log reporter
<home>/running-pi/scripts/pre-spawn/rp-qa-prep.sh:2:# running-pi — rp-qa Pre-Spawn Preparation (PROC-NEW-36e)
<home>/running-pi/scripts/pre-spawn/rp-qa-prep.sh:8:#   bash <pidex-root>/scripts/pre-spawn/rp-qa-prep.sh \
<home>/running-pi/scripts/token-log/log-session.sh:2:# running-pi — log token usage for a pipeline session
<home>/running-pi/scripts/pre-spawn/spawn-with-budget.sh:2:# running-pi — context pack prep with include-policy + auto-snippets + budget precheck
<home>/running-pi/scripts/pre-spawn/spawn-with-budget.sh:19:  bash <pidex-root>/scripts/pre-spawn/spawn-with-budget.sh \
<home>/running-pi/scripts/pre-spawn/spawn-with-budget.sh:108:    out=$(bash <pidex-root>/scripts/pre-spawn/extract-context-snippet.sh --file "$src" --pattern "$FOCUS" --before 20 --after 80 | awk -F': ' '/Snippet written:/ {print $2}')
<home>/running-pi/scripts/pre-spawn/spawn-with-budget.sh:112:  out=$(bash <pidex-root>/scripts/pre-spawn/extract-context-snippet.sh --file "$src" --start-line 1 --end-line 120 | awk -F': ' '/Snippet written:/ {print $2}')
<home>/running-pi/scripts/pre-spawn/spawn-with-budget.sh:189:bash <pidex-root>/scripts/pre-spawn/context-budget-check.sh "${CHECK_ARGS[@]}"
<home>/running-pi/scripts/smoke-test.sh:2:# running-pi smoke tests. Safe: does not install the package globally and does
<home>/running-pi/scripts/smoke-test.sh:24:pi -e "$ROOT" --list-models __running_pi_no_such_model__ >/tmp/running-pi-pkg-load.out 2>/tmp/running-pi-pkg-load.err
<home>/running-pi/scripts/history/append.sh:2:# Append a single event to the running-pi history log.
<home>/running-pi/scripts/doctor.sh:6:EXPECTED="$HOME/running-pi"
<home>/running-pi/scripts/doctor.sh:15:  ok "installed at <pidex-root>"
<home>/running-pi/scripts/doctor.sh:18:  printf '  Fix: git clone <public-running-pi-url> <pidex-root> && cd <pidex-root> && pi install .\n'
<home>/running-pi/scripts/doctor.sh:30:  if (cd "$ROOT" && npm run check >/tmp/running-pi-doctor-check.log 2>&1); then
<home>/running-pi/scripts/doctor.sh:33:    fail "npm run check failed; see /tmp/running-pi-doctor-check.log"
<home>/running-pi/scripts/doctor.sh:38:  if pi -e "$ROOT" --list-models __running_pi_doctor_probe__ >/tmp/running-pi-doctor-pi.log 2>/tmp/running-pi-doctor-pi.err; then
<home>/running-pi/scripts/doctor.sh:41:    warn "Pi package load probe failed; see /tmp/running-pi-doctor-pi.err"
<home>/running-pi/scripts/doctor.sh:66:        if pi --list-models "$short_model" >/tmp/running-pi-doctor-model.log 2>&1 && grep -q "$short_model" /tmp/running-pi-doctor-model.log; then
<home>/running-pi/rules/rp-devops/index.md:22:| running-pi Install Propagation | [running-pi-install-propagation.md](running-pi-install-propagation.md) | 53-1 | After Stage 1 commit, run `bash <pidex-root>/install.sh` when plan touched any `<pidex-root>/` source file; log result in deployment doc |
<home>/running-pi/rules/rp-devops/running-pi-install-propagation.md:1:# Rule: running-pi Install Propagation After Source-Touching Plans (PROC-NEW-53-1)
<home>/running-pi/rules/rp-devops/running-pi-install-propagation.md:6:**Evidence:** Plan 53 was entirely a propagation plan — fixes already written to `<pidex-root>/` source in Plan 52 never reached the active orchestrator environment because `install.sh` was not run. Required a full separate plan cycle just to propagate.
<home>/running-pi/rules/rp-devops/running-pi-install-propagation.md:12:Plan touches any file under `<pidex-root>/` source directory, including:
<home>/running-pi/rules/rp-devops/running-pi-install-propagation.md:13:- `<pidex-root>/docs/rule-*.md`
<home>/running-pi/rules/rp-devops/running-pi-install-propagation.md:14:- `<pidex-root>/scripts/` (any script)
<home>/running-pi/rules/rp-devops/running-pi-install-propagation.md:15:- `<pidex-root>/templates/`
<home>/running-pi/rules/rp-devops/running-pi-install-propagation.md:16:- `<pidex-root>/rules/<agent>/` rule files (though rp-pi usually writes these)
<home>/running-pi/rules/rp-devops/running-pi-install-propagation.md:17:- Any other file that `install.sh` copies to project `.claude/agents/` or `~/.claude/running-pi-instructions.md`
<home>/running-pi/rules/rp-devops/running-pi-install-propagation.md:24:bash <pidex-root>/install.sh
<home>/running-pi/rules/rp-devops/running-pi-install-propagation.md:34:## running-pi Propagation
<home>/running-pi/rules/rp-devops/running-pi-install-propagation.md:36:- Triggered: yes (plan touched <pidex-root>/ source files)
<home>/running-pi/rules/rp-devops/running-pi-install-propagation.md:37:- Command: `bash <pidex-root>/install.sh`
<home>/running-pi/rules/rp-devops/running-pi-install-propagation.md:42:If the plan did NOT touch `<pidex-root>/`, write:
<home>/running-pi/rules/rp-devops/running-pi-install-propagation.md:45:## running-pi Propagation
<home>/running-pi/rules/rp-devops/running-pi-install-propagation.md:47:- Triggered: no (plan did not touch <pidex-root>/ source files)
<home>/running-pi/rules/rp-devops/running-pi-install-propagation.md:52:`<pidex-root>/` is the canonical source for pipeline agent instructions, scripts, and rules. Project-level `.claude/agents/rp-*.md` files and `~/.claude/running-pi-instructions.md` are installed copies. Changes to source files have no effect until `install.sh` propagates them.
<home>/running-pi/rules/rp-devops/running-pi-install-propagation.md:58:- Plans that modify only `<pidex-root>/rules/<agent>/` rule files (not agent `.md` files): `install.sh` may not copy rules, but run it anyway if uncertain — it is idempotent.
<home>/running-pi/rules/rp-devops/running-pi-install-propagation.md:59:- Plans that do NOT touch any `<pidex-root>/` path: skip this rule entirely (document "Triggered: no").
<home>/running-pi/rules/rp-devops/running-pi-install-propagation.md:63:- Plan 52 wrote subagent monitoring fixes to `<pidex-root>/` source.
<home>/running-pi/rules/rp-devops/running-pi-install-propagation.md:65:- Cost: one full pipeline cycle (planner → critic × 2 → implementer → code-reviewer → qa → uat → devops → retrospective → pi) to deliver a `bash <pidex-root>/install.sh` that could have been part of Plan 52's devops stage.
<home>/running-pi/scripts/_lib.sh:2:# running-pi shared library — sourced by all scripts.
<home>/running-pi/scripts/_lib.sh:8:# running-pi has a strict install location: $HOME/running-pi.
<home>/running-pi/scripts/_lib.sh:10:RP_ROOT="$HOME/running-pi"
<home>/running-pi/scripts/_lib.sh:14:LOG_FILE="$LOG_DIR/running-pi.log"
<home>/running-pi/scripts/_lib.sh:21:# Priority: project .env > <pidex-root>/config.env > shell environment.
<home>/running-pi/scripts/_lib.sh:42:    [ -n "${TELEGRAM_BOT_TOKEN:-}" ] || die 1 "TELEGRAM_BOT_TOKEN is not set; export it in ~/.bashrc, <pidex-root>/config.env, or <project>/.env"
<home>/running-pi/scripts/_lib.sh:43:    [ -n "${TELEGRAM_CHAT_ID:-}" ]   || die 1 "TELEGRAM_CHAT_ID is not set; export it in ~/.bashrc, <pidex-root>/config.env, or <project>/.env"
<home>/running-pi/scripts/_lib.sh:59:    printf 'running-pi: %s\n' "$1" >&2
<home>/running-pi/rules/rp-devops/suppress-gate-in-direct-mode.md:15:1. The lead was NOT started via `<pidex-root>/scripts/lead/start.sh` (no detached
<home>/running-pi/rules/rp-devops/suppress-gate-in-direct-mode.md:18:3. No `<pidex-root>/state/pending-gate.json` exists from a prior background run
<home>/running-pi/rules/rp-devops/suppress-gate-in-direct-mode.md:23:  LEAD_PID=$(cat <pidex-root>/state/lead.pid 2>/dev/null)
<home>/running-pi/rules/rp-planner/plan-pre-submission-checklist.md:23:- [ ] BAD: "S1 runs `bash <pidex-root>/install.sh` to propagate changes" → HOW-leakage.
<home>/running-pi/rules/rp-planner/plan-pre-submission-checklist.md:63:- AC contains a file path (`<pidex-root>/install.sh`)
<home>/running-pi/scripts/delegate/dispatch.sh:2:# running-pi — Delegation Dispatcher
<home>/running-pi/scripts/delegate/dispatch.sh:4:# Reads <pidex-root>/config/agents.json to route a rp-* agent to a CLI
<home>/running-pi/scripts/delegate/dispatch.sh:8:#   bash <pidex-root>/scripts/delegate/dispatch.sh \
<home>/running-pi/scripts/delegate/dispatch.sh:33:CONFIG_FILE="${CONFIG_FILE:-$HOME/running-pi/config/agents.json}"
<home>/running-pi/scripts/delegate/dispatch.sh:34:TEMPLATES_DIR="${TEMPLATES_DIR:-$HOME/running-pi/templates/cli-delegates}"
<home>/running-pi/scripts/delegate/dispatch.sh:35:SCRIPTS_DIR="${SCRIPTS_DIR:-$HOME/running-pi/scripts/delegate}"
<home>/running-pi/scripts/delegate/dispatch.sh:36:AGENTS_DIR="${AGENTS_DIR:-$HOME/running-pi/agents}"
<home>/running-pi/scripts/delegate/claude.sh:2:# running-pi — Claude Code CLI delegate
<home>/running-pi/scripts/delegate/claude.sh:29:#     bash <pidex-root>/scripts/delegate/claude.sh
<home>/running-pi/scripts/delegate/codex.sh:2:# running-pi — Codex CLI delegate
<home>/running-pi/scripts/delegate/codex.sh:21:#     bash <pidex-root>/scripts/delegate/codex.sh
<home>/running-pi/scripts/delegate/gemini.sh:2:# running-pi — Gemini CLI delegate
<home>/running-pi/rules/rp-implementer/noop-slice-explicit-flag.md:28:   - `grep "PROC-NEW-36e" <pidex-root>/docs/rule-09-briefing-discipline.md` → found ✓
<home>/running-pi/rules/rp-implementer/noop-slice-explicit-flag.md:29:   - `grep "check-heartbeat" <pidex-root>/scripts/pre-spawn/rp-qa-prep.sh` → found ✓
<home>/running-pi/scripts/evals/check-ui-gates.sh:126:require_text "running-pi-instructions.md" 'APPROVED FOR RELEASE + `gate: none` / G9 not applicable'
<home>/running-pi/scripts/evals/check-ui-gates.sh:128:require_text "running-pi-instructions.md" 'G9 applicability contradiction'
<home>/running-pi/scripts/evals/check-ui-gates.sh:141:require_text "running-pi-instructions.md" 'Post-devops UI preview before G4'
<home>/running-pi/scripts/evals/check-metrics.sh:13:require_text "extensions/running-pi/index.ts" '^[0-9][a-zA-Z0-9._-]'
<home>/running-pi/scripts/evals/check-metrics.sh:14:require_text "extensions/running-pi/index.ts" 'PlanID:'
<home>/running-pi/scripts/evals/check-metrics.sh:15:require_text "extensions/running-pi/index.ts" 'Origin:'
<home>/running-pi/scripts/evals/check-metrics.sh:16:require_text "extensions/running-pi/index.ts" 'plan-${cleaned.toLowerCase()}'
<home>/running-pi/scripts/evals/check-parallel-secondary-lanes.sh:7:EXT="$ROOT/extensions/running-pi/index.ts"
<home>/running-pi/scripts/evals/check-execution-profile.sh:77:require_text "running-pi-instructions.md" 'or `orchestrator` for deterministic internal work'
<home>/running-pi/scripts/evals/check-execution-profile.sh:78:require_text "extensions/running-pi/index.ts" 'route_to may be an rp-* agent, user, or orchestrator'
<home>/running-pi/scripts/evals/check-pi-runner.sh:13:require_text "extensions/running-pi/index.ts" '"--mode"'
<home>/running-pi/scripts/evals/check-pi-runner.sh:14:require_text "extensions/running-pi/index.ts" '"json"'
<home>/running-pi/scripts/evals/check-pi-runner.sh:15:require_text "extensions/running-pi/index.ts" '"-p"'
<home>/running-pi/scripts/evals/check-pi-runner.sh:16:require_text "extensions/running-pi/index.ts" '"--session-dir"'
<home>/running-pi/scripts/evals/check-pi-runner.sh:17:require_text "extensions/running-pi/index.ts" 'RUNNING_PI_CHILD'
<home>/running-pi/scripts/evals/check-pi-runner.sh:18:require_text "extensions/running-pi/index.ts" 'assertPiModelAllowed(model)'
<home>/running-pi/scripts/evals/check-pi-runner.sh:19:require_text "extensions/running-pi/index.ts" 'Anthropic/Claude subscription auth may incur paid extra usage'
<home>/running-pi/scripts/evals/check-pi-runner.sh:20:require_text "extensions/running-pi/index.ts" 'event?.type === "message_end"'
<home>/running-pi/scripts/evals/check-pi-runner.sh:21:require_text "extensions/running-pi/index.ts" 'usage.cacheRead'
<home>/running-pi/scripts/evals/check-pi-runner.sh:22:require_text "extensions/running-pi/index.ts" 'usage.cacheWrite'
<home>/running-pi/scripts/evals/check-pi-runner.sh:23:require_text "extensions/running-pi/index.ts" 'FINAL_STOP_GRACE_MS'
<home>/running-pi/scripts/evals/check-pi-runner.sh:24:require_text "extensions/running-pi/index.ts" 'runLog.sessionDir'
<home>/running-pi/scripts/evals/check-pi-runner.sh:25:require_text "extensions/running-pi/index.ts" 'runLog.runDir'
<home>/running-pi/scripts/evals/check-pi-runner.sh:26:require_text "extensions/running-pi/index.ts" 'if (process.env[RUNNING_PI_CHILD_ENV] === "1") return;'
<home>/running-pi/scripts/evals/check-telegram-notify.sh:37:printf '%s' "$OUTPUT" | grep -Fq 'Project: running-pi' || fail "dry-run missing project"
<home>/running-pi/scripts/evals/check-telegram-notify.sh:50:require_text "running-pi-instructions.md" 'Rule 6a — Notify-only Telegram in direct mode'
<home>/running-pi/scripts/evals/check-telegram-notify.sh:51:require_text "running-pi-instructions.md" 'terminal completion/failure/abort/hold'
<home>/running-pi/scripts/evals/check-telegram-notify.sh:52:require_text "running-pi-instructions.md" 'MUST NOT create `pending-gate.json`'
<home>/running-pi/scripts/evals/check-telegram-notify.sh:53:require_text "running-pi-instructions.md" '--needs "Pipeline complete"'
<home>/running-pi/scripts/evals/check-retro-mode.sh:37:require_text "running-pi-instructions.md" 'Retro Mode controls local/hold/abort closure'
<home>/running-pi/scripts/evals/check-retro-mode.sh:47:require_text "running-pi-instructions.md" 'final bookkeeping'
<home>/running-pi/agents/rp-critic.md:13:At task start, read `<pidex-root>/rules/rp-critic/index.md` to load active process rules.
<home>/running-pi/agents/rp-critic.md:188:If running via running-pi and verdict is `REJECTED`, send Gate G1 using `scripts/telegram/send-gate.sh`, then end turn. If interactive, report rejection directly.
<home>/running-pi/rules/orchestrator/background-agent-watchdog.md:23:bash <pidex-root>/scripts/pre-spawn/rp-qa-prep.sh \
<home>/running-pi/agents/rp-implementer.md:13:At task start, read `<pidex-root>/rules/rp-implementer/index.md` to load active process rules.
<home>/running-pi/agents/rp-implementer.md:139:3. **Release-prep slices** (CHANGELOG, version bump): CHANGELOG entry is the FIRST file written. → See `<pidex-root>/rules/rp-implementer/changelog-ordering.md`
<home>/running-pi/agents/rp-implementer.md:170:→ See `<pidex-root>/rules/rp-implementer/stall-recovery.md`
<home>/running-pi/agents/rp-implementer.md:187:5. Read design review if exists. Check "Must-Fix Before Commit" FIRST. → See `<pidex-root>/rules/rp-implementer/design-review-must-fix.md`
<home>/running-pi/agents/rp-implementer.md:334:- **From rp-code-reviewer REJECTED**: Read findings, fix specific issues, re-run tests, update impl doc with revision entry. Fix surgically — not from scratch. **Fix loop scope cap (PROC-NEW-14)**: → See `<pidex-root>/rules/rp-implementer/fix-loop-scope-cap.md`
<home>/running-pi/dashboard.backup-20260508-190805/start.sh:37:LOG="/tmp/running-pi-dashboard-$PORT.log"
<home>/running-pi/dashboard.backup-20260508-190805/start.sh:62:  npm run ingest --silent >/tmp/running-pi-dashboard-ingest.json
<home>/running-pi/agents/rp-architect.md:13:At task start, read `<pidex-root>/rules/rp-architect/index.md` to load active process rules.
<home>/running-pi/rules/orchestrator/context-budget-guard.md:12:bash <pidex-root>/scripts/pre-spawn/spawn-with-budget.sh \
<home>/running-pi/rules/orchestrator/context-budget-guard.md:26:bash <pidex-root>/scripts/pre-spawn/spawn-with-budget.sh ... --hard
<home>/running-pi/agents/rp-pi.md:13:At task start, read `<pidex-root>/rules/rp-pi/index.md` to load active process rules.
<home>/running-pi/agents/rp-pi.md:27:- `<pidex-root>/rules/<agent-name>/index.md` — index of all rules for that agent
<home>/running-pi/agents/rp-pi.md:28:- `<pidex-root>/rules/<agent-name>/<rule-slug>.md` — one file per specific rule
<home>/running-pi/agents/rp-pi.md:72:- Edit: source agent instruction files (`<pidex-root>/agents/rp-*.md`), rules files (`<pidex-root>/rules/<agent>/<rule>.md`), workflow docs (CLAUDE.md, README.md), project-specific rules (`agents.wiki.<project>/rules/<agent>.md`)
<home>/running-pi/agents/rp-pi.md:97:1. Read current agent instructions for affected agents (`agents/rp-*.md` in running-pi; legacy `.claude/agents/rp-*.md` only if project still uses that path)
<home>/running-pi/agents/rp-pi.md:132:**If running via running-pi**, send gate to Telegram. Use only concrete, fixed option names:
<home>/running-pi/agents/rp-pi.md:134:bash <pidex-root>/scripts/telegram/send-gate.sh \
<home>/running-pi/agents/rp-pi.md:162:   a. Create `<pidex-root>/rules/<agent-name>/<rule-slug>.md` with rule content
<home>/running-pi/agents/rp-pi.md:163:   b. Add row to `<pidex-root>/rules/<agent-name>/index.md`
<home>/running-pi/agents/rp-pi.md:164:   c. In agent `.md`, replace inline PROC-NEW block with one-line reference: `→ See <pidex-root>/rules/<agent-name>/<rule-slug>.md`
<home>/running-pi/agents/rp-pi.md:183:8. Apply canonical validation taxonomy in generated validation sections. → See `<pidex-root>/rules/rp-pi/validation-taxonomy.md`.
<home>/running-pi/agents/rp-roadmap.md:13:At task start, read `<pidex-root>/rules/rp-roadmap/index.md` to load active process rules.
<home>/running-pi/dashboard.backup-20260508-190805/scripts/server.py:17:DB = ANALYTICS / "data" / "running-pi.sqlite"
<home>/running-pi/dashboard.backup-20260508-190805/scripts/server.py:85:                "agents", "rules", "skills/runningpi", "running-pi-instructions.md",
<home>/running-pi/agents/rp-uat.md:12:At task start, read `<pidex-root>/rules/rp-uat/index.md` to load active process rules.
<home>/running-pi/agents/rp-uat.md:13:For G9-required or UI plans, load `<pidex-root>/rules/rp-uat/ui-evidence-before-g9.md` and `<pidex-root>/rules/rp-uat/semantic-ui-fit.md`. For repeated/hierarchical/status UI or plans with a UI Label Source Contract, also load `<pidex-root>/rules/rp-uat/visible-text-semantic-check.md`.
<home>/running-pi/agents/rp-uat.md:198:If running via running-pi and verdict is `REJECTED`, send Gate G3 using `scripts/telegram/send-gate.sh`, then end turn. If interactive, report directly.
<home>/running-pi/dashboard.backup-20260508-190805/scripts/ingest.py:20:DEFAULT_DB = ANALYTICS / "data" / "running-pi.sqlite"
<home>/running-pi/agents/rp-security.md:12:At task start, read `<pidex-root>/rules/rp-security/index.md` to load active process rules.
<home>/running-pi/agents/rp-security.md:92:**If running via running-pi (background mode)**, send mode question as gate:
<home>/running-pi/agents/rp-security.md:94:bash <pidex-root>/scripts/telegram/send-gate.sh \
<home>/running-pi/agents/rp-security.md:229:If running via running-pi and verdict requires G5, send Gate G5 using `scripts/telegram/send-gate.sh`, then end turn. If interactive, report directly.
<home>/running-pi/dashboard.backup-20260508-190805/package.json:2:  "name": "running-pi-dashboard",
<home>/running-pi/agents/rp-devops.md:13:At task start, read `<pidex-root>/rules/rp-devops/index.md` to load active process rules.
<home>/running-pi/agents/rp-devops.md:14:When plan has Execution Profile/Skipped Agents, load `<pidex-root>/rules/rp-devops/execution-profile-diff-guard.md` before Stage 1 commit.
<home>/running-pi/agents/rp-devops.md:15:For UI-involved work or any `User Preview Requirement`, load `<pidex-root>/rules/rp-devops/post-stage1-ui-preview-before-g4.md` before Stage 1 routing/G4.
<home>/running-pi/agents/rp-devops.md:16:If selective release staging leaves a dirty tree after tag/push/final artifact commit, load `<pidex-root>/rules/rp-devops/post-release-artifact-hygiene.md` before declaring completion.
<home>/running-pi/agents/rp-devops.md:84:6. Apply prepare-only Stage 1 marker. → See `<pidex-root>/rules/rp-devops/prepare-only-stage-marker.md`.
<home>/running-pi/agents/rp-devops.md:135:2. **If running via running-pi**: Send gate to Telegram:
<home>/running-pi/agents/rp-devops.md:137:   bash <pidex-root>/scripts/telegram/send-gate.sh \
<home>/running-pi/rules/rp-designer/design-snippet-preview.md:25:bash <pidex-root>/scripts/preview/create-design-snippet.sh --title "<title>" < snippet.html
<home>/running-pi/rules/rp-designer/design-snippet-preview.md:26:bash <pidex-root>/scripts/preview/serve-design-snippet.sh --id <id>
<home>/running-pi/rules/rp-designer/design-snippet-preview.md:27:bash <pidex-root>/scripts/preview/stop-design-snippet.sh --id <id>
<home>/running-pi/agents/rp-planner.md:12:At task start, read `<pidex-root>/rules/rp-planner/index.md` to load active process rules.
<home>/running-pi/agents/rp-planner.md:78:→ See `<pidex-root>/rules/rp-planner/monorepo-migration-prechecks.md`.
<home>/running-pi/agents/rp-planner.md:82:→ See `<pidex-root>/rules/rp-planner/third-party-registry-check.md`.
<home>/running-pi/agents/rp-planner.md:115:→ See `<pidex-root>/rules/rp-planner/multi-slice-budget-risk.md`.
<home>/running-pi/agents/rp-planner.md:119:→ See `<pidex-root>/rules/rp-planner/playwright-smoke-ac.md`
<home>/running-pi/agents/rp-planner.md:123:→ See `<pidex-root>/rules/rp-planner/user-preview-requirement.md`.
<home>/running-pi/agents/rp-planner.md:205:→ See `<pidex-root>/rules/rp-planner/fixture-derivation.md`
<home>/running-pi/agents/rp-planner.md:275:3. Create `agents.wiki.<name>/index.md` from `<pidex-root>/templates/wiki/index.md` (replace `__PROJECT_NAME__` with project name and `__DATE__` with today's date)
<home>/running-pi/agents/rp-planner.md:276:4. Create `agents.wiki.<name>/log.md` from `<pidex-root>/templates/wiki/log.md` (replace `__PROJECT_NAME__`)
<home>/running-pi/agents/rp-retrospective.md:13:At task start, read `<pidex-root>/rules/rp-retrospective/index.md` to load active process rules.
<home>/running-pi/agents/rp-retrospective.md:14:Load `<pidex-root>/rules/rp-retrospective/retro-mode.md` before writing a full retro when plan/deployment declares Retro Mode.
<home>/running-pi/dashboard.backup-20260508-190805/README.md:8:cd <home>/running-pi/dashboard
<home>/running-pi/dashboard.backup-20260508-190805/README.md:19:<pidex-root>/scripts/pipeline/event.sh --plan plan-030 --event pipeline_started --status running --actor orchestrator
<home>/running-pi/dashboard.backup-20260508-190805/README.md:20:<pidex-root>/scripts/pipeline/event.sh --plan plan-030 --event pipeline_completed --status completed --actor orchestrator
<home>/running-pi/dashboard.backup-20260508-190805/README.md:36:cd <home>/running-pi
<home>/running-pi/dashboard.backup-20260508-190805/README.md:44:cd <home>/running-pi/dashboard
<home>/running-pi/dashboard.backup-20260508-190805/README.md:54:dashboard/data/running-pi.sqlite
<home>/running-pi/agents/rp-code-reviewer.md:12:At task start, read `<pidex-root>/rules/rp-code-reviewer/index.md` to load active process rules.
<home>/running-pi/agents/rp-code-reviewer.md:13:For UI/frontend plans, load `<pidex-root>/rules/rp-code-reviewer/ui-pattern-parity-review.md`.
<home>/running-pi/agents/rp-code-reviewer.md:14:When plan has Execution Profile/Skipped Agents, load `<pidex-root>/rules/rp-code-reviewer/execution-profile-diff-guard.md`.
<home>/running-pi/agents/rp-code-reviewer.md:15:For JS/TS scope, load `<pidex-root>/rules/rp-code-reviewer/fallow-evidence.md`; for non-JS/TS, record `FALLOW-SKIP: non-JS/TS scope`.
<home>/running-pi/agents/rp-code-reviewer.md:16:For tiny test-only/type-only/devops-blocker hotfixes, load `<pidex-root>/rules/rp-code-reviewer/tdd-table-narrow-hotfix-escape.md` before rejecting solely for a missing full TDD table.
<home>/running-pi/agents/rp-code-reviewer.md:49:7. **Draft ROUTING immediately after first file write/edit** (PROC-NEW-1 enforcement): → See `<pidex-root>/rules/rp-code-reviewer/draft-routing.md`
<home>/running-pi/agents/rp-code-reviewer.md:55:**Large-diff batching (PROC-NEW-2 — MANDATORY when diff spans 5+ files)**: → See `<pidex-root>/rules/rp-code-reviewer/large-diff-batching.md`
<home>/running-pi/agents/rp-code-reviewer.md:57:**Investigation budget cap (PROC-NEW-2 — MANDATORY)**: → See `<pidex-root>/rules/rp-code-reviewer/investigation-budget-cap.md`
<home>/running-pi/agents/rp-code-reviewer.md:93:- **Deferred scope (DO NOT REJECT for absent deferred items)**: → See `<pidex-root>/rules/rp-code-reviewer/deferred-scope-check.md` (PROC-NEW-13)
<home>/running-pi/agents/rp-designer.md:13:At task start, read `<pidex-root>/rules/rp-designer/index.md` to load active process rules.
<home>/running-pi/agents/rp-designer.md:14:For UI-heavy plans, load `<pidex-root>/rules/rp-designer/ui-heavy-required.md`.
<home>/running-pi/agents/rp-designer.md:15:If orchestrator/user requests a temporary designer preview, load `<pidex-root>/rules/rp-designer/design-snippet-preview.md` and use the `design-snippet-preview` skill.
<home>/running-pi/agents/rp-analyst.md:12:At task start, read `<pidex-root>/rules/rp-analyst/index.md` to load active process rules.
<home>/running-pi/agents/rp-qa.md:13:At task start, read `<pidex-root>/rules/rp-qa/index.md` to load active process rules.
<home>/running-pi/agents/rp-qa.md:53:**Phase 1 sequencing gate (PROC-NEW-3 — MANDATORY)**: → See `<pidex-root>/rules/rp-qa/phase1-sequencing-gate.md`
<home>/running-pi/agents/rp-qa.md:122:→ See `<pidex-root>/rules/rp-qa/runtime-smoke.md` for full steps, proxy-path rule, and scope gate table.
<home>/running-pi/agents/rp-qa.md:128:→ See `<pidex-root>/rules/rp-qa/browser-level-smoke.md`.
<home>/running-pi/agents/rp-qa.md:130:For Playwright MCP budget exhaustion, follow `<pidex-root>/rules/rp-qa/browser-stall-fallback.md` exactly.
<home>/running-pi/agents/rp-qa.md:204:6. Validate version artifacts: `package.json`, `CHANGELOG.md`, `README.md` (if applicable). → See `<pidex-root>/rules/rp-qa/version-coherence-gate.md` before `QA Complete`.
<home>/running-pi/agents/rp-qa.md:273:If running via running-pi and verdict is `FAILED`, send Gate G2 using `scripts/telegram/send-gate.sh`, then end turn. If interactive, report failure directly.
<home>/running-pi/README.md:32:pi install <pidex-root>
<home>/running-pi/README.md:39:pi install -l <pidex-root>
<home>/running-pi/README.md:89:cd <pidex-root>
<home>/running-pi/README.md:120:<pidex-root>/scripts/pipeline/event.sh \
<home>/running-pi/README.md:130:<pidex-root>/scripts/pipeline/event.sh --plan plan-031 --event pipeline_stage_started --status running --actor rp-planner
<home>/running-pi/README.md:131:<pidex-root>/scripts/pipeline/event.sh --plan plan-031 --event pipeline_stage_completed --status running --actor rp-planner --message "Plan complete; route rp-critic"
<home>/running-pi/README.md:132:<pidex-root>/scripts/pipeline/event.sh --plan plan-031 --event pipeline_completed --status completed --actor orchestrator
<home>/running-pi/README.md:205:<pidex-root>/scripts/metrics/summarize.sh plan-54 --project ~/homelab
<home>/running-pi/README.md:213:<pidex-root>/scripts/delegate/check-auth.sh \
<home>/running-pi/README.md:214:  --config <pidex-root>/config/agents.json
<home>/running-pi/README.md:231:cd <pidex-root>
<home>/running-pi/README.md:244:cd <pidex-root>
<home>/running-pi/TODO.md:1:# running-pi — TODO / Backlog
<home>/running-pi/TODO.md:28:- [ ] `<pidex-root>/scripts/metrics/record.sh` — append one JSONL line per agent spawn
<home>/running-pi/TODO.md:31:  - Writes to `<pidex-root>/state/metrics/<project>/<plan-id>.jsonl`
<home>/running-pi/TODO.md:33:- [ ] `<pidex-root>/scripts/metrics/summarize.sh <plan-id> [--project PROJ]` — pretty table
<home>/running-pi/TODO.md:39:- [ ] **Dispatcher auto-record** integration (`<pidex-root>/scripts/delegate/dispatch.sh`)
<home>/running-pi/TODO.md:50:- [ ] **Pricing table** (`<pidex-root>/config/pricing.json` or inline in record.sh):
<home>/running-pi/TODO.md:138:- [ ] **Stall-reduction pack validation docs** — current evidence is retros (Plan 25 retro covers this). Consider a standalone `<pidex-root>/docs/stall-reduction-pack-validation.md` with before/after metrics once Plan 26-28 data exists.
<home>/running-pi/TODO.md:147:  - Current: `<pidex-root>/` is source-of-truth, orchestrator reads from there
<home>/running-pi/TODO.md:170:- Stall-reduction pack commit: `<pidex-root>/5e1578c`
<home>/running-pi/TODO.md:171:- PI-24 G7 changes: `<pidex-root>/21bf486`
<home>/running-pi/TODO.md:172:- PI-25 G7 changes: `<pidex-root>/55e5774`
<home>/running-pi/TODO.md:173:- CLI-delegate infrastructure: `<pidex-root>/1c1ab85`
<home>/running-pi/rules/rp-pipeline-analyst-template.md:61:| ... | refine-existing-rule/new-rule/eval/agent/tool/analytics | low/med/high | running-pi/project | ... |
<home>/running-pi/analysis/home-daniel-homelab/plan-74-20260507T170332Z-pipeline-analysis.md:86:| Critic: enumeration-completeness check (when plan lists fixed N items, binding tables must cover N rows or declare "applies to all") | refine-existing-rule (rp-critic strictness on `ui-pattern-source-contract` / `ui-intent-boundary-parity`) | medium | running-pi/rules/rp-critic | low — additive critic check |
<home>/running-pi/analysis/home-daniel-homelab/plan-74-20260507T170332Z-pipeline-analysis.md:87:| Planner self-lint: validation/AC rows must cite binding-table cell IDs verbatim, not paraphrase | refine-existing-rule (extend `degraded-badge-contract-table.md` from PROC-NEW-1) | medium | running-pi/rules/rp-planner | low — small format constraint |
<home>/running-pi/analysis/home-daniel-homelab/plan-74-20260507T170332Z-pipeline-analysis.md:88:| Planner V-matrix mirror of code-reviewer's all-unavailable-nav-assertion (so tests get written, not just checked at review) | new-rule | low-medium | running-pi/rules/rp-planner | low — explicit AC row, no behavior change |
<home>/running-pi/analysis/home-daniel-homelab/plan-74-20260507T170332Z-pipeline-analysis.md:89:| Monitor: track loops-per-plan and critic-overturn-rate as analytics | analytics | low | running-pi/state/metrics | none |
<home>/running-pi/extensions/running-pi/index.ts:330:	const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "running-pi-agent-"));
<home>/running-pi/extensions/running-pi/index.ts:1251:	const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "running-pi-delegate-"));
<home>/running-pi/extensions/running-pi/index.ts:1484:			"Run the pre-flight interview before invoking rp-planner. If the fixed interview is insufficient, read <pidex-root>/skills/grill-me/SKILL.md and use it to ask one question at a time, with your recommended answer, until the epic is crisp.",
<home>/running-pi/extensions/running-pi/index.ts:1495:		description: "Start the running-pi rp-* software-delivery pipeline (direct-mode MVP).",
<home>/running-pi/extensions/running-pi/index.ts:1511:			"rp_agent automatically honors <home>/running-pi/config/agents.json unless provider/model/effort are explicitly overridden.",
<home>/running-pi/extensions/running-pi/index.ts:1515:			"Specialists should write full artifacts to files and keep final responses short; rp_agent will truncate oversized final text and store raw child logs under running-pi/state/runs/.",
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T170013Z-pipeline-analysis.md:90:| Mandatory disposable design preview before implementer for class C/D or post-G9 reject | refine-existing-rule (Disposable Design Snippet Preview) | high | running-pi orchestrator + rp-designer | low — rule already exists |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T170013Z-pipeline-analysis.md:91:| Orchestrator brief must echo UI Preservation Class + 2-line user confirm | refine-existing-rule (UI Preservation Classifier) | high | running-pi orchestrator | low |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T170013Z-pipeline-analysis.md:92:| Auto-escalate Retro Mode on 2nd corrective sub-plan | refine-existing-rule (Retro Mode Contract) | medium | running-pi rp-planner | low |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T170013Z-pipeline-analysis.md:93:| Smoke preflight: free-port + canonical fixture seed before first rp-qa | new tool/script | medium | running-pi scripts/preview + rp-qa | low |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T170013Z-pipeline-analysis.md:94:| Pre-devops release-lane resolution gate at end of UAT | refine-existing-rule (Release-Lane Taxonomy) | medium | running-pi orchestrator | low |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T170013Z-pipeline-analysis.md:95:| Demote secondary critic/CR lane to advisory-only when primary APPROVED | analytics + routing | low | running-pi rp-critic / rp-code-reviewer | medium — may miss edge cases |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-015-20260507T170013Z-pipeline-analysis.md:96:| Auto-skip secondary lane on simple fix rounds (<X lines diff) | analytics | low | running-pi config | medium |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-016-20260507T170509Z-pipeline-analysis.md:88:| Add "label source rule" row to UI Parity Checklist + UAT Semantic Fit table | refine-existing-rule | high | running-pi | low |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-016-20260507T170509Z-pipeline-analysis.md:89:| Make post-impl designer audit a routing gate when plan requires screenshot audit | refine-existing-rule | medium | running-pi | low — small added latency on UI-heavy |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-016-20260507T170509Z-pipeline-analysis.md:90:| TDD-table N/A escape hatch for test-only / devops-blocker hotfixes | refine-existing-rule | medium | running-pi | low |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-016-20260507T170509Z-pipeline-analysis.md:91:| Planner rule: when UI groups by source-of-truth taxonomy constant, mandate import/reference, not re-implementation | new-rule (small) | medium | running-pi | low |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-016-20260507T170509Z-pipeline-analysis.md:92:| Tighten DeepSeek critic prompt for UI-heavy parity bindings | refine-existing-rule | low | running-pi | low |
<home>/running-pi/analysis/home-daniel-projects-local-forge.ng/plan-016-20260507T170509Z-pipeline-analysis.md:94:| Track G9 rejection-cause categories in metrics for trend analysis | analytics | low | running-pi | low |
<home>/running-pi/analysis/plans/pipeline-analyst-findings-bundle-1-plan.md:7:tags: [running-pi, pipeline-analyst, harness, ui, planner, critic, uat]
<home>/running-pi/evals/metrics/fixtures/plan-020b-routing.md:3:agent_under_test: running-pi-extension
<home>/running-pi/evals/metrics/fixtures/plan-020b-routing.md:5:expected_rule: extensions/running-pi/index.ts extractPlanId
<home>/running-pi/agents.output/planning/sandcastle-vs-runningpi-executor-integration-plan.md:9:Compare the `mattpocock/sandcastle` agent mechanics with `running-pi` and safely adopt suitable technical patterns into `running-pi` as an internal executor layer — without replacing the existing `rp-*` process model (`Plan -> Critique -> Implement -> Code Review -> QA -> UAT -> DevOps`).
<home>/running-pi/agents.output/planning/sandcastle-vs-runningpi-executor-integration-plan.md:14:- Comparison matrix for `running-pi rp-*` roles ↔ Sandcastle templates/workflows.
<home>/running-pi/agents.output/planning/sandcastle-vs-runningpi-executor-integration-plan.md:24:- New UI/TUI features in `running-pi`.
<home>/running-pi/agents.output/planning/sandcastle-vs-runningpi-executor-integration-plan.md:31:| 1 | Context comparison + architecture decision package | Mapping doc with adoptability per feature (`running-pi` vs Sandcastle) | rp-architect |
<home>/running-pi/agents.output/planning/sandcastle-vs-runningpi-executor-integration-plan.md:85:| Merge/branch conflicts in the pilot | Incorrect Git integrity | Fallback to existing `running-pi` method with automatic deactivation |
<home>/running-pi/agents.output/critiques/parallel-lanes-iteration1-locking-plan-critique.md:44:**Rev 2**: Slice 3 enumerates exact migration targets: `running-pi-instructions.md`, `skills/runningpi/SKILL.md`; explicit zero for `agents/rp-*.md` (documentation-binding only, no logic changes). M4 closed.
<home>/running-pi/agents.output/critiques/parallel-lanes-iteration1-locking-plan-critique.md:97:**Description**: Slice 3 enumerates exact targets: (1) `running-pi-instructions.md`, (2) `skills/runningpi/SKILL.md`; explicit zero for `agents/rp-*.md` — documentation binding only, no logic changes in Iteration 1.
<home>/running-pi/agents.output/planning/rp-61-pipeline-routing-guardrails.md:6:Scope: running-pi
<home>/running-pi/agents.output/planning/rp-61-pipeline-routing-guardrails.md:51:- `extensions/running-pi/index.ts` guardrail updates.
<home>/running-pi/agents.output/planning/rp-61-pipeline-routing-guardrails.md:57:reason: Start running-pi guardrail implementation
<home>/running-pi/agents.output/planning/parallel-lanes-iteration1-locking-plan.md:120:  1. Reference the new helper contract from `running-pi-instructions.md`.
<home>/running-pi/agents.output/analysis/parallel-agent-lanes-design.md:92:- extend `running-pi-instructions.md` with:
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:7:- `<home>/running-pi/state/metrics/**/*.jsonl` (49 records)
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:8:- `<home>/running-pi/state/runs/**/*.stdout.jsonl.gz` (recent logs; partial corruption on some files)
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:9:- `<home>/running-pi/state/history.jsonl`
<home>/running-pi/skills/cross-repo-contract/SKILL.md:6:  author: running-pi
<home>/running-pi/dashboard/start.sh:37:LOG="/tmp/running-pi-dashboard-$PORT.log"
<home>/running-pi/dashboard/start.sh:62:  npm run ingest --silent >/tmp/running-pi-dashboard-ingest.json
<home>/running-pi/skills/design-snippet-preview/SKILL.md:29:bash <pidex-root>/scripts/preview/create-design-snippet.sh --title "<title>" < snippet.html
<home>/running-pi/skills/design-snippet-preview/SKILL.md:30:bash <pidex-root>/scripts/preview/serve-design-snippet.sh --id <id>
<home>/running-pi/dashboard/scripts/server.py:17:DB = ANALYTICS / "data" / "running-pi.sqlite"
<home>/running-pi/dashboard/scripts/server.py:85:                "agents", "rules", "skills/runningpi", "running-pi-instructions.md",
<home>/running-pi/dashboard/scripts/ingest.py:20:DEFAULT_DB = ANALYTICS / "data" / "running-pi.sqlite"
<home>/running-pi/skills/runningpi/SKILL.md:3:description: Start a running-pi pipeline run. Invoke with /runningpi, /rp, or by saying "running-pi", "pipeline starten", "build this", "implement this". Runs a structured pre-flight interview to define the task precisely, then starts the rp-* pipeline in Pi direct mode using the rp_agent tool.
<home>/running-pi/skills/runningpi/SKILL.md:6:# running-pi Orchestrator
<home>/running-pi/skills/runningpi/SKILL.md:8:This skill is the entry point for every running-pi pipeline run. The user invokes it by typing `/runningpi`, `/rp`, or saying "running-pi".
<home>/running-pi/skills/runningpi/SKILL.md:14:If the fixed pre-flight interview below is not enough to remove ambiguity, load and apply the bundled `grill-me` skill (`<pidex-root>/skills/grill-me/SKILL.md`). Use it to interview the user relentlessly about the plan or design until all decision branches needed for the pipeline are resolved.
<home>/running-pi/skills/runningpi/SKILL.md:27:- User says "running-pi", "pipeline starten", "start a run", "build this", "implement this"
<home>/running-pi/skills/runningpi/SKILL.md:36:- `rp_agent` honors `<home>/running-pi/config/agents.json`: default/tool-heavy agents use lean isolated Pi subprocesses; configured review/synthesis agents may route to Claude, Codex, or Gemini CLI delegates.
<home>/running-pi/skills/runningpi/SKILL.md:37:- `rp_agent` stores raw child JSON streams under `<home>/running-pi/state/runs/` and returns only compact tool details to avoid parent-session bloat.
<home>/running-pi/skills/runningpi/SKILL.md:38:- `rp_agent` records per-agent metrics under `<home>/running-pi/state/metrics/`.
<home>/running-pi/skills/runningpi/SKILL.md:39:- For plan-id allocation, use atomic helper `bash <home>/running-pi/scripts/parallel/manifest.sh next-id --project-root <project-root>` (do not increment `.next-id` ad hoc under parallel load).
<home>/running-pi/skills/runningpi/SKILL.md:42:- Optional notify-only Telegram is allowed in direct mode: use `<pidex-root>/scripts/telegram/notify.sh --optional` to alert the user that Pi needs attention and when the pipeline reaches terminal completion/failure/abort. This sends information only, no buttons, no replies, no `pending-gate.json`.
<home>/running-pi/skills/runningpi/SKILL.md:47:bash <home>/running-pi/scripts/delegate/check-auth.sh --config <home>/running-pi/config/agents.json
<home>/running-pi/skills/runningpi/SKILL.md:77:bash <pidex-root>/scripts/pre-spawn/spawn-with-budget.sh \
<home>/running-pi/skills/runningpi/SKILL.md:90:Before asking "which project?", check the running-pi history log and offer a shortlist of recently-touched **unique project directories**. This saves the user from typing paths they already used.
<home>/running-pi/skills/runningpi/SKILL.md:93:bash <pidex-root>/scripts/history/list.sh --limit 5
<home>/running-pi/skills/runningpi/SKILL.md:96:If the script prints nothing (empty or missing `<pidex-root>/state/history.jsonl`), skip straight to Step 1. Otherwise present its output to the user with an explicit "new" option appended:
<home>/running-pi/skills/runningpi/SKILL.md:143:2. Use bundled agents from `<home>/running-pi/agents/` through the `rp_agent` tool. Project-local `.pi/agents/` copies are optional and not required for the MVP.
<home>/running-pi/skills/runningpi/SKILL.md:168:**UI design interview branch (mandatory when triggered):** Before routing to planner/designer/implementer, load `<pidex-root>/rules/orchestrator/ui-design-interview-gate.md`, `<pidex-root>/rules/orchestrator/ui-preservation-classifier.md`, and (after UI G9 rejection) `<pidex-root>/rules/orchestrator/g9-ui-rejection-delta.md` when the request touches UI placement, hierarchy, layout, mobile, forms, tables, navigation, modals/sheets, cards, status strips, toolbars, or pattern parity ("match", "like X", "same as", "move to where X is"). Ask targeted missing questions only; inspect source when possible instead of asking. Classify the UI intent as preserve / preserve-mostly / redesign / new / incidental. For UI-heavy or visually sensitive work, ask whether the user wants a designer meeting with a temporary preview before implementation (`yes`, `no`, or `only if designer finds ambiguity`). Persist the result as `agents.output/design/<plan-id>-ui-intent-interview.md` or as `## UI Intent Contract` plus `## UI Preservation Classification` in the first plan/design artifact. If UI intent remains ambiguous, route to `user`; do not spawn implementer. If the user requests a temporary preview, route to rp-designer with `rules/rp-designer/design-snippet-preview.md` and use `scripts/preview/*design-snippet.sh` helpers to return localhost and LAN URLs on a random port. For any G9/post-devops preview on a headless/server host, apply `rules/orchestrator/preview-lan-url-required.md`: bind to `0.0.0.0`, verify LAN route, and include both localhost and LAN URLs. If G9/user feedback rejects positioning twice, this UI interview branch is mandatory before any further implementer fix.
<home>/running-pi/skills/runningpi/SKILL.md:431:If the user picks A-E, include in the epic: "Design template: <name> (from <pidex-root>/design-templates/<name>.md — copy to agents.output/design/DESIGN.md at project init)."
<home>/running-pi/skills/runningpi/SKILL.md:804:If A-E: include in the epic "Design template: <name> (from <pidex-root>/design-templates/<name>.md — copy to agents.output/design/DESIGN.md at project init)."
<home>/running-pi/skills/runningpi/SKILL.md:873:> Redesign the dashboard page (src/pages/Dashboard.tsx). Design template: Linear (from <pidex-root>/design-templates/linear.app.md — copy to agents.output/design/DESIGN.md at project init). Design inputs: mockup in design/dashboard-v2.png. Styling: Tailwind + shadcn/ui (migrating from custom CSS). Layout changes: replace the 3-column grid with a 2-column layout, move the stats cards from sidebar into a top row. Behavior: unchanged — same data, same interactions, new layout and styling. Must be responsive (mobile: single column, tablet: 2 columns). Dark mode: yes (Linear template is dark-mode-first). Accessibility: all interactive elements must be keyboard-navigable, WCAG AA. Acceptance: visual match to mockup at 1440px, responsive at 768px and 375px, existing Playwright E2E tests pass with updated selectors if needed.
<home>/running-pi/skills/runningpi/SKILL.md:904:For architecture-first routes, the team prompt (see Rule 7 template in running-pi-instructions.md) must include:
<home>/running-pi/skills/runningpi/SKILL.md:927:Compose the lead prompt from the template in `<pidex-root>/running-pi-instructions.md` Rule 7 and call:
<home>/running-pi/skills/runningpi/SKILL.md:930:bash <pidex-root>/scripts/lead/start.sh \
<home>/running-pi/skills/runningpi/SKILL.md:953:reply=$(bash <pidex-root>/scripts/telegram/recv-gate.sh --wait 60)
<home>/running-pi/skills/runningpi/SKILL.md:955:    bash <pidex-root>/scripts/relay/handle.sh --text "$reply" --chat-id "$TELEGRAM_CHAT_ID"
<home>/running-pi/skills/runningpi/SKILL.md:958:Loop this after each gate send until the gate clears. If `recv-gate.sh` returns empty, check back on the next monitoring tick. If the user reports "Telegram message does not arrive", relay their chosen option manually: `bash <pidex-root>/scripts/relay/handle.sh --text "rp!approve" --chat-id "$TELEGRAM_CHAT_ID"`.
<home>/running-pi/skills/runningpi/SKILL.md:965:GATE=$(jq -r '.gate' <pidex-root>/state/pending-gate.json 2>/dev/null)
<home>/running-pi/skills/runningpi/SKILL.md:968:    LEAD_ID=$(cat <pidex-root>/state/active-lead.id)
<home>/running-pi/skills/runningpi/SKILL.md:969:    CWD=$(cat <pidex-root>/state/lead-${LEAD_ID}.cwd)
<home>/running-pi/skills/runningpi/SKILL.md:995:**Stall auto-kill:** Since keepalive v2, the lead is automatically SIGTERMed if no new agents.output/ file appears for 600s AND no gate is pending. Look for `keepalive_stall_kill` in running-pi.log to confirm. No manual intervention needed for common hang cases.
<home>/running-pi/skills/runningpi/SKILL.md:1001:- **Status:** `bash <pidex-root>/scripts/lead/status.sh`
<home>/running-pi/skills/runningpi/SKILL.md:1002:- **Stop:** `bash <pidex-root>/scripts/lead/stop.sh` (add `--force` if needed)
<home>/running-pi/skills/runningpi/SKILL.md:1003:- **Replace:** `bash <pidex-root>/scripts/lead/start.sh --replace --prompt "..." --cwd "..." --teams`
<home>/running-pi/skills/runningpi/SKILL.md:1024:Do not copy agent files into the project. Use bundled agents from `<home>/running-pi/agents/` through `rp_agent`. Then `cd` into the project (or pass the project path as `cwd` to every `rp_agent` call).
<home>/running-pi/skills/runningpi/SKILL.md:1029:bash <pidex-root>/scripts/history/append.sh \
<home>/running-pi/skills/runningpi/SKILL.md:1035:cd "<absolute project path>" && bash <pidex-root>/scripts/pipeline/event.sh \
<home>/running-pi/skills/runningpi/SKILL.md:1043:`pipeline/event.sh` is analytics-only. It writes JSONL under `<pidex-root>/state/pipeline-events/`; it does not drive a backend scheduler. Operators never pass SQLite `project_id`; ingest derives that from `project_path` (default `$PWD`).
<home>/running-pi/skills/runningpi/SKILL.md:1048:bash <pidex-root>/scripts/history/append.sh \
<home>/running-pi/skills/runningpi/SKILL.md:1053:cd "<absolute project path>" && bash <pidex-root>/scripts/pipeline/event.sh \
<home>/running-pi/skills/runningpi/SKILL.md:1065:Use the `rp_agent` tool for every specialist handoff. Do **not** use legacy `dispatch.sh` in normal direct mode; `rp_agent` already honors `<home>/running-pi/config/agents.json`, routes to Pi/Codex/Claude/Gemini as configured, stores raw child logs under `state/runs/`, and validates ROUTING/context files.
<home>/running-pi/skills/runningpi/SKILL.md:1093:**Legacy plan migration:** when resuming an active plan that lacks `Execution Profile`, `Skipped Agents`, or `Retro Mode`, read `<pidex-root>/rules/orchestrator/legacy-plan-profile-migration.md`. Prefer a small rp-planner revision before implementation; if late-stage, run conservative full path and brief `LEGACY-PROFILE-SKIP: no skips honored`.
<home>/running-pi/skills/runningpi/SKILL.md:1129:**Parallel rp_agent safety:** When emitting multiple `rp_agent` calls in the same assistant turn (parallel implementer lanes, configured secondary review lanes, or post-retro handoffs), resolve `<home>/running-pi/config/agents.json` first and pass explicit `provider`, `model`, and `effort` for every call. Do not rely on default routing in same-turn parallel calls. Never force `provider=pi` while leaving a delegate model alias such as `sonnet`/`opus`; if overriding to Pi, use a Pi-qualified model from config defaults (for example `openai-codex/gpt-5.3-codex`).
<home>/running-pi/skills/runningpi/SKILL.md:1131:**Orchestrator-owned parallel secondary review lanes:** For `rp-critic`, `rp-code-reviewer`, and `rp-security`, inspect the agent route in `<home>/running-pi/config/agents.json` before spawning. If it contains `parallel_secondary`, the orchestrator owns the fan-out. `rp_agent` must not spawn nested agents.
<home>/running-pi/skills/runningpi/SKILL.md:1165:- `rp-security`: read `<pidex-root>/rules/rp-security/fallow-structural-signal.md`; record fallow evidence or `FALLOW-SKIP`.
<home>/running-pi/skills/runningpi/SKILL.md:1166:- `rp-qa`: read `<pidex-root>/rules/rp-qa/fallow-static-audit-gate.md`; do not emit QA COMPLETE without fallow evidence or `FALLOW-SKIP`.
<home>/running-pi/skills/runningpi/SKILL.md:1170:**Post-devops UI preview before G4 (mandatory):** Load `<pidex-root>/rules/orchestrator/post-devops-ui-preview-gate.md` when `rp-devops` Stage 1 completes or before any G4. If any included plan has `User Preview Requirement` with `UI involved: yes`, `Preview required before G4: yes`, visible UI/browser changes, or uncertainty, do NOT ask `push/local/hold/abort` yet. Start preview from committed local HEAD, show URL/routes/screens to user, ask `approve/reject` as G9. On approve, mark/brief `User Preview Before G4: APPROVED`, then ask G4 directly or re-invoke `rp-devops` for Stage 2 with that approval context. On reject, record `MANDATORY-RETRO-TRIGGER: G9 rejection` and route to `rp-implementer`.
<home>/running-pi/skills/runningpi/SKILL.md:1177:bash <pidex-root>/scripts/telegram/notify.sh \
<home>/running-pi/skills/runningpi/SKILL.md:1192:The agents' instructions include "If running via running-pi, call send-gate.sh" — in direct mode, ignore that branch. The agents will fall through to their interactive-mode behavior (report to user directly).
<home>/running-pi/skills/runningpi/SKILL.md:1273:bash <pidex-root>/scripts/telegram/notify.sh \
<home>/running-pi/dashboard/package.json:2:  "name": "running-pi-dashboard",
<home>/running-pi/dashboard/public/index.html:109:  return !['daniel','root','running-pi'].includes(name) && !path.endsWith('<home>') && !path.endsWith('/running-pi');
<home>/running-pi/dashboard/README.md:8:cd <home>/running-pi/dashboard
<home>/running-pi/dashboard/README.md:19:<pidex-root>/scripts/pipeline/event.sh --plan plan-030 --event pipeline_started --status running --actor orchestrator
<home>/running-pi/dashboard/README.md:20:<pidex-root>/scripts/pipeline/event.sh --plan plan-030 --event pipeline_completed --status completed --actor orchestrator
<home>/running-pi/dashboard/README.md:36:cd <home>/running-pi
<home>/running-pi/dashboard/README.md:44:cd <home>/running-pi/dashboard
<home>/running-pi/dashboard/README.md:54:dashboard/data/running-pi.sqlite
<home>/running-pi/templates/cli-delegates/rp-critic.md:1:You are **rp-critic** for the running-pi pipeline.
<home>/running-pi/templates/cli-delegates/rp-uat.md:1:You are **rp-uat** (Product Owner) for the running-pi pipeline.
<home>/running-pi/templates/cli-delegates/rp-retrospective.md:1:You are **rp-retrospective** for the running-pi pipeline.
<home>/running-pi/templates/cli-delegates/rp-code-reviewer.md:1:You are **rp-code-reviewer** for the running-pi pipeline.
<home>/running-pi/templates/cli-delegates/rp-designer.md:1:You are **rp-designer** for the running-pi pipeline.
<home>/running-pi/templates/lead-prompt.md:3:Used by the orchestrator when calling `<pidex-root>/scripts/lead/start.sh --prompt "..."`.
<home>/running-pi/templates/lead-prompt.md:7:MANDATORY READING: ~/.claude/running-pi-instructions.md (Rules 1-7).
<home>/running-pi/templates/lead-prompt.md:33:Apply auto-proceed (Rule 4), gate detection (Rule 5), Telegram routing via running-pi
<home>/running-pi/templates/lead-prompt.md:34:(Rule 6 — use bash <pidex-root>/scripts/telegram/send-gate.sh, NOT the MCP plugin),
<home>/running-pi/templates/lead-prompt.md:41:  PROVIDER=$(jq -r --arg a "<agent>" '.agents[$a].provider // .defaults.provider' <pidex-root>/config/agents.json)
<home>/running-pi/templates/lead-prompt.md:46:  3. Run: bash <pidex-root>/scripts/delegate/dispatch.sh --agent <agent> --inputs /tmp/rp-inputs.json --output <output-path> --project-dir "$PWD"
<home>/running-pi/templates/lead-prompt.md:54:  bash <pidex-root>/scripts/telegram/send-gate.sh --gate <ID> --plan <N> --slug <slug> --options "<comma-separated>" --context "<message>" --lead-id "$LEAD_ID"

### rg pattern: spark
count: 73
<home>/running-pi/config/pricing.json:8:  "gpt-5.3-codex-spark": { "input": 0.3, "output": 1.2 },
<home>/running-pi/config/agents.json:15:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash drives planning — strong reasoning at low cost via Pi runner. No parallel secondary; Claude Sonnet reserved for review-only gates."
<home>/running-pi/config/agents.json:21:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash for architecture decisions. Straightforward document synthesis with repo inspection."
<home>/running-pi/config/agents.json:27:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash for implementation — full tool loop (read/bash/edit/write). No Codex Spark here; implementation is the heavy lift."
<home>/running-pi/config/agents.json:40:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash leads review; Claude Sonnet runs as secondary parallel for independent quality perspective on diffs/docs. Both through Pi runner for consistent ROUTING validation and artifact logging.",
<home>/running-pi/config/agents.json:62:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash leads critique; Claude Sonnet runs as secondary parallel for independent plan/scope assessment. Secondary lane is orchestrator-owned and advisory-with-merge-summary during rollout.",
<home>/running-pi/config/agents.json:84:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash leads security scan; Claude Sonnet runs as secondary parallel for independent vulnerability perspective. Both get full bash/grep access to the repository.",
<home>/running-pi/config/agents.json:99:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash for QA — test execution and verification. Needs runtime checks and Playwright MCP tools. Good balance of speed and tool-following for test automation."
<home>/running-pi/config/agents.json:105:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash for devops — git, file ops, release automation. Standard non-critical stage on this model."
<home>/running-pi/config/agents.json:112:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash for design work — sufficient for design doc synthesis against templates."
<home>/running-pi/config/agents.json:118:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash for UAT — value validation against epic. Straightforward document comparison."
<home>/running-pi/config/agents.json:124:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash for retrospectives. Lightweight synthesis of pipeline artifacts into lessons."
<home>/running-pi/config/agents.json:128:      "model": "openai-codex/gpt-5.3-codex-spark",
<home>/running-pi/config/agents.json:130:      "notes": "ds-claude-codex-spark profile: Codex Spark for light analysis — grep/bash work, no implementation. Good fit for quick findings without consuming primary model or Codex full quota."
<home>/running-pi/config/agents.json:134:      "model": "openai-codex/gpt-5.3-codex-spark",
<home>/running-pi/config/agents.json:136:      "notes": "ds-claude-codex-spark profile: Codex Spark for roadmap/doc synthesis — pure document work, no coding. Saves DeepSeek capacity for actual implementation work."
<home>/running-pi/config/agents.json:140:      "model": "openai-codex/gpt-5.3-codex-spark",
<home>/running-pi/config/agents.json:142:      "notes": "ds-claude-codex-spark profile: Codex Spark for pipeline governance — lightweight rules/skills/docs updates. Not implementation, just process improvement synthesis."
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:15:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash drives planning — strong reasoning at low cost via Pi runner. No parallel secondary; Claude Sonnet reserved for review-only gates."
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:21:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash for architecture decisions. Straightforward document synthesis with repo inspection."
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:27:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash for implementation — full tool loop (read/bash/edit/write). No Codex Spark here; implementation is the heavy lift."
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:40:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash leads review; Claude Sonnet runs as secondary parallel for independent quality perspective on diffs/docs. Both through Pi runner for consistent ROUTING validation and artifact logging.",
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:62:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash leads critique; Claude Sonnet runs as secondary parallel for independent plan/scope assessment. Secondary lane is orchestrator-owned and advisory-with-merge-summary during rollout.",
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:84:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash leads security scan; Claude Sonnet runs as secondary parallel for independent vulnerability perspective. Both get full bash/grep access to the repository.",
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:99:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash for QA — test execution and verification. Needs runtime checks and Playwright MCP tools. Good balance of speed and tool-following for test automation."
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:105:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash for devops — git, file ops, release automation. Standard non-critical stage on this model."
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:112:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash for design work — sufficient for design doc synthesis against templates."
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:118:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash for UAT — value validation against epic. Straightforward document comparison."
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:124:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash for retrospectives. Lightweight synthesis of pipeline artifacts into lessons."
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:128:      "model": "openai-codex/gpt-5.3-codex-spark",
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:130:      "notes": "ds-claude-codex-spark profile: Codex Spark for light analysis — grep/bash work, no implementation. Good fit for quick findings without consuming primary model or Codex full quota."
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:134:      "model": "openai-codex/gpt-5.3-codex-spark",
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:136:      "notes": "ds-claude-codex-spark profile: Codex Spark for roadmap/doc synthesis — pure document work, no coding. Saves DeepSeek capacity for actual implementation work."
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:140:      "model": "openai-codex/gpt-5.3-codex-spark",
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:142:      "notes": "ds-claude-codex-spark profile: Codex Spark for pipeline governance — lightweight rules/skills/docs updates. Not implementation, just process improvement synthesis."
<home>/running-pi/config/profiles/codex-light.json:64:      "model": "openai-codex/gpt-5.3-codex-spark",
<home>/running-pi/config/profiles/codex-light.json:97:      "model": "openai-codex/gpt-5.3-codex-spark",
<home>/running-pi/config/profiles/codex-light.json:103:      "model": "openai-codex/gpt-5.3-codex-spark",
<home>/running-pi/scripts/provider-limits/probe.py:224:    if "spark" in name or "bengalfox" in name:
<home>/running-pi/scripts/provider-limits/probe.py:225:        return "codex-spark"
<home>/running-pi/scripts/provider-limits/probe.py:351:    """Prefer spark-only active profiles against the spark quota window."""
<home>/running-pi/scripts/provider-limits/probe.py:352:    if profile_name and "spark" in profile_name.lower():
<home>/running-pi/scripts/provider-limits/probe.py:371:        has_spark_codex = False
<home>/running-pi/scripts/provider-limits/probe.py:376:            if "codex-spark" in normalized:
<home>/running-pi/scripts/provider-limits/probe.py:377:                has_spark_codex = True
<home>/running-pi/scripts/provider-limits/probe.py:380:        if has_spark_codex and not has_plain_codex:
<home>/running-pi/scripts/provider-limits/probe.py:381:            return "codex-spark"
<home>/running-pi/scripts/provider-limits/probe.py:385:def _fallback_profile(profile_name: str | None, candidate: str, use_spark_profile: bool) -> str:
<home>/running-pi/scripts/provider-limits/probe.py:386:    if use_spark_profile and profile_name and _active_codex_profile_is_registered(profile_name):
<home>/running-pi/scripts/provider-limits/probe.py:393:    use_spark_profile = active_profile and "spark" in active_profile.lower() and _active_codex_profile_is_registered(active_profile)
<home>/running-pi/scripts/provider-limits/probe.py:394:    codex_provider = "codex-spark" if use_spark_profile else "codex"
<home>/running-pi/scripts/provider-limits/probe.py:410:            "reason": f"{ 'Spark' if codex_provider == 'codex-spark' else 'Codex' } seven-day quota is exhausted (100%); use DeepSeek as the Pi/operator fallback with Claude delegates.",
<home>/running-pi/scripts/provider-limits/probe.py:412:    # At very high usage, avoid relying on Codex/spark as operator even for short fallback
<home>/running-pi/scripts/provider-limits/probe.py:417:            "reason": f"{ 'Spark' if codex_provider == 'codex-spark' else 'Codex' } seven-day quota is {used}% used; switch to deepseek-claude for headroom (ultralight still reserves Codex as fallback).",
<home>/running-pi/scripts/provider-limits/probe.py:422:                "profile": _fallback_profile(active_profile, "codex-ultralight", use_spark_profile),
<home>/running-pi/scripts/provider-limits/probe.py:423:                "reason": f"{ 'Spark' if codex_provider == 'codex-spark' else 'Codex' } seven-day forecast ({confidence}) projects exhaustion in {hours_to_exhaustion}h before reset in {hours_until_reset}h.",
<home>/running-pi/scripts/provider-limits/probe.py:426:            "profile": _fallback_profile(active_profile, "codex-light", use_spark_profile),
<home>/running-pi/scripts/provider-limits/probe.py:427:            "reason": f"{ 'Spark' if codex_provider == 'codex-spark' else 'Codex' } seven-day forecast ({confidence}) projects exhaustion before reset; reducing usage.",
<home>/running-pi/scripts/provider-limits/probe.py:434:                "profile": _fallback_profile(active_profile, "codex-ultralight", use_spark_profile),
<home>/running-pi/scripts/provider-limits/probe.py:435:                "reason": f"{ 'Spark' if codex_provider == 'codex-spark' else 'Codex' } seven-day quota is {used}% used; safety floor applies even though forecast does not exhaust before reset.",
<home>/running-pi/scripts/provider-limits/probe.py:439:                "profile": _fallback_profile(active_profile, "codex-light", use_spark_profile),
<home>/running-pi/scripts/provider-limits/probe.py:440:                "reason": f"{ 'Spark' if codex_provider == 'codex-spark' else 'Codex' } seven-day quota is {used}% used; forecast is safe but usage is high.",
<home>/running-pi/scripts/provider-limits/probe.py:443:            "profile": _fallback_profile(active_profile, "codex-heavy", use_spark_profile),
<home>/running-pi/scripts/provider-limits/probe.py:444:            "reason": f"{ 'Spark' if codex_provider == 'codex-spark' else 'Codex' } seven-day forecast ({confidence}) does not exhaust before reset.",
<home>/running-pi/scripts/provider-limits/probe.py:449:            "profile": _fallback_profile(active_profile, "codex-ultralight", use_spark_profile),
<home>/running-pi/scripts/provider-limits/probe.py:450:            "reason": f"{ 'Spark' if codex_provider == 'codex-spark' else 'Codex' } seven-day quota is {used}% used; not enough forecast history, using safety threshold.",
<home>/running-pi/scripts/provider-limits/probe.py:454:            "profile": _fallback_profile(active_profile, "codex-light", use_spark_profile),
<home>/running-pi/scripts/provider-limits/probe.py:455:            "reason": f"{ 'Spark' if codex_provider == 'codex-spark' else 'Codex' } seven-day quota is {used}% used; not enough forecast history, using safety threshold.",
<home>/running-pi/scripts/provider-limits/probe.py:458:        "profile": _fallback_profile(active_profile, "codex-heavy", use_spark_profile),
<home>/running-pi/scripts/provider-limits/probe.py:459:        "reason": f"{ 'Spark' if codex_provider == 'codex-spark' else 'Codex' } seven-day quota is below safety thresholds and no risky forecast is available.",
<home>/running-pi/TODO.md:58:    "gpt-5.3-codex-spark":{"input": 0.30,  "output": 1.20},
<home>/running-pi/extensions/running-pi/index.ts:552:	if (normalized.includes("codex-spark")) return "codex-spark";
<home>/running-pi/extensions/running-pi/index.ts:585:	const providerLabel = quotaProvider === "codex-spark" ? "Codex Spark" : "Codex";

### rg pattern: claude
count: 249
<home>/running-pi/config/pricing.json:2:  "claude-opus": { "input": 15.0, "output": 75.0 },
<home>/running-pi/config/pricing.json:3:  "claude-sonnet": { "input": 3.0, "output": 15.0 },
<home>/running-pi/config/pricing.json:4:  "claude-haiku": { "input": 1.0, "output": 5.0 },
<home>/running-pi/config/agents.json:15:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash drives planning — strong reasoning at low cost via Pi runner. No parallel secondary; Claude Sonnet reserved for review-only gates."
<home>/running-pi/config/agents.json:21:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash for architecture decisions. Straightforward document synthesis with repo inspection."
<home>/running-pi/config/agents.json:27:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash for implementation — full tool loop (read/bash/edit/write). No Codex Spark here; implementation is the heavy lift."
<home>/running-pi/config/agents.json:35:          "provider": "claude",
<home>/running-pi/config/agents.json:37:          "label": "claude-sonnet"
<home>/running-pi/config/agents.json:40:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash leads review; Claude Sonnet runs as secondary parallel for independent quality perspective on diffs/docs. Both through Pi runner for consistent ROUTING validation and artifact logging.",
<home>/running-pi/config/agents.json:57:          "provider": "claude",
<home>/running-pi/config/agents.json:59:          "label": "claude-sonnet"
<home>/running-pi/config/agents.json:62:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash leads critique; Claude Sonnet runs as secondary parallel for independent plan/scope assessment. Secondary lane is orchestrator-owned and advisory-with-merge-summary during rollout.",
<home>/running-pi/config/agents.json:79:          "provider": "claude",
<home>/running-pi/config/agents.json:81:          "label": "claude-sonnet"
<home>/running-pi/config/agents.json:84:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash leads security scan; Claude Sonnet runs as secondary parallel for independent vulnerability perspective. Both get full bash/grep access to the repository.",
<home>/running-pi/config/agents.json:99:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash for QA — test execution and verification. Needs runtime checks and Playwright MCP tools. Good balance of speed and tool-following for test automation."
<home>/running-pi/config/agents.json:105:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash for devops — git, file ops, release automation. Standard non-critical stage on this model."
<home>/running-pi/config/agents.json:112:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash for design work — sufficient for design doc synthesis against templates."
<home>/running-pi/config/agents.json:118:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash for UAT — value validation against epic. Straightforward document comparison."
<home>/running-pi/config/agents.json:124:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash for retrospectives. Lightweight synthesis of pipeline artifacts into lessons."
<home>/running-pi/config/agents.json:130:      "notes": "ds-claude-codex-spark profile: Codex Spark for light analysis — grep/bash work, no implementation. Good fit for quick findings without consuming primary model or Codex full quota."
<home>/running-pi/config/agents.json:136:      "notes": "ds-claude-codex-spark profile: Codex Spark for roadmap/doc synthesis — pure document work, no coding. Saves DeepSeek capacity for actual implementation work."
<home>/running-pi/config/agents.json:142:      "notes": "ds-claude-codex-spark profile: Codex Spark for pipeline governance — lightweight rules/skills/docs updates. Not implementation, just process improvement synthesis."
<home>/running-pi/config/profiles/codex-ultralight.json:12:      "provider": "claude",
<home>/running-pi/config/profiles/codex-ultralight.json:27:      "provider": "claude",
<home>/running-pi/config/profiles/codex-ultralight.json:42:      "provider": "claude",
<home>/running-pi/config/profiles/codex-ultralight.json:57:      "provider": "claude",
<home>/running-pi/config/profiles/codex-ultralight.json:72:      "provider": "claude",
<home>/running-pi/config/profiles/codex-ultralight.json:87:      "provider": "claude",
<home>/running-pi/config/profiles/codex-ultralight.json:114:      "provider": "claude",
<home>/running-pi/config/profiles/codex-ultralight.json:129:      "provider": "claude",
<home>/running-pi/config/profiles/codex-ultralight.json:144:      "provider": "claude",
<home>/running-pi/config/profiles/codex-ultralight.json:171:      "provider": "claude",
<home>/running-pi/config/profiles/codex-ultralight.json:198:      "provider": "claude",
<home>/running-pi/config/profiles/codex-ultralight.json:214:      "provider": "claude",
<home>/running-pi/config/profiles/codex-ultralight.json:229:      "provider": "claude",
<home>/running-pi/config/profiles/codex-ultralight.json:244:      "provider": "claude",
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:15:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash drives planning — strong reasoning at low cost via Pi runner. No parallel secondary; Claude Sonnet reserved for review-only gates."
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:21:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash for architecture decisions. Straightforward document synthesis with repo inspection."
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:27:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash for implementation — full tool loop (read/bash/edit/write). No Codex Spark here; implementation is the heavy lift."
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:35:          "provider": "claude",
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:37:          "label": "claude-sonnet"
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:40:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash leads review; Claude Sonnet runs as secondary parallel for independent quality perspective on diffs/docs. Both through Pi runner for consistent ROUTING validation and artifact logging.",
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:57:          "provider": "claude",
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:59:          "label": "claude-sonnet"
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:62:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash leads critique; Claude Sonnet runs as secondary parallel for independent plan/scope assessment. Secondary lane is orchestrator-owned and advisory-with-merge-summary during rollout.",
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:79:          "provider": "claude",
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:81:          "label": "claude-sonnet"
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:84:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash leads security scan; Claude Sonnet runs as secondary parallel for independent vulnerability perspective. Both get full bash/grep access to the repository.",
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:99:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash for QA — test execution and verification. Needs runtime checks and Playwright MCP tools. Good balance of speed and tool-following for test automation."
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:105:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash for devops — git, file ops, release automation. Standard non-critical stage on this model."
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:112:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash for design work — sufficient for design doc synthesis against templates."
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:118:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash for UAT — value validation against epic. Straightforward document comparison."
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:124:      "notes": "ds-claude-codex-spark profile: DeepSeek V4 Flash for retrospectives. Lightweight synthesis of pipeline artifacts into lessons."
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:130:      "notes": "ds-claude-codex-spark profile: Codex Spark for light analysis — grep/bash work, no implementation. Good fit for quick findings without consuming primary model or Codex full quota."
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:136:      "notes": "ds-claude-codex-spark profile: Codex Spark for roadmap/doc synthesis — pure document work, no coding. Saves DeepSeek capacity for actual implementation work."
<home>/running-pi/config/profiles/ds-claude-codex-spark.json:142:      "notes": "ds-claude-codex-spark profile: Codex Spark for pipeline governance — lightweight rules/skills/docs updates. Not implementation, just process improvement synthesis."
<home>/running-pi/config/profiles/deepseek-claude.json:12:      "provider": "claude",
<home>/running-pi/config/profiles/deepseek-claude.json:15:      "notes": "deepseek-claude profile: Claude Sonnet handles this specialist role to avoid Codex quota use; Pi/operator default is deepseek/deepseek-v4-flash; Claude delegates handle specialist roles where configured. Analysis can require repo grep/bash and should stay tool-capable.",
<home>/running-pi/config/profiles/deepseek-claude.json:27:      "provider": "claude",
<home>/running-pi/config/profiles/deepseek-claude.json:30:      "notes": "deepseek-claude profile: Claude Sonnet handles this specialist role to avoid Codex quota use; Pi/operator default is deepseek/deepseek-v4-flash; Claude delegates handle specialist roles where configured. Architecture edits often modify project docs/files directly.",
<home>/running-pi/config/profiles/deepseek-claude.json:42:      "provider": "claude",
<home>/running-pi/config/profiles/deepseek-claude.json:45:      "notes": "deepseek-claude profile: Claude Opus handles the most think-heavy planning/scope step; Pi/operator default is deepseek/deepseek-v4-flash; Claude delegates handle specialist roles where configured. Planner needs repo inspection and occasionally file writes.",
<home>/running-pi/config/profiles/deepseek-claude.json:57:      "provider": "claude",
<home>/running-pi/config/profiles/deepseek-claude.json:60:      "notes": "deepseek-claude profile: Claude Sonnet handles this specialist role to avoid Codex quota use; Pi/operator default is deepseek/deepseek-v4-flash; Claude delegates handle specialist roles where configured. Primary coding role; must have full tool loop (read/bash/edit/write).",
<home>/running-pi/config/profiles/deepseek-claude.json:72:      "provider": "claude",
<home>/running-pi/config/profiles/deepseek-claude.json:75:      "notes": "deepseek-claude profile: Claude Sonnet handles this specialist role to avoid Codex quota use; Pi/operator default is deepseek/deepseek-v4-flash; Claude delegates handle specialist roles where configured. Needs runtime checks, test execution, optional Playwright MCP tools.",
<home>/running-pi/config/profiles/deepseek-claude.json:87:      "provider": "claude",
<home>/running-pi/config/profiles/deepseek-claude.json:102:      "notes": "deepseek-claude profile: Claude Sonnet handles this specialist role to avoid Codex quota use; Pi/operator default is deepseek/deepseek-v4-flash; Claude delegates handle specialist roles where configured. Security scans depend on bash/grep across repository. Secondary DeepSeek/MiniMax lanes are orchestrator-owned and advisory-with-merge-summary during rollout.",
<home>/running-pi/config/profiles/deepseek-claude.json:114:      "provider": "claude",
<home>/running-pi/config/profiles/deepseek-claude.json:117:      "notes": "deepseek-claude profile: Claude Sonnet handles this specialist role to avoid Codex quota use; Pi/operator default is deepseek/deepseek-v4-flash; Claude delegates handle specialist roles where configured. Release/devops stage requires git + file operations; keep on tool-capable Pi route.",
<home>/running-pi/config/profiles/deepseek-claude.json:129:      "provider": "claude",
<home>/running-pi/config/profiles/deepseek-claude.json:132:      "notes": "deepseek-claude profile: Claude Sonnet handles this specialist role to avoid Codex quota use; Pi/operator default is deepseek/deepseek-v4-flash; Claude delegates handle specialist roles where configured. Pipeline governance updates can touch rules/skills/docs.",
<home>/running-pi/config/profiles/deepseek-claude.json:144:      "provider": "claude",
<home>/running-pi/config/profiles/deepseek-claude.json:159:      "notes": "deepseek-claude profile: Claude Sonnet handles this specialist role to avoid Codex quota use; Pi/operator default is deepseek/deepseek-v4-flash; Claude delegates handle specialist roles where configured. Diff/document synthesis through Pi runner. Uses gpt-5.5 via Pi so logs, tools, metadata, retries, and ROUTING checks match the rest of the pipeline. Secondary DeepSeek/MiniMax lanes are orchestrator-owned and advisory-with-merge-summary during rollout.",
<home>/running-pi/config/profiles/deepseek-claude.json:171:      "provider": "claude",
<home>/running-pi/config/profiles/deepseek-claude.json:186:      "notes": "deepseek-claude profile: Claude Sonnet handles this specialist role to avoid Codex quota use; Pi/operator default is deepseek/deepseek-v4-flash; Claude delegates handle specialist roles where configured. Plan critique and scope checking through Pi runner. Uses gpt-5.5 via Pi for consistent execution and observability. Secondary DeepSeek/MiniMax lanes are orchestrator-owned and advisory-with-merge-summary during rollout.",
<home>/running-pi/config/profiles/deepseek-claude.json:198:      "provider": "claude",
<home>/running-pi/config/profiles/deepseek-claude.json:202:      "notes": "deepseek-claude profile: Claude Sonnet handles this specialist role to avoid Codex quota use; Pi/operator default is deepseek/deepseek-v4-flash; Claude delegates handle specialist roles where configured. Design agent runs through Pi runner so design docs can be inspected/written with the same tool loop and metadata as other agents.",
<home>/running-pi/config/profiles/deepseek-claude.json:214:      "provider": "claude",
<home>/running-pi/config/profiles/deepseek-claude.json:217:      "notes": "deepseek-claude profile: Claude Sonnet handles this specialist role to avoid Codex quota use; Pi/operator default is deepseek/deepseek-v4-flash; Claude delegates handle specialist roles where configured. Roadmap/doc synthesis runs through Pi runner for consistent tool loop, artifacts, metrics, and ROUTING validation.",
<home>/running-pi/config/profiles/deepseek-claude.json:229:      "provider": "claude",
<home>/running-pi/config/profiles/deepseek-claude.json:232:      "notes": "deepseek-claude profile: Claude Sonnet handles this specialist role to avoid Codex quota use; Pi/operator default is deepseek/deepseek-v4-flash; Claude delegates handle specialist roles where configured. UAT runs on Pi/Codex path for consistent ROUTING and artifact behavior.",
<home>/running-pi/config/profiles/deepseek-claude.json:244:      "provider": "claude",
<home>/running-pi/config/profiles/deepseek-claude.json:247:      "notes": "deepseek-claude profile: Claude Sonnet handles this specialist role to avoid Codex quota use; Pi/operator default is deepseek/deepseek-v4-flash; Claude delegates handle specialist roles where configured. Retrospective runs on Pi/Codex path for consistent ROUTING and artifact behavior.",
<home>/running-pi/config/profiles/codex-light.json:12:      "provider": "claude",
<home>/running-pi/config/profiles/codex-light.json:27:      "provider": "claude",
<home>/running-pi/config/profiles/codex-light.json:42:      "provider": "claude",
<home>/running-pi/config/profiles/codex-light.json:69:      "provider": "claude",
<home>/running-pi/config/profiles/codex-light.json:108:      "provider": "claude",
<home>/running-pi/config/profiles/codex-light.json:135:      "provider": "claude",
<home>/running-pi/config/profiles/codex-light.json:162:      "provider": "claude",
<home>/running-pi/config/profiles/codex-light.json:178:      "provider": "claude",
<home>/running-pi/config/profiles/codex-light.json:193:      "provider": "claude",
<home>/running-pi/config/profiles/codex-light.json:208:      "provider": "claude",
<home>/running-pi/config/profiles/minimax-claude.json:12:      "provider": "claude",
<home>/running-pi/config/profiles/minimax-claude.json:15:      "notes": "minimax-claude profile: Claude Sonnet handles this specialist role to avoid Codex quota use; Pi/operator default is minimax/MiniMax-M2.7; Claude delegates handle specialist roles where configured. Analysis can require repo grep/bash and should stay tool-capable.",
<home>/running-pi/config/profiles/minimax-claude.json:27:      "provider": "claude",
<home>/running-pi/config/profiles/minimax-claude.json:30:      "notes": "minimax-claude profile: Claude Sonnet handles this specialist role to avoid Codex quota use; Pi/operator default is minimax/MiniMax-M2.7; Claude delegates handle specialist roles where configured. Architecture edits often modify project docs/files directly.",
<home>/running-pi/config/profiles/minimax-claude.json:42:      "provider": "claude",
<home>/running-pi/config/profiles/minimax-claude.json:45:      "notes": "minimax-claude profile: Claude Opus handles the most think-heavy planning/scope step; Pi/operator default is minimax/MiniMax-M2.7; Claude delegates handle specialist roles where configured. Planner needs repo inspection and occasionally file writes.",
<home>/running-pi/config/profiles/minimax-claude.json:57:      "provider": "claude",
<home>/running-pi/config/profiles/minimax-claude.json:60:      "notes": "minimax-claude profile: Claude Sonnet handles this specialist role to avoid Codex quota use; Pi/operator default is minimax/MiniMax-M2.7; Claude delegates handle specialist roles where configured. Primary coding role; must have full tool loop (read/bash/edit/write).",
<home>/running-pi/config/profiles/minimax-claude.json:72:      "provider": "claude",
<home>/running-pi/config/profiles/minimax-claude.json:75:      "notes": "minimax-claude profile: Claude Sonnet handles this specialist role to avoid Codex quota use; Pi/operator default is minimax/MiniMax-M2.7; Claude delegates handle specialist roles where configured. Needs runtime checks, test execution, optional Playwright MCP tools.",
<home>/running-pi/config/profiles/minimax-claude.json:87:      "provider": "claude",
<home>/running-pi/config/profiles/minimax-claude.json:102:      "notes": "minimax-claude profile: Claude Sonnet handles this specialist role to avoid Codex quota use; Pi/operator default is minimax/MiniMax-M2.7; Claude delegates handle specialist roles where configured. Security scans depend on bash/grep across repository. Secondary DeepSeek/MiniMax lanes are orchestrator-owned and advisory-with-merge-summary during rollout.",
<home>/running-pi/config/profiles/minimax-claude.json:114:      "provider": "claude",
<home>/running-pi/config/profiles/minimax-claude.json:117:      "notes": "minimax-claude profile: Claude Sonnet handles this specialist role to avoid Codex quota use; Pi/operator default is minimax/MiniMax-M2.7; Claude delegates handle specialist roles where configured. Release/devops stage requires git + file operations; keep on tool-capable Pi route.",
<home>/running-pi/config/profiles/minimax-claude.json:129:      "provider": "claude",
<home>/running-pi/config/profiles/minimax-claude.json:132:      "notes": "minimax-claude profile: Claude Sonnet handles this specialist role to avoid Codex quota use; Pi/operator default is minimax/MiniMax-M2.7; Claude delegates handle specialist roles where configured. Pipeline governance updates can touch rules/skills/docs.",
<home>/running-pi/config/profiles/minimax-claude.json:144:      "provider": "claude",
<home>/running-pi/config/profiles/minimax-claude.json:159:      "notes": "minimax-claude profile: Claude Sonnet handles this specialist role to avoid Codex quota use; Pi/operator default is minimax/MiniMax-M2.7; Claude delegates handle specialist roles where configured. Diff/document synthesis through Pi runner. Uses gpt-5.5 via Pi so logs, tools, metadata, retries, and ROUTING checks match the rest of the pipeline. Secondary DeepSeek/MiniMax lanes are orchestrator-owned and advisory-with-merge-summary during rollout.",
<home>/running-pi/config/profiles/minimax-claude.json:171:      "provider": "claude",
<home>/running-pi/config/profiles/minimax-claude.json:186:      "notes": "minimax-claude profile: Claude Sonnet handles this specialist role to avoid Codex quota use; Pi/operator default is minimax/MiniMax-M2.7; Claude delegates handle specialist roles where configured. Plan critique and scope checking through Pi runner. Uses gpt-5.5 via Pi for consistent execution and observability. Secondary DeepSeek/MiniMax lanes are orchestrator-owned and advisory-with-merge-summary during rollout.",
<home>/running-pi/config/profiles/minimax-claude.json:198:      "provider": "claude",
<home>/running-pi/config/profiles/minimax-claude.json:202:      "notes": "minimax-claude profile: Claude Sonnet handles this specialist role to avoid Codex quota use; Pi/operator default is minimax/MiniMax-M2.7; Claude delegates handle specialist roles where configured. Design agent runs through Pi runner so design docs can be inspected/written with the same tool loop and metadata as other agents.",
<home>/running-pi/config/profiles/minimax-claude.json:214:      "provider": "claude",
<home>/running-pi/config/profiles/minimax-claude.json:217:      "notes": "minimax-claude profile: Claude Sonnet handles this specialist role to avoid Codex quota use; Pi/operator default is minimax/MiniMax-M2.7; Claude delegates handle specialist roles where configured. Roadmap/doc synthesis runs through Pi runner for consistent tool loop, artifacts, metrics, and ROUTING validation.",
<home>/running-pi/config/profiles/minimax-claude.json:229:      "provider": "claude",
<home>/running-pi/config/profiles/minimax-claude.json:232:      "notes": "minimax-claude profile: Claude Sonnet handles this specialist role to avoid Codex quota use; Pi/operator default is minimax/MiniMax-M2.7; Claude delegates handle specialist roles where configured. UAT runs on Pi/Codex path for consistent ROUTING and artifact behavior.",
<home>/running-pi/config/profiles/minimax-claude.json:244:      "provider": "claude",
<home>/running-pi/config/profiles/minimax-claude.json:247:      "notes": "minimax-claude profile: Claude Sonnet handles this specialist role to avoid Codex quota use; Pi/operator default is minimax/MiniMax-M2.7; Claude delegates handle specialist roles where configured. Retrospective runs on Pi/Codex path for consistent ROUTING and artifact behavior.",
<home>/running-pi/scripts/profile/use.sh:6:  echo "Usage: $0 <codex-heavy|codex-light|codex-ultralight|deepseek-claude|minimax-claude>"
<home>/running-pi/scripts/lead/stop.sh:2:# Stop the active flow lead: kill any running claude process, clear sentinel,
<home>/running-pi/scripts/lead/start.sh:3:# Spawns claude --print --session-id <new-uuid> as a detached background process.
<home>/running-pi/scripts/lead/start.sh:12:#   - Writes state/lead-<uuid>.pid with the claude process pid
<home>/running-pi/scripts/lead/start.sh:14:#     (resume.sh needs this to spawn claude --resume in the same project context;
<home>/running-pi/scripts/lead/start.sh:15:#     claude --resume looks up the session under ~/.claude/projects/<hash>/<uuid>.jsonl
<home>/running-pi/scripts/lead/start.sh:18:# Exit codes: 0 ok, 2 missing args, 6 claude cli not found,
<home>/running-pi/scripts/lead/start.sh:44:command -v claude >/dev/null || die 6 "claude cli not found in PATH"
<home>/running-pi/scripts/lead/resume.sh:3:# Spawns claude --resume <id> --print "<reply>" as a detached process,
<home>/running-pi/scripts/lead/resume.sh:10:#   - Updates state/lead-<uuid>.pid with the new claude pid
<home>/running-pi/scripts/lead/resume.sh:12:#   claude --resume looks up the session under
<home>/running-pi/scripts/lead/resume.sh:13:#   ~/.claude/projects/<project-hash>/<uuid>.jsonl, where <project-hash>
<home>/running-pi/scripts/lead/resume.sh:20:#             6 claude cli not found / busy.
<home>/running-pi/scripts/lead/resume.sh:63:# Serialization: refuse to start a new resume if the previous claude process for
<home>/running-pi/scripts/lead/resume.sh:74:command -v claude >/dev/null || die 6 "claude cli not found in PATH"
<home>/running-pi/scripts/lead/keepalive.sh:4:# Problem: `claude --print` exits after each model turn. When the lead
<home>/running-pi/scripts/lead/keepalive.sh:8:# Solution: This script loops around the claude process. After each exit
<home>/running-pi/scripts/lead/keepalive.sh:16:# The script runs under nohup in start.sh. It writes the current claude
<home>/running-pi/scripts/lead/keepalive.sh:42:# Build base claude args (without --resume or prompt, those vary per iteration).
<home>/running-pi/scripts/lead/keepalive.sh:52:    cmd+=(claude)
<home>/running-pi/scripts/lead/keepalive.sh:70:run_claude() {
<home>/running-pi/scripts/lead/keepalive.sh:168:run_claude "initial" "$INITIAL_PROMPT"
<home>/running-pi/scripts/lead/keepalive.sh:176:        # when the user answers via Telegram. After resume.sh runs, the claude
<home>/running-pi/scripts/lead/keepalive.sh:178:        # does NOT go through keepalive — it spawns claude directly.
<home>/running-pi/scripts/lead/keepalive.sh:223:                run_claude "resume" "CRITICAL: You wrote a gate message as text output but did NOT call send-gate.sh. In --print mode, text output is buffered — the user NEVER saw your gate message. You MUST call: bash <pidex-root>/scripts/telegram/send-gate.sh --gate <ID> --plan <N> --slug <slug> --options '<options>' --context '<message>' --lead-id \"\$LEAD_ID\". Do this NOW for the pending gate, then end your turn. See Rule 6 in running-pi-instructions.md."
<home>/running-pi/scripts/lead/keepalive.sh:235:    run_claude "resume" "$CONTINUE_PROMPT"
<home>/running-pi/scripts/token-log/log-session.sh:25:CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
<home>/running-pi/scripts/lead/keepalive-resume.sh:28:run_claude_resume() {
<home>/running-pi/scripts/lead/keepalive-resume.sh:38:    cmd+=(claude --strict-mcp-config --mcp-config "$SCRIPTS_DIR/../config/empty-mcp.json" --resume "$LEAD_ID" --permission-mode "$PERM_MODE" --print -- "$prompt")
<home>/running-pi/scripts/lead/keepalive-resume.sh:74:run_claude_resume "$INITIAL_REPLY"
<home>/running-pi/scripts/lead/keepalive-resume.sh:112:    run_claude_resume "$CONTINUE_PROMPT"
<home>/running-pi/scripts/smoke-test.sh:26:echo "==> Delegate wrappers/checks with fake claude"
<home>/running-pi/scripts/smoke-test.sh:29:cat > "$TMP/claude-fake" <<'SH'
<home>/running-pi/scripts/smoke-test.sh:35:chmod +x "$TMP/claude-fake"
<home>/running-pi/scripts/smoke-test.sh:37:CLAUDE_BIN="$TMP/claude-fake" \
<home>/running-pi/scripts/smoke-test.sh:41:bash "$ROOT/scripts/delegate/claude.sh"
<home>/running-pi/scripts/smoke-test.sh:43:CLAUDE_BIN="$TMP/claude-fake" bash "$ROOT/scripts/delegate/check-auth.sh" --provider claude
<home>/running-pi/scripts/smoke-test.sh:49:CLAUDE_BIN="$TMP/claude-fake" \
<home>/running-pi/scripts/history/append.sh:6:#   - independent of the active Claude workspace (~/.claude)
<home>/running-pi/scripts/provider-limits/probe.py:95:    path = Path(os.environ.get("CLAUDE_CREDENTIALS_FILE", str(Path.home() / ".claude" / ".credentials.json")))
<home>/running-pi/scripts/provider-limits/probe.py:97:    return (data.get("claudeAiOauth") or {}).get("accessToken") or data.get("accessToken")
<home>/running-pi/scripts/provider-limits/probe.py:324:            "plan": "claude-oauth",
<home>/running-pi/scripts/provider-limits/probe.py:409:            "profile": "deepseek-claude",
<home>/running-pi/scripts/provider-limits/probe.py:413:    # paths; switch to deepseek-claude before near-empty window causes hard failures.
<home>/running-pi/scripts/provider-limits/probe.py:416:            "profile": "deepseek-claude",
<home>/running-pi/scripts/provider-limits/probe.py:417:            "reason": f"{ 'Spark' if codex_provider == 'codex-spark' else 'Codex' } seven-day quota is {used}% used; switch to deepseek-claude for headroom (ultralight still reserves Codex as fallback).",
<home>/running-pi/scripts/_lib.sh:76:#   6 claude cli not found / failed to spawn
<home>/running-pi/scripts/delegate/check-auth.sh:14:      echo "Usage: $0 [--config config/agents.json] [--provider claude|codex|gemini]..."
<home>/running-pi/scripts/delegate/check-auth.sh:48:check_claude() {
<home>/running-pi/scripts/delegate/check-auth.sh:49:  local bin="${CLAUDE_BIN:-claude}"
<home>/running-pi/scripts/delegate/check-auth.sh:51:    echo "FAIL claude: CLI not found: $bin" >&2
<home>/running-pi/scripts/delegate/check-auth.sh:55:    echo "FAIL claude: not authenticated (run 'claude auth login --claudeai')" >&2
<home>/running-pi/scripts/delegate/check-auth.sh:65:    echo "OK claude: CLI authenticated and inference smoke passed"
<home>/running-pi/scripts/delegate/check-auth.sh:68:  echo "FAIL claude: auth status exists but inference failed (subscription token may be expired; run 'claude auth logout' then 'claude auth login --claudeai')" >&2
<home>/running-pi/scripts/delegate/check-auth.sh:133:    claude) check_claude || STATUS=1 ;;
<home>/running-pi/scripts/delegate/dispatch.sh:5:# delegate (claude/codex/gemini).
<home>/running-pi/scripts/delegate/dispatch.sh:25:#   20 delegate script failed (claude/codex/gemini exit non-zero or empty output)
<home>/running-pi/scripts/delegate/dispatch.sh:176:  claude) DELEGATE_SCRIPT="$SCRIPTS_DIR/claude.sh" ;;
<home>/running-pi/scripts/delegate/claude.sh:10:#   PROMPT_FILE — path to fully-assembled prompt (stdin-redirected into claude)
<home>/running-pi/scripts/delegate/claude.sh:14:#   CLAUDE_BIN  — optional Claude binary path/name (default: claude)
<home>/running-pi/scripts/delegate/claude.sh:23:#   1  claude CLI missing or not authenticated
<home>/running-pi/scripts/delegate/claude.sh:24:#   2  claude exec failed
<home>/running-pi/scripts/delegate/claude.sh:29:#     bash <pidex-root>/scripts/delegate/claude.sh
<home>/running-pi/scripts/delegate/claude.sh:37:CLAUDE_BIN="${CLAUDE_BIN:-claude}"
<home>/running-pi/scripts/delegate/claude.sh:68:  echo "ERROR: Claude Code is not authenticated — run 'claude auth login --claudeai' for subscription auth" >&2
<home>/running-pi/scripts/delegate/claude.sh:72:  AUTH_SMOKE_OUT=$(mktemp "/tmp/rp-claude-auth-smoke-XXXXXX.out")
<home>/running-pi/scripts/delegate/claude.sh:73:  AUTH_SMOKE_ERR=$(mktemp "/tmp/rp-claude-auth-smoke-XXXXXX.err")
<home>/running-pi/scripts/delegate/claude.sh:77:    echo "ERROR: Claude Code auth status is present but inference failed. For Claude subscription auth, run: claude auth logout && claude auth login --claudeai" >&2
<home>/running-pi/scripts/delegate/claude.sh:93:AUGMENTED_PROMPT=$(mktemp "/tmp/rp-claude-prompt-XXXXXX.md")
<home>/running-pi/scripts/delegate/claude.sh:94:RAW_RESULT=$(mktemp "/tmp/rp-claude-raw-XXXXXX.md")
<home>/running-pi/scripts/delegate/claude.sh:132:  echo "ERROR: claude exec failed with exit $CLAUDE_EXIT" >&2
<home>/running-pi/scripts/delegate/claude.sh:137:  echo "ERROR: claude produced empty output" >&2
<home>/running-pi/scripts/delegate/claude.sh:161:  echo "ERROR: claude output stripped to empty" >&2
<home>/running-pi/scripts/metrics/record.sh:72:aliases = {'opus': 'claude-opus', 'sonnet': 'claude-sonnet', 'haiku': 'claude-haiku'}
<home>/running-pi/scripts/evals/check-pipeline-analysis.sh:15:require_text "scripts/analysis/run-pipeline-analysis.sh" "delegate/claude.sh"
<home>/running-pi/scripts/analysis/run-pipeline-analysis.sh:249:  bash "$SCRIPTS_DIR/delegate/claude.sh"
<home>/running-pi/extensions/running-pi/index.ts:143:	// User-question tools from running-claude do not exist in Pi direct mode.
<home>/running-pi/extensions/running-pi/index.ts:223:	return provider === "claude";
<home>/running-pi/extensions/running-pi/index.ts:522:		opus: "claude-opus",
<home>/running-pi/extensions/running-pi/index.ts:523:		sonnet: "claude-sonnet",
<home>/running-pi/extensions/running-pi/index.ts:524:		haiku: "claude-haiku",
<home>/running-pi/extensions/running-pi/index.ts:536:		|| normalized.startsWith("claude")
<home>/running-pi/extensions/running-pi/index.ts:537:		|| normalized.includes("/claude")
<home>/running-pi/extensions/running-pi/index.ts:1246:	if (!["claude", "codex", "gemini"].includes(provider)) {
<home>/running-pi/extensions/running-pi/index.ts:1441:	provider: Type.Optional(Type.String({ description: "Optional provider override: pi, claude, codex, or gemini. Defaults to config/agents.json." })),
<home>/running-pi/extensions/running-pi/index.ts:1442:	model: Type.Optional(Type.String({ description: "Optional model override. For claude, MODEL may also be model:effort, e.g. sonnet:high." })),
<home>/running-pi/running-pi-instructions.md:3:File shipped by [running-pi](https://github.com/) and installed at `~/.claude/running-pi-instructions.md`. Reference from `~/.claude/CLAUDE.md` via:
<home>/running-pi/running-pi-instructions.md:15:14-agent software-delivery pipeline ported from `vs-code-agents` to Pi subprocess subagent format. Each agent = self-contained Markdown file under `<project>/.claude/agents/rp-*.md`, auto-discovered by Claude Code. Communicate via structured Markdown docs in `agents.output/<category>/`.
<home>/running-pi/running-pi-instructions.md:183:- **Background mode:** Headless `claude --print` process run pipeline. Gates via Telegram custom keyboards. Orchestrator monitor and relay. Scripts in `<pidex-root>/scripts/` manage lifecycle.
<home>/running-pi/running-pi-instructions.md:462:`recv-gate.sh` make single `getUpdates` call (or loop every 5s if `--wait N` set), return newest `rp!*` message from configured chat, persist update-id offset in `state/tg-offset`. Relay validate suffix against `pending-gate.json`, call `lead/resume.sh` to forward answer to lead via `claude --resume`, send Telegram acknowledgement, delete pending marker.
<home>/running-pi/running-pi-instructions.md:467:- **CRITICAL — After calling `send-gate.sh`, END YOUR TURN IMMEDIATELY.** Do not Bash-wait, do not `sleep`, do not call `recv-gate.sh` or any polling command to "wait for the reply". In `--print` mode, process meant to exit so orchestrator can resume via `claude --resume`. Block in Bash tool call = freeze pipeline: `lead/resume.sh` refuse to run while PID alive, user reply rejected with "lead busy", pipeline deadlock.
<home>/running-pi/running-pi-instructions.md:485:Spawns detached `claude --print --session-id <new-uuid>` process. Lead run full pipeline headless, end after each gate (or final completion), resumed by orchestrator via `claude --resume` when gate replies come in.
<home>/running-pi/running-pi-instructions.md:501:- Running lead in interactive mode (without `--print`) — block spawning shell, can't resume cleanly via `claude --resume`.
<home>/running-pi/running-pi-instructions.md:703:Running-claude skill at `~/.claude/skills/running-pi/SKILL.md` describe orchestrator-side commands in detail. Briefly:
<home>/running-pi/running-pi-instructions.md:710:Agents live under `<project>/.claude/agents/rp-*.md`, copied there by `<pidex-root>/install.sh`. If missing, re-run install.sh with same target project.
<home>/running-pi/package.json:4:  "description": "Pi package for the rp-* software-delivery agent pipeline, ported from running-claude.",
<home>/running-pi/README.md:78:- `claude` — `scripts/delegate/claude.sh`.
<home>/running-pi/README.md:237:Background mode from the older running-claude setup has been scaffolded but is not the supported path yet. It still needs a Pi-specific lifecycle design around `pi -p`, session resume behavior, and Telegram relay semantics.
<home>/running-pi/rules/rp-planner/cli-spawn-path-invariant.md:42:Plan 36 (chat-llm-wiring, 2026-04-25): G9-R2a — invoking claude binary in a TanStack Start
<home>/running-pi/rules/rp-planner/cli-spawn-path-invariant.md:43:server route failed with ENOENT. The claude binary lives in ~/.local/bin, which was stripped
<home>/running-pi/templates/lead-prompt.md:7:MANDATORY READING: ~/.claude/running-pi-instructions.md (Rules 1-7).
<home>/running-pi/templates/lead-prompt.md:60:user's reply via Telegram and resume you via `claude --resume`. Polling Telegram from the
<home>/running-pi/templates/lead-prompt.md:73:- Running the lead in interactive mode (without `--print`) — blocks the spawning shell, can't be resumed cleanly via `claude --resume`.
<home>/running-pi/rules/rp-devops/running-pi-install-propagation.md:17:- Any other file that `install.sh` copies to project `.claude/agents/` or `~/.claude/running-pi-instructions.md`
<home>/running-pi/rules/rp-devops/running-pi-install-propagation.md:52:`<pidex-root>/` is the canonical source for pipeline agent instructions, scripts, and rules. Project-level `.claude/agents/rp-*.md` files and `~/.claude/running-pi-instructions.md` are installed copies. Changes to source files have no effect until `install.sh` propagates them.
<home>/running-pi/agents/rp-pi.md:97:1. Read current agent instructions for affected agents (`agents/rp-*.md` in running-pi; legacy `.claude/agents/rp-*.md` only if project still uses that path)
<home>/running-pi/agents/README.md:3:These Markdown files are the Running Pi specialist prompts, ported from the `running-claude` `rc-*` agents and renamed to the `rp-*` namespace.
<home>/running-pi/TODO.md:34:  - Groups by provider (claude / codex / gemini)
<home>/running-pi/TODO.md:36:  - Footer: total cost + delegate savings vs all-claude baseline
<home>/running-pi/TODO.md:47:  - Call `record.sh --source orchestrator-claude --input-tokens (0.8*total) --output-tokens (0.2*total)` (Opus typical split)
<home>/running-pi/TODO.md:53:    "claude-opus-4-7":    {"input": 15.00, "output": 75.00},
<home>/running-pi/TODO.md:54:    "claude-sonnet-4-6":  {"input": 3.00,  "output": 15.00},
<home>/running-pi/TODO.md:55:    "claude-haiku-4-5":   {"input": 1.00,  "output": 5.00},
<home>/running-pi/TODO.md:65:  - Invocation pattern for claude-subagent post-spawn recording
<home>/running-pi/TODO.md:121:  - Fallback-to-claude trigger on schema mismatch (not just ROUTING absence)
<home>/running-pi/TODO.md:143:  - Runs at pipeline start if any agent routed to non-claude provider
<home>/running-pi/TODO.md:175:- Resume state memory: `~/claude-two/.claude/projects/-home-daniel/memory/project_tanstack_migration_state.md`
<home>/running-pi/agents.output/qa/token-efficiency-optimization-plan-qa.md:53:- Integration smoke (temp config/template + stub claude delegate through `dispatch.sh`) -> PASS.
<home>/running-pi/agents.output/implementation/token-efficiency-optimization-plan.md:41:| `scripts/delegate/claude.sh` | concise delegate prefix | -4/+5 |
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:12:- `<home>/running-claude` (repo artifacts only; no separate run-state metrics found)
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:42:9. rp-devops|claude|sonnet — 7,094 tok
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:43:10. rp-roadmap|claude|sonnet — 6,707 tok
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:54:- Fallback chain frequency: pi→claude (4), pi→codex (1), codex→claude (1), codex→pi (1)
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:63:  - claude: 12 runs, 12 success, 0 fail
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:65:- Pattern: pi/codex used as first try in many steps; failures commonly hand off to claude; claude closes reliably but with full-context resend.
<home>/running-pi/agents.output/code-review/token-efficiency-optimization-plan-code-review.md:18:- Code: `scripts/delegate/dispatch.sh`, `scripts/delegate/claude.sh`, `scripts/delegate/gemini.sh`, `scripts/delegate/prompt_compact.py`, `tests/test_prompt_compact.py`

### rg pattern: gemini
count: 49
<home>/running-pi/config/pricing.json:9:  "gemini-2.5-flash": { "input": 0.3, "output": 2.5 },
<home>/running-pi/config/pricing.json:10:  "gemini-2.5-pro": { "input": 1.25, "output": 5.0 }
<home>/running-pi/scripts/delegate/check-auth.sh:14:      echo "Usage: $0 [--config config/agents.json] [--provider claude|codex|gemini]..."
<home>/running-pi/scripts/delegate/check-auth.sh:105:check_gemini() {
<home>/running-pi/scripts/delegate/check-auth.sh:106:  if ! command -v gemini >/dev/null 2>&1; then
<home>/running-pi/scripts/delegate/check-auth.sh:107:    echo "FAIL gemini: CLI not found" >&2
<home>/running-pi/scripts/delegate/check-auth.sh:110:  local auth_file="$HOME/.gemini/oauth_creds.json"
<home>/running-pi/scripts/delegate/check-auth.sh:112:    echo "FAIL gemini: OAuth not configured — no $auth_file" >&2
<home>/running-pi/scripts/delegate/check-auth.sh:124:    echo "OK gemini: OAuth file is parseable"
<home>/running-pi/scripts/delegate/check-auth.sh:127:  echo "FAIL gemini: $auth_file is not parseable JSON" >&2
<home>/running-pi/scripts/delegate/check-auth.sh:135:    gemini) check_gemini || STATUS=1 ;;
<home>/running-pi/scripts/delegate/dispatch.sh:5:# delegate (claude/codex/gemini).
<home>/running-pi/scripts/delegate/dispatch.sh:25:#   20 delegate script failed (claude/codex/gemini exit non-zero or empty output)
<home>/running-pi/scripts/delegate/dispatch.sh:178:  gemini) DELEGATE_SCRIPT="$SCRIPTS_DIR/gemini.sh" ;;
<home>/running-pi/scripts/delegate/claude.sh:5:# This is the Claude equivalent of codex.sh and gemini.sh: it runs a
<home>/running-pi/scripts/delegate/gemini.sh:4:# Simplified adaption of forge.ng's gemini.sh for the rp-* pipeline.
<home>/running-pi/scripts/delegate/gemini.sh:8:#   PROMPT_FILE — path to fully-assembled prompt (stdin-redirected into gemini)
<home>/running-pi/scripts/delegate/gemini.sh:9:#   OUTPUT_FILE — path where gemini result is written (stdout captured)
<home>/running-pi/scripts/delegate/gemini.sh:10:#   MODEL       — gemini model flag (optional, e.g. "--model gemini-2.5-pro")
<home>/running-pi/scripts/delegate/gemini.sh:14:#   1  auth error (no ~/.gemini/oauth_creds.json)
<home>/running-pi/scripts/delegate/gemini.sh:15:#   2  gemini exec failed
<home>/running-pi/scripts/delegate/gemini.sh:28:if ! command -v gemini >/dev/null 2>&1; then
<home>/running-pi/scripts/delegate/gemini.sh:29:  echo "ERROR: Gemini CLI not found: gemini" >&2
<home>/running-pi/scripts/delegate/gemini.sh:34:if [ ! -f "$HOME/.gemini/oauth_creds.json" ]; then
<home>/running-pi/scripts/delegate/gemini.sh:35:  echo "ERROR: Gemini OAuth not configured — no ~/.gemini/oauth_creds.json" >&2
<home>/running-pi/scripts/delegate/gemini.sh:39:# Prepend gemini-specific prefix to force structured output.
<home>/running-pi/scripts/delegate/gemini.sh:48:AUGMENTED_PROMPT=$(mktemp "/tmp/rp-gemini-prompt-XXXXXX.md")
<home>/running-pi/scripts/delegate/gemini.sh:52:# Run gemini in headless mode via stdin (avoids ARG_MAX on large prompts).
<home>/running-pi/scripts/delegate/gemini.sh:54:RAW_RESULT=$(mktemp "/tmp/rp-gemini-raw-XXXXXX.md")
<home>/running-pi/scripts/delegate/gemini.sh:59:gemini ${MODEL_FLAG} --yolo -p "" < "$AUGMENTED_PROMPT" > "$RAW_RESULT" 2>/dev/null || GEMINI_EXIT=$?
<home>/running-pi/scripts/delegate/gemini.sh:62:  echo "ERROR: gemini exec failed with exit $GEMINI_EXIT" >&2
<home>/running-pi/scripts/delegate/gemini.sh:67:  echo "ERROR: gemini produced empty output" >&2
<home>/running-pi/scripts/delegate/gemini.sh:101:  echo "ERROR: gemini output stripped to empty" >&2
<home>/running-pi/extensions/running-pi/index.ts:1246:	if (!["claude", "codex", "gemini"].includes(provider)) {
<home>/running-pi/extensions/running-pi/index.ts:1441:	provider: Type.Optional(Type.String({ description: "Optional provider override: pi, claude, codex, or gemini. Defaults to config/agents.json." })),
<home>/running-pi/README.md:80:- `gemini` — `scripts/delegate/gemini.sh`.
<home>/running-pi/TODO.md:17:- CLI-delegates (rp-code-reviewer → codex, rp-uat → gemini) — Phase 1 infrastructure, source `1c1ab85`
<home>/running-pi/TODO.md:34:  - Groups by provider (claude / codex / gemini)
<home>/running-pi/TODO.md:59:    "gemini-2.5-pro":     {"input": 1.25,  "output": 5.00}
<home>/running-pi/TODO.md:88:After Plan 26 validates Phase 1 (codex + gemini for code-reviewer + uat), extend delegation config:
<home>/running-pi/TODO.md:90:- [ ] **rp-retrospective → gemini** — doc-to-doc synthesis, low risk (~15 tool_uses savings/plan)
<home>/running-pi/TODO.md:91:- [ ] **rp-pi → gemini** — proposal generation from retro (~12 tool_uses savings/plan)
<home>/running-pi/TODO.md:93:- [ ] **rp-critic → gemini** — plan stress-test (~8 savings/plan)
<home>/running-pi/TODO.md:122:  - Would catch cases where codex/gemini hallucinate extra sections or miss required ones
<home>/running-pi/TODO.md:142:  - `~/.gemini/oauth_creds.json` exists + parseable
<home>/running-pi/agents.output/implementation/token-efficiency-optimization-plan.md:42:| `scripts/delegate/gemini.sh` | concise delegate prefix | -4/+5 |
<home>/running-pi/agents.output/analysis/token-efficiency-baseline.md:64:  - gemini: 2 runs, 2 success, 0 fail
<home>/running-pi/agents.output/code-review/token-efficiency-optimization-plan-code-review.md:18:- Code: `scripts/delegate/dispatch.sh`, `scripts/delegate/claude.sh`, `scripts/delegate/gemini.sh`, `scripts/delegate/prompt_compact.py`, `tests/test_prompt_compact.py`
<home>/running-pi/templates/lead-prompt.md:43:  If PROVIDER=codex or PROVIDER=gemini:

### rg pattern: openrouter
count: 45
<home>/running-pi/config/profiles/openrouter-heavy.json:7:    "model": "openrouter/openrouter/owl-alpha",
<home>/running-pi/config/profiles/openrouter-heavy.json:13:      "model": "openrouter/z-ai/glm-5",
<home>/running-pi/config/profiles/openrouter-heavy.json:15:      "notes": "openrouter-heavy profile: GLM 5 handles planning — best reasoning model via OpenRouter.",
<home>/running-pi/config/profiles/openrouter-heavy.json:28:      "model": "openrouter/z-ai/glm-5",
<home>/running-pi/config/profiles/openrouter-heavy.json:30:      "notes": "openrouter-heavy profile: GLM 5 for architecture decisions.",
<home>/running-pi/config/profiles/openrouter-heavy.json:43:      "model": "openrouter/z-ai/glm-5",
<home>/running-pi/config/profiles/openrouter-heavy.json:45:      "notes": "openrouter-heavy profile: GLM 5 for coding — strong at agentic coding workflows.",
<home>/running-pi/config/profiles/openrouter-heavy.json:58:      "model": "openrouter/z-ai/glm-5",
<home>/running-pi/config/profiles/openrouter-heavy.json:63:          "model": "openrouter/xiaomi/mimo-v2-flash",
<home>/running-pi/config/profiles/openrouter-heavy.json:67:      "notes": "openrouter-heavy profile: GLM 5 leads review, MiMo V2 Flash as secondary.",
<home>/running-pi/config/profiles/openrouter-heavy.json:80:      "model": "openrouter/z-ai/glm-5",
<home>/running-pi/config/profiles/openrouter-heavy.json:85:          "model": "openrouter/xiaomi/mimo-v2-flash",
<home>/running-pi/config/profiles/openrouter-heavy.json:89:      "notes": "openrouter-heavy profile: GLM 5 leads critique, MiMo V2 Flash as secondary.",
<home>/running-pi/config/profiles/openrouter-heavy.json:102:      "model": "openrouter/z-ai/glm-5",
<home>/running-pi/config/profiles/openrouter-heavy.json:107:          "model": "openrouter/xiaomi/mimo-v2-flash",
<home>/running-pi/config/profiles/openrouter-heavy.json:111:      "notes": "openrouter-heavy profile: GLM 5 leads security review, MiMo V2 Flash as secondary.",
<home>/running-pi/config/profiles/openrouter-heavy.json:124:      "model": "openrouter/xiaomi/mimo-v2-flash",
<home>/running-pi/config/profiles/openrouter-heavy.json:126:      "notes": "openrouter-heavy profile: MiMo V2 Flash for QA — cheap, good enough for test execution.",
<home>/running-pi/config/profiles/openrouter-heavy.json:139:      "model": "openrouter/xiaomi/mimo-v2-flash",
<home>/running-pi/config/profiles/openrouter-heavy.json:141:      "notes": "openrouter-heavy profile: MiMo V2 Flash for analysis — fast and cheap for grep/bash work.",
<home>/running-pi/config/profiles/openrouter-heavy.json:154:      "model": "openrouter/xiaomi/mimo-v2-flash",
<home>/running-pi/config/profiles/openrouter-heavy.json:156:      "notes": "openrouter-heavy profile: MiMo V2 Flash for devops — non-critical automation.",
<home>/running-pi/config/profiles/openrouter-heavy.json:169:      "model": "openrouter/xiaomi/mimo-v2-flash",
<home>/running-pi/config/profiles/openrouter-heavy.json:172:      "notes": "openrouter-heavy profile: MiMo V2 Flash for design work.",
<home>/running-pi/config/profiles/openrouter-heavy.json:185:      "model": "openrouter/xiaomi/mimo-v2-flash",
<home>/running-pi/config/profiles/openrouter-heavy.json:187:      "notes": "openrouter-heavy profile: MiMo V2 Flash for roadmap/doc synthesis.",
<home>/running-pi/config/profiles/openrouter-heavy.json:200:      "model": "openrouter/xiaomi/mimo-v2-flash",
<home>/running-pi/config/profiles/openrouter-heavy.json:202:      "notes": "openrouter-heavy profile: MiMo V2 Flash for UAT.",
<home>/running-pi/config/profiles/openrouter-heavy.json:215:      "model": "openrouter/xiaomi/mimo-v2-flash",
<home>/running-pi/config/profiles/openrouter-heavy.json:217:      "notes": "openrouter-heavy profile: MiMo V2 Flash for retrospectives.",
<home>/running-pi/config/profiles/openrouter-heavy.json:230:      "model": "openrouter/xiaomi/mimo-v2-flash",
<home>/running-pi/config/profiles/openrouter-heavy.json:232:      "notes": "openrouter-heavy profile: MiMo V2 Flash for pipeline governance.",
<home>/running-pi/scripts/provider-limits/probe.py:253:def openrouter_token() -> str | None:
<home>/running-pi/scripts/provider-limits/probe.py:257:    entry = data.get("openrouter") or {}
<home>/running-pi/scripts/provider-limits/probe.py:263:def probe_openrouter() -> list[dict]:
<home>/running-pi/scripts/provider-limits/probe.py:264:    tok = openrouter_token()
<home>/running-pi/scripts/provider-limits/probe.py:266:        return [{"provider": "openrouter", "window": "auth", "error": "missing OpenRouter API key"}]
<home>/running-pi/scripts/provider-limits/probe.py:268:        data = post_json("https://openrouter.ai/api/v1/key", tok)
<home>/running-pi/scripts/provider-limits/probe.py:270:        return [{"provider": "openrouter", "window": "probe", "error": str(exc)}]
<home>/running-pi/scripts/provider-limits/probe.py:282:            "provider": "openrouter",
<home>/running-pi/scripts/provider-limits/probe.py:296:            "provider": "openrouter",
<home>/running-pi/scripts/provider-limits/probe.py:305:        out.append({"provider": "openrouter", "window": "data", "error": "empty response", "raw": str(data)[:500]})
<home>/running-pi/scripts/provider-limits/probe.py:471:    for fn in (probe_codex, probe_anthropic, probe_openrouter):
<home>/running-pi/dashboard/scripts/server.py:732:                _norm_model = lambda m: re.sub(r'^(?:openai-codex|openrouter)/', '', m) if m else m
<home>/running-pi/dashboard/public/index.html:106:function Limits({data,onRefresh}){const [switching,setSwitching]=useState(null);const records=data.limits?.records||[];const doSwitch=async(profile)=>{setSwitching(profile);try{await post('/api/provider-limits/profile',{profile});await onRefresh(true)}finally{setSwitching(null)}};return <div className="grid"><Metric label="Active profile" value={data.limits?.active_profile||'custom'} wide/><Metric label="Recommended" value={data.limits?.recommended_profile||'n/a'} wide/><Panel className="card full"><div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><div><div className="label">Provider Limits</div><h2>Codex + Spark + Anthropic + OpenRouter quota &amp; spend</h2><div className="chart-note">Recommendation: <b>{data.limits?.recommended_profile||'n/a'}</b>{data.limits?.recommended_profile_reason?` — ${data.limits.recommended_profile_reason}`:''}</div></div><div className="submenu">{(data.limits?.profiles||[]).map(p=><motion.button key={p} className={`action ${p===data.limits?.active_profile?'active':''}`} whileHover={{scale:1.03}} whileTap={{scale:.97}} onClick={()=>doSwitch(p)} disabled={!!switching}>{switching===p?'Switching…':p}</motion.button>)}<button className="action" onClick={()=>onRefresh(true)}>Refresh</button></div></div><div className="rows">{records.map(r=><motion.div layout key={`${r.provider}-${r.window}`} className="row" initial={{opacity:0,x:-10}} animate={{opacity:1,x:0}}><div><b>{r.provider}</b><br/><span className="muted">{r.limit_name||r.window}</span></div><div><div className="bar"><motion.div initial={{width:0}} animate={{width:`${Math.min(100,r.used_percent||0)}%`}} transition={{type:'spring',stiffness:90,damping:18}}/></div><div className="muted mini">{r.provider==='openrouter'?`$${Number(r.usage||0).toFixed(2)} spent`:`reset in ${duration(r.reset_after_seconds)} · projected ${r.projected_exhaustion_at||'n/a'}`}</div></div><span className="badge"><span className={`dot ${(r.limit_reached||r.status==='danger')?'bad':(r.used_percent>=80?'warn':(r.provider==='openrouter'?'good':''))}`}></span>{r.used_percent!=null?`${r.used_percent}%`:`$${Number(r.usage||0).toFixed(2)}`} · {r.plan||r.status||'unknown'}</span></motion.div>)}</div></Panel><Panel className="card full"><DataTable rows={records} cols={[{k:'provider',l:'Provider'},{k:'window',l:'Window'},{k:'limit_name',l:'Limit'},{k:'plan',l:'Plan'},{k:'usage',l:'Spend ($)',f:v=>v==null?'—':Number(v).toFixed(2)},{k:'used_percent',l:'Used %'},{k:'status',l:'Status'},{k:'resets_at',l:'Resets at'},{k:'reset_after_seconds',l:'Reset in',f:duration},{k:'burn_percent_per_hour',l:'Burn %/h'},{k:'projected_exhaustion_at',l:'Projected 100%'},{k:'projected_before_reset',l:'Before reset?'},{k:'error',l:'Error'}]}/></Panel></div>}
\n## stateful path inventory (maxdepth 2 .git dirs)
<home>/running-pi/.git

## rp/provider scans in source
matches: 0

## Baseline notes

- This report is generated for migration planning.
- Historically noisy matches are expected in policy/docs/examples where explicit legacy behavior is documented.
- Idempotent migration copy should skip/rewrite known legacy namespaces in pidex target runtime files only.

## consciously ignored legacy paths (initial pass)

- Legacy role/profile references inside `rules/`, `templates/`, `agents.output/`, and policy docs are treated as historical context.
- Canonical source migration target is runtime assets under `config`, `agents`, `rules`, `templates`, `extensions`, `scripts`, and `dashboard`.
- Non-runtime toolchain assets in `scripts/` and docs can contain historical `running-pi`/`rp-*` mentions if they are explicit migration metadata.
