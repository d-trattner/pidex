import type { ReactNode } from 'react';

interface MetricTileProps {
  title: string;
  value: string | number;
  trend?: string;
  subtitle?: string;
  icon?: ReactNode;
}

export function MetricTile({ title, value, trend, subtitle, icon }: MetricTileProps) {
  return (
    <article className="metric-tile glass glass-card">
      <div className="metric-tile-head">
        {icon ? <span className="metric-icon" aria-hidden="true">{icon}</span> : null}
        <h3>{title}</h3>
      </div>
      <div className="metric-value">{value}</div>
      {trend ? <p className="metric-trend">{trend}</p> : null}
      {subtitle ? <p className="muted">{subtitle}</p> : null}
    </article>
  );
}
