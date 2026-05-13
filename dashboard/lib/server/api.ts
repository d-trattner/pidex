
import {
  queryRows,
  queryRow,
  queryValue,
  hasHistoricalProvider,
  providerSortKey,
  type DbRow,
} from './db';
import { parseBool, parseLimit, parseGranularity, parsePage, parseProjectFilter, providerFilter } from './filters';
import { listAnalysis } from './analysis';
import { URLSearchParams } from 'node:url';
import { paginateTokenBuckets } from './token-pagination';

export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
export interface JsonObject {
  [key: string]: JsonValue;
}
export type JsonArray = JsonValue[];

export interface DashboardSummary {
  projects: number;
  pipeline_runs: string;
  pipeline_runs_started: number;
  pipeline_runs_completed: number;
  pipeline_events: number;
  agent_runs: number;
  secondary_artifacts: number;
  merge_artifacts: number;
  malformed_secondary: number;
  estimated_cost: number | null;
  by_model: Array<{ model: string; count: number }>;
  by_agent: Array<{ agent: string; count: number }>;
}

export function parseSearchParams(search = ''): URLSearchParams {
  return new URLSearchParams(search);
}

export async function listProjects(): Promise<Array<{ name: string; path: string }>> {
  return queryRows<{ name: string; path: string }>(
    `SELECT p.name, p.path
     FROM projects p
     WHERE p.path NOT LIKE '/tmp/%'
       AND p.name NOT LIKE '%smoke%'
     ORDER BY p.name COLLATE NOCASE ASC`,
  );
}

export async function getSummary(search = ''): Promise<DashboardSummary> {
  const q = parseSearchParams(search);
  const projectFilter = parseProjectFilter(q);

  const where = `WHERE 1=1 ${projectFilter.sql}`;

  const pipeline = await queryRow<{ started: number; completed: number }>(
    `WITH started AS (
      SELECT DISTINCT ar.project_id, ar.plan_key
      FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
      WHERE ar.plan_key IS NOT NULL ${projectFilter.sql}
    ), completed AS (
      SELECT DISTINCT ar.project_id, ar.plan_key
      FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
      WHERE ar.plan_key IS NOT NULL ${projectFilter.sql}
        AND (ar.agent IN ('pidex-devops','pidex-roadmap','pidex-pi')
          OR ar.route_to IN ('pidex-roadmap','user')
          OR ar.verdict IN ('Released','COMPLETE'))
    )
    SELECT (SELECT COUNT(*) FROM started) AS started, (SELECT COUNT(*) FROM completed) AS completed`,
    [...projectFilter.params, ...projectFilter.params],
  ) || { started: 0, completed: 0 };

  const [pipelineEvents, agentRuns, secondaryArtifacts, mergeArtifacts, malformedSecondary, cost, byModel, byAgent, projects] =
    await Promise.all([
      queryValue<number>(`SELECT COUNT(*) AS count FROM pipeline_events pe JOIN projects p ON p.id = pe.project_id WHERE 1=1 ${projectFilter.sql}`, [...projectFilter.params]),
      queryValue<number>(`SELECT COUNT(*) AS count FROM agent_runs ar JOIN projects p ON p.id = ar.project_id ${where}`, [...projectFilter.params]),
      queryValue<number>(`SELECT COUNT(*) AS count FROM artifacts a JOIN projects p ON p.id = a.project_id WHERE a.is_secondary = 1 ${projectFilter.sql}`, [...projectFilter.params]),
      queryValue<number>(`SELECT COUNT(DISTINCT mf.artifact_path) AS count FROM merge_findings mf JOIN projects p ON p.id = mf.project_id WHERE 1=1 ${projectFilter.sql}`, [...projectFilter.params]),
      queryValue<number>(`SELECT COUNT(*) AS count FROM artifacts a JOIN projects p ON p.id = a.project_id WHERE a.is_secondary = 1 AND a.has_routing = 0 ${projectFilter.sql}`, [...projectFilter.params]),
      queryValue<number>(`SELECT ROUND(SUM(ar.cost_usd), 4) AS cost FROM agent_runs ar JOIN projects p ON p.id = ar.project_id WHERE 1=1 ${projectFilter.sql}`, [...projectFilter.params]),
      queryRows<{ model: string; count: number }>(
        `SELECT COALESCE(model, model_label, 'unknown') AS model, COUNT(*) AS count
         FROM (
           SELECT ar.model, NULL AS model_label
           FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
           WHERE 1=1 ${projectFilter.sql}
           UNION ALL
           SELECT NULL, a.model_label
           FROM artifacts a JOIN projects p ON p.id = a.project_id
           WHERE a.is_secondary = 1 ${projectFilter.sql}
         )
         GROUP BY 1
         ORDER BY count DESC
         LIMIT 20`,
        [...projectFilter.params, ...projectFilter.params],
      ),
      queryRows<{ agent: string; count: number }>(
        `SELECT COALESCE(ar.agent, 'unknown') AS agent, COUNT(*) AS count
         FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
         WHERE 1=1 ${projectFilter.sql}
         GROUP BY 1
         ORDER BY count DESC`,
        [...projectFilter.params],
      ),
      queryValue<number>(`SELECT COUNT(DISTINCT p.id) AS count FROM projects p WHERE 1=1 ${projectFilter.sql}`, [...projectFilter.params]),
    ]);

  return {
    projects: projects || 0,
    pipeline_runs: `${pipeline.started || 0} / ${pipeline.completed || 0}`,
    pipeline_runs_started: Number(pipeline.started || 0),
    pipeline_runs_completed: Number(pipeline.completed || 0),
    pipeline_events: pipelineEvents || 0,
    agent_runs: Number(agentRuns || 0),
    secondary_artifacts: Number(secondaryArtifacts || 0),
    merge_artifacts: Number(mergeArtifacts || 0),
    malformed_secondary: Number(malformedSecondary || 0),
    estimated_cost: cost == null ? null : Number(cost),
    by_model: byModel,
    by_agent: byAgent,
  };
}

