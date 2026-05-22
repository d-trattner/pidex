# Rule: LLM System Prompt Infrastructure Context Requirement

PROC-NEW-50-2 | pidex-planner

## Rule

When a plan uses an LLM to generate infrastructure actions (tool loops, plan step generation,
autonomous mutation sequencing), the system prompt specification MUST include a dedicated
"ENVIRONMENT FACTS" or "INFRASTRUCTURE CONTEXT" subsection that provides static facts:

  - Service names and their roles (e.g., "Pi-hole at <service-host> handles DNS resolution")
  - IP addresses and hostnames for services the LLM may reference or target
  - What is installed and where (e.g., "nginx-proxy-manager is the sole reverse proxy")
  - Any constraints the LLM must not violate (e.g., "never modify hosts not in the allowlist")

## Required structure in the system prompt spec

  ### System Prompt: [AgentName]
  #### Tool surface
    <tool list>
  #### Output format contract
    <binding JSON envelope spec>
  #### Environment facts (REQUIRED for infra-action LLMs)
    <static topology block — service names, IPs, installed tools>
  #### Constraints
    <what the LLM must/must not do>

## Trigger condition

Apply when the plan contains ALL of:
1. An LLM component that generates infrastructure actions (DNS changes, proxy config, etc.)
2. The LLM needs to reference specific services, IPs, or topology details to produce
   correct output (not generic steps)

## Why this matters

Plan 50 (execute-plan, 2026-04-29): ANALYSIS_SYSTEM_PROMPT described tools and output
format but lacked a static block about the homelab topology. The LLM generated generic
steps ("Install nginx") and placeholder URLs. Adding an INFRASTRUCTURE RULES static block
fixed the output quality. The gap was not caught during planning.
