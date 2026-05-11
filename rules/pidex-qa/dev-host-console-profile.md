# Dev Host / HMR Console Profile

When QA collects browser evidence on a named dev host or local preview profile, browser console noise must be classified instead of left ambiguous.

## Trigger

Use when:

- browser evidence uses non-default hostnames (`homelab.lan`, LAN IP, custom domain);
- plan touches Vite/dev server/proxy/HMR config;
- QA observes websocket/HMR/host resolution console errors;
- UI proof depends on clean console evidence.

## Required QA evidence

Add a browser console classification table:

```markdown
## Browser Console Classification

| Message/pattern | Host/profile | Classification | Product impact | Action |
|---|---|---|---|---|
```

Classifications:

- `dev-only non-blocker`
- `production-impacting blocker`
- `host-config regression`
- `third-party/noise non-blocker`
- `unknown needs investigation`

## Blocking rule

QA MUST NOT mark UI/browser evidence complete when relevant console errors are unclassified. If HMR/websocket errors are accepted as dev-only, record why they do not affect production value and file/confirm follow-up when recurring.
