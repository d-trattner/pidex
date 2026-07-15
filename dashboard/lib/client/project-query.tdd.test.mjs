import test from 'node:test';
import assert from 'node:assert/strict';

import { readIncludeTestProjectsFromSearch, setIncludeTestProjectsInSearch, withProjectParam, setProjectInSearch } from './project-query.ts';
import { parseProjectFilter } from '../server/filters.ts';

test('withProjectParam adds project and preserves existing params', () => {
  assert.equal(withProjectParam('/api/summary?foo=1', 'demo'), '/api/summary?foo=1&project=demo');
  assert.equal(withProjectParam('/api/summary?foo=1', '', true), '/api/summary?foo=1&include_test_projects=true');
});

test('test-project visibility is explicit and preserved in search', () => {
  assert.equal(readIncludeTestProjectsFromSearch('?include_test_projects=true'), true);
  assert.equal(readIncludeTestProjectsFromSearch('?include_test_projects=false'), false);
  assert.equal(setIncludeTestProjectsInSearch('?project=demo&page=2', true), '?project=demo&include_test_projects=true');
  assert.equal(setIncludeTestProjectsInSearch('?project=demo&include_test_projects=true', false), '?project=demo');
});

test('server project filter hides test projects only for aggregate scope', () => {
  assert.match(parseProjectFilter(new URLSearchParams()).sql, /is_test_project/);
  assert.doesNotMatch(parseProjectFilter(new URLSearchParams('include_test_projects=true')).sql, /is_test_project/);
  assert.match(parseProjectFilter(new URLSearchParams('include_test_projects=true')).sql, /p\.path NOT IN/);
  assert.doesNotMatch(parseProjectFilter(new URLSearchParams('project=fixture')).sql, /is_test_project/);
});

test('setProjectInSearch removes project and page for all-projects', () => {
  assert.equal(setProjectInSearch('?project=demo&page=2', ''), '');
});

test('setProjectInSearch resets scoped token pages on project change', () => {
  assert.equal(setProjectInSearch('?project=old&page_week=2&page_month=3', 'new'), '?project=new');
});
