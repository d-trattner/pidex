export type ModelQualityInputRow = {
  model?: string | number | boolean | null;
  raw_model?: string | number | boolean | null;
  exit_code?: string | number | boolean | null;
  agent?: string | number | boolean | null;
  verdict?: string | number | boolean | null;
  gate?: string | number | boolean | null;
  input_tokens?: string | number | boolean | null;
  output_tokens?: string | number | boolean | null;
  cost_usd?: string | number | boolean | null;
};

export type ModelQualityRow = Record<string, string | number | string[]>;

export function summarizeModelQualityRows(rows: ModelQualityInputRow[]): ModelQualityRow[] {
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
    g.success += (r.exit_code == null || exitCode === 0 || verdict === 'APPROVED' || verdict === 'COMPLETE' ? 1 : 0);
    g.continuation += Number((r.agent === 'pidex-implementer' && (verdict === 'BLOCKED' || verdict === 'IN_PROGRESS')) ? 1 : 0);
    g.rejection += Number((verdict === 'REJECTED' || ['G1', 'G3', 'G5'].includes(gate)) ? 1 : 0);
    g.sigterm += Number(exitCode !== 0 ? 1 : 0);
    g.tokens += Number(r.input_tokens || 0) + Number(r.output_tokens || 0);
    g.cost += Number(r.cost_usd || 0);
  }

  const out: ModelQualityRow[] = [];
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
  return out;
}