export async function listRuns(search = ''): Promise<DbRow[]> {
  const q = parseSearchParams(search);
  const includeHistorical = parseBool(q.get('show_historical'), false);
  const provider = (q.get('provider') || '').trim();
  const limit = parseLimit(q.get('limit'), 1000, 500);

  const projectFilter = parseProjectFilter(q);
  const providerClause = providerFilter(provider);

  const baseWhere = `WHERE 1=1 ${projectFilter.sql}${providerClause.clause}`;
  const rows = await queryRows<DbRow>(
    `SELECT ar.timestamp, p.name AS project, ar.plan_key, ar.agent, ar.provider, ar.model, ar.verdict,
            ar.route_to, ar.gate, ar.duration_ms, ar.input_tokens, ar.output_tokens,
            ROUND(ar.cost_usd, 5) AS cost_usd, ar.context_file
     FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
     ${baseWhere}
     ORDER BY ar.timestamp DESC LIMIT ?`,
    [...projectFilter.params, ...providerClause.params, limit],
  );

  if (includeHistorical) return rows;
  return rows.filter((r) => !hasHistoricalProvider(String(r.provider || '')));
}

export async function listPipelines(search = ''): Promise<DbRow[]> {
  const q = parseSearchParams(search);
  const projectFilter = parseProjectFilter(q);

  return queryRows<DbRow>(
    `WITH grouped AS (
      SELECT
        ar.project_id,
        p.name AS project,
        ar.plan_key,
        MIN(ar.timestamp) AS started_at,
        MAX(CASE WHEN ar.agent IN ('pidex-devops','pidex-roadmap','pidex-pi') OR ar.route_to IN ('pidex-roadmap','user') OR ar.verdict IN ('Released','COMPLETE') THEN ar.timestamp END) AS completed_at,
        COUNT(*) AS agent_runs,
        COUNT(DISTINCT ar.agent) AS distinct_agents,
        SUM(COALESCE(ar.duration_ms, 0)) AS total_runtime_ms,
        SUM(COALESCE(ar.input_tokens, 0)) AS input_tokens,
        SUM(COALESCE(ar.output_tokens, 0)) AS output_tokens,
        ROUND(SUM(COALESCE(ar.cost_usd, 0)), 5) AS cost_usd,
        SUM(CASE WHEN ar.gate IS NOT NULL AND ar.gate != '' AND ar.gate != 'none' THEN 1 ELSE 0 END) AS gates,
        SUM(CASE WHEN ar.exit_code IS NOT NULL AND ar.exit_code != 0 THEN 1 ELSE 0 END) AS failures
      FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
      WHERE ar.plan_key IS NOT NULL ${projectFilter.sql}
      GROUP BY ar.project_id, p.name, ar.plan_key
    )
    SELECT *, CAST((julianday(completed_at) - julianday(started_at)) * 86400000 AS INTEGER) AS wall_runtime_ms
    FROM grouped
    WHERE completed_at IS NOT NULL
    ORDER BY completed_at DESC`,
    [...projectFilter.params],
  );
}

