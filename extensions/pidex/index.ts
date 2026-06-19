import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createGzip, gunzipSync } from "node:zlib";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type AgentFrontmatter = {
	name?: string;
	description?: string;
	model?: string;
	tools?: string;
	maxTurns?: string | number;
};

type JsonEvent = Record<string, any>;

type RpResult = {
	agent: string;
	provider?: string;
	model?: string;
	modelRequested?: string;
	effort?: string;
	exitCode: number;
	stderr: string;
	finalText: string;
	fallbackFrom?: string;
	logFile?: string;
	runDir?: string;
	sessionDir?: string;
	stdoutEventCount?: number;
	skippedLargeEventCount?: number;
	toolCount?: number;
	turnCount?: number;
	maxTurns?: number;
	durationMs?: number;
	inputChars?: number;
	outputChars?: number;
	inputTokensEstimate?: number;
	outputTokensEstimate?: number;
	cacheReadTokens?: number;
	cacheWriteTokens?: number;
	costUsdEstimate?: number;
	metricsFile?: string;
	setupError?: boolean;
	timedOut?: boolean;
	aborted?: boolean;
	turnLimitHit?: boolean;
	warnings?: string[];
};

type ParallelSecondaryRoute = {
	provider?: string;
	model?: string;
	effort?: string;
	label?: string;
	timeout_seconds?: number;
};

type AgentRoute = {
	provider?: string;
	model?: string;
	effort?: string;
	timeout_seconds?: number;
	notes?: string;
	condition?: string;
	parallel_secondary?: ParallelSecondaryRoute[];
	permission_mode?: "default" | "auto" | "acceptEdits" | "dontAsk" | "plan" | "bypassPermissions";
	tools?: string[];
	allowed_tools?: string[];
	disallowed_tools?: string[];
	add_dirs?: string[];
	dangerously_skip_permissions?: boolean;
};

type RoutingConfig = {
	defaults?: AgentRoute;
	agents?: Record<string, AgentRoute>;
	fallback?: {
		on_error?: string;
		retries?: number;
		reason_prefix?: string;
	};
};

type SandboxProfile = {
	enabled?: boolean;
	image?: string;
	network_default?: "none" | "default";
	memory?: string;
	cpus?: number;
	pids_limit?: number;
	timeout_seconds?: number;
	preserve_on_failure?: boolean;
	container_user_mode?: "image-default" | string;
	container_user_enforced?: boolean;
};

type SandboxConfig = {
	enabled?: boolean;
	default_mode?: "off" | "hardened-pipeline" | string;
	profiles?: Record<string, SandboxProfile>;
};

type SandboxState = {
	mode: "off" | "hardened-pipeline";
	enabled: boolean;
	reason: string;
	configPath: string;
	localConfigPath: string;
	profile?: SandboxProfile;
};

