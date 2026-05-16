import { useEffect, useMemo, useState } from 'react';

import { createFileRoute, useLocation } from '@tanstack/react-router';
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, FileText, Folder, FolderOpen, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { createPortal } from 'react-dom';
import remarkGfm from 'remark-gfm';

import { LoadingIndicator } from '../components/ui/loading-indicator';
import { readProjectFromSearch } from '../lib/client/project-query';
import { useDashboardQuery } from '../lib/client/use-dashboard-query';

type TreeNode = { name: string; path: string; type: 'dir' | 'file'; children?: TreeNode[] };
type TreePayload = { project?: string; tree?: TreeNode[] };
type DocPayload = { path?: string; markdown?: string };

const titleCase = (value: string): string => value
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, (char) => char.toUpperCase());

function parseKeyValueBlock(text: string): Array<[string, string]> {
  return text
    .split('\n')
    .map((line): [string, string] | null => {
      const idx = line.indexOf(':');
      if (idx <= 0) return null;
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
    })
    .filter((row): row is [string, string] => Boolean(row));
}

function splitFrontmatter(markdown: string): { frontmatter: Array<[string, string]>; body: string } {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { frontmatter: [], body: markdown };
  return { frontmatter: parseKeyValueBlock(match[1]), body: markdown.slice(match[0].length) };
}

function splitRoutingBlock(markdown: string): { body: string; routing: Array<[string, string]> } {
  const match = markdown.match(/<!--\s*ROUTING\s*([\s\S]*?)-->/i);
  if (!match) return { body: markdown, routing: [] };
  const start = match.index || 0;
  const body = `${markdown.slice(0, start).trimEnd()}\n\n${markdown.slice(start + match[0].length).trimStart()}`.trim();
  return { body, routing: parseKeyValueBlock(match[1].trim()) };
}

function InfoCard({ title, rows, className = '' }: { title: string; rows: Array<[string, string]>; className?: string }) {
  if (rows.length === 0) return null;
  return (
    <section className={`frontmatter-card ${className}`.trim()} aria-label={title}>
      <h4>{title}</h4>
      {rows.map(([key, value]) => (
        <div key={key} className="frontmatter-row">
          <span>{titleCase(key)}</span>
          <strong>{value || '—'}</strong>
        </div>
      ))}
    </section>
  );
}

function MarkdownPreview({ markdown }: { markdown: string }) {
  const { frontmatter, body: withoutFrontmatter } = splitFrontmatter(markdown);
  const { body, routing } = splitRoutingBlock(withoutFrontmatter);
  return (
    <div className="markdown-body">
      <InfoCard title="Frontmatter" rows={frontmatter} />
      <InfoCard title="Routing" rows={routing} className="routing-card" />
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{body || 'Select a markdown file.'}</ReactMarkdown>
    </div>
  );
}

function collectDirPaths(nodes: TreeNode[], out = new Set<string>()): Set<string> {
  for (const node of nodes) {
    if (node.type !== 'dir') continue;
    out.add(node.path);
    collectDirPaths(node.children || [], out);
  }
  return out;
}

function defaultOpenPaths(nodes: TreeNode[]): Set<string> {
  return new Set(nodes.filter((node) => node.path === 'agents.output' || node.path === 'wiki' || node.path.startsWith('agents.wiki.')).map((node) => node.path));
}

function TreeItem({ node, selected, onSelect, openPaths, onToggle, onHover, onLeave, disableTooltip = false }: { node: TreeNode; selected: string; onSelect: (path: string) => void; openPaths: Set<string>; onToggle: (path: string) => void; onHover: (name: string, rect: DOMRect) => void; onLeave: () => void; disableTooltip?: boolean }) {
  const isDir = node.type === 'dir';
  const open = openPaths.has(node.path);
  const active = node.path === selected;
  const children = node.children || [];

  return (
    <li>
      <button
        type="button"
        className={`wiki-tree-item${active ? ' active' : ''}`}
        onClick={() => {
          onLeave();
          if (isDir) onToggle(node.path);
          else onSelect(node.path);
        }}
        onMouseEnter={(event) => { if (!disableTooltip) onHover(node.name, event.currentTarget.getBoundingClientRect()); }}
        onMouseLeave={onLeave}
        onFocus={(event) => { if (!disableTooltip) onHover(node.name, event.currentTarget.getBoundingClientRect()); }}
        onBlur={onLeave}
      >
        {isDir ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span className="wiki-tree-spacer" />}
        {isDir ? (open ? <FolderOpen size={15} /> : <Folder size={15} />) : <FileText size={15} />}
        <span className="wiki-tree-label" data-full-name={node.name}>{node.name}</span>
      </button>
      {isDir && open && children.length ? (
        <ul className="wiki-tree-children">
          {children.map((child) => <TreeItem key={child.path} node={child} selected={selected} onSelect={onSelect} openPaths={openPaths} onToggle={onToggle} onHover={onHover} onLeave={onLeave} disableTooltip={disableTooltip} />)}
        </ul>
      ) : null}
    </li>
  );
}

