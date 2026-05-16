import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createGzip, gunzipSync } from "node:zlib";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { parseFrontmatter } from "@mariozechner/pi-coding-agent";
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, "../..");
const AGENTS_DIR = path.join(PACKAGE_ROOT, "agents");
const CONFIG_PATH = process.env.PIDEX_CONFIG_FILE ?? path.join(PACKAGE_ROOT, "config", "agents.json");
const DELEGATE_DIR = path.join(PACKAGE_ROOT, "scripts", "delegate");
const SKILL_PATH = path.join(PACKAGE_ROOT, "skills", "pd", "SKILL.md");
const STATE_DIR = process.env.PIDEX_STATE_DIR ?? path.join(PACKAGE_ROOT, "state");
const RUNS_DIR = path.join(STATE_DIR, "runs");
const METRICS_DIR = path.join(STATE_DIR, "metrics");
const PRICING_PATH = path.join(PACKAGE_ROOT, "config", "pricing.json");
const PROVIDER_LIMITS_LATEST_PATH = path.join(STATE_DIR, "provider-limits", "latest.json");
const CHECK_AUTH_SCRIPT = path.join(DELEGATE_DIR, "check-auth.sh");
const PIDEX_CHILD_ENV = "PIDEX_CHILD";

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

function normalizeProvider(provider: string | undefined): string {
	return (provider ?? "pi").trim().toLowerCase();
}

function isPiProvider(provider: string): boolean {
	return provider === "pi" || provider === "subagent" || provider === "pidex_agent";
}

