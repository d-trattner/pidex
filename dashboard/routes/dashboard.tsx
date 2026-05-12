import { createFileRoute } from '@tanstack/react-router';

function DashboardLayout() {
  return (
    <div className="page-shell">
      <header className="glass">
        <h2 className="h2">Dashboard</h2>
        <p className="muted">Select route from global header or mobile menu.</p>
      </header>

    </div>
  );
}

export const Route = createFileRoute('/dashboard')({
  component: DashboardLayout,
});
