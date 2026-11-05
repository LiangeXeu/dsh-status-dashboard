import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePage, buildSummary } from '../lib/status.js';

const html = readFileSync(new URL('./fixtures/status.html', import.meta.url), 'utf8');

test('parsePage 能拆出配置、影响区间与日历', () => {
  const raw = parsePage(html);
  assert.ok(raw.config.components.length >= 1);
  assert.ok(raw.detail.component_impacts.length > 0);
  assert.ok(raw.calendar.changes.length > 0);
});

test('buildSummary 输出 90 天色块与组件', () => {
  const summary = buildSummary(parsePage(html), Date.now());
  assert.equal(summary.barDays, 90);
  assert.ok(summary.items.length > 0);
  const components = [];
  for (const item of summary.items) {
    if (item.type === 'section') components.push(...item.section.components);
    else components.push(item.component);
  }
  assert.ok(components.length >= 3);
  for (const component of components) {
    assert.equal(component.bars.length, 90);
    assert.ok(component.bars.every((rank) => rank >= 0 && rank <= 4));
  }
  assert.ok(['operational', 'degraded', 'partial_outage', 'full_outage', 'maintenance'].includes(summary.overall));
  assert.ok(summary.incidents.length >= 0);
});
