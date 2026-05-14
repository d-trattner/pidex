import { LoaderCircle } from 'lucide-react';

export function LoadingIndicator({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="page-loading" role="status" aria-live="polite">
      <LoaderCircle size={16} className="spin-icon" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