export async function listSecondary(search = ''): Promise<JsonObject> {
  const q = parseSearchParams(search);
  const projectFilter = parseProjectFilter(q);

  const byModel = await queryRows<DbRow>(
    `SELECT a.model_label, COUNT(*) AS count, SUM(CASE WHEN a.has_routing = 0 THEN 1 ELSE 0 END) AS malformed
     FROM artifacts a JOIN projects p ON p.id = a.project_id
     WHERE a.is_secondary = 1 ${projectFilter.sql}
     GROUP BY a.model_label`,
    [...projectFilter.params],
  );

  const byRole = await queryRows<DbRow>(
    `SELECT a.role, a.model_label, COUNT(*) AS count, SUM(CASE WHEN a.has_routing = 0 THEN 1 ELSE 0 END) AS malformed
     FROM artifacts a JOIN projects p ON p.id = a.project_id
     WHERE a.is_secondary = 1 ${projectFilter.sql}
     GROUP BY a.role, a.model_label
     ORDER BY a.role, a.model_label`,
    [...projectFilter.params],
  );

  const mergeTerms = await queryRows<DbRow>(
    `SELECT mf.classification, mf.disposition, COUNT(*) AS count
     FROM merge_findings mf JOIN projects p ON p.id = mf.project_id
     WHERE 1=1 ${projectFilter.sql}
     GROUP BY mf.classification, mf.disposition
     ORDER BY count DESC LIMIT 50`,
    [...projectFilter.params],
  );

  const recent = await queryRows<DbRow>(
    `SELECT a.mtime, p.name AS project, a.plan_key, a.role, a.model_label, a.verdict, a.route_to, a.gate, a.has_routing, a.path
     FROM artifacts a JOIN projects p ON p.id = a.project_id
     WHERE a.is_secondary = 1 ${projectFilter.sql}
     ORDER BY a.mtime DESC LIMIT 100`,
    [...projectFilter.params],
  );

  return {
    by_model: byModel,
    by_role: byRole,
    merge_terms: mergeTerms,
    recent,
  };
}

export async function listMalformed(search = ''): Promise<DbRow[]> {
  const q = parseSearchParams(search);
  const projectFilter = parseProjectFilter(q);

  return queryRows<DbRow>(
    `SELECT a.mtime, p.name AS project, a.plan_key, a.role, a.model_label, a.path, a.title
     FROM artifacts a JOIN projects p ON p.id = a.project_id
     WHERE a.is_secondary = 1 AND a.has_routing = 0 ${projectFilter.sql}
     ORDER BY a.mtime DESC`,
    [...projectFilter.params],
  );
}

