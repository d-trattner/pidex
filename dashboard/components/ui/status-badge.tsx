interface StatusBadgeProps {
  label: string;
  status: 'ok' | 'warn' | 'bad' | 'muted';
}

function tone(status: StatusBadgeProps['status']) {
  if (status === 'ok') return 'status-ok';
  if (status === 'warn') return 'status-warn';
  if (status === 'bad') return 'status-bad';
  return 'status-muted';
}

export function StatusBadge({ label, status }: StatusBadgeProps) {
  return (
    <span className={`status-badge ${tone(status)}`}>
      <span className="status-dot" />
      {label}
    </span>
  );
}
