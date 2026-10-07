import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const appDir = path.resolve(process.cwd(), 'app');
const tokensCss = readFileSync(path.join(appDir, 'tokens.css'), 'utf8');

// WCAG relative luminance and contrast ratio.
function channel(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Collect every --pair-NAME-fg/bg and --ring-NAME-fg/bg.
function readPairs() {
  const found = {};
  for (const m of tokensCss.matchAll(
    /--(pair|ring)-([a-z-]+)-(fg|bg):\s*(#[0-9a-fA-F]{6})\s*;/g,
  )) {
    const key = `${m[1]}-${m[2]}`;
    found[key] ??= { kind: m[1] };
    found[key][m[3]] = m[4];
  }
  return Object.entries(found).map(([name, v]) => ({ name, ...v }));
}

const pairs = readPairs();

// All stylesheets under app/
const cssFiles = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.name.endsWith('.css')) cssFiles.push(full);
  }
})(appDir);

const otherCss = cssFiles.filter((f) => !f.endsWith('tokens.css'));
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

describe('colour tokens', () => {
  it('has the required pairs for every input state, component and traffic light', () => {
    const names = pairs.map((p) => p.name);
    for (const need of [
      'pair-input', 'pair-placeholder', 'pair-select', 'pair-option', 'pair-disabled', 'pair-autofill',
      'pair-primary', 'pair-secondary', 'pair-danger', 'pair-accent', 'pair-button-disabled',
      'pair-error', 'pair-alert', 'pair-warn', 'pair-note',
      'pair-green', 'pair-yellow', 'pair-red', 'pair-uncounted',
      'pair-step',
      'pair-ink', 'pair-inkmuted', 'pair-inkgrad', 'pair-inkgradmuted',
      'ring-page', 'ring-card', 'ring-ink',
    ]) {
      expect(names, need).toContain(need);
    }
  });

  it('every pair has both a foreground and a background', () => {
    for (const p of pairs) {
      expect(p.fg, `${p.name} foreground`).toBeTruthy();
      expect(p.bg, `${p.name} background`).toBeTruthy();
    }
  });

  for (const p of pairs.filter((x) => x.fg && x.bg)) {
    const min = p.kind === 'ring' ? 3 : 4.5;
    it(`${p.name}: ${p.fg} on ${p.bg} is at least ${min}:1`, () => {
      expect(contrast(p.fg, p.bg)).toBeGreaterThanOrEqual(min);
    });
  }
});

describe('no colour escapes the tokens', () => {
  it('only tokens.css contains raw colour values', () => {
    for (const f of otherCss) {
      const css = readFileSync(f, 'utf8');
      expect(css, `${path.basename(f)} has a raw hex colour`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(css, `${path.basename(f)} has rgb()/hsl()`).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/);
    }
  });

  it('no dark mode anywhere, and color-scheme is light', () => {
    expect(tokensCss).toMatch(/color-scheme:\s*light/);
    for (const f of cssFiles) {
      expect(readFileSync(f, 'utf8'), path.basename(f)).not.toMatch(/prefers-color-scheme:\s*dark/);
    }
  });

  it('every token a stylesheet uses is defined in tokens.css', () => {
    for (const f of otherCss) {
      const css = stripComments(readFileSync(f, 'utf8'));
      for (const m of css.matchAll(/var\(--((?:pair|ring|deco|grad|shadow|glow)-[a-z-]+)\)/g)) {
        expect(tokensCss, `${path.basename(f)} uses undefined --${m[1]}`).toMatch(
          new RegExp(`--${m[1]}\\s*:`),
        );
      }
    }
  });

  it('decorative tokens are never used as a text colour', () => {
    for (const f of otherCss) {
      const css = stripComments(readFileSync(f, 'utf8'));
      expect(css, path.basename(f)).not.toMatch(/(^|[\s;{])color:\s*var\(--deco-/);
    }
  });
});

describe('decorative layers stay out of the way of text', () => {
  it('paper grain and wash are almost invisible (alpha 0.08 or less)', () => {
    for (const name of ['grad-grain', 'grad-paper']) {
      const value = tokensCss.match(new RegExp(`--${name}:([^;]+);`))?.[1];
      expect(value, name).toBeTruthy();
      for (const m of value.matchAll(/rgba\([^)]*,\s*([0-9.]+)\)/g)) {
        expect(Number(m[1]), name).toBeLessThanOrEqual(0.08);
      }
    }
  });

  it('the weave pattern is only used by .gate-stage (the drawing area, no text)', () => {
    for (const f of cssFiles) {
      for (const rule of stripComments(readFileSync(f, 'utf8')).split('}')) {
        if (rule.includes('var(--grad-weave)')) {
          expect(rule.trim(), path.basename(f)).toMatch(/^\.gate-stage/);
        }
      }
    }
  });
});