export async function qualityChartData(search = ''): Promise<JsonObject> {
  const q = parseSearchParams(search);
  const projectFilter = parseProjectFilter(q);

  const completionByDay = await queryRows<DbRow>(
    `WITH grouped AS (
      SELECT ar.project_id, p.name AS project, ar.plan_key,
        MIN(ar.timestamp) AS started_at,
        MAX(CASE WHEN ar.agent IN ('pidex-devops','pidex-roadmap','pidex-pi') OR ar.route_to IN ('pidex-roadmap','user') OR ar.verdict IN ('Released','COMPLETE') THEN ar.timestamp END) AS completed_at,
        COUNT(*) AS agent_runs,
        SUM(CASE WHEN ar.gate IS NOT NULL AND ar.gate != '' AND ar.gate != 'none' THEN 1 ELSE 0 END) AS gates,
        SUM(CASE WHEN ar.exit_code IS NOT NULL AND ar.exit_code != 0 THEN 1 ELSE 0 END) AS failures
      FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
      WHERE ar.plan_key IS NOT NULL ${projectFilter.sql}
      GROUP BY ar.project_id, p.name, ar.plan_key
    )
    SELECT substr(started_at, 1, 10) AS day,
      COUNT(*) AS started,
      SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed,
      ROUND(100.0 * SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 1) AS completion_rate
    FROM grouped
    WHERE started_at IS NOT NULL
    GROUP BY day
    ORDER BY day`,
    [...projectFilter.params],
  );

  const agentVerdicts = await queryRows<DbRow>(
    `SELECT COALESCE(ar.agent, 'unknown') AS agent, COALESCE(ar.verdict, 'unknown') AS verdict, COUNT(*) AS count
     FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
     WHERE 1=1 ${projectFilter.sql}
     GROUP BY ar.agent, ar.verdict
     ORDER BY ar.agent, count DESC`,
    [...projectFilter.params],
  );

  const secondaryHealth = await queryRows<DbRow>(
    `SELECT a.model_label AS model, COUNT(*) AS total,
      SUM(CASE WHEN a.has_routing = 1 THEN 1 ELSE 0 END) AS clean,
      SUM(CASE WHEN a.has_routing = 0 THEN 1 ELSE 0 END) AS malformed
     FROM artifacts a JOIN projects p ON p.id = a.project_id
     WHERE a.is_secondary = 1 ${projectFilter.sql}
     GROUP BY a.model_label
     ORDER BY a.model_label`,
    [...projectFilter.params],
  );

  const [mergeDisposition, mergeClassification, runtimeByAgent, costByModel, gatesByPipeline, malformedByDay, reworkByPipeline, plannerRevisionsByPlan, g9ByDay] =
    await Promise.all([
      queryRows<DbRow>(
        `SELECT COALESCE(NULLIF(mf.disposition, ''), 'unknown') AS disposition, COUNT(*) AS count
         FROM merge_findings mf JOIN projects p ON p.id = mf.project_id
         WHERE 1=1 ${projectFilter.sql} GROUP BY 1 ORDER BY count DESC`,
        [...projectFilter.params],
      ),
      queryRows<DbRow>(
        `SELECT COALESCE(NULLIF(mf.classification, ''), 'unknown') AS classification, COUNT(*) AS count
         FROM merge_findings mf JOIN projects p ON p.id = mf.project_id
         WHERE 1=1 ${projectFilter.sql} GROUP BY 1 ORDER BY count DESC`,
        [...projectFilter.params],
      ),
      queryRows<DbRow>(
        `SELECT COALESCE(ar.agent, 'unknown') AS agent, ROUND(AVG(COALESCE(ar.duration_ms, 0)), 0) AS avg_ms, MAX(COALESCE(ar.duration_ms, 0)) AS max_ms, COUNT(*) AS count
         FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
         WHERE 1=1 ${projectFilter.sql}
         GROUP BY ar.agent ORDER BY avg_ms DESC LIMIT 14`,
        [...projectFilter.params],
      ),
      queryRows<DbRow>(
        `SELECT COALESCE(ar.model, 'unknown') AS model, ROUND(SUM(COALESCE(ar.cost_usd, 0)), 4) AS cost, COUNT(*) AS count
         FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
         WHERE 1=1 ${projectFilter.sql}
         GROUP BY ar.model HAVING cost > 0 ORDER BY cost DESC LIMIT 12`,
        [...projectFilter.params],
      ),
      queryRows<DbRow>(
        `WITH grouped AS (
          SELECT
            ar.project_id,
            p.name AS project,
            ar.plan_key,
            MIN(ar.timestamp) AS started_at,
            MAX(CASE WHEN ar.agent IN ('pidex-devops','pidex-roadmap','pidex-pi') OR ar.route_to IN ('pidex-roadmap','user') OR ar.verdict IN ('Released','COMPLETE') THEN ar.timestamp END) AS completed_at,
            COUNT(*) AS agent_runs,
            COUNT(DISTINCT ar.agent) AS distinct_agents,
            SUM(COALESCE(ar.duration_ms, 0)) AS total_runtime_ms,
            SUM(COALESCE(ar.cost_usd, 0)) AS cost_usd,
            SUM(CASE WHEN ar.gate IS NOT NULL AND ar.gate != '' AND ar.gate != 'none' THEN 1 ELSE 0 END) AS gates,
            SUM(CASE WHEN ar.exit_code IS NOT NULL AND ar.exit_code != 0 THEN 1 ELSE 0 END) AS failures
          FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
          WHERE ar.plan_key IS NOT NULL ${projectFilter.sql}
          GROUP BY ar.project_id, p.name, ar.plan_key
        )
        SELECT project, plan_key, gates, failures, total_runtime_ms, cost_usd
        FROM grouped
        WHERE completed_at IS NOT NULL
        ORDER BY gates DESC, completed_at DESC LIMIT 15`,
        [...projectFilter.params],
      ),
      queryRows<DbRow>(
        `SELECT substr(a.mtime, 1, 10) AS day, COUNT(*) AS malformed
         FROM artifacts a JOIN projects p ON p.id = a.project_id
         WHERE a.is_secondary = 1 AND a.has_routing = 0 ${projectFilter.sql} GROUP BY day ORDER BY day`,
        [...projectFilter.params],
      ),
      queryRows<DbRow>(
        `WITH grouped AS (
          SELECT
            ar.project_id,
            p.name AS project,
            ar.plan_key,
            MIN(ar.timestamp) AS started_at,
            MAX(CASE WHEN ar.agent IN ('pidex-devops','pidex-roadmap','pidex-pi') OR ar.route_to IN ('pidex-roadmap','user') OR ar.verdict IN ('Released','COMPLETE') THEN ar.timestamp END) AS completed_at,
            COUNT(*) AS agent_runs,
            SUM(CASE WHEN ar.gate IS NOT NULL AND ar.gate != '' AND ar.gate != 'none' THEN 1 ELSE 0 END) AS gates,
            SUM(CASE WHEN ar.exit_code IS NOT NULL AND ar.exit_code != 0 THEN 1 ELSE 0 END) AS failures,
            SUM(COALESCE(ar.duration_ms, 0)) AS total_runtime_ms,
            ROUND(SUM(COALESCE(ar.cost_usd, 0)), 5) AS cost_usd,
            SUM(COALESCE(ar.input_tokens, 0)) AS input_tokens,
            SUM(COALESCE(ar.output_tokens, 0)) AS output_tokens
          FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
          WHERE ar.plan_key IS NOT NULL ${projectFilter.sql}
          GROUP BY ar.project_id, p.name, ar.plan_key
        )
        SELECT project, plan_key, agent_runs, gates, failures, ROUND(cost_usd, 4) AS cost_usd
        FROM grouped
        WHERE completed_at IS NOT NULL
        ORDER BY agent_runs DESC LIMIT 15`,
        [...projectFilter.params],
      ),
      queryRows<DbRow>(
        `SELECT p.name AS project, ar.plan_key, COUNT(*) AS planner_runs
         FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
         WHERE ar.agent = 'pidex-planner' ${projectFilter.sql}
         GROUP BY p.name, ar.plan_key ORDER BY planner_runs DESC LIMIT 15`,
        [...projectFilter.params],
      ),
      queryRows<DbRow>(
        `SELECT substr(ar.timestamp, 1, 10) AS day, COUNT(*) AS g9_events,
          SUM(CASE WHEN lower(COALESCE(ar.verdict, '') || ' ' || COALESCE(ar.routing_reason, '')) LIKE '%reject%' THEN 1 ELSE 0 END) AS g9_rejections
         FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
         WHERE ar.gate = 'G9' ${projectFilter.sql} GROUP BY day ORDER BY day`,
        [...projectFilter.params],
      ),
    ]);

  return {
    completionByDay,
    agentVerdicts,
    secondaryHealth,
    mergeDisposition,
    mergeClassification,
    runtimeByAgent,
    costByModel,
    gatesByPipeline,
    malformedByDay,
    reworkByPipeline,
    plannerRevisionsByPlan,
    g9ByDay,
    analystVerdicts: (await listAnalysis('pipeline-analysis')) as unknown as JsonValue,
    qualityImpactByDay: [],
    infraMarkers: {},
  };
}

