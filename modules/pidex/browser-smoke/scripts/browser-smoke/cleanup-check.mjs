#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { BROWSER_SMOKE_STATUS } from './status.mjs';
import { browserSmokePaths } from './paths.mjs';

const json = process.argv.includes('--json');
const paths = browserSmokePaths();

function processSnapshot() {
  if (process.platform === 'win32') {
    const proc = spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Get-Process | Where-Object { $_.Path -like "*ms-playwright*" } | Select-Object Id,ProcessName,Path | ConvertTo-Json -Compress'], { encoding: 'utf8' });
    return { status: proc.status, stdout: proc.stdout.trim(), stderr: proc.stderr.trim() };
  }
  const proc = spawnSync('ps', ['-eo', 'pid,ppid,pcpu,pmem,stat,etime,cmd'], { encoding: 'utf8' });
  const lines = proc.stdout.split(/\r?\n/).filter((line) => line.includes(paths.cacheDir) || line.includes('ms-playwright'));
  return { status: proc.status, lines };
}

const snapshot = processSnapshot();
const count = Array.isArray(snapshot.lines) ? snapshot.lines.length : (snapshot.stdout && snapshot.stdout !== 'null' ? 1 : 0);
const result = {
  type: 'browser-smoke-cleanup-check',
  status: count === 0 ? BROWSER_SMOKE_STATUS.PASS : BROWSER_SMOKE_STATUS.BLOCKED_INFRA,
  reason: count === 0 ? 'no_browser_smoke_processes_detected' : 'possible_browser_smoke_processes_detected',
  cache_dir: paths.cacheDir,
  process_count: count,
  snapshot,
};
if (json) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`${result.status}: ${result.reason}`);
  if (count) console.log(JSON.stringify(snapshot, null, 2));
}
process.exit(count === 0 ? 0 : 1);