function supportsDelegateToolLoop(provider: string): boolean {
	return provider === "claude" || provider === "codex";
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
	const turnEnd = textFromAssistantMessage(event?.message);
	if (turnEnd) return turnEnd;
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

function notifyGate(cwd: string, planId: string, gate: string, routeTo: string | undefined, contextFile: string | undefined): void {
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
	let eventFile = appendOperatorEvent(cwd, planId, {
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
		notifyGate(cwd, planId, gate, routeTo, contextFile);
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
	const body = `---\ntitle: ${title.replace(/\n/g, " ")}\ntype: session-memory\nstatus: active\ncreated: ${now.slice(0, 10)}\nupdated: ${now.slice(0, 10)}\nsource: pidex-session\n---\n\n# ${title}\n\n## Project\n\n- project_root: ${projectRoot}\n- project_name: ${projectName}\n- git_branch: ${gitValue(projectRoot, ["branch", "--show-current"]) || "unknown"}\n- git_commit: ${gitValue(projectRoot, ["rev-parse", "--short", "HEAD"]) || "unknown"}\n\n## Context\n\n- cwd: ${cwd}\n- session: ${ctx?.sessionManager?.getSessionFile?.() || "unknown"}\n- captured_at: ${now}\n\n## User note\n\n${hint || "(none)"}\n\n## Recent conversation digest\n\n${simpleSessionDigest(ctx)}\n`;
	fs.writeFileSync(filePath, body, "utf8");
	const indexPath = path.join(memoryDir, "index.md");
	let index = "";
	try { index = fs.readFileSync(indexPath, "utf8"); } catch {}
	if (!index.trim()) {
		index = `---\ntitle: ${projectName} Session Memory\ntype: session-memory-index\nstatus: active\ncreated: ${now.slice(0, 10)}\nupdated: ${now.slice(0, 10)}\n---\n\n# ${projectName} Session Memory\n\n`;
	}
	index += `- ${now} — [[${fileName.replace(/\.md$/, "")}]] — ${title}\n`;
	fs.writeFileSync(indexPath, index, "utf8");
	return filePath;
}

function runPidexQualityReport(cwd: string, argsLine?: string): { ok: boolean; summary: string } {
	const script = path.join(PACKAGE_ROOT, "scripts", "quality", "report.py");
	const rawArgs = (argsLine ?? "").trim().split(/\s+/).filter(Boolean);
	const args = [script, "--project", cwd];
	if (rawArgs.length) args.push(...rawArgs);
	else args.push("--since-last-review", "--last", "5");
	const proc = spawnSync("python3", args, { cwd: PACKAGE_ROOT, encoding: "utf8", timeout: 120_000 });
	const stdout = (proc.stdout || "").trim();
	const stderr = (proc.stderr || "").trim();
	if (proc.status !== 0) {
		return { ok: false, summary: `pdq failed (${proc.status ?? "signal"})\n${stderr || stdout}` };
	}
	try {
		const payload = JSON.parse(stdout);
		return {
			ok: true,
			summary: [
				"PIDEX quality report complete.",
				`Markdown: ${payload.markdown}`,
				`JSON: ${payload.json}`,
				payload.review_state ? `Review state: ${payload.review_state}` : undefined,
				`Plans: ${(payload.plans ?? []).join(", ") || "none"}`,
				`Confidence: ${payload.confidence}`,
				`Trace gaps: ${payload.trace_gaps}`,
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
		if (!hasCustomTools(tools)) args.push("--no-extensions");
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
			proc = spawn("pi", args, {
				cwd: params.cwd,
				stdio: ["ignore", "pipe", "pipe"],
				env: {
					...process.env,
					[PIDEX_CHILD_ENV]: "1",
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
	if (!["claude", "codex", "gemini"].includes(provider)) {
		throw new Error(`Unsupported pidex delegate provider '${provider}' for ${params.agent}`);
	}
	if (!fs.existsSync(script)) throw new Error(`Delegate script not found: ${script}`);

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
	const expected = path.join(PACKAGE_ROOT, "scripts", "git-hooks", "global");
	const current = spawnSync("git", ["config", "--global", "--get", "core.hooksPath"], { encoding: "utf8" });
	const currentPath = current.status === 0 ? current.stdout.trim() : "";
	const preCommit = path.join(expected, "pre-commit");
	const commitMsg = path.join(expected, "commit-msg");
	const executable = fs.existsSync(preCommit) && fs.existsSync(commitMsg);
	if (currentPath === expected && executable) return "installed/current";
	if (!currentPath) return `not active; global core.hooksPath is unset (expected ${expected})`;
	return `not active; global core.hooksPath=${currentPath} (expected ${expected})`;
}

function runParallelAgentsCommand(args: string | undefined, cwd: string | undefined): { ok: boolean; summary: string } {
	const parts = (args ?? "").trim().split(/\s+/).filter(Boolean);
	const action = parts[0] || "status";
	const script = path.join(PACKAGE_ROOT, "scripts", "parallel-agents", action === "test" ? "run-lane.py" : "status.py");
	let commandArgs: string[];
	if (action === "status") commandArgs = [script, "show"];
	else if (action === "clear" && parts[1]) commandArgs = [script, "clear", "--lane", parts[1]];
	else if (action === "test" && parts[1]) commandArgs = [script, "--lane", parts[1], "--project", path.resolve(cwd ?? process.cwd(), parts[2] || "."), "--task-text", "Read-only PIDEX parallel lane smoke test", "--force"];
	else return { ok: false, summary: "Usage: /pdparallel status | clear <lane-id> | test <lane-id> [project-root]" };
	const proc = spawnSync("python3", commandArgs, { cwd: PACKAGE_ROOT, encoding: "utf8", timeout: 120_000 });
	const output = `${proc.stdout ?? ""}\n${proc.stderr ?? ""}`.trim();
	return { ok: proc.status === 0, summary: clipEnd(output || `pdparallel ${action} exit=${proc.status}`, 1600) };
}

function runWikiHygieneAudit(projectRoot: string): { ok: boolean; summary: string; reportMd?: string } {
	const script = path.join(PACKAGE_ROOT, "scripts", "wiki", "hygiene.py");
	const proc = spawnSync("python3", [script, "audit", "--project", projectRoot], { cwd: PACKAGE_ROOT, encoding: "utf8", timeout: 120_000 });
	const output = `${proc.stdout ?? ""}\n${proc.stderr ?? ""}`.trim();
	const line = (proc.stdout ?? "").split(/\r?\n/).find((entry) => entry.startsWith("PIDEX_WIKI_HYGIENE_RESULT="));
	if (proc.status !== 0 || !line) {
		return { ok: false, summary: `Wiki hygiene audit failed${proc.status !== null ? ` exit=${proc.status}` : ""}: ${clipEnd(output, 1200)}` };
	}
	try {
		const parsed = JSON.parse(line.slice("PIDEX_WIKI_HYGIENE_RESULT=".length));
		const reportMd = parsed.report_md;
		const summary = `Wiki hygiene audit complete: ${reportMd} (score=${parsed.score}, critical=${parsed.critical}, high=${parsed.high})`;
		return { ok: true, summary, reportMd };
	} catch (error: any) {
		return { ok: false, summary: `Wiki hygiene audit result parse failed: ${error?.message ?? error}` };
	}
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
		new RegExp(`rm\\s+.*${escapedRoot}/scripts/git-hooks/global/(pre-commit|commit-msg)`),
		new RegExp(`chmod\\s+-x\\s+.*${escapedRoot}/scripts/git-hooks/global/(pre-commit|commit-msg)`),
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
	provider: Type.Optional(Type.String({ description: "Optional provider override: pi, claude, codex, or gemini. Defaults to config/agents.json." })),
	model: Type.Optional(Type.String({ description: "Optional model override. For claude, MODEL may also be model:effort, e.g. sonnet:high." })),
	effort: Type.Optional(Type.String({ description: "Optional reasoning-effort override. Claude: low/medium/high/xhigh/max; Codex: low/medium/high/xhigh (mapped to reasoning_effort)." })),
	tools: Type.Optional(Type.Array(Type.String(), { description: "Optional Pi tool allowlist override (only used by provider=pi/subagent)." })),
});

export default function runningPi(pi: ExtensionAPI) {
	if (process.env[PIDEX_CHILD_ENV] === "1") return;

	pi.on("tool_call", async (event: any, ctx: any) => {
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

	pi.registerCommand("pidexaudit", {
		description: "Audit pidex context usage from metrics + child logs.",
		handler: async (argLine, ctx) => {
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
		const authPreflight = await runDelegateAuthPreflight();
		const gitHookStatus = getGlobalGitHookStatus();
		if (!authPreflight.ok) {
			ctx.ui.notify("pidex delegate auth preflight failed; see injected instructions", "error");
		} else if (authPreflight.output) {
			ctx.ui.notify("pidex delegate auth preflight OK", "info");
		}
		const kickoff = [
			"You are the pidex orchestrator.",
			`First read the orchestration skill at ${SKILL_PATH}.`,
			"Use direct mode. Do not use background/Telegram mode unless the user explicitly asks and accepts that it is scaffold-only.",
			"Use the pidex_agent tool for specialist handoffs, including pidex-wiki-hygienist for wiki hygiene/project memory maintenance. Keep project artifacts under agents.output/ and wiki/ using pidex-* conventions. Treat the final ROUTING block as authoritative and require context_file to exist. ROUTING route_to may be an pidex-* agent, user, or orchestrator for deterministic internal work such as browser-evidence collection.",
			"Run the pre-flight interview before invoking pidex-planner. If the fixed interview is insufficient, read ~/.pi/agent/skills/grill-me/SKILL.md and use it to ask one question at a time, with your recommended answer, until the epic is crisp.",
			`PIDEX global Git security hook: ${gitHookStatus}.`,
			authPreflight.ok
				? "Delegate auth preflight passed for configured non-Pi providers."
				: `Delegate auth preflight failed. Do not start delegated agents until this is resolved, or explicitly override those agents to provider=pi. Output:\n${authPreflight.output}`,
			task ? `Initial user task: ${task}` : "Initial user task: not provided; begin by asking which project and what deliverable.",
		].join("\n\n");
		ctx.ui.notify("Starting pidex direct-mode orchestrator", "info");
		pi.sendUserMessage(kickoff);
	};

	pi.registerCommand("pd", {
		description: "Start the pidex pidex-* software-delivery pipeline (direct-mode MVP).",
		handler: startRunningPi,
	});

	pi.registerCommand("pdq", {
		description: "Run read-only PIDEX quality/self-improvement report.",
		handler: async (argLine, ctx) => {
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
			const raw = argLine?.trim();
			const projectRoot = raw ? path.resolve(ctx.cwd ?? process.cwd(), raw) : path.resolve(ctx.cwd ?? process.cwd());
			const result = runWikiHygieneAudit(projectRoot);
			await ctx.ui.notify(result.summary, result.ok ? "info" : "error");
		},
	});

	pi.registerCommand("pdparallel", {
		description: "Inspect or test optional PIDEX parallel agent lanes.",
		handler: async (argLine, ctx) => {
			const result = runParallelAgentsCommand(argLine, ctx.cwd);
			await ctx.ui.notify(result.summary, result.ok ? "info" : "warning");
		},
	});

	const rpAgentTool: any = {
		name: "pidex_agent",
		label: "pidex Agent",
		description: "Run a bundled pidex-* specialist agent through config/agents.json. Defaults to lean Pi subprocesses, with optional Claude/Codex/Gemini CLI delegates for configured agents. Raw child logs are stored outside the parent Pi session.",
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
				const result = await runConfiguredAgent({
					agent: params.agent,
					task: params.task,
					cwd: params.cwd ?? ctx.cwd,
					providerOverride: params.provider,
					modelOverride: params.model,
					effortOverride: params.effort,
					tools: params.tools,
					signal,
					onUpdate: (text) => onUpdate?.({ content: [{ type: "text", text: clipEnd(text, MAX_UPDATE_CHARS) }], details: {} }),
				});
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