export async function modelQuality(search = ''): Promise<JsonObject> {
  const q = parseSearchParams(search);
  const projectFilter = parseProjectFilter(q);
  const rows = await queryRows<DbRow>(
    `SELECT ar.model, ar.exit_code, ar.agent, COALESCE(ar.verdict, '') AS verdict,
            COALESCE(ar.gate, '') AS gate,
            COALESCE(ar.input_tokens, 0) AS input_tokens,
            COALESCE(ar.output_tokens, 0) AS output_tokens,
            COALESCE(ar.cost_usd, 0) AS cost_usd
     FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
     WHERE ar.model IS NOT NULL AND ar.model != '' ${projectFilter.sql}
     ORDER BY ar.timestamp`,
    [...projectFilter.params],
  );

  const groups = new Map<string, {
    raw_models: Set<string>;
    total: number;
    success: number;
    continuation: number;
    rejection: number;
    sigterm: number;
    tokens: number;
    cost: number;
  }>();

  for (const r of rows) {
    const model = String(r.model || 'unknown');
    const normalized = model.toLowerCase().replace(/^(?:openai-codex|openrouter)\//, '');
    if (!groups.has(normalized)) {
      groups.set(normalized, {
        raw_models: new Set([model]),
        total: 0,
        success: 0,
        continuation: 0,
        rejection: 0,
        sigterm: 0,
        tokens: 0,
        cost: 0,
      });
    }
    const g = groups.get(normalized);
    if (!g) continue;
    g.raw_models.add(model);
    g.total += 1;
    const exitCode = Number(r.exit_code ?? 0);
    const verdict = String(r.verdict || '').toUpperCase();
    const gate = String(r.gate || '');
    g.success += (exitCode === 0 || r.exitCode == null || verdict === 'APPROVED' || verdict === 'COMPLETE' ? 1 : 0);
    g.continuation += Number((r.agent === 'pidex-implementer' && (verdict === 'BLOCKED' || verdict === 'IN_PROGRESS')) ? 1 : 0);
    g.rejection += Number((verdict === 'REJECTED' || ['G1', 'G3', 'G5'].includes(gate)) ? 1 : 0);
    g.sigterm += Number(exitCode !== 0 ? 1 : 0);
    g.tokens += Number(r.input_tokens || 0) + Number(r.output_tokens || 0);
    g.cost += Number(r.cost_usd || 0);
  }

  const out: Array<JsonObject> = [];
  for (const [model, item] of groups.entries()) {
    if (item.total < 3) continue;
    const total = item.total || 1;
    const successRate = Math.min(100, Math.round((100 * item.success) / total));
    const continuationRate = Math.min(100, Math.round((100 * item.continuation) / total));
    const rejectionRate = Math.min(100, Math.round((100 * item.rejection) / total));
    const sigtermRate = Math.min(100, Math.round((100 * item.sigterm) / total));
    const avgTokens = Math.round(item.tokens / total);
    const avgCost = item.cost / total;
    const tokBonus = avgTokens < 1000 ? 10 : avgTokens < 5000 ? 7 : avgTokens < 20000 ? 4 : avgTokens < 100000 ? 1 : 0;
    const cstBonus = item.cost < 0.005 ? 10 : item.cost < 0.02 ? 7 : item.cost < 0.1 ? 4 : item.cost < 0.5 ? 1 : 0;
    const qualityScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(100 - (100 - successRate) * 0.25 - continuationRate * 0.2 - rejectionRate * 0.2 - sigtermRate * 0.15 + tokBonus * 0.1 + cstBonus * 0.1),
      ),
    );
    const raws = [...item.raw_models];
    raws.sort((a, b) => a.length - b.length);

    out.push({
      model,
      raw_model: raws[0] || model,
      aliases: raws.slice(1),
      total_runs: total,
      quality_score: qualityScore,
      success_rate: successRate,
      continuation_rate: continuationRate,
      rejection_rate: rejectionRate,
      sigterm_rate: sigtermRate,
      avg_tokens: avgTokens,
      avg_cost: Number(avgCost.toFixed(6)),
      total_cost: Number(item.cost.toFixed(4)),
    });
  }

  out.sort((a, b) => (Number(b.quality_score || 0) - Number(a.quality_score || 0)));
  return { models: out };
}

