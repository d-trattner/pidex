import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));

export const DASHBOARD_ROOT = process.env.PIDEX_DASHBOARD_ROOT
  ? path.resolve(process.env.PIDEX_DASHBOARD_ROOT)
  : path.resolve(SERVER_DIR, '../..');

export const PIDEX_ROOT = process.env.PIDEX_ROOT
  ? path.resolve(process.env.PIDEX_ROOT)
  : path.resolve(DASHBOARD_ROOT, '..');
