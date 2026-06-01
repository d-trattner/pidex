# Browser Smoke QA Substrate — Linux Root-Backed Install Diagnosis

Date: 2026-06-01
Remote: `root@10.0.0.107`
Workspaces:

- failing/unstable: `/tmp/pidex-browser-smoke-linux`
- successful package+browser install: `/root/pidex-browser-smoke-linux`

## Question

Investigate why browser install would not complete despite Pi-hole showing no DNS blocks.

## Findings

### DNS/network was not the primary blocker

Direct checks from the remote host succeeded:

```bash
curl -I -L https://storage.googleapis.com/chrome-for-testing-public/148.0.7778.96/linux64/chrome-linux64.zip
curl -L --range 0-1048575 -o /tmp/chrome-test.part https://storage.googleapis.com/chrome-for-testing-public/148.0.7778.96/linux64/chrome-linux64.zip
```

Observed:

- `HTTP/2 200`
- `content-length: 183945705`
- 1 MiB range download succeeded

### `/tmp` was tmpfs under memory/swap pressure

Remote mount/space checks:

```text
/tmp   tmpfs  tmpfs
Filesystem Size Used Avail Use% Mounted on
tmpfs       16G 7.6G 8.1G 49% /tmp
```

Memory/swap snapshot showed low free memory and full swap:

```text
Mem: 8.0Gi total, ~654Mi free
Swap: 2.0Gi total, 2.0Gi used
```

The failing workspace and Playwright temp downloads were both under `/tmp`, so browser download/extract operated on tmpfs and memory pressure.

### Playwright downloader got stuck in D-state

Console process inspection during SSH timeout showed:

```text
/usr/local/bin/node /tmp/pidex-browser-smoke-linux/state/browser-smoke/node_modules/playwright-core/lib/entry/oopBrowserDownload.js
node /tmp/pidex-browser-smoke-linux/state/browser-smoke/node_modules/.bin/playwright install chromium
```

Observed process state included `Dl` with high CPU. Killing these processes restored SSH responsiveness.

### Lock files were not the culprit

`/tmp/pidex-browser-smoke-linux/.cache/ms-playwright/` only contained `.links/` metadata after failed install. No meaningful lock file explained the stall.

Old Playwright temp zips existed in `/tmp/playwright-download-*`; two were complete and valid, one was incomplete:

```text
/tmp/playwright-download-crE1KN/...zip 176M unzip OK
/tmp/playwright-download-FlBips/...zip 176M unzip OK
/tmp/playwright-download-1n41aq/...zip 157M unzip failed/incomplete
```

This supports the diagnosis that downloads can complete, but `/tmp` tmpfs/memory pressure plus Playwright temp/extract behavior made the `/tmp` workspace unreliable.

## Root-backed retry

The same worktree was copied to disk-backed root storage:

```text
/root/pidex-browser-smoke-linux
```

Real install command:

```bash
node scripts/modules/run-check.mjs --capability browser-smoke.install --agent orchestrator --phase maintenance --project "$PWD" -- --yes --timeout-ms 900000
```

Result: browser package and browser binaries installed successfully:

```text
Chrome for Testing ... downloaded to /root/pidex-browser-smoke-linux/.cache/ms-playwright/chromium-1223
FFmpeg ... downloaded to /root/pidex-browser-smoke-linux/.cache/ms-playwright/ffmpeg-1011
Chrome Headless Shell ... downloaded to /root/pidex-browser-smoke-linux/.cache/ms-playwright/chromium_headless_shell-1223
browser-smoke install complete
```

## Launch probe result

After successful install, preflight launch probe was bounded and returned:

```text
BROWSER-SMOKE-BLOCKED-INFRA
reason: browser_launch_failed
```

Real culprit for launch:

```text
error while loading shared libraries: libnspr4.so: cannot open shared object file: No such file or directory
```

So install succeeds on disk-backed storage, but browser launch requires missing OS-level Chromium dependencies on this server.

## Verdict

Two distinct culprits:

1. `/tmp` tmpfs/memory/swap pressure caused Playwright download/extract to hang in the `/tmp` workspace.
2. After moving to disk-backed storage, browser launch is blocked by missing system library `libnspr4.so`.

Recommended next step, if browser launch is required on this server:

```bash
npx playwright install-deps chromium
```

or install the equivalent Debian packages, starting with `libnspr4` and likely other Chromium runtime dependencies.