export async function tokenConsumption(search = ''): Promise<JsonObject> {
  const q = parseSearchParams(search);
  const projectFilter = parseProjectFilter(q);
  const granularity = parseGranularity(q.get('granularity'));
  const page = parsePage(q.get('page'), 0);

  const base = await queryRow<{ max_ts: string; min_ts: string }>(
    `SELECT MAX(ar.timestamp) AS max_ts, MIN(ar.timestamp) AS min_ts
     FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
     WHERE 1=1 ${projectFilter.sql}`,
    [...projectFilter.params],
  );

  const agentStats = await queryRows<DbRow>(
    `SELECT COALESCE(ar.agent, 'unknown') AS agent,
       COUNT(*) AS calls,
       SUM(COALESCE(ar.input_tokens, 0)) AS total_input_tokens,
       SUM(COALESCE(ar.output_tokens, 0)) AS total_output_tokens,
       SUM(COALESCE(ar.input_tokens, 0) + COALESCE(ar.output_tokens, 0)) AS total_tokens,
       ROUND(AVG(COALESCE(ar.input_tokens, 0) + COALESCE(ar.output_tokens, 0)), 1) AS avg_tokens
     FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
     WHERE 1=1 ${projectFilter.sql}
     GROUP BY COALESCE(ar.agent, 'unknown')
     ORDER BY total_tokens DESC`,
    [...projectFilter.params],
  );

  const chartAgents = agentStats.slice(0, 8).map((row) => String(row.agent || 'unknown'));

  const groupedSql = granularity === 'week'
    ? `SELECT date(ar.timestamp) AS bucket, COALESCE(ar.agent, 'unknown') AS agent,
         SUM(COALESCE(ar.input_tokens,0)+COALESCE(ar.output_tokens,0)) AS total_tokens
       FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
       WHERE 1=1 ${projectFilter.sql}
       GROUP BY bucket, COALESCE(ar.agent, 'unknown')`
    : `SELECT substr(ar.timestamp,1,7) AS bucket, COALESCE(ar.agent, 'unknown') AS agent,
         SUM(COALESCE(ar.input_tokens,0)+COALESCE(ar.output_tokens,0)) AS total_tokens
       FROM agent_runs ar JOIN projects p ON ar.project_id = p.id
       WHERE 1=1 ${projectFilter.sql}
       GROUP BY bucket, COALESCE(ar.agent, 'unknown')`;

  const grouped = await queryRows<DbRow>(groupedSql, [...projectFilter.params]);
  const buckets: Record<string, Record<string, number>> = {};

  for (const row of grouped) {
    const bucket = String(row.bucket || '');
    const agent = String(row.agent || 'unknown');
    buckets[bucket] ??= {};
    buckets[bucket][agent] = Number(row.total_tokens || 0);
  }

  const sortedBuckets = Object.keys(buckets).sort();
  const pageWindow = paginateTokenBuckets(sortedBuckets, { granularity, page });
  const rowsPayload = pageWindow.buckets.map((bucket) => {
    const record: JsonObject = { [granularity === 'week' ? 'day' : 'month']: bucket, label: bucket };
    let total = 0;
    for (const a of chartAgents) {
      const v = buckets[bucket]?.[a] ?? 0;
      record[a] = Number(v);
      total += Number(v);
    }
    (record as any).total_tokens = total;
    return record;
  });

  return {
    agent_stats: agentStats.map((row) => ({
      ...row,
      total_tokens: Number(row.total_tokens || 0),
      total_input_tokens: Number(row.total_input_tokens || 0),
      total_output_tokens: Number(row.total_output_tokens || 0),
      avg_tokens: Number(row.avg_tokens || 0),
      calls: Number(row.calls || 0),
    })),
    chart_agents: chartAgents,
    weekly: granularity === 'week'
      ? {
          start: pageWindow.buckets.length ? pageWindow.buckets[0] : null,
          end: pageWindow.buckets.length ? pageWindow.buckets[pageWindow.buckets.length - 1] : null,
          rows: rowsPayload,
          days: rowsPayload.map((row) => String(row.day || row.label || '')),
          has_older: pageWindow.has_older,
          has_newer: pageWindow.has_newer,
          page,
          agent_stats: chartAgents,
        }
      : { rows: [], days: [], has_older: false, has_newer: false, page: 0, start: null, end: null },
    monthly: granularity === 'month'
      ? {
          start: pageWindow.buckets.length ? pageWindow.buckets[0] : null,
          rows: rowsPayload,
          months: rowsPayload.map((row) => String(row.month || row.label || '')),
          has_older: pageWindow.has_older,
          has_newer: pageWindow.has_newer,
          page,
          window: 12,
        }
      : { rows: [], months: [], has_older: false, has_newer: false, page: 0, window: 12 },
  };
}

