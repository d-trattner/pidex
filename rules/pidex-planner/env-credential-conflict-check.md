# Rule: .env.local Credential Conflict Check for CLI-Spawning Plans

PROC-NEW-36d | pidex-planner

## Rule

When a plan spawns an external CLI tool that uses native authentication (OAuth flow, credential
file, token store — NOT an API key passed directly), add this assumption to the Assumptions table:

  A-X — No conflicting env vars for [CLI tool]: .env.local does not contain a placeholder or
  stale value for [CLI_TOOL_API_KEY] (or equivalent env var the tool recognizes) that would
  shadow the tool's native auth flow. If such a value exists, the server route must omit it
  from the env passed to the child process.

## Why this matters

Vite loads .env.local into process.env at startup. If .env.local contains a placeholder value
like ANTHROPIC_API_KEY=placeholder (common in project bootstrap templates), and the spawned CLI
tool checks process.env.ANTHROPIC_API_KEY before its own credential file, the placeholder value
takes precedence. The CLI tool fails authentication even though real credentials are present.

This is NOT a secrets issue — placeholder values are not secrets. pidex-security scans for real
secrets in committed files and will not flag a placeholder. This is a planning-time assumption
that must be verified before implementation.

Fix pattern: destructure out the conflicting env var before passing process.env to the child
process. Example: const { TOOL_API_KEY: _omit, ...cleanEnv } = process.env

## Trigger condition

Apply when plan contains ALL of:
1. Spawning an external CLI tool from a server route or Vite context
2. That CLI tool uses native auth (user logged in via cli login or equivalent)

Does NOT apply to:
- CLI tools that exclusively use API keys passed as env vars (no native auth flow)
- Cases where the API key in .env.local IS the intended credential (no conflict)

## Scope distinction from pidex-security

pidex-security covers: real secrets (API keys, passwords, tokens) in committed files.
This rule covers: placeholder values (non-secrets) in .env.local that conflict with CLI tool
native auth. These are orthogonal concerns. pidex-security will NOT flag ANTHROPIC_API_KEY=placeholder
because it is not a real secret.

## Empirical basis

Plan 36 (chat-llm-wiring, 2026-04-25): G9-R2b — .env.local contained
ANTHROPIC_API_KEY=placeholder. Vite loaded it into process.env. Claude CLI preferred that
value over its OAuth credentials, producing "Invalid API key" errors. Fix: destructured out
ANTHROPIC_API_KEY before spreading process.env to spawn env. Not flagged by security review.
One assumption row at plan time prevents this failure.
