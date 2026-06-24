# npm + GitHub Release Workflow

PROC-NPM-GH-RELEASE

## Trigger

Use this rule for PIDEX public package releases or any release path that includes:

- package semver bump;
- npm publication;
- git tag push;
- GitHub Release creation/update.

## Principle

For public npm package releases, a release is not complete when only the git tag is pushed or only npm is published. The release closure set is:

1. clean release commit containing version/changelog/docs;
2. public-readiness gate passed on the release commit;
3. annotated semver tag pushed;
4. npm package published and verified;
5. GitHub Release object exists for the same tag;
6. post-release proof recorded.

If one of these is intentionally skipped, record it as an explicit user-approved exception in the deployment/release artifact.

## Stage 1 — prepare-only

Before user Stage 2 approval:

1. Bump `package.json` semver only when the user/plan selected the exact version.
2. Update `CHANGELOG.md` with a dated section for that version.
3. Run:
   ```bash
   corepack pnpm run check
   corepack pnpm run public:check
   ```
4. If public-readiness fails only because the tree is dirty with release-prep files, commit the intended release-prep files, then rerun public-readiness on a clean tree.
5. Commit with a message like:
   ```text
   chore: prepare <version> release
   ```
6. Do not tag, push, publish, or create GitHub Release before explicit Stage 2 approval.

## Stage 2 — release execution

After explicit user approval for the exact version:

1. Verify clean tree and release commit:
   ```bash
   git status --short
   node -p "require('./package.json').version"
   ```
2. Create annotated tag if absent:
   ```bash
   git tag -a v<X.Y.Z> -m "v<X.Y.Z>"
   ```
3. Push branch and tag:
   ```bash
   git push origin <branch>
   git push origin v<X.Y.Z>
   ```
4. Publish npm only when the user explicitly approves agent-side publish, otherwise hand the exact command to the user:
   ```bash
   npm publish --access public
   ```
5. Verify npm publication:
   ```bash
   npm view @d-trattner/pidex@<X.Y.Z> version
   ```
6. Create or update GitHub Release for the same tag:
   ```bash
   gh release create v<X.Y.Z> --title "v<X.Y.Z>" --notes-file <release-notes-file>
   ```
   If it already exists, use:
   ```bash
   gh release edit v<X.Y.Z> --title "v<X.Y.Z>" --notes-file <release-notes-file>
   ```
7. Verify GitHub Release:
   ```bash
   gh release view v<X.Y.Z> --json tagName,name,url,publishedAt
   ```

## Release notes source

Default release notes source is the matching `CHANGELOG.md` section. Keep notes concise and operator-facing. Do not include secrets, local absolute paths, raw helper JSON, raw child logs, credential inventory, or private host details.

## Partial/manual publish handling

If the user publishes npm manually after the agent prepared tag/release commit:

1. Ask the user to confirm npm publish completed or verify with `npm view`.
2. Then create/verify the GitHub Release object for the already-pushed tag.
3. Record that npm publish was manual in the deployment/release artifact.

## Closure proof line

Before declaring completion, include a compact proof line:

```text
Release v<X.Y.Z>: commit=<sha>, tag=pushed, npm=<version verified|manual confirmed>, github_release=<url>, public_readiness=pass, dirty_tree=<clean|known leftovers>
```

If dirty-tree leftovers exist, load `post-release-artifact-hygiene.md` before closure.