export async function getLiveState(search = ''): Promise<JsonObject> {
  const projectFilter = parseProjectFilter(parseSearchParams(search));

  const latestRuns = await queryRows<DbRow>(
    `SELECT ar.timestamp, p.name AS project, ar.plan_key, ar.agent, ar.provider, ar.model, ar.route_to, ar.verdict,
            ar.gate, ar.duration_ms, ar.exit_code, ar.context_file
     FROM agent_runs ar LEFT JOIN projects p ON p.id = ar.project_id
     WHERE 1=1 ${projectFilter.sql}
     ORDER BY ar.timestamp DESC LIMIT 25`,
    [...projectFilter.params],
  );

  const timelineRuns = await queryRows<DbRow>(
    `WITH recent AS (
       SELECT ar.timestamp, p.name AS project, ar.plan_key, ar.agent, ar.provider, ar.model, ar.route_to, ar.verdict,
              ar.gate, ar.duration_ms, ar.context_file
       FROM agent_runs ar LEFT JOIN projects p ON p.id = ar.project_id
       WHERE ar.timestamp IS NOT NULL
         AND ar.agent IS NOT NULL
         ${projectFilter.sql}
       ORDER BY ar.timestamp DESC LIMIT 240
     )
     SELECT * FROM recent ORDER BY timestamp ASC`,
    [...projectFilter.params],
  );

  const active = (latestRuns || []).filter((row) => {
    const verdict = String(row.verdict || '').toUpperCase();
    return verdict !== 'COMPLETE' && verdict !== 'RELEASED' && verdict !== 'DONE' && verdict !== 'SAVED';
  });

  const statusCounts: Record<string, number> = {};
  const runningByProject: Record<string, number> = {};

  for (const row of latestRuns) {
    const key = String(row.verdict || 'running').toLowerCase() || 'running';
    statusCounts[key] = (statusCounts[key] || 0) + 1;
    if (active.includes(row)) {
      const project = String(row.project || 'unknown');
      runningByProject[project] = (runningByProject[project] || 0) + 1;
    }
  }

  const eventOpen = await queryRows<DbRow>(
    `WITH ranked AS (
      SELECT pe.*, p.name AS project,
        MIN(pe.timestamp) OVER (PARTITION BY pe.pipeline_id) AS started_at,
        ROW_NUMBER() OVER (PARTITION BY pe.pipeline_id ORDER BY pe.timestamp DESC, pe.id DESC) AS rn
      FROM pipeline_events pe JOIN projects p ON p.id = pe.project_id
      WHERE 1=1 ${projectFilter.sql}
    )
    SELECT project, plan_key, pipeline_id, started_at, timestamp AS last_at, event_type, status,
      actor, message, 'pipeline_events' AS source, 0 AS agent_runs, 0 AS distinct_agents, 0 AS failures, actor AS last_agent,
      (SELECT ar.context_file FROM agent_runs ar WHERE ar.project_id = ranked.project_id AND ar.plan_key = ranked.plan_key AND ar.context_file IS NOT NULL ORDER BY ar.timestamp DESC LIMIT 1) AS context_file,
      CAST((julianday(COALESCE(timestamp, CURRENT_TIMESTAMP)) - julianday(started_at)) * 86400000 AS INTEGER) AS age_ms
    FROM ranked
    WHERE rn = 1
      AND event_type NOT IN ('pipeline_completed','pipeline_failed','pipeline_aborted','pipeline_cancelled')
    ORDER BY last_at DESC LIMIT 24`,
    [...projectFilter.params],
  );

  const inferredOpen = await queryRows<DbRow>(
    `WITH grouped AS (
      SELECT ar.project_id, p.name AS project, ar.plan_key,
        MIN(ar.timestamp) AS started_at,
        MAX(ar.timestamp) AS last_at,
        MAX(CASE WHEN ar.route_to IN ('pidex-roadmap','user') OR ar.verdict = 'Released' OR (ar.agent IN ('pidex-devops','pidex-roadmap','pidex-pi') AND ar.verdict IN ('COMPLETE','APPROVED')) THEN ar.timestamp END) AS completed_at,
        COUNT(*) AS agent_runs,
        COUNT(DISTINCT ar.agent) AS distinct_agents,
        SUM(CASE WHEN ar.exit_code IS NOT NULL AND ar.exit_code != 0 THEN 1 ELSE 0 END) AS failures,
        MAX(ar.agent) AS last_agent
      FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
      WHERE ar.plan_key IS NOT NULL ${projectFilter.sql}
        AND NOT EXISTS (SELECT 1 FROM pipeline_events pe WHERE pe.project_id = ar.project_id AND pe.plan_key = ar.plan_key)
      GROUP BY ar.project_id, p.name, ar.plan_key
    )
    SELECT project, plan_key, '' AS pipeline_id, started_at, last_at, '' AS event_type, 'inferred_unresolved' AS status,
      '' AS actor, 'Legacy inference from agent_runs; no pipeline lifecycle event exists.' AS message,
      'agent_runs_inferred' AS source, agent_runs, distinct_agents, failures, last_agent,
      (SELECT ar.context_file FROM agent_runs ar WHERE ar.project_id = grouped.project_id AND ar.plan_key = grouped.plan_key AND ar.context_file IS NOT NULL ORDER BY ar.timestamp DESC LIMIT 1) AS context_file,
      CAST((julianday(COALESCE(last_at, CURRENT_TIMESTAMP)) - julianday(started_at)) * 86400000 AS INTEGER) AS age_ms
    FROM grouped
    WHERE completed_at IS NULL AND last_at >= datetime('now', '-12 hours')
    ORDER BY last_at DESC LIMIT 12`,
    [...projectFilter.params],
  );

  const openPipelines = (eventOpen || []).concat(inferredOpen || []).slice(0, 24);

  const latestByAgent = await queryRows<DbRow>(
    `WITH ranked AS (
      SELECT ar.timestamp, p.name AS project, ar.plan_key, ar.agent, ar.provider, ar.model, ar.verdict, ar.route_to, ar.gate, ar.duration_ms, ar.context_file,
        ROW_NUMBER() OVER (PARTITION BY ar.agent ORDER BY ar.timestamp DESC) AS rn
      FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
      WHERE ar.agent IS NOT NULL ${projectFilter.sql}
    )
    SELECT timestamp, project, plan_key, agent, provider, model, verdict, route_to, gate, duration_ms, context_file
    FROM ranked WHERE rn = 1 ORDER BY timestamp DESC LIMIT 20`,
    [...projectFilter.params],
  );

  const recentSecondary = await queryRows<DbRow>(
    `SELECT a.mtime, p.name AS project, a.plan_key, a.role, a.model_label, a.verdict, a.route_to, a.gate, a.has_routing, a.path
     FROM artifacts a JOIN projects p ON p.id = a.project_id
     WHERE a.is_secondary = 1 ${projectFilter.sql}
     ORDER BY a.mtime DESC LIMIT 12`,
    [...projectFilter.params],
  );

  const runningPipelines = openPipelines.filter((row) => row.source === 'pipeline_events' && row.status === 'running').length;
  const activeProjects = new Set(
    openPipelines
      .filter((row) => row.source === 'pipeline_events' && row.status === 'running')
      .map((row) => String(row.project || ''))
      .filter(Boolean),
  ).size;
  const unresolvedInferred = openPipelines.filter((row) => row.source === 'agent_runs_inferred').length;
  const latest = latestRuns[0] as DbRow | null;
  const pendingGateRows = latestRuns
    .filter((row) => String(row.gate || '').trim())
    .slice(0, 25)
    .map((row) => ({
      project: row.project,
      plan_key: row.plan_key,
      gate: row.gate,
      agent: row.agent,
      timestamp: row.timestamp,
    }));

  return {
    generated_at: new Date().toISOString(),
    status_counts: statusCounts,
    running_agents: active.length,
    running_pipelines: runningPipelines,
    active_projects: activeProjects,
    open_pipelines: openPipelines as unknown as JsonValue,
    timeline_runs: timelineRuns as unknown as JsonValue,
    latest_by_agent: latestByAgent as unknown as JsonValue,
    latest_runs: latestRuns as unknown as JsonValue,
    recent_secondary: recentSecondary as unknown as JsonValue,
    recent: latestRuns as unknown as JsonValue,
    unresolved_inferred: unresolvedInferred,
    summary: {
      last_event_at: latest?.timestamp || null,
      last_agent: latest?.agent || null,
      last_route: latest?.route_to || null,
      open_pipelines: openPipelines.length,
      running_pipelines: runningPipelines,
      active_projects: activeProjects,
      unresolved_inferred: unresolvedInferred,
      pending_gate: pendingGateRows.length > 0,
      active_lead: false,
    },
    pending_gate: pendingGateRows,
  };
}

export function filterProviderRecords(records: JsonObject[]): JsonObject[] {
  return records
    .map((record) => ({
      ...record,
      provider: String(record.provider || ''),
    }))
    .sort((left, right) => {
      const l = providerSortKey(String(left.provider || ''));
      const r = providerSortKey(String(right.provider || ''));
      if (l[0] !== r[0]) return l[0] - r[0];
      return String(left.provider || '').localeCompare(String(right.provider || ''));
    });
}
