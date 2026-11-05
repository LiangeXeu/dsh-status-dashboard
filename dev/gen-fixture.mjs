import { getSummary } from '../lib/status.js';
import { getHeat } from '../lib/heat.js';
import { writeFileSync } from 'node:fs';
const live = await getSummary(true);
writeFileSync(new URL('./fixture-live.js', import.meta.url), 'window.__FIXTURE = ' + JSON.stringify(live) + ';\n');
const heat = await getHeat({ hard: true });
writeFileSync(new URL('./fixture-heat.js', import.meta.url), 'window.__HEAT = ' + JSON.stringify(heat) + ';\n');
console.log('fixtures', live.items.length, heat.counts.items, heat.topics.length);
