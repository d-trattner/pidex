# Future Epic: Dashboard Provider Limits Weekly Forecast + Usage Visualization

## User Story
As a PIDEX dashboard operator, I want the `/limits` view to show both daily and weekly Codex/Codex Spark quota usage with progress bars, forecasts, and usage trends, so I can understand whether current usage will hit provider limits before reset and adjust model/profile choices early.

## Problem
The current provider-limits subview shows only daily rows for `codex` and `codex-spark`. Weekly limit visibility is missing, so the dashboard does not answer the operationally important question: “Will we hit the weekly limit at the current burn rate?”

## Goals
- Show daily and weekly rows/sections for both `codex` and `codex-spark` when data exists.
- Add a clear progress bar/card for each limit window showing used vs limit and remaining capacity.
- Add forecast information based on current usage/burn rate:
  - projected time/date when the limit would be hit,
  - remaining time until reset,
  - confidence/insufficient-data label when forecast history is too sparse.
- Add a line chart for weekly usage:
  - x-axis: time within the current week or recent weekly history,
  - y-axis: usage,
  - horizontal reference line for the weekly limit if feasible,
  - vertical marker for forecast hit time if the projection predicts a hit before reset.
- Preserve existing provider-limits auth/security behavior and local/public-bind controls.

## Acceptance Criteria
- `/limits` displays `codex` and `codex-spark` daily and weekly quota data when present in PIDEX-native provider-limit state.
- Each visible limit has a progress indicator with accessible text for used/limit/remaining percentage.
- Forecast output is shown per provider/window and distinguishes:
  - `forecast-hit-before-reset`,
  - `forecast-safe-until-reset`,
  - `insufficient-data`,
  - `unknown-limit`.
- Weekly usage chart renders for available weekly data and includes a forecast marker when applicable.
- Mobile layout remains readable: cards stack cleanly, chart does not overflow, and progress bars remain legible.
- Tests cover API normalization, forecast calculation, and UI rendering for daily/weekly rows.
- Browser evidence covers desktop and mobile `/limits` with seeded daily+weekly `codex` and `codex-spark` records.

## Suggested Data Contract
Extend/confirm `state/provider-limits/latest.json` supports records like:

```json
{
  "provider": "codex-spark",
  "window": "weekly",
  "used": 123,
  "limit": 500,
  "remaining": 377,
  "reset_at": "2026-05-18T00:00:00Z",
  "observed_at": "2026-05-12T22:00:00Z",
  "history": [
    { "timestamp": "2026-05-12T10:00:00Z", "used": 80 },
    { "timestamp": "2026-05-12T22:00:00Z", "used": 123 }
  ]
}
```

If live provider APIs do not expose weekly history directly, support a PIDEX-native history/fixture path first and label forecasts as estimate-based.

## Forecast Guidance
- Calculate burn rate from recent usage deltas in the same provider/window.
- Do not forecast from one point only; return `insufficient-data`.
- If usage decreases due reset, segment the series at reset/window boundary rather than treating it as negative burn.
- If burn rate is zero or negative, forecast should say safe/unknown rather than divide by zero.
- Forecast must include sample count/window and confidence label.

## Out of Scope
- Automatic model/profile switching based on forecast.
- Telegram alerts for forecasted limit hits.
- Cross-project quota attribution unless already present in provider-limit data.
- Importing Running Pi provider data into PIDEX-native stats without explicit external/baseline label.

## Dependencies / Related Work
- Existing provider-limits native work: `agents.output/roadmap/4-provider-limits-native-roadmap.md`.
- Existing `/limits` auth/security controls and provider state path.
- Dashboard route: `dashboard/routes/limits.tsx`.
- Provider limits server helpers: `dashboard/lib/server/limits.ts` and `scripts/provider-limits/probe.py`.

## Implementation Notes
Prefer a small, testable slice:

1. Add/verify weekly records in provider-limit state + fixture tests.
2. Add forecast calculation in server/helper layer.
3. Render progress cards for all provider/window records.
4. Add weekly line chart and forecast marker.
5. Add desktop/mobile browser evidence.
