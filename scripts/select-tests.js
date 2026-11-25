/**
 * Sprint 3 — pick Vitest files from git diff + test/verticals.manifest.json.
 *
 * Usage:
 *   node scripts/select-tests.js --base <sha> --head <sha>
 *   node scripts/select-tests.js --files routes/food-routes.js
 *   node scripts/select-tests.js --run-vertical food
 *
 * Writes GitHub Actions outputs when $GITHUB_OUTPUT is set:
 *   run_full, verticals (JSON), vitest_args (space-separated paths)
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(process.cwd());
const THIS_FILE = fileURLToPath(import.meta.url);
const DEFAULT_MANIFEST = join(ROOT, 'test', 'verticals.manifest.json');

export function globToRegExp(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    // eslint-disable-next-line no-control-regex
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${escaped}$`);
}

export function matchesGlob(relPath, glob) {
  const posix = relPath.replace(/\\/g, '/');
  if (glob.endsWith('/**')) {
    const prefix = glob.slice(0, -3);
    return posix === prefix.slice(0, -1) || posix.startsWith(`${prefix}`);
  }
  return globToRegExp(glob).test(posix);
}

export function loadManifest(path = DEFAULT_MANIFEST) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function listedTests(manifest) {
  const out = [];
  for (const spec of Object.values(manifest.verticals || {})) {
    for (const t of spec.tests || []) out.push(t.replace(/\\/g, '/'));
  }
  return out;
}

export function isIntegrationTest(relPath) {
  const posix = String(relPath || '').replace(/\\/g, '/');
  return /(^|\/)(test\/)?integration\//.test(posix) || /(^|\/)e2e\//.test(posix);
}

export function enrichSelection(result) {
  const tests = (result.tests || []).map((t) => t.replace(/\\/g, '/'));
  const unitTests = tests.filter((t) => !isIntegrationTest(t));
  const integrationTests = tests.filter((t) => isIntegrationTest(t));
  return {
    ...result,
    tests,
    unitTests,
    integrationTests,
    needsIntegration: Boolean(result.runFull) || integrationTests.length > 0,
  };
}

/**
 * @param {string[]} changed
 * @param {object} manifest
 * @param {{ forceFull?: boolean }} [opts]
 */
export function selectFromChangedFiles(changed, manifest, opts = {}) {
  const files = changed.map((f) => f.replace(/\\/g, '/')).filter(Boolean);
  const triggers = manifest.fullSuiteTriggers || [];
  const verticals = manifest.verticals || {};
  const listed = new Set(listedTests(manifest));

  if (opts.forceFull) {
    return enrichSelection({
      runFull: true,
      reason: 'forced',
      verticals: Object.keys(verticals),
      tests: listedTests(manifest),
    });
  }

  for (const file of files) {
    if (triggers.some((g) => matchesGlob(file, g))) {
      return enrichSelection({
        runFull: true,
        reason: `full-suite trigger: ${file}`,
        verticals: Object.keys(verticals),
        tests: listedTests(manifest),
      });
    }
  }

  const selected = new Set();
  for (const [id, spec] of Object.entries(verticals)) {
    if (spec.always) selected.add(id);
  }

  const unmatched = [];
  for (const file of files) {
    const hits = [];
    for (const [id, spec] of Object.entries(verticals)) {
      const watch = spec.watch || [];
      const tests = spec.tests || [];
      if (watch.some((g) => matchesGlob(file, g)) || tests.includes(file)) hits.push(id);
    }
    const specific = hits.filter((id) => id !== 'platform' && id !== 'core');
    // Prefer a concrete vertical over platform's broad watch, but never let
    // always-on `core` alone suppress platform.
    const chosen = specific.length ? specific : hits;
    if (!chosen.length) unmatched.push(file);
    else for (const id of chosen) selected.add(id);
  }

  const ignored = (file) =>
    file.endsWith('.md')
    || file.startsWith('docs/')
    || file.startsWith('.cursor/')
    || file.includes('/README')
    || file.endsWith('.png')
    || file.endsWith('.jpg')
    || file.endsWith('.svg');

  const unmatchedSource = unmatched.filter((f) => !ignored(f) && !listed.has(f));
  if (unmatchedSource.length) {
    return enrichSelection({
      runFull: true,
      reason: `unmapped path: ${unmatchedSource[0]}`,
      verticals: Object.keys(verticals),
      tests: listedTests(manifest),
    });
  }

  const tests = [];
  const seen = new Set();
  for (const id of [...selected].sort()) {
    for (const t of verticals[id].tests || []) {
      if (!seen.has(t)) {
        seen.add(t);
        tests.push(t);
      }
    }
  }

  return enrichSelection({
    runFull: false,
    reason: `verticals: ${[...selected].sort().join(',')}`,
    verticals: [...selected].sort(),
    tests,
  });
}

