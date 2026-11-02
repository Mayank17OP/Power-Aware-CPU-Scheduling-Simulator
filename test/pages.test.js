import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

test('GitHub Pages entry uses repository-relative URLs and browser simulation', () => {
  const root = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  assert.match(root, /url=\.\/web\//);
  assert.doesNotMatch(root, /url=\/web\//);
  assert.match(page, /href="\.\/"/);
  assert.match(app, /hostname\.endsWith\('\.github\.io'\)/);
  assert.match(app, /showResults\(runComparison\(input\)\)/);
  assert.ok(existsSync(new URL('../.nojekyll', import.meta.url)));
});
