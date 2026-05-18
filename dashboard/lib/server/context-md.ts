import { createHash } from 'node:crypto';
import path from 'node:path';

export interface ContextEntry {
  term: string;
  definition: string;
  avoid: string[];
}

export interface ContextOpenQuestion {
  index: number;
  text: string;
}

export interface ContextReviewEntry extends ContextEntry {
  index: number;
}

export interface ContextEditableSection {
  heading: string;
  body: string;
}

interface EntryBlock {
  entry: ContextEntry;
  start: number;
  end: number;
}

export interface ParsedContext {
  raw: string;
  beforeLanguage: string;
  languageHeading: string | null;
  entries: ContextEntry[];
  openQuestions: ContextOpenQuestion[];
  reviewEntries: ContextReviewEntry[];
  editableSections: ContextEditableSection[];
  afterLanguage: string;
  errors: string[];
  structuredEditable: boolean;
  hash: string;
  mtimeMs: number | null;
}

export const DEFAULT_CONTEXT_MARKDOWN = `# Project Context

Project domain language and decisions that agents should use when planning work.

## Language

## Relationships

## Example dialogue

## Flagged ambiguities
`;

const LANGUAGE_HEADING_RE = /^##\s+Language\s*$/im;
const OPEN_QUESTIONS_HEADING_RE = /^##\s+Open Questions\s*\/\s*Needs User Review\s*$/im;
const APPROVED_NOTES_HEADING = '## Approved Context Notes';
const OPEN_QUESTIONS_HEADING = '## Open Questions / Needs User Review';
const NEXT_H2_RE = /^##\s+/m;
const EDITABLE_SECTION_HEADINGS = [
  'Project Identity',
  'Relationships',
  'Architecture Notes',
  'Operational Constraints',
  'Known Workflows',
  'Evidence Sources',
  'Example Dialogue',
  'Flagged Ambiguities',
  'Approved Context Notes',
];
const TERM_RE = /^\*\*([^*\n][^*\n]*?)\*\*:\s*$/;
const AVOID_RE = /^_Avoid_:\s*(.*?)\s*$/i;

export function contextHash(raw: string): string {
  return `sha256:${createHash('sha256').update(raw).digest('hex')}`;
}

function splitSection(raw: string, headingRe: RegExp): { before: string; heading: string | null; section: string; after: string } {
  const match = raw.match(headingRe);
  if (!match || match.index == null) return { before: raw, heading: null, section: '', after: '' };
  const headingStart = match.index;
  const headingEnd = headingStart + match[0].length;
  const afterHeading = raw.slice(headingEnd);
  const next = afterHeading.match(NEXT_H2_RE);
  const sectionEnd = next && next.index != null ? headingEnd + next.index : raw.length;
  return {
    before: raw.slice(0, headingStart),
    heading: match[0],
    section: raw.slice(headingEnd, sectionEnd),
    after: raw.slice(sectionEnd),
  };
}

function splitLanguage(raw: string): { before: string; heading: string | null; section: string; after: string } {
  return splitSection(raw, LANGUAGE_HEADING_RE);
}

function cleanLines(section: string): string[] {
  return section.replace(/^\r?\n/, '').split(/\r?\n/);
}

function headingRegex(heading: string): RegExp {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^##\\s+${escaped}\\s*$`, 'im');
}

export function extractEditableSections(raw: string): ContextEditableSection[] {
  const out: ContextEditableSection[] = [];
  for (const heading of EDITABLE_SECTION_HEADINGS) {
    const split = splitSection(raw, headingRegex(heading));
    if (!split.heading) continue;
    out.push({ heading, body: split.section.replace(/^\r?\n/, '').replace(/\s*$/, '') });
  }
  return out;
}

function replaceEditableSection(raw: string, section: ContextEditableSection): string {
  const split = splitSection(raw, headingRegex(section.heading));
  const body = section.body.replace(/\s*$/, '');
  const rendered = `## ${section.heading}\n\n${body}\n`;
  if (!split.heading) return `${raw.replace(/\s*$/, '\n\n')}${rendered}`;
  return `${split.before}${rendered}${split.after.replace(/^\n?/, '\n')}`;
}

export function extractOpenQuestions(raw: string): ContextOpenQuestion[] {
  const split = splitSection(raw, OPEN_QUESTIONS_HEADING_RE);
  if (!split.heading) return [];
  const out: ContextOpenQuestion[] = [];
  cleanLines(split.section).forEach((line, lineIndex) => {
    const match = line.match(/^\s*[-*]\s+(.+?)\s*$/);
    if (!match) return;
    const text = match[1].trim();
    if (!text || /^todo\b/i.test(text)) return;
    out.push({ index: lineIndex, text });
  });
  return out;
}

function bulletForApprovedQuestion(text: string): string {
  return `- ${text.replace(/^[-*]\s+/, '').trim()}`;
}

