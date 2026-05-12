import { type ReactNode } from 'react';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function ChartCard({ title, subtitle, children }: ChartCardProps) {
  return (
    <article className="chart-card glass glass-card">
      <div className="chart-card__header">
        <h3 className="chart-card__title">{title}</h3>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      <div>{children}</div>
    </article>
  );
}
