import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { checkInventory } from './check-inventory.mjs';

// Diagnostic only. Never called by `check` or release acceptance. The CLI needs
// an explicitly prepared, installed, exact-candidate seed in a fresh owned root.
// A fresh clone/state/home/temp is used per command. Dependencies alone are shared
// with the disposable seed, not the installed PIDEX checkout. Not an OS sandbox.
export function diagnosticEnvironment(parent, source, suite) {
  const env = {};
  const allowed = new Set(['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'SYSTEMDRIVE', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'NUMBER_OF_PROCESSORS', 'OS']);
  for (const [key, value] of Object.entries(parent)) if (allowed.has(key.toUpperCase())) env[key] = value;
  return { ...env, HOME: path.join(suite, 'home'), USERPROFILE: path.join(suite, 'home'), APPDATA: path.join(suite, 'home', 'AppData', 'Roaming'), LOCALAPPDATA: path.join(suite, 'home', 'AppData', 'Local'),
    TEMP: path.join(suite, 'temp'), TMP: path.join(suite, 'temp'), TMPDIR: path.join(suite, 'temp'),
    PIDEX_ROOT: source, PIDEX_HOME_ROOT: source, PIDEX_STATE_DIR: path.join(suite, 'state'), RUNNING_PI_STATE_DIR: path.join(suite, 'state'),
    GIT_CONFIG_GLOBAL: path.join(suite, 'home', '.gitconfig'), GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', CI: '1' };
}

// Preserve the public synchronous APIs while keeping the worker independent
// of the campaign controller (and its command-execution capabilities).
export { dependencyDigest, seedDependencyDigest } from './dependency-digest.mjs';

function git(source, args) {
  const result = spawnSync('git', ['-c', 'core.longpaths=true', '-C', source, ...args], { encoding: 'utf8', timeout: 60000, shell: false });
  if (result.error || result.status !== 0) throw new Error(`Git identity/setup inspection failed: ${args[0]}`);
  return result.stdout.trim();
}
function assertIdentity(source, commit, tree) {
  if (git(source, ['rev-parse', 'HEAD']) !== commit || git(source, ['rev-parse', 'HEAD^{tree}']) !== tree || git(source, ['status', '--porcelain'])) throw new Error('Candidate identity/worktree changed');
}
function expand(command, source) {
  const [bin, ...args] = command.split(' ');
  return { bin: bin === 'node' ? process.execPath : bin, args: args.flatMap(arg => {
    if (!arg.includes('*')) return [arg];
    const directory = path.posix.dirname(arg); const name = path.posix.basename(arg);
    if (directory.includes('*') || name.split('*').length !== 2) throw new Error('Unsupported diagnostic glob');
    const [prefix, suffix] = name.split('*');
    const matches = readdirSync(path.join(source, directory)).filter(file => file.startsWith(prefix) && file.endsWith(suffix)).sort();
    if (!matches.length) throw new Error('Empty diagnostic glob');
    return matches.map(file => `${directory}/${file}`);
  }) };
}

export function diagnosticProcess({ bin, args, cwd, env, logRoot, timeoutMs }) {
  const stdout = openSync(path.join(logRoot, 'stdout.log'), 'wx');
  const stderr = openSync(path.join(logRoot, 'stderr.log'), 'wx');
  return new Promise(resolve => {
    let settled = false; let timer; let watchdog; let timedOut = false;
    const started = Date.now();
    const finish = result => {
      if (settled) return;
      settled = true; clearTimeout(timer); clearTimeout(watchdog);
      closeSync(stdout); closeSync(stderr);
      resolve({ pid: child.pid ?? null, exitObserved: false, ...result, elapsedMs: Date.now() - started });
    };
    const child = spawn(bin, args, { cwd, env, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', stdout, stderr] });
    child.once('error', error => finish({ kind: 'spawn-error', code: error.code }));
    child.once('close', (code, signal) => finish({ kind: timedOut ? 'timeout' : signal ? 'signal' : 'exit', code, signal, exitObserved: true }));
    timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32') {
        const killed = spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { timeout: 10000, stdio: 'ignore', shell: false });
        if (killed.error || killed.status !== 0) return finish({ kind: 'cleanup-uncertain', code: null });
      } else {
        try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') return finish({ kind: 'cleanup-uncertain', code: null }); }
      }
      watchdog = setTimeout(() => finish({ kind: 'cleanup-uncertain', code: null }), 5000);
    }, timeoutMs);
  });
}

// A complete hash only: partial output or an unobserved exit cannot become a
// baseline. The worker uses identical framing/guards to the synchronous API.
export async function boundedSeedDependencyDigest({ source, logRoot, timeoutMs }) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Dependency audit deadline exhausted');
  mkdirSync(logRoot); // Fresh receipts only; never overwrite/reuse an audit.
  const env = diagnosticEnvironment(process.env, source, logRoot);
  for (const directory of [env.HOME, env.APPDATA, env.LOCALAPPDATA, env.TEMP, env.PIDEX_STATE_DIR]) mkdirSync(directory, { recursive: true });
  const result = await diagnosticProcess({ bin: process.execPath,
    args: [fileURLToPath(new URL('./dependency-digest-worker.mjs', import.meta.url)), source],
    cwd: source, env, logRoot, timeoutMs });
  writeFileSync(path.join(logRoot, 'process.json'), JSON.stringify(result, null, 2));
  if (result.kind !== 'exit' || result.code !== 0 || !result.exitObserved) throw new Error(`Dependency audit did not complete: ${result.kind}`);
  const output = path.join(logRoot, 'stdout.log');
  if (lstatSync(output).size > 256 * 1024) throw new Error('Dependency audit receipt exceeds limit');
  return dependencyAuditReceipt(readFileSync(output, 'utf8'));
}

