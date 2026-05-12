# Rule: G9 Preview Upstream Reachability

PROC-NEW-G9-UPSTREAM | pidex-devops / orchestrator

## Rule

Before asking the user to approve a G9 preview on a named LAN/domain URL, prove that the preview upstream is reachable through the same network path the user will use.

For PIDEX dashboard previews, `pi.lan` is nginx-fronted and user-facing URLs omit the port:

- `http://pi.lan/<route>` → nginx → dashboard upstream `0.0.0.0:18777`

The dashboard upstream must therefore bind to `0.0.0.0:18777`, not `127.0.0.1:18777`, unless nginx is explicitly configured to proxy loopback on the same host.

## When to apply

Apply whenever pidex-devops or the orchestrator starts a dev/preview server for G9 and any of these are true:

- preview URL is a LAN hostname/domain (`*.lan`, `pi.lan`, `homelab.lan`, etc.);
- preview URL is intended for another device/browser, not only the local machine;
- nginx/reverse proxy fronts the preview;
- the user previously saw 502 or connection refused on a preview URL.

## Procedure

1. Kill stale Vite/dev servers first per `g9-preflight-kill-vite.md`.
2. Start the upstream with the expected externally reachable bind.

For PIDEX dashboard:

```bash
./dashboard/start.sh --dev --no-build --no-ingest --host 0.0.0.0 --port 18777 --public-read
```

3. Prove listener ownership:

```bash
ss -ltnp | grep ':18777'
# Must show 0.0.0.0:18777 (or another explicitly documented nginx-reachable bind), not only 127.0.0.1:18777.
```

4. Prove direct upstream health:

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18777/<route>
curl -fsS -o /dev/null -w '%{http_code}\n' http://<LAN-IP>:18777/<route>
```

5. Prove user-facing domain health when resolvable from the orchestrator host:

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' http://pi.lan/<route>
```

If `pi.lan` is not resolvable on the orchestrator host, still test upstream with `Host: pi.lan` and report that DNS/proxy verification must happen from the user's client/network:

```bash
curl -fsS -H 'Host: pi.lan' -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18777/<route>
```

6. Only present the G9 URL after the health checks return 2xx/3xx. If any check fails, fix bind/proxy/DNS first; do not ask the user to preview a known-broken URL.

## Required evidence in devops/orchestrator notes

Include a compact proof block:

```text
G9 preview reachability:
- listener: 0.0.0.0:18777 pid=<pid>
- local upstream: 200 http://127.0.0.1:18777/quality
- LAN upstream: 200 http://<LAN-IP>:18777/quality
- user URL: 200 http://pi.lan/quality (or DNS not resolvable locally; Host-header upstream 200)
```

## Why

A recurring failure mode is starting Vite on `127.0.0.1:18777` while the user opens `http://pi.lan/...` through nginx. The local curl succeeds, but nginx/client preview returns 502 because the externally routed upstream is not reachable. This rule makes the preview bind and domain path part of G9 preflight instead of discovering it after user rejection.
