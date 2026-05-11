# Lead Prompt Template

Used by the orchestrator when calling `~/running-pi/scripts/lead/start.sh --prompt "..."`.
Substitute `<pidex-planner | pidex-architect>` and `<epic statement>` before passing.

```
MANDATORY READING: ~/.claude/running-pi-instructions.md (Rules 1-7).

Form an agent team with the following teammates and orchestrate them via shared task list:
  - pidex-architect
  - pidex-planner
  - pidex-critic
  - pidex-designer
  - pidex-implementer
  - pidex-code-reviewer
  - pidex-security
  - pidex-qa
  - pidex-uat
  - pidex-devops
  - pidex-retrospective
  - pidex-pi

OPENING AGENT: <pidex-planner | pidex-architect>
If the pre-flight classified the task as Structural or Cross-cutting-large, OPENING AGENT is
pidex-architect: it writes an ADR to agents.wiki.<project>/decisions/ and findings to
agents.output/architecture/, then routes to pidex-planner. pidex-planner reads the ADR as mandatory
input. For Standard features and Bugfixes, OPENING AGENT is pidex-planner (normal flow).

Operate in Agent Teams mode (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 is set).
Use TaskCreate / TaskUpdate / TaskList for the shared task list.
Use peer-to-peer messaging between teammates instead of treating each as a one-shot subagent.

Apply auto-proceed (Rule 4), gate detection (Rule 5), Telegram routing via running-pi
(Rule 6 — use bash ~/running-pi/scripts/telegram/send-gate.sh, NOT the MCP plugin),
and idle-stall handling (Rule 1).

CLI-DELEGATE ROUTING (MANDATORY — applies in this session too):
Before spawning pidex-critic, pidex-code-reviewer, pidex-uat, pidex-retrospective, or pidex-designer via the
Agent tool, check agents.json and attempt delegation via dispatch.sh:

  PROVIDER=$(jq -r --arg a "<agent>" '.agents[$a].provider // .defaults.provider' ~/running-pi/config/agents.json)

  If PROVIDER=codex or PROVIDER=gemini:
  1. Pre-create output skeleton (standard frontmatter + empty section headers)
  2. Build /tmp/pidex-inputs.json with the keys the template expects (see SKILL.md section 1b)
  3. Run: bash ~/running-pi/scripts/delegate/dispatch.sh --agent <agent> --inputs /tmp/pidex-inputs.json --output <output-path> --project-dir "$PWD"
  4. Exit 0 → skip Agent spawn, output doc is populated. Read ROUTING block from output doc.
  5. Any other exit → fall back to Agent tool as normal (mandatory, never fail pipeline on delegate error).

  Special case — pidex-designer: skip delegation if plan has no UI scope (no "page/component/route/
  layout/form/button" keywords in plan). Spawn Claude subagent with maxTurns=3 instead (auto-approve).

CRITICAL GATE ROUTING: Every gate (G1–G10) MUST be sent via:
  bash ~/running-pi/scripts/telegram/send-gate.sh --gate <ID> --plan <N> --slug <slug> --options "<comma-separated>" --context "<message>" --lead-id "$LEAD_ID"
Do NOT write gate messages as text output — --print mode buffers all output, so the user
never sees it. This causes a deadlock. Always call send-gate.sh, then END YOUR TURN.

CRITICAL — DO NOT WAIT FOR THE REPLY YOURSELF: After send-gate.sh returns, end the turn.
Do NOT run `recv-gate.sh`, do NOT Bash-wait, do NOT sleep. The orchestrator will receive the
user's reply via Telegram and resume you via `claude --resume`. Polling Telegram from the
lead competes with recv-gate.sh, blocks lead/resume.sh (PID-alive check), and deadlocks the
pipeline. See Rule 6 for G9 and G4 examples.

Local-only releases must still run retro+pi (Rule 4).

EPIC: <epic statement here>
```

## Anti-patterns

- "Starte mit pidex-planner. Originiere Plan-ID 6." — reads as sequential delegation, not team formation. Lead falls back to classic subagent mode and Rule 1 is not exercised.
- Loading the Telegram MCP plugin in the lead session — competes with the orchestrator for the getUpdates poll slot, breaks Rule 6.
- Running the lead in interactive mode (without `--print`) — blocks the spawning shell, can't be resumed cleanly via `claude --resume`.
