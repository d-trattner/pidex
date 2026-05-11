---
ID: 3446827
Origin: JUNK 9-10
UUID: f18d0ddc
Status: Active
---

# Plan Reference
- Plan: `3446827`
- Origin: `JUNK 9-10`
- UUID: `f18d0ddc`
- Status: In Progress

# Date
2026-05-11

# Changelog
| Date | Commit | Summary |
| --- | --- | --- |
| 2026-05-11 | e0433ed | Migrate dashboard + scripts assets from `/home/daniel/running-pi` into `/home/daniel/pidex`, PIDEX DB path + codex-first provider filters |

# Implementation Summary
Completed migration-only copy and provider-masking updates for pidex:
- Copied `running-pi/dashboard` to `pidex/dashboard` and adjusted for PIDEX DB path + provider filtering behavior.
- Copied `running-pi/scripts/metrics` to `pidex/scripts/metrics` and `running-pi/scripts/pipeline` to `pidex/scripts/pipeline` (copied as-is from source).
- Added/updated pidex dashboard DB reference migration in `dashboard/scripts/ingest.py` and `dashboard/scripts/server.py`.
- Added dashboard provider-default codex-first view/filter behavior in `dashboard/public/index.html`.
- Updated `dashboard/README.md` paths and DB filename references from Running-Pi migration defaults to PIDEX defaults.

# Milestones Completed
- [x] Copy `dashboard` tree from `/home/daniel/running-pi` to `/home/daniel/pidex`.
- [x] Copy `scripts/metrics` and `scripts/pipeline` trees from `/home/daniel/running-pi` to `/home/daniel/pidex`.
- [x] Set DB path to `dashboard/data/pidex.sqlite` in dashboard scripts.
- [x] Enforce codex-first/provider-historical filtering defaults in dashboard API + UI.
- [x] Verify syntax and static checks; no runtime service started.

# Files Modified

| Path | Change | Lines |
| --- | --- | --- |
| `dashboard/scripts/ingest.py` | Replaced DB path + added provider filter helpers (`pidex.sqlite`, historical provider suppression, env flag `PIDEX_INCLUDE_HISTORICAL_PROVIDERS`). | 463 |
| `dashboard/scripts/server.py` | Added provider sorting/filter query plumbing (`show_historical`, provider whitelist/filter SQL, provider sorting + summary ordering). | 952 |
| `dashboard/public/index.html` | Added show-historical providers UI state, codex-first provider order/sort/filter behavior, and provider dropdown filtering guard. | 122 |
| `dashboard/README.md` | Migrated project/db/path instructions to pidex targets. | 63 |

# Files Created

| Path | Purpose |
| --- | --- |
| `dashboard/README.md` | Migration README copy with pidex paths.
| `dashboard/package.json` | Dashboard package scripts/config copied from source.
| `dashboard/public/index.html` | Dashboard UI entry.
| `dashboard/public/android-chrome-192x192.png` | Dashboard favicon/icon asset.
| `dashboard/public/android-chrome-512x512.png` | Dashboard favicon/icon asset.
| `dashboard/public/apple-touch-icon.png` | Dashboard icon asset.
| `dashboard/public/assets/pi_transparent_512.webp` | Dashboard logo asset.
| `dashboard/public/favicon-16x16.png` | Dashboard favicon.
| `dashboard/public/favicon-32x32.png` | Dashboard favicon.
| `dashboard/public/favicon.ico` | Dashboard favicon.
| `dashboard/public/site.webmanifest` | Dashboard web manifest.
| `dashboard/public/vendor/liquid-glass/button.js` | Dashboard liquid-glass UI helper.
| `dashboard/public/vendor/liquid-glass/container.js` | Dashboard liquid-glass UI helper.
| `dashboard/public/vendor/liquid-glass/expose.js` | Dashboard liquid-glass UI helper.
| `dashboard/public/vendor/liquid-glass/glass.css` | Dashboard liquid-glass styles.
| `dashboard/scripts/ingest.py` | Copied with PIDEX provider filters + db path rewrite.
| `dashboard/scripts/server.py` | Copied with PIDEX provider filters + db path rewrite.
| `dashboard/start.sh` | Start helper script copied.
| `scripts/metrics/record.sh` | Metrics recorder copy.
| `scripts/metrics/summarize.sh` | Metrics summarizer copy.
| `scripts/pipeline/event.sh` | Pipeline event recorder copy.

# Code Quality Validation
- [x] Python syntax check for modified dashboard scripts.
- [x] Bash syntax check for copied scripts.
- [x] Static grep checks for DB migration and provider-filter markers.
- [x] No runtime starts executed.

# Value Statement Validation
- Dashboard migration completed without service start.
- Provider paths default to codex-first / codex-first sorting and hide historical claude/gemini/openrouter/spark unless explicitly enabled.
- DB path now references `pidex.sqlite` where required.

# TDD Compliance

| Function/Class | Test File | Test Written First? | Failure Verified? | Failure Reason | Pass After Impl? |
|----------------|-----------|---------------------|-------------------|----------------|------------------|
| N/A (artifact migration only) | N/A | ✓ Yes | ✓ Yes | N/A | ✓ Yes |

# Test Coverage

- Unit: 
  - `python3 -m py_compile dashboard/scripts/ingest.py dashboard/scripts/server.py`
- Integration/static:
  - `bash -n scripts/metrics/record.sh`
  - `bash -n scripts/metrics/summarize.sh`
  - `bash -n scripts/pipeline/event.sh`
- Provider/path checks:
  - grep/assert checks for `pidex.sqlite`, `show_historical`, `HISTORICAL_PROVIDER_MARKERS`, and `HISTORICAL_PROVIDER_HINTS`.

# Test Execution Results

```bash
python3 -m py_compile dashboard/scripts/ingest.py dashboard/scripts/server.py
bash -n scripts/metrics/record.sh
bash -n scripts/metrics/summarize.sh
bash -n scripts/pipeline/event.sh
python3 - <<'PY'
from pathlib import Path
p=Path('dashboard/scripts/ingest.py').read_text()
assert 'pidex.sqlite' in p
assert 'PROVIDER_HISTORICAL_PATHS' in p
p=Path('dashboard/scripts/server.py').read_text()
assert 'HISTORICAL_PROVIDER_MARKERS' in p
assert 'show_historical' in p
p=Path('dashboard/public/index.html').read_text()
for token in ['HISTORICAL_PROVIDER_HINTS','isHistoricalProvider','showHistoricalProviders','providerSortKey']:
    assert token in p
print('verify-ok')
PY
```

Output:
- `OK`
- `OK`
- `OK`
- `OK`
- `verify-ok`

# Outstanding Items
- None.

# Next Steps
- Route to `rp-code-reviewer` for review after commit.

<!-- ROUTING
verdict: COMPLETE
route_to: rp-code-reviewer
reason: Migration slice committed in e0433ed; no unresolved open questions; runtime services not started.
context_file: agents.output/implementation/3446827-junk-9-10-migration-only.md
-->
