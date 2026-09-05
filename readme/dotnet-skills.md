# Optional .NET backend skills

PIDEX ships four guidance-only skills as separate private Pi packages. Normal install exposes none.

| Module | Skill | Requires |
|---|---|---|
| `pidex.dotnet` | `dotnet-backend` | core |
| `pidex.dapper` | `dapper-data-access` | `pidex.dotnet` |
| `pidex.serilog` | `serilog-observability` | `pidex.dotnet` |
| `pidex.sqlserver` | `sql-server` | `pidex.dotnet` |

From canonical PIDEX checkout:

```bash
node scripts/modules/skill-resources.mjs status
node scripts/modules/skill-resources.mjs enable pidex.dapper --dry-run
node scripts/modules/skill-resources.mjs enable pidex.dapper
```

Enabling add-on installs base package first. Reload Pi after change. Sibling add-ons remain disabled.

```bash
node scripts/modules/skill-resources.mjs disable pidex.dapper
node scripts/modules/skill-resources.mjs disable pidex.dotnet
# or explicitly remove enabled dependents too
node scripts/modules/skill-resources.mjs disable pidex.dotnet --cascade
```

Commands delegate package registration to `pi install`/`pi remove`; they do not edit Pi settings directly. Module state is stored in ignored `config/modules.local.json`. Failed multi-package activation rolls back completed Pi registrations and leaves module state unchanged. Manual `pi config` changes can diverge from PIDEX state; disable/re-enable requested module to reconcile. Never run activation from temporary worktree intended for deletion because Pi registers absolute nested package path.

Skills install no .NET SDK, NuGet package, SQL Server, database, migration, or logging sink. Native Windows and real SQL Server behavior require later acceptance.
