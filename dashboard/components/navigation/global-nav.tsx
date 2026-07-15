import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';

import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { Activity, BookOpen, BookOpenCheck, Bot, Boxes, FolderGit2, Gauge, LayoutDashboard, Menu as MenuIcon, Settings, ShieldCheck, X } from 'lucide-react';

import { readIncludeTestProjectsFromSearch, readProjectFromSearch, setIncludeTestProjectsInSearch, setProjectInSearch } from '../../lib/client/project-query';
import { PidexLogo } from '../branding/pidex-logo';

export const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/live', label: 'Live', icon: Activity },
  { to: '/runs', label: 'Runs', icon: Bot },
  { to: '/quality', label: 'Quality', icon: ShieldCheck },
  { to: '/modules', label: 'Modules', icon: Boxes },
  { to: '/usage', label: 'Usage', icon: Gauge },
  { to: '/wiki', label: 'Wiki', icon: BookOpen },
  { to: '/context', label: 'Context', icon: BookOpenCheck },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const;

function useProjects(includeTestProjects: boolean): string[] {
  const [projects, setProjects] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    fetch(includeTestProjects ? '/api/projects?include_test_projects=true' : '/api/projects')
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
  }, [includeTestProjects]);

  return projects;
}

function projectLabel(project: string): string {
  return project || 'All projects';
}

function useProjectSelection(onNavigate?: () => void) {
  const location = useLocation();
  const navigate = useNavigate();
  const includeTestProjects = readIncludeTestProjectsFromSearch(location.search);
  const projects = useProjects(includeTestProjects);
  const selectedProject = readProjectFromSearch(location.search);
  const choices = ['', ...projects];

  const selectProject = (project: string) => {
    const search = setProjectInSearch(location.search, project);
    onNavigate?.();
    void navigate({ href: `${location.pathname}${search}` });
  };

  const toggleTestProjects = () => {
    const search = setIncludeTestProjectsInSearch(location.search, !includeTestProjects);
    void navigate({ href: `${location.pathname}${search}` });
  };

  return { choices, selectedProject, selectProject, includeTestProjects, toggleTestProjects };
}

function ProjectButtons({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const { choices, selectedProject, selectProject, includeTestProjects, toggleTestProjects } = useProjectSelection(onNavigate);

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
      <button
        type="button"
        className={mobile ? `mobile-nav-item project-choice${includeTestProjects ? ' active' : ''}` : `project-pill${includeTestProjects ? ' active' : ''}`}
        aria-pressed={includeTestProjects}
        onClick={toggleTestProjects}
      >
        Show test projects
      </button>
    </div>
  );
}

function DesktopProjectSelect() {
  const [open, setOpen] = useState(false);
  const { choices, selectedProject, selectProject, includeTestProjects, toggleTestProjects } = useProjectSelection(() => setOpen(false));
  const label = projectLabel(selectedProject);

  return (
    <div className={`project-select${open ? ' open' : ''}`} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}>
      <button
        type="button"
        className="project-pill project-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <FolderGit2 size={16} aria-hidden="true" />
        <span>{label}</span>
      </button>
      <div className="project-select-menu" role="listbox" aria-label="Project selector" aria-hidden={!open}>
        {choices.map((project) => {
          const active = project === selectedProject;
          return (
            <button
              key={project || '__all_projects__'}
              type="button"
              className={`project-select-option${active ? ' active' : ''}`}
              role="option"
              aria-selected={active}
              tabIndex={open ? 0 : -1}
              onClick={() => selectProject(project)}
            >
              {projectLabel(project)}
            </button>
          );
        })}
        <button
          type="button"
          className={`project-select-option${includeTestProjects ? ' active' : ''}`}
          role="option"
          aria-selected={includeTestProjects}
          tabIndex={open ? 0 : -1}
          onClick={toggleTestProjects}
        >
          Show test projects
        </button>
      </div>
    </div>
  );
}

function NavLinks({ onNavigate, mobile = false }: { onNavigate?: () => void; mobile?: boolean }) {
  const location = useLocation();
  const currentProject = useMemo(() => readProjectFromSearch(location.search), [location.search]);
  const includeTestProjects = useMemo(() => readIncludeTestProjectsFromSearch(location.search), [location.search]);
  return (
    <nav className={mobile ? 'mobile-nav-list' : 'nav'} aria-label="dashboard navigation">
      {NAV_LINKS.map((item) => {
        const isActive = location.pathname === item.to;
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            search={((currentProject || includeTestProjects) ? ({ ...(currentProject ? { project: currentProject } : {}), ...(includeTestProjects ? { include_test_projects: true } : {}) } as never) : ({} as never))}
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
      <div className="global-header-top">
        <div className="global-header-title">
          <PidexLogo />
          <h1 className="h2">PIDEX Dashboard</h1>
        </div>
        <DesktopProjectSelect />
      </div>
      <div className="desktop-controls">
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
          <button ref={closeRef} type="button" className="icon-button" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="mobile-sheet-body">
          {children}
        </div>
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
  const showFilesButton = location.pathname === '/wiki';
  const showSectionsButton = location.pathname === '/context';
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
        <div className={`mobile-bottom-bar${showFilesButton || showSectionsButton ? ' mobile-bottom-bar--three' : ''}`}>
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
          {showFilesButton ? (
            <button
              type="button"
              className="mobile-bottom-button"
              aria-label="Open markdown files"
              onClick={() => window.dispatchEvent(new CustomEvent('pidex:wiki-files-open'))}
            >
              <BookOpen size={16} aria-hidden="true" />
              <span>Files</span>
            </button>
          ) : null}
          {showSectionsButton ? (
            <button
              type="button"
              className="mobile-bottom-button"
              aria-label="Open context sections"
              onClick={() => window.dispatchEvent(new CustomEvent('pidex:context-sections-open'))}
            >
              <BookOpen size={16} aria-hidden="true" />
              <span>Section</span>
            </button>
          ) : null}
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
