# Release-Coherence Matcher Grammar (PROC-NEW-1)

## Scope
For `pidex-planner` plans where `terminal-close` and/or `release-coherence` is in scope.

## Trigger
Plan includes terminal-close or release-coherence gates and any matcher-routing or closure-coherence assertions.

## Rule
Before critic handoff, planner must include:

### 1) Matcher Grammar
- explicit grammar block for terminal-close/release-coherence matcher patterns
- command/route/path tokens covered by the plan
- success/failure outcomes for each token family

### 2) Negative Example Matrix
- at least 3 negative examples showing why a matcher is invalid
- include regex/substring collision cases
- include boundary examples (`prefix-only`, `suffix-only`, `partial`)

### 3) Terminal-Close AC
- at least one AC row named `terminal-close-coherence`
- AC references matcher + negative matrix as evidence sources

## Fail condition
- Missing matcher grammar block, negative examples, or AC row => plan invalid.
- Critic handoff must halt until complete.

## Evidence requirement
Implementation doc must cite this rule and the completed matrix.
