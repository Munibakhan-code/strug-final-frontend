import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Raise.jsx called `elements.getElement(CardElement)` while importing only
// `useStripe, useElements` — a ReferenceError that fired exactly on the card-payment path, so
// card donations were dead and nothing rendered an error. It survived because the crash lives
// inside an async click handler on a page with no coverage.
//
// This guards the whole class: any Stripe element handed to getElement() must be a real binding
// in that file. It is a source contract, so it costs no render and cannot rot.

const SRC = path.resolve(import.meta.dirname, '..');
const STRIPE_PKG = '@stripe/react-stripe-js';

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      out.push(...walk(full));
    } else if (/\.jsx?$/.test(entry.name) && !/\.test\.jsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Names imported from @stripe/react-stripe-js in this source text. */
function stripeImports(source) {
  const names = new Set();
  const re = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["']${STRIPE_PKG}["']`, 'g');
  let m;
  while ((m = re.exec(source))) {
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  return names;
}

/** Element identifiers passed to `<something>.getElement(X)`. */
function getElementArgs(source) {
  const args = new Set();
  const re = /getElement\(\s*([A-Za-z_$][\w$]*)\s*\)/g;
  let m;
  while ((m = re.exec(source))) args.add(m[1]);
  return args;
}

const FILES = walk(SRC).filter((f) => fs.readFileSync(f, 'utf8').includes('getElement('));

describe('Stripe element bindings', () => {
  it('finds the files that call getElement()', () => {
    expect(FILES.length).toBeGreaterThan(0);
  });

  it.each(FILES.map((f) => [path.relative(SRC, f), f]))(
    '%s imports every element it passes to getElement()',
    (rel, full) => {
      const source = fs.readFileSync(full, 'utf8');
      const imported = stripeImports(source);
      const used = getElementArgs(source);

      // Locally-declared consts (e.g. `const card = elements.getElement(CardNumberElement)`
      // then reused) are not Stripe element types — only *Element identifiers are checked.
      const elementTypes = [...used].filter((n) => /Element$/.test(n));

      const missing = elementTypes.filter((n) => !imported.has(n));
      expect(missing, `${rel}: getElement(${missing.join(', ')}) with no import from ${STRIPE_PKG}`).toEqual([]);
    },
  );

  it('Raise.jsx asks for the split field it actually mounts', () => {
    const source = fs.readFileSync(path.join(SRC, 'pages', 'Raise.jsx'), 'utf8');
    // Raise renders <CardInput/> (CardNumberElement + Expiry + Cvc), not the combined
    // CardElement, so getElement must ask for CardNumberElement or Stripe returns null.
    expect(source).toMatch(/getElement\(\s*CardNumberElement\s*\)/);
    expect(stripeImports(source).has('CardNumberElement')).toBe(true);
  });
});
