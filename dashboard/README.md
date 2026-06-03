# PIDEX Dashboard (TanStack Start)

Neue Dashboard-Implementierung (`dashboard`) auf TanStack Start mit Routenstruktur unter `dashboard/routes/`.

## Start

```bash
cd <pidex-root>
pnpm install --frozen-lockfile --ignore-scripts
pnpm -C dashboard run dev
```

Standard: `http://127.0.0.1:18777`

## LAN / infra binding

`pi.lan` is the canonical LAN dashboard domain and is fronted by nginx, so user-facing URLs do **not** include a port:

- `http://pi.lan/dashboard`
- `http://pi.lan/limits`

nginx proxies to the dashboard upstream on this host at port `18777`. Start the upstream with:

```bash
./start.sh --dev --no-build --no-ingest --host 0.0.0.0 --port 18777 --public-read
```

Fallback direct upstream URL for debugging only:

- `http://<lan-ip>:18777/limits`

Security note: `--public-read` allows unauthenticated provider-limits `GET` requests so the `/limits` page can render through nginx/LAN. Provider/profile mutation (`POST`) remains token-protected by `PIDEX_PROVIDER_LIMITS_TOKEN` / `PROVIDER_LIMITS_TOKEN` when publicly bound.

## Route-Ziele

- `/dashboard` → zentrale Stats-Landing (KPIs)
- `/_dashboard/overview`
- `/_dashboard/runs`
- `/_dashboard/tokens`
- `/_dashboard/pipelines`
- `/_dashboard/quality`
- `/_dashboard/analysis`
- `/_dashboard/live`
- `/_dashboard/limits`

## Migration status

The legacy dashboard archive has been removed. Runtime ingest now lives at `../scripts/dashboard/ingest.mjs`.
