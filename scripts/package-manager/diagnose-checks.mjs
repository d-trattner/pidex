import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readlinkSync, realpathSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
    PIDEX_ROOT: source, PIDEX_STATE_DIR: path.join(suite, 'state'), RUNNING_PI_STATE_DIR: path.join(suite, 'state'),
    GIT_CONFIG_GLOBAL: path.join(suite, 'home', '.gitconfig'), GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', CI: '1' };
}

// Sharing seed dependencies is allowed only when they are self-contained,
// copied (not hardlinked to a package store), and unchanged after every suite.
export function dependencyDigest(root, { workspaceRoots = [] } = {}) {
  const roots = [root, ...workspaceRoots];
  for (const directory of roots) if (realpathSync(directory) !== path.resolve(directory)) throw new Error('Dependency/workspace root must not be a link');
  const contained = target => roots.some(directory => {
    const relative = path.relative(directory, target);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  });
  const hash = createHash('sha256');
  const walk = directory => {
    for (const name of readdirSync(directory).sort()) {
      const file = path.join(directory, name); const stat = lstatSync(file);
      const relative = path.relative(root, file); hash.update(`${relative.length}:${relative}`);
      if (stat.isSymbolicLink()) {
        if (!contained(realpathSync(file))) throw new Error('Dependency link escapes seed');
        hash.update(`link:${readlinkSync(file)}`);
      } else if (stat.isDirectory()) { hash.update('directory'); walk(file); }
      else if (stat.isFile() && stat.nlink === 1) { hash.update(`file:${stat.size}:`); hash.update(readFileSync(file)); }
      else throw new Error('Dependencies must contain only copied files and internal links');
    }
  };
  // Scan each complete allowed tree without following symlinks: workspace
  // links back into node_modules cannot recurse, and workspace mutations are
  // part of the digest rather than being silently trusted.
  for (const directory of roots) walk(directory);
  return hash.digest('hex');
}

export function seedDependencyDigest(source) {
  const dashboard = path.join(source, 'dashboard');
  const workspaceRoots = [];
  if (existsSync(path.join(dashboard, 'package.json'))) {
    if (JSON.parse(readFileSync(path.join(dashboard, 'package.json'), 'utf8')).name !== '@pidex/dashboard') throw new Error('Unexpected dashboard workspace identity');
    workspaceRoots.push(dashboard);
  }
  return dependencyDigest(path.join(source, 'node_modules'), { workspaceRoots });
}

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
      resolve({ ...result, elapsedMs: Date.now() - started });
    };
    const child = spawn(bin, args, { cwd, env, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', stdout, stderr] });
    child.once('error', error => finish({ kind: 'spawn-error', code: error.code }));
    child.once('close', (code, signal) => finish({ kind: timedOut ? 'timeout' : signal ? 'signal' : 'exit', code, signal }));
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

// Hooks make failure/identity policy independently testable without cloning a
// real candidate or running its tests. No retry path exists.
export async function collectDiagnostics({ commands, prepare, execute, verify, record, budgetMs = 2700000, now = Date.now }) {
  const start = now(); const results = [];
  for (const command of commands) {
    if (now() - start >= budgetMs) return { status: 'HOLD', reason: 'campaign-timeout', results };
    try {
      const fixture = await prepare(command);
      const remaining = budgetMs - (now() - start);
      if (remaining <= 0) return { status: 'HOLD', reason: 'campaign-timeout', results };
      const result = await execute(command, fixture, remaining);
      results.push({ ...command, ...result }); await record(results);
      if (result.kind !== 'exit' || !Number.isInteger(result.code) || result.code < 0) return { status: 'HOLD', reason: result.kind, results };
      await verify(fixture);
      // Only an ordinary test exit permits the next independently cloned suite.
      // Failure remains in results and cannot produce a campaign PASS.
    } catch (error) { return { status: 'HOLD', reason: error.message, results }; }
  }
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

export async function runDiagnosticCandidate({ owned, commit, tree, from, to }) {
  const seed = realpathSync(path.join(owned, 'source'));
  if (path.dirname(seed) !== owned) throw new Error('Seed source escapes owned root');
  assertIdentity(seed, commit, tree);
  if (!existsSync(path.join(seed, 'node_modules'))) throw new Error('Prepared seed dependencies required; diagnostic never installs');
  const dependencyHash = seedDependencyDigest(seed);
  const inventory = checkInventory(JSON.parse(readFileSync(path.join(seed, 'package.json'), 'utf8')).scripts);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > inventory.length) throw new Error('Invalid explicit command range');
  const resultRoot = path.join(owned, 'diagnostic');
  mkdirSync(resultRoot); // EEXIST is intentional: never retry/reuse results.
  const persist = results => writeFileSync(path.join(resultRoot, 'progress.json'), JSON.stringify({ commit, tree, results }, null, 2));
  const result = await collectDiagnostics({ commands: inventory.slice(from - 1, to), record: persist,
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
    execute(command, fixture, remaining) {
      const timeoutMs = Math.min(remaining, command.command.includes('rule-impact-evaluator.tdd.test.mjs') ? 1200000 : 180000);
      return diagnosticProcess({ ...expand(command.command, fixture.source), cwd: fixture.source, env: fixture.env, logRoot: fixture.suite, timeoutMs });
    },
    verify(fixture) {
      assertIdentity(fixture.source, commit, tree); assertIdentity(seed, commit, tree);
      if (seedDependencyDigest(seed) !== dependencyHash) throw new Error('Shared seed dependencies changed; campaign evidence invalid');
    },
  });
  writeFileSync(path.join(resultRoot, 'result.json'), JSON.stringify({ diagnosticOnly: true, commit, tree, platform: process.platform, dependencies: 'copied seed files, digest checked after each suite; not an OS sandbox', ...result }, null, 2));
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // HOLD may include a child whose termination is uncertain; do not claim cleanup.
  main().then(result => process.exit(result.status === 'PASS' ? 0 : result.status === 'FAIL' ? 1 : 2))
    .catch(error => { console.error(error.message); process.exitCode = 2; });
}
