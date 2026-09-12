// Historical display query, NOT a replacement for the canonical terminal gate.
// filterSql must come from the existing parameterized project-filter builder.
export function pipelineSummarySql(filterSql = ''): string {
  const terminal = "event_type IN ('pipeline_completed','pipeline_failed','pipeline_aborted','pipeline_cancelled')";
  return `WITH attempts AS (
    SELECT pe.project_id, pe.project_path, pe.plan_key, pe.pipeline_id,
      MAX(CASE WHEN event_type = 'pipeline_started' THEN 1 ELSE 0 END) AS opened,
      COUNT(DISTINCT CASE WHEN event_type = 'pipeline_started' THEN timestamp END) AS openings,
      MIN(CASE WHEN event_type = 'pipeline_started' THEN julianday(timestamp) END) AS opened_at,
      COUNT(DISTINCT CASE WHEN ${terminal} THEN event_type END) AS terminal_kinds,
      COUNT(DISTINCT CASE WHEN ${terminal} THEN timestamp END) AS terminal_times,
      MAX(CASE WHEN event_type = 'pipeline_completed' THEN julianday(timestamp) END) AS completed_at,
      MAX(julianday(timestamp)) AS last_at,
      MAX(CASE WHEN julianday(timestamp) IS NULL THEN 1 ELSE 0 END) AS invalid_time,
      MAX(CASE WHEN event_type = 'pipeline_completed' AND COALESCE(status, '') NOT IN ('', 'completed') THEN 1 ELSE 0 END) AS conflicting_status
    FROM pipeline_events pe JOIN projects p ON p.id = pe.project_id
    WHERE COALESCE(pe.pipeline_id, '') <> '' AND COALESCE(pe.project_path, '') <> ''
      AND COALESCE(pe.plan_key, '') NOT IN ('', 'unknown-plan') ${filterSql}
    GROUP BY pe.project_id, pe.project_path, pe.plan_key, pe.pipeline_id
  ) SELECT COALESCE(SUM(opened), 0) AS started,
    COALESCE(SUM(CASE WHEN opened = 1 AND openings = 1 AND terminal_kinds = 1 AND terminal_times = 1
      AND invalid_time = 0 AND conflicting_status = 0 AND completed_at >= opened_at AND completed_at = last_at
      THEN 1 ELSE 0 END), 0) AS completed
    FROM attempts`;
}
