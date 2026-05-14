import { createFileRoute } from '@tanstack/react-router';

import { LimitsPage } from './limits';
import { TokensPage } from './tokens';

function UsagePage() {
  return (
    <>
      <section className="grid" style={{ marginTop: 12 }}>
        <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
          <h2 className="h2">Usage</h2>
          <p className="muted">Provider quotas, active profile, token consumption, and cost signals in one place.</p>
        </article>
      </section>
      <LimitsPage />
      <TokensPage />
    </>
  );
}

export const Route = createFileRoute('/usage')({
  component: UsagePage,
});
