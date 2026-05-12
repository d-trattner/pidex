import test from 'node:test';
import assert from 'node:assert/strict';

import { withProjectParam, setProjectInSearch } from './project-query.ts';

test('withProjectParam adds project and preserves existing params', () => {
  assert.equal(withProjectParam('/api/summary?foo=1', 'demo'), '/api/summary?foo=1&project=demo');
});

test('setProjectInSearch removes project and page for all-projects', () => {
  assert.equal(setProjectInSearch('?project=demo&page=2', ''), '');
});

test('setProjectInSearch resets scoped token pages on project change', () => {
  assert.equal(setProjectInSearch('?project=old&page_week=2&page_month=3', 'new'), '?project=new');
});
