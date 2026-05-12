import test from 'node:test';
import assert from 'node:assert/strict';

import { readPageForKey, setPageForKey } from './project-query.ts';

test('readPageForKey reads scoped page value', () => {
  assert.equal(readPageForKey('?page_week=2&page_month=4', 'page_month'), 4);
  assert.equal(readPageForKey('?page_week=2', 'page_month'), 0);
});

test('setPageForKey updates one key and preserves others', () => {
  assert.equal(setPageForKey('?project=demo&page_week=1&page_month=5', 'page_month', 3), '?project=demo&page_week=1&page_month=3');
});
