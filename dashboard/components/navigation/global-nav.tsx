import { useEffect, useId, useRef, useState } from 'react';

import { Link, useLocation } from '@tanstack/react-router';

export const NAV_LINKS = [
  { to: '/overview', label: 'Overview' },
  { to: '/runs', label: 'Runs' },
  { to: '/tokens', label: 'Tokens' },
  { to: '/pipelines', label: 'Pipelines' },
  { to: '/quality', label: 'Quality' },
  { to: '/analysis', label: 'Analysis' },
  { to: '/live', label: 'Live' },
  { to: '/limits', label: 'Limits' },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="nav" aria-label="dashboard navigation">
      {NAV_LINKS.map((item) => (
        <Link key={item.to} to={item.to} className="pill" onClick={onNavigate}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function GlobalHeader() {
  return (
    <header className="glass global-header">
      <div>
        <h1 className="h2">PIDEX Dashboard</h1>
        <p className="muted">Operational metrics, pipeline health, live status, and provider limits.</p>
      </div>
      <div className="desktop-nav">
        <NavLinks />
      </div>
    </header>
  );
}

export function MobileMenuSheet() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);
  const dialogId = useId();
  const titleId = useId();
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }

      if (event.key === 'Tab') {
        const tabbables = sheetRef.current?.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (!tabbables || tabbables.length === 0) return;

        const first = tabbables[0] as HTMLElement;
        const last = tabbables[tabbables.length - 1] as HTMLElement;
        const active = document.activeElement;

        if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
          return;
        }

        if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open) return;
    triggerRef.current?.focus();
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="mobile-menu-trigger"
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-controls={dialogId}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        Menu
      </button>
      {open ? (
        <div className="mobile-sheet-overlay" onClick={() => setOpen(false)}>
          <section
            ref={sheetRef}
            id={dialogId}
            className="glass mobile-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mobile-sheet-head">
              <h2 id={titleId} className="h2">Navigation</h2>
              <button ref={closeRef} type="button" className="glass-btn" aria-label="Close menu" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} />
          </section>
        </div>
      ) : null}
    </>
  );
}
