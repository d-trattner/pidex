interface MetricTileProps {
  title: string;
  value: string | number;
  trend?: string;
  subtitle?: string;
}

export function MetricTile({ title, value, trend, subtitle }: MetricTileProps) {
  return (
    <article className="metric-tile glass glass-card">
      <h3>{title}</h3>
      <div className="metric-value">{value}</div>
      {trend ? <p className="metric-trend">{trend}</p> : null}
      {subtitle ? <p className="muted">{subtitle}</p> : null}
    </article>
  );
}
