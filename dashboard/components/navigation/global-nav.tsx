import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { Link, useLocation, useNavigate } from '@tanstack/react-router';

import { readProjectFromSearch, setProjectInSearch } from '../../lib/client/project-query';

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

function ProjectSelector() {
  const location = useLocation();
  const navigate = useNavigate();
  const selectedProject = readProjectFromSearch(location.search);
  const [projects, setProjects] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    fetch('/api/projects')
      .then((res) => res.json())
      .then((json) => {
        if (!mounted) return;
        const values: string[] = Array.isArray(json?.projects)
          ? json.projects
              .map((item: { name?: unknown; path?: unknown }) => String(item?.name || item?.path || '').trim())
              .filter((item: string) => item.length > 0)
          : [];
        setProjects(Array.from(new Set(values)).sort((a: string, b: string) => a.localeCompare(b)));
      })
      .catch(() => setProjects([]));
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="muted" style={{ fontSize: 12 }}>Project</span>
      <select
        aria-label="Project selector"
        value={selectedProject}
        onChange={(event) => {
          const search = setProjectInSearch(location.search, event.target.value);
          void navigate({ href: `${location.pathname}${search}` });
        }}
      >
        <option value="">All projects</option>
        {projects.map((project) => (
          <option key={project} value={project}>{project}</option>
        ))}
      </select>
    </label>
  );
}

function NavLinks({ onNavigate, mobile = false }: { onNavigate?: () => void; mobile?: boolean }) {
  const location = useLocation();
  const currentProject = useMemo(() => readProjectFromSearch(location.search), [location.search]);
  return (
    <nav className={mobile ? 'mobile-nav-list' : 'nav'} aria-label="dashboard navigation">
      {NAV_LINKS.map((item) => {
        const isActive = location.pathname === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            search={(currentProject ? ({ project: currentProject } as never) : ({} as never))}
            className={mobile ? `mobile-nav-item${isActive ? ' active' : ''}` : 'pill'}
            aria-current={isActive ? 'page' : undefined}
            onClick={onNavigate}
          >
            {item.label}
          </Link>
        );
      })}
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
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <ProjectSelector />
        <div className="desktop-nav">
          <NavLinks />
        </div>
      </div>
    </header>
  );
}

export function MobileMenuSheet() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
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
        const tabbables = sheetRef.current?.querySelectorAll('a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])');
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
    if (wasOpenRef.current && !open) {
      triggerRef.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="mobile-menu-trigger-full"
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-controls={dialogId}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        Menu
      </button>
      {open ? (
        <div className="mobile-sheet-overlay mobile-sheet-enter" onClick={() => setOpen(false)}>
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
            <ProjectSelector />
            <NavLinks mobile onNavigate={() => setOpen(false)} />
          </section>
        </div>
      ) : null}
    </>
  );
}