function WikiPage() {
  const location = useLocation();
  const project = readProjectFromSearch(location.search);
  const [selectedPath, setSelectedPath] = useState('');
  const [filesSheetOpen, setFilesSheetOpen] = useState(false);
  const [openPaths, setOpenPaths] = useState<Set<string>>(new Set());
  const [treeTooltip, setTreeTooltip] = useState<{ name: string; x: number; y: number } | null>(null);
  const treeQuery = useDashboardQuery<TreePayload>(['md-browser-tree', project], `/api/md-browser?project=${encodeURIComponent(project)}`, { enabled: Boolean(project) });
  const docQuery = useDashboardQuery<DocPayload>(['md-browser-doc', project, selectedPath], `/api/md-browser?project=${encodeURIComponent(project)}&path=${encodeURIComponent(selectedPath)}`, { enabled: Boolean(project && selectedPath) });
  const tree = useMemo(() => treeQuery.data?.tree || [], [treeQuery.data]);

  useEffect(() => {
    setOpenPaths(defaultOpenPaths(tree));
  }, [tree]);

  useEffect(() => {
    const open = () => setFilesSheetOpen(true);
    window.addEventListener('pidex:wiki-files-open', open);
    return () => window.removeEventListener('pidex:wiki-files-open', open);
  }, []);

  useEffect(() => {
    if (!filesSheetOpen) return;
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, [filesSheetOpen]);

  const togglePath = (path: string) => setOpenPaths((current) => {
    const next = new Set(current);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    return next;
  });

  const selectPath = (path: string) => {
    setTreeTooltip(null);
    setSelectedPath(path);
    setFilesSheetOpen(false);
  };

  const treeActions = (
    <div className="wiki-nav-actions" aria-label="Tree actions">
      <button type="button" className="icon-button" aria-label="Expand all folders" onClick={() => setOpenPaths(collectDirPaths(tree))}>
        <ChevronsUpDown size={16} aria-hidden="true" />
      </button>
      <button type="button" className="icon-button" aria-label="Collapse all folders" onClick={() => setOpenPaths(new Set())}>
        <ChevronsDownUp size={16} aria-hidden="true" />
      </button>
    </div>
  );

  const renderTreeList = (disableTooltip = false) => tree.length ? (
    <ul className="wiki-tree">
      {tree.map((node) => <TreeItem key={node.path} node={node} selected={selectedPath} onSelect={selectPath} openPaths={openPaths} onToggle={togglePath} onHover={(name, rect) => setTreeTooltip({ name, x: rect.left + 34, y: rect.bottom + 4 })} onLeave={() => setTreeTooltip(null)} disableTooltip={disableTooltip} />)}
    </ul>
  ) : <p className="muted">No markdown files found.</p>;

  const treeContent = (
    <>
      <div className="wiki-nav-header">
        <h3>Files</h3>
        {treeActions}
      </div>
      <div className="wiki-tree-scroll">
        {renderTreeList(false)}
      </div>
    </>
  );

  return (
    <>
    <section className="grid wiki-grid" style={{ marginTop: 12 }}>
      <article className="glass-card glass wiki-hero">
        <h2 className="h2">Project Markdown</h2>
        <p className="muted">Browse project markdown from agents.output and project wiki folders.</p>
      </article>

      {!project ? (
        <article className="glass-card glass wiki-empty">
          <h3>Select a project</h3>
          <p className="muted">The markdown browser is project-specific. Choose a project instead of All Projects.</p>
        </article>
      ) : (
        <>
          {treeQuery.isLoading ? <LoadingIndicator label="Loading markdown tree…" /> : null}
          <aside className="glass-card glass wiki-nav">
            {treeContent}
          </aside>

          {filesSheetOpen ? createPortal(
            <div className="mobile-sheet-overlay mobile-sheet-enter wiki-files-sheet-backdrop" role="dialog" aria-modal="true" aria-label="Markdown files" onClick={() => setFilesSheetOpen(false)}>
              <aside className="glass mobile-sheet wiki-files-sheet" onClick={(event) => event.stopPropagation()}>
                <div className="mobile-sheet-head">
                  <h2 className="h2">Files</h2>
                  <div className="wiki-mobile-sheet-actions">
                    {treeActions}
                    <button type="button" className="icon-button" aria-label="Close files" onClick={() => setFilesSheetOpen(false)}><X size={20} aria-hidden="true" /></button>
                  </div>
                </div>
                <div className="mobile-sheet-body">
                  {renderTreeList(true)}
                </div>
              </aside>
            </div>,
            document.body,
          ) : null}

          <article className="glass-card glass wiki-viewer">
            <div className="wiki-viewer-header">
              <h3>{selectedPath || 'Markdown Viewer'}</h3>
              {docQuery.isLoading ? <LoadingIndicator label="Loading document…" /> : null}
            </div>
            {selectedPath ? (
              <MarkdownPreview markdown={docQuery.data?.markdown || ''} />
            ) : (
              <p className="muted">Select a markdown file from the tree.</p>
            )}
          </article>
        </>
      )}
    </section>
    {treeTooltip ? <div className="wiki-tree-tooltip" style={{ left: treeTooltip.x, top: treeTooltip.y }}>{treeTooltip.name}</div> : null}
    </>
  );
}

export const Route = createFileRoute('/wiki')({
  component: WikiPage,
});
