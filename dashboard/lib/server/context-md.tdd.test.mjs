import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

const mod = await import('./context-md.ts');

test('parses single entry with avoid aliases', () => {
  const parsed = mod.parseContextMarkdown(`# Project\n\n## Language\n\n**Order**:\nA request placed by a customer.\n_Avoid_: Purchase, transaction\n`);
  assert.equal(parsed.structuredEditable, true);
  assert.deepEqual(parsed.entries, [{ term: 'Order', definition: 'A request placed by a customer.', avoid: ['Purchase', 'transaction'] }]);
});

test('parses multiple entries', () => {
  const parsed = mod.parseContextMarkdown(`## Language\n\n**Order**:\nA request.\n\n**Invoice**:\nA payment request.\n`);
  assert.deepEqual(parsed.entries.map((entry) => entry.term), ['Order', 'Invoice']);
});

test('preserves sections before and after language on structured serialize', () => {
  const raw = `# Project Context\n\nIntro.\n\n## Language\n\n**Order**:\nA request.\n\n## Relationships\n\n- An **Order** produces invoices.\n`;
  const parsed = mod.parseContextMarkdown(raw);
  const result = mod.serializeStructuredContext(parsed, [{ term: 'Order', definition: 'A customer request.', avoid: ['Purchase'] }]);
  assert.equal(result.errors.length, 0);
  assert.match(result.raw, /^# Project Context/);
  assert.match(result.raw, /## Relationships\n\n- An \*\*Order\*\* produces invoices\./);
  assert.match(result.raw, /_Avoid_: Purchase/);
});

test('serializes edited entry and reparses same term count', () => {
  const parsed = mod.parseContextMarkdown(`## Language\n\n**Order**:\nA request.\n`);
  const result = mod.serializeStructuredContext(parsed, [
    { term: 'Order', definition: 'A request.', avoid: [] },
    { term: 'Invoice', definition: 'A payment request.', avoid: ['Bill'] },
  ]);
  assert.equal(result.errors.length, 0);
  const reparsed = mod.parseContextMarkdown(result.raw);
  assert.equal(reparsed.entries.length, 2);
});

test('rejects duplicate terms case-insensitively', () => {
  const errors = mod.validateEntries([
    { term: 'Order', definition: 'A request.', avoid: [] },
    { term: 'order', definition: 'Duplicate.', avoid: [] },
  ]);
  assert.match(errors.join('\n'), /Duplicate term/);
});

test('rejects empty term and definition', () => {
  const errors = mod.validateEntries([{ term: ' ', definition: '', avoid: [] }]);
  assert.match(errors.join('\n'), /term is required/);
  assert.match(errors.join('\n'), /definition is required/);
});

test('creates language section when missing', () => {
  const parsed = mod.parseContextMarkdown('# Project\n\nIntro.\n');
  const result = mod.serializeStructuredContext(parsed, [{ term: 'Order', definition: 'A request.', avoid: [] }]);
  assert.equal(result.errors.length, 0);
  assert.match(result.raw, /## Language\n\n\*\*Order\*\*:/);
});

test('handles default context template', () => {
  const parsed = mod.parseContextMarkdown(mod.DEFAULT_CONTEXT_MARKDOWN);
  assert.equal(parsed.structuredEditable, true);
  assert.equal(parsed.entries.length, 0);
});

test('marks structured editing disabled for unparseable language fragments', () => {
  const parsed = mod.parseContextMarkdown('## Language\n\nThis is not a glossary entry.\n');
  assert.equal(parsed.structuredEditable, false);
  assert.match(parsed.errors.join('\n'), /Unparseable content/);
});

test('hash changes when raw content changes', () => {
  assert.notEqual(mod.contextHash('a'), mod.contextHash('b'));
});

test('safe path helper targets pidex/context with relative containment', () => {
  const result = mod.safeContextTarget('/tmp/example');
  assert.equal(result.target, path.resolve('/tmp/example/pidex/context/CONTEXT.md'));
  assert.equal(path.relative(result.contextRoot, result.target), 'CONTEXT.md');
});

test('extracts and approves open questions into approved notes', () => {
  const raw = `# Demo\n\n## Language\n\n## Open Questions / Needs User Review\n\n- Confirm Forge means deployment builder.\n- TODO\n`;
  const parsed = mod.parseContextMarkdown(raw);
  assert.deepEqual(parsed.openQuestions, [{ index: 0, text: 'Confirm Forge means deployment builder.' }]);
  const result = mod.approveOpenQuestion(raw, 0);
  assert.equal(result.errors.length, 0);
  assert.match(result.raw, /## Approved Context Notes/);
  assert.match(result.raw, /- Confirm Forge means deployment builder\./);
  const openSection = result.raw.split('## Approved Context Notes')[0];
  assert.doesNotMatch(openSection, /Confirm Forge means deployment builder\./);
});
