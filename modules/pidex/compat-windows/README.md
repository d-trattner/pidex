# PIDEX Windows Compatibility Module

Owns Windows compatibility audit helpers. This does not claim full native Windows runtime support.

## Module-owned implementation

- `modules/pidex/compat-windows/scripts/compat/windows-audit.mjs`

## Compatibility wrappers

- `compat-windows.audit` capability

Windows install/start PowerShell wrappers remain public/platform contract surfaces unless a future platform package-boundary design moves them.
