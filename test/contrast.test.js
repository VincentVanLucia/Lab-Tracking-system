// R9 / WCAG 2.2 SC 1.4.3 (text ≥ 4.5:1) and SC 1.4.11 (UI boundaries ≥ 3:1) for every colour
// token pair the stylesheet uses, in both the light and dark themes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../public/css/app.css', import.meta.url), 'utf8');

function tokens(block) {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]));
}
const light = tokens(/(?:^|\n):root\s*\{([^}]*)\}/.exec(css)[1]);
const dark = { ...light, ...tokens(/prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css)[1]) };

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_PAIRS = [
  ['text', 'bg'], ['text', 'surface'], ['text', 'surface-2'],
  ['text-muted', 'bg'], ['text-muted', 'surface'], ['text-muted', 'surface-2'],
  ['link', 'surface'], ['link', 'bg'], ['link', 'surface-2'],
  ['on-primary', 'primary'], ['on-primary', 'primary-hover'], ['on-danger', 'danger'], ['on-danger', 'danger-hover'],
  ['ok-text', 'ok-bg'], ['warn-text', 'warn-bg'], ['crit-text', 'crit-bg'], ['info-text', 'info-bg'], ['neutral-text', 'neutral-bg'],
  ['ok-text', 'surface'], ['warn-text', 'surface'], ['crit-text', 'surface'],
];
const UI_PAIRS = [
  ['border-strong', 'surface'], ['focus', 'surface'], ['focus', 'bg'],
  ['ok-border', 'surface'], ['warn-border', 'surface'], ['crit-border', 'surface'], ['primary', 'surface'],
];

for (const [name, theme] of [['light', light], ['dark', dark]]) {
  test(`${name} theme: text contrast ≥ 4.5:1 (SC 1.4.3)`, () => {
    for (const [fg, bg] of TEXT_PAIRS) {
      const ratio = contrast(theme[fg], theme[bg]);
      assert.ok(ratio >= 4.5, `${fg} on ${bg}: ${ratio.toFixed(2)}:1`);
    }
  });
  test(`${name} theme: control boundaries and status borders ≥ 3:1 (SC 1.4.11)`, () => {
    for (const [fg, bg] of UI_PAIRS) {
      const ratio = contrast(theme[fg], theme[bg]);
      assert.ok(ratio >= 3, `${fg} on ${bg}: ${ratio.toFixed(2)}:1`);
    }
  });
}