export function gitChangedFiles(base, head) {
  if (!base || /^0+$/.test(base)) return null;
  try {
    const out = execFileSync('git', ['diff', '--name-only', `${base}...${head}`], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch {
    return null;
  }
}

function writeGithubOutput(result) {
  const enriched = enrichSelection(result);
  const dest = process.env.GITHUB_OUTPUT;
  if (!dest) {
    console.log(JSON.stringify(enriched, null, 2));
    return;
  }
  const lines = [
    `run_full=${enriched.runFull ? 'true' : 'false'}`,
    `needs_integration=${enriched.needsIntegration ? 'true' : 'false'}`,
    `verticals=${JSON.stringify(enriched.verticals)}`,
    `vitest_args=${enriched.runFull ? '' : enriched.tests.join(' ')}`,
    `unit_args=${enriched.runFull ? '' : enriched.unitTests.join(' ')}`,
    `integration_args=${enriched.runFull ? '' : enriched.integrationTests.join(' ')}`,
    `reason=${(enriched.reason || '').replace(/\r?\n/g, ' ')}`,
  ];
  appendFileSync(dest, `${lines.join('\n')}\n`);
  console.log(enriched.reason);
  console.log(
    `run_full=${enriched.runFull} needs_integration=${enriched.needsIntegration} `
    + `files=${enriched.tests.length} verticals=${enriched.verticals.join(',')}`,
  );
}

function runVitest(tests) {
  if (!tests.length) {
    console.error('select-tests: no test files to run');
    process.exit(1);
  }
  const r = spawnSync(process.execPath, [join(ROOT, 'node_modules/vitest/vitest.mjs'), 'run', ...tests], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(r.status ?? 1);
}

function parseArgs(argv) {
  const out = { base: '', head: 'HEAD', files: [], manifest: DEFAULT_MANIFEST, runVertical: '', forceFull: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') out.base = argv[++i];
    else if (a === '--head') out.head = argv[++i];
    else if (a === '--manifest') out.manifest = resolve(argv[++i]);
    else if (a === '--files') out.files = argv[++i].split(/[,\s]+/).filter(Boolean);
    else if (a === '--run-vertical') out.runVertical = argv[++i];
    else if (a === '--full') out.forceFull = true;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = loadManifest(args.manifest);

  if (args.runVertical) {
    const spec = manifest.verticals?.[args.runVertical];
    if (!spec) {
      console.error(`unknown vertical: ${args.runVertical}`);
      process.exit(1);
    }
    const always = Object.entries(manifest.verticals)
      .filter(([, s]) => s.always)
      .flatMap(([, s]) => s.tests || []);
    const tests = [...new Set([...(spec.tests || []), ...always])];
    runVitest(tests);
    return;
  }

  let changed = args.files;
  if (!changed.length) {
    const fromGit = gitChangedFiles(args.base, args.head);
    if (!fromGit) {
      writeGithubOutput(selectFromChangedFiles([], manifest, { forceFull: true }));
      return;
    }
    changed = fromGit;
  }

  const result = selectFromChangedFiles(changed, manifest, { forceFull: args.forceFull });
  writeGithubOutput(result);
}

if (process.argv[1] && resolve(process.argv[1]) === THIS_FILE) {
  main();
}
