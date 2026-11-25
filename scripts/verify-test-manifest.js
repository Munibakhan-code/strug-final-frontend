/**
 * Fail if a *.test.js file is missing from test/verticals.manifest.json
 * or listed in more than one vertical.
 *
 * Usage: node scripts/verify-test-manifest.js
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(process.cwd());
const THIS_FILE = fileURLToPath(import.meta.url);
const MANIFEST_PATH = join(ROOT, 'test', 'verticals.manifest.json');

function globToRegExp(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    // eslint-disable-next-line no-control-regex
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function matchesGlob(relPath, glob) {
  return globToRegExp(glob).test(relPath);
}

function walkTests(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'coverage' || ent.name === 'dist') continue;
      walkTests(full, out);
      continue;
    }
    if (ent.isFile() && /\.test\.(js|jsx|mjs|cjs)$/.test(ent.name)) {
      out.push(relative(ROOT, full).split(sep).join('/'));
    }
  }
  return out;
}

function collectFromGlobs(globs) {
  const files = new Set();
  const roots = new Set();
  for (const glob of globs) {
    const head = glob.split('/')[0];
    if (head && !head.includes('*')) roots.add(head);
  }
  if (!roots.size) roots.add('test');
  for (const root of roots) {
    for (const file of walkTests(join(ROOT, root))) files.add(file);
  }
  return [...files].sort();
}

/**
 * @param {{ testGlobs?: string[], verticals?: Record<string, { tests?: string[] }> }} manifest
 * @param {string[]} files
 */
export function verifyManifest(manifest, files) {
  const verticals = manifest.verticals || {};
  const assigned = new Map();
  const unknown = [];

  for (const [id, spec] of Object.entries(verticals)) {
    for (const glob of spec.tests || []) {
      const hits = files.filter((f) => matchesGlob(f, glob));
      if (!hits.length && !glob.includes('*')) {
        unknown.push(`${id}: listed missing file ${glob}`);
      }
      for (const file of hits) {
        if (assigned.has(file) && assigned.get(file) !== id) {
          unknown.push(`${file} is in both "${assigned.get(file)}" and "${id}"`);
        } else {
          assigned.set(file, id);
        }
      }
    }
  }

  const orphans = files.filter((f) => !assigned.has(f));
  return { orphans, conflicts: unknown, assigned };
}

function main() {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (err) {
    console.error(`verify-test-manifest FAILED: cannot read ${relative(ROOT, MANIFEST_PATH).split(sep).join('/')}: ${err.message}`);
    process.exit(1);
  }

  const globs = manifest.testGlobs?.length ? manifest.testGlobs : ['test/**/*.test.js'];
  const files = collectFromGlobs(globs);
  const { orphans, conflicts } = verifyManifest(manifest, files);

  if (orphans.length || conflicts.length) {
    console.error('verify-test-manifest FAILED:\n');
    for (const msg of conflicts) console.error(`  • ${msg}`);
    for (const file of orphans) {
      console.error(`  • unmapped test file: ${file}`);
    }
    console.error('\nAdd the file to exactly one vertical in test/verticals.manifest.json');
    console.error('(or re-run node scripts/_gen-vertical-manifest.mjs and keep the new core entries).');
    process.exit(1);
  }

  console.log(`test manifest: OK (${files.length} files mapped)`);
}

if (process.argv[1] && resolve(process.argv[1]) === THIS_FILE) {
  main();
}
