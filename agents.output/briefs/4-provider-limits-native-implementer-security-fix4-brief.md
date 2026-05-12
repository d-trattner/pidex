# Implementer security fix4 brief: 4-provider-limits-native

Project cwd: `/home/daniel/pidex`
Security v4 rejection: `agents.output/security/4-provider-limits-native-security-v4.md`
Expected output: `agents.output/implementation/4-provider-limits-native-security-fix4.md`

Fix SEC-3 critical dependency advisory:
- `npm -C dashboard audit --omit=dev --json` flagged direct production dependency `@tanstack/react-start@1.167.71` as malware.
- `npm view @tanstack/react-start version dist-tags --json` currently reports latest `1.167.65`, so installed `1.167.71` appears yanked/affected.

Required remediation:
1. Change `dashboard/package.json` to non-affected available version, likely `@tanstack/react-start`: `1.167.65` unless audit/npm says otherwise.
2. Regenerate `dashboard/package-lock.json` cleanly (`npm -C dashboard install` or targeted equivalent).
3. Re-run `npm -C dashboard audit --omit=dev --json`, focused provider-limits auth tests, typecheck/build as feasible.
4. Document any residual advisory if no fix available.

Constraints:
- Do not modify unrelated dependencies beyond lockfile changes needed for this direct dependency remediation.
- Preserve provider-limits implementation/auth behavior.

ROUTING must include `context_file: agents.output/implementation/4-provider-limits-native-security-fix4.md` and route to `pidex-security`.
