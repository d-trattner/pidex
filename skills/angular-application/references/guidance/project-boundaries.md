# Angular project boundaries

- Treat the selected physical project root as the only writable project authority.
- Do not follow project metadata, output, config or source links outside that root.
- Preserve existing package manager, lockfile and workspace topology unless migration is the task.
- Never install globally or use moving package versions.
- Never let Angular/Nx generators overwrite existing instructions, PIDEX context/rules, credentials or unrelated configuration silently.
- Keep generated files visible in the normal diff and review them like authored source.
- Runtime/build/coverage/cache outputs are evidence or ignored artifacts, not commit candidates unless the project explicitly tracks them.
- Project findings must not leak private paths, prompts, product data or tenant details into global PIDEX rules or skill updates.