function parseEntryBlocks(section: string): { blocks: EntryBlock[]; errors: string[] } {
  const lines = cleanLines(section);
  const blocks: EntryBlock[] = [];
  const errors: string[] = [];
  let i = 0;
  let inHtmlComment = false;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (inHtmlComment) {
      if (trimmed.includes('-->')) inHtmlComment = false;
      i += 1;
      continue;
    }
    if (trimmed.startsWith('<!--')) {
      if (!trimmed.includes('-->')) inHtmlComment = true;
      i += 1;
      continue;
    }
    if (!trimmed || /^[-*]\s*TODO\b/i.test(trimmed)) { i += 1; continue; }
    if (/^[-*]\s+/.test(trimmed)) { i += 1; continue; }
    const termMatch = line.match(TERM_RE);
    if (!termMatch) {
      errors.push(`Unparseable glossary entry near line: ${line.trim().slice(0, 80)}`);
      i += 1;
      continue;
    }
    const start = i;
    const term = termMatch[1].trim();
    i += 1;
    const definitionLines: string[] = [];
    let avoid: string[] = [];
    while (i < lines.length) {
      const current = lines[i];
      if (TERM_RE.test(current)) break;
      const avoidMatch = current.match(AVOID_RE);
      if (avoidMatch) {
        avoid = avoidMatch[1].split(',').map((item) => item.trim()).filter(Boolean);
        i += 1;
        continue;
      }
      if (current.trim()) definitionLines.push(current.trim());
      i += 1;
    }
    blocks.push({ entry: { term, definition: definitionLines.join('\n').trim(), avoid }, start, end: i });
  }
  return { blocks, errors };
}

export function extractReviewEntries(raw: string): ContextReviewEntry[] {
  const split = splitSection(raw, OPEN_QUESTIONS_HEADING_RE);
  if (!split.heading) return [];
  return parseEntryBlocks(split.section).blocks.map((block) => ({ ...block.entry, index: block.start }));
}

function removeReviewEntry(raw: string, entryIndex: number): { raw?: string; entry?: ContextEntry; errors: string[] } {
  const split = splitSection(raw, OPEN_QUESTIONS_HEADING_RE);
  if (!split.heading) return { errors: ['Missing ## Open Questions / Needs User Review section'] };
  const lines = cleanLines(split.section);
  const block = parseEntryBlocks(split.section).blocks.find((candidate) => candidate.start === entryIndex);
  if (!block) return { errors: ['Review entry not found'] };
  lines.splice(block.start, block.end - block.start);
  const section = `\n${lines.join('\n').replace(/\s*$/, '')}\n`;
  return { raw: `${split.before}${split.heading}${section}${split.after.replace(/^\n?/, '\n')}`, entry: block.entry, errors: [] };
}

export function deleteReviewEntry(raw: string, entryIndex: number): { raw?: string; errors: string[] } {
  const result = removeReviewEntry(raw, entryIndex);
  return { raw: result.raw, errors: result.errors };
}

export function approveReviewEntry(raw: string, entryIndex: number, approvedEntry?: ContextEntry): { raw?: string; errors: string[] } {
  const removed = removeReviewEntry(raw, entryIndex);
  if (removed.errors.length || !removed.raw || !removed.entry) return { errors: removed.errors };
  const entry = approvedEntry || removed.entry;
  const entryErrors = validateEntries([entry]);
  if (entryErrors.length) return { errors: entryErrors };
  const parsed = parseContextMarkdown(removed.raw);
  const result = serializeStructuredContext(parsed, [...parsed.entries, entry]);
  if (result.errors.length || !result.raw) return { errors: result.errors };
  return { raw: result.raw, errors: [] };
}

function appendApprovedNote(raw: string, text: string): string {
  const bullet = bulletForApprovedQuestion(text);
  const approvedRe = /^##\s+Approved Context Notes\s*$/im;
  const split = splitSection(raw, approvedRe);
  if (!split.heading) {
    return `${raw.replace(/\s*$/, '\n\n')}${APPROVED_NOTES_HEADING}\n\n${bullet}\n`;
  }
  const section = split.section.replace(/\s*$/, '\n');
  return `${split.before}${split.heading}${section}${bullet}\n${split.after.replace(/^\n?/, '\n')}`;
}

export function approveOpenQuestion(raw: string, questionIndex: number): { raw?: string; errors: string[] } {
  const split = splitSection(raw, OPEN_QUESTIONS_HEADING_RE);
  if (!split.heading) return { errors: ['Missing ## Open Questions / Needs User Review section'] };
  const lines = cleanLines(split.section);
  const line = lines[questionIndex];
  const match = line?.match(/^\s*[-*]\s+(.+?)\s*$/);
  if (!match) return { errors: ['Open question not found'] };
  const text = match[1].trim();
  if (!text || /^todo\b/i.test(text)) return { errors: ['Cannot approve empty/TODO open question'] };
  lines.splice(questionIndex, 1);
  const openSection = `\n${lines.join('\n').replace(/\s*$/, '')}\n`;
  const withoutQuestion = `${split.before}${split.heading}${openSection}${split.after.replace(/^\n?/, '\n')}`;
  return { raw: appendApprovedNote(withoutQuestion, text), errors: [] };
}

