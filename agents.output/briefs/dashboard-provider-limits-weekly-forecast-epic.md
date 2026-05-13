# Future Epic: Dashboard Provider Limits 5-Hour / 7-Day Forecast + Usage Visualization

## User Story
As a PIDEX dashboard operator, I want the `/limits` view to show Codex and Codex Spark 5-hour and 7-day provider quota usage with progress bars, forecasts, and usage trends, so I can understand whether current usage will hit provider limits before reset and adjust model/profile choices early.

## Problem
The current provider-limits subview does not expose the provider-native Codex/Codex Spark 5-hour and 7-day quota windows clearly enough. Operators need to answer: “Will Codex or Codex Spark hit its 7-day quota before the provider reset?”

## Goals
- Keep the existing `/limits` profile/recommendation controls unchanged.
- Show provider-specific containers for `codex` and `codex-spark` when records exist.
- In each provider container, show `five_hour` and `seven_day` progress bars using provider-supplied `used_percent` against an implicit 100% quota limit.
- Show each window’s provider-supplied reset/end timestamp under its progress bar.
- Add forecast information based on current usage/burn rate:
  - projected time/date when `used_percent` would hit 100%,
  - remaining time until reset,
  - confidence/insufficient-data label when forecast history is too sparse.
- Add usage chart(s) inside each provider container:
  - x-axis: time within the current provider window,
  - y-axis: `used_percent`,
  - horizontal reference line at 100% if feasible,
  - vertical marker for forecast hit time if the projection predicts a hit before reset.
- Preserve existing provider-limits auth/security behavior and local/public-bind controls.

## Acceptance Criteria
- `/limits` displays `codex` and `codex-spark` `five_hour` and `seven_day` quota data when present in PIDEX-native provider-limit state.
- Existing profile/recommendation UI remains functionally unchanged.
- Each provider has its own container, with 5-hour and 7-day progress bars plus reset/end timestamp below each bar.
- Each visible limit has accessible text for used percentage, remaining percentage, reset/end time, and forecast status.
- Forecast output is shown per provider/window and distinguishes:
  - `forecast-hit-before-reset`,
  - `forecast-safe-until-reset`,
  - `insufficient-data`,
  - `unknown-limit`.
- Unknown/error records remain visible as disabled/unknown cards or rows; missing data must not be rendered as false 0% usage.
- Current-window usage chart renders inside each provider container for available `seven_day` data and includes a forecast marker when applicable.
- Mobile layout remains readable: provider containers stack cleanly, charts do not overflow, and progress bars remain legible.
- Tests cover API normalization, forecast calculation, unknown/error records, and UI rendering for `five_hour`/`seven_day` provider containers.
- Browser evidence covers desktop and mobile `/limits` with seeded `five_hour` + `seven_day` `codex` and `codex-spark` records.

## Suggested Data Contract
PIDEX should remain PIDEX-native but copy the proven Running-Pi-compatible provider-limit contract and logic. Do not read `<pidex-root>` at runtime. Use PIDEX-owned state such as:

- `state/provider-limits/latest.json`
- `state/provider-limits/history.jsonl`
- `state/provider-limits/active-profile.json`

Codex/Codex Spark provider quota values are percentage-based. The underlying raw unit is opaque because the Codex usage endpoint exposes `used_percent`, not raw token/request counts. Treat 100% as the quota limit.

Example record:

```json
{
  "provider": "codex-spark",
  "window": "seven_day",
  "used_percent": 43,
  "resets_at": "2026-05-16T08:09:12Z",
  "allowed": true,
  "limit_reached": false,
  "plan": "prolite",
  "limit_name": "GPT-5.3-Codex-Spark",
  "metered_feature": "codex_bengalfox"
}
```

Use provider-native windows:

- `five_hour` for the short Codex quota window.
- `seven_day` for the weekly/7-day Codex quota window.

Reset/end timestamps from `resets_at` are authoritative. Do not infer calendar-day or Monday-week reset boundaries.

## Forecast Guidance
Copy Running-Pi forecast behavior for PIDEX-native state:

- Calculate burn rate from recent `used_percent` deltas in the same provider/window/reset window.
- Filter history by same `provider`, same `window`, and same `resets_at` as the current record.
- Use recent history, currently the last 48h in Running Pi.
- Require at least 3 samples spanning at least 1h; otherwise return `insufficient-data`.
- Burn rate is percentage-points per hour.
- Forecast exhaustion at `used_percent == 100`.
- If usage decreases due reset, segment/filter by reset/window boundary rather than treating it as negative burn.
- If burn rate is zero or negative, forecast should say safe/unknown rather than divide by zero.
- Forecast must include sample count/window, span, projected exhaustion time, whether exhaustion occurs before reset, and confidence label.

## Out of Scope
- Changing existing profile/recommendation controls in `/limits`.
- Automatic model/profile switching based on forecast.
- Telegram alerts for forecasted limit hits.
- Cross-project quota attribution unless already present in provider-limit data.
- Direct runtime reads from `<pidex-root>`; Running Pi is a source pattern to copy, not a runtime dependency.
- Multi-window historical trend chart across past 7-day resets.

## Dependencies / Related Work
- Existing provider-limits native work: `agents.output/roadmap/4-provider-limits-native-roadmap.md`.
- Existing `/limits` auth/security controls and provider state path.
- Dashboard route: `dashboard/routes/limits.tsx`.
- Provider limits server helpers: `dashboard/lib/server/limits.ts` and `scripts/provider-limits/probe.py`.

## Implementation Notes
Prefer a small, testable slice:

1. Copy/adapt Running-Pi-compatible provider-limit state shape into PIDEX-native fixtures and helpers.
2. Add/verify `five_hour` and `seven_day` records in provider-limit state + fixture tests.
3. Add Running-Pi-style forecast calculation in server/helper layer.
4. Render one provider container each for `codex` and `codex-spark`; each contains 5-hour and 7-day progress bars with reset/end timestamps.
5. Add current-window `seven_day` line chart and forecast marker inside each provider container.
6. Keep existing profile/recommendation controls unchanged.
7. Add desktop/mobile browser evidence.