export function dependencyAuditReceipt(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 256 * 1024) throw new Error('Invalid dependency audit output');
  let receipt;
  try { receipt = JSON.parse(text.trim().split('\n').at(-1)); } catch { throw new Error('Missing terminal dependency audit receipt'); }
  const counts = receipt?.counts;
  if (receipt?.event !== 'complete' || receipt.scope !== 'seed-dependency-digest' || typeof receipt.digest !== 'string' || !/^[a-f0-9]{64}$/.test(receipt.digest) || counts?.operation !== 'complete' ||
      !['entries', 'files', 'directories', 'links', 'bytes'].every(key => Number.isSafeInteger(counts[key]) && counts[key] >= 0) ||
      counts.entries !== counts.files + counts.directories + counts.links) throw new Error('Invalid terminal dependency audit receipt');
  return receipt.digest;
}

// Hooks make failure/identity policy independently testable without cloning a
// real candidate or running its tests. No retry path exists.
export async function collectDiagnostics({ commands, prepare, execute, verify, record, budgetMs = 2700000, now = () => performance.now(), startedAt }) {
  const start = startedAt ?? now(); const results = [];
  if (!Number.isFinite(budgetMs) || budgetMs <= 0 || !Number.isFinite(start)) throw new Error('Invalid diagnostic budget');
  for (const command of commands) {
    if (now() - start >= budgetMs) return { status: 'HOLD', reason: 'campaign-timeout', results };
    try {
      const fixture = await prepare(command);
      const remaining = budgetMs - (now() - start);
      if (remaining <= 0) return { status: 'HOLD', reason: 'campaign-timeout', results };
      const result = await execute(command, fixture, remaining);
      results.push({ ...command, ...result }); await record(results);
      if (result.kind !== 'exit' || !Number.isInteger(result.code) || result.code < 0) return { status: 'HOLD', reason: result.kind, results };
      if (now() - start >= budgetMs) return { status: 'HOLD', reason: 'campaign-timeout', results };
      await verify(fixture);
      if (now() - start >= budgetMs) return { status: 'HOLD', reason: 'campaign-timeout', results };
      // Only an ordinary test exit permits the next independently cloned suite.
      // Failure remains in results and cannot produce a campaign PASS.
    } catch (error) { return { status: 'HOLD', reason: error.message, results }; }
  }
  if (now() - start >= budgetMs) return { status: 'HOLD', reason: 'campaign-timeout', results };
  return { status: results.some(result => result.code !== 0) ? 'FAIL' : 'PASS', results };
}

async function main() {
  if (process.platform !== 'win32') throw new Error('Native Windows CLI only; use unit tests on Linux');
  const [approval, ownedArgument, commit, tree, fromArg, toArg] = process.argv.slice(2);
  if (approval !== '--execute-approved-diagnostic' || !/^[a-f0-9]{40}$/.test(commit || '') || !/^[a-f0-9]{40}$/.test(tree || '') || process.argv.length !== 8) throw new Error('Explicit approval marker, owned root, commit, tree, from and to required');
  const owned = realpathSync(ownedArgument);
  const allowed = realpathSync(path.join(os.homedir(), 'pidex_tmp'));
  const relative = path.relative(allowed, owned);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Owned root must be below pidex_tmp');
  if (path.resolve(fileURLToPath(import.meta.url)) !== path.join(owned, 'source', 'scripts', 'package-manager', 'diagnose-checks.mjs')) throw new Error('Run the exact candidate diagnostic, not a host copy');
  return runDiagnosticCandidate({ owned, commit, tree, from: Number(fromArg), to: Number(toArg) });
}

