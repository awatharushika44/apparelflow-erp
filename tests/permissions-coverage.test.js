import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, it, expect } from 'vitest';
import { PERMISSIONS } from '../lib/permissions.js';

const API_DIR = join(process.cwd(), 'app', 'api');
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

// Walk app/api and list every exported HTTP method as "METHOD /api/path".
function discoverEndpoints() {
  const found = [];

  for (const rel of readdirSync(API_DIR, { recursive: true })) {
    const parts = String(rel).split(sep);

    if (parts.at(-1) !== 'route.js') continue;

    const urlPath =
      '/api' +
      (parts.length > 1 ? '/' + parts.slice(0, -1).join('/') : '');

    const source = readFileSync(join(API_DIR, rel), 'utf8');

    for (const m of METHODS) {
      const exported = new RegExp(
        `export\\s+(const|async function|function)\\s+${m}\\b`,
      );

      if (exported.test(source)) {
        found.push({
          key: `${m} ${urlPath}`,
          source,
        });
      }
    }
  }

  return found;
}

// Escape special regex characters so route paths such as [id] are
// treated as literal text.
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('permissions map covers every route', () => {
  const endpoints = discoverEndpoints();
  const keys = endpoints.map((e) => e.key);

  it('finds the routes we expect', () => {
    expect(keys.length).toBeGreaterThan(0);
  });

  it('every endpoint is listed in PERMISSIONS', () => {
    const missing = keys.filter((k) => !(k in PERMISSIONS));
    expect(missing).toEqual([]);
  });

  it('PERMISSIONS lists no endpoint that does not exist', () => {
    const ghosts = Object.keys(PERMISSIONS).filter(
      (k) => !keys.includes(k),
    );

    expect(ghosts).toEqual([]);
  });

  it('every route passes its own key to withGuard', () => {
    const unguarded = endpoints
      .filter(
        (e) =>
          !new RegExp(
            `withGuard\\(\\s*['"]${escapeRegex(e.key)}['"]`,
          ).test(e.source),
      )
      .map((e) => e.key);

    expect(unguarded).toEqual([]);
  });
});