export function validateEntries(entries: ContextEntry[]): string[] {
  const errors: string[] = [];
  const seen = new Map<string, string>();
  entries.forEach((entry, index) => {
    const term = entry.term.trim();
    const definition = entry.definition.trim();
    if (!term) errors.push(`Entry ${index + 1}: term is required`);
    if (!definition) errors.push(`Entry ${term || index + 1}: definition is required`);
    const key = term.toLowerCase();
    if (key) {
      const previous = seen.get(key);
      if (previous) errors.push(`Duplicate term: ${term} conflicts with ${previous}`);
      else seen.set(key, term);
    }
  });
  return errors;
}

export function parseContextMarkdown(raw: string, mtimeMs: number | null = null): ParsedContext {
  const errors: string[] = [];
  const split = splitLanguage(raw);
  const entries: ContextEntry[] = [];

  if (!split.heading) {
    return {
      raw,
      beforeLanguage: raw,
      languageHeading: null,
      entries: [],
      openQuestions: extractOpenQuestions(raw),
      reviewEntries: extractReviewEntries(raw),
      editableSections: extractEditableSections(raw),
      afterLanguage: '',
      errors: ['Missing ## Language section'],
      structuredEditable: true,
      hash: contextHash(raw),
      mtimeMs,
    };
  }

  const parsedEntries = parseEntryBlocks(split.section);
  entries.push(...parsedEntries.blocks.map((block) => block.entry));
  errors.push(...parsedEntries.errors.map((error) => error.replace('Unparseable glossary entry', 'Unparseable content in ## Language')));
  errors.push(...validateEntries(entries));
  return {
    raw,
    beforeLanguage: split.before,
    languageHeading: split.heading,
    entries,
    openQuestions: extractOpenQuestions(raw),
    reviewEntries: extractReviewEntries(raw),
    editableSections: extractEditableSections(raw),
    afterLanguage: split.after,
    errors,
    structuredEditable: errors.length === 0,
    hash: contextHash(raw),
    mtimeMs,
  };
}

export function serializeLanguageSection(entries: ContextEntry[]): string {
  const lines = ['## Language', ''];
  for (const entry of entries) {
    lines.push(`**${entry.term.trim()}**:`);
    lines.push(entry.definition.trim());
    const avoid = entry.avoid.map((item) => item.trim()).filter(Boolean);
    if (avoid.length) lines.push(`_Avoid_: ${avoid.join(', ')}`);
    lines.push('');
  }
  return lines.join('\n').replace(/\n+$/, '\n');
}

export function serializeStructuredContext(current: ParsedContext, entries: ContextEntry[]): { raw?: string; errors: string[] } {
  if (!current.structuredEditable) return { errors: ['Structured editing disabled until ## Language syntax is fixed in raw mode'] };
  const errors = validateEntries(entries);
  if (errors.length) return { errors };
  const language = serializeLanguageSection(entries);
  const raw = current.languageHeading
    ? `${current.beforeLanguage}${language}${current.afterLanguage.replace(/^\n?/, '\n')}`
    : `${current.raw.replace(/\s*$/, '\n\n')}${language}`;
  const reparsed = parseContextMarkdown(raw);
  const reparsedTerms = reparsed.entries.map((entry) => entry.term.trim().toLowerCase());
  const wantedTerms = entries.map((entry) => entry.term.trim().toLowerCase());
  if (reparsed.errors.length || reparsedTerms.length !== wantedTerms.length || reparsedTerms.some((term, idx) => term !== wantedTerms[idx])) {
    return { errors: ['Serialized context did not parse back to the same entries', ...reparsed.errors] };
  }
  return { raw: raw.endsWith('\n') ? raw : `${raw}\n`, errors: [] };
}

export function serializeContextWithSections(current: ParsedContext, entries: ContextEntry[], sections: ContextEditableSection[]): { raw?: string; errors: string[] } {
  const structured = serializeStructuredContext(current, entries);
  if (structured.errors.length || !structured.raw) return structured;
  let raw = structured.raw;
  for (const section of sections) raw = replaceEditableSection(raw, section);
  return { raw: raw.endsWith('\n') ? raw : `${raw}\n`, errors: [] };
}

export function normalizeRawContext(raw: string): { raw: string; parsed: ParsedContext } {
  const normalized = raw.endsWith('\n') ? raw : `${raw}\n`;
  return { raw: normalized, parsed: parseContextMarkdown(normalized) };
}

export function safeContextTarget(projectRoot: string): { contextRoot: string; target: string } | null {
  const contextRoot = path.resolve(projectRoot, 'pidex', 'context');
  const target = path.resolve(contextRoot, 'CONTEXT.md');
  const rel = path.relative(contextRoot, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return { contextRoot, target };
}