export async function runDiagnosticCandidate({ owned, commit, tree, from, to, budgetMs = 2700000, scanTimeoutMs = 180000, now = () => performance.now() }) {
  const startedAt = now();
  if (!Number.isFinite(budgetMs) || budgetMs <= 0 || !Number.isFinite(scanTimeoutMs) || scanTimeoutMs <= 0) throw new Error('Invalid diagnostic budget');
  const remaining = () => budgetMs - (now() - startedAt);
  const ensureBudget = () => { if (remaining() <= 0) throw new Error('campaign-timeout'); };
  const seed = realpathSync(path.join(owned, 'source'));
  if (path.dirname(seed) !== owned) throw new Error('Seed source escapes owned root');
  const resultRoot = path.join(owned, 'diagnostic');
  mkdirSync(resultRoot); // EEXIST is intentional: never retry/reuse results.
  const persist = results => writeFileSync(path.join(resultRoot, 'progress.json'), JSON.stringify({ commit, tree, results }, null, 2));
  let result;
  try {
    ensureBudget(); assertIdentity(seed, commit, tree);
    if (!existsSync(path.join(seed, 'node_modules'))) throw new Error('Prepared seed dependencies required; diagnostic never installs');
    const inventory = checkInventory(JSON.parse(readFileSync(path.join(seed, 'package.json'), 'utf8')).scripts);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > inventory.length) throw new Error('Invalid explicit command range');
    ensureBudget();
    const dependencyHash = await boundedSeedDependencyDigest({ source: seed, logRoot: path.join(resultRoot, 'audit-baseline'), timeoutMs: Math.min(scanTimeoutMs, remaining()) });
    ensureBudget();
    result = await collectDiagnostics({ commands: inventory.slice(from - 1, to), record: persist, budgetMs, now, startedAt,
      prepare(command) {
        assertIdentity(seed, commit, tree);
        const suite = path.join(resultRoot, `suite-${String(command.ordinal).padStart(3, '0')}`);
        mkdirSync(suite); const source = path.join(suite, 'source');
        git(suite, ['clone', '--no-hardlinks', '--no-checkout', '--', seed, source]);
        git(source, ['config', 'core.autocrlf', 'true']);
        git(source, ['config', 'core.longpaths', 'true']);
        git(source, ['checkout', '--detach', commit]);
        assertIdentity(source, commit, tree);
        const env = diagnosticEnvironment(process.env, source, suite);
        for (const directory of [env.HOME, env.APPDATA, env.LOCALAPPDATA, env.TEMP, env.PIDEX_STATE_DIR]) mkdirSync(directory, { recursive: true });
        writeFileSync(env.GIT_CONFIG_GLOBAL, '[core]\n  autocrlf = true\n  longpaths = true\n');
        // Git's directory-only node_modules/ ignore does not cover a POSIX
        // symlink. Ignore only this runner-owned link, never other fixture edits.
        const excludes = path.join(source, '.git', 'info', 'exclude');
        mkdirSync(path.dirname(excludes), { recursive: true });
        writeFileSync(excludes, `${existsSync(excludes) ? readFileSync(excludes, 'utf8') : ''}\n/node_modules\n`);
        symlinkSync(path.join(seed, 'node_modules'), path.join(source, 'node_modules'), 'junction');
        return { source, suite, env };
      },
      execute(command, fixture, remainingMs) {
        const timeoutMs = Math.min(remainingMs, command.command.includes('rule-impact-evaluator.tdd.test.mjs') ? 1200000 : 180000);
        return diagnosticProcess({ ...expand(command.command, fixture.source), cwd: fixture.source, env: fixture.env, logRoot: fixture.suite, timeoutMs });
      },
      async verify(fixture) {
        assertIdentity(fixture.source, commit, tree); assertIdentity(seed, commit, tree);
        ensureBudget();
        const digest = await boundedSeedDependencyDigest({ source: seed, logRoot: path.join(fixture.suite, 'dependency-audit'), timeoutMs: Math.min(scanTimeoutMs, remaining()) });
        ensureBudget();
        if (digest !== dependencyHash) throw new Error('Shared seed dependencies changed; campaign evidence invalid');
      },
    });
  } catch (error) { result = { status: 'HOLD', reason: error.message, results: [] }; }
  const elapsedMs = now() - startedAt;
  if (result.status !== 'HOLD' && elapsedMs >= budgetMs) result = { ...result, status: 'HOLD', reason: 'campaign-timeout' };
  writeFileSync(path.join(resultRoot, 'result.json'), JSON.stringify({ diagnosticOnly: true, commit, tree, platform: process.platform, budgetMs, elapsedMs, dependencies: 'copied seed files, complete bounded digest checked after each suite; not an OS sandbox', ...result }, null, 2));
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // HOLD may include a child whose termination is uncertain; do not claim cleanup.
  main().then(result => process.exit(result.status === 'PASS' ? 0 : result.status === 'FAIL' ? 1 : 2))
    .catch(error => { console.error(error.message); process.exitCode = 2; });
}