type SandboxRuntimeContext = {
	mode: "hardened-pipeline";
	runId: string;
	hostProjectRoot: string;
	sandboxWorkspace: string;
	allowedWriteRoot: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BOOTSTRAP_ROOT = path.resolve(__dirname, "../..");
const CANONICAL_HOME_ROOT = process.env.PIDEX_HOME_ROOT ?? path.join(os.homedir(), "pidex");

function readPackageVersion(root: string): string | undefined {
	try {
		const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
		return typeof pkg?.version === "string" ? pkg.version : undefined;
	} catch {
		return undefined;
	}
}

const BOOTSTRAP_PACKAGE_VERSION = readPackageVersion(BOOTSTRAP_ROOT);

function isPidexRuntimeRoot(root: string): boolean {
	try {
		const pkgPath = path.join(root, "package.json");
		if (!fs.existsSync(pkgPath)) return false;
		const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
		if (pkg?.name !== "@d-trattner/pidex" && pkg?.name !== "pidex") return false;
		return fs.existsSync(path.join(root, "agents"))
			&& fs.existsSync(path.join(root, "config", "agents.json"))
			&& fs.existsSync(path.join(root, "scripts"));
	} catch {
		return false;
	}
}

function resolvePidexRuntimeRoot(): string {
	if (process.env.PIDEX_ROOT && isPidexRuntimeRoot(process.env.PIDEX_ROOT)) return path.resolve(process.env.PIDEX_ROOT);
	if (isPidexRuntimeRoot(CANONICAL_HOME_ROOT)) return path.resolve(CANONICAL_HOME_ROOT);
	return BOOTSTRAP_ROOT;
}

const PACKAGE_ROOT = resolvePidexRuntimeRoot();
const AGENTS_DIR = path.join(PACKAGE_ROOT, "agents");
const CONFIG_PATH = process.env.PIDEX_CONFIG_FILE ?? path.join(PACKAGE_ROOT, "config", "agents.json");
const SANDBOX_CONFIG_PATH = process.env.PIDEX_SANDBOX_CONFIG_FILE ?? path.join(PACKAGE_ROOT, "config", "sandbox.json");
const SANDBOX_LOCAL_CONFIG_PATH = process.env.PIDEX_SANDBOX_LOCAL_CONFIG_FILE ?? path.join(PACKAGE_ROOT, "config", "sandbox.local.json");
const DELEGATE_DIR = path.join(PACKAGE_ROOT, "scripts", "delegate");
const SKILL_PATH = path.join(PACKAGE_ROOT, "skills", "pd", "SKILL.md");
const STATE_DIR = process.env.PIDEX_STATE_DIR ?? path.join(PACKAGE_ROOT, "state");
const RUNS_DIR = path.join(STATE_DIR, "runs");
const METRICS_DIR = path.join(STATE_DIR, "metrics");
const PRICING_PATH = path.join(PACKAGE_ROOT, "config", "pricing.json");
const PROVIDER_LIMITS_LATEST_PATH = path.join(STATE_DIR, "provider-limits", "latest.json");
const CHECK_AUTH_SCRIPT = path.join(DELEGATE_DIR, "check-auth.sh");
const PROJECT_PIPELINE_MODE_SCRIPT = process.env.PIDEX_PROJECT_PIPELINE_MODE_SCRIPT ?? path.join(PACKAGE_ROOT, "modules", "pidex", "project-pipeline", "scripts", "project-pipeline", "mode-resolver.mjs");
const PROJECT_PIPELINE_RUN_FLOW_SCRIPT = process.env.PIDEX_PROJECT_PIPELINE_RUN_FLOW_SCRIPT ?? path.join(PACKAGE_ROOT, "modules", "pidex", "project-pipeline", "scripts", "project-pipeline", "run-flow.mjs");
const PROJECT_PIPELINE_STATUS_SCRIPT = process.env.PIDEX_PROJECT_PIPELINE_STATUS_SCRIPT ?? path.join(PACKAGE_ROOT, "modules", "pidex", "project-pipeline", "scripts", "project-pipeline", "status.mjs");
const PROJECT_PIPELINE_LIFECYCLE_SCRIPT = process.env.PIDEX_PROJECT_PIPELINE_LIFECYCLE_SCRIPT ?? path.join(PACKAGE_ROOT, "modules", "pidex", "project-pipeline", "scripts", "project-pipeline", "lifecycle.mjs");
const PIDEX_CHILD_ENV = "PIDEX_CHILD";
const PIDEX_SANDBOX_CONTEXT_ENV = "PIDEX_SANDBOX_CONTEXT";
const PIDEX_PROJECT_BOUNDARY_ENV = "PIDEX_PROJECT_BOUNDARY_CONTEXT";

const MAX_STDERR_CHARS = 64 * 1024;
const MAX_STDERR_DETAILS_CHARS = 8 * 1024;
const MAX_JSON_PARSE_LINE_BYTES = 1024 * 1024;
const MAX_LINE_BUFFER_CHARS = 4 * 1024 * 1024;
const MAX_TOOL_DETAILS_CHARS = 64 * 1024;
const MAX_TOOL_CONTENT_CHARS = 16 * 1024;
const MAX_AGENT_FINAL_CHARS = 2000;
const MAX_UPDATE_CHARS = 4000;
const UPDATE_INTERVAL_MS = 750;
const FINAL_STOP_GRACE_MS = 1000;
const FINAL_STOP_HARD_KILL_MS = 3000;

const BUILTIN_TOOL_NAMES = new Set(["read", "bash", "edit", "write", "grep", "find", "ls"]);
const TOOL_HEAVY_AGENTS = new Set([
	"pidex-analyst",
	"pidex-architect",
	"pidex-planner",
	"pidex-implementer",
	"pidex-qa",
	"pidex-security",
	"pidex-devops",
	"pidex-wiki-hygienist",
	"pidex-pi",
]);
const TOOL_FORWARDING_AGENTS = new Set(["pidex-implementer", "pidex-security", "pidex-qa"]);
const SANDBOXED_AGENT_NAMES = new Set(["pidex-implementer", "pidex-security", "pidex-qa"]);
const TOOL_ALIASES: Record<string, string | undefined> = {
	glob: "find",
	grep: "grep",
	find: "find",
	ls: "ls",
	read: "read",
	write: "write",
	edit: "edit",
	bash: "bash",
	todoread: "read",
	todo_read: "read",
	todowrite: "write",
	todo_write: "write",
	websearch: "web_search",
	web_search: "web_search",
	// User-question tools from running-claude do not exist in Pi direct mode.
	// Agents must emit a ROUTING gate instead of blocking inside a subprocess.
	ask: undefined,
	asktool: undefined,
	ask_tool: undefined,
	askagent: undefined,
	ask_agent: undefined,
	askuserquestion: undefined,
	ask_user_question: undefined,
	askuser: undefined,
	ask_user: undefined,
	askquestion: undefined,
	ask_question: undefined,
};

function normalizeToolName(raw: string): string | undefined {
	const trimmed = raw.trim();
	if (!trimmed) return undefined;
	const lower = trimmed.toLowerCase();
	if (lower.startsWith("mcp__")) return lower;
	const key = lower.replace(/[^a-z0-9_]/g, "");
	if (!key) return undefined;
	const mapped = Object.prototype.hasOwnProperty.call(TOOL_ALIASES, key) ? TOOL_ALIASES[key] : key;
	if (!mapped) return undefined;
	if (BUILTIN_TOOL_NAMES.has(mapped)) return mapped;
	if (mapped.startsWith("mcp__") || mapped.includes("__")) return mapped;
	if (mapped === "web_search" || mapped === "websearch") return mapped;
	return undefined;
}

function uniqueTools(tools: Array<string | undefined>): string[] | undefined {
	const unique = Array.from(new Set(tools.filter((tool): tool is string => Boolean(tool))));
	return unique.length > 0 ? unique : undefined;
}

function parseTools(tools?: string): string[] | undefined {
	if (!tools) return undefined;
	return uniqueTools(tools.split(/[,\n]/).map(normalizeToolName));
}

function normalizeToolList(tools?: string[]): string[] | undefined {
	if (!tools) return undefined;
	return uniqueTools(tools.map(normalizeToolName));
}

function hasCustomTools(tools?: string[]): boolean {
	return Boolean(tools?.some((tool) => !BUILTIN_TOOL_NAMES.has(tool)));
}

export function shouldDisableChildExtensions(tools?: string[], sandboxContext?: SandboxRuntimeContext): boolean {
	if (sandboxContext?.mode === "hardened-pipeline") return false;
	return !hasCustomTools(tools);
}

function parsePositiveInt(value: string | number | undefined): number | undefined {
	if (value === undefined) return undefined;
	const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function loadRoutingConfig(): RoutingConfig {
	try {
		if (!fs.existsSync(CONFIG_PATH)) return { defaults: { provider: "pi" }, agents: {}, fallback: { on_error: "pi" } };
		return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
	} catch (error: any) {
		throw new Error(`Failed to read pidex config at ${CONFIG_PATH}: ${error?.message ?? error}`);
	}
}

function resolveRoute(config: RoutingConfig, agentName: string): AgentRoute {
	return {
		...(config.defaults ?? {}),
		...(config.agents?.[agentName] ?? {}),
	};
}

function readJsonObject<T extends Record<string, any>>(file: string, fallback: T): T {
	try {
		if (!fs.existsSync(file)) return fallback;
		return JSON.parse(fs.readFileSync(file, "utf8"));
	} catch {
		return fallback;
	}
}

function deepMerge<T extends Record<string, any>>(base: T, override: Record<string, any>): T {
	const out: Record<string, any> = { ...base };
	for (const [key, value] of Object.entries(override || {})) {
		if (value && typeof value === "object" && !Array.isArray(value) && out[key] && typeof out[key] === "object" && !Array.isArray(out[key])) out[key] = deepMerge(out[key], value);
		else out[key] = value;
	}
	return out as T;
}

function loadSandboxConfig(): SandboxConfig {
	const base = readJsonObject<SandboxConfig>(SANDBOX_CONFIG_PATH, { enabled: false, default_mode: "off", profiles: {} });
	const local = readJsonObject<Partial<SandboxConfig>>(SANDBOX_LOCAL_CONFIG_PATH, {});
	return deepMerge(base, local);
}

function resolveSandboxState(): SandboxState {
	const config = loadSandboxConfig();
	const mode = config.default_mode === "hardened-pipeline" ? "hardened-pipeline" : "off";
	const profile = config.profiles?.[mode];
	const enabled = config.enabled === true && mode === "hardened-pipeline" && profile?.enabled === true;
	return {
		mode: enabled ? "hardened-pipeline" : "off",
		enabled,
		reason: enabled ? "config-enabled" : `disabled-or-off(enabled=${config.enabled === true}, default_mode=${config.default_mode ?? "off"}, profile_enabled=${profile?.enabled === true})`,
		configPath: SANDBOX_CONFIG_PATH,
		localConfigPath: SANDBOX_LOCAL_CONFIG_PATH,
		profile,
	};
}

type ProjectPipelineModeResult = {
	ok: boolean;
	mode?: "host-direct" | "hardened-pipeline" | "project-pipeline";
	source?: string;
	decision_required?: boolean;
	reason?: string;
	choices?: string[];
	no_fallback?: boolean;
};

export function runProjectPipelineModeResolver(projectRoot: string, mode?: string): ProjectPipelineModeResult {
	if (!fs.existsSync(PROJECT_PIPELINE_MODE_SCRIPT)) return { ok: false, decision_required: true, reason: `project-pipeline mode resolver missing at ${PROJECT_PIPELINE_MODE_SCRIPT}; run /pidex-init-home or update the canonical PIDEX runtime before starting /pd` };
	const args = [PROJECT_PIPELINE_MODE_SCRIPT, "--pidex-root", PACKAGE_ROOT, "--project-root", projectRoot, "--json"];
	if (mode) args.push("--mode", mode, "--source", "interactive");
	const proc = spawnSync(process.execPath, args, { cwd: PACKAGE_ROOT, encoding: "utf8", timeout: 10_000 });
	try {
		const parsed = JSON.parse(proc.stdout || "{}");
		return parsed;
	} catch {
		return { ok: false, decision_required: true, reason: `project-pipeline mode resolver failed exit=${proc.status}: ${clipEnd(`${proc.stdout || ""}\n${proc.stderr || ""}`.trim(), 1000)}` };
	}
}

async function resolveProjectPipelineModeForCommand(ctx: any): Promise<ProjectPipelineModeResult> {
	const projectRoot = path.resolve(ctx.cwd ?? process.cwd());
	const current = runProjectPipelineModeResolver(projectRoot);
	if (!current.decision_required) return current;
	if (!ctx.hasUI) return current;
	const choice = await ctx.ui.select("PIDEX pipeline mode for this project? This is saved per project. Project Pipeline uses a persistent Docker Project Sandbox and does not fall back automatically to host-direct.", ["host-direct", "hardened-pipeline", "project-pipeline", "Cancel"]);
	if (choice === "Cancel") return { ok: false, decision_required: true, reason: "user cancelled pipeline mode selection" };
	return runProjectPipelineModeResolver(projectRoot, choice);
}

export function projectPipelineModeEvidenceLine(result: ProjectPipelineModeResult): string {
	if (!result.ok && result.decision_required) return `project_pipeline_mode: decision-required; reason: ${result.reason ?? "missing saved mode"}`;
	return `project_pipeline_mode: ${result.mode ?? "host-direct"}; source: ${result.source ?? "unknown"}; no_fallback: ${result.no_fallback === true}`;
}

export function projectPipelineModeInstructionLine(result: ProjectPipelineModeResult): string {
	return result.mode === "project-pipeline"
		? "Project Pipeline mode is explicit and fail-closed: do not fall back to host-direct or hardened-pipeline automatically. Use the project-pipeline.run-flow facade for end-to-end create/open, source import/clone, selected credential bootstrap, child Pi execution in the container, and archive sync. Host archive sync is limited to agents.output/** and wiki/**; do not mirror source back to the host."
		: "Project Pipeline mode is not active for this project; existing host-direct/hardened-pipeline behavior remains unchanged.";
}

type ProjectPipelineRunFlowRequest = {
	projectRoot: string;
	task: string;
	copyPiCredentials?: boolean;
	acknowledgeTrustedPersistentContainer?: boolean;
};

type ProjectPipelineRunFlowResult = {
	ok: boolean;
	exitCode?: number | null;
	projectId?: string;
	stdout?: string;
	stderr?: string;
	error?: string;
	no_fallback: true;
};

function slugForProjectPipelineId(projectRoot: string): string {
	const base = path.basename(path.resolve(projectRoot)).toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "project";
	const hash = createHash("sha256").update(path.resolve(projectRoot)).digest("hex").slice(0, 12);
	return `pp-${base}-${hash}`.slice(0, 80);
}

export function buildProjectPipelineRunFlowArgs(request: ProjectPipelineRunFlowRequest): { script: string; projectId: string; args: string[] } {
	const projectRoot = path.resolve(request.projectRoot || process.cwd());
	const task = String(request.task || "").trim();
	if (!task) throw new Error("Project Pipeline run-flow requires an initial task; no host-direct fallback is allowed.");
	if (!fs.existsSync(PROJECT_PIPELINE_RUN_FLOW_SCRIPT)) throw new Error(`project-pipeline run-flow helper missing at ${PROJECT_PIPELINE_RUN_FLOW_SCRIPT}; run /pidex-init-home or update the canonical PIDEX runtime before starting /pd`);
	const projectId = slugForProjectPipelineId(projectRoot);
	const args = [
		PROJECT_PIPELINE_RUN_FLOW_SCRIPT,
		"--pidex-root", PACKAGE_ROOT,
		"--project-id", projectId,
		"--source", projectRoot,
		"--agent", "pidex-planner",
		"--task", [
			"Project Pipeline /pd entrypoint. You are running inside the persistent Project Sandbox at /workspace.",
			"Start the PIDEX planning/preflight workflow for the user's task. Do not run host-direct or hardened-pipeline fallback.",
			"Write your full planning/preflight artifact under agents.output/plans/** and finish with a ROUTING block whose context_file points to that artifact.",
			`Initial user task: ${task}`,
		].join("\n\n"),
		"--json",
	];
	if (request.copyPiCredentials) {
		if (!request.acknowledgeTrustedPersistentContainer) throw new Error("copying Pi credentials into Project Pipeline requires trusted persistent container acknowledgement");
		args.splice(args.length - 1, 0,
			"--pi-auth", path.join(os.homedir(), ".pi", "agent", "auth.json"),
			"--pi-settings", path.join(os.homedir(), ".pi", "agent", "settings.json"),
			"--acknowledge-trusted-persistent-container");
	}
	return { script: PROJECT_PIPELINE_RUN_FLOW_SCRIPT, projectId, args };
}

export function runProjectPipelineRunFlow(request: ProjectPipelineRunFlowRequest): ProjectPipelineRunFlowResult {
	let built: { projectId: string; args: string[] };
	try {
		built = buildProjectPipelineRunFlowArgs(request);
	} catch (error: any) {
		return { ok: false, error: error?.message ?? String(error), no_fallback: true };
	}
	const proc = spawnSync(process.execPath, built.args, { cwd: PACKAGE_ROOT, encoding: "utf8", timeout: 30 * 60_000, maxBuffer: 20 * 1024 * 1024 });
	return { ok: proc.status === 0, exitCode: proc.status, projectId: built.projectId, stdout: proc.stdout || "", stderr: proc.stderr || "", error: proc.status === 0 ? undefined : clipEnd(`${proc.stdout || ""}\n${proc.stderr || ""}`.trim(), 4000), no_fallback: true };
}

export function summarizeProjectPipelineRunFlowResult(result: ProjectPipelineRunFlowResult): string {
	const fallback = `Project Pipeline run-flow complete for ${result.projectId ?? "unknown-project"}; no_fallback=${result.no_fallback === true}.`;
	if (!result.stdout) return fallback;
	try {
		const parsed = JSON.parse(result.stdout);
		const projectId = String(parsed?.lifecycle?.record?.project_id || result.projectId || "unknown-project");
		const contextFile = parsed?.run?.context_file || parsed?.run?.routing?.context_file || parsed?.archive_context_file;
		const archiveStatus = parsed?.run?.archive_sync_status || (parsed?.run?.archiveSyncReport?.ok === true ? "complete" : undefined);
		const noFallback = parsed?.no_fallback === true || result.no_fallback === true;
		return [
			`Project Pipeline run-flow complete for ${projectId}.`,
			contextFile ? `context_file: ${contextFile}` : undefined,
			archiveStatus ? `archive_sync: ${archiveStatus}` : undefined,
			`no_fallback: ${noFallback}`,
		].filter(Boolean).join(" ");
	} catch {
		return fallback;
	}
}

type PdProjectCommand =
	| { command: "help" }
	| { command: "status"; projectId?: string }
	| { command: "open"; projectId: string }
	| { command: "remove"; projectId: string; confirm: string };

function readPdProjectFlagValue(parts: string[], index: number, flag: string): { value: string; nextIndex: number } {
	const value = parts[index + 1];
	if (!value || value.startsWith("--")) throw new Error(`pdproject ${flag} requires a value`);
	return { value, nextIndex: index + 1 };
}

export function parsePdProjectArgs(argsLine?: string): PdProjectCommand {
	const parts = String(argsLine || "").trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0 || parts[0] === "help" || parts[0] === "--help" || parts[0] === "-h") return { command: "help" };
	const command = parts.shift();
	if (command === "status") {
		let projectId: string | undefined;
		for (let i = 0; i < parts.length; i += 1) {
			if (parts[i] === "--project-id") {
				const read = readPdProjectFlagValue(parts, i, "--project-id");
				projectId = read.value;
				i = read.nextIndex;
			} else if (!projectId && !parts[i].startsWith("--")) projectId = parts[i];
			else throw new Error(`unknown pdproject status argument: ${parts[i]}`);
		}
		return { command: "status", projectId };
	}
	if (command === "open") {
		let projectId = "";
		for (let i = 0; i < parts.length; i += 1) {
			if (parts[i] === "--project-id") {
				const read = readPdProjectFlagValue(parts, i, "--project-id");
				projectId = read.value;
				i = read.nextIndex;
			} else if (!projectId && !parts[i].startsWith("--")) projectId = parts[i];
			else throw new Error(`unknown pdproject open argument: ${parts[i]}`);
		}
		if (!projectId) throw new Error("pdproject open requires a project id");
		return { command: "open", projectId };
	}
	if (command === "remove") {
		let projectId = "";
		let confirm = "";
		for (let i = 0; i < parts.length; i += 1) {
			if (parts[i] === "--project-id") {
				const read = readPdProjectFlagValue(parts, i, "--project-id");
				projectId = read.value;
				i = read.nextIndex;
			} else if (parts[i] === "--confirm") {
				const read = readPdProjectFlagValue(parts, i, "--confirm");
				confirm = read.value;
				i = read.nextIndex;
			} else if (!projectId && !parts[i].startsWith("--")) projectId = parts[i];
			else throw new Error(`unknown pdproject remove argument: ${parts[i]}`);
		}
		if (!projectId) throw new Error("pdproject remove requires a project id");
		if (confirm !== projectId) throw new Error(`pdproject remove requires --confirm ${projectId}`);
		return { command: "remove", projectId, confirm };
	}
	throw new Error(`unknown pdproject command: ${command}`);
}

export function pdProjectUsage(): string {
	return [
		"Usage: /pdproject status [project-id|--project-id ID]",
		"       /pdproject open <project-id>",
		"       /pdproject remove <project-id> --confirm <project-id>",
		"",
		"Project Pipeline sandboxes are persistent. Removal is explicit and irreversible for the Docker container/volumes.",
	].join("\n");
}

function summarizeProjectRecords(projects: any[]): string {
	if (!projects.length) return "Project Pipeline: no registered local Project Sandboxes.";
	return projects.map((project: any) => {
		const runs = Array.isArray(project.runs) ? project.runs.length : 0;
		const archive = project.archive?.path ? ` archive=${project.archive.path}` : "";
		const dockerHealth = project.docker_health?.container
			? ` docker=${project.docker_health.container.exists ? project.docker_health.container.status : "missing"}`
			: "";
		return `${project.project_id}: status=${project.status ?? "unknown"}${dockerHealth} source=${project.source?.kind ?? "unknown"} credentials(pi=${project.credentials?.pi ?? "unknown"}, git=${project.credentials?.git ?? "unknown"}) runs=${runs}${archive}`;
	}).join("\n");
}

export function runPdProjectCommand(parsed: PdProjectCommand): { ok: boolean; summary: string; no_fallback?: true } {
	if (parsed.command === "help") return { ok: true, summary: pdProjectUsage() };
	if (parsed.command === "status") {
		if (!fs.existsSync(PROJECT_PIPELINE_STATUS_SCRIPT)) return { ok: false, summary: `project-pipeline status helper missing at ${PROJECT_PIPELINE_STATUS_SCRIPT}` };
		const args = [PROJECT_PIPELINE_STATUS_SCRIPT, "--pidex-root", PACKAGE_ROOT, "--json"];
		if (parsed.projectId) args.push("--project-id", parsed.projectId);
		const proc = spawnSync(process.execPath, args, { cwd: PACKAGE_ROOT, encoding: "utf8", timeout: 30_000, maxBuffer: 5 * 1024 * 1024 });
		try {
			const json = JSON.parse(proc.stdout || "{}");
			return { ok: proc.status === 0 && json.ok !== false, summary: summarizeProjectRecords(json.projects || []) };
		} catch {
			return { ok: false, summary: `project-pipeline status failed exit=${proc.status}: ${clipEnd(`${proc.stdout || ""}\n${proc.stderr || ""}`.trim(), 1200)}` };
		}
	}
	if (!fs.existsSync(PROJECT_PIPELINE_LIFECYCLE_SCRIPT)) return { ok: false, summary: `project-pipeline lifecycle helper missing at ${PROJECT_PIPELINE_LIFECYCLE_SCRIPT}` };
	const lifecycleArgs = parsed.command === "open"
		? [PROJECT_PIPELINE_LIFECYCLE_SCRIPT, "open", "--pidex-root", PACKAGE_ROOT, "--project-id", parsed.projectId, "--json"]
		: [PROJECT_PIPELINE_LIFECYCLE_SCRIPT, "remove", "--pidex-root", PACKAGE_ROOT, "--project-id", parsed.projectId, "--confirm", parsed.confirm, "--json"];
	const proc = spawnSync(process.execPath, lifecycleArgs, { cwd: PACKAGE_ROOT, encoding: "utf8", timeout: 120_000, maxBuffer: 5 * 1024 * 1024 });
	try {
		const json = JSON.parse(proc.stdout || "{}");
		if (parsed.command === "open") return { ok: proc.status === 0 && json.ok !== false, summary: json.ok === true ? `Project Pipeline sandbox opened: ${json.record?.project_id ?? parsed.projectId}` : `Project Pipeline open failed: ${json.reason ?? JSON.stringify(json)}` };
		return { ok: proc.status === 0 && json.ok !== false, summary: json.ok === true ? `Project Pipeline sandbox removed: ${json.project_id}` : `Project Pipeline remove failed: ${JSON.stringify(json)}` };
	} catch {
		return { ok: false, summary: `project-pipeline ${parsed.command} failed exit=${proc.status}: ${clipEnd(`${proc.stdout || ""}\n${proc.stderr || ""}`.trim(), 1200)}` };
	}
}

async function maybeCopyProjectPipelinePiCredentials(ctx: any): Promise<boolean | undefined> {
	if (!ctx.hasUI) return process.env.PIDEX_PROJECT_PIPELINE_COPY_PI_CREDENTIALS === "1" ? true : undefined;
	const choice = await ctx.ui.select("Project Pipeline runs Pi inside the persistent Project Sandbox. Copy host Pi auth/settings into this trusted per-project secrets volume?", ["Copy Pi credentials", "Skip credentials", "Cancel"]);
	if (choice === "Cancel") return undefined;
	return choice === "Copy Pi credentials";
}

export function shouldStartProjectPipelineRunFlow(result: ProjectPipelineModeResult): boolean {
	return result.ok === true && result.mode === "project-pipeline";
}

async function startProjectPipelineRunFlow(ctx: any, task: string | undefined): Promise<void> {
	const initialTask = task?.trim();
	if (!initialTask) {
		await ctx.ui.notify("Project Pipeline mode is fail-closed and the direct run-flow bridge requires an initial task. Re-run /pd with a task description; no host-direct fallback was used.", "warning");
		return;
	}
	const copyPiCredentials = await maybeCopyProjectPipelinePiCredentials(ctx);
	if (copyPiCredentials === undefined) {
		await ctx.ui.notify("Project Pipeline run-flow cancelled before credential decision; no fallback was used.", "warning");
		return;
	}
	await ctx.ui.notify("Starting Project Pipeline run-flow in persistent Docker Project Sandbox", "info");
	const result = runProjectPipelineRunFlow({ projectRoot: ctx.cwd ?? process.cwd(), task: initialTask, copyPiCredentials, acknowledgeTrustedPersistentContainer: copyPiCredentials });
	if (!result.ok) {
		await ctx.ui.notify(`Project Pipeline run-flow failed closed (no fallback). ${result.error ?? `exit=${result.exitCode}`}`, "error");
		return;
	}
	await ctx.ui.notify(summarizeProjectPipelineRunFlowResult(result), "info");
}

function sandboxEvidenceLine(): string {
	const state = resolveSandboxState();
	return state.enabled
		? `sandbox_mode: hardened-pipeline; sandbox_reason: ${state.reason}; image: ${state.profile?.image ?? "node:22-slim"}`
		: `sandbox_mode: off; sandbox_reason: ${state.reason}`;
}

function probeSandboxAvailability(): { ok: boolean; summary: string } {
	const script = path.join(PACKAGE_ROOT, "modules", "pidex", "sandbox-runtime", "scripts", "sandbox", "probe.mjs");
	if (!fs.existsSync(script)) return { ok: false, summary: `sandbox runtime missing at ${script}. Sandbox requires the canonical ~/pidex runtime checkout with initiative 021 files; run /pidex-init-home or update ~/pidex.` };
	const proc = spawnSync(process.execPath, [script, "--json"], { cwd: PACKAGE_ROOT, encoding: "utf8", timeout: 180_000 });
	const raw = `${proc.stdout || ""}\n${proc.stderr || ""}`.trim();
	try {
		const parsed = JSON.parse(proc.stdout || "{}");
		const ok = parsed?.ok === true && parsed?.available === true;
		return { ok, summary: ok ? `probe ok (${parsed.os}, ${parsed.image})` : `probe unavailable: ${parsed.reason ?? "unknown"}; ${parsed.actionable ?? raw}` };
	} catch {
		return { ok: false, summary: `probe failed exit=${proc.status}: ${clipEnd(raw, 1200)}` };
	}
}

function runSandboxJson(scriptName: string, args: string[], timeoutMs = 300_000): any {
	const script = path.join(PACKAGE_ROOT, "modules", "pidex", "sandbox-runtime", "scripts", "sandbox", scriptName);
	const proc = spawnSync(process.execPath, [script, ...args], { cwd: PACKAGE_ROOT, encoding: "utf8", timeout: timeoutMs, maxBuffer: 50 * 1024 * 1024 });
	const raw = `${proc.stdout || ""}\n${proc.stderr || ""}`.trim();
	let parsed: any;
	try {
		const start = (proc.stdout || "").indexOf("{");
		const end = (proc.stdout || "").lastIndexOf("}");
		parsed = start >= 0 && end >= start ? JSON.parse((proc.stdout || "").slice(start, end + 1)) : undefined;
	} catch {}
	if (proc.status !== 0) {
		const detail = parsed ? JSON.stringify(parsed) : clipEnd(raw, 2000);
		const error = new Error(`sandbox ${scriptName} failed exit=${proc.status}: ${detail}`) as Error & { sandboxResult?: any };
		if (parsed) error.sandboxResult = parsed;
		throw error;
	}
	if (!parsed) throw new Error(`sandbox ${scriptName} failed exit=${proc.status}: no JSON result; ${clipEnd(raw, 2000)}`);
	if (parsed.ok === false) {
		const error = new Error(`sandbox ${scriptName} returned ok=false: ${JSON.stringify(parsed)}`) as Error & { sandboxResult?: any };
		error.sandboxResult = parsed;
		throw error;
	}
	return parsed;
}

const SANDBOX_RUNTIME_CLEAN_PREFIXES = ["agents.output/", "pidex/state/", "pidex/context/", "state/", "logs/", ".fallow/"];
const SANDBOX_ALLOWED_GITIGNORE_ADDITIONS = new Set(["agents.output/", "pidex/state/", ".fallow/", ".wiki-migration/"]);

function normalizeSandboxRel(relPath: string | undefined): string {
	return String(relPath || "").replaceAll("\\", "/").replace(/^\.\//, "");
}

function gitPathIgnored(cwd: string, relPath: string): boolean {
	const proc = spawnSync("git", ["check-ignore", "-q", "--", relPath], { cwd, encoding: "utf8", timeout: 5000 });
	return proc.status === 0;
}

function gitignoreRuntimeOnlyChange(cwd: string): { ok: boolean; reason: string; added?: string[]; entry?: string } {
	const unstaged = spawnSync("git", ["diff", "--", ".gitignore"], { cwd, encoding: "utf8", timeout: 5000 });
	const staged = spawnSync("git", ["diff", "--cached", "--", ".gitignore"], { cwd, encoding: "utf8", timeout: 5000 });
	if (unstaged.status !== 0 || staged.status !== 0) return { ok: false, reason: "git-diff-failed" };
	const added: string[] = [];
	for (const line of `${unstaged.stdout || ""}\n${staged.stdout || ""}`.split(/\r?\n/)) {
		if (!line || line.startsWith("diff --git ") || line.startsWith("index ") || line.startsWith("@@ ") || line.startsWith("--- ") || line.startsWith("+++ ")) continue;
		if (line.startsWith("-")) return { ok: false, reason: "gitignore-deletion-or-rewrite" };
		if (line.startsWith("+")) {
			const entry = line.slice(1).trim();
			if (!SANDBOX_ALLOWED_GITIGNORE_ADDITIONS.has(entry)) return { ok: false, reason: "gitignore-unapproved-addition", entry };
			added.push(entry);
		}
	}
	return { ok: added.length > 0, reason: added.length ? "allowed-runtime-gitignore-additions" : "no-gitignore-diff", added };
}

function gitPathTracked(cwd: string, relPath: string): boolean {
	const proc = spawnSync("git", ["ls-files", "--error-unmatch", "--", relPath], { cwd, encoding: "utf8", timeout: 5000 });
	return proc.status === 0;
}

function isSandboxCleanStatusPath(cwd: string, relPath: string | undefined): boolean {
	const normalized = normalizeSandboxRel(relPath);
	if (SANDBOX_RUNTIME_CLEAN_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return true;
	if (normalized.startsWith("wiki/")) return gitPathIgnored(cwd, normalized);
	if (normalized === ".gitignore") return gitignoreRuntimeOnlyChange(cwd).ok;
	return false;
}

function isValidationOnlyGeneratedPath(cwd: string, relPath: string | undefined): boolean {
	const normalized = normalizeSandboxRel(relPath);
	if (isSandboxCleanStatusPath(cwd, normalized)) return true;
	return normalized.startsWith("wiki/") && !gitPathTracked(cwd, normalized);
}

export function validationSourceMutationFiles(cwd: string, changedFiles: any): string[] {
	if (!Array.isArray(changedFiles)) return [];
	const out: string[] = [];
	for (const entry of changedFiles) {
		for (const rel of Array.isArray(entry?.paths) ? entry.paths : []) {
			if (!isValidationOnlyGeneratedPath(cwd, rel)) out.push(normalizeSandboxRel(rel));
		}
	}
	return [...new Set(out)].sort();
}

export function gitSourceStatusPorcelain(cwd: string): string {
	const proc = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd, encoding: "utf8", timeout: 10_000 });
	if (proc.status !== 0) return "";
	return proc.stdout.trim().split(/\r?\n/).filter(Boolean).filter((line) => {
		const rel = line.slice(2).trim().split(" -> ").pop();
		return !isSandboxCleanStatusPath(cwd, rel);
	}).join("\n");
}

function routingContextFile(text: string): string | undefined {
	const block = extractRoutingBlock(text);
	const value = extractRoutingField(block, "context_file");
	return value || undefined;
}

function normalizeContextRel(value: string | undefined): string | undefined {
	if (!value) return undefined;
	return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function validateSandboxRoutingContext(agent: string, contextRel: string | undefined): { ok: boolean; reason?: string } {
	if (contextRel?.startsWith("agents.output/")) return { ok: true };
	return { ok: false, reason: `PIDEX sandbox requires ${agent} to return ROUTING context_file under agents.output/** so reports use the artifact channel, not source files. got=${contextRel || "(missing)"}` };
}

function copyValidationContextArtifacts(projectRoot: string, workspace: string): { copied: boolean; source?: string; destination?: string } {
	const source = path.join(projectRoot, "agents.output");
	if (!fs.existsSync(source)) return { copied: false };
	const destination = path.join(workspace, "agents.output");
	fs.mkdirSync(path.dirname(destination), { recursive: true });
	fs.cpSync(source, destination, { recursive: true, force: true, errorOnExist: false });
	return { copied: true, source, destination };
}

async function runSandboxedConfiguredAgent(params: {
	agent: string;
	task: string;
	cwd: string;
	providerOverride?: string;
	modelOverride?: string;
	effortOverride?: string;
	tools?: string[];
	signal?: AbortSignal;
	onUpdate?: (text: string) => void;
}): Promise<RpResult> {
	const sandboxPurpose = params.agent === "pidex-qa" || params.agent === "pidex-security" ? "validation" : "mutation";
	const sourceStatus = gitSourceStatusPorcelain(params.cwd);
	if (sandboxPurpose === "mutation" && sourceStatus) throw new Error(`PIDEX sandbox requires a clean host source worktree before sandbox creation; runtime artifacts under agents.output/, pidex/state/, pidex/context/, .fallow/, and allowed .gitignore runtime entries are ignored. Dirty source status:\n${sourceStatus}`);
	const create = runSandboxJson("lifecycle.mjs", ["--project", params.cwd, "--pidex-root", PACKAGE_ROOT, "--mode", "hardened-pipeline", "--json"]);
	const workspace = String(create.workspace || "");
	const validationContextCopy = sandboxPurpose === "validation" ? copyValidationContextArtifacts(params.cwd, workspace) : { copied: false };
	const metadataPath = String(create.metadata_path || "");
	const metadata = metadataPath && fs.existsSync(metadataPath) ? JSON.parse(fs.readFileSync(metadataPath, "utf8")) : create.metadata;
	const baselineHead = metadata?.baseline_head;
	const runId = String(create.run_id || metadata?.run_id || "");
	const task = [
		`SANDBOX RUN: ${runId}`,
		`HOST_PROJECT_ROOT: ${params.cwd}`,
		`SANDBOX_WORKSPACE: ${workspace}`,
		`SANDBOX_PURPOSE: ${sandboxPurpose}`,
		"Write/edit only inside SANDBOX_WORKSPACE. Keep normal ROUTING context_file paths project-relative under agents.output/....",
		"Do not run raw host bash or host git commands. Do not attempt git commit/status as a completion gate. The PIDEX sandbox wrapper will generate/apply the source patch for implementer runs and extract your agents.output artifact after your final ROUTING response.",
		`Allowed validation helper shape: node ${path.join(PACKAGE_ROOT, "modules", "pidex", "sandbox-runtime", "scripts", "sandbox", "exec.mjs")} --project ${workspace} --pidex-root ${PACKAGE_ROOT} --mode hardened-pipeline --phase test --json -- npm test`,
		params.task,
	].join("\n\n");
	try {
		const sandboxContext: SandboxRuntimeContext = {
			mode: "hardened-pipeline",
			runId,
			hostProjectRoot: path.resolve(params.cwd),
			sandboxWorkspace: path.resolve(workspace),
			allowedWriteRoot: path.resolve(workspace),
		};
		const result = await runConfiguredAgent({ ...params, task, cwd: workspace, sandboxContext });
		const contextRel = normalizeContextRel(routingContextFile(result.finalText));
		const routingValidation = validateSandboxRoutingContext(params.agent, contextRel);
		if (!routingValidation.ok) throw new Error(routingValidation.reason);
		runSandboxJson("extract-artifacts.mjs", ["--workspace", workspace, "--project", params.cwd, "--assigned", contextRel!, "--run-id", runId, "--check", "--json"]);
		const patches = path.join(PACKAGE_ROOT, "state", "sandbox", "runs", runId, "patches");
		const diff = runSandboxJson("diff.mjs", ["--workspace", workspace, "--patches", patches, "--json"]);
		if (sandboxPurpose === "validation") {
			runSandboxJson("extract-artifacts.mjs", ["--workspace", workspace, "--project", params.cwd, "--assigned", contextRel!, "--run-id", runId, "--json"]);
			const validationMutations = validationSourceMutationFiles(params.cwd, diff.changed_files);
			if (validationMutations.length) {
				throw new Error(`validation-agent-source-mutation: ${params.agent} changed source files in validation mode; changed=${JSON.stringify(validationMutations)}`);
			}
			runSandboxJson("cleanup.mjs", ["--pidex-root", PACKAGE_ROOT, "--run-id", runId, "--success", "--json"], 120_000);
			return {
				...result,
				warnings: [...(result.warnings ?? []), `SANDBOX: run_id=${runId}; workspace=${workspace}; validation_source_diff=${diff.empty ? "empty" : "runtime-only"}; context_artifacts=${validationContextCopy.copied ? "copied" : "absent"}; artifact=extracted:${contextRel}`],
			};
		}
		if (!diff.empty) {
			runSandboxJson("apply.mjs", ["--project", params.cwd, "--patch", diff.patch_path, "--changed-files", diff.changed_files_path, "--baseline-head", baselineHead, "--json"]);
		}
		runSandboxJson("extract-artifacts.mjs", ["--workspace", workspace, "--project", params.cwd, "--assigned", contextRel!, "--run-id", runId, "--json"]);
		runSandboxJson("cleanup.mjs", ["--pidex-root", PACKAGE_ROOT, "--run-id", runId, "--success", "--json"], 120_000);
		return {
			...result,
			warnings: [...(result.warnings ?? []), `SANDBOX: run_id=${runId}; workspace=${workspace}; source_patch=${diff.empty ? "empty" : "applied"}; artifact=extracted:${contextRel}`],
		};
	} catch (error: any) {
		let cleanupNote = "";
		try {
			const cleanup = runSandboxJson("cleanup.mjs", ["--pidex-root", PACKAGE_ROOT, "--run-id", runId, "--preserve-on-failure", "--json"], 120_000);
			if (cleanup?.ok === false) cleanupNote = `; cleanup_failed=${JSON.stringify(cleanup)}`;
		} catch (cleanupError: any) {
			cleanupNote = `; cleanup_error=${cleanupError?.message ?? cleanupError}`;
		}
		throw new Error(`Sandboxed pidex_agent failed for ${params.agent}; run_id=${runId}; workspace=${workspace}; reason=${error?.message ?? error}${cleanupNote}`);
	}
}

function normalizeProvider(provider: string | undefined): string {
	return (provider ?? "pi").trim().toLowerCase();
}

function isPiProvider(provider: string): boolean {
	return provider === "pi" || provider === "subagent" || provider === "pidex_agent";
}

function supportsDelegateToolLoop(provider: string): boolean {
	return provider === "codex";
}

function isToolHeavyAgent(agent: string): boolean {
	return TOOL_HEAVY_AGENTS.has(agent);
}

function formatAgentProgressLabel(agent: string): string {
	const role = agent
		.replace(/^pidex-/, "")
		.split("-")
		.map((part) => part ? part[0].toUpperCase() + part.slice(1) : part)
		.join(" ");
	return role || agent;
}

function formatPiRunnerStartDetails(model: string | undefined): string {
	const trimmed = model?.trim();
	if (!trimmed) return "provider=auto model=auto";
	const slash = trimmed.indexOf("/");
	if (slash > 0 && slash < trimmed.length - 1) {
		return `provider=${trimmed.slice(0, slash)} model=${trimmed.slice(slash + 1)}`;
	}
	return `provider=auto model=${trimmed}`;
}

function formatDelegateStartDetails(provider: string, model: string | undefined): string {
	return `provider=${provider} model=${model?.trim() || "default"}`;
}

function formatAgentCompletionLine(result: RpResult): string {
	const runner = result.provider || "unknown";
	const modelForDisplay = result.modelRequested ?? result.model;
	if (runner === "pi") {
		return `${formatAgentProgressLabel(result.agent)}: pi (${formatPiRunnerStartDetails(modelForDisplay)})`;
	}
	return `${formatAgentProgressLabel(result.agent)}: ${runner} (${formatDelegateStartDetails(runner, modelForDisplay)})`;
}

function hasRoutingBlock(text: string): boolean {
	return /<!--\s*ROUTING[\s\S]*?-->/.test(text);
}

function extractRoutingBlock(text: string): string | undefined {
	const matches = text.match(/<!--\s*ROUTING[\s\S]*?-->/g);
	return matches?.[matches.length - 1];
}

function extractRoutingField(routingBlock: string | undefined, field: string): string | undefined {
	if (!routingBlock) return undefined;
	const match = routingBlock.match(new RegExp(`(?:^|\\n)\\s*${field}:\\s*(.+)`, "i"));
	return match?.[1]?.trim();
}

function hasValidRoutingContextFile(text: string, cwd: string): boolean {
	const routing = extractRoutingBlock(text);
	const contextFile = extractRoutingField(routing, "context_file");
	if (!contextFile) return false;
	const normalized = contextFile.trim();
	if (!normalized) return false;
	const resolved = path.isAbsolute(normalized) ? normalized : path.resolve(cwd, normalized);
	return fs.existsSync(resolved);
}

function loadAgent(agentName: string): { frontmatter: AgentFrontmatter; body: string; filePath: string } {
	const safeName = agentName.endsWith(".md") ? agentName : `${agentName}.md`;
	if (!/^pidex-[a-z0-9-]+\.md$/.test(safeName)) throw new Error(`Invalid pidex agent name: ${agentName}`);
	const filePath = path.join(AGENTS_DIR, safeName);
	if (!fs.existsSync(filePath)) {
		const available = fs
			.readdirSync(AGENTS_DIR)
			.filter((f) => f.startsWith("pidex-") && f.endsWith(".md"))
			.map((f) => f.slice(0, -3))
			.sort()
			.join(", ");
		throw new Error(`Unknown pidex agent: ${agentName}. Available: ${available}`);
	}
	const content = fs.readFileSync(filePath, "utf8");
	const { frontmatter, body } = parseFrontmatter<AgentFrontmatter>(content);
	return { frontmatter, body, filePath };
}

function textFromAssistantMessage(message: any): string {
	if (message?.role !== "assistant") return "";
	if (typeof message.content === "string") return message.content;
	if (Array.isArray(message.content)) {
		const texts = message.content.filter((p: any) => p?.type === "text" && typeof p.text === "string").map((p: any) => p.text);
		return texts.join("\n");
	}
	return "";
}

function finalAssistantTextFromEvent(event: JsonEvent): string {
	const direct = textFromAssistantMessage(event?.message);
	if (direct) return direct;
	if (Array.isArray(event?.messages)) {
		for (let i = event.messages.length - 1; i >= 0; i--) {
			const text = textFromAssistantMessage(event.messages[i]);
			if (text) return text;
		}
	}
	return "";
}

async function writeTempPrompt(agent: string, prompt: string): Promise<{ dir: string; file: string }> {
	const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pidex-agent-"));
	const file = path.join(dir, `${agent}.system.md`);
	await fs.promises.writeFile(file, prompt, { encoding: "utf8", mode: 0o600 });
	return { dir, file };
}

function buildAgentSystemPrompt(agentName: string, body: string, provider: string): string {
	return `${body}\n\n---\npidex adapter notes:\n- You are running as ${agentName} through provider '${provider}'.\n- You are a child pidex role agent, not the parent orchestrator. Complete only your assigned pidex-* role.\n- Do not start or invoke pidex recursively. Do not propose subagent fanout unless explicitly requested by the parent task.\n- Use pidex pidex-* names and conventions.\n- If you need user input, do not block; emit a ROUTING block with the appropriate gate and question for the orchestrator.\n- Write full artifacts to files under the requested agents.output/ or wiki path; do not paste full documents into your final response.\n- Final response must be <= ${MAX_AGENT_FINAL_CHARS} characters and contain only: status, output path(s), next agent/route, concise evidence, and the ROUTING HTML comment.\n- Always finish with exactly one ROUTING HTML comment that includes context_file, then stop immediately after it.\n`;
}

function buildCliDelegatePrompt(agentName: string, body: string, task: string, provider: string): string {
	return `${buildAgentSystemPrompt(agentName, body, provider)}\n\n---\nTask for ${agentName}:\n\n${task}\n`;
}

function appendTail(current: string, addition: string, maxChars = MAX_STDERR_CHARS): string {
	const combined = current + addition;
	return combined.length > maxChars ? combined.slice(-maxChars) : combined;
}

function clipEnd(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	return `[truncated: showing last ${maxChars} of ${text.length} chars]\n${text.slice(-maxChars)}`;
}

function truncateToolContent(text: string, result: RpResult): string {
	if (text.length <= MAX_TOOL_CONTENT_CHARS) return text;
	const routing = extractRoutingBlock(text);
	const head = text.slice(0, 6000);
	const tail = text.slice(-6000);
	const routingSection = routing && !head.includes(routing) && !tail.includes(routing) ? `\n\n${routing}` : "";
	const logHint = result.logFile ? `\nFull raw child log: ${result.logFile}` : "";
	return `${head}\n\n[pidex truncated final response from ${text.length} chars to avoid session bloat.${logHint}]\n\n${tail}${routingSection}`;
}

function safeDetailsForResult(result: RpResult): Record<string, unknown> {
	const details: Record<string, unknown> = {
		agent: result.agent,
		provider: result.provider,
		model: result.model,
		modelRequested: result.modelRequested,
		effort: result.effort,
		exitCode: result.exitCode,
		fallbackFrom: result.fallbackFrom,
		logFile: result.logFile,
		runDir: result.runDir,
		sessionDir: result.sessionDir,
		stdoutEventCount: result.stdoutEventCount,
		skippedLargeEventCount: result.skippedLargeEventCount,
		toolCount: result.toolCount,
		turnCount: result.turnCount,
		maxTurns: result.maxTurns,
		durationMs: result.durationMs,
		inputChars: result.inputChars,
		outputChars: result.outputChars ?? result.finalText.length,
		finalTextChars: result.finalText.length,
		inputTokensEstimate: result.inputTokensEstimate,
		outputTokensEstimate: result.outputTokensEstimate,
		cacheReadTokens: result.cacheReadTokens,
		cacheWriteTokens: result.cacheWriteTokens,
		costUsdEstimate: result.costUsdEstimate,
		metricsFile: result.metricsFile,
		setupError: result.setupError,
		timedOut: result.timedOut,
		aborted: result.aborted,
		turnLimitHit: result.turnLimitHit,
		warnings: result.warnings,
		stderrTail: result.stderr ? clipEnd(result.stderr, MAX_STDERR_DETAILS_CHARS) : undefined,
	};
	if (JSON.stringify(details).length <= MAX_TOOL_DETAILS_CHARS) return details;
	return {
		agent: result.agent,
		provider: result.provider,
		model: result.model,
		modelRequested: result.modelRequested,
		exitCode: result.exitCode,
		logFile: result.logFile,
		finalTextChars: result.finalText.length,
		stderrTail: result.stderr ? clipEnd(result.stderr, 2048) : undefined,
		warnings: [...(result.warnings ?? []), "Tool details were compacted because they exceeded the size guard."],
	};
}

function formatToolContent(result: RpResult): string {
	const base = result.finalText || `(no final assistant text; exit ${result.exitCode})`;
	let text = `${formatAgentCompletionLine(result)}\n\n${truncateToolContent(base, result)}`;
	if (!result.finalText && result.stderr) {
		text += `\n\nstderr tail:\n${clipEnd(result.stderr, 4000)}`;
	}
	return text;
}

function createThrottledUpdate(onUpdate?: (text: string) => void): (text: string, force?: boolean) => void {
	let lastText = "";
	let lastAt = 0;
	return (text: string, force = false) => {
		if (!onUpdate) return;
		const clipped = clipEnd(text, MAX_UPDATE_CHARS);
		if (clipped === lastText) return;
		const now = Date.now();
		if (!force && now - lastAt < UPDATE_INTERVAL_MS) return;
		lastText = clipped;
		lastAt = now;
		onUpdate(clipped);
	};
}

function safePathSegment(value: string): string {
	const segment = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
	return segment.slice(0, 80) || "unknown";
}

function timestampForPath(date = new Date()): string {
	return date.toISOString().replace(/[:.]/g, "-");
}

type AgentRunLog = {
	runId: string;
	runDir: string;
	logFile: string;
	sessionDir: string;
	stderrFile: string;
	writeChunk(chunk: Buffer | string): boolean;
	onDrain(callback: () => void): void;
	close(): Promise<void>;
};

function createAgentRunLog(agent: string, cwd: string): AgentRunLog {
	const runId = `${timestampForPath()}_${safePathSegment(agent)}_${process.pid}_${randomUUID().slice(0, 8)}`;
	const project = safePathSegment(cwd);
	const dir = path.join(RUNS_DIR, project, runId);
	fs.mkdirSync(dir, { recursive: true });
	const logFile = path.join(dir, `${safePathSegment(agent)}.stdout.jsonl.gz`);
	const sessionDir = path.join(dir, "session");
	const stderrFile = path.join(dir, "stderr.log");
	const output = fs.createWriteStream(logFile, { mode: 0o600 });
	const gzip = createGzip();
	gzip.pipe(output);
	let closed = false;
	const closedPromise = new Promise<void>((resolve, reject) => {
		output.on("close", resolve);
		output.on("error", reject);
		gzip.on("error", reject);
	});
	return {
		runId,
		runDir: dir,
		logFile,
		sessionDir,
		stderrFile,
		writeChunk(chunk: Buffer | string) {
			if (closed) return true;
			return gzip.write(chunk);
		},
		onDrain(callback: () => void) {
			gzip.once("drain", callback);
		},
		async close() {
			if (closed) return;
			closed = true;
			gzip.end();
			await closedPromise;
		},
	};
}

function estimateTokensFromChars(chars: number): number {
	return Math.max(0, Math.ceil(chars / 4));
}

function normalizeModelForPricing(model?: string): string | undefined {
	if (!model) return undefined;
	const trimmed = model.trim();
	if (!trimmed) return undefined;
	if (trimmed.startsWith("-m ")) return trimmed.slice(3).trim();
	if (trimmed.startsWith("--model ")) return trimmed.slice(8).trim();
	return trimmed;
}

function loadPricing(): Record<string, { input: number; output: number }> {
	try {
		if (!fs.existsSync(PRICING_PATH)) return {};
		return JSON.parse(fs.readFileSync(PRICING_PATH, "utf8"));
	} catch {
		return {};
	}
}

function estimateCostUsd(model: string | undefined, inputTokens: number, outputTokens: number): number | undefined {
	const pricing = loadPricing();
	const normalized = normalizeModelForPricing(model);
	if (!normalized) return undefined;
	const aliases: Record<string, string> = {
		opus: "claude-opus",
		sonnet: "claude-sonnet",
		haiku: "claude-haiku",
	};
	const key = pricing[normalized] ? normalized : aliases[normalized] ?? normalized;
	const price = pricing[key];
	if (!price) return undefined;
	return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

function isAnthropicModel(model: string | undefined): boolean {
	if (!model) return false;
	const normalized = model.trim().toLowerCase();
	return normalized.startsWith("anthropic/")
		|| normalized.startsWith("claude")
		|| normalized.includes("/claude")
		|| normalized === "opus"
		|| normalized === "sonnet"
		|| normalized === "haiku";
}

function isCodexModel(model: string | undefined): boolean {
	if (!model) return false;
	const normalized = model.trim().toLowerCase();
	return normalized.includes("codex") || normalized.startsWith("openai-codex/");
}

function codexQuotaProviderFromModel(model: string | undefined): string {
	if (!model) return "codex";
	const normalized = model.trim().toLowerCase();
	if (normalized.includes("codex-spark")) return "codex-spark";
	return "codex";
}

function providerLimitRecord(provider: string, window: string): Record<string, any> | undefined {
	try {
		if (!fs.existsSync(PROVIDER_LIMITS_LATEST_PATH)) return undefined;
		const data = JSON.parse(fs.readFileSync(PROVIDER_LIMITS_LATEST_PATH, "utf8"));
		return (data.records ?? []).find((r: any) => r?.provider === provider && r?.window === window);
	} catch {
		return undefined;
	}
}

function assertCodexQuotaAllowed(model: string | undefined): void {
	if (!isCodexModel(model)) return;
	// Quota enforcement is intentionally disabled in this local branch to allow uninterrupted Codex/PIDEX execution.
	return;
}

function assertPiModelAllowed(model: string | undefined): void {
	if (isAnthropicModel(model)) {
		if (process.env.PIDEX_ALLOW_ANTHROPIC === "1") return;
		throw new Error(`Blocked Pi runner model '${model}'. Anthropic/Claude subscription auth may incur paid extra usage; set PIDEX_ALLOW_ANTHROPIC=1 only for an explicit one-off override.`);
	}
	assertCodexQuotaAllowed(model);
}

function normalizeExtractedPlan(raw: string | undefined): string | undefined {
	if (!raw) return undefined;
	const cleaned = raw.trim().replace(/^plan[-_\s]*/i, "").replace(/\.jsonl$/i, "");
	if (!/^[0-9][a-zA-Z0-9._-]{0,39}$/.test(cleaned)) return undefined;
	return `plan-${cleaned.toLowerCase()}`;
}

function extractPlanFromContextFile(contextFile: string | undefined): string | undefined {
	if (!contextFile) return undefined;
	const base = path.basename(contextFile.trim());
	return normalizeExtractedPlan(base.match(/^([0-9][a-zA-Z0-9._-]*?)(?:[-_][A-Za-z]|\.md$|$)/)?.[1]);
}

function extractPlanId(task: string, finalText = ""): string {
	const combined = `${task}\n${finalText}`;
	const routing = extractRoutingBlock(finalText);
	const contextFile = extractRoutingField(routing, "context_file");
	return normalizeExtractedPlan(combined.match(/\bplan\s*[=:]\s*([0-9][a-zA-Z0-9._-]*)\b/i)?.[1])
		?? normalizeExtractedPlan(combined.match(/\bPlan\s+([0-9][a-zA-Z0-9._-]*)\b/i)?.[1])
		?? normalizeExtractedPlan(combined.match(/\bID:\s*([0-9][a-zA-Z0-9._-]*)\b/i)?.[1])
		?? normalizeExtractedPlan(combined.match(/\bPlanID:\s*([0-9][a-zA-Z0-9._-]*)\b/i)?.[1])
		?? normalizeExtractedPlan(combined.match(/\bOrigin:\s*([0-9][a-zA-Z0-9._-]*)\b/i)?.[1])
		?? normalizeExtractedPlan(combined.match(/\bplan[-_]([0-9][a-zA-Z0-9._-]*)\b/i)?.[1])
		?? extractPlanFromContextFile(contextFile)
		?? extractPlanFromContextFile(combined.match(/agents\.output\/[A-Za-z0-9_./-]*?[0-9][A-Za-z0-9._-]*[-_][A-Za-z0-9_.-]+\.md/)?.[0])
		?? "unknown-plan";
}

function extractPlanUuid(task: string, finalText = ""): string | undefined {
	const combined = `${task}\n${finalText}`;
	return combined.match(/\bUUID:\s*([a-zA-Z0-9-]+)/)?.[1]
		?? combined.match(/\buuid[=:]\s*([a-zA-Z0-9-]+)/i)?.[1];
}

function normalizePlanKey(value: string | undefined): string {
	const raw = (value ?? "unknown-plan").trim() || "unknown-plan";
	const numeric = raw.match(/^(?:plan-)?(\d{1,3})$/i)?.[1];
	if (numeric) return `plan-${numeric.padStart(3, "0")}`;
	const prefixed = raw.match(/^(?:plan-)?(\d{1,3})[-_]/i)?.[1];
	if (prefixed) return `plan-${prefixed.padStart(3, "0")}`;
	return raw;
}

function operatorEventFile(cwd: string, planId: string): { file: string; pipelineId: string } {
	const project = safePathSegment(cwd);
	const normalizedPlan = normalizePlanKey(planId);
	const pipelineId = process.env.RUNNING_PI_PIPELINE_ID || process.env.PIDEX_PIPELINE_ID || `${project}-${safePathSegment(normalizedPlan)}`;
	const file = path.join(STATE_DIR, "orchestrator-events", project, `${safePathSegment(pipelineId)}.jsonl`);
	return { file, pipelineId };
}

function appendOperatorEvent(cwd: string, planId: string, event: Record<string, unknown>): string | undefined {
	try {
		const normalizedPlan = normalizePlanKey(planId);
		const { file, pipelineId } = operatorEventFile(cwd, normalizedPlan);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		const record = {
			timestamp: new Date().toISOString(),
			project_path: cwd,
			project_slug: path.basename(cwd) || safePathSegment(cwd),
			pipeline_id: pipelineId,
			plan_key: normalizedPlan,
			actor: "orchestrator",
			source: "pidex_agent_extension",
			...event,
		};
		fs.appendFileSync(file, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
		return file;
	} catch {
		return undefined;
	}
}

function normalizeGate(value: string | undefined): string | undefined {
	const gate = (value || "").trim();
	if (!gate || gate.toLowerCase() === "none" || gate === "—" || gate === "-") return undefined;
	return gate;
}

function estimateContextSizeClass(chars: number): "small" | "medium" | "large" {
	if (chars < 8_000) return "small";
	if (chars < 32_000) return "medium";
	return "large";
}

function extractContextPathsFromTask(task: string): string[] {
	const matches = task.match(/(?:^|[\s`"'(<])((?:\.\/|\.\.\/|\/)?(?:agents\.output|rules|pidex\/context|wiki|scripts|config|templates|skills|extensions|dashboard)\/[A-Za-z0-9._/@:+-]+(?:\/[A-Za-z0-9._/@:+-]+)*\.(?:md|json|jsonl|ts|tsx|js|mjs|py|sh|yml|yaml|txt))/g) || [];
	const paths = matches
		.map((m) => m.trim().replace(/^[`"'(<]+|[`"'),>]+$/g, ""))
		.map((m) => m.replace(/^\.\//, ""));
	return Array.from(new Set(paths)).slice(0, 30);
}

function classifyInitialTask(task: string | undefined): string {
	const text = (task || "").toLowerCase();
	if (!text.trim()) return "unknown";
	if (/fix|bug|error|fail|broken|regression/.test(text)) return "bugfix";
	if (/ui|ux|design|screen|page|dashboard|mobile/.test(text)) return "ui";
	if (/release|publish|tag|push|deploy/.test(text)) return "release";
	if (/refactor|cleanup|hygiene|remove|rename/.test(text)) return "cleanup";
	if (/test|qa|coverage|playwright|smoke/.test(text)) return "qa";
	return "feature";
}

function recordPreflightSkeleton(cwd: string, task: string | undefined, authOk: boolean, gitHookStatus: string): string | undefined {
	const initialTask = task?.trim() || "";
	return appendOperatorEvent(cwd, "unknown-plan", {
		operator_type: "OpPreflight",
		logical_decision: {
			initial_task_provided: Boolean(initialTask),
			task_class: classifyInitialTask(initialTask),
			existing_project: fs.existsSync(path.join(cwd, ".git")) || fs.existsSync(path.join(cwd, "package.json")) || fs.existsSync(path.join(cwd, "pidex", "context")),
			preflight_required: true,
		},
		physical_action: {
			kickoff_sent: true,
			fixed_interview_required: true,
			grill_decision_pending: true,
			delegate_auth_ok: authOk,
			git_hook_status: gitHookStatus,
		},
		confidence: "low",
		reason: "PIDEX direct-mode kickoff emitted preflight skeleton before interactive interview completion.",
	});
}

function isReviewAgent(agent: string): boolean {
	return new Set(["pidex-critic", "pidex-code-reviewer", "pidex-security", "pidex-qa", "pidex-uat"]).has(agent);
}

function extractFindingCounts(text: string): Record<string, number> {
	const out: Record<string, number> = {};
	for (const severity of ["critical", "major", "minor", "high", "medium", "low"] as const) {
		const re = new RegExp(`\\b${severity}\\b`, "gi");
		const count = text.match(re)?.length || 0;
		if (count) out[severity] = count;
	}
	return out;
}

function shouldSuppressAgentGateNotify(agent: string): boolean {
	if ((process.env.PIDEX_SUPPRESS_AGENT_GATE_NOTIFY || "0") === "1") return true;
	if ((process.env.PIDEX_PARALLEL_GATE_NOTIFY_AFTER_MERGE || "1") === "0") return false;
	// Critic/code-reviewer can have orchestrator-owned parallel lanes. Their primary
	// ROUTING block is not the final user-facing gate until secondary lanes have
	// returned and the orchestrator has written the merge/adjudication summary.
	return agent === "pidex-critic" || agent === "pidex-code-reviewer";
}

function notifyGate(cwd: string, planId: string, gate: string, routeTo: string | undefined, contextFile: string | undefined, agent: string): void {
	if (shouldSuppressAgentGateNotify(agent)) return;
	try {
		if ((process.env.PIDEX_TELEGRAM_GATES || "1") === "0") return;
		const key = `${path.resolve(cwd)}|${normalizePlanKey(planId)}|${gate}|${contextFile || ""}`;
		const stateDir = path.join(PACKAGE_ROOT, "state", "telegram");
		const stateFile = path.join(stateDir, "gate-notifications.json");
		let state: Record<string, string> = {};
		try { state = JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch { state = {}; }
		if (state[key]) return;
		const script = path.join(PACKAGE_ROOT, "scripts", "telegram", "notify.sh");
		if (!fs.existsSync(script)) return;
		const context = [
			`Gate: ${gate}`,
			`Plan: ${normalizePlanKey(planId)}`,
			routeTo ? `Route: ${routeTo}` : undefined,
			contextFile ? `Context: ${contextFile}` : undefined,
			"Action: return to the active Pi/PIDEX session and answer there.",
		].filter(Boolean).join("\n");
		const proc = spawnSync("bash", [script, "--optional", "--project", cwd, "--needs", `Gate ${gate} decision`, "--context", context], {
			cwd: PACKAGE_ROOT,
			encoding: "utf8",
			timeout: 15_000,
			stdio: ["ignore", "pipe", "pipe"],
		});
		if (proc.status === 0) {
			fs.mkdirSync(stateDir, { recursive: true });
			state[key] = new Date().toISOString();
			fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
		}
	} catch {
		// Gate notifications are best-effort and must never break pidex_agent.
	}
}

function recordOperatorEvents(result: RpResult, cwd: string, task: string): string | undefined {
	const routing = extractRoutingBlock(result.finalText);
	const planId = extractPlanId(task, result.finalText);
	const contextFile = extractRoutingField(routing, "context_file");
	const gate = normalizeGate(extractRoutingField(routing, "gate"));
	const routeTo = extractRoutingField(routing, "route_to");
	const contextPaths = extractContextPathsFromTask(task);
	let eventFile = appendOperatorEvent(cwd, planId, {
		operator_type: "OpContextPack",
		agent: result.agent,
		logical_decision: { agent: result.agent, task_chars: task.length, context_paths_detected: contextPaths.length },
		physical_action: { context_paths: contextPaths, estimated_token_class: estimateContextSizeClass(task.length), budget_warning: task.length >= 32_000 },
		confidence: contextPaths.length ? "medium" : "low",
	});
	eventFile = appendOperatorEvent(cwd, planId, {
		operator_type: "OpSpawn",
		agent: result.agent,
		provider: result.provider,
		model: normalizeModelForPricing(result.model),
		duration_ms: result.durationMs,
		exit_code: result.exitCode,
		context_file: contextFile,
		log_file: result.logFile,
		run_dir: result.runDir,
		logical_decision: { agent: result.agent },
		physical_action: { provider: result.provider, model: normalizeModelForPricing(result.model), exit_code: result.exitCode },
	});
	if (isReviewAgent(result.agent)) {
		eventFile = appendOperatorEvent(cwd, planId, {
			operator_type: "OpReview",
			agent: result.agent,
			source_artifact: contextFile,
			logical_decision: { review_agent: result.agent, expected_verdict_in_routing: true },
			physical_action: { verdict: extractRoutingField(routing, "verdict") || "unknown", gate: gate || undefined, route_to: routeTo, finding_counts: extractFindingCounts(result.finalText) },
			confidence: routing ? "medium" : "low",
		}) ?? eventFile;
	}
	if (routeTo || gate) {
		eventFile = appendOperatorEvent(cwd, planId, {
			operator_type: "OpRoute",
			agent: result.agent,
			source_artifact: contextFile,
			gate_present: Boolean(gate),
			logical_decision: { route_to: routeTo, gate: gate || undefined, context_file: contextFile },
			physical_action: { returned_to_orchestrator: true },
			confidence: routeTo ? "medium" : "insufficient-data",
		}) ?? eventFile;
	}
	if (gate) {
		eventFile = appendOperatorEvent(cwd, planId, {
			operator_type: "OpGate",
			agent: result.agent,
			source_artifact: contextFile,
			gate,
			logical_decision: { gate, route_to: routeTo, user_decision_required: true },
			physical_action: { gate_detected: true, decision_pending_in_parent_session: true },
			confidence: "medium",
		}) ?? eventFile;
		notifyGate(cwd, planId, gate, routeTo, contextFile, result.agent);
	}
	return eventFile;
}

function simpleMessageText(message: any): string {
	const content = message?.content;
	if (typeof content === "string") return clipEnd(content, 1800);
	if (Array.isArray(content)) {
		return clipEnd(content.map((part: any) => part?.type === "text" ? part.text : "").filter(Boolean).join(" "), 1800);
	}
	return "";
}

function simpleSessionDigest(ctx: any, maxItems = 10): string {
	const entries = ctx?.sessionManager?.getEntries?.() ?? [];
	const messages = entries.filter((e: any) => e?.type === "message" && e?.message?.role).slice(-maxItems).map((e: any) => e.message);
	if (!messages.length) return "- (no message digest available)";
	return messages.map((m: any) => `- ${m.role === "assistant" ? "A" : m.role === "user" ? "U" : "M"}: ${simpleMessageText(m) || "(non-text message)"}`).join("\n");
}

function gitValue(cwd: string, args: string[]): string {
	try {
		return spawnSync("git", args, { cwd, encoding: "utf8", timeout: 5000 }).stdout.trim();
	} catch {
		return "";
	}
}

function piCliFromShim(shimPath: string | undefined): string | undefined {
	if (!shimPath) return undefined;
	const candidate = path.join(path.dirname(shimPath), "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js");
	try { return fs.existsSync(candidate) ? candidate : undefined; } catch { return undefined; }
}

function discoverWindowsPiCli(): string | undefined {
	const candidates: string[] = [];
	try {
		const found = spawnSync("where.exe", ["pi.cmd"], { encoding: "utf8", timeout: 5000 }).stdout ?? "";
		for (const line of found.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)) candidates.push(line);
	} catch {}
	for (const dir of (process.env.Path ?? process.env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
		candidates.push(path.join(dir, "pi.cmd"), path.join(dir, "pi"));
	}
	for (const candidate of candidates) {
		const cli = piCliFromShim(candidate);
		if (cli) return cli;
	}
	return undefined;
}

export function piChildSpawnSpec(args: string[], platform = process.platform): { command: string; args: string[] } {
	if (platform === "win32") {
		const cli = discoverWindowsPiCli();
		if (cli) return { command: process.execPath, args: [cli, ...args] };
		return { command: "cmd.exe", args: ["/d", "/s", "/c", "pi.cmd", ...args] };
	}
	return { command: "pi", args };
}

function resolveProjectRoot(cwd: string): string {
	const gitRoot = gitValue(cwd, ["rev-parse", "--show-toplevel"]);
	return gitRoot || cwd || process.cwd();
}

function savePidexMemory(ctx: any, argsLine?: string): string {
	const cwd = String(ctx?.cwd || process.cwd());
	const projectRoot = resolveProjectRoot(cwd);
	const projectName = path.basename(projectRoot);
	const memoryDir = path.join(projectRoot, "wiki", "session-memory");
	fs.mkdirSync(memoryDir, { recursive: true });
	const now = new Date().toISOString();
	const fileName = `${now.replace(/[:.]/g, "-")}.md`;
	const filePath = path.join(memoryDir, fileName);
	const hint = clipEnd(String(argsLine || ""), 700);
	const title = hint || "PIDEX session memory";
	const body = `---\ntitle: ${title.replace(/\n/g, " ")}\ntype: session-memory\nstatus: active\ncreated: ${now.slice(0, 10)}\nupdated: ${now.slice(0, 10)}\nsource: pidex-session\n---\n\n# ${title}\n\n## Project\n\n- project_root: ${projectRoot}\n- project_name: ${projectName}\n- git_branch: ${gitValue(projectRoot, ["branch", "--show-current"]) || "unknown"}\n- git_commit: ${gitValue(projectRoot, ["rev-parse", "--short", "HEAD"]) || "unknown"}\n\n## Context\n\n- cwd: ${cwd}\n- session: ${ctx?.sessionManager?.getSessionFile?.() || "unknown"}\n- captured_at: ${now}\n\n## User note\n\n${hint || "(none)"}\n\n## Recent conversation digest\n\n${simpleSessionDigest(ctx)}\n\n## Navigation\n\n- Session memory index: [[index]]\n- Project index: [[../index]]\n`;
	fs.writeFileSync(filePath, body, "utf8");
	const indexPath = path.join(memoryDir, "index.md");
	let index = "";
	try { index = fs.readFileSync(indexPath, "utf8"); } catch {}
	if (!index.trim()) {
		index = `---\ntitle: ${projectName} Session Memory\ntype: session-memory-index\nstatus: active\ncreated: ${now.slice(0, 10)}\nupdated: ${now.slice(0, 10)}\n---\n\n# ${projectName} Session Memory\n\n## Navigation\n\n- Project index: [[../index]]\n\n`;
	}
	index += `- ${now} — [[${fileName.replace(/\.md$/, "")}]] — ${title}\n`;
	fs.writeFileSync(indexPath, index, "utf8");
	return filePath;
}

function runPidexQualityReport(cwd: string, argsLine?: string): { ok: boolean; summary: string } {
	const script = path.join(PACKAGE_ROOT, "scripts", "quality", "report.mjs");
	const rawArgs = (argsLine ?? "").trim().split(/\s+/).filter(Boolean);
	const args = [script, "--project", cwd];
	if (rawArgs.length) args.push(...rawArgs);
	else args.push("--since-last-review", "--last", "5");
	const proc = spawnSync(process.execPath, args, { cwd: PACKAGE_ROOT, encoding: "utf8", timeout: 120_000 });
	const stdout = (proc.stdout || "").trim();
	const stderr = (proc.stderr || "").trim();
	if (proc.status !== 0) {
		return { ok: false, summary: `pdq failed (${proc.status ?? "signal"})\n${stderr || stdout}` };
	}
	try {
		const line = stdout.split(/\r?\n/).find((entry) => entry.startsWith("PIDEX_QUALITY_RESULT="));
		const payload = JSON.parse(line ? line.slice("PIDEX_QUALITY_RESULT=".length) : stdout);
		return {
			ok: true,
			summary: [
				"PIDEX quality report complete.",
				`Markdown: ${payload.markdown}`,
				`JSON: ${payload.json}`,
				payload.review_state ? `Review state: ${payload.review_state}` : undefined,
				payload.plans ? `Plans: ${(payload.plans ?? []).join(", ") || "none"}` : undefined,
				payload.confidence ? `Confidence: ${payload.confidence}` : undefined,
				payload.trace_gaps !== undefined ? `Trace gaps: ${payload.trace_gaps}` : undefined,
			].filter(Boolean).join("\n"),
		};
	} catch {
		return { ok: true, summary: stdout || "pdq completed with no output" };
	}
}

function recordAgentMetric(result: RpResult, cwd: string, task: string): string | undefined {
	try {
		const project = safePathSegment(cwd);
		const routing = extractRoutingBlock(result.finalText);
		const contextFile = extractRoutingField(routing, "context_file");
		const planId = extractPlanId(task, result.finalText);
		const file = path.join(METRICS_DIR, project, `${planId}.jsonl`);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		const inputTokens = result.inputTokensEstimate ?? estimateTokensFromChars(result.inputChars ?? task.length);
		const outputTokens = result.outputTokensEstimate ?? estimateTokensFromChars(result.outputChars ?? result.finalText.length);
		const cost = result.costUsdEstimate ?? estimateCostUsd(result.model, inputTokens, outputTokens);
		const record = {
			timestamp: new Date().toISOString(),
			project: cwd,
			plan: planId,
			plan_uuid: extractPlanUuid(task, result.finalText),
			agent: result.agent,
			provider: result.provider,
			model: normalizeModelForPricing(result.model),
			duration_ms: result.durationMs,
			exit_code: result.exitCode,
			fallback_from: result.fallbackFrom,
			input_tokens_estimate: inputTokens,
			output_tokens_estimate: outputTokens,
			cache_read_tokens: result.cacheReadTokens,
			cache_write_tokens: result.cacheWriteTokens,
			cost_usd_estimate: cost,
			final_text_chars: result.finalText.length,
			agent_verdict: extractRoutingField(routing, "verdict"),
			route_to: extractRoutingField(routing, "route_to"),
			gate: extractRoutingField(routing, "gate"),
			routing_reason: extractRoutingField(routing, "reason"),
			context_file: contextFile,
			log_file: result.logFile,
			run_dir: result.runDir,
			session_dir: result.sessionDir,
			tool_count: result.toolCount,
			setup_error: result.setupError,
			source: "pidex_agent",
		};
		fs.appendFileSync(file, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
		result.inputTokensEstimate = inputTokens;
		result.outputTokensEstimate = outputTokens;
		result.costUsdEstimate = cost;
		return file;
	} catch (error: any) {
		result.warnings = [...(result.warnings ?? []), `Failed to record metrics: ${error?.message ?? error}`];
		return undefined;
	}
}

type RpAuditOptions = {
	plan?: string;
	hours?: number;
	top: number;
	all: boolean;
};

type RpAuditAgentStat = {
	calls: number;
	startTokens: number;
	toolChars: number;
	toolMsgs: number;
	readCalls: number;
	bashCalls: number;
	durationMs: number;
};

function splitArgs(input?: string): string[] {
	if (!input) return [];
	return input.trim().split(/\s+/).filter(Boolean);
}

function parseRpAuditOptions(input?: string): { options?: RpAuditOptions; error?: string; help?: boolean } {
	const args = splitArgs(input);
	const options: RpAuditOptions = { top: 10, all: false, hours: 24 };
	for (let i = 0; i < args.length; i += 1) {
		const a = args[i];
		if (a === "help" || a === "--help" || a === "-h") return { help: true };
		if (a === "--all") {
			options.all = true;
			continue;
		}
		if (a === "--plan" || a === "-p") {
			const v = args[i + 1];
			if (!v) return { error: "Missing value for --plan" };
			options.plan = v;
			i += 1;
			continue;
		}
		if (a === "--hours") {
			const v = Number.parseInt(args[i + 1] ?? "", 10);
			if (!Number.isFinite(v) || v <= 0) return { error: "--hours must be a positive integer" };
			options.hours = v;
			i += 1;
			continue;
		}
		if (a === "--top" || a === "-t") {
			const v = Number.parseInt(args[i + 1] ?? "", 10);
			if (!Number.isFinite(v) || v <= 0) return { error: "--top must be a positive integer" };
			options.top = v;
			i += 1;
			continue;
		}
		return { error: `Unknown argument: ${a}` };
	}
	return { options };
}

function rpAuditUsage(): string {
	return [
		"Usage: /pidexaudit [--plan plan-61|61|unknown-plan] [--hours N] [--top N] [--all]",
		"Examples:",
		"  /pidexaudit",
		"  /pidexaudit --plan 61",
		"  /pidexaudit --plan unknown-plan --all",
		"  /pidexaudit --hours 6 --top 20",
	].join("\n");
}

function readTextMaybeGzip(filePath: string): string {
	const raw = fs.readFileSync(filePath);
	if (filePath.endsWith(".gz")) return gunzipSync(raw).toString("utf8");
	return raw.toString("utf8");
}

function normalizePlanArg(planRaw: string): string {
	const stripped = planRaw.trim().replace(/\.jsonl$/i, "");
	if (!stripped) return "";
	if (stripped === "unknown-plan") return stripped;
	if (/^plan-[0-9][a-zA-Z0-9._-]*$/i.test(stripped)) return stripped.toLowerCase();
	if (/^[0-9][a-zA-Z0-9._-]*$/.test(stripped)) return `plan-${stripped.toLowerCase()}`;
	return stripped;
}

function formatInt(n: number): string {
	return new Intl.NumberFormat("en-US").format(Math.round(n));
}

function estimateTokens(chars: number): number {
	return Math.ceil(chars / 4);
}

function runRpAudit(cwd: string, options: RpAuditOptions): {
	reportPath: string;
	summary: string;
	rows: number;
} {
	const project = safePathSegment(cwd);
	const metricsDir = path.join(METRICS_DIR, project);
	if (!fs.existsSync(metricsDir)) {
		throw new Error(`No metrics directory for project: ${metricsDir}`);
	}
	const metricFiles = fs
		.readdirSync(metricsDir)
		.filter((name) => name.endsWith(".jsonl"))
		.map((name) => ({
			name,
			path: path.join(metricsDir, name),
			mtime: fs.statSync(path.join(metricsDir, name)).mtimeMs,
		}))
		.sort((a, b) => b.mtime - a.mtime);
	if (metricFiles.length === 0) throw new Error(`No metric files found in ${metricsDir}`);

	let selectedFiles = metricFiles;
	if (options.plan) {
		const plan = normalizePlanArg(options.plan);
		const exact = metricFiles.find((f) => f.name === `${plan}.jsonl`);
		if (!exact) throw new Error(`Plan metrics not found: ${plan}.jsonl`);
		selectedFiles = [exact];
	} else if (!options.all) {
		selectedFiles = [metricFiles[0]];
	}

	const cutoff = !options.all && options.hours
		? Date.now() - options.hours * 60 * 60 * 1000
		: undefined;

	const rows: Array<Record<string, any>> = [];
	for (const file of selectedFiles) {
		const text = fs.readFileSync(file.path, "utf8");
		for (const line of text.split("\n")) {
			if (!line.trim()) continue;
			try {
				const row = JSON.parse(line);
				if (cutoff && Date.parse(row.timestamp ?? "") < cutoff) continue;
				rows.push(row);
			} catch {
				// ignore bad metric lines
			}
		}
	}
	rows.sort((a, b) => String(a.timestamp ?? "").localeCompare(String(b.timestamp ?? "")));
	if (rows.length === 0) throw new Error("No metric rows after filters.");

	const byAgent = new Map<string, RpAuditAgentStat>();
	const fileReads = new Map<string, number>();
	let missingLogs = 0;
	let toolCharsTotal = 0;
	let toolMsgsTotal = 0;

	for (const row of rows) {
		const agent = String(row.agent ?? "unknown");
		const stat = byAgent.get(agent) ?? { calls: 0, startTokens: 0, toolChars: 0, toolMsgs: 0, readCalls: 0, bashCalls: 0, durationMs: 0 };
		stat.calls += 1;
		stat.startTokens += Number(row.input_tokens_estimate ?? 0);
		stat.durationMs += Number(row.duration_ms ?? 0);

		const logFile = row.log_file ? String(row.log_file) : "";
		if (!logFile || !fs.existsSync(logFile)) {
			missingLogs += 1;
			byAgent.set(agent, stat);
			continue;
		}

		const logText = readTextMaybeGzip(logFile);
		for (const line of logText.split("\n")) {
			if (!line.trim()) continue;
			let event: any;
			try {
				event = JSON.parse(line);
			} catch {
				continue;
			}
			if (event?.type === "message_start" && event?.message?.role === "toolResult") {
				const parts = Array.isArray(event.message.content) ? event.message.content : [];
				const chars = parts
					.filter((p: any) => p?.type === "text")
					.reduce((sum: number, p: any) => sum + String(p.text ?? "").length, 0);
				stat.toolChars += chars;
				stat.toolMsgs += 1;
				toolCharsTotal += chars;
				toolMsgsTotal += 1;
				continue;
			}
			if (event?.type === "message_update" && event?.assistantMessageEvent?.type === "toolcall_end") {
				const tc = event.assistantMessageEvent.toolCall ?? {};
				const name = String(tc.name ?? "");
				if (name === "read") {
					const p = tc.arguments?.path ? String(tc.arguments.path) : "";
					if (p) {
						stat.readCalls += 1;
						fileReads.set(p, (fileReads.get(p) ?? 0) + 1);
					}
				} else if (name === "bash") {
					stat.bashCalls += 1;
				}
			}
		}
		byAgent.set(agent, stat);
	}

	const agents = Array.from(byAgent.entries()).sort((a, b) => b[1].startTokens - a[1].startTokens);
	const topFiles = Array.from(fileReads.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, options.top)
		.map(([filePath, count]) => {
			const bytes = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
			return { filePath, count, bytes };
		});

	const lines: string[] = [];
	lines.push("# pidex Context Audit");
	lines.push("");
	lines.push(`- Generated: ${new Date().toISOString()}`);
	lines.push(`- Project: ${cwd}`);
	lines.push(`- Metric files: ${selectedFiles.map((f) => f.name).join(", ")}`);
	lines.push(`- Rows analyzed: ${rows.length}`);
	lines.push(`- Missing logs: ${missingLogs}`);
	lines.push(`- Tool result chars: ${formatInt(toolCharsTotal)} (~${formatInt(estimateTokens(toolCharsTotal))} tokens)`);
	lines.push("");
	lines.push("## By agent");
	lines.push("");
	lines.push("| Agent | Calls | StartTokEst | ToolChars | ToolTokEst | ToolMsgs | ReadCalls | BashCalls | RuntimeMin | ");
	lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
	for (const [agent, stat] of agents) {
		lines.push(`| ${agent} | ${formatInt(stat.calls)} | ${formatInt(stat.startTokens)} | ${formatInt(stat.toolChars)} | ${formatInt(estimateTokens(stat.toolChars))} | ${formatInt(stat.toolMsgs)} | ${formatInt(stat.readCalls)} | ${formatInt(stat.bashCalls)} | ${(stat.durationMs / 60000).toFixed(1)} |`);
	}
	lines.push("");
	lines.push(`## Top read files (top ${options.top})`);
	lines.push("");
	lines.push("| Reads | EstTok(file) | Bytes | File |");
	lines.push("|---:|---:|---:|---|");
	for (const item of topFiles) {
		lines.push(`| ${formatInt(item.count)} | ${formatInt(estimateTokens(item.bytes))} | ${formatInt(item.bytes)} | ${item.filePath} |`);
	}
	lines.push("");
	lines.push(`_Total tool messages: ${formatInt(toolMsgsTotal)}_`);

	const reportPath = path.join(os.tmpdir(), `pidexaudit-${project}-${Date.now()}.md`);
	fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });

	const summary = `pidexaudit ok — rows=${rows.length}, agents=${agents.length}, toolTokens~${formatInt(estimateTokens(toolCharsTotal))}, report=${reportPath}`;
	return { reportPath, summary, rows: rows.length };
}

async function runDelegateAuthPreflight(timeoutMs = 15000): Promise<{ ok: boolean; output: string }> {
	if (!fs.existsSync(CHECK_AUTH_SCRIPT)) return { ok: true, output: "" };
	let output = "";
	let timedOut = false;
	const exitCode = await new Promise<number>((resolve) => {
		const proc = spawn("bash", [CHECK_AUTH_SCRIPT, "--config", CONFIG_PATH], {
			cwd: PACKAGE_ROOT,
			stdio: ["ignore", "pipe", "pipe"],
		});
		const timer = setTimeout(() => {
			timedOut = true;
			proc.kill("SIGTERM");
			setTimeout(() => proc.kill("SIGKILL"), 5000).unref?.();
		}, timeoutMs);
		proc.stdout.on("data", (data) => (output = appendTail(output, data.toString(), 16 * 1024)));
		proc.stderr.on("data", (data) => (output = appendTail(output, data.toString(), 16 * 1024)));
		proc.on("close", (code) => {
			clearTimeout(timer);
			resolve(code ?? 0);
		});
		proc.on("error", () => {
			clearTimeout(timer);
			resolve(1);
		});
	});
	if (timedOut) output = appendTail(output, "\nDelegate auth preflight timed out.", 16 * 1024);
	return { ok: exitCode === 0 && !timedOut, output: output.trim() };
}

async function runRpAgent(params: {
	agent: string;
	task: string;
	cwd: string;
	model?: string;
	tools?: string[];
	timeoutSeconds?: number;
	sandboxContext?: SandboxRuntimeContext;
	signal?: AbortSignal;
	onUpdate?: (text: string) => void;
}): Promise<RpResult> {
	const startedAt = Date.now();
	const agent = loadAgent(params.agent);
	const model = params.model ?? agent.frontmatter.model;
	params.onUpdate?.(`${formatAgentProgressLabel(params.agent)}: starting via pi (${formatPiRunnerStartDetails(model)})...`);
	assertPiModelAllowed(model);
	const tools = params.tools ?? parseTools(agent.frontmatter.tools);
	const maxTurns = parsePositiveInt(agent.frontmatter.maxTurns);
	const systemPrompt = buildAgentSystemPrompt(params.agent, agent.body, "pi");
	const inputChars = systemPrompt.length + params.task.length;
	const runLog = createAgentRunLog(params.agent, params.cwd);
	const systemPromptFile = path.join(runLog.runDir, `${safePathSegment(params.agent)}.system.md`);
	const taskFile = path.join(runLog.runDir, `${safePathSegment(params.agent)}.task.md`);
	await fs.promises.mkdir(runLog.sessionDir, { recursive: true });
	await fs.promises.writeFile(systemPromptFile, systemPrompt, { encoding: "utf8", mode: 0o600 });
	await fs.promises.writeFile(taskFile, `Task: ${params.task}`, { encoding: "utf8", mode: 0o600 });
	try {
		const args = [
			"--mode",
			"json",
			"-p",
			"--session-dir",
			runLog.sessionDir,
			"--no-skills",
			"--no-prompt-templates",
			"--no-themes",
			"--append-system-prompt",
			systemPromptFile,
		];
		if (shouldDisableChildExtensions(tools, params.sandboxContext)) args.push("--no-extensions");
		if (model) args.push("--model", model);
		if (tools && tools.length > 0) args.push("--tools", tools.join(","));
		args.push(`@${taskFile}`);

		let stderr = "";
		let buffer = "";
		let aborted = false;
		let timedOut = false;
		let turnLimitHit = false;
		let stdoutEventCount = 0;
		let skippedLargeEventCount = 0;
		let droppingOversizedLine = false;
		let toolCount = 0;
		let turnCount = 0;
		let inputTokens = 0;
		let outputTokens = 0;
		let cacheReadTokens = 0;
		let cacheWriteTokens = 0;
		let observedCost = 0;
		let finalText = "";
		let observedModel = model;
		let proc: ReturnType<typeof spawn> | undefined;
		let cleanTerminalAssistantStopReceived = false;
		let forcedTerminationSignal = false;
		let finalDrainTimer: ReturnType<typeof setTimeout> | undefined;
		let finalHardKillTimer: ReturnType<typeof setTimeout> | undefined;
		const emitUpdate = createThrottledUpdate(params.onUpdate);
		const stderrStream = fs.createWriteStream(runLog.stderrFile, { flags: "a", mode: 0o600 });

		const clearFinalDrainTimers = () => {
			if (finalDrainTimer) clearTimeout(finalDrainTimer);
			if (finalHardKillTimer) clearTimeout(finalHardKillTimer);
			finalDrainTimer = undefined;
			finalHardKillTimer = undefined;
		};
		const startFinalDrain = () => {
			if (finalDrainTimer || !proc) return;
			finalDrainTimer = setTimeout(() => {
				if (!proc) return;
				forcedTerminationSignal = proc.kill("SIGTERM") || forcedTerminationSignal;
				finalHardKillTimer = setTimeout(() => {
					forcedTerminationSignal = proc?.kill("SIGKILL") || forcedTerminationSignal;
				}, FINAL_STOP_HARD_KILL_MS);
				finalHardKillTimer.unref?.();
			}, FINAL_STOP_GRACE_MS);
			finalDrainTimer.unref?.();
		};

		const parseLine = (line: string) => {
			if (!line.trim()) return;
			stdoutEventCount += 1;
			if (Buffer.byteLength(line, "utf8") > MAX_JSON_PARSE_LINE_BYTES) {
				skippedLargeEventCount += 1;
				return;
			}
			try {
				const event = JSON.parse(line);
				if (event?.type === "turn_start") {
					turnCount += 1;
					if (maxTurns && turnCount > maxTurns && proc) {
						turnLimitHit = true;
						proc.kill("SIGTERM");
						setTimeout(() => proc?.kill("SIGKILL"), 5000).unref?.();
					}
				}
				if (event?.type === "tool_execution_start") toolCount += 1;
				if (event?.type === "message_end" && event?.message?.role === "assistant") {
					const usage = event.message.usage;
					if (usage) {
						inputTokens += usage.input ?? usage.inputTokens ?? 0;
						outputTokens += usage.output ?? usage.outputTokens ?? 0;
						cacheReadTokens += usage.cacheRead ?? 0;
						cacheWriteTokens += usage.cacheWrite ?? 0;
						observedCost += usage.cost?.total ?? 0;
					}
					if (event.message.model) observedModel = event.message.model;
					const stopReason = event.message.stopReason;
					const hasToolCall = Array.isArray(event.message.content)
						&& event.message.content.some((part: any) => part?.type === "toolCall");
					if (stopReason === "stop" && !hasToolCall) {
						cleanTerminalAssistantStopReceived ||= !event.message.errorMessage;
						startFinalDrain();
					}
				}
				const text = finalAssistantTextFromEvent(event);
				if (text) {
					finalText = text;
					emitUpdate(text);
				}
			} catch {
				// Ignore non-JSON noise. Raw line is already preserved in the gzip log.
			}
		};

		const exitCode = await new Promise<number>((resolve) => {
			const piSpec = piChildSpawnSpec(args);
			proc = spawn(piSpec.command, piSpec.args, {
				cwd: params.cwd,
				stdio: ["ignore", "pipe", "pipe"],
				env: {
					...process.env,
					[PIDEX_CHILD_ENV]: "1",
					[PIDEX_PROJECT_BOUNDARY_ENV]: JSON.stringify({ active: true, projectRoot: resolveProjectRoot(params.cwd), pidexRoot: PACKAGE_ROOT, startedCwd: params.cwd }),
					...(params.sandboxContext ? { [PIDEX_SANDBOX_CONTEXT_ENV]: JSON.stringify(params.sandboxContext) } : {}),
					PI_SKIP_VERSION_CHECK: "1",
				},
			});
			const timeoutMs = params.timeoutSeconds ? Math.max(1, params.timeoutSeconds) * 1000 : undefined;
			const timeoutTimer = timeoutMs ? setTimeout(() => {
				timedOut = true;
				proc?.kill("SIGTERM");
				setTimeout(() => proc?.kill("SIGKILL"), 5000).unref?.();
			}, timeoutMs) : undefined;
			proc.stdout.on("data", (data) => {
				if (!runLog.writeChunk(data)) {
					proc?.stdout.pause();
					runLog.onDrain(() => proc?.stdout.resume());
				}
				buffer += data.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";
				for (const line of lines) {
					if (droppingOversizedLine) {
						droppingOversizedLine = false;
						continue;
					}
					parseLine(line);
				}
				if (buffer.length > MAX_LINE_BUFFER_CHARS) {
					skippedLargeEventCount += 1;
					buffer = "";
					droppingOversizedLine = true;
				}
			});
			proc.stderr.on("data", (data) => {
				stderr = appendTail(stderr, data.toString());
				stderrStream.write(data);
			});
			proc.on("close", (code) => {
				if (timeoutTimer) clearTimeout(timeoutTimer);
				clearFinalDrainTimers();
				stderrStream.end();
				if (buffer.trim()) parseLine(buffer);
				const forcedDrainAfterFinalSuccess = forcedTerminationSignal && cleanTerminalAssistantStopReceived;
				resolve(forcedDrainAfterFinalSuccess ? 0 : forcedTerminationSignal ? (code ?? 1) : (code ?? 0));
			});
			proc.on("error", () => {
				if (timeoutTimer) clearTimeout(timeoutTimer);
				clearFinalDrainTimers();
				stderrStream.end();
				resolve(1);
			});
			if (params.signal) {
				const kill = () => {
					aborted = true;
					proc?.kill("SIGTERM");
					setTimeout(() => proc?.kill("SIGKILL"), 5000).unref?.();
				};
				if (params.signal.aborted) kill();
				else params.signal.addEventListener("abort", kill, { once: true });
			}
		});
		emitUpdate(finalText, true);
		if (aborted) stderr = appendTail(stderr, "\nAborted by user.");
		if (timedOut) stderr = appendTail(stderr, `\nPi child timed out after ${params.timeoutSeconds}s.`);
		if (turnLimitHit) stderr = appendTail(stderr, `\nTurn limit exceeded (${maxTurns}).`);
		const warnings: string[] = [];
		if (skippedLargeEventCount > 0) warnings.push(`${skippedLargeEventCount} oversized child JSON events were logged but not parsed.`);
		if (finalText.length > MAX_AGENT_FINAL_CHARS) warnings.push(`Final response exceeded ${MAX_AGENT_FINAL_CHARS} chars; tool output may be truncated.`);
		const result: RpResult = {
			agent: params.agent,
			provider: "pi",
			model: observedModel,
			modelRequested: model,
			exitCode: (turnLimitHit || timedOut) && exitCode === 0 ? 1 : exitCode,
			stderr,
			finalText,
			logFile: runLog.logFile,
			runDir: runLog.runDir,
			sessionDir: runLog.sessionDir,
			stdoutEventCount,
			skippedLargeEventCount,
			toolCount,
			turnCount,
			maxTurns,
			durationMs: Date.now() - startedAt,
			inputChars,
			outputChars: finalText.length,
			inputTokensEstimate: inputTokens || undefined,
			outputTokensEstimate: outputTokens || undefined,
			cacheReadTokens: cacheReadTokens || undefined,
			cacheWriteTokens: cacheWriteTokens || undefined,
			costUsdEstimate: observedCost || undefined,
			timedOut,
			aborted,
			turnLimitHit,
			warnings: warnings.length ? warnings : undefined,
		};
		try {
			fs.writeFileSync(path.join(runLog.runDir, "metadata.json"), JSON.stringify({
				runner: "pi",
				provider: "pi",
				modelRequested: model,
				modelObserved: observedModel,
				agent: params.agent,
				cwd: params.cwd,
				startedAt: new Date(startedAt).toISOString(),
				endedAt: new Date().toISOString(),
				durationMs: result.durationMs,
				exitCode: result.exitCode,
				toolCount,
				usage: {
					input: inputTokens,
					output: outputTokens,
					cacheRead: cacheReadTokens,
					cacheWrite: cacheWriteTokens,
					cost: observedCost,
					turns: turnCount,
				},
				routing: {
					verdict: extractRoutingField(extractRoutingBlock(finalText), "verdict"),
					route_to: extractRoutingField(extractRoutingBlock(finalText), "route_to"),
					gate: extractRoutingField(extractRoutingBlock(finalText), "gate"),
					context_file: extractRoutingField(extractRoutingBlock(finalText), "context_file"),
				},
			}, null, 2), { encoding: "utf8", mode: 0o600 });
		} catch {}
		return result;
	} finally {
		try { await runLog.close(); } catch {}
	}
}

async function runCliDelegate(params: {
	agent: string;
	task: string;
	cwd: string;
	provider: string;
	model?: string;
	effort?: string;
	timeoutSeconds?: number;
	permissionMode?: AgentRoute["permission_mode"];
	delegateTools?: string[];
	allowedTools?: string[];
	disallowedTools?: string[];
	addDirs?: string[];
	dangerouslySkipPermissions?: boolean;
	signal?: AbortSignal;
	onUpdate?: (text: string) => void;
}): Promise<RpResult> {
	const startedAt = Date.now();
	const agent = loadAgent(params.agent);
	const provider = normalizeProvider(params.provider);
	const script = path.join(DELEGATE_DIR, `${provider}.sh`);
	if (provider !== "codex") {
		throw new Error(`Unsupported pidex delegate provider '${provider}' for ${params.agent}. PIDEX currently supports provider=pi and provider=codex only; use provider=pi for Pi-routed models.`);
	}
	if (!fs.existsSync(script)) throw new Error(`Delegate provider '${provider}' is configured but not installed: missing ${script}`);

	const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pidex-delegate-"));
	const promptFile = path.join(tmp, `${params.agent}.prompt.md`);
	const outputFile = path.join(tmp, `${params.agent}.out.md`);
	const prompt = buildCliDelegatePrompt(params.agent, agent.body, params.task, provider);
	await fs.promises.writeFile(promptFile, prompt, { encoding: "utf8", mode: 0o600 });

	params.onUpdate?.(`${formatAgentProgressLabel(params.agent)}: starting via delegate (${formatDelegateStartDetails(provider, params.model)})...`);

	let stderr = "";
	let timedOut = false;
	let aborted = false;
	const timeoutMs = Math.max(1, params.timeoutSeconds ?? 300) * 1000;

	try {
		const exitCode = await new Promise<number>((resolve) => {
			const proc = spawn("bash", [script], {
				cwd: params.cwd,
				stdio: ["ignore", "ignore", "pipe"],
				env: {
					...process.env,
					PROMPT_FILE: promptFile,
					OUTPUT_FILE: outputFile,
					MODEL: params.model ?? "",
					EFFORT: params.effort ?? "",
					PERMISSION_MODE: params.permissionMode ?? "",
					DELEGATE_TOOLS: (params.delegateTools ?? []).join(","),
					ALLOWED_TOOLS: (params.allowedTools ?? []).join(","),
					DISALLOWED_TOOLS: (params.disallowedTools ?? []).join(","),
					ADD_DIRS: (params.addDirs ?? []).join(","),
					DANGEROUSLY_SKIP_PERMISSIONS: params.dangerouslySkipPermissions ? "1" : "",
				},
			});
			const timer = setTimeout(() => {
				timedOut = true;
				proc.kill("SIGTERM");
				setTimeout(() => proc.kill("SIGKILL"), 5000).unref?.();
			}, timeoutMs);
			proc.stderr.on("data", (data) => (stderr = appendTail(stderr, data.toString())));
			proc.on("close", (code) => {
				clearTimeout(timer);
				resolve(code ?? 0);
			});
			proc.on("error", () => {
				clearTimeout(timer);
				resolve(1);
			});
			if (params.signal) {
				const kill = () => {
					aborted = true;
					proc.kill("SIGTERM");
					setTimeout(() => proc.kill("SIGKILL"), 5000).unref?.();
				};
				if (params.signal.aborted) kill();
				else params.signal.addEventListener("abort", kill, { once: true });
			}
		});

		let finalText = "";
		try {
			if (fs.existsSync(outputFile)) finalText = fs.readFileSync(outputFile, "utf8");
		} catch {}
		if (timedOut) stderr = appendTail(stderr, `\nDelegate timed out after ${params.timeoutSeconds ?? 300}s.`);
		if (aborted) stderr = appendTail(stderr, "\nAborted by user.");
		const warnings: string[] = [];
		if (finalText.length > MAX_AGENT_FINAL_CHARS) warnings.push(`Final response exceeded ${MAX_AGENT_FINAL_CHARS} chars; tool output may be truncated.`);
		return {
			agent: params.agent,
			provider,
			model: params.model,
			modelRequested: params.model,
			effort: params.effort,
			exitCode,
			stderr,
			finalText,
			durationMs: Date.now() - startedAt,
			inputChars: prompt.length,
			outputChars: finalText.length,
			setupError: exitCode === 1,
			timedOut,
			aborted,
			warnings: warnings.length ? warnings : undefined,
		};
	} finally {
		try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
	}
}

async function runConfiguredAgent(params: {
	agent: string;
	task: string;
	cwd: string;
	providerOverride?: string;
	modelOverride?: string;
	effortOverride?: string;
	tools?: string[];
	sandboxContext?: SandboxRuntimeContext;
	signal?: AbortSignal;
	onUpdate?: (text: string) => void;
}): Promise<RpResult> {
	params.onUpdate?.(`${formatAgentProgressLabel(params.agent)}: resolving route...`);
	const config = loadRoutingConfig();
	const route = resolveRoute(config, params.agent);
	const provider = normalizeProvider(params.providerOverride ?? route.provider);
	const explicitTools = normalizeToolList(params.tools);
	const delegateTools = TOOL_FORWARDING_AGENTS.has(params.agent) ? explicitTools ?? route.tools : route.tools;

	const runProvider = async (selectedProvider: string, fallbackFrom?: string): Promise<RpResult> => {
		if (isToolHeavyAgent(params.agent) && !isPiProvider(selectedProvider) && !supportsDelegateToolLoop(selectedProvider)) {
			return {
				agent: params.agent,
				provider: selectedProvider,
				model: params.modelOverride,
				exitCode: 1,
				stderr: `Capability guard: ${params.agent} requires tool-capable execution. Provider '${selectedProvider}' delegate path does not support repository tool loop. Use provider=pi.`,
				finalText: "",
				fallbackFrom,
				setupError: true,
				warnings: [`Capability guard blocked ${params.agent} on provider '${selectedProvider}'.`],
			};
		}
		// Agent route model/effort are provider-specific. If falling back to a
		// different provider, only keep explicit user overrides; otherwise let the
		// fallback provider use its own defaults/frontmatter.
		const selectedModel = params.modelOverride ?? (selectedProvider === provider ? route.model : undefined);
		const selectedEffort = params.effortOverride ?? (selectedProvider === provider ? route.effort : undefined);
		if (isPiProvider(selectedProvider)) {
			// When a delegated agent (e.g. Claude `sonnet`) falls back to Pi, do not
			// let delegate-only frontmatter model aliases leak into the Pi resolver.
			// Use the configured Pi default unless the caller explicitly overrode model.
			const piModel = selectedModel ?? (selectedProvider === provider ? undefined : config.defaults?.model);
			const result = await runRpAgent({
				agent: params.agent,
				task: params.task,
				cwd: params.cwd,
				model: piModel,
				tools: explicitTools,
				timeoutSeconds: route.timeout_seconds,
				sandboxContext: params.sandboxContext,
				signal: params.signal,
				onUpdate: params.onUpdate,
			});
			return { ...result, fallbackFrom };
		}
		const result = await runCliDelegate({
			agent: params.agent,
			task: params.task,
			cwd: params.cwd,
			provider: selectedProvider,
			model: selectedModel,
			effort: selectedEffort,
			timeoutSeconds: route.timeout_seconds,
			permissionMode: route.permission_mode,
			delegateTools: delegateTools,
			allowedTools: route.allowed_tools,
			disallowedTools: route.disallowed_tools,
			addDirs: route.add_dirs,
			dangerouslySkipPermissions: route.dangerously_skip_permissions,
			signal: params.signal,
			onUpdate: params.onUpdate,
		});
		return { ...result, fallbackFrom };
	};

	let result = await runProvider(provider);
	let missingRouting = result.exitCode === 0 && result.finalText && !hasRoutingBlock(result.finalText);
	let shouldFallback = result.exitCode !== 0 || !result.finalText || missingRouting;
	if (shouldFallback && !result.setupError && isPiProvider(provider) && !params.providerOverride) {
		params.onUpdate?.(`${formatAgentProgressLabel(params.agent)}: ${provider} returned invalid completion; retrying once on ${provider}.`);
		result = await runProvider(provider, provider);
		missingRouting = result.exitCode === 0 && result.finalText && !hasRoutingBlock(result.finalText);
		shouldFallback = result.exitCode !== 0 || !result.finalText || missingRouting;
	}
	const fallbackProviderRaw = config.fallback?.on_error?.trim().toLowerCase();
	const fallbackDisabled = !fallbackProviderRaw || ["none", "off", "disabled", "false"].includes(fallbackProviderRaw);
	const configuredFallback = normalizeProvider(config.fallback?.on_error);
	const fallbackProvider = fallbackDisabled ? "" : (configuredFallback === "pi" || configuredFallback === "codex" ? configuredFallback : "pi");
	if (shouldFallback && !result.setupError && fallbackProvider && fallbackProvider !== provider && !params.providerOverride) {
		params.onUpdate?.(`${formatAgentProgressLabel(params.agent)}: ${provider} failed${missingRouting ? " (missing ROUTING)" : ""}; falling back to ${fallbackProvider}.`);
		result = await runProvider(fallbackProvider, provider);
	}
	if (result.setupError) {
		result.warnings = [
			...(result.warnings ?? []),
			"Delegate setup/auth error: not falling back to Pi because setup failures should be fixed before the pipeline continues.",
		];
	}
	result.metricsFile = recordAgentMetric(result, params.cwd, params.task);
	const operatorEventFile = recordOperatorEvents(result, params.cwd, params.task);
	if (operatorEventFile) {
		result.warnings = [...(result.warnings ?? []), `Operator events recorded: ${operatorEventFile}`];
	}
	return result;
}

function shellEscapeForRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getGlobalGitHookStatus(): string {
	const expected = path.join(PACKAGE_ROOT, "modules", "pidex", "git-security-hooks", "scripts", "global");
	const legacy = path.join(PACKAGE_ROOT, "scripts", "git-hooks", "global");
	const current = spawnSync("git", ["config", "--global", "--get", "core.hooksPath"], { encoding: "utf8" });
	const currentPath = current.status === 0 ? current.stdout.trim() : "";
	const preCommit = path.join(expected, "pre-commit");
	const commitMsg = path.join(expected, "commit-msg");
	const executable = fs.existsSync(preCommit) && fs.existsSync(commitMsg);
	if (currentPath === expected && executable) return "installed/current";
	if (currentPath === legacy) return `legacy PIDEX hook path active; run git-security-hooks.install capability to migrate (expected ${expected})`;
	if (!currentPath) return `not active; global core.hooksPath is unset (expected ${expected})`;
	return `not active; global core.hooksPath=${currentPath} (expected ${expected})`;
}

function runParallelAgentsCommand(args: string | undefined, cwd: string | undefined): { ok: boolean; summary: string } {
	const parts = (args ?? "").trim().split(/\s+/).filter(Boolean);
	const action = parts[0] || "status";
	const runner = path.join(PACKAGE_ROOT, "scripts", "modules", "run-check.mjs");
	const project = path.resolve(cwd ?? process.cwd(), ".");
	let passthrough: string[];
	if (action === "status") passthrough = ["show"];
	else if (action === "clear" && parts[1]) passthrough = ["clear", "--lane", parts[1]];
	else return { ok: false, summary: "Usage: /pdparallel status | clear <lane-id>" };
	const commandArgs = [runner, "--capability", "parallel-agents.status", "--agent", "orchestrator", "--phase", "planning", "--project", project, "--", ...passthrough];
	const proc = spawnSync(process.execPath, commandArgs, { cwd: PACKAGE_ROOT, encoding: "utf8", timeout: 120_000 });
	const output = `${proc.stdout ?? ""}\n${proc.stderr ?? ""}`.trim();
	return { ok: proc.status === 0, summary: clipEnd(output || `pdparallel ${action} exit=${proc.status}`, 1600) };
}

function runWikiHygieneAudit(projectRoot: string): { ok: boolean; summary: string; reportMd?: string } {
	const runner = path.join(PACKAGE_ROOT, "scripts", "modules", "run-check.mjs");
	const proc = spawnSync(process.execPath, [runner, "--capability", "memory-wiki-hygiene.check", "--agent", "pidex-wiki-hygienist", "--phase", "maintenance", "--project", projectRoot], { cwd: PACKAGE_ROOT, encoding: "utf8", timeout: 120_000 });
	const output = `${proc.stdout ?? ""}\n${proc.stderr ?? ""}`.trim();
	const line = (proc.stdout ?? "").split(/\r?\n/).find((entry) => entry.startsWith("PIDEX_WIKI_HYGIENE_RESULT="));
	if (proc.status !== 0 || !line) {
		return { ok: false, summary: `Wiki hygiene audit failed${proc.status !== null ? ` exit=${proc.status}` : ""}: ${clipEnd(output, 1200)}` };
	}
	try {
		const parsed = JSON.parse(line.slice("PIDEX_WIKI_HYGIENE_RESULT=".length));
		const reportMd = parsed.report_md || parsed.markdown;
		const summary = `Wiki hygiene audit complete: ${reportMd} (score=${parsed.score}, critical=${parsed.critical ?? parsed.counts?.critical ?? 0}, high=${parsed.high ?? parsed.counts?.high ?? 0})`;
		return { ok: true, summary, reportMd };
	} catch (error: any) {
		return { ok: false, summary: `Wiki hygiene audit result parse failed: ${error?.message ?? error}` };
	}
}

function canonicalHomeStatus(): { ok: boolean; path: string; message?: string } {
	const homeRoot = path.resolve(CANONICAL_HOME_ROOT);
	if (isPidexRuntimeRoot(homeRoot)) return { ok: true, path: homeRoot };
	if (fs.existsSync(homeRoot)) {
		return {
			ok: false,
			path: homeRoot,
			message: `PIDEX canonical runtime root exists but is not a valid PIDEX checkout: ${homeRoot}`,
		};
	}
	return {
		ok: false,
		path: homeRoot,
		message: `PIDEX canonical runtime root is missing: ${homeRoot}`,
	};
}

function canonicalHomeMissingMessage(): string {
	return [
		"PIDEX is installed as a Pi bootstrap package, but the canonical runtime checkout is not initialized.",
		`Required path: ${path.resolve(CANONICAL_HOME_ROOT)}`,
		"",
		"Run:",
		"  /pidex-init-home",
		"",
		"This will clone PIDEX into the canonical runtime checkout, run the platform installer, and remove the bootstrap package registration so /reload uses the canonical checkout.",
	].join("\n");
}

function runCommandForInit(command: string, args: string[], cwd?: string): { ok: boolean; output: string } {
	const proc = spawnSync(command, args, { cwd, encoding: "utf8", timeout: 20 * 60_000 });
	const output = [proc.stdout, proc.stderr].filter(Boolean).join("\n").trim();
	return { ok: proc.status === 0, output };
}

async function initializePidexHome(ctx: any): Promise<void> {
	const status = canonicalHomeStatus();
	if (status.ok) {
		await ctx.ui.notify(`PIDEX canonical runtime root already exists: ${status.path}`, "info");
		return;
	}
	if (fs.existsSync(status.path)) {
		await ctx.ui.notify(`${status.message}\nMove or remove that directory before running /pidex-init-home.`, "error");
		return;
	}
	if (ctx.hasUI) {
		const installer = process.platform === "win32" ? "install.windows.ps1" : "install.sh";
		const choice = await ctx.ui.select(`Initialize PIDEX canonical runtime root at ${status.path}?\n\nThis clones https://github.com/d-trattner/pidex.git, runs ${installer}, then removes the npm/git bootstrap package registration if present.`, ["Initialize", "Cancel"]);
		if (choice !== "Initialize") return;
	}
	const parent = path.dirname(status.path);
	fs.mkdirSync(parent, { recursive: true });
	let result = runCommandForInit("git", ["clone", "--", "https://github.com/d-trattner/pidex.git", status.path], parent);
	if (!result.ok) {
		await ctx.ui.notify(`PIDEX clone failed:\n${result.output}`, "error");
		return;
	}
	if (process.platform === "win32") {
		result = runCommandForInit("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "install.windows.ps1", "-NonInteractive"], status.path);
	} else {
		result = runCommandForInit("bash", ["install.sh", "--skip-global-git-hook"], status.path);
	}
	if (!result.ok) {
		const installer = process.platform === "win32" ? "install.windows.ps1" : "install.sh";
		await ctx.ui.notify(`PIDEX ${installer} failed. Checkout remains at ${status.path}.\n\n${result.output}`, "error");
		return;
	}
	const cleanupSpecs = [
		"npm:@d-trattner/pidex",
		BOOTSTRAP_PACKAGE_VERSION ? `npm:@d-trattner/pidex@${BOOTSTRAP_PACKAGE_VERSION}` : undefined,
		"git:https://github.com/d-trattner/pidex",
	].filter(Boolean) as string[];
	const cleanup = cleanupSpecs.map((spec) => runCommandForInit("pi", ["remove", spec]));
	const cleanupNotes = cleanup.map((entry) => entry.output).filter(Boolean).join("\n");
	await ctx.ui.notify([
		`PIDEX initialized at ${status.path}.`,
		"Run /reload so Pi loads the canonical PIDEX checkout.",
		cleanupNotes ? `\nBootstrap cleanup output:\n${cleanupNotes}` : "",
	].join("\n"), "info");
}

function sensitiveSandboxPath(value: string | undefined): string | undefined {
	if (!value) return undefined;
	const normalized = value.replaceAll("\\", "/");
	const patterns = [
		/(^|\/)\.env($|\.)/,
		/(^|\/)\.npmrc$/,
		/(^|\/)\.yarnrc(\.yml)?$/,
		/(^|\/)\.git-credentials$/,
		/(^|\/)\.netrc$/,
		/(^|\/)auth\.json$/i,
		/(^|\/)secrets?\//,
		/\.(pem|key|crt|p12|pfx|kubeconfig)$/,
		/(^|\/)\.ssh\//,
		/(^|\/)\.aws\//,
		/(^|\/)\.codex\//,
		/(^|\/)AppData\/(Roaming|Local)\/.*(auth|token|credential)/i,
	];
	return patterns.some((pattern) => pattern.test(normalized)) ? normalized : undefined;
}

const SAFE_SANDBOX_HOST_HELPERS = new Set([
	"probe.mjs",
	"exec.mjs",
	"run-command.mjs",
	"status.mjs",
	"diff.mjs",
	"apply.mjs",
	"extract-artifacts.mjs",
	"cleanup.mjs",
]);

function sandboxRuntimeHelperMarker(): string {
	return ["modules", "pidex", "sandbox-runtime", "scripts", "sandbox", ""].join("/");
}

function canonicalSandboxHelperPath(helperName: string): string | undefined {
	if (!SAFE_SANDBOX_HOST_HELPERS.has(helperName)) return undefined;
	const candidate = path.join(PACKAGE_ROOT, "modules", "pidex", "sandbox-runtime", "scripts", "sandbox", helperName);
	try { return fs.realpathSync(candidate); } catch { return undefined; }
}

export function commandMentionsSandboxRuntimeHelper(command: string): boolean {
	return command.replaceAll("\\", "/").includes(sandboxRuntimeHelperMarker());
}

function splitStrictHostHelperCommand(command: string): string[] | undefined {
	const raw = String(command || "");
	if (!raw.trim()) return [];
	if (/[\r\n`<>|;&]/.test(raw) || /\$\s*\(/.test(raw) || /\b(?:&&|\|\|)\b/.test(raw)) return undefined;
	if (/["']/.test(raw)) return undefined;
	const tokens = raw.trim().split(/\s+/);
	if (tokens.some((token) => !/^[A-Za-z0-9_@%+=:,./\\-]+$/.test(token))) return undefined;
	return tokens;
}

export function sandboxHostBashAllowed(command: string): boolean {
	const tokens = splitStrictHostHelperCommand(command);
	if (!tokens) return false;
	if (tokens.length === 0) return true;
	const nodeBin = path.basename(tokens[0]).toLowerCase();
	if (nodeBin !== "node" && nodeBin !== "node.exe") return false;
	const helper = tokens[1];
	if (!helper || !path.isAbsolute(helper)) return false;
	const helperName = path.basename(helper);
	const canonical = canonicalSandboxHelperPath(helperName);
	if (!canonical) return false;
	try {
		const resolved = path.resolve(helper);
		return resolved === canonical && !fs.lstatSync(resolved).isSymbolicLink() && fs.realpathSync(resolved) === canonical;
	} catch {
		return false;
	}
}

function readSandboxRuntimeContext(): SandboxRuntimeContext | undefined {
	const raw = process.env[PIDEX_SANDBOX_CONTEXT_ENV];
	if (!raw) return undefined;
	try {
		const parsed = JSON.parse(raw);
		if (parsed?.mode !== "hardened-pipeline") return undefined;
		const hostProjectRoot = path.resolve(String(parsed.hostProjectRoot || ""));
		const sandboxWorkspace = path.resolve(String(parsed.sandboxWorkspace || ""));
		const allowedWriteRoot = path.resolve(String(parsed.allowedWriteRoot || sandboxWorkspace));
		if (!hostProjectRoot || !sandboxWorkspace || !allowedWriteRoot) return undefined;
		return { mode: "hardened-pipeline", runId: String(parsed.runId || ""), hostProjectRoot, sandboxWorkspace, allowedWriteRoot };
	} catch {
		return undefined;
	}
}

function pathWithin(root: string, target: string): boolean {
	const rel = path.relative(path.resolve(root), path.resolve(target));
	return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function normalizeHostPath(value: string, cwd: string): string {
	let raw = String(value || "").trim();
	if (/^\/[a-zA-Z]\//.test(raw)) raw = `${raw[1]}:/${raw.slice(3)}`;
	if (/^\/mnt\/[a-zA-Z]\//.test(raw)) raw = `${raw[5]}:/${raw.slice(7)}`;
	const resolved = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(cwd, raw);
	try { return fs.existsSync(resolved) ? fs.realpathSync.native(resolved) : path.resolve(resolved); } catch { return path.resolve(resolved); }
}

function boundaryPathWithin(root: string, target: string): boolean {
	const rootResolved = path.resolve(root);
	const targetResolved = path.resolve(target);
	if (process.platform === "win32") {
		const rel = path.win32.relative(rootResolved.toLowerCase(), targetResolved.toLowerCase());
		return rel === "" || (!rel.startsWith("..") && !path.win32.isAbsolute(rel));
	}
	return pathWithin(rootResolved, targetResolved);
}

function allowedPidexRuntimeWrite(pidexRoot: string, target: string): boolean {
	const rel = path.relative(path.resolve(pidexRoot), path.resolve(target)).replaceAll("\\", "/");
	return /^(state\/(runs|metrics|modules|pipeline-events|orchestrator-events|provider-limits|sandbox)(\/|$))/.test(rel);
}

type ProjectBoundaryContext = { active: true; projectRoot: string; pidexRoot: string; startedCwd: string };

function readProjectBoundaryContext(ctx: any): ProjectBoundaryContext | undefined {
	const raw = process.env[PIDEX_PROJECT_BOUNDARY_ENV];
	if (raw) {
		try {
			const parsed = JSON.parse(raw);
			if (parsed?.active && parsed.projectRoot) return { active: true, projectRoot: path.resolve(String(parsed.projectRoot)), pidexRoot: path.resolve(String(parsed.pidexRoot || PACKAGE_ROOT)), startedCwd: path.resolve(String(parsed.startedCwd || parsed.projectRoot)) };
		} catch {}
	}
	const cwd = path.resolve(String(ctx?.cwd || process.cwd()));
	return { active: true, projectRoot: resolveProjectRoot(cwd), pidexRoot: PACKAGE_ROOT, startedCwd: cwd };
}

function toolPathCandidate(input: any): string | undefined {
	if (!input || typeof input !== "object") return undefined;
	const keys = ["path", "file", "filepath", "filePath", "target", "targetPath"];
	for (const key of keys) if (typeof input[key] === "string" && input[key].trim()) return input[key];
	return undefined;
}

export function inspectProjectBoundaryToolCall(event: any, ctx: any): { block: boolean; reason: string } | undefined {
	const boundary = readProjectBoundaryContext(ctx);
	if (!boundary) return undefined;
	const toolName = String(event?.toolName || "");
	const cwd = path.resolve(String(ctx?.cwd || boundary.startedCwd || boundary.projectRoot));
	if (toolName === "read") {
		const raw = toolPathCandidate(event?.input);
		const blocked = sensitiveSandboxPath(raw);
		if (blocked) return { block: true, reason: `PIDEX project boundary blocks reads of env/secret/runtime paths: ${blocked}` };
		if (!raw) return undefined;
		const resolved = normalizeHostPath(raw, cwd);
		if (boundaryPathWithin(boundary.projectRoot, resolved) || boundaryPathWithin(boundary.pidexRoot, resolved)) return undefined;
		return { block: true, reason: `PIDEX project boundary blocks read outside project/PIDEX roots. target=${resolved}; project_root=${boundary.projectRoot}; pidex_root=${boundary.pidexRoot}` };
	}
	if (toolName === "write" || toolName === "edit") {
		const raw = toolPathCandidate(event?.input);
		if (!raw) return { block: true, reason: `PIDEX project boundary blocks ${toolName} without an explicit file path.` };
		const resolved = normalizeHostPath(raw, cwd);
		const blocked = sensitiveSandboxPath(resolved);
		if (blocked) return { block: true, reason: `PIDEX project boundary blocks ${toolName} to env/secret/runtime path: ${blocked}` };
		if (boundaryPathWithin(boundary.projectRoot, resolved)) return undefined;
		if (boundaryPathWithin(boundary.pidexRoot, resolved) && allowedPidexRuntimeWrite(boundary.pidexRoot, resolved)) return undefined;
		return { block: true, reason: `PIDEX project boundary blocks ${toolName} outside run project root. target=${resolved}; project_root=${boundary.projectRoot}` };
	}
	if (toolName === "bash") {
		const command = String(event?.input?.command || "");
		if (!command) return undefined;
		const compact = command.replace(/\\\n/g, " ").replace(/\s+/g, " ").trim();
		const highRisk = [
			/\bgit\s+config\s+--global\b/i,
			/\b(?:npm|pnpm|yarn)\s+config\s+set\b/i,
			/\bpi\s+(?:install|remove)\b/i,
			/\bdocker\s+run\b[\s\S]*-v\s+(?:\/|[A-Za-z]:\\|[A-Za-z]:\/):\/host/i,
			/\brm\s+-rf\s+(?:\/|[A-Za-z]:[\\/])/i,
			/\bdel\s+\/s\s+[A-Za-z]:[\\/]/i,
			/\bRemove-Item\b[\s\S]*[A-Za-z]:[\\/]/i,
		];
		if (highRisk.some((pattern) => pattern.test(compact))) return { block: true, reason: "PIDEX project boundary blocks high-risk host/global mutation command." };
	}
	return undefined;
}

export function inspectSandboxToolCall(event: any, ctx: any): { block: boolean; reason: string } | undefined {
	const active = readSandboxRuntimeContext();
	if (!active) return undefined;
	const toolName = String(event?.toolName || "");
	if (toolName === "read") {
		const blocked = sensitiveSandboxPath(toolPathCandidate(event?.input));
		if (blocked) return { block: true, reason: `PIDEX sandbox blocks reads of env/secret/runtime paths while active: ${blocked}` };
		return undefined;
	}
	if (toolName === "write" || toolName === "edit") {
		const raw = toolPathCandidate(event?.input);
		if (!raw) return { block: true, reason: `PIDEX sandbox blocks ${toolName} without an explicit file path.` };
		const resolved = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(ctx?.cwd || active.sandboxWorkspace, raw);
		if (pathWithin(active.allowedWriteRoot, resolved)) return undefined;
		return { block: true, reason: `PIDEX sandbox blocks ${toolName} outside sandbox workspace. target=${resolved}; allowed=${active.allowedWriteRoot}` };
	}
	if (toolName === "bash") {
		const command = event?.input?.command;
		if (typeof command !== "string") return { block: true, reason: "PIDEX sandbox blocks bash without an explicit command while sandbox context is active." };
		if (sandboxHostBashAllowed(command)) return undefined;
		const helperDetail = commandMentionsSandboxRuntimeHelper(command) ? " Malformed sandbox helper attempts must use one exact canonical node <sandbox-helper.mjs> invocation without shell chaining, pipes, redirects, substitutions, or quotes." : "";
		return { block: true, reason: `PIDEX sandbox blocks raw host bash while sandbox context is active. Use canonical sandbox runtime helpers or operate through the sandbox/Docker runner.${helperDetail}` };
	}
	return undefined;
}

function inspectBashForGitHookRisk(command: string): { block?: string; warn?: string } | undefined {
	const compact = command.replace(/\\\n/g, " ").replace(/\s+/g, " ").trim();
	if (!compact) return undefined;
	if (/\bgit\b[\s\S]*\bcommit\b[\s\S]*(--no-verify|--no-gpg-sign)/.test(compact)) {
		return { block: "PIDEX blocks git commit bypass flags (--no-verify/--no-gpg-sign). Remove the flag and let the security hook run." };
	}
	const escapedRoot = shellEscapeForRegex(PACKAGE_ROOT);
	const tamperPatterns = [
		/git\s+config\s+(--global\s+)?(--unset\s+)?core\.hooksPath/,
		/rm\s+.*\.git\/hooks\/(pre-commit|commit-msg)/,
		/chmod\s+-x\s+.*\.git\/hooks\/(pre-commit|commit-msg)/,
		new RegExp(`rm\\s+.*${escapedRoot}/.*git-security-hooks/scripts/global/(pre-commit|commit-msg)`),
		new RegExp(`chmod\\s+-x\\s+.*${escapedRoot}/.*git-security-hooks/scripts/global/(pre-commit|commit-msg)`),
	];
	if (tamperPatterns.some((pattern) => pattern.test(compact))) {
		return { warn: "This command may modify Git hook protection. Continue only if intentionally installing/uninstalling or repairing PIDEX hooks." };
	}
	return undefined;
}

const RpAgentParams = Type.Object({
	agent: Type.String({ description: "pidex-* agent to run, e.g. pidex-planner, pidex-critic, pidex-implementer" }),
	task: Type.String({ description: "Full task/context for the agent. Include relevant doc paths and required output path." }),
	cwd: Type.Optional(Type.String({ description: "Project working directory. Defaults to current Pi cwd." })),
	provider: Type.Optional(Type.String({ description: "Optional provider override: pi or codex. Defaults to config/agents.json. Use provider=pi for Pi-routed provider/model IDs such as deepseek/... or minimax/...." })),
	model: Type.Optional(Type.String({ description: "Optional model override. For provider=pi this may be a Pi-routed model ID; for provider=codex it is passed to the Codex CLI." })),
	effort: Type.Optional(Type.String({ description: "Optional reasoning-effort override. For Codex/Pi-routed Codex models: low/medium/high/xhigh where supported." })),
	tools: Type.Optional(Type.Array(Type.String(), { description: "Optional Pi tool allowlist override (only used by provider=pi/subagent)." })),
});

export default function runningPi(pi: ExtensionAPI) {
	pi.on("tool_call", async (event: any, ctx: any) => {
		const sandboxBlock = inspectSandboxToolCall(event, ctx);
		if (sandboxBlock) return sandboxBlock;
		const boundaryBlock = inspectProjectBoundaryToolCall(event, ctx);
		if (boundaryBlock) return boundaryBlock;
		if (process.env[PIDEX_CHILD_ENV] === "1") return undefined;
		const sandboxState = resolveSandboxState();
		if (sandboxState.enabled && event?.toolName === "read") {
			const blocked = sensitiveSandboxPath(event?.input?.path || event?.input?.file || event?.input?.filepath);
			if (blocked) return { block: true, reason: `PIDEX sandbox blocks reads of env/secret/runtime paths while active: ${blocked}` };
		}
		if (event?.toolName !== "bash") return undefined;
		const command = event?.input?.command;
		if (typeof command !== "string") return undefined;
		const risk = inspectBashForGitHookRisk(command);
		if (!risk) return undefined;
		if (risk.block) return { block: true, reason: risk.block };
		if (risk.warn) {
			if (!ctx.hasUI) return { block: true, reason: "PIDEX Git hook protection change requires interactive approval." };
			const choice = await ctx.ui.select(`${risk.warn}\n\nCommand:\n${command.slice(0, 1200)}\n\nAllow?`, ["Yes", "No"]);
			if (choice !== "Yes") return { block: true, reason: "PIDEX Git hook protection change was not approved." };
		}
		return undefined;
	});

	if (process.env[PIDEX_CHILD_ENV] === "1") return;

	pi.registerCommand("pidexaudit", {
		description: "Audit pidex context usage from metrics + child logs.",
		handler: async (argLine, ctx) => {
			const homeStatus = canonicalHomeStatus();
			if (!homeStatus.ok) {
				await ctx.ui.notify(homeStatus.message?.includes("not a valid") ? `${homeStatus.message}\nMove or repair that directory before running pidexaudit.` : canonicalHomeMissingMessage(), "warning");
				return;
			}
			const parsed = parseRpAuditOptions(argLine);
			if (parsed.help) {
				await ctx.ui.notify(rpAuditUsage(), "info");
				return;
			}
			if (parsed.error || !parsed.options) {
				await ctx.ui.notify(`${parsed.error ?? "Invalid args"}\n\n${rpAuditUsage()}`, "warning");
				return;
			}
			try {
				const result = runRpAudit(ctx.cwd, parsed.options);
				await ctx.ui.notify(result.summary, "info");
			} catch (error: any) {
				await ctx.ui.notify(`pidexaudit failed: ${error?.message ?? error}`, "error");
			}
		},
	});

	const startRunningPi = async (args: string | undefined, ctx: any) => {
		const task = args?.trim();
		const homeStatus = canonicalHomeStatus();
		if (!homeStatus.ok) {
			ctx.ui.notify(homeStatus.message?.includes("not a valid") ? `${homeStatus.message}\nMove or repair that directory before starting PIDEX.` : canonicalHomeMissingMessage(), "warning");
			return;
		}
		const projectPipelineMode = await resolveProjectPipelineModeForCommand(ctx);
		if (!projectPipelineMode.ok && projectPipelineMode.decision_required) {
			ctx.ui.notify(`PIDEX project mode is required before starting: ${projectPipelineMode.reason ?? "missing saved mode"}`, "warning");
			return;
		}
		if (shouldStartProjectPipelineRunFlow(projectPipelineMode)) {
			await startProjectPipelineRunFlow(ctx, task);
			return;
		}
		const authPreflight = await runDelegateAuthPreflight();
		const gitHookStatus = getGlobalGitHookStatus();
		const sandboxState = resolveSandboxState();
		const sandboxProbe = sandboxState.enabled ? probeSandboxAvailability() : { ok: true, summary: sandboxEvidenceLine() };
		if (sandboxState.enabled && !sandboxProbe.ok) {
			ctx.ui.notify(`PIDEX sandbox is enabled but unavailable: ${sandboxProbe.summary}`, "error");
			return;
		}
		if (!authPreflight.ok) {
			ctx.ui.notify("pidex delegate auth preflight failed; see injected instructions", "error");
		} else if (authPreflight.output) {
			ctx.ui.notify("pidex delegate auth preflight OK", "info");
		}
		recordPreflightSkeleton(ctx.cwd ?? PACKAGE_ROOT, task, authPreflight.ok, gitHookStatus);
		const kickoff = [
			"You are the pidex orchestrator.",
			`First read the orchestration skill at ${SKILL_PATH}.`,
			"Use direct mode. Do not use background/Telegram mode unless the user explicitly asks and accepts that it is scaffold-only.",
			"Use the pidex_agent tool for specialist handoffs, including pidex-wiki-hygienist for wiki hygiene/project memory maintenance. Keep project artifacts under agents.output/ and wiki/ using pidex-* conventions. Treat the final ROUTING block as authoritative and require context_file to exist. ROUTING route_to may be an pidex-* agent, user, or orchestrator for deterministic internal work such as browser-evidence collection.",
			"Run the pre-flight interview before invoking pidex-planner. If the fixed interview is insufficient, read ~/.pi/agent/skills/grill-me/SKILL.md and use it to ask one question at a time, with your recommended answer, until the epic is crisp.",
			`PIDEX global Git security hook: ${gitHookStatus}.`,
			`PIDEX pipeline mode: ${projectPipelineModeEvidenceLine(projectPipelineMode)}.`,
			projectPipelineModeInstructionLine(projectPipelineMode),
			`PIDEX sandbox preflight: ${sandboxState.enabled ? "hardened-pipeline enabled" : "off"}; ${sandboxProbe.summary}.`,
			sandboxState.enabled
				? "Sandbox is internal hardening, not a user workflow change. Continue normal /pidex orchestration and dynamic routing. For source-mutating/risky phases, use the sandbox runtime helpers and include sandbox evidence or SANDBOX-SKIP in artifacts. Do not ask the user mid-run for sandbox configuration."
				: "Sandbox is off by config; do not probe Docker or alter normal /pidex routing for sandbox unless local config enables it.",
			authPreflight.ok
				? "Delegate auth preflight passed for configured non-Pi providers."
				: `Delegate auth preflight failed. Do not start delegated agents until this is resolved, or explicitly override those agents to provider=pi. Output:\n${authPreflight.output}`,
			task ? `Initial user task: ${task}` : "Initial user task: not provided; begin by asking which project and what deliverable.",
		].join("\n\n");
		ctx.ui.notify("Starting pidex direct-mode orchestrator", "info");
		pi.sendUserMessage(kickoff);
	};

	pi.registerCommand("pidex-init-home", {
		description: "Initialize the canonical PIDEX runtime checkout at ~/pidex from the bootstrap package.",
		handler: async (_argLine, ctx) => initializePidexHome(ctx),
	});

	pi.registerCommand("pidex", {
		description: "Start the pidex pidex-* software-delivery pipeline (direct-mode MVP).",
		handler: startRunningPi,
	});

	pi.registerCommand("pd", {
		description: "Start the pidex pidex-* software-delivery pipeline (direct-mode MVP).",
		handler: startRunningPi,
	});

	pi.registerCommand("pdproject", {
		description: "Manage local Project Pipeline Docker sandboxes (status/open/remove).",
		handler: async (argLine, ctx) => {
			const homeStatus = canonicalHomeStatus();
			if (!homeStatus.ok) {
				await ctx.ui.notify(homeStatus.message?.includes("not a valid") ? `${homeStatus.message}\nMove or repair that directory before running pdproject.` : canonicalHomeMissingMessage(), "warning");
				return;
			}
			try {
				const parsed = parsePdProjectArgs(argLine);
				const result = runPdProjectCommand(parsed);
				await ctx.ui.notify(result.summary, result.ok ? "info" : "error");
			} catch (error: any) {
				await ctx.ui.notify(`${error?.message ?? error}\n\n${pdProjectUsage()}`, "warning");
			}
		},
	});

	pi.registerCommand("pdq", {
		description: "Run read-only PIDEX quality/self-improvement report.",
		handler: async (argLine, ctx) => {
			const homeStatus = canonicalHomeStatus();
			if (!homeStatus.ok) {
				await ctx.ui.notify(homeStatus.message?.includes("not a valid") ? `${homeStatus.message}\nMove or repair that directory before running PDQ.` : canonicalHomeMissingMessage(), "warning");
				return;
			}
			const result = runPidexQualityReport(ctx.cwd ?? PACKAGE_ROOT, argLine);
			await ctx.ui.notify(result.summary, result.ok ? "info" : "error");
		},
	});

	pi.registerCommand("pdmem", {
		description: "Save a simple PIDEX project session memory snapshot to <project-root>/wiki/session-memory/.",
		handler: async (argLine, ctx) => {
			try {
				const filePath = savePidexMemory(ctx, argLine);
				await ctx.ui.notify(`PIDEX memory saved: ${filePath}`, "info");
			} catch (error: any) {
				await ctx.ui.notify(`pdmem failed: ${error?.message ?? error}`, "error");
			}
		},
	});

	pi.registerCommand("pdwiki", {
		description: "Run a read-only PIDEX wiki hygiene audit for the current or given project root.",
		handler: async (argLine, ctx) => {
			const homeStatus = canonicalHomeStatus();
			if (!homeStatus.ok) {
				await ctx.ui.notify(homeStatus.message?.includes("not a valid") ? `${homeStatus.message}\nMove or repair that directory before running wiki hygiene.` : canonicalHomeMissingMessage(), "warning");
				return;
			}
			const raw = argLine?.trim();
			const projectRoot = raw ? path.resolve(ctx.cwd ?? process.cwd(), raw) : path.resolve(ctx.cwd ?? process.cwd());
			const result = runWikiHygieneAudit(projectRoot);
			await ctx.ui.notify(result.summary, result.ok ? "info" : "error");
		},
	});

	pi.registerCommand("pdparallel", {
		description: "Inspect or test optional PIDEX parallel agent lanes.",
		handler: async (argLine, ctx) => {
			const homeStatus = canonicalHomeStatus();
			if (!homeStatus.ok) {
				await ctx.ui.notify(homeStatus.message?.includes("not a valid") ? `${homeStatus.message}\nMove or repair that directory before inspecting parallel agents.` : canonicalHomeMissingMessage(), "warning");
				return;
			}
			const result = runParallelAgentsCommand(argLine, ctx.cwd);
			await ctx.ui.notify(result.summary, result.ok ? "info" : "warning");
		},
	});

	const rpAgentTool: any = {
		name: "pidex_agent",
		label: "pidex Agent",
		description: "Run a bundled pidex-* specialist agent through config/agents.json. Defaults to lean Pi subprocesses, with optional Codex CLI delegates for configured agents. Raw child logs are stored outside the parent Pi session.",
		promptSnippet: "Run a bundled pidex-* specialist agent using pidex provider routing from config/agents.json.",
		promptGuidelines: [
			"Use pidex_agent for pidex specialist handoffs such as pidex-planner, pidex-critic, pidex-implementer, pidex-code-reviewer, pidex-qa, pidex-uat, pidex-devops, pidex-wiki-hygienist, pidex-retrospective, and pidex-pi.",
			"pidex_agent automatically honors <pidex-root>/config/agents.json unless provider/model/effort are explicitly overridden.",
			"Configured optional parallel agents live in <pidex-root>/config/parallel-agents.json. When enabled, the orchestrator must automatically launch matching pidex-critic after-plan and pidex-code-reviewer after-implementation secondary lanes as separate visible pidex_agent calls with explicit provider/model/effort overrides and unique expected output paths. pidex_agent itself does not spawn nested agents.",
			"When using pidex_agent, pass complete context in the task, including project cwd, current epic, relevant agents.output paths, expected output file, and required ROUTING behavior. The final ROUTING block must include context_file, not doc. route_to may be an pidex-* agent, user, or orchestrator for deterministic internal follow-up.",
			"For JS/TS security or QA handoffs, remind pidex-security/pidex-qa to run the relevant Fallow gate or document FALLOW-SKIP.",
			"Specialists should write full artifacts to files and keep final responses short; pidex_agent will truncate oversized final text and store raw child logs under pidex/state/runs/.",
		],
		parameters: RpAgentParams as any,
		async execute(_toolCallId, params: any, signal, onUpdate, ctx) {
			try {
				const homeStatus = canonicalHomeStatus();
				if (!homeStatus.ok) throw new Error(homeStatus.message?.includes("not a valid") ? `${homeStatus.message}\nMove or repair that directory before using pidex_agent.` : canonicalHomeMissingMessage());
				const sandboxState = resolveSandboxState();
				if (sandboxState.enabled) {
					const probe = probeSandboxAvailability();
					if (!probe.ok) throw new Error(`PIDEX sandbox is enabled but unavailable: ${probe.summary}`);
				}
				const sandboxTaskPrefix = sandboxState.enabled ? [
					"SANDBOX ACTIVE: hardened-pipeline is enabled for this PIDEX run.",
					"Sandbox is internal hardening; preserve normal specialist behavior and ROUTING.",
					"Do not ask the user mid-run for sandbox configuration. If sandbox evidence cannot be produced, fail with an actionable reason.",
					"Use sandbox runtime helpers for project commands when relevant. Do not read env/secret/runtime paths. Do not write host project paths outside the assigned workspace.",
					"Include sandbox evidence or SANDBOX-SKIP in your artifact.",
					"",
				].join("\n") : "";
				const agentCwd = path.resolve(params.cwd ?? ctx.cwd);
				const runParams = {
					agent: params.agent,
					task: `${sandboxTaskPrefix}${params.task}`,
					cwd: agentCwd,
					providerOverride: params.provider,
					modelOverride: params.model,
					effortOverride: params.effort,
					tools: params.tools,
					signal,
					onUpdate: (text: string) => onUpdate?.({ content: [{ type: "text", text: clipEnd(text, MAX_UPDATE_CHARS) }], details: {} }),
				};
				const result = sandboxState.enabled && SANDBOXED_AGENT_NAMES.has(params.agent)
					? await runSandboxedConfiguredAgent(runParams)
					: await runConfiguredAgent(runParams);
				const contentText = formatToolContent(result);
				const missingRouting = !hasRoutingBlock(result.finalText);
				const invalidContextFile = !missingRouting && !hasValidRoutingContextFile(result.finalText, params.cwd ?? ctx.cwd);
				if (result.exitCode !== 0 || missingRouting || invalidContextFile) {
					const reason = result.exitCode !== 0
						? `pidex_agent '${params.agent}' failed with exitCode=${result.exitCode}`
						: missingRouting
							? `pidex_agent '${params.agent}' finished without ROUTING block`
							: `pidex_agent '${params.agent}' finished with invalid ROUTING context_file`;
					throw new Error(`${reason}\n\n${contentText}`);
				}
				return {
					content: [{ type: "text", text: contentText }],
					details: safeDetailsForResult(result),
				};
			} catch (error: any) {
				throw error instanceof Error ? error : new Error(String(error));
			}
		},
	};
	pi.registerTool(rpAgentTool);
}
