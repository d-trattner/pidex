#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

function runGit(args) {
  return spawnSync('git', args, { encoding: 'utf8' });
}

function main() {
  const inside = runGit(['rev-parse', '--is-inside-work-tree']);
  if (inside.status !== 0 || inside.stdout.trim() !== 'true') {
    console.error('ignored-tracked-guard: current directory is not inside a Git worktree');
    process.exit(2);
  }

  const result = runGit(['ls-files', '-ci', '--exclude-standard']);
  if (result.status !== 0) {
    console.error(result.stderr || 'ignored-tracked-guard: git ls-files failed');
    process.exit(2);
  }

  const files = result.stdout.split(/\r?\n/).filter(Boolean);
  if (files.length === 0) {
    console.log('ignored-tracked-guard: ok');
    return;
  }

  console.error('ignored-tracked-guard: tracked files match .gitignore/excludes; remove from index or fix overbroad ignore patterns:');
  for (const file of files) console.error(`- ${file}`);
  console.error('Hint: generated/runtime files should be removed with `git rm --cached`; durable source files usually mean the ignore pattern is too broad.');
  process.exit(1);
}

main();
