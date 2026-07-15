
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
import { summarizeModelQualityRows } from './model-quality';
import { DASHBOARD_ROOT, PIDEX_ROOT } from './paths';

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
  by_mode: Array<{ project_mode: string; count: number }>;
}

export function parseSearchParams(search = ''): URLSearchParams {
  return new URLSearchParams(search);
}

export async function listProjects(search = ''): Promise<Array<{ name: string; path: string; is_test_project: boolean }>> {
  const includeTestProjects = parseBool(parseSearchParams(search).get('include_test_projects'));
  const rows = await queryRows<{ name: string; path: string; is_test_project: boolean | number }>(
    `SELECT p.name, p.path, COALESCE(p.is_test_project, 0) AS is_test_project
     FROM projects p
     WHERE p.path NOT IN (?, ?)
       ${includeTestProjects ? '' : 'AND COALESCE(p.is_test_project, 0) = 0'}
     ORDER BY p.name COLLATE NOCASE ASC`,
    [PIDEX_ROOT, DASHBOARD_ROOT],
  );
  return rows.map((row) => ({ ...row, is_test_project: Boolean(row.is_test_project) }));
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

  const [pipelineEvents, agentRuns, secondaryArtifacts, mergeArtifacts, malformedSecondary, cost, byModel, byAgent, byMode, projects] =
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
      queryRows<{ project_mode: string; count: number }>(
        `SELECT COALESCE(NULLIF(ar.project_mode, ''), 'unknown') AS project_mode, COUNT(*) AS count
         FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
         WHERE 1=1 ${projectFilter.sql}
         GROUP BY 1
         ORDER BY count DESC, project_mode ASC`,
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
    by_mode: byMode,
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
    `SELECT ar.timestamp, p.name AS project, ar.plan_key, ar.project_mode, ar.agent, ar.provider, ar.model, ar.verdict,
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
        COALESCE(NULLIF(MAX(ar.project_mode), ''), 'unknown') AS project_mode,
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

  const runsByMode = await queryRows<DbRow>(
    `SELECT COALESCE(NULLIF(ar.project_mode, ''), 'unknown') AS project_mode, COUNT(*) AS count,
            SUM(CASE WHEN ar.exit_code IS NOT NULL AND ar.exit_code != 0 THEN 1 ELSE 0 END) AS failures,
            ROUND(SUM(COALESCE(ar.cost_usd, 0)), 5) AS cost_usd
     FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
     WHERE 1=1 ${projectFilter.sql}
     GROUP BY 1 ORDER BY count DESC, project_mode ASC`,
    [...projectFilter.params],
  );

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
    runsByMode,
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

  return { models: summarizeModelQualityRows(rows) as JsonArray };
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

  const inferredRunningMs = Number(process.env.PIDEX_DASHBOARD_INFERRED_RUNNING_MS || 45 * 60 * 1000);
  const eventRunningMs = Number(process.env.PIDEX_DASHBOARD_EVENT_RUNNING_MS || 6 * 60 * 60 * 1000);
  const freshEnough = (row: DbRow, windowMs: number): boolean => {
    const lastAt = Date.parse(String(row.last_at || ''));
    return Number.isFinite(lastAt) && Date.now() - lastAt <= windowMs;
  };
  const isRunningOpenPipeline = (row: DbRow): boolean => {
    if (row.source === 'pipeline_events') return row.status === 'running' && freshEnough(row, eventRunningMs);
    if (row.source !== 'agent_runs_inferred') return false;
    return freshEnough(row, inferredRunningMs);
  };
  const openPipelines: DbRow[] = ((eventOpen || []).concat(inferredOpen || []) as DbRow[]).slice(0, 24).map((row: DbRow) => ({
    ...row,
    is_running: isRunningOpenPipeline(row),
  }));

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

  const runningPipelines = openPipelines.filter((row) => row.is_running).length;
  const activeProjects = new Set(
    openPipelines
      .filter((row) => row.is_running)
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
