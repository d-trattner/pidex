import test from 'node:test';
import assert from 'node:assert/strict';
import { formatConfiguredRouteStartDetails, formatDelegateStartDetails, formatPiRunnerStartDetails } from './index.ts';

test('Pi-routed agent progress shows provider model and thinking effort directly', () => {
  assert.equal(
    formatPiRunnerStartDetails('openai-codex/gpt-5.6-terra', 'high'),
    'openai-codex gpt-5.6-terra high',
  );
});

test('agent progress has concise defaults when routing details are absent', () => {
  assert.equal(formatPiRunnerStartDetails(undefined, undefined), 'auto auto default');
  assert.equal(formatPiRunnerStartDetails('gpt-5.6-terra', 'xhigh'), 'auto gpt-5.6-terra xhigh');
  assert.equal(formatDelegateStartDetails('codex', undefined, undefined), 'codex default default');
});

test('delegate agent progress includes provider model and thinking effort directly', () => {
  assert.equal(
    formatDelegateStartDetails('codex', 'gpt-5.6-terra', 'high'),
    'codex gpt-5.6-terra high',
  );
});

test('configured route progress identifies its authoritative route source', () => {
  assert.equal(
    formatConfiguredRouteStartDetails('configured-secondary:pidex-critic:deepseek:deepseek-v4-flash', 'pi', 'deepseek/deepseek-v4-flash', 'low'),
    'configured-secondary:pidex-critic:deepseek:deepseek-v4-flash → pi / deepseek/deepseek-v4-flash / low',
  );
});
