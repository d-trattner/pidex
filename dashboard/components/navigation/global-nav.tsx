import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';

import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { Activity, BarChart3, Bot, FolderGit2, Gauge, GitBranch, Home, LineChart, Menu as MenuIcon, ShieldCheck } from 'lucide-react';

import { readProjectFromSearch, setProjectInSearch } from '../../lib/client/project-query';

export const NAV_LINKS = [
  { to: '/overview', label: 'Overview', icon: Home },
  { to: '/runs', label: 'Runs', icon: Bot },
  { to: '/tokens', label: 'Tokens', icon: BarChart3 },
  { to: '/pipelines', label: 'Pipelines', icon: GitBranch },
  { to: '/quality', label: 'Quality', icon: ShieldCheck },
  { to: '/analysis', label: 'Analysis', icon: LineChart },
  { to: '/live', label: 'Live', icon: Activity },
  { to: '/limits', label: 'Limits', icon: Gauge },
] as const;

function useProjects(): string[] {
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

  return projects;
}

function projectLabel(project: string): string {
  return project || 'All projects';
}

function ProjectButtons({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const projects = useProjects();
  const selectedProject = readProjectFromSearch(location.search);
  const choices = ['', ...projects];

  const selectProject = (project: string) => {
    const search = setProjectInSearch(location.search, project);
    onNavigate?.();
    void navigate({ href: `${location.pathname}${search}` });
  };

  return (
    <div className={mobile ? 'mobile-nav-list' : 'project-button-row'} role="list" aria-label="Project selector">
      {choices.map((project) => {
        const active = project === selectedProject;
        return (
          <button
            key={project || '__all_projects__'}
            type="button"
            className={mobile ? `mobile-nav-item project-choice${active ? ' active' : ''}` : `project-pill${active ? ' active' : ''}`}
            aria-pressed={active}
            onClick={() => selectProject(project)}
          >
            {projectLabel(project)}
          </button>
        );
      })}
    </div>
  );
}

function NavLinks({ onNavigate, mobile = false }: { onNavigate?: () => void; mobile?: boolean }) {
  const location = useLocation();
  const currentProject = useMemo(() => readProjectFromSearch(location.search), [location.search]);
  return (
    <nav className={mobile ? 'mobile-nav-list' : 'nav'} aria-label="dashboard navigation">
      {NAV_LINKS.map((item) => {
        const isActive = location.pathname === item.to;
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            search={(currentProject ? ({ project: currentProject } as never) : ({} as never))}
            className={mobile ? `mobile-nav-item${isActive ? ' active' : ''}` : `pill nav-pill${isActive ? ' active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            onClick={onNavigate}
          >
            <Icon size={16} aria-hidden="true" />
            <span>{item.label}</span>
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
      <div className="desktop-controls">
        <ProjectButtons />
        <div className="desktop-nav">
          <NavLinks />
        </div>
      </div>
    </header>
  );
}

function MobileSheet({
  open,
  title,
  titleId,
  dialogId,
  sheetRef,
  closeRef,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  titleId: string;
  dialogId: string;
  sheetRef: RefObject<HTMLElement | null>;
  closeRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="mobile-sheet-overlay mobile-sheet-enter" onClick={onClose}>
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
          <h2 id={titleId} className="h2">{title}</h2>
          <button ref={closeRef} type="button" className="glass-btn" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function MobileMenuSheet() {
  const [openSheet, setOpenSheet] = useState<'menu' | 'project' | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const projectTriggerRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const menuDialogId = useId();
  const projectDialogId = useId();
  const menuTitleId = useId();
  const projectTitleId = useId();
  const location = useLocation();
  const currentProject = readProjectFromSearch(location.search);
  const open = openSheet !== null;

  const openDialog = (sheet: 'menu' | 'project', ref: RefObject<HTMLButtonElement | null>) => {
    triggerRef.current = ref.current;
    setOpenSheet(sheet);
  };

  const closeDialog = () => setOpenSheet(null);

  useEffect(() => {
    setOpenSheet(null);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDialog();
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
      <div className="mobile-menu-trigger-full" aria-label="Mobile dashboard controls">
        <div className="mobile-bottom-bar">
          <button
            ref={projectTriggerRef}
            type="button"
            className="mobile-bottom-button"
            aria-label="Open project selector"
            aria-haspopup="dialog"
            aria-controls={projectDialogId}
            aria-expanded={openSheet === 'project'}
            onClick={() => openDialog('project', projectTriggerRef)}
          >
            <FolderGit2 size={16} aria-hidden="true" />
            <span>{projectLabel(currentProject)}</span>
          </button>
          <button
            ref={menuTriggerRef}
            type="button"
            className="mobile-bottom-button"
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-controls={menuDialogId}
            aria-expanded={openSheet === 'menu'}
            onClick={() => openDialog('menu', menuTriggerRef)}
          >
            <MenuIcon size={16} aria-hidden="true" />
            <span>Menu</span>
          </button>
        </div>
      </div>
      <MobileSheet
        open={openSheet === 'menu'}
        title="Navigation"
        titleId={menuTitleId}
        dialogId={menuDialogId}
        sheetRef={sheetRef}
        closeRef={closeRef}
        onClose={closeDialog}
      >
        <NavLinks mobile onNavigate={closeDialog} />
      </MobileSheet>
      <MobileSheet
        open={openSheet === 'project'}
        title="Project selection"
        titleId={projectTitleId}
        dialogId={projectDialogId}
        sheetRef={sheetRef}
        closeRef={closeRef}
        onClose={closeDialog}
      >
        <ProjectButtons mobile onNavigate={closeDialog} />
      </MobileSheet>
    </>
  );
}
