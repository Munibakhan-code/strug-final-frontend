/**
 * Regenerates test/verticals.manifest.json so every *.test.js(x) is in exactly one vertical.
 *   node scripts/_gen-vertical-manifest.mjs
 */
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const rules = [
  ['food', [/\/food/i, /Food\.test/]],
  ['shop', [/\/shop/i, /wishlistAdd/]],
  ['rideshare', [/\/rideshare/i, /\/Rideshare/, /useRideSchedule/, /useDriverOnline/, /SmoothMarker/]],
  ['jobs', [/\/job/i, /employerJobs/, /seekerJobs/, /employerAts/, /companyJobs/]],
  ['videos', [/\/video/i, /\/Videos/, /listenMix/, /hlsPlayback/, /FriendActivity/]],
  ['medical', [/\/medical/i]],
  ['wedding', [/wedding/i]],
  ['tempstay', [/tempstay/i, /bookingIsolation/, /booking\.test/]],
  ['vehicles', [/vehicle/i]],
  ['equipment', [/equipment/i]],
  ['venues', [/venue/i]],
  ['raise', [/raise/i]],
  ['discounts', [/discount/i]],
  ['property', [/mortgage/, /propertyFinanc/, /geocode\.test/, /geo\.test/]],
];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'dist') continue;
      walk(full, out);
    } else if (/\.test\.(js|jsx)$/.test(ent.name)) {
      out.push(relative(ROOT, full).split(sep).join('/'));
    }
  }
  return out;
}

const files = walk(join(ROOT, 'src')).sort();
const buckets = Object.fromEntries(rules.map(([id]) => [id, []]));
buckets.core = [];
for (const f of files) {
  const hit = rules.find(([, pats]) => pats.some((re) => re.test(f)));
  buckets[hit ? hit[0] : 'core'].push(f);
}
const verticals = {};
for (const [id, tests] of Object.entries(buckets)) {
  if (tests.length) verticals[id] = { tests };
}

mkdirSync(join(ROOT, 'test'), { recursive: true });
writeFileSync(join(ROOT, 'test/verticals.manifest.json'), `${JSON.stringify({
  comment: 'Sprint 2 coverage map. Sprint 3 will add watch globs + select-tests.js. Every *.test.js(x) must appear in exactly one vertical.',
  testGlobs: ['src/**/*.test.js', 'src/**/*.test.jsx'],
  fullSuiteTriggers: [
    'package.json', 'package-lock.json', 'vite.config.js',
    'src/App.jsx', 'scripts/guard-*', '.github/**',
  ],
  verticals,
}, null, 2)}\n`);

console.log(Object.entries(verticals).map(([id, v]) => `${id}: ${v.tests.length}`).join('\n'));
console.log('total', files.length